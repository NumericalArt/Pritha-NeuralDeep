import { getMusicRuntimeConfig, type MusicRuntimeConfig } from "../config.ts";
import type { PreferredPlaylistOptions, SomaFmChannel } from "../types";
import { SomaFmApiClient } from "./api-client.ts";
import { parsePlaylistByUrl } from "./playlists.ts";
import { preferredSomaFmPlaylist } from "./types.ts";

export class SomaFmProvider {
  private client: SomaFmApiClient;
  private config: MusicRuntimeConfig;

  constructor(options: { client?: SomaFmApiClient; config?: MusicRuntimeConfig } = {}) {
    this.config = options.config || getMusicRuntimeConfig();
    this.client = options.client || new SomaFmApiClient({ config: this.config });
  }

  async getChannels(forceRefresh = false): Promise<SomaFmChannel[]> {
    const result = await this.client.getChannels(forceRefresh);
    return result.channels;
  }

  async getChannelsResult(forceRefresh = false) {
    return await this.client.getChannels(forceRefresh);
  }

  async getChannelById(id: string) {
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
    if (!safeId) return null;
    const channels = await this.getChannels();
    return channels.find((channel) => channel.id === safeId) || null;
  }

  getPreferredPlaylist(channel: SomaFmChannel, options: PreferredPlaylistOptions = {}) {
    return preferredSomaFmPlaylist(channel, options);
  }

  async getPlaybackUrl(channelId: string, options: PreferredPlaylistOptions = {}) {
    const channel = await this.getChannelById(channelId);
    if (!channel) throw new Error("somafm_channel_not_found");
    const playlist = this.getPreferredPlaylist(channel, options);
    if (!playlist) throw new Error("somafm_channel_without_playlists");
    return playlist.url;
  }

  async getPlayback(channelId: string, options: PreferredPlaylistOptions & { resolvePlaylist?: boolean } = {}) {
    const channel = await this.getChannelById(channelId);
    if (!channel) {
      return {
        ok: false,
        source: "playlist" as const,
        error: "somafm_channel_not_found",
      };
    }
    const playlist = this.getPreferredPlaylist(channel, options);
    if (!playlist) {
      return {
        ok: false,
        channel,
        source: "playlist" as const,
        error: "somafm_channel_without_playlists",
      };
    }

    if (!options.resolvePlaylist) {
      return {
        ok: true,
        channel,
        playlist,
        playbackUrl: playlist.url,
        candidateUrls: channel.playlists.map((item) => item.url),
        source: "playlist" as const,
      };
    }

    try {
      const content = await this.client.fetchPlaylistText(playlist.url);
      const urls = parsePlaylistByUrl(playlist.url, content);
      return {
        ok: true,
        channel,
        playlist,
        playbackUrl: urls[0] || playlist.url,
        candidateUrls: urls.length ? urls : channel.playlists.map((item) => item.url),
        source: urls.length ? ("resolved" as const) : ("playlist" as const),
      };
    } catch (error) {
      return {
        ok: true,
        channel,
        playlist,
        playbackUrl: playlist.url,
        candidateUrls: channel.playlists.map((item) => item.url),
        source: "playlist" as const,
        error: error instanceof Error ? error.message : "somafm_playlist_resolve_failed",
      };
    }
  }
}
