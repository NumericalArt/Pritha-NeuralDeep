import { NextResponse } from "next/server";
import { createRealtimeCall, RealtimeProviderError } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RealtimeCallPayload = {
  offerSdp?: string;
  ephemeralKey?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as RealtimeCallPayload;

  try {
    const answerSdp = await createRealtimeCall(String(payload.offerSdp || ""), String(payload.ephemeralKey || ""));
    return NextResponse.json({ answerSdp });
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

    return NextResponse.json({ error: "Could not create realtime call" }, { status: 502 });
  }
}
