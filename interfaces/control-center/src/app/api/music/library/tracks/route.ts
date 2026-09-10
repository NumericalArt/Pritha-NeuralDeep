import { NextResponse } from "next/server";
import { getLocalMusicLibrary } from "@/lib/music/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getLocalMusicLibrary();
  return NextResponse.json(result);
}
