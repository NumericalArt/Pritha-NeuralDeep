import { NextResponse } from "next/server";
import {
  buildRealtimeSessionConfig,
  createEphemeralRealtimeSession,
  RealtimeProviderError,
} from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeSessionRequest = {
  musicControlEnabled?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RealtimeSessionRequest;
    const options = { musicControlEnabled: body.musicControlEnabled === true };
    const session = await createEphemeralRealtimeSession(options);
    const config = buildRealtimeSessionConfig(options);
    return NextResponse.json({
      client_secret: session.client_secret,
      model: config.model,
      voice: config.audio.output.voice,
      tools: config.tools.map((tool) => tool.name),
    });
  } catch (error) {
    if (error instanceof RealtimeProviderError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.providerCode ?? "provider_error",
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      );
    }

    return NextResponse.json({ error: "Could not create realtime session" }, { status: 502 });
  }
}
