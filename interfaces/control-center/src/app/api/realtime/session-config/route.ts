import { NextResponse } from "next/server";
import { buildRealtimeSessionConfig } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeSessionConfigRequest = {
  musicControlEnabled?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RealtimeSessionConfigRequest;
  const config = buildRealtimeSessionConfig({
    musicControlEnabled: body.musicControlEnabled === true,
  });
  return NextResponse.json({
    ok: true,
    type: config.type,
    instructions: config.instructions,
    tools: config.tools,
    tool_choice: config.tool_choice,
  });
}
