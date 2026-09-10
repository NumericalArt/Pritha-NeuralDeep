import { spawn } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_RESULT_SCHEMA = "pritha-trial-execution-result-v2";
const SANDBOX_TYPES = new Set(["none", "readOnly", "workspaceWrite", "externalSandbox"]);
const SHELL_EXECUTABLES = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);
const SHELL_OPERATOR_TOKENS = new Set(["&&", "||", ";", "|", ">", ">>", "<", "<<", "`"]);
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_OUTPUT_BYTES_CAP = 1_048_576;

export class ExecutionBackendError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ExecutionBackendError";
    this.code = code;
    this.details = details;
  }
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

function validateArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > 128) {
    throw new ExecutionBackendError("invalid_argv", "Execution requires a non-empty argv array");
  }
  if (argv.some((value) => typeof value !== "string" || !value || value.includes("\0") || value.length > 4096)) {
    throw new ExecutionBackendError("invalid_argv", "Every argv token must be a bounded non-empty string");
  }
  const executable = path.basename(argv[0]).toLowerCase();
  if (SHELL_EXECUTABLES.has(executable) || argv.some((value) => SHELL_OPERATOR_TOKENS.has(value.trim()))) {
    throw new ExecutionBackendError("shell_forbidden", "Shell executables and shell operator tokens are not accepted");
  }
  return [...argv];
}

function validatedCwd(value) {
  const requested = path.resolve(String(value || "."));
  if (!existsSync(requested)) throw new ExecutionBackendError("cwd_missing", "Execution cwd does not exist");
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new ExecutionBackendError("cwd_invalid", "Execution cwd must be a regular directory, not a symlink");
  }
  return realpathSync(requested);
}

function normalizeSandbox(value = {}) {
  const type = String(value.type || "none");
  if (!SANDBOX_TYPES.has(type)) throw new ExecutionBackendError("sandbox_policy_invalid", `Unsupported sandbox type: ${type}`);
  const writableRoots = Array.isArray(value.writableRoots)
    ? value.writableRoots.map((entry) => path.resolve(String(entry)))
    : [];
  return {
    required: Boolean(value.required),
    type,
    writableRoots,
    networkAccess: Boolean(value.networkAccess),
  };
}

export function normalizeRequest(request = {}) {
  return {
    argv: validateArgv(request.argv),
    cwd: validatedCwd(request.cwd),
    timeoutMs: positiveInteger(request.timeoutMs, DEFAULT_TIMEOUT_MS, 900_000),
    outputBytesCap: positiveInteger(request.outputBytesCap, DEFAULT_OUTPUT_BYTES_CAP, 16 * 1024 * 1024),
    sandbox: normalizeSandbox(request.sandbox),
    env: request.env && typeof request.env === "object" && !Array.isArray(request.env) ? request.env : {},
  };
}

function safeExecutionEnv(overrides = {}) {
  const allowed = [
    "PATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SYSTEMROOT",
    "COMSPEC",
    "PATHEXT",
    "CI",
    "NO_COLOR",
  ];
  const env = {};
  for (const key of allowed) if (typeof process.env[key] === "string") env[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new ExecutionBackendError("env_invalid", "Environment variable name is invalid");
    if (value === null || value === undefined) delete env[key];
    else if (typeof value === "string" && value.length <= 32_768) env[key] = value;
    else throw new ExecutionBackendError("env_invalid", "Environment overrides must be bounded strings or null");
  }
  return env;
}

function boundedCapture(limit) {
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  return {
    add(value) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = Math.max(0, limit - bytes);
      if (remaining > 0) {
        const accepted = chunk.subarray(0, remaining);
        chunks.push(accepted);
        bytes += accepted.length;
      }
      if (chunk.length > remaining) truncated = true;
    },
    result() {
      return { text: Buffer.concat(chunks).toString("utf8"), bytes, truncated };
    },
  };
}

export class LocalExecBackend {
  constructor(options = {}) {
    this.name = "local-exec";
    this.killGraceMs = positiveInteger(options.killGraceMs, 500, 5_000);
  }

  probe() {
    return {
      backend: this.name,
      available: true,
      isolation: "none",
      runtimeVersion: `${process.release.name}/${process.version}`,
      capabilities: { structuredArgv: true, commandExec: true, sandbox: false },
    };
  }

  async execute(value) {
    const request = normalizeRequest(value);
    if (request.sandbox.required || request.sandbox.type !== "none") {
      throw new ExecutionBackendError(
        "isolation_unavailable",
        "The local backend cannot prove sandbox isolation; select the Codex CLI sandbox backend",
        { requestedPolicy: request.sandbox },
      );
    }

    const stdoutCapture = boundedCapture(request.outputBytesCap);
    const stderrCapture = boundedCapture(request.outputBytesCap);
    const startedAt = Date.now();
    let timedOut = false;

    return new Promise((resolve) => {
      let settled = false;
      let forceKillTimer = null;
      const child = spawn(request.argv[0], request.argv.slice(1), {
        cwd: request.cwd,
        env: safeExecutionEnv(request.env),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
      });
      // Only the process group created by this invocation may be signalled.
      // Bounded commands may not leave a background descendant behind.
      const signalOwned = signal => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch (error) { if (error.code !== "ESRCH") child.kill(signal); }
      };
      child.once("exit", () => signalOwned("SIGKILL"));
      child.stdout?.on("data", (chunk) => stdoutCapture.add(chunk));
      child.stderr?.on("data", (chunk) => stderrCapture.add(chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        signalOwned("SIGTERM");
        forceKillTimer = setTimeout(() => signalOwned("SIGKILL"), this.killGraceMs);
        forceKillTimer.unref?.();
      }, request.timeoutMs);

      const finish = (exitCode, spawnError = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (spawnError) stderrCapture.add(`${spawnError.message}\n`);
        const stdout = stdoutCapture.result();
        const stderr = stderrCapture.result();
        resolve({
          schema: BACKEND_RESULT_SCHEMA,
          backend: this.name,
          isolation: "none",
          effectivePolicy: { type: "none", writableRoots: [], networkAccess: "host" },
          exitCode: Number.isInteger(exitCode) ? exitCode : timedOut ? 124 : 127,
          stdout: stdout.text,
          stderr: stderr.text,
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
          durationMs: Date.now() - startedAt,
          timedOut,
          runtimeVersion: `${process.release.name}/${process.version}`,
        });
      };

      child.once("error", (error) => finish(127, error));
      child.once("close", (code) => finish(code));
    });
  }
}

