#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { loadEnvFile, loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { readBuildIdentity } from "./lib/release-artifact.mjs";
import { isPrithaCodeCheckout, prithaInstanceConfig, resolveTechscopeRoot } from "./lib/paths.mjs";

const SERVICE_PREFIX = "com.numericalart.pritha.control-center";
const HEALTH_SCHEMA = "pritha-control-center-health-v2";
const STATE_SCHEMA = "pritha-control-center-runtime-state-v1";
const CIRCUIT_WINDOW_MS = 5 * 60_000;
const CIRCUIT_EXIT_LIMIT = 5;
const STOP_GRACE_MS = 15_000;
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const LOG_BACKUPS = 3;

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      out._.push(value);
      continue;
    }
    const equal = value.indexOf("=");
    if (equal > 2) {
      out[value.slice(2, equal)] = value.slice(equal + 1);
      continue;
    }
    const key = value.slice(2);
    if (argv[index + 1] && !argv[index + 1].startsWith("--")) out[key] = argv[++index];
    else out[key] = true;
  }
  return out;
}

const options = parseArgs(process.argv.slice(2));
if (options.root) process.env.TECHSCOPE_ROOT = path.resolve(String(options.root));
if (options["state-root"]) process.env.PRITHA_STATE_ROOT = path.resolve(String(options["state-root"]));
if (options["instance-id"]) process.env.PRITHA_INSTANCE_ID = String(options["instance-id"]);
if (options.role) process.env.PRITHA_INSTANCE_ROLE = String(options.role);
if (options.port) process.env.PRITHA_CONTROL_CENTER_PORT = String(options.port);

const preliminaryRoot = resolveTechscopeRoot();
loadEnvFile(String(options.env || process.env.PRITHA_CONTROL_CENTER_ENV_FILE || ""));
loadPrithaRuntimeEnv({ root: preliminaryRoot });

const config = prithaInstanceConfig({
  root: process.env.TECHSCOPE_ROOT,
  stateRoot: process.env.PRITHA_STATE_ROOT,
  instanceId: process.env.PRITHA_INSTANCE_ID,
  instanceRole: process.env.PRITHA_INSTANCE_ROLE,
  controlCenterPort: process.env.PRITHA_CONTROL_CENTER_PORT,
});

if (!/^[a-z0-9][a-z0-9._-]*$/i.test(config.instanceId)) {
  throw new Error("PRITHA_INSTANCE_ID must be a safe non-empty identifier");
}
if (!Number.isSafeInteger(config.controlCenterPort) || config.controlCenterPort < 1024 || config.controlCenterPort > 65535) {
  throw new Error("PRITHA_CONTROL_CENTER_PORT must be an integer between 1024 and 65535");
}

const label = `${SERVICE_PREFIX}.${config.instanceId}`;
const uid = typeof process.getuid === "function" ? process.getuid() : null;
const launchDomain = uid == null ? "" : `gui/${uid}`;
const serviceTarget = launchDomain ? `${launchDomain}/${label}` : label;
const appRoot = path.join(config.codeRoot, "interfaces", "control-center");
const runtimeEnvPath = path.resolve(String(options.env || process.env.PRITHA_CONTROL_CENTER_ENV_FILE || path.join(config.stateRoot, "config", "runtime.env")));
const runtimeRoot = config.stateRoot === config.codeRoot
  ? path.join(config.codeRoot, ".private", "control-center-runtime")
  : path.join(config.stateRoot, "setup", "control-center-runtime");
const logRoot = config.stateRoot === config.codeRoot
  ? path.join(config.codeRoot, ".logs")
  : path.join(config.stateRoot, "logs");
