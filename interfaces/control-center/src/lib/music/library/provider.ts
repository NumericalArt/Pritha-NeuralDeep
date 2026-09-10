import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMusicRuntimeConfig, type MusicRuntimeConfig } from "../config.ts";
import type { LocalMusicImportInput, LocalMusicTrack } from "../types";

const AUDIO_FORMATS = new Map([
  [".mp3", "mp3"],
  [".m4a", "m4a"],
  [".aac", "aac"],
  [".wav", "wav"],
  [".flac", "flac"],
  [".ogg", "ogg"],
  [".opus", "opus"],
]);
const IMPORT_FOLDER = "voice-intake";
export const LOCAL_MUSIC_IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024;

function trackId(relativePath: string) {
  return `lib_${createHash("sha256").update(relativePath).digest("hex").slice(0, 24)}`;
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || fileName;
}

function safeImportFileName(value: string) {
  const basename = path.basename(String(value || "audio").replace(/\\/g, "/"));
  const cleaned = basename.replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "audio";
}

function importedFileName(originalName: string, format: string) {
  const ext = `.${format === "m4a" ? "m4a" : format}`;
  const base = safeImportFileName(originalName);
  const stem = base.replace(/\.[^.]+$/, "").slice(0, 80).trim() || "audio";
  return `${stem}-${randomUUID().replace(/-/g, "").slice(0, 8)}${ext}`;
}

function safeRelativePath(root: string, fullPath: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(fullPath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  return path.relative(resolvedRoot, resolvedPath);
}

function audioFormatForFileName(fileName: string) {
  return AUDIO_FORMATS.get(path.extname(fileName).toLowerCase()) || "";
}

export class LocalMusicLibraryProvider {
  private config: MusicRuntimeConfig;

  constructor(config = getMusicRuntimeConfig()) {
    this.config = config;
  }

  async ensureRoot() {
    await mkdir(this.config.libraryRoot, { recursive: true });
  }

  isSupportedAudioFileName(fileName: string) {
    return Boolean(audioFormatForFileName(fileName));
  }

  private async walk(dir: string, depth = 0): Promise<string[]> {
    if (depth > 6) return [];
    const rows = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const row of rows) {
      if (row.name.startsWith(".")) continue;
      const fullPath = path.join(dir, row.name);
      if (row.isDirectory()) {
        files.push(...(await this.walk(fullPath, depth + 1)));
      } else if (row.isFile() && AUDIO_FORMATS.has(path.extname(row.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
    return files;
  }

  async listTracks(): Promise<LocalMusicTrack[]> {
    await this.ensureRoot();
    const files = await this.walk(this.config.libraryRoot);
    const tracks = await Promise.all(
      files.map(async (fullPath) => {
        const relativePath = safeRelativePath(this.config.libraryRoot, fullPath);
        if (!relativePath) return null;
        const fileStat = await stat(fullPath).catch(() => null);
        if (!fileStat?.isFile()) return null;
        const fileName = path.basename(fullPath);
        const audioFormat = AUDIO_FORMATS.get(path.extname(fileName).toLowerCase());
        if (!audioFormat) return null;
        const id = trackId(relativePath);
        return {
          id,
          title: titleFromFileName(fileName),
          fileName,
          relativePath,
          url: `/api/music/library/tracks/${encodeURIComponent(id)}`,
          audioFormat,
          sizeBytes: fileStat.size,
          updatedAt: fileStat.mtime.toISOString(),
        };
      }),
    );
    return tracks
      .filter((track): track is LocalMusicTrack => Boolean(track))
      .sort((first, second) => first.relativePath.localeCompare(second.relativePath));
  }

  async getTrack(id: string) {
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
    if (!safeId) return null;
    const tracks = await this.listTracks();
    return tracks.find((track) => track.id === safeId) || null;
  }

  async resolveTrackFile(id: string) {
    const track = await this.getTrack(id);
    if (!track) return null;
    const fullPath = path.resolve(this.config.libraryRoot, track.relativePath);
    const relativePath = safeRelativePath(this.config.libraryRoot, fullPath);
    if (!relativePath || relativePath !== track.relativePath) return null;
    if (!existsSync(fullPath)) return null;
    return { track, path: fullPath };
  }

  async importTrack(input: LocalMusicImportInput): Promise<LocalMusicTrack> {
    const originalName = safeImportFileName(input.name);
    const audioFormat = audioFormatForFileName(originalName);
    if (!audioFormat) throw new Error("unsupported_audio_format");
    const size = Number(input.size || input.bytes?.byteLength || 0);
    if (!Number.isFinite(size) || size <= 0) throw new Error("empty_audio_file");
    if (size > LOCAL_MUSIC_IMPORT_MAX_FILE_BYTES) throw new Error("audio_file_too_large");

    await this.ensureRoot();
    const importDir = path.join(this.config.libraryRoot, IMPORT_FOLDER);
    await mkdir(importDir, { recursive: true });
    const targetName = importedFileName(originalName, audioFormat);
    const targetPath = path.join(importDir, targetName);
    const relativePath = safeRelativePath(this.config.libraryRoot, targetPath);
    if (!relativePath) throw new Error("unsafe_audio_target_path");

    await writeFile(targetPath, input.bytes);
    const fileStat = await stat(targetPath);
    const track: LocalMusicTrack = {
      id: trackId(relativePath),
      title: titleFromFileName(targetName),
      fileName: targetName,
      relativePath,
      url: `/api/music/library/tracks/${encodeURIComponent(trackId(relativePath))}`,
      audioFormat,
      sizeBytes: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
    };
    return track;
  }

  contentType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "flac") return "audio/flac";
    if (format === "ogg") return "audio/ogg";
    if (format === "opus") return "audio/opus";
    if (format === "aac") return "audio/aac";
    if (format === "m4a") return "audio/mp4";
    return "audio/mpeg";
  }
}
