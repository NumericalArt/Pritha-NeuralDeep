import { validateAgentCredentialSecret } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : "credential_validation_error";
  if (message === "unknown_secret") return { status: 404, message };
  if (message === "agent_folder_unavailable") return { status: 409, message };
  return { status: 500, message: "credential_validation_error" };
}

export async function POST(_request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await context.params;

  try {
    const result = await validateAgentCredentialSecret(id, decodeURIComponent(name));
    if (!result) return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    const mapped = statusForError(error);
    return Response.json({ ok: false, error: mapped.message }, { status: mapped.status });
  }
}