const statePath = path.join(runtimeRoot, "state.json");
const lockPath = path.join(runtimeRoot, "runtime.lock.json");
const circuitPath = path.join(runtimeRoot, "circuit.json");
const generatedPlistPath = path.join(runtimeRoot, `${label}.plist`);
const installedPlistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
const templatePath = path.join(config.codeRoot, "launchd", "com.numericalart.pritha.control-center.instance.plist.template");
const lifecycleLogPath = path.join(logRoot, "control-center.lifecycle.jsonl");
const stdoutPath = path.join(logRoot, "control-center.stdout.log");
const stderrPath = path.join(logRoot, "control-center.stderr.log");
const wrapperStdoutPath = path.join(logRoot, "control-center.wrapper.stdout.log");
const wrapperStderrPath = path.join(logRoot, "control-center.wrapper.stderr.log");
const launchctlBinary = String(process.env.PRITHA_LAUNCHCTL_BINARY || "launchctl");
const lsofBinary = String(process.env.PRITHA_LSOF_BINARY || "lsof");

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch { /* best effort on non-POSIX test filesystems */ }
}

function assertInsideState(filePath) {
  const state = path.resolve(config.stateRoot);
  const target = path.resolve(filePath);
  if (target !== state && !target.startsWith(`${state}${path.sep}`)) {
    throw new Error("Refusing private runtime write outside PRITHA_STATE_ROOT");
  }
}

function assertResolvedInsideState(filePath) {
  const realState = realpathSync(path.resolve(config.stateRoot));
  const realParent = realpathSync(path.dirname(path.resolve(filePath)));
  if (realParent !== realState && !realParent.startsWith(`${realState}${path.sep}`)) {
    throw new Error("Refusing private runtime write through a symlink outside PRITHA_STATE_ROOT");
  }
}

function atomicWriteJson(filePath, value) {
  assertInsideState(filePath);
  ensurePrivateDirectory(path.dirname(filePath));
  assertResolvedInsideState(filePath);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(temporary, 0o600);
  renameSync(temporary, filePath);
  chmodSync(filePath, 0o600);
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(readFileSync(filePath, "utf8")); } catch { return null; }
}

