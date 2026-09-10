import { spawnSync } from "node:child_process";
import { resolveTechscopeRoot } from "../pritha-paths";

function parseJson(stdout: string) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    return {
      schema: "pritha-maintenance-api-parse-error-v1",
      ok: false,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
      stdout,
    };
  }
}

export function runPrithaMaintenance(args: string[], options: { timeoutMs?: number } = {}) {
  const root = resolveTechscopeRoot();
  const result = spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 120000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: root },
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  const payload = stdout ? parseJson(stdout) : null;

  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout,
    stderr,
    payload,
  };
}

export function maintenanceResponse(args: string[], options: { timeoutMs?: number } = {}) {
  const result = runPrithaMaintenance(args, options);
  if (result.payload) {
    return {
      ...result.payload,
      api: {
        ok: result.ok,
        exitCode: result.exitCode,
        stderr: result.stderr,
      },
    };
  }
  return {
    schema: "pritha-maintenance-api-error-v1",
    ok: false,
    status: "failed",
    api: {
      ok: result.ok,
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    },
  };
}
