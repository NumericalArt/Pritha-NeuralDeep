import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMusicRuntimeConfig, type MusicRuntimeConfig } from "./config";
import { normalizeMusicStyleKey } from "./prompt-builder";
import type { AceStepGenerateRequest, AceStepRemoteTrack, CachedGeneratedTrack, PublicGeneratedTrack } from "./types";

type CacheIndex = {
  schema: "pritha-generated-music-cache-v1";
  updatedAt: string;
  tracks: CachedGeneratedTrack[];
};

function nowIso() {
  return new Date().toISOString();
}

function extensionForContentType(contentType: string, fallback: string) {
  if (/wav/i.test(contentType)) return "wav";
  if (/flac/i.test(contentType)) return "flac";
  if (/opus/i.test(contentType)) return "opus";
  if (/aac/i.test(contentType)) return "aac";
  if (/mpeg|mp3/i.test(contentType)) return "mp3";
  return fallback === "wav32" ? "wav" : fallback;
}

export function publicGeneratedTrack(track: CachedGeneratedTrack): PublicGeneratedTrack {
  const { localPath: _localPath, ...publicTrack } = track;
  return publicTrack;
}

export class GeneratedMusicCache {
  private config: MusicRuntimeConfig;

  constructor(config = getMusicRuntimeConfig()) {
    this.config = config;
  }

  private async ensureDirs() {
    await mkdir(this.config.tracksRoot, { recursive: true });
  }

  private emptyIndex(): CacheIndex {
    return {
      schema: "pritha-generated-music-cache-v1",
      updatedAt: nowIso(),
      tracks: [],
    };
  }

  async readIndex(): Promise<CacheIndex> {
    await this.ensureDirs();
    if (!existsSync(this.config.indexPath)) return this.emptyIndex();
    try {
      const parsed = JSON.parse(await readFile(this.config.indexPath, "utf8")) as CacheIndex;
      if (parsed.schema !== "pritha-generated-music-cache-v1" || !Array.isArray(parsed.tracks)) return this.emptyIndex();
      return parsed;
    } catch {
      return this.emptyIndex();
    }
  }

  private async writeIndex(index: CacheIndex) {
    await this.ensureDirs();
    index.updatedAt = nowIso();
    await writeFile(this.config.indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  }

  async listTracks() {
    const index = await this.readIndex();
    return index.tracks;
  }

  async getTrack(id: string) {
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
    if (!safeId) return null;
    const index = await this.readIndex();
    return index.tracks.find((track) => track.id === safeId) || null;
  }

  async findLatestByStyle(style: string) {
    const normalizedStyle = normalizeMusicStyleKey(style);
    const tracks = await this.listTracks();
    return tracks
      .filter((track) => track.normalizedStyle === normalizedStyle && existsSync(track.localPath))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
  }

  async saveTrack(request: AceStepGenerateRequest, remote: AceStepRemoteTrack) {
    await this.ensureDirs();
    const id = `track_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const audioFormat = extensionForContentType(remote.contentType, this.config.audioFormat);
    const localPath = path.join(this.config.tracksRoot, `${id}.${audioFormat}`);
    await writeFile(localPath, remote.audioBytes);
    const createdAt = nowIso();
    const track: CachedGeneratedTrack = {
      id,
      style: request.style,
      normalizedStyle: normalizeMusicStyleKey(request.style),
      prompt: remote.sentPrompt || remote.prompt,
      operatorRequest: request.operatorRequest,
      sentPrompt: remote.sentPrompt || remote.prompt,
      providerPrompt: remote.providerPrompt,
      promptWarnings: remote.promptWarnings,
      promptMismatch: Boolean(remote.promptWarnings?.length),
      localPath,
      localUrl: `/api/music/tracks/${encodeURIComponent(id)}`,
      durationSec: remote.durationSec,
      createdAt,
      aceTaskId: remote.taskId,
      aceFileUrl: remote.fileUrl,
      audioFormat,
      sizeBytes: remote.audioBytes.byteLength,
      seed: request.seed,
      metadata: remote.metadata,
    };
    const index = await this.readIndex();
    index.tracks = [track, ...index.tracks.filter((item) => item.id !== track.id)];
    await this.writeIndex(index);
    void this.prune().catch(() => undefined);
    return track;
  }

  async resolveTrackFile(id: string) {
    const track = await this.getTrack(id);
    if (!track) return null;
    const fullPath = path.resolve(track.localPath);
    const tracksRoot = path.resolve(this.config.tracksRoot);
    if (fullPath !== tracksRoot && !fullPath.startsWith(`${tracksRoot}${path.sep}`)) return null;
    if (!existsSync(fullPath)) return null;
    return {
      track,
      path: fullPath,
    };
  }

  async prune() {
    const index = await this.readIndex();
    const tracks = [...index.tracks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const kept: CachedGeneratedTrack[] = [];
    const removed: CachedGeneratedTrack[] = [];
    let bytes = 0;

    for (const track of tracks) {
      let size = track.sizeBytes;
      try {
        size = (await stat(track.localPath)).size;
      } catch {
        removed.push(track);
        continue;
      }
      if (kept.length >= this.config.cacheMaxTracks || bytes + size > this.config.cacheMaxBytes) {
        removed.push(track);
        continue;
      }
      bytes += size;
      kept.push({ ...track, sizeBytes: size });
    }

    for (const track of removed) {
      await rm(track.localPath, { force: true }).catch(() => undefined);
    }

    if (removed.length) await this.writeIndex({ ...index, tracks: kept });
  }
}
