import { getAgentSnapshotCompare } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const compare = await getAgentSnapshotCompare(id, {
    base: url.searchParams.get("base") || undefined,
    target: url.searchParams.get("target") || undefined,
  });

  if (!compare) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(compare);
}
