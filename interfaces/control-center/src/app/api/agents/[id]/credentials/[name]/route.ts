import { removeAgentCredentialSecret, setAgentCredentialSecret } from "@/lib/control-center/server";

export const dynamic = "force-dynamic";

function statusForError(error: unknown) {
  const message = error instanceof Error ? error.message : "credential_error";
  if (message === "unknown_secret") return { status: 404, message };
  if (message === "agent_folder_unavailable") return { status: 409, message };
  if (message === "secret_not_writable" || message === "secret_not_removable") return { status: 409, message };
  if (message === "invalid_secret_value") return { status: 400, message };
  return { status: 500, message: "credential_error" };
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { value?: unknown; dryRun?: unknown };

  try {
    const result = await setAgentCredentialSecret(id, decodeURIComponent(name), body.value, { dryRun: body.dryRun === true });
    if (!result) return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    const mapped = statusForError(error);
    return Response.json({ ok: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown };

  try {
    const result = await removeAgentCredentialSecret(id, decodeURIComponent(name), { dryRun: body.dryRun === true });
    if (!result) return Response.json({ ok: false, error: "agent_not_found", id }, { status: 404 });
    return Response.json(result);
  } catch (error) {
    const mapped = statusForError(error);
    return Response.json({ ok: false, error: mapped.message }, { status: mapped.status });
  }
}
