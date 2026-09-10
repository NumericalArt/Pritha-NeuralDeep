import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importControlCenterMusicModule } from "./helpers/control-center-ts.mjs";

const { LocalMusicLibraryProvider } = await importControlCenterMusicModule("library/provider.ts");

function testConfig(libraryRoot) {
  return { libraryRoot };
}

test("local library lists supported audio files and skips unsupported files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pritha-library-"));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "calm-track.mp3"), "fake", "utf8");
  await writeFile(path.join(root, "nested", "space_loop.m4a"), "fake", "utf8");
  await writeFile(path.join(root, "notes.txt"), "not audio", "utf8");

  const provider = new LocalMusicLibraryProvider(testConfig(root));
  const tracks = await provider.listTracks();
  assert.equal(tracks.length, 2);
  assert.deepEqual(
    tracks.map((track) => track.audioFormat).sort(),
    ["m4a", "mp3"],
  );
  assert.ok(tracks.every((track) => track.url.startsWith("/api/music/library/tracks/")));
});

test("local library rejects unsafe or unknown track ids", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pritha-library-"));
  await writeFile(path.join(root, "track.mp3"), "fake", "utf8");
  const provider = new LocalMusicLibraryProvider(testConfig(root));

  assert.equal(await provider.resolveTrackFile("../track.mp3"), null);
  assert.equal(await provider.resolveTrackFile("lib_missing"), null);

  const [track] = await provider.listTracks();
  const resolved = await provider.resolveTrackFile(track.id);
  assert.equal(resolved?.track.id, track.id);
  assert.equal(resolved?.path, path.join(root, "track.mp3"));
});
