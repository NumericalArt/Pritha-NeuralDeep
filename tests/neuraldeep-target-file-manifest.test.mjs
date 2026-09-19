import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureTargetFileManifest, diffTargetFileManifests } from "../scripts/neuraldeep/target-file-manifest.mjs";

function fixture(t) {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-manifest-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "child");
  mkdirSync(root);
  return { root, parent, capture: (options = {}) => captureTargetFileManifest(root, { allowedParent: parent, ...options }) };
}

test("checkpoint detects shell heredoc and untracked additions, edits and deletions without Git", t => {
  const { root, capture } = fixture(t);
  writeFileSync(path.join(root, "existing.mjs"), "before");
  writeFileSync(path.join(root, "deleted.mjs"), "gone");
  const before = capture();
  const run = spawnSync("/bin/sh", ["-c", "cat > untracked.mjs <<'CODE'\nconsole.log('hello')\nCODE\n"], { cwd: root });
  assert.equal(run.status, 0);
  writeFileSync(path.join(root, "existing.mjs"), "after");
  rmSync(path.join(root, "deleted.mjs"));
  const after = capture(), diff = diffTargetFileManifests(before, after);
  assert.equal(diff.complete, true);
  assert.deepEqual(diff.added, ["untracked.mjs"]);
  assert.deepEqual(diff.modified, ["existing.mjs"]);
  assert.deepEqual(diff.deleted, ["deleted.mjs"]);
  assert.match(after.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(after).includes("console.log"));
});

test("secret paths, private state, generated files and symlinks never enter a manifest", t => {
  const { root, parent, capture } = fixture(t);
  const neighbor = path.join(parent, "neighbor");
  mkdirSync(neighbor);
  writeFileSync(path.join(neighbor, "external.mjs"), "not child code");
  for (const directory of [".private", ".memory", ".git", ".next", "node_modules", "data", "credentials", "dist"]) {
    mkdirSync(path.join(root, directory));
    writeFileSync(path.join(root, directory, "must-not-appear.txt"), "private fixture");
  }
  for (const file of [".env", ".env.local", "secrets.json", "private-key.txt", "client.pem", "history.sqlite", "id_ed25519", "service.log", "auth.json", "api-key.txt"]) {
    writeFileSync(path.join(root, file), "private fixture");
  }
  symlinkSync(neighbor, path.join(root, "neighbor-link"));
  symlinkSync(path.join(neighbor, "external.mjs"), path.join(root, "file-link.mjs"));
  writeFileSync(path.join(root, "main.mjs"), "safe source");
  const result = capture();
  assert.equal(result.complete, true);
  assert.deepEqual(result.files.map(file => file.path), ["main.mjs"]);
  assert.equal(result.excludedEntries, 20);
  assert.throws(() => captureTargetFileManifest(neighbor, { allowedParent: root }), /outside_parent/);
  assert.throws(() => captureTargetFileManifest(path.join(root, "neighbor-link"), { allowedParent: parent }), /real_directory/);
});

test("capture before scaffold compares to the same newly created target", t => {
  const { root, capture } = fixture(t);
  rmSync(root, { recursive: true });
  const before = capture();
  assert.equal(before.exists, false);
  mkdirSync(root);
  writeFileSync(path.join(root, "index.mjs"), "created");
  assert.deepEqual(diffTargetFileManifests(before, capture()).added, ["index.mjs"]);
});

test("bounded partial scans are explicit and never claim unchanged or deleted omitted files", t => {
  const { root, capture } = fixture(t);
  for (const name of ["a.mjs", "b.mjs", "c.mjs"]) writeFileSync(path.join(root, name), "small source");
  const before = capture();
  const partial = capture({ maxFiles: 1 });
  const diff = diffTargetFileManifests(before, partial);
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.issues, ["file_limit"]);
  assert.equal(diff.complete, false);
  assert.deepEqual(diff.deleted, []);
  assert.equal(capture({ maxFileBytes: 1 }).complete, false);
  assert.equal(capture({ maxTotalBytes: 1 }).complete, false);
  assert.equal(capture({ maxEntries: 1 }).complete, false);
  assert.throws(() => capture({ maxFiles: 100_000 }), /invalid_maxFiles/);
});

test("execution bit changes are observed and another child's manifest is rejected", t => {
  const { root, parent, capture } = fixture(t);
  const file = path.join(root, "run.sh");
  writeFileSync(file, "#!/bin/sh\nexit 0\n", { mode: 0o600 });
  const before = capture();
  chmodSync(file, 0o700);
  assert.deepEqual(diffTargetFileManifests(before, capture()).modified, ["run.sh"]);
  const other = path.join(parent, "other");
  mkdirSync(other);
  assert.throws(() => diffTargetFileManifests(before, captureTargetFileManifest(other)), /identity_mismatch/);
});
