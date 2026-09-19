import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creationReleaseIdentity } from '../scripts/neuraldeep/agent-creation.mjs';
import { ND_STORAGE_COMPATIBILITY, sealBuildIdentity } from '../scripts/lib/release-artifact.mjs';

const commitKey = 'PRITHA_CONTROL_CENTER_RELEASE_COMMIT';
const buildKey = 'PRITHA_CONTROL_CENTER_BUILD_ID';
const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
  { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pritha-creation-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  writeFileSync(path.join(root, '.gitignore'), 'interfaces/control-center/.next/\n');
  writeFileSync(path.join(root, 'platform.mjs'), 'export const release = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Platform fixture');
  const commit = git(root, 'rev-parse', 'HEAD');
  const build = path.join(root, 'interfaces/control-center/.next');
  mkdirSync(build, { recursive: true });
  writeFileSync(path.join(build, 'BUILD_ID'), 'fixture-build\n');
  const identity = sealBuildIdentity(build, commit, ND_STORAGE_COMPATIBILITY);
  return { root, build, commit, identity };
}

function withProcessPin(commit, buildId, run) {
  const prior = [process.env[commitKey], process.env[buildKey]];
  try {
    if (commit === undefined) delete process.env[commitKey]; else process.env[commitKey] = commit;
    if (buildId === undefined) delete process.env[buildKey]; else process.env[buildKey] = buildId;
    return run();
  } finally {
    for (const [index, key] of [commitKey, buildKey].entries()) {
      if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index];
    }
  }
}

test('offline release identity accepts only a sealed build with its full source pin', t => {
  const f = fixture(t);
  withProcessPin(undefined, undefined, () => {
    assert.deepEqual(creationReleaseIdentity(f.root), { source: f.commit, runtime: f.commit, execution: null, sourceDirty: false });
    const anotherCommit = 'b'.repeat(40);
    sealBuildIdentity(f.build, anotherCommit, ND_STORAGE_COMPATIBILITY);
    const observed = creationReleaseIdentity(f.root);
    assert.equal(observed.source, f.commit);
    assert.equal(observed.runtime, anotherCommit, 'source and sealed runtime are reported independently');
  });
});

test('a loaded process requires both exact matching release and build pins', t => {
  const f = fixture(t);
  withProcessPin(f.commit, f.identity.buildId, () => assert.equal(creationReleaseIdentity(f.root).runtime, f.commit));
  for (const [commit, buildId] of [
    ['b'.repeat(40), f.identity.buildId], [f.commit, 'another-build'],
    [undefined, f.identity.buildId], [f.commit, undefined], ['', ''],
    [f.commit.slice(0, 12), f.identity.buildId], [` ${f.commit}`, f.identity.buildId],
  ]) withProcessPin(commit, buildId, () => {
    const observed = creationReleaseIdentity(f.root);
    assert.equal(observed.runtime, null);
    assert.equal(observed.source, f.commit);
  });
});

test('an unsealed, malformed or mismatched on-disk build never supplies runtime identity', t => {
  const f = fixture(t), metadata = path.join(f.build, 'pritha-release.json');
  const sealed = readFileSync(metadata, 'utf8');
  withProcessPin(undefined, undefined, () => {
    for (const value of [
      { commit: f.commit },
      { ...f.identity, schema: 'legacy-build' },
      { ...f.identity, commit: f.commit.slice(0, 12) },
      { ...f.identity, buildId: 'another-build' },
      { ...f.identity, storage: { coordination: 0 } },
    ]) {
      writeFileSync(metadata, JSON.stringify(value));
      assert.equal(creationReleaseIdentity(f.root).runtime, null);
    }
    writeFileSync(metadata, '{broken');
    assert.equal(creationReleaseIdentity(f.root).runtime, null);
    writeFileSync(metadata, sealed);
    writeFileSync(path.join(f.build, 'BUILD_ID'), 'replacement-build');
    assert.equal(creationReleaseIdentity(f.root).runtime, null);
    rmSync(path.join(f.build, 'BUILD_ID'));
    assert.equal(creationReleaseIdentity(f.root).runtime, null);
    rmSync(metadata);
    assert.equal(creationReleaseIdentity(f.root).runtime, null);
  });
});

test('matching process pins cannot authorize replacement metadata or hide dirty source', t => {
  const f = fixture(t);
  withProcessPin(f.commit, f.identity.buildId, () => {
    writeFileSync(path.join(f.root, 'platform.mjs'), 'export const release = 2;\n');
    assert.equal(creationReleaseIdentity(f.root).sourceDirty, true);
    assert.equal(creationReleaseIdentity(f.root).runtime, f.commit);
    writeFileSync(path.join(f.build, 'BUILD_ID'), 'replacement-build');
    sealBuildIdentity(f.build, f.commit, ND_STORAGE_COMPATIBILITY);
    assert.equal(creationReleaseIdentity(f.root).runtime, null);
  });
});
