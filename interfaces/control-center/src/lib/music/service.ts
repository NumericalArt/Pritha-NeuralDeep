import { AceStepClient } from "./ace-step-client";
import { GeneratedMusicCache, publicGeneratedTrack } from "./cache";
import { getMusicRuntimeConfig } from "./config";
import { LocalMusicLibraryProvider } from "./library/provider";
import { MusicGenerationQueue } from "./queue";
import { getMusicSourceSettings, updateMusicSourceSettings } from "./settings";
import { SomaFmProvider } from "./somafm/provider";
import type { AceStepGenerateRequest, LocalMusicImportInput, MusicGenerateResponse, MusicSourceSettings, MusicStateResponse, PreferredPlaylistOptions } from "./types";

const cache = new GeneratedMusicCache();
const client = new AceStepClient();
const somaFmProvider = new SomaFmProvider();
const libraryProvider = new LocalMusicLibraryProvider();
const queue = new MusicGenerationQueue(async (request) => {
  const remote = await client.generateTrack(request);
  return await cache.saveTrack(request, remote);
});

function hasPromptSpecifics(request: AceStepGenerateRequest) {
  return Boolean(
    request.prompt?.trim() ||
      request.operatorRequest?.trim() ||
      request.referenceStyle?.trim() ||
      request.referencePrompt?.trim() ||
      request.preserveCurrent,
  );
}

export async function requestGeneratedMusic(request: AceStepGenerateRequest): Promise<MusicGenerateResponse> {
  const config = getMusicRuntimeConfig();
  const style = String(request.style || config.defaultStyle).trim() || config.defaultStyle;
  const latest = request.forceFresh || hasPromptSpecifics(request) ? null : await cache.findLatestByStyle(style);
  const job = queue.enqueue({ ...request, style });

  if (latest) {
    return {
      ok: true,
      status: "cached",
      track: publicGeneratedTrack(latest),
      generationId: job.id,
    };
  }

  return {
    ok: true,
    status: job.status === "generating" ? "generating" : "queued",
    generationId: job.id,
  };
}

export async function getMusicState(params: { generationId?: string; style?: string } = {}): Promise<MusicStateResponse> {
  const generation = params.generationId ? queue.getJob(params.generationId) : null;
  const latest = params.style ? await cache.findLatestByStyle(params.style) : null;
  return {
    ok: true,
    generation,
    latestTrack: latest ? publicGeneratedTrack(latest) : null,
    activeJobs: queue.activeJobs(),
  };
}

export async function getMusicHealth() {
  const config = getMusicRuntimeConfig();
  const healthy = await client.health();
  let models: string[] = [];
  if (healthy) {
    models = await client.listModels().catch(() => []);
  }
  return {
    ok: true,
    aceStep: {
      healthy,
      baseUrl: config.aceStepBaseUrl,
      model: config.aceStepModel,
      models,
      apiKeyConfigured: Boolean(config.aceStepApiKey),
    },
    cache: {
      storageRoot: "private/interface-lab/pritha-control-center/music",
      maxTracks: config.cacheMaxTracks,
      maxBytes: config.cacheMaxBytes,
    },
    sources: {
      default: (await getMusicSourceSettings()).defaultSource,
      somafm: {
        enabled: config.somaFmEnabled,
        metadataTtlMs: config.somaFmMetadataTtlMs,
      },
      library: {
        root: "private/interface-lab/pritha-control-center/music/library",
      },
    },
  };
}

export async function getCachedMusicTrack(id: string) {
  return await cache.resolveTrackFile(id);
}

export async function getMusicSettings() {
  return await getMusicSourceSettings();
}

export async function saveMusicSettings(patch: Partial<MusicSourceSettings>) {
  return await updateMusicSourceSettings(patch);
}

export async function getSomaFmChannels(forceRefresh = false) {
  const result = await somaFmProvider.getChannelsResult(forceRefresh);
  return {
    ok: !result.error || result.channels.length > 0,
    channels: result.channels,
    stale: result.stale,
    updatedAt: result.updatedAt,
    error: result.error,
  };
}

export async function getSomaFmPlaybackUrl(channelId: string, options: PreferredPlaylistOptions & { resolvePlaylist?: boolean } = {}) {
  return await somaFmProvider.getPlayback(channelId, options);
}

export async function getLocalMusicLibrary() {
  const config = getMusicRuntimeConfig();
  return {
    ok: true,
    tracks: await libraryProvider.listTracks(),
    root: config.libraryRoot,
  };
}

export async function importLocalMusicTrack(input: LocalMusicImportInput) {
  return await libraryProvider.importTrack(input);
}

export async function getLocalMusicTrack(id: string) {
  return await libraryProvider.resolveTrackFile(id);
}

export function localMusicContentType(format: string) {
  return libraryProvider.contentType(format);
}
