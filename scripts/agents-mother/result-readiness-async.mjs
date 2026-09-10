import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePrithaAgentParent, resolvePrithaStateRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { timeoutPolicy } from "../lib/timeout-policy.mjs";

const active = new Map();
const queue = [];
let running = 0;
function drain() {
  while (running < 4 && queue.length) {
    const job = queue.shift();
    running += 1;
    if (!job.start()) running -= 1;
  }
}
export function unavailableResultReadiness(reason = "readiness-unavailable") {
  return { schema: "pritha-result-readiness-v1", agentId: null, observedAt: new Date().toISOString(),
    verification: { status: "unknown", scope: "canonical-project", reason, counts: null, head: null },
    candidate: { status: "unknown", reason, head: null }, acceptance: { status: "unknown", at: null },
    run: null, evidenceIssues: 0, truncated: false };
}

export async function readAgentResultReadinessAsync(target, input = {}) {
  if (typeof target !== "string" || !target || target.length > 256) return unavailableResultReadiness("agent-identity-invalid");
  const root = path.resolve(input.root || resolveTechscopeRoot());
  const options = { ...input, root };
  const request = { target, root, stateRoot: resolvePrithaStateRoot(options), agentParent: resolvePrithaAgentParent(options) };
  let timeout;
  try { timeout = timeoutPolicy("resultReadiness", { value: input.timeoutMs }); }
  catch { return unavailableResultReadiness("invalid-readiness-timeout-policy"); }
  const codeRoot = input.codeRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const key = JSON.stringify([codeRoot, request, timeout]);
  if (active.has(key)) return active.get(key);
  if (active.size >= 68) return unavailableResultReadiness("readiness-queue-full");
  const work = new Promise(resolve => {
    let child, started = false, stdout = "", bytes = 0, settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (started) running -= 1;
      else { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1); }
      resolve(result);
      queueMicrotask(drain);
    };
    const stop = reason => {
      if (settled) return;
      if (child) try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* Read-only probe remains unavailable. */ } }
      finish(unavailableResultReadiness(reason));
    };
    const timer = setTimeout(() => stop("readiness-timeout"), timeout);
    const job = { start() {
      if (settled) return false;
      started = true;
      try {
        child = spawn(process.execPath, [path.join(codeRoot, "scripts/agents-mother/result-readiness-worker.mjs")], {
          cwd: root, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32",
          env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: request.stateRoot, PRITHA_AGENT_PARENT: request.agentParent },
        });
        child.stdout.on("data", chunk => { bytes += chunk.length; if (bytes > 1_000_000) stop("readiness-output-limit"); else stdout += chunk.toString("utf8"); });
        child.stderr.on("data", chunk => { bytes += chunk.length; if (bytes > 1_000_000) stop("readiness-output-limit"); });
        child.on("error", () => finish(unavailableResultReadiness()));
        child.stdin.on("error", () => stop("readiness-input-unavailable"));
        child.on("close", code => {
          if (settled) return;
          try {
            const result = JSON.parse(stdout);
            if (code !== 0 || result.schema !== "pritha-result-readiness-v1" || !result.verification || !result.acceptance) throw new Error("invalid");
            finish(result);
          } catch { finish(unavailableResultReadiness()); }
        });
        child.stdin.end(JSON.stringify(request));
      } catch { stop("readiness-unavailable"); }
      return true;
    } };
    queue.push(job);
    queueMicrotask(drain);
  });
  active.set(key, work);
  try { return await work; } finally { active.delete(key); }
}
