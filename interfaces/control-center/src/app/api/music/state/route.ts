import { NextResponse } from "next/server";
import { getMusicState } from "@/lib/music/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await getMusicState({
    generationId: url.searchParams.get("generation_id") || undefined,
    style: url.searchParams.get("style") || undefined,
  });
  return NextResponse.json(result);
}
