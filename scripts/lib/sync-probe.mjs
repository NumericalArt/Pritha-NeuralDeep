import { spawnSync } from "node:child_process";

// Synchronous counterpart of the Control Center TS helper. Callers retain
// their cwd/env/input/output budgets; neither helper grants execution authority.
export function runSyncProbe(command, args, options) {
  if (!Number.isSafeInteger(options?.timeout) || options.timeout <= 0) {
    throw new TypeError("Sync probe timeout must be a positive integer");
  }
  return spawnSync(command, args, {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    ...options, timeout: options.timeout, shell: false, killSignal: "SIGKILL",
  });
}