function appendLifecycle(event, detail = {}) {
  assertInsideState(lifecycleLogPath);
  ensurePrivateDirectory(path.dirname(lifecycleLogPath));
  assertResolvedInsideState(lifecycleLogPath);
  try { rotateLog(lifecycleLogPath); } catch { /* logging must remain best effort during concurrent shutdown */ }
  appendFileSync(lifecycleLogPath, `${JSON.stringify({
    schema: "pritha-control-center-lifecycle-event-v1",
    timestamp: new Date().toISOString(),
    instance: config.instanceId,
    event,
    ...detail,
  })}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(lifecycleLogPath, 0o600);
}

function run(command, args, runOptions = {}) {
  const result = runSyncProbe(command, args, {
    cwd: runOptions.cwd || config.codeRoot,
    env: { ...process.env, ...(runOptions.env || {}) },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: runOptions.timeoutMs || 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function runtimeExecutablePath() {
  const configured = String(process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry && path.isAbsolute(entry));
  return [...new Set([
    path.dirname(process.execPath),
    path.join(os.homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...configured,
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ])].join(path.delimiter);
}

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function processInfo(pid) {
  if (!processExists(pid)) return null;
  const ps = run("ps", ["-o", "pid=,ppid=,pgid=,command=", "-p", String(pid)]);
  if (!ps.ok || !ps.stdout) return null;
  const match = ps.stdout.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\s\S]+)$/);
  if (!match) return null;
  const cwdResult = run(lsofBinary, ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  const cwdLine = cwdResult.stdout.split(/\r?\n/).find((line) => line.startsWith("n"));
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    command: match[4],
    cwd: cwdLine ? cwdLine.slice(1) : null,
  };
}

function listenerPids() {
  const result = run(lsofBinary, ["-nP", `-iTCP:${config.controlCenterPort}`, "-sTCP:LISTEN", "-t"]);
  if (!result.ok && result.status !== 1) return { pids: [], error: "listener_check_failed" };
  return {
    pids: [...new Set(result.stdout.split(/\s+/).map(Number).filter((pid) => Number.isSafeInteger(pid) && pid > 1))],
    error: null,
  };
}

function identityMatches(record) {
  return Boolean(record)
    && record.schema === STATE_SCHEMA
    && record.instanceId === config.instanceId
    && path.resolve(record.codeRoot || ".") === path.resolve(config.codeRoot)
    && path.resolve(record.stateRoot || ".") === path.resolve(config.stateRoot)
    && record.port === config.controlCenterPort
    && record.label === label;
}

function listenerOwnership(record, listener = listenerPids()) {
  if (listener.error) return { ownerMatch: false, listenerPids: [], details: [], error: listener.error };
  if (listener.pids.length === 0) return { ownerMatch: true, listenerPids: [], details: [], error: null };
  if (!identityMatches(record) || !Number.isSafeInteger(record.processGroupId)) {
    return { ownerMatch: false, listenerPids: listener.pids, details: [], error: "runtime_identity_missing" };
  }
  const details = listener.pids.map(processInfo).filter(Boolean);
  const ownerMatch = details.length === listener.pids.length && details.every((item) => {
    const expectedCwd = path.resolve(appRoot);
    return item.pgid === record.processGroupId
      && Boolean(item.cwd)
      && (path.resolve(item.cwd) === expectedCwd || path.resolve(item.cwd).startsWith(`${expectedCwd}${path.sep}`));
  });
  return { ownerMatch, listenerPids: listener.pids, details, error: ownerMatch ? null : "owner_mismatch" };
}

function launchdStatus() {
  if (!launchDomain) return { installed: existsSync(installedPlistPath), loaded: false, running: false, pid: null, error: "launchd_unavailable" };
  const result = run(launchctlBinary, ["print", serviceTarget]);
  const pidMatch = result.stdout.match(/^\s*pid\s*=\s*(\d+)\s*$/m);
  const stateMatch = result.stdout.match(/^\s*state\s*=\s*([^\n]+)$/m);
  return {
    installed: existsSync(installedPlistPath),
    loaded: result.ok,
    running: result.ok && (Boolean(pidMatch) || stateMatch?.[1]?.trim() === "running"),
    pid: pidMatch ? Number(pidMatch[1]) : null,
    error: result.ok || !result.stderr ? null : result.stderr.slice(0, 240),
  };
}

async function healthStatus() {
  try {
    const response = await fetch(`http://127.0.0.1:${config.controlCenterPort}/api/health`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2_000),
      cache: "no-store",
    });
    const text = (await response.text()).slice(0, 64 * 1024);
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* reported as invalid below */ }
    const instanceMatch = payload?.schema === HEALTH_SCHEMA
      && payload?.instance?.id === config.instanceId
      && payload?.instance?.port === config.controlCenterPort;
    return {
      ok: response.ok && payload?.ok === true && instanceMatch,
      httpStatus: response.status,
      instanceMatch,
      status: payload?.status || null,
      release: payload?.release || null,
      error: payload ? null : "invalid_health_response",
    };
  } catch {
    return { ok: false, httpStatus: 0, instanceMatch: false, status: null, release: null, error: "health_unreachable" };
  }
}

function readCircuit() {
  const value = readJson(circuitPath);
  return {
    open: value?.open === true,
    openedAt: value?.openedAt || null,
    exits: Array.isArray(value?.exits) ? value.exits.filter(Number.isFinite) : [],
  };
}

function clearCircuit() {
  atomicWriteJson(circuitPath, { schema: "pritha-control-center-circuit-v1", open: false, openedAt: null, exits: [] });
}

function recordUnexpectedExit() {
  const now = Date.now();
  const current = readCircuit();
  const exits = [...current.exits.filter((stamp) => now - stamp <= CIRCUIT_WINDOW_MS), now];
  const open = exits.length >= CIRCUIT_EXIT_LIMIT;
  const next = {
    schema: "pritha-control-center-circuit-v1",
    open,
    openedAt: open ? new Date(now).toISOString() : null,
    exits,
  };
  atomicWriteJson(circuitPath, next);
  return next;
}

