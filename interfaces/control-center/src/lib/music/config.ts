import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "../pritha-paths";

export type MusicRuntimeConfig = {
  root: string;
  storageRoot: string;
  tracksRoot: string;
  indexPath: string;
  settingsPath: string;
  libraryRoot: string;
  aceStepBaseUrl: string;
  aceStepApiKey: string;
  aceStepModel: string;
  aceStepThinking: boolean;
  audioFormat: "mp3" | "flac" | "opus" | "aac" | "wav" | "wav32";
  defaultDurationSec: number;
  maxDurationSec: number;
  pollIntervalMs: number;
  generationTimeoutMs: number;
  cacheMaxBytes: number;
  cacheMaxTracks: number;
  defaultStyle: string;
  somaFmEnabled: boolean;
  somaFmChannelsUrl: string;
  somaFmFallbackChannelsUrl: string;
  somaFmCachePath: string;
  somaFmMetadataTtlMs: number;
  somaFmTimeoutMs: number;
  somaFmUserAgent: string;
};

let envLoaded = false;

export function resolvePrithaRoot() {
  return resolveTechscopeRoot();
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadMusicRuntimeEnv() {
  if (envLoaded) return;
  envLoaded = true;
  const root = resolvePrithaRoot();
  loadEnvFile(path.join(root, ".env"));
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  if (process.env.PRITHA_STATE_ROOT) {
    loadEnvFile(path.join(resolvePrithaStateRoot(root), "config", "runtime.env"));
  }
  const extraEnvFile = process.env.PRITHA_CONTROL_CENTER_ENV_FILE;
  if (extraEnvFile) loadEnvFile(path.resolve(extraEnvFile));
}

export function musicEnv(name: string, fallback = "") {
  loadMusicRuntimeEnv();
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(musicEnv(name, String(fallback)));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(value, max));
}

function boolEnv(name: string, fallback: boolean) {
  const value = musicEnv(name, fallback ? "true" : "false").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function audioFormat(value: string): MusicRuntimeConfig["audioFormat"] {
  const normalized = value.toLowerCase();
  if (["mp3", "flac", "opus", "aac", "wav", "wav32"].includes(normalized)) {
    return normalized as MusicRuntimeConfig["audioFormat"];
  }
  return "mp3";
}

export function getMusicRuntimeConfig(): MusicRuntimeConfig {
  const root = resolvePrithaRoot();
  const storageRoot = resolvePrithaStatePath("private", "interface-lab", "pritha-control-center", "music");
  const maxDurationSec = numberEnv("ACE_STEP_MAX_DURATION_SEC", 120, 30, 120);
  const defaultStyle = musicEnv("MUSIC_DEFAULT_STYLE", "calm organ ambient instrumental background music");

  return {
    root,
    storageRoot,
    tracksRoot: path.join(storageRoot, "tracks"),
    indexPath: path.join(storageRoot, "index.json"),
    settingsPath: path.join(storageRoot, "settings.json"),
    libraryRoot: path.resolve(musicEnv("MUSIC_LIBRARY_ROOT", path.join(storageRoot, "library"))),
    aceStepBaseUrl: musicEnv("ACE_STEP_BASE_URL", musicEnv("ACESTEP_BASE_URL", "http://127.0.0.1:8001")).replace(/\/$/, ""),
    aceStepApiKey: musicEnv("ACE_STEP_API_KEY", musicEnv("ACESTEP_API_KEY", "")),
    aceStepModel: musicEnv("ACE_STEP_MODEL", musicEnv("ACESTEP_MODEL", "acestep-v15-turbo")),
    aceStepThinking: boolEnv("ACE_STEP_THINKING", true),
    audioFormat: audioFormat(musicEnv("ACE_STEP_AUDIO_FORMAT", "mp3")),
    defaultDurationSec: Math.min(numberEnv("ACE_STEP_DEFAULT_DURATION_SEC", 60, 30, 120), maxDurationSec),
    maxDurationSec,
    pollIntervalMs: numberEnv("ACE_STEP_POLL_INTERVAL_MS", 1000, 250, 10_000),
    generationTimeoutMs: numberEnv("ACE_STEP_GENERATION_TIMEOUT_MS", 120_000, 10_000, 600_000),
    cacheMaxBytes: numberEnv("MUSIC_CACHE_MAX_BYTES", 500 * 1024 * 1024, 10 * 1024 * 1024, 5 * 1024 * 1024 * 1024),
    cacheMaxTracks: numberEnv("MUSIC_CACHE_MAX_TRACKS", 100, 1, 500),
    defaultStyle,
    somaFmEnabled: boolEnv("SOMAFM_ENABLED", true),
    somaFmChannelsUrl: musicEnv("SOMAFM_CHANNELS_URL", "https://api.somafm.com/channels.json"),
    somaFmFallbackChannelsUrl: musicEnv("SOMAFM_FALLBACK_CHANNELS_URL", "https://somafm.com/channels.json"),
    somaFmCachePath: path.join(storageRoot, "somafm-channels-cache.json"),
    somaFmMetadataTtlMs: numberEnv("SOMAFM_METADATA_TTL_MS", 20 * 60_000, 10 * 60_000, 30 * 60_000),
    somaFmTimeoutMs: numberEnv("SOMAFM_TIMEOUT_MS", 9000, 1000, 15_000),
    somaFmUserAgent: musicEnv("SOMAFM_USER_AGENT", "Pritha/1.0 (+local-control-center)"),
  };
}

export function clampMusicDuration(value: unknown, config = getMusicRuntimeConfig()) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return config.defaultDurationSec;
  return Math.max(30, Math.min(Math.round(numeric), config.maxDurationSec));
}
