import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("voice-control-kit exposes the FESPA26 reference plan", () => {
  const result = spawnSync("node", ["scripts/voice-control-kit.mjs", "plan"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pritha voice-control kit/);
  assert.match(result.stdout, /FESPA26 local implementation/);
});

test("voice-control-kit copies the reference pack into a child interface folder", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-"));
  try {
    const result = spawnSync(
      "node",
      ["scripts/voice-control-kit.mjs", "copy", "--target", dir],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Copied voice-control reference/);
    const replaced = spawnSync(
      "node",
      ["scripts/voice-control-kit.mjs", "copy", "--target", dir, "--force"],
      { encoding: "utf8" },
    );
    assert.equal(replaced.status, 0, replaced.stderr);
    assert.equal(existsSync(path.join(dir, "interfaces", "realtime-voice", "fespa26-reference", "manifest.json")), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("voice-control-kit resolves sibling targets through PRITHA_AGENT_PARENT", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-parent-"));
  try {
    const result = spawnSync(
      "node",
      ["scripts/voice-control-kit.mjs", "copy", "--target", "sibling:voice-child"],
      {
        encoding: "utf8",
        env: { ...process.env, PRITHA_AGENT_PARENT: parent },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(path.join(parent, "voice-child", "interfaces", "realtime-voice", "fespa26-reference", "manifest.json")), true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("voice-control-kit rejects a symlinked sibling target without writing through it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-parent-"));
  const outside = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-outside-"));
  try {
    symlinkSync(outside, path.join(parent, "voice-child"), "dir");
    const result = spawnSync(
      "node",
      ["scripts/voice-control-kit.mjs", "copy", "--target", "sibling:voice-child"],
      {
        encoding: "utf8",
        env: { ...process.env, PRITHA_AGENT_PARENT: parent },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not a symlink|unsafe/);
    assert.equal(existsSync(path.join(outside, "interfaces")), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("voice-control-kit rejects symlinked destination ancestors inside a sibling agent", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-parent-"));
  const outside = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-outside-"));
  try {
    const child = path.join(parent, "voice-child");
    mkdirSync(child);
    symlinkSync(outside, path.join(child, "interfaces"), "dir");
    const result = spawnSync(
      "node",
      ["scripts/voice-control-kit.mjs", "copy", "--target", "sibling:voice-child"],
      {
        encoding: "utf8",
        env: { ...process.env, PRITHA_AGENT_PARENT: parent },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsafe component/);
    assert.equal(existsSync(path.join(outside, "realtime-voice")), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("voice-control-kit rejects an explicit target below a symlinked existing parent", () => {
  const base = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-base-"));
  const outside = mkdtempSync(path.join(tmpdir(), "pritha-voice-kit-outside-"));
  try {
    const linkedParent = path.join(base, "linked-parent");
    symlinkSync(outside, linkedParent, "dir");
    const result = spawnSync(
      "node",
      ["scripts/voice-control-kit.mjs", "copy", "--target", path.join(linkedParent, "voice-child")],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsafe nearest existing ancestor/);
    assert.equal(existsSync(path.join(outside, "voice-child")), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("Pritha voice-kit alias delegates to the kit command", () => {
  const result = spawnSync("node", ["scripts/pritha.mjs", "voice-kit", "list"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manifest\.json/);
  assert.match(result.stdout, /source\/lib\/openai\/realtime-tools\.ts/);
});
