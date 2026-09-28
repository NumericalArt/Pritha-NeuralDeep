import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSyncProbe } from "../lib/sync-probe.mjs";
import { serviceLifecycleTest } from "./scaffold/tests.mjs";

export const MANAGED_LIFECYCLE_TRIAL_ID = "host-managed-lifecycle";
const LIFECYCLE_TEST = "tests/service-lifecycle.test.mjs";
const SKIPPED_COPY_ENTRIES = new Set([".git", ".state"]);

function tail(text, maximum) {
  const value = String(text || "").trim();
  return value.length <= maximum ? value : value.slice(value.length - maximum);
}

// The copy's own processes only: a process whose working directory is the disposable copy.
function stopProcessesIn(directory) {
  const listed = runSyncProbe("lsof", ["-a", "-d", "cwd", "-F", "pn", "+d", directory], { encoding: "utf8", timeout: 10_000 });
  if (listed.error || !listed.stdout) return;
  let pid = null;
  for (const line of listed.stdout.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid && path.resolve(line.slice(1)) === directory) {
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
  }
}

/**
 * Pritha's Start and Stop run the product's own scripts/service-control.mjs, while the approved
 * Outcome Trials start scripts/server.mjs directly. A Gemma 4 product passed every Trial with the
 * scaffold's lifecycle stub still in place and could not be started (2026-09-28). A managed process
 * agent must also pass the lifecycle test the scaffold generated from its baseline manifest; the
 * host regenerates that test and runs it in a disposable copy of the candidate.
 */
export function managedLifecycleCheck(worktree, { baseRevision, timeoutMs = 90_000 } = {}) {
  if (!baseRevision) return { applicable: false };
  const shown = runSyncProbe("git", ["show", `${baseRevision}:operations/manifest.json`], { cwd: worktree, encoding: "utf8", timeout: 10_000 });
  if (shown.status !== 0) return { applicable: false };
  let manifest;
  try { manifest = JSON.parse(shown.stdout); } catch { return { applicable: false }; }
  if (manifest?.scaffold_adapter !== "api-process-v1" || manifest.control_center_managed !== true || !manifest.health_url
    || !Array.isArray(manifest.start_command?.env_allowlist) || !manifest.start_command.env_allowlist.some(name => String(name).endsWith("_PORT"))) {
    return { applicable: false };
  }
  const copy = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-lifecycle-")));
  try {
    try {
      cpSync(worktree, copy, { recursive: true, filter: source => !SKIPPED_COPY_ENTRIES.has(path.relative(worktree, source).split(path.sep)[0]) });
      mkdirSync(path.join(copy, path.dirname(LIFECYCLE_TEST)), { recursive: true });
      writeFileSync(path.join(copy, LIFECYCLE_TEST), serviceLifecycleTest(manifest));
    } catch (error) {
      // A host fault in preparing the check never holds the delivery; the caller records it.
      return { applicable: false, hostError: String(error?.code || error?.message || "lifecycle_check_unavailable").slice(0, 200) };
    }
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    const run = spawnSync(process.execPath, ["--test", LIFECYCLE_TEST], { cwd: copy, env, encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 });
    const output = tail(`${run.stdout || ""}\n${run.stderr || ""}`.replaceAll(copy, "<PROJECT_ROOT>"), 4_000);
    return { applicable: true, ok: run.status === 0, exitCode: run.status, timedOut: run.error?.code === "ETIMEDOUT", output };
  } finally {
    stopProcessesIn(copy);
    if (existsSync(copy)) rmSync(copy, { recursive: true, force: true });
  }
}

export function managedLifecycleFailure(check) {
  return {
    id: MANAGED_LIFECYCLE_TRIAL_ID,
    kind: "automated",
    status: "failed",
    statement: "Pritha starts and stops this agent with `node scripts/service-control.mjs start|stop` (operations/manifest.json). "
      + "The scaffold's tests/service-lifecycle.test.mjs must pass: start serves /health on the port from the manifest's *_PORT variable, "
      + "a repeated start is idempotent, stop never touches a foreign PID, and a repeated stop is safe.",
    execution: { exit_code: check.exitCode ?? null, timed_out: check.timedOut === true, stderr: check.output },
  };
}
