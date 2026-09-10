import { getAgentSnapshots } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const snapshots = await getAgentSnapshots(id);

  if (!snapshots) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(snapshots);
}
