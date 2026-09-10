import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importControlCenterMusicModule } from "./helpers/control-center-ts.mjs";

const { SomaFmApiClient } = await importControlCenterMusicModule("somafm/api-client.ts");
const { parseM3u, parsePls } = await importControlCenterMusicModule("somafm/playlists.ts");
const { normalizeSomaFmChannel, preferredSomaFmPlaylist } = await importControlCenterMusicModule("somafm/types.ts");

function testConfig(cachePath) {
  return {
    somaFmEnabled: true,
    somaFmChannelsUrl: "https://api.somafm.test/channels.json",
    somaFmFallbackChannelsUrl: "https://somafm.test/channels.json",
    somaFmCachePath: cachePath,
    somaFmMetadataTtlMs: 10 * 60_000,
    somaFmTimeoutMs: 1000,
    somaFmUserAgent: "PrithaTest/1.0",
  };
}

const sampleChannel = {
  id: "groovesalad",
  title: "Groove Salad",
  description: "A nicely chilled plate of ambient beats.",
  genre: "ambient|electronic",
  image: "https://api.somafm.com/logos/120/groovesalad120.png",
  largeimage: "https://api.somafm.com/logos/256/groovesalad256.png",
  xlimage: "https://api.somafm.com/logos/512/groovesalad512.png",
  playlists: [
    { url: "https://api.somafm.com/groovesalad.pls", format: "mp3", quality: "highest" },
    { url: "https://api.somafm.com/groovesalad130.pls", format: "aac", quality: "highest" },
    { url: "https://api.somafm.com/groovesalad64.pls", format: "aacp", quality: "high" },
  ],
  listeners: "1234",
  lastPlaying: "Artist - Track",
};

test("normalizes SomaFM channel objects and listener values", () => {
  const channel = normalizeSomaFmChannel(sampleChannel);
  assert.equal(channel?.id, "groovesalad");
  assert.equal(channel?.listeners, 1234);
  assert.equal(channel?.playlists.length, 3);

  const numericListeners = normalizeSomaFmChannel({ ...sampleChannel, id: "dronezone", listeners: 42 });
  assert.equal(numericListeners?.listeners, 42);
});

test("prefers AAC/AACP highest and falls back to MP3", () => {
  const channel = normalizeSomaFmChannel(sampleChannel);
  assert.ok(channel);
  assert.equal(preferredSomaFmPlaylist(channel)?.format, "aac");
  assert.equal(preferredSomaFmPlaylist(channel)?.quality, "highest");

  const mp3Only = normalizeSomaFmChannel({
    ...sampleChannel,
    id: "mp3only",
    playlists: [{ url: "https://api.somafm.com/mp3only.pls", format: "mp3", quality: "highest" }],
  });
  assert.ok(mp3Only);
  assert.equal(preferredSomaFmPlaylist(mp3Only)?.format, "mp3");
});

test("channel without playlists has no preferred playlist", () => {
  const channel = normalizeSomaFmChannel({ ...sampleChannel, id: "empty", playlists: [] });
  assert.ok(channel);
  assert.equal(preferredSomaFmPlaylist(channel), null);
});

test("invalid JSON response returns an error without channels", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pritha-somafm-"));
  const client = new SomaFmApiClient({
    config: testConfig(path.join(dir, "cache.json")),
    fetchImpl: async () => new Response("{", { status: 200 }),
  });
  const result = await client.getChannels(true);
  assert.equal(result.channels.length, 0);
  assert.equal(result.stale, false);
  assert.ok(result.error);
});

test("network error falls back to stale metadata cache", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pritha-somafm-"));
  const cachePath = path.join(dir, "cache.json");
  const channel = normalizeSomaFmChannel(sampleChannel);
  assert.ok(channel);
  await writeFile(
    cachePath,
    JSON.stringify({
      schema: "pritha-somafm-cache-v1",
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      channels: [channel],
    }),
    "utf8",
  );
  const client = new SomaFmApiClient({
    config: testConfig(cachePath),
    fetchImpl: async () => {
      throw new Error("network_down");
    },
  });
  const result = await client.getChannels(true);
  assert.equal(result.stale, true);
  assert.equal(result.channels[0].id, "groovesalad");
  assert.equal(result.error, "network_down");
});

test("parsePls returns HTTPS URLs before HTTP URLs", () => {
  assert.deepEqual(parsePls("[playlist]\nFile1=http://example.test/a\nFile2=https://example.test/b\n"), [
    "https://example.test/b",
    "http://example.test/a",
  ]);
});

test("parseM3u ignores comments and empty lines", () => {
  assert.deepEqual(parseM3u("#EXTM3U\n\n# comment\nhttps://example.test/live\n"), ["https://example.test/live"]);
});
