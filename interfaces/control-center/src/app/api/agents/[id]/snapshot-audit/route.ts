import { getAgentSnapshotAudit } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 20);
  const audit = await getAgentSnapshotAudit(id, Number.isFinite(limit) ? limit : 20);

  if (!audit) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(audit);
}
