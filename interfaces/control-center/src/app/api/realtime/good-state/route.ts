import { NextResponse } from "next/server";
import { listPrithaGoodStateSignals } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 5), 20));
  const signals = await listPrithaGoodStateSignals(limit);
  return NextResponse.json({
    ok: true,
    signals,
    finalize_requires: "voice-capture-complete-git-baseline-optional",
  });
}
