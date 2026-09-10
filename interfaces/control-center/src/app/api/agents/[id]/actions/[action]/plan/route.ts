import { getAgentOperatorActionPlan } from "@/lib/control-center/server";
import type { ControlCenterOperatorAction } from "@/lib/control-center/types";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["start", "stop", "check", "restore"]);

function parseAction(value: string): ControlCenterOperatorAction | null {
  return ACTIONS.has(value) ? (value as ControlCenterOperatorAction) : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action: actionParam } = await context.params;
  const action = parseAction(actionParam);

  if (!action) {
    return Response.json({ ok: false, error: "unknown_action", action: actionParam }, { status: 400 });
  }

  const plan = await getAgentOperatorActionPlan(id, action);

  if (!plan) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(plan);
}
