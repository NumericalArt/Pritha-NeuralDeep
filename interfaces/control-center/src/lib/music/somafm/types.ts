import type {
  PreferredPlaylistOptions,
  SomaFmChannel,
  SomaFmPlaylist,
  SomaFmPlaylistFormat,
  SomaFmPlaylistQuality,
} from "../types";

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function listenersField(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function playlistFormat(value: unknown): SomaFmPlaylistFormat | null {
  return value === "mp3" || value === "aac" || value === "aacp" ? value : null;
}

function playlistQuality(value: unknown): SomaFmPlaylistQuality | null {
  return value === "low" || value === "high" || value === "highest" ? value : null;
}

export function normalizeSomaFmPlaylist(raw: unknown): SomaFmPlaylist | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Partial<SomaFmPlaylist>;
  const url = stringField(value.url);
  const format = playlistFormat(value.format);
  const quality = playlistQuality(value.quality);
  if (!url || !/^https?:\/\//i.test(url) || !format || !quality) return null;
  return { url, format, quality };
}

export function normalizeSomaFmChannel(raw: unknown): SomaFmChannel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Partial<SomaFmChannel>;
  const id = stringField(value.id).replace(/[^A-Za-z0-9_-]/g, "");
  const title = stringField(value.title);
  const playlists = Array.isArray(value.playlists) ? value.playlists.map(normalizeSomaFmPlaylist).filter((item): item is SomaFmPlaylist => Boolean(item)) : [];
  if (!id || !title) return null;

  return {
    id,
    title,
    description: stringField(value.description),
    genre: stringField(value.genre),
    image: stringField(value.image),
    largeimage: stringField(value.largeimage),
    xlimage: stringField(value.xlimage),
    playlists,
    listeners: listenersField(value.listeners),
    lastPlaying: stringField(value.lastPlaying),
    lastPlayingImage: stringField(value.lastPlayingImage),
    lastPlayingArtist: stringField(value.lastPlayingArtist),
    lastPlayingAlbum: stringField(value.lastPlayingAlbum),
    lastPlayingTrack: stringField(value.lastPlayingTrack),
    lastPlayingLabel: stringField(value.lastPlayingLabel),
    lastPlayingCountry: stringField(value.lastPlayingCountry),
    lastPlayingYear: stringField(value.lastPlayingYear),
  };
}

function playlistScore(playlist: SomaFmPlaylist, format: SomaFmPlaylistFormat, quality: SomaFmPlaylistQuality) {
  return playlist.format === format && playlist.quality === quality;
}

export function preferredSomaFmPlaylist(channel: SomaFmChannel, options: PreferredPlaylistOptions = {}) {
  if (!channel.playlists.length) return null;
  const requestedFormat = options.format;
  const requestedQuality = options.quality;

  if (requestedFormat && requestedQuality) {
    const exact = channel.playlists.find((playlist) => playlistScore(playlist, requestedFormat, requestedQuality));
    if (exact) return exact;
  }

  const order: Array<[SomaFmPlaylistFormat, SomaFmPlaylistQuality]> = [
    ["aac", "highest"],
    ["aacp", "highest"],
    ["aac", "high"],
    ["aacp", "high"],
    ["mp3", "highest"],
    ["mp3", "high"],
    ["aac", "low"],
    ["aacp", "low"],
    ["mp3", "low"],
  ];

  if (requestedFormat && !requestedQuality) {
    order.unshift([requestedFormat, "highest"], [requestedFormat, "high"], [requestedFormat, "low"]);
  }
  if (!requestedFormat && requestedQuality) {
    order.unshift(["aac", requestedQuality], ["aacp", requestedQuality], ["mp3", requestedQuality]);
  }

  for (const [format, quality] of order) {
    const found = channel.playlists.find((playlist) => playlistScore(playlist, format, quality));
    if (found) return found;
  }

  return channel.playlists[0] || null;
}
