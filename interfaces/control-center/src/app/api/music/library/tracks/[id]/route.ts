import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getLocalMusicTrack, localMusicContentType } from "@/lib/music/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await getLocalMusicTrack(id);
  if (!resolved) return NextResponse.json({ ok: false, error: "library_track_not_found" }, { status: 404 });

  const fileStat = await stat(resolved.path).catch(() => null);
  if (!fileStat?.isFile()) return NextResponse.json({ ok: false, error: "library_track_not_found" }, { status: 404 });

  const size = fileStat.size;
  const range = parseRange(request.headers.get("range"), size);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Type": localMusicContentType(resolved.track.audioFormat),
  });

  if (range) {
    const length = range.end - range.start + 1;
    headers.set("Content-Length", String(length));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    return new Response(Readable.toWeb(createReadStream(resolved.path, { start: range.start, end: range.end })) as ReadableStream, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(resolved.path)) as ReadableStream, { headers });
}
