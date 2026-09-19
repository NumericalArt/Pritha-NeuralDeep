import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ND_STORAGE_COMPATIBILITY, readBuildIdentity, sealBuildIdentity, prepareRollbackArtifact, verifyRollbackArtifact, buildTreeDigest } from "../scripts/lib/release-artifact.mjs";
import { acquireNeuralDeepReleaseLock, releaseNeuralDeepReleaseLock, assertNeuralDeepDispatchAllowed } from "../scripts/neuraldeep/release-maintenance.mjs";
import { randomUUID } from "node:crypto";
import { runCodexWithNeuralDeep } from "../scripts/neuraldeep-codex.mjs";
const finderBytes = text => Buffer.concat([Buffer.from([0, 0, 0, 1, 66, 117, 100, 49]), Buffer.from(text)]);

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "nd-release-artifact-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source"), artifact = path.join(root, "artifact");
  mkdirSync(source); writeFileSync(path.join(source, "BUILD_ID"), "verified-build");
  writeFileSync(path.join(source, "chunk.js"), "export const version = 1;");
  sealBuildIdentity(source, "a".repeat(40), ND_STORAGE_COMPATIBILITY);
  return { root, source, artifact };
}
test("rollback artifact preserves its compiled source and all storage writer versions", t => {
  const f = fixture(t); const result = prepareRollbackArtifact(f.source, f.artifact);
  assert.equal(result.identity.commit, "a".repeat(40)); assert.deepEqual(result.identity.storage, ND_STORAGE_COMPATIBILITY);
  assert.equal(result.digest.files, 3); assert.deepEqual(verifyRollbackArtifact(f.artifact), result);
});
test("altered executable chunk is rejected before rollback", t => {
  const f = fixture(t); prepareRollbackArtifact(f.source, f.artifact);
  writeFileSync(path.join(f.artifact, "build/chunk.js"), "export const version = 2;");
  assert.throws(() => verifyRollbackArtifact(f.artifact), /integrity/);
});
test("new rollback receipts tolerate Finder metadata churn while retaining executable integrity", t => {
  const f = fixture(t);
  writeFileSync(path.join(f.source, ".DS_Store"), finderBytes("source folder view"));
  const prepared = prepareRollbackArtifact(f.source, f.artifact);
  const build = path.join(f.artifact, "build");
  assert.equal(existsSync(path.join(build, ".DS_Store")), false, "Finder metadata is not copied into a new artifact");
  writeFileSync(path.join(build, ".DS_Store"), finderBytes("Finder opened the backup"));
  assert.deepEqual(verifyRollbackArtifact(f.artifact), prepared);
  writeFileSync(path.join(build, ".DS_Store"), finderBytes("another folder view and size"));
  assert.deepEqual(verifyRollbackArtifact(f.artifact), prepared);
  writeFileSync(path.join(build, "chunk.js"), "changed executable");
  assert.throws(() => verifyRollbackArtifact(f.artifact), /integrity/);
});
test("a regular file named like Finder metadata remains protected without its binary header", t => {
  const f = fixture(t);
  writeFileSync(path.join(f.source, ".DS_Store"), "export const executable = 1;");
  prepareRollbackArtifact(f.source, f.artifact);
  assert.equal(readFileSync(path.join(f.artifact, "build/.DS_Store"), "utf8"), "export const executable = 1;");
  writeFileSync(path.join(f.artifact, "build/.DS_Store"), "export const executable = 2;");
  assert.throws(() => verifyRollbackArtifact(f.artifact), /integrity/);
});
test("Finder names cannot hide a symlink or executable directory from rollback verification", t => {
  const f = fixture(t);
  mkdirSync(path.join(f.source, ".DS_Store"));
  writeFileSync(path.join(f.source, ".DS_Store/chunk.js"), "protected");
  prepareRollbackArtifact(f.source, f.artifact);
  writeFileSync(path.join(f.artifact, "build/.DS_Store/chunk.js"), "tampered");
  assert.throws(() => verifyRollbackArtifact(f.artifact), /integrity/);
  rmSync(path.join(f.artifact, "build/.DS_Store"), { recursive: true });
  symlinkSync(path.join(f.source, "chunk.js"), path.join(f.artifact, "build/.DS_Store"));
  assert.throws(() => verifyRollbackArtifact(f.artifact), /regular owned files/);
});
test("legacy rollback digests keep their original byte contract and unknown formats fail closed", t => {
  const f = fixture(t); prepareRollbackArtifact(f.source, f.artifact);
  const build = path.join(f.artifact, "build"), receiptPath = path.join(f.artifact, "artifact.json");
  writeFileSync(path.join(build, ".DS_Store"), "legacy protected bytes");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  receipt.digest = buildTreeDigest(build);
  writeFileSync(receiptPath, JSON.stringify(receipt));
  assert.doesNotThrow(() => verifyRollbackArtifact(f.artifact));
  writeFileSync(path.join(build, ".DS_Store"), "modified legacy bytes");
  assert.throws(() => verifyRollbackArtifact(f.artifact), /integrity/);
  receipt.digest = { ...buildTreeDigest(build), version: 999 };
  writeFileSync(receiptPath, JSON.stringify(receipt));
  assert.throws(() => verifyRollbackArtifact(f.artifact), /digest version/);
});
test("previous coordination writer cannot authorize a schema 3 rollback", t => {
  const f = fixture(t); sealBuildIdentity(f.source, "a".repeat(40), { ...ND_STORAGE_COMPATIBILITY, coordination: 2 });
  assert.throws(() => prepareRollbackArtifact(f.source, f.artifact), /incompatible/);
});
test("build identity cannot claim another BUILD_ID", t => {
  const f = fixture(t); writeFileSync(path.join(f.source, "BUILD_ID"), "another-build");
  assert.throws(() => readBuildIdentity(f.source), /Invalid/);
});
test("rollback artifact refuses external symlinks", t => {
  const f = fixture(t); symlinkSync(path.join(f.source, "chunk.js"), path.join(f.source, "external.js"));
  assert.throws(() => prepareRollbackArtifact(f.source, f.artifact), /regular owned files/);
});

test("maintenance retains requests without opening or migrating stores and only its owner can release it", async t => {
  const f = fixture(t), owner = randomUUID();
  acquireNeuralDeepReleaseLock(f.root, owner);
  assert.throws(() => acquireNeuralDeepReleaseLock(f.root, randomUUID()), /EEXIST/);
  await assert.rejects(runCodexWithNeuralDeep({ stateRoot: f.root }, []), { code: "neuraldeep_release_maintenance" });
  assert.throws(() => releaseNeuralDeepReleaseLock(f.root, randomUUID()), /mismatch/);
  assert.throws(() => assertNeuralDeepDispatchAllowed(f.root), /managed release/);
  releaseNeuralDeepReleaseLock(f.root, owner); assert.doesNotThrow(() => assertNeuralDeepDispatchAllowed(f.root));
});
