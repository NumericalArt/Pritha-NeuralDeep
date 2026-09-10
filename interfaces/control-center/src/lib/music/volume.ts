import type { MusicSource } from "./types";

export type MusicMode = "off" | "auto" | "on";

export const MAX_MUSIC_USER_VOLUME = 3;
export const MAX_MUSIC_LEVEL_PERCENT = 100;
export const MUSIC_NORMAL_DB = -18;
export const MUSIC_DUCK_DB = -32;
export const MUSIC_OFF_DB = -80;
export const MUSIC_NORMAL_GAIN = dbToGain(MUSIC_NORMAL_DB);

export type MusicSourceCapabilities = {
  source: MusicSource | "somafm-decoded" | "unknown";
  programmaticVolume: boolean;
  ducking: boolean;
  externalStream: boolean;
};

export type MusicDuckingInput = {
  controlEnabled: boolean;
  mode: MusicMode;
  agentBusy: boolean;
  error?: string;
  assistantSpeaking: boolean;
  userSpeaking: boolean;
  source?: MusicSource | string;
};

export type MusicDuckingSnapshot = {
  audible: boolean;
  ducking: boolean;
  duckingGain: number;
  duckingSupported: boolean;
  externalStream: boolean;
};

export function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

export function musicSourceCapabilities(source: unknown): MusicSourceCapabilities {
  const normalized: MusicSource | "somafm-decoded" | "unknown" =
    source === "somafm-decoded"
      ? "somafm-decoded"
      : source === "somafm" || source === "library" || source === "ace-step"
        ? source
        : "unknown";
  const externalStream = normalized === "somafm";
  return {
    source: normalized,
    programmaticVolume: !externalStream,
    ducking: true,
    externalStream,
  };
}

export function musicDuckingGainToElementVolumeRatio(gain: unknown) {
  const numeric = Number(gain);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.min(numeric / MUSIC_NORMAL_GAIN, 1));
}

export function normalizeMusicUserVolume(value: unknown, fallback = 0.8) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(numeric, MAX_MUSIC_USER_VOLUME));
}

export function normalizeMusicLevelPercent(value: unknown, fallback = Math.round((0.8 / MAX_MUSIC_USER_VOLUME) * 100)) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(numeric, MAX_MUSIC_LEVEL_PERCENT));
}

export function musicPercentToUserVolume(percent: unknown) {
  return normalizeMusicUserVolume((normalizeMusicLevelPercent(percent) / MAX_MUSIC_LEVEL_PERCENT) * MAX_MUSIC_USER_VOLUME);
}

export function musicUserVolumeToPercent(volume: unknown) {
  return Math.round((normalizeMusicUserVolume(volume) / MAX_MUSIC_USER_VOLUME) * MAX_MUSIC_LEVEL_PERCENT);
}

export function musicUserVolumeToElementVolume(volume: unknown) {
  return Math.max(0, Math.min(normalizeMusicUserVolume(volume) / MAX_MUSIC_USER_VOLUME, 1));
}

export function musicControlVolumeArgToUserVolume(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return normalizeMusicUserVolume(value);
  if (numeric > 0 && numeric <= 2) return normalizeMusicUserVolume((numeric / 2) * MAX_MUSIC_USER_VOLUME);
  if (numeric > 2 && numeric <= MAX_MUSIC_USER_VOLUME) return normalizeMusicUserVolume(numeric);
  return musicPercentToUserVolume(numeric);
}

export function computeMusicDucking(input: MusicDuckingInput): MusicDuckingSnapshot {
  const capabilities = musicSourceCapabilities(input.source);
  const audible =
    input.controlEnabled &&
    !input.error &&
    (input.mode === "on" || (input.mode === "auto" && input.agentBusy));
  const ducking = audible && capabilities.ducking && (input.assistantSpeaking || input.userSpeaking);
  return {
    audible,
    ducking,
    duckingGain: audible ? dbToGain(ducking ? MUSIC_DUCK_DB : MUSIC_NORMAL_DB) : 0,
    duckingSupported: capabilities.ducking,
    externalStream: capabilities.externalStream,
  };
}

export function computeMusicOutputGain(input: MusicDuckingInput & { userVolume: number }) {
  const sourceVolume = normalizeMusicUserVolume(input.userVolume);
  const ducking = computeMusicDucking(input);
  const capabilities = musicSourceCapabilities(input.source);
  return {
    ...ducking,
    sourceVolume,
    outputGain: sourceVolume * ducking.duckingGain,
    programmaticVolume: capabilities.programmaticVolume,
  };
}