function rotateLog(filePath) {
  assertInsideState(filePath);
  ensurePrivateDirectory(path.dirname(filePath));
  assertResolvedInsideState(filePath);
  if (!existsSync(filePath)) return;
  chmodSync(filePath, 0o600);
  if (statSync(filePath).size < MAX_LOG_BYTES) return;
  rmSync(`${filePath}.${LOG_BACKUPS}`, { force: true });
  for (let index = LOG_BACKUPS - 1; index >= 1; index -= 1) {
    if (existsSync(`${filePath}.${index}`)) renameSync(`${filePath}.${index}`, `${filePath}.${index + 1}`);
  }
  renameSync(filePath, `${filePath}.1`);
}

function prepareLaunchdLog(filePath) {
  rotateLog(filePath);
  const descriptor = openSync(filePath, "a", 0o600);
  closeSync(descriptor);
  chmodSync(filePath, 0o600);
}

function prepareLaunchdLogs() {
  prepareLaunchdLog(wrapperStdoutPath);
  prepareLaunchdLog(wrapperStderrPath);
}

function releaseIdentity() {
  const compiled = readBuildIdentity(path.join(appRoot, ".next"));
  if (compiled) return { commit: compiled.commit, buildId: compiled.buildId };
  const buildIdPath = path.join(appRoot, ".next", "BUILD_ID");
  const git = run("git", ["rev-parse", "--short=12", "HEAD"], { cwd: config.codeRoot });
  return {
    commit: String(process.env.PRITHA_CONTROL_CENTER_RELEASE_COMMIT || git.stdout || "unknown").slice(0, 40),
    buildId: existsSync(buildIdPath) ? readFileSync(buildIdPath, "utf8").trim().slice(0, 200) : null,
  };
}

function validateProduction() {
  const errors = [];
  if (!isPrithaCodeCheckout(config.codeRoot)) errors.push("invalid_checkout");
  if (config.stateRoot === config.codeRoot) errors.push("external_state_root_required");
  if (!existsSync(runtimeEnvPath)) errors.push("runtime_env_missing");
  if (!existsSync(path.join(appRoot, ".next", "BUILD_ID"))) errors.push("production_build_missing");
  if (!existsSync(path.join(appRoot, "node_modules", "next", "dist", "bin", "next"))) errors.push("next_binary_missing");
  return errors;
}

function runtimeProcessMatches(pid) {
  const info = processInfo(pid);
  if (!info) return false;
  return info.command.includes(path.resolve(process.argv[1])) && /\brun\b/.test(info.command);
}

function acquireLock() {
  ensurePrivateDirectory(runtimeRoot);
  assertResolvedInsideState(lockPath);
  if (existsSync(lockPath)) {
    const existing = readJson(lockPath);
    if (existing?.pid && processExists(existing.pid) && runtimeProcessMatches(existing.pid)) {
      throw new Error("runtime_already_running");
    }
    rmSync(lockPath, { force: true });
  }
  const token = randomUUID();
  const descriptor = openSync(lockPath, "wx", 0o600);
  writeFileSync(descriptor, `${JSON.stringify({
    schema: "pritha-control-center-runtime-lock-v1",
    token,
    pid: process.pid,
    instanceId: config.instanceId,
    codeRoot: config.codeRoot,
    stateRoot: config.stateRoot,
    port: config.controlCenterPort,
    label,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`);
  fsyncSync(descriptor);
  closeSync(descriptor);
  chmodSync(lockPath, 0o600);
  return token;
}

