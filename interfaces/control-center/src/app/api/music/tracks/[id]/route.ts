import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getCachedMusicTrack } from "@/lib/music/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentType(format: string) {
  if (format === "wav" || format === "wav32") return "audio/wav";
  if (format === "flac") return "audio/flac";
  if (format === "opus") return "audio/opus";
  if (format === "aac") return "audio/aac";
  return "audio/mpeg";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await getCachedMusicTrack(id);
  if (!resolved) return NextResponse.json({ ok: false, error: "track_not_found" }, { status: 404 });
  const bytes = await readFile(resolved.path);
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType(resolved.track.audioFormat),
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(bytes.byteLength),
    },
  });
}
