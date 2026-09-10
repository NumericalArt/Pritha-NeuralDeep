import { NextResponse } from "next/server";
import { logPrithaRealtimeClientEvent } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientEventPayload = {
  kind?: string;
  payload?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ClientEventPayload;
  const kind = String(body.kind || "client_event");
  const result = await logPrithaRealtimeClientEvent(kind, body.payload || {});
  return NextResponse.json(result);
}
