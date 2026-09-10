import { NextResponse } from "next/server";
import { getMusicRuntimeConfig } from "@/lib/music/config";
import { importLocalMusicTrack } from "@/lib/music/service";
import { LOCAL_MUSIC_IMPORT_MAX_FILE_BYTES } from "@/lib/music/library/provider";
import type { LocalMusicImportInput } from "@/lib/music/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_MUSIC_IMPORT_MAX_FILES = 8;
const LOCAL_MUSIC_IMPORT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value
  );
}

function errorStatus(error: string) {
  if (error === "unsupported_audio_format") return 415;
  if (error === "audio_file_too_large" || error === "too_many_files" || error === "music_import_too_large") return 413;
  if (error === "empty_audio_file" || error === "empty_music_import") return 400;
  return 400;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "multipart_form_required" }, { status: 415 });
  }

  const form = await request.formData();
  const inputs: LocalMusicImportInput[] = [];
  let totalBytes = 0;

  for (const entry of form.getAll("files")) {
    if (!isUploadedFile(entry)) continue;
    if (inputs.length >= LOCAL_MUSIC_IMPORT_MAX_FILES) {
      return NextResponse.json({ ok: false, error: "too_many_files", max_files: LOCAL_MUSIC_IMPORT_MAX_FILES }, { status: 413 });
    }
    const bytes = new Uint8Array(await entry.arrayBuffer());
    const size = Number(entry.size || bytes.byteLength || 0);
    totalBytes += size;
    if (totalBytes > LOCAL_MUSIC_IMPORT_MAX_TOTAL_BYTES) {
      return NextResponse.json({ ok: false, error: "music_import_too_large", max_total_bytes: LOCAL_MUSIC_IMPORT_MAX_TOTAL_BYTES }, { status: 413 });
    }
    inputs.push({
      name: entry.name,
      type: entry.type,
      size,
      bytes,
      source: String(form.get("source") || "voice-intake"),
    });
  }

  if (!inputs.length) {
    return NextResponse.json({ ok: false, error: "empty_music_import" }, { status: 400 });
  }

  try {
    const tracks = [];
    for (const input of inputs) {
      tracks.push(await importLocalMusicTrack(input));
    }
    const root = getMusicRuntimeConfig().libraryRoot;
    return NextResponse.json({
      ok: true,
      tracks,
      root,
      importedCount: tracks.length,
      operator_note: `Imported ${tracks.length} audio file(s) to the Local Folder music library.`,
      limits: {
        max_files: LOCAL_MUSIC_IMPORT_MAX_FILES,
        max_file_bytes: LOCAL_MUSIC_IMPORT_MAX_FILE_BYTES,
        max_total_bytes: LOCAL_MUSIC_IMPORT_MAX_TOTAL_BYTES,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "music_import_failed";
    return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
  }
}
