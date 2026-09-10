import { NextResponse } from "next/server";
import { createPrithaVoiceIntakeCodexTask, type VoiceIntakeFileInput } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "multipart_form_required" }, { status: 415 });
  }

  const form = await request.formData();
  const text = String(form.get("text") || "");
  const sessionId = String(form.get("session_id") || "");
  const confirmation = {
    source_intake_id: String(form.get("confirmation_intake_id") || ""),
    session_id: String(form.get("confirmation_session_id") || sessionId),
    timestamp: String(form.get("confirmation_timestamp") || ""),
    instruction: String(form.get("confirmed_instruction") || ""),
    intent: String(form.get("confirmed_intent") || ""),
    original_text_role: String(form.get("original_text_role") || ""),
    target_agent: String(form.get("target_agent") || ""),
    persistence: String(form.get("persistence") || ""),
    notes: String(form.get("confirmation_notes") || ""),
  };
  const files: VoiceIntakeFileInput[] = [];

  for (const entry of form.getAll("files")) {
    if (!isUploadedFile(entry)) continue;
    const buffer = new Uint8Array(await entry.arrayBuffer());
    files.push({
      name: entry.name,
      type: entry.type,
      size: entry.size,
      bytes: buffer,
    });
  }

  const result = await createPrithaVoiceIntakeCodexTask({ text, files, sessionId, confirmation });
  const error = typeof result.error === "string" ? result.error : "";
  const status = result.ok ? 200 : error === "empty_intake" || error === "voice_confirmation_required" ? 400 : error.includes("large") || error === "too_many_files" ? 413 : 400;
  return NextResponse.json(result, { status });
}
