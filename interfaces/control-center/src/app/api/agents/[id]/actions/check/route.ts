import { runAgentManualCheck } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await runAgentManualCheck(id);

  if (!result) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(result);
}
