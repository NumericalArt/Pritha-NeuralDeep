import { getPrithaRuntimeSettings } from "@/lib/realtime/pritha-runtime";
import { NextResponse } from "next/server";
import { executeVoiceTool, type VoiceOperationIdentity } from "@/lib/voice/tool-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolPayload = {
  name?: string;
  operation?: VoiceOperationIdentity;
  arguments?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as ToolPayload;
  const name = String(payload.name || "");
  if (!name) return NextResponse.json({ ok: false, error: "missing_tool_name" }, { status: 400 });

  try {
    const output = await executeVoiceTool(name, payload.arguments || {}, payload.operation ? {...payload.operation, signal:request.signal,model:getPrithaRuntimeSettings().codexModel} : undefined);
    return NextResponse.json(output);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "voice_tool_failed",
      },
      { status: 500 },
    );
  }
}
