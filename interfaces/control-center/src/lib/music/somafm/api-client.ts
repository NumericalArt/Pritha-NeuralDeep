import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMusicRuntimeConfig, type MusicRuntimeConfig } from "../config.ts";
import type { SomaFmChannel } from "../types";
import { normalizeSomaFmChannel } from "./types.ts";

type SomaFmCacheFile = {
  schema: "pritha-somafm-cache-v1";
  updatedAt: string;
  channels: SomaFmChannel[];
};

export type SomaFmFetchResult = {
  channels: SomaFmChannel[];
  stale: boolean;
  updatedAt?: string;
  error?: string;
};

export type SomaFmApiClientOptions = {
  config?: MusicRuntimeConfig;
  fetchImpl?: typeof fetch;
};

function nowIso() {
  return new Date().toISOString();
}

function cacheIsFresh(cache: SomaFmCacheFile, ttlMs: number) {
  const updated = Date.parse(cache.updatedAt);
  return Number.isFinite(updated) && Date.now() - updated < ttlMs;
}

function normalizeChannelsPayload(raw: unknown) {
  if (typeof raw !== "object" || raw === null) throw new Error("somafm_invalid_json");
  const channels = (raw as { channels?: unknown }).channels;
  if (!Array.isArray(channels)) throw new Error("somafm_channels_missing");
  const normalized = channels.map(normalizeSomaFmChannel).filter((item): item is SomaFmChannel => Boolean(item));
  if (!normalized.length) throw new Error("somafm_channels_empty");
  return normalized;
}

export class SomaFmApiClient {
  private config: MusicRuntimeConfig;
  private fetchImpl: typeof fetch;

  constructor(options: SomaFmApiClientOptions = {}) {
    this.config = options.config || getMusicRuntimeConfig();
    this.fetchImpl = options.fetchImpl || fetch;
  }

  private async readCache(): Promise<SomaFmCacheFile | null> {
    if (!existsSync(this.config.somaFmCachePath)) return null;
    try {
      const parsed = JSON.parse(await readFile(this.config.somaFmCachePath, "utf8")) as SomaFmCacheFile;
      if (parsed.schema !== "pritha-somafm-cache-v1" || !Array.isArray(parsed.channels)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeCache(channels: SomaFmChannel[]) {
    const cache: SomaFmCacheFile = {
      schema: "pritha-somafm-cache-v1",
      updatedAt: nowIso(),
      channels,
    };
    await mkdir(path.dirname(this.config.somaFmCachePath), { recursive: true });
    await writeFile(this.config.somaFmCachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    return cache;
  }

  private async fetchJson(url: string) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.somaFmTimeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          headers: { "User-Agent": this.config.somaFmUserAgent },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`somafm_http_${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("somafm_network_error");
  }

  async getChannels(forceRefresh = false): Promise<SomaFmFetchResult> {
    if (!this.config.somaFmEnabled) {
      return {
        channels: [],
        stale: false,
        error: "somafm_disabled",
      };
    }

    const cache = await this.readCache();
    if (!forceRefresh && cache && cacheIsFresh(cache, this.config.somaFmMetadataTtlMs)) {
      return { channels: cache.channels, stale: false, updatedAt: cache.updatedAt };
    }

    const urls = [this.config.somaFmChannelsUrl, this.config.somaFmFallbackChannelsUrl].filter(Boolean);
    let lastError = "somafm_network_error";
    for (const url of urls) {
      try {
        const raw = await this.fetchJson(url);
        const channels = normalizeChannelsPayload(raw);
        const saved = await this.writeCache(channels);
        return { channels, stale: false, updatedAt: saved.updatedAt };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "somafm_network_error";
      }
    }

    if (cache?.channels.length) {
      return {
        channels: cache.channels,
        stale: true,
        updatedAt: cache.updatedAt,
        error: lastError,
      };
    }
    return { channels: [], stale: false, error: lastError };
  }

  async fetchPlaylistText(url: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.somaFmTimeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: { "User-Agent": this.config.somaFmUserAgent },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`somafm_playlist_http_${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }
}
