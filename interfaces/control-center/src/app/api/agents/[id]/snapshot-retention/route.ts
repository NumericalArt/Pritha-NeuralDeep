import { enforceAgentSnapshotRetention, getAgentSnapshotRetention } from "@/lib/control-center/server";
import type { ControlCenterSnapshotRetentionRequest } from "@/lib/control-center/types";

export const dynamic = "force-dynamic";

async function requestBody(request: Request): Promise<ControlCenterSnapshotRetentionRequest> {
  try {
    return (await request.json()) as ControlCenterSnapshotRetentionRequest;
  } catch {
    return {};
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const plan = await getAgentSnapshotRetention(id);

  if (!plan) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(plan);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await enforceAgentSnapshotRetention(id, await requestBody(request));

  if (!result) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(result, { status: result.ok ? 200 : 409 });
}
