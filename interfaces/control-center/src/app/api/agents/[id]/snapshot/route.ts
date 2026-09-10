import { createAgentSnapshot } from "@/lib/control-center/server";
import type { ControlCenterSnapshotCreateRequest } from "@/lib/control-center/types";

export const dynamic = "force-dynamic";

async function requestBody(request: Request): Promise<ControlCenterSnapshotCreateRequest> {
  try {
    return (await request.json()) as ControlCenterSnapshotCreateRequest;
  } catch {
    return {};
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await createAgentSnapshot(id, await requestBody(request));

  if (!result) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(result, { status: result.ok ? 200 : 409 });
}
