import { NextResponse } from "next/server";
import { getSomaFmChannels } from "@/lib/music/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const result = await getSomaFmChannels(forceRefresh);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
