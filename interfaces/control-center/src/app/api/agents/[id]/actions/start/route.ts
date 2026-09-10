import { runAgentRuntimeAction } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

async function readConfirmation(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { confirmation?: unknown };
  return typeof body.confirmation === "string" ? body.confirmation : "";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await runAgentRuntimeAction(id, "start", await readConfirmation(request));

  if (!result) {
    return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
  }

  return Response.json(result);
}
