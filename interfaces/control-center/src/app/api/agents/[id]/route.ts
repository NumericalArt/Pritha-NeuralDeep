import { getControlCenterStatus } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const status = await getControlCenterStatus();
  const agent = status.childAgents.find((item) => item.id === id);

  if (!agent) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json({ ok: true, generatedAt: status.generatedAt, agent });
}
