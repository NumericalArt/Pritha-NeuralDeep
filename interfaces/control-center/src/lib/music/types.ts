export type MusicMode = "off" | "auto" | "on";

export type MusicSource = "somafm" | "library" | "ace-step";

export type MusicSourceSettings = {
  schema: "pritha-music-settings-v1";
  defaultSource: MusicSource;
  somafm: {
    defaultChannelId: string;
  };
  library: {
    repeatMode: "off" | "all";
  };
  aceStep: {
    defaultStyle: string;
  };
  updatedAt: string;
};

export type MusicGenerationStatus = "queued" | "generating" | "complete" | "failed";

export type AceStepGenerateRequest = {
  style: string;
  prompt?: string;
  operatorRequest?: string;
  preserveCurrent?: boolean;
  referenceStyle?: string;
  referencePrompt?: string;
  durationSec?: number;
  bpm?: number;
  keyScale?: string;
  seed?: number;
  forceFresh?: boolean;
};

export type AceStepRemoteTrack = {
  taskId: string;
  fileUrl: string;
  prompt: string;
  sentPrompt: string;
  providerPrompt: string;
  promptWarnings: string[];
  durationSec: number;
  audioBytes: Uint8Array;
  contentType: string;
  metadata?: Record<string, unknown>;
};

export type CachedGeneratedTrack = {
  id: string;
  style: string;
  normalizedStyle: string;
  prompt: string;
  operatorRequest?: string;
  sentPrompt?: string;
  providerPrompt?: string;
  promptWarnings?: string[];
  promptMismatch?: boolean;
  localPath: string;
  localUrl: string;
  durationSec: number;
  createdAt: string;
  aceTaskId: string;
  aceFileUrl: string;
  audioFormat: string;
  sizeBytes: number;
  seed?: number;
  metadata?: Record<string, unknown>;
};

export type PublicGeneratedTrack = Omit<CachedGeneratedTrack, "localPath">;

export type MusicGenerationJob = {
  id: string;
  status: MusicGenerationStatus;
  request: AceStepGenerateRequest & {
    normalizedStyle: string;
    durationSec: number;
  };
  createdAt: string;
  updatedAt: string;
  trackId?: string;
  track?: PublicGeneratedTrack;
  error?: string;
};

export type MusicGenerateResponse = {
  ok: boolean;
  status: "cached" | "queued" | "generating" | "failed";
  track?: PublicGeneratedTrack;
  generationId?: string;
  error?: string;
};

export type MusicStateResponse = {
  ok: boolean;
  generation?: MusicGenerationJob | null;
  latestTrack?: PublicGeneratedTrack | null;
  activeJobs: MusicGenerationJob[];
  error?: string;
};

export type SomaFmPlaylistFormat = "mp3" | "aac" | "aacp";
export type SomaFmPlaylistQuality = "low" | "high" | "highest";

export type PreferredPlaylistOptions = {
  format?: SomaFmPlaylistFormat;
  quality?: SomaFmPlaylistQuality;
};

export type SomaFmPlaylist = {
  url: string;
  format: SomaFmPlaylistFormat;
  quality: SomaFmPlaylistQuality;
};

export type SomaFmChannel = {
  id: string;
  title: string;
  description: string;
  genre: string;
  image: string;
  largeimage: string;
  xlimage: string;
  playlists: SomaFmPlaylist[];
  listeners: number | null;
  lastPlaying: string;
  lastPlayingImage: string;
  lastPlayingArtist: string;
  lastPlayingAlbum: string;
  lastPlayingTrack: string;
  lastPlayingLabel: string;
  lastPlayingCountry: string;
  lastPlayingYear: string;
};

export type SomaFmChannelsResponse = {
  ok: boolean;
  channels: SomaFmChannel[];
  stale: boolean;
  updatedAt?: string;
  error?: string;
};

export type SomaFmPlaybackResponse = {
  ok: boolean;
  channel?: SomaFmChannel;
  playlist?: SomaFmPlaylist;
  playbackUrl?: string;
  candidateUrls?: string[];
  source: "playlist" | "resolved";
  error?: string;
};

export type LocalMusicTrack = {
  id: string;
  title: string;
  fileName: string;
  relativePath: string;
  url: string;
  audioFormat: string;
  sizeBytes: number;
  updatedAt: string;
};

export type LocalMusicImportInput = {
  name: string;
  type?: string;
  size: number;
  bytes: Uint8Array;
  source?: string;
};

export type LocalMusicImportResponse = {
  ok: boolean;
  tracks: LocalMusicTrack[];
  root: string;
  importedCount: number;
  skippedCount?: number;
  operator_note?: string;
  error?: string;
};

export type LocalMusicLibraryResponse = {
  ok: boolean;
  tracks: LocalMusicTrack[];
  root: string;
  error?: string;
};
