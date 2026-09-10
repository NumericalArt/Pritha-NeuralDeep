import { NextResponse } from "next/server";
import { promoteVoiceSessionMemory } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await promoteVoiceSessionMemory(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
