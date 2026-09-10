import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ND_STORAGE_COMPATIBILITY, readBuildIdentity, sealBuildIdentity, prepareRollbackArtifact, verifyRollbackArtifact } from "../scripts/lib/release-artifact.mjs";
import { acquireNeuralDeepReleaseLock, releaseNeuralDeepReleaseLock, assertNeuralDeepDispatchAllowed } from "../scripts/neuraldeep/release-maintenance.mjs";
import { randomUUID } from "node:crypto";
import { runCodexWithNeuralDeep } from "../scripts/neuraldeep-codex.mjs";

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
