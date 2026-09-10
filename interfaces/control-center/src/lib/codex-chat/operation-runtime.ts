import path from "node:path";
import { LocalExecBackend } from "../../../../../scripts/agents-mother/execution-backends.mjs";
import type { OperationRuntime } from "../../../../../scripts/agents-mother/operation-decisions.mjs";

export function operationRuntime(root: string, stateRoot: string): OperationRuntime {
  async function access(action: "plan" | "serve", target: { agentId: string; port: number; healthPath: string }) {
    const state = path.join(stateRoot, ...(stateRoot === root ? [".snapshots", "audit"] : ["audit"]), "operation-decisions", `${target.agentId}-setup.json`);
    const args = ["node", "scripts/tailscale-setup.mjs", action, "--app", target.agentId, "--port", String(target.port), "--health-path", target.healthPath, "--state", state, "--json", ...(action === "serve" ? ["--yes"] : [])];
    const result = await new LocalExecBackend().execute({ argv: args, cwd: root, env: { TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot }, timeoutMs: action === "plan" ? 15000 : 120000, outputBytesCap: 256000 });
    if (result.exitCode !== 0 || result.timedOut || result.stdoutTruncated) return null;
    try { return JSON.parse(result.stdout); } catch { return null; }
  }
  return {
    async startPlan(id) {
      const { getAgentOperatorActionPlan } = await import("@/lib/control-center/server");
      const plan = await getAgentOperatorActionPlan(id, "start");
      return { enabled: plan?.actionEnabled === true, confirmation: plan?.confirmation?.requiredPhrase || "", lock: plan ? { target: plan.target, requiresConfirmation: plan.requiresConfirmation } : null };
    },
    async start(id, confirmation) {
      const { runAgentRuntimeAction } = await import("@/lib/control-center/server");
      const result = await runAgentRuntimeAction(id, "start", confirmation);
      return { ok: Boolean(result?.ok && result.execution?.exitCode === 0) };
    },
    async accessPlan(target) {
      const plan = await access("plan", target), status = plan?.status;
      return { enabled: Boolean(status?.installed && status?.authenticated && status?.local_upstream_health?.status === "ready"),
        lock: status ? { installed: status.installed, authenticated: status.authenticated, configured: status.serve_configured, serve: status.serve_status_json || null } : null };
    },
    async serve(target) { return { ok: (await access("serve", target))?.action_status === "configured" }; },
  };
}
