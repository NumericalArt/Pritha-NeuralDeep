import { NextResponse } from "next/server";
import { getSomaFmPlaybackUrl } from "@/lib/music/service";
import type { SomaFmPlaylistFormat, SomaFmPlaylistQuality } from "@/lib/music/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function format(value: string | null): SomaFmPlaylistFormat | undefined {
  return value === "aac" || value === "aacp" || value === "mp3" ? value : undefined;
}

function quality(value: string | null): SomaFmPlaylistQuality | undefined {
  return value === "highest" || value === "high" || value === "low" ? value : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channel_id") || "";
  if (!channelId) return NextResponse.json({ ok: false, error: "channel_id_required" }, { status: 400 });

  const result = await getSomaFmPlaybackUrl(channelId, {
    format: format(url.searchParams.get("format")),
    quality: quality(url.searchParams.get("quality")),
    resolvePlaylist: url.searchParams.get("resolve") !== "0",
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