function releaseLock(token) {
  const lock = readJson(lockPath);
  if (lock?.token === token && lock.pid === process.pid) rmSync(lockPath, { force: true });
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderPlist() {
  if (!existsSync(templatePath)) throw new Error("launchd_template_missing");
  const replacements = {
    __SERVICE_LABEL__: label,
    __NODE_BINARY__: process.execPath,
    __RUNTIME_SCRIPT__: path.join(config.codeRoot, "scripts", "control-center-runtime.mjs"),
    __CHECKOUT_ROOT__: config.codeRoot,
    __RUNTIME_ENV__: runtimeEnvPath,
    __WRAPPER_STDOUT__: wrapperStdoutPath,
    __WRAPPER_STDERR__: wrapperStderrPath,
  };
  let text = readFileSync(templatePath, "utf8");
  for (const [placeholder, value] of Object.entries(replacements)) text = text.replaceAll(placeholder, xmlEscape(value));
  if (/__[A-Z0-9_]+__/.test(text)) throw new Error("launchd_template_has_unresolved_placeholders");
  return text;
}

function writePrivatePlist() {
  assertInsideState(generatedPlistPath);
  ensurePrivateDirectory(path.dirname(generatedPlistPath));
  assertResolvedInsideState(generatedPlistPath);
  const temporary = `${generatedPlistPath}.${randomUUID()}.tmp`;
  writeFileSync(temporary, renderPlist(), { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  const lint = run("plutil", ["-lint", temporary]);
  if (!lint.ok) {
    rmSync(temporary, { force: true });
    throw new Error("generated_launchd_plist_failed_validation");
  }
  renameSync(temporary, generatedPlistPath);
  chmodSync(generatedPlistPath, 0o600);
  return generatedPlistPath;
}

function requireApply() {
  if (!options.yes) throw new Error("This lifecycle mutation requires explicit --yes approval");
  if (process.platform !== "darwin" && !process.env.PRITHA_RUNTIME_ALLOW_NON_DARWIN_TEST) {
    throw new Error("launchd lifecycle commands are available only on macOS");
  }
  const productionErrors = validateProduction();
  if (productionErrors.length) throw new Error(`runtime_preflight_failed:${productionErrors.join(",")}`);
}

async function statusPayload() {
  const state = readJson(statePath);
  const launchd = launchdStatus();
  const listener = listenerOwnership(state);
  const health = await healthStatus();
  const circuit = readCircuit();
  const warnings = [];
  for (const error of validateProduction()) warnings.push(error);
  if (listener.listenerPids.length && !listener.ownerMatch) warnings.push("owner_mismatch");
  if (health.httpStatus > 0 && !health.instanceMatch) warnings.push("health_instance_mismatch");
  if (circuit.open) warnings.push("circuit_open");
  return {
    schema: "pritha-control-center-runtime-status-v1",
    ok: validateProduction().length === 0
      && listener.ownerMatch
      && (!health.httpStatus || health.instanceMatch),
    configured: {
      instanceId: config.instanceId,
      role: config.instanceRole,
      port: config.controlCenterPort,
      serviceLabel: label,
      codeRoot: config.codeRoot,
      stateRoot: config.stateRoot,
    },
    effective: state && identityMatches(state) ? {
      instanceId: state.instanceId,
      port: state.port,
      serviceLabel: state.label,
      release: state.release || null,
    } : null,
    service: launchd,
    process: {
      wrapperPid: launchd.pid || state?.wrapperPid || null,
      childPid: state?.childPid || null,
      processGroupId: state?.processGroupId || null,
    },
    port: {
      listener: listener.listenerPids.length > 0,
      listenerPids: listener.listenerPids,
      ownerMatch: listener.ownerMatch,
    },
    health,
    release: health.release || state?.release || releaseIdentity(),
    circuitBreaker: circuit,
    warnings: [...new Set(warnings)].slice(0, 20),
  };
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processExists(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !processExists(pid);
}

async function runService() {
  const errors = validateProduction();
  if (errors.length) throw new Error(`runtime_preflight_failed:${errors.join(",")}`);
  const listener = listenerPids();
  if (listener.error) throw new Error(listener.error);
  if (listener.pids.length) throw new Error("owner_mismatch:configured_port_already_has_a_listener");
  const circuit = readCircuit();
  if (circuit.open) {
    appendLifecycle("circuit-open", { exitsInWindow: circuit.exits.length });
    return { ok: false, circuitOpen: true, exitCode: 0 };
  }

  const lockToken = acquireLock();
  const release = releaseIdentity();
  for (const filePath of [stdoutPath, stderrPath]) rotateLog(filePath);
  for (const filePath of [wrapperStdoutPath, wrapperStderrPath]) {
    if (existsSync(filePath)) chmodSync(filePath, 0o600);
  }
  ensurePrivateDirectory(logRoot);
  const stdout = openSync(stdoutPath, "a", 0o600);
  const stderr = openSync(stderrPath, "a", 0o600);
  chmodSync(stdoutPath, 0o600);
  chmodSync(stderrPath, 0o600);
  const nextBinary = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
  let stopping = false;
  let forceTimer = null;
  let child = null;
  try {
    child = spawn(process.execPath, [nextBinary, "start", "--hostname", "127.0.0.1", "--port", String(config.controlCenterPort)], {
      cwd: appRoot,
      env: {
        ...process.env,
        PATH: runtimeExecutablePath(),
        TECHSCOPE_ROOT: config.codeRoot,
        PRITHA_STATE_ROOT: config.stateRoot,
        PRITHA_INSTANCE_ID: config.instanceId,
        PRITHA_INSTANCE_ROLE: config.instanceRole,
        PRITHA_CONTROL_CENTER_PORT: String(config.controlCenterPort),
        PRITHA_CONTROL_CENTER_RELEASE_COMMIT: release.commit,
        PRITHA_CONTROL_CENTER_BUILD_ID: release.buildId || "unknown",
        NODE_ENV: "production",
      },
      detached: true,
      stdio: ["ignore", stdout, stderr],
    });
    const state = {
      schema: STATE_SCHEMA,
      instanceId: config.instanceId,
      role: config.instanceRole,
      codeRoot: config.codeRoot,
      stateRoot: config.stateRoot,
      port: config.controlCenterPort,
      label,
      wrapperPid: process.pid,
      childPid: child.pid,
      processGroupId: child.pid,
      startedAt: new Date().toISOString(),
      running: true,
      release,
    };
    atomicWriteJson(statePath, state);
    appendLifecycle("start", { wrapperPid: process.pid, childPid: child.pid, release });

    const requestStop = (signal) => {
      if (stopping) return;
      stopping = true;
      appendLifecycle("operator-stop", { signal });
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* child already stopped */ }
      forceTimer = setTimeout(() => {
        if (!processExists(child.pid)) return;
        const current = processInfo(child.pid);
        if (current?.pgid !== child.pid) {
          appendLifecycle("owner-mismatch", { phase: "forced-stop", childPid: child.pid });
          return;
        }
        try {
          process.kill(-child.pid, "SIGKILL");
          appendLifecycle("forced-stop", { childPid: child.pid });
        } catch { /* child exited during verification */ }
      }, STOP_GRACE_MS);
      forceTimer.unref?.();
    };
    process.once("SIGTERM", () => requestStop("SIGTERM"));
    process.once("SIGINT", () => requestStop("SIGINT"));

    const outcome = await new Promise((resolve) => {
      child.once("error", (error) => resolve({ code: 1, signal: null, error: error.message }));
      child.once("exit", (code, signal) => resolve({ code, signal, error: null }));
    });
    if (forceTimer) clearTimeout(forceTimer);
    const finalState = { ...state, running: false, exitedAt: new Date().toISOString(), exitCode: outcome.code, exitSignal: outcome.signal };
    atomicWriteJson(statePath, finalState);
    appendLifecycle("exit", { exitCode: outcome.code, signal: outcome.signal, expected: stopping, error: outcome.error });
    if (stopping) return { ok: true, exitCode: 0, expectedStop: true };
    const crash = recordUnexpectedExit();
    if (crash.open) {
      appendLifecycle("circuit-open", { exitsInWindow: crash.exits.length });
      return { ok: false, circuitOpen: true, exitCode: 0 };
    }
    appendLifecycle("restart-requested", { exitsInWindow: crash.exits.length });
    return { ok: false, exitCode: 1, childExitCode: outcome.code, childSignal: outcome.signal };
  } finally {
    closeSync(stdout);
    closeSync(stderr);
    releaseLock(lockToken);
  }
}

async function assertSafeStop() {
  const state = readJson(statePath);
  const ownership = listenerOwnership(state);
  if (ownership.listenerPids.length && !ownership.ownerMatch) {
    appendLifecycle("owner-mismatch", { phase: "stop", listenerPids: ownership.listenerPids });
    throw new Error("owner_mismatch:refusing_to_stop_foreign_listener");
  }
  if (state && !identityMatches(state)) throw new Error("owner_mismatch:runtime_state_identity");
  return { state, ownership };
}

async function stopService() {
  const { state } = await assertSafeStop();
  const launchd = launchdStatus();
  if (launchd.loaded) {
    const result = run(launchctlBinary, ["bootout", serviceTarget], { timeoutMs: 30_000 });
    if (!result.ok) throw new Error("launchd_bootout_failed");
  } else if (state?.wrapperPid && processExists(state.wrapperPid) && runtimeProcessMatches(state.wrapperPid)) {
    process.kill(state.wrapperPid, "SIGTERM");
  }
  if (state?.childPid) await waitForExit(state.childPid, STOP_GRACE_MS + 3_000);
  const remaining = listenerPids();
  if (remaining.pids.length) {
    const ownership = listenerOwnership(state, remaining);
    if (!ownership.ownerMatch) throw new Error("owner_mismatch:listener_changed_during_stop");
    throw new Error("control_center_did_not_stop_within_grace_period");
  }
  appendLifecycle("stop-complete");
  return { stopped: true };
}

function installService() {
  const state = readJson(statePath);
  const ownership = listenerOwnership(state);
  if (ownership.listenerPids.length) {
    if (!ownership.ownerMatch) throw new Error("owner_mismatch:configured_port_already_has_a_listener");
    const currentService = launchdStatus();
    if (currentService.loaded) return { installed: true, loaded: true, alreadyRunning: true, label };
    throw new Error("runtime_already_running_outside_launchd");
  }
  const privatePlist = writePrivatePlist();
  prepareLaunchdLogs();
  mkdirSync(path.dirname(installedPlistPath), { recursive: true, mode: 0o700 });
  const temporary = `${installedPlistPath}.${randomUUID()}.tmp`;
  copyFileSync(privatePlist, temporary);
  chmodSync(temporary, 0o600);
  renameSync(temporary, installedPlistPath);
  const launchd = launchdStatus();
  if (!launchd.loaded) {
    const bootstrap = run(launchctlBinary, ["bootstrap", launchDomain, installedPlistPath], { timeoutMs: 30_000 });
    if (!bootstrap.ok) throw new Error("launchd_bootstrap_failed");
  }
  appendLifecycle("installed", { label });
  return { installed: true, loaded: true, label };
}

async function startService() {
  if (!existsSync(installedPlistPath)) throw new Error("service_not_installed");
  const listener = listenerPids();
  if (listener.pids.length) {
    const state = readJson(statePath);
    const ownership = listenerOwnership(state, listener);
    if (!ownership.ownerMatch) throw new Error("owner_mismatch:configured_port_already_has_a_listener");
    return { started: false, alreadyRunning: true };
  }
  clearCircuit();
  prepareLaunchdLogs();
  const launchd = launchdStatus();
  const result = launchd.loaded
    ? run(launchctlBinary, ["kickstart", "-k", serviceTarget], { timeoutMs: 30_000 })
    : run(launchctlBinary, ["bootstrap", launchDomain, installedPlistPath], { timeoutMs: 30_000 });
  if (!result.ok) throw new Error(launchd.loaded ? "launchd_kickstart_failed" : "launchd_bootstrap_failed");
  appendLifecycle("operator-start");
  return { started: true };
}

async function restartService() {
  await stopService();
  return startService();
}

async function uninstallService() {
  await assertSafeStop();
  const launchd = launchdStatus();
  if (launchd.loaded) {
    const result = run(launchctlBinary, ["bootout", serviceTarget], { timeoutMs: 30_000 });
    if (!result.ok) throw new Error("launchd_bootout_failed");
  }
  if (existsSync(installedPlistPath)) {
    const installed = readFileSync(installedPlistPath, "utf8");
    if (!installed.includes(`<string>${label}</string>`)) throw new Error("owner_mismatch:installed_plist_label");
    rmSync(installedPlistPath);
  }
  appendLifecycle("uninstalled", { label });
  return { uninstalled: true };
}

function planPayload() {
  return {
    schema: "pritha-control-center-runtime-plan-v1",
    ok: validateProduction().length === 0,
    readOnly: true,
    instance: { id: config.instanceId, role: config.instanceRole, port: config.controlCenterPort },
    service: { label, target: serviceTarget, runAtLoad: true, throttleIntervalSeconds: 30 },
    restart: { trigger: "process_exit_only", circuitBreaker: { exits: CIRCUIT_EXIT_LIMIT, windowSeconds: CIRCUIT_WINDOW_MS / 1000 } },
    lifecycle: ["install --yes", "start --yes", "stop --yes", "restart --yes", "uninstall --yes"],
    preflight: { errors: validateProduction() },
    mutationsApplied: false,
  };
}

function print(payload) {
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Pritha Control Center runtime: ${payload.ok === false ? "attention" : "ok"}`);
    console.log(`Instance: ${config.instanceId} · port ${config.controlCenterPort}`);
    console.log(`Service: ${label}`);
    if (payload.warnings?.length) console.log(`Warnings: ${payload.warnings.join(", ")}`);
  }
}

function usage() {
  console.log(`Usage:
  node scripts/control-center-runtime.mjs plan [--json]
  node scripts/control-center-runtime.mjs status [--json]
  node scripts/control-center-runtime.mjs run
  node scripts/control-center-runtime.mjs install --yes
  node scripts/control-center-runtime.mjs start --yes
  node scripts/control-center-runtime.mjs stop --yes
  node scripts/control-center-runtime.mjs restart --yes
  node scripts/control-center-runtime.mjs uninstall --yes

plan and status are read-only. Every launchd mutation requires --yes.`);
}

try {
  const command = options._[0] || "status";
  let payload;
  if (command === "plan") payload = planPayload();
  else if (command === "status") payload = await statusPayload();
  else if (command === "run") {
    const outcome = await runService();
    payload = { schema: "pritha-control-center-runtime-run-v1", ...outcome };
    process.exitCode = outcome.exitCode;
  } else if (["install", "start", "stop", "restart", "uninstall"].includes(command)) {
    requireApply();
    if (command === "install") payload = { schema: "pritha-control-center-runtime-action-v1", ok: true, action: command, ...installService() };
    if (command === "start") payload = { schema: "pritha-control-center-runtime-action-v1", ok: true, action: command, ...await startService() };
    if (command === "stop") payload = { schema: "pritha-control-center-runtime-action-v1", ok: true, action: command, ...await stopService() };
    if (command === "restart") payload = { schema: "pritha-control-center-runtime-action-v1", ok: true, action: command, ...await restartService() };
    if (command === "uninstall") payload = { schema: "pritha-control-center-runtime-action-v1", ok: true, action: command, ...await uninstallService() };
  } else {
    usage();
    process.exit(command === "help" ? 0 : 1);
  }
  print(payload);
} catch (error) {
  const payload = {
    schema: "pritha-control-center-runtime-error-v1",
    ok: false,
    code: String(error instanceof Error ? error.message : error).split(":", 1)[0],
    error: error instanceof Error ? error.message : String(error),
  };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.error(`Pritha Control Center runtime error: ${payload.error}`);
  process.exitCode = 1;
}
