import { NextResponse } from "next/server";
import { getMusicHealth } from "@/lib/music/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getMusicHealth();
  return NextResponse.json(result);
}
