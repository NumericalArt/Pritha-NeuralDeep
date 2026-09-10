import { NextResponse } from "next/server";
import {
  getNeuralDeepCredentialStatus,
  probeNeuralDeepCredential,
  saveNeuralDeepCredential,
} from "@/lib/settings/neuraldeep-credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    credential: getNeuralDeepCredentialStatus(),
    provider: await probeNeuralDeepCredential(),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { value?: string; confirmation?: string };
  if (body.confirmation !== "save-neuraldeep-key") {
    return NextResponse.json({ ok: false, error: "confirmation_required" }, { status: 400 });
  }
  try {
    const credential = await saveNeuralDeepCredential(String(body.value || ""));
    return NextResponse.json({ ok: true, credential, provider: await probeNeuralDeepCredential() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "credential_save_failed" }, { status: 400 });
  }
}