export class CodexCliSandboxBackend {
  constructor(options = {}) {
    this.name = "codex-cli-sandbox";
    this.codexBin = options.codexBin || process.env.PRITHA_CODEX_BIN || "codex";
    this.projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    this.codexHome = path.resolve(
      options.codexHome
      || process.env.PRITHA_NEURALDEEP_CODEX_HOME
      || path.join(path.dirname(this.projectRoot), `${path.basename(this.projectRoot)}-state`, "main", "codex-home"),
    );
    this.killGraceMs = positiveInteger(options.killGraceMs, 500, 5_000);
  }

  environment(overrides = {}) {
    const environment = {
      ...safeExecutionEnv(overrides),
      CODEX_HOME: this.codexHome,
      TECHSCOPE_ROOT: this.projectRoot,
      PRITHA_STATE_ROOT: process.env.PRITHA_STATE_ROOT || path.dirname(this.codexHome),
    };
    for (const key of Object.keys(environment)) {
      if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
    }
    return environment;
  }

  async probe(options = {}) {
    const cwd = validatedCwd(options.cwd || process.cwd());
    const result = await this.execute({
      argv: [process.execPath, "-e", "process.stdout.write('SANDBOX_OK')"],
      cwd,
      timeoutMs: positiveInteger(options.timeoutMs, 10_000, 30_000),
      outputBytesCap: 16_384,
      sandbox: { required: true, type: "workspaceWrite", writableRoots: [cwd], networkAccess: false },
    }).catch((error) => ({ exitCode: 127, stderr: error instanceof Error ? error.message : String(error) }));
    const available = result.exitCode === 0 && result.stdout === "SANDBOX_OK";
    return {
      backend: this.name,
      available,
      isolation: available ? "sandboxed" : "unavailable",
      runtimeVersion: available ? "codex-cli/sandbox" : "unknown",
      capabilities: { structuredArgv: true, commandExec: available, sandbox: available },
      error: available ? null : result.stderr || "Codex CLI sandbox probe failed.",
    };
  }

  async execute(value) {
    const request = normalizeRequest(value);
    if (request.sandbox.networkAccess) {
      throw new ExecutionBackendError("sandbox_policy_invalid", "Agent Mother Trials do not permit network access in the Codex CLI sandbox");
    }
    const workspace = validatedCwd(request.sandbox.writableRoots[0] || request.cwd);
    const args = [
      "sandbox",
      "--permissions-profile", ":workspace",
      "-C", workspace,
      "--",
      "/usr/bin/env", "-C", request.cwd,
      ...request.argv,
    ];
    const stdoutCapture = boundedCapture(request.outputBytesCap);
    const stderrCapture = boundedCapture(request.outputBytesCap);
    const startedAt = Date.now();
    let timedOut = false;
    return new Promise((resolve) => {
      let settled = false;
      let forceKillTimer = null;
      const child = spawn(this.codexBin, args, {
        cwd: workspace,
        env: this.environment(request.env),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (chunk) => stdoutCapture.add(chunk));
      child.stderr?.on("data", (chunk) => stderrCapture.add(chunk));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), this.killGraceMs);
        forceKillTimer.unref?.();
      }, request.timeoutMs);
      const finish = (exitCode, spawnError = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (spawnError) stderrCapture.add(`${spawnError.message}\n`);
        const stdout = stdoutCapture.result();
        const stderr = stderrCapture.result();
        resolve({
          schema: BACKEND_RESULT_SCHEMA,
          backend: this.name,
          isolation: "sandboxed",
          effectivePolicy: { type: "workspaceWrite", writableRoots: [workspace], networkAccess: "disabled" },
          exitCode: Number.isInteger(exitCode) ? exitCode : timedOut ? 124 : 127,
          stdout: stdout.text,
          stderr: stderr.text,
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
          durationMs: Date.now() - startedAt,
          timedOut,
          runtimeVersion: "codex-cli/sandbox",
        });
      };
      child.once("error", (error) => finish(127, error));
      child.once("close", (code) => finish(code));
    });
  }
}

export function createExecutionBackend(name = "local", options = {}) {
  if (name === "local" || name === "local-exec") return new LocalExecBackend(options);
  if (["codex-cli", "codex-cli-sandbox", "app-server", "codex-app-server-command"].includes(name)) {
    return new CodexCliSandboxBackend(options);
  }
  throw new ExecutionBackendError("backend_unknown", `Unknown Trial execution backend: ${name}`);
}

export function executionBackendResultSchema() {
  return BACKEND_RESULT_SCHEMA;
}
