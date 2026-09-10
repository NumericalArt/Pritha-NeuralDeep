import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMusicRuntimeConfig } from "./config.ts";
import type { MusicSource, MusicSourceSettings } from "./types";

const MUSIC_SOURCE_OPTIONS: MusicSource[] = ["somafm", "library", "ace-step"];

function nowIso() {
  return new Date().toISOString();
}

export function isMusicSource(value: unknown): value is MusicSource {
  return MUSIC_SOURCE_OPTIONS.includes(value as MusicSource);
}

export function normalizeMusicSource(value: unknown, fallback: MusicSource = "somafm"): MusicSource {
  return isMusicSource(value) ? value : fallback;
}

export function defaultMusicSourceSettings(): MusicSourceSettings {
  const config = getMusicRuntimeConfig();
  return {
    schema: "pritha-music-settings-v1",
    defaultSource: normalizeMusicSource(process.env.MUSIC_DEFAULT_SOURCE, "somafm"),
    somafm: {
      defaultChannelId: process.env.SOMAFM_DEFAULT_CHANNEL_ID || "groovesalad",
    },
    library: {
      repeatMode: "all",
    },
    aceStep: {
      defaultStyle: config.defaultStyle,
    },
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeMusicSourceSettings(raw: unknown): MusicSourceSettings {
  const defaults = defaultMusicSourceSettings();
  const value = typeof raw === "object" && raw !== null ? (raw as Partial<MusicSourceSettings>) : {};
  const somafm = typeof value.somafm === "object" && value.somafm !== null ? value.somafm : defaults.somafm;
  const library = typeof value.library === "object" && value.library !== null ? value.library : defaults.library;
  const aceStep = typeof value.aceStep === "object" && value.aceStep !== null ? value.aceStep : defaults.aceStep;
  const repeatMode = library.repeatMode === "off" ? "off" : "all";

  return {
    schema: "pritha-music-settings-v1",
    defaultSource: normalizeMusicSource(value.defaultSource, defaults.defaultSource),
    somafm: {
      defaultChannelId: String(somafm.defaultChannelId || defaults.somafm.defaultChannelId).replace(/[^A-Za-z0-9_-]/g, "") || defaults.somafm.defaultChannelId,
    },
    library: {
      repeatMode,
    },
    aceStep: {
      defaultStyle: String(aceStep.defaultStyle || defaults.aceStep.defaultStyle).replace(/\s+/g, " ").trim() || defaults.aceStep.defaultStyle,
    },
    updatedAt: String(value.updatedAt || defaults.updatedAt),
  };
}

export async function getMusicSourceSettings() {
  const config = getMusicRuntimeConfig();
  if (!existsSync(config.settingsPath)) return defaultMusicSourceSettings();
  try {
    return normalizeMusicSourceSettings(JSON.parse(await readFile(config.settingsPath, "utf8")));
  } catch {
    return defaultMusicSourceSettings();
  }
}

export async function updateMusicSourceSettings(patch: Partial<MusicSourceSettings>) {
  const config = getMusicRuntimeConfig();
  const current = await getMusicSourceSettings();
  const next = normalizeMusicSourceSettings({ ...current, ...patch, updatedAt: nowIso() });
  await mkdir(path.dirname(config.settingsPath), { recursive: true });
  await writeFile(config.settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
