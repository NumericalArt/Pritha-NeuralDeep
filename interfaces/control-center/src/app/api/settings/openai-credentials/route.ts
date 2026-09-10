import { NextResponse } from "next/server";
import { getOpenAICredentialsStatus, isOpenAISecretName, saveOpenAISecret } from "@/lib/settings/openai-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, credentials: getOpenAICredentialsStatus() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    value?: string;
    confirmation?: string;
  };

  if (!body.name || !isOpenAISecretName(body.name)) {
    return NextResponse.json({ ok: false, error: "invalid_secret_name" }, { status: 400 });
  }
  if (body.confirmation !== "save-openai-key") {
    return NextResponse.json({ ok: false, error: "confirmation_required" }, { status: 400 });
  }
  try {
    const secret = saveOpenAISecret(body.name, String(body.value || ""));
    return NextResponse.json({ ok: true, secret, credentials: getOpenAICredentialsStatus() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "credential_save_failed" }, { status: 400 });
  }
}
