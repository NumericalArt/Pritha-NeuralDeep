import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("transcribe-media purges temp artifacts and emits neutral status", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-media-"));
  const sample = path.join(dir, "sample.wav");
  writeFileSync(sample, Buffer.from("not a real wav; mock mode avoids decoding"));

  const result = spawnSync("node", ["scripts/transcribe-media.mjs", sample, "--language", "en", "--json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PRITHA_TRANSCRIBE_MEDIA_MOCK: "1",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.anonymous_source_id, /^\d{4}-\d{2}-\d{2}-media-[a-f0-9]+$/);
  assert.equal(payload.retention_status, "source-purged");
  assert.equal(payload.transcription.language, "en");
  assert.equal(payload.transcription.retained, false);
  assert.equal(payload.deletion.temp_workspace_purged, true);
  assert.equal(payload.deletion.source_payload_persisted, false);
  assert.equal(payload.source, undefined);
  assert.equal(payload.source_json, undefined);
  assert.equal(payload.transcript_md, undefined);
  assert.equal(existsSync(path.join(process.cwd(), "01_sources", "raw", "media", payload.anonymous_source_id)), false);
  assert.equal(existsSync(path.join(process.cwd(), ".queue", "media-processing", payload.anonymous_source_id)), false);

  rmSync(dir, { recursive: true, force: true });
});
