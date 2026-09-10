import { maintenanceResponse } from "@/lib/control-center/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: Record<string, { args: string[]; timeoutMs?: number }> = {
  "github-check": { args: ["scripts/pritha-maintenance.mjs", "github-check", "--json"], timeoutMs: 120000 },
  "github-update-plan": { args: ["scripts/pritha-maintenance.mjs", "github-update", "--json"], timeoutMs: 120000 },
  "github-update": { args: ["scripts/pritha-maintenance.mjs", "github-update", "--yes", "--json"], timeoutMs: 180000 },
  "rebuild-from-github": { args: ["scripts/pritha-maintenance.mjs", "rebuild-from-github", "--json"], timeoutMs: 120000 },
  "refresh-agents": { args: ["scripts/pritha-maintenance.mjs", "refresh-agents", "--json"], timeoutMs: 120000 },
  "refresh-self-knowledge": { args: ["scripts/pritha-maintenance.mjs", "refresh-self-knowledge", "--json"], timeoutMs: 120000 },
  "github-knowledge-radar": { args: ["scripts/pritha-maintenance.mjs", "github-knowledge-radar", "--json"], timeoutMs: 60000 },
  "github-knowledge-radar-search": { args: ["scripts/github-knowledge-radar.mjs", "search", "--topic", "agent-harness", "--json"], timeoutMs: 60000 },
};

export async function POST(_request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  const definition = ACTIONS[action];
  if (!definition) {
    return Response.json(
      {
        schema: "pritha-maintenance-api-error-v1",
        ok: false,
        status: "unknown_action",
        action,
        availableActions: Object.keys(ACTIONS),
      },
      { status: 404 },
    );
  }
  return Response.json(maintenanceResponse(definition.args, { timeoutMs: definition.timeoutMs }));
}
