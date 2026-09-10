import { getAgentPreRestoreContract } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const contract = await getAgentPreRestoreContract(id, url.searchParams.get("snapshot") || undefined);

  if (!contract) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(contract);
}
