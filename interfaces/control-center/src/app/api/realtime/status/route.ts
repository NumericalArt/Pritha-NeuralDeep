import { NextResponse } from "next/server";
import { getPrithaRealtimeStatus } from "@/lib/realtime/pritha-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPrithaRealtimeStatus());
}
