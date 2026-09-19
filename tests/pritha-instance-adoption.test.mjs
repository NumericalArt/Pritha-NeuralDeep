import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adoptionStateFingerprint, applyInstanceAdoption, planInstanceAdoption } from "../scripts/lib/instance-adoption.mjs";

const OLD = "a".repeat(40), NEXT = "b".repeat(40);
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-adopt-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = { codeRoot: path.join(root, "live"), candidateRoot: path.join(root, "candidate"), stateRoot: path.join(root, "state"),
    agentParent: path.join(root, "children"), backupRoot: path.join(root, "backup"), instanceId: "fixture", instanceRole: "primary",
    port: 7420, expectedCommit: NEXT, keychainService: "existing-private-reference" };
  for (const directory of [input.codeRoot, input.candidateRoot, input.stateRoot, input.agentParent]) mkdirSync(directory);
  for (const [directory, sha] of [[input.codeRoot, OLD], [input.candidateRoot, NEXT]]) {
    mkdirSync(path.join(directory, ".git")); writeFileSync(path.join(directory, "revision"), sha);
    mkdirSync(path.join(directory, "interfaces/control-center"), { recursive: true });
  }
  mkdirSync(path.join(input.codeRoot, "interfaces/control-center/.next"));
  writeFileSync(path.join(input.codeRoot, "interfaces/control-center/.next/BUILD_ID"), "old-build");
  writeFileSync(path.join(input.codeRoot, ".env.local"), "SECRET=never-output-this\n");
  writeFileSync(path.join(input.agentParent, "retained-agent.txt"), "Brief Desk v1.1");
  const database = path.join(input.stateRoot, "history.sqlite"), db = new DatabaseSync(database);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE events(value TEXT); INSERT INTO events VALUES('before')");
  db.close();
  const calls = [], control = { running: true, active: false, stopFails: false, buildFails: false, healthFails: false, writeDuringHealth: false, changeIsolation: false };
  const adapters = {
    gitIdentity: async directory => ({ commit: readFileSync(path.join(directory, "revision"), "utf8"), clean: true, origin: "https://github.com/NumericalArt/Pritha-NeuralDeep.git" }),
    manager: async action => {
      calls.push(action);
      if (action === "stop") { if (control.stopFails) return { ok: false }; control.running = false; return { ok: true }; }
      if (action === "start") { control.running = true; return { ok: true }; }
      return { ok: true, configured: { instanceId: input.instanceId, port: input.port, codeRoot: input.codeRoot, stateRoot: input.stateRoot },
        service: { installed: true, running: control.running }, port: { ownerMatch: true, listener: control.running }, health: { instanceMatch: true } };
    },
    activity: async () => ({ ready: !control.active }),
    isolation: async () => ({ childHash: control.changeIsolation ? "changed" : "original-child" }),
    rollbackIdentity: async () => ({ commit: OLD, buildId: "old-build", digest: "fixture-build-digest" }),
    backupService: async (_input, destination) => { writeFileSync(path.join(destination, "service.plist"), "original-config"); return { ok: true, filename: "service.plist", sha256: createHash('sha256').update('original-config').digest('hex') }; },
    restoreService: async () => ({ ok: true }),
    bootstrapAndBuild: async context => {
      calls.push("build"); assert.equal(control.running, false); assert.equal(context.codeRoot, input.codeRoot);
      assert.equal(readFileSync(path.join(input.codeRoot, "revision"), "utf8"), NEXT);
      const local = new DatabaseSync(database); local.exec("INSERT INTO events VALUES('migration')"); local.close();
      mkdirSync(path.join(input.codeRoot, "interfaces/control-center/.next"), { recursive: true });
      writeFileSync(path.join(input.codeRoot, "interfaces/control-center/.next/BUILD_ID"), "new-build");
      return { ok: !control.buildFails };
    },
    stateFingerprint: async () => adoptionStateFingerprint(input.stateRoot),
    health: async commit => {
      calls.push(`health:${commit}`);
      if (commit === NEXT && control.writeDuringHealth) { const local = new DatabaseSync(database); local.exec("INSERT INTO events VALUES('new-user-work')"); local.close(); }
      return { ok: commit === OLD || !control.healthFails };
    },
  };
  return { input, adapters, control, calls, database };
}

test("adoption plan is read-only, pinned and independent of unrelated Git ancestry", async t => {
  const f = fixture(t), before = readdirSync(path.dirname(f.input.codeRoot));
  const plan = await planInstanceAdoption(f.input, f.adapters);
  assert.equal(plan.ok, true); assert.equal(plan.previousCommit, OLD); assert.equal(plan.targetCommit, NEXT);
  assert.equal(plan.planHash.length, 64); assert.deepEqual(f.calls, ["status"]);
  assert.deepEqual(readdirSync(path.dirname(f.input.codeRoot)), before); assert.equal(existsSync(f.input.backupRoot), false);
  assert.ok(!JSON.stringify(plan).includes("never-output-this")); assert.ok(!JSON.stringify(plan).includes(f.input.keychainService));
  await assert.rejects(applyInstanceAdoption(f.input, f.adapters), /requires_yes/);
  f.control.active = true; assert.ok((await planInstanceAdoption(f.input, f.adapters)).blockers.includes("active_or_unreconciled_execution"));
});

test("successful adoption preserves local config, complete old checkout, SQLite snapshot and canonical build path", async t => {
  const f = fixture(t), plan = await planInstanceAdoption(f.input, f.adapters);
  const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true, expectedPlanHash: plan.planHash });
  assert.equal(result.ok, true); assert.equal(result.status, "deployed");
  assert.equal(readFileSync(path.join(f.input.codeRoot, "revision"), "utf8"), NEXT);
  assert.equal(readFileSync(path.join(f.input.backupRoot, "previous-checkout/interfaces/control-center/.next/BUILD_ID"), "utf8"), "old-build");
  assert.equal(readFileSync(path.join(f.input.codeRoot, ".env.local"), "utf8"), "SECRET=never-output-this\n");
  assert.equal(JSON.parse(readFileSync(path.join(f.input.codeRoot, ".pritha-instance.json"))).keychainService, f.input.keychainService);
  const saved = new DatabaseSync(path.join(f.input.backupRoot, "state/history.sqlite"), { readOnly: true });
  assert.deepEqual(saved.prepare("SELECT value FROM events").all().map(row => row.value), ["before"]); saved.close();
  const manifest = JSON.parse(readFileSync(result.manifest)); assert.ok(manifest.stateSnapshot.files.some(file => file.kind === "sqlite"));
  assert.equal(lstatSync(result.manifest).mode & 0o777, 0o400);
  assert.equal(existsSync(path.join(f.input.stateRoot, "setup/neuraldeep-release-lock.json")), false);
  assert.equal(readFileSync(path.join(f.input.agentParent, "retained-agent.txt"), "utf8"), "Brief Desk v1.1");
  assert.ok(f.calls.indexOf("stop") < f.calls.indexOf("build")); assert.ok(f.calls.indexOf("build") < f.calls.indexOf("start"));
});

test("build failure restores old checkout, build and consistent pre-migration state", async t => {
  const f = fixture(t); f.control.buildFails = true;
  const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
  assert.equal(result.status, "rolled-back", JSON.stringify(result)); assert.equal(result.failure, "adoption_build_failed");
  assert.equal(readFileSync(path.join(f.input.codeRoot, "revision"), "utf8"), OLD);
  assert.equal(readFileSync(path.join(f.input.codeRoot, "interfaces/control-center/.next/BUILD_ID"), "utf8"), "old-build");
  const restored = new DatabaseSync(f.database, { readOnly: true }); assert.deepEqual(restored.prepare("SELECT value FROM events").all().map(row => row.value), ["before"]); restored.close();
  assert.equal(existsSync(path.join(f.input.backupRoot, "failed-state/history.sqlite")), true);
  assert.equal(f.control.running, true);
});

test("failed strict health rolls back only after candidate stop and verifies old release", async t => {
  const f = fixture(t); f.control.healthFails = true;
  const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
  assert.equal(result.status, "rolled-back"); assert.equal(result.failure, "adoption_health_failed");
  assert.equal(f.calls.filter(action => action === "stop").length, 2);
  assert.ok(f.calls.includes(`health:${OLD}`));
});

test("unknown stop and post-start user writes retain maintenance/evidence and refuse destructive rollback", async t => {
  await t.test("stop unconfirmed", async t => {
    const f = fixture(t); f.control.stopFails = true;
    const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
    assert.equal(result.status, "adoption_stop_unconfirmed"); assert.equal(result.maintenanceRetained, true);
    assert.equal(readFileSync(path.join(f.input.codeRoot, "revision"), "utf8"), OLD); assert.ok(!f.calls.includes("build"));
  });
  await t.test("new private data", async t => {
    const f = fixture(t); f.control.healthFails = true; f.control.writeDuringHealth = true;
    const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
    assert.equal(result.status, "rollback-state-changed"); assert.equal(result.rollbackPerformed, false);
    assert.equal(result.maintenanceRetained, true); assert.equal(f.control.running, false);
    const current = new DatabaseSync(f.database, { readOnly: true }); assert.ok(current.prepare("SELECT value FROM events").all().some(row => row.value === "new-user-work")); current.close();
    assert.equal(readFileSync(path.join(f.input.backupRoot, "previous-checkout/revision"), "utf8"), OLD);
  });
});

test("pin, overlapping roots, private candidate files and changed plans fail before any lifecycle action", async t => {
  const f = fixture(t);
  await assert.rejects(planInstanceAdoption({ ...f.input, expectedCommit: NEXT.slice(0, 12) }, f.adapters), /full_commit/);
  await assert.rejects(planInstanceAdoption({ ...f.input, agentParent: f.input.stateRoot }, f.adapters), /overlapping_roots/);
  await assert.rejects(applyInstanceAdoption(f.input, f.adapters, { yes: true, expectedPlanHash: "0".repeat(64) }), /plan_changed/);
  assert.ok(!f.calls.includes("stop"));
  writeFileSync(path.join(f.input.candidateRoot, ".env.local"), "PRIVATE=true");
  assert.ok((await planInstanceAdoption(f.input, f.adapters)).blockers.includes("candidate_has_local_state"));
});

test("logical SQLite state fingerprint is stable across WAL checkpoints but changes for user writes", t => {
  const f = fixture(t), db = new DatabaseSync(f.database); t.after(() => db.close());
  const before = adoptionStateFingerprint(f.input.stateRoot);
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  assert.equal(adoptionStateFingerprint(f.input.stateRoot), before);
  db.exec("INSERT INTO events VALUES('later')"); assert.notEqual(adoptionStateFingerprint(f.input.stateRoot), before);
});

test('environment variants are preserved and conflicting pointer/reference stops before manager mutation', async t => {
  await t.test('preserve env and production settings', async t => {
    const f = fixture(t);
    writeFileSync(path.join(f.input.codeRoot, '.env'), `PRITHA_NEURALDEEP_KEYCHAIN_SERVICE=${f.input.keychainService}\nLOCAL_CHOICE=retained\n`);
    writeFileSync(path.join(f.input.codeRoot, 'interfaces/control-center/.env.production.local'), 'LOCAL_SERVER_CONFIG=retained\n');
    const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true }); assert.equal(result.status, 'deployed');
    assert.match(readFileSync(path.join(f.input.codeRoot, '.env'), 'utf8'), /LOCAL_CHOICE=retained/);
    assert.equal(readFileSync(path.join(f.input.codeRoot, 'interfaces/control-center/.env.production.local'), 'utf8'), 'LOCAL_SERVER_CONFIG=retained\n');
  });
  await t.test('conflicting keychain and instance identities', async t => {
    const f = fixture(t), pointer = path.join(f.input.codeRoot, '.pritha-instance.json');
    writeFileSync(pointer, JSON.stringify({ schema: 'pritha-instance-v1', id: f.input.instanceId, keychainService: 'other-reference' }));
    await assert.rejects(planInstanceAdoption(f.input, f.adapters), /keychain_reference_conflict/);
    writeFileSync(pointer, JSON.stringify({ schema: 'pritha-instance-v1', id: 'other-instance' }));
    await assert.rejects(planInstanceAdoption(f.input, f.adapters), /pointer_identity_conflict/);
    assert.equal(f.calls.length, 0);
  });
  await t.test('local configuration participates in exact plan hash', async t => {
    const f = fixture(t), plan = await planInstanceAdoption(f.input, f.adapters);
    writeFileSync(path.join(f.input.codeRoot, '.env.local'), 'CHANGED=1\n');
    await assert.rejects(applyInstanceAdoption(f.input, f.adapters, { yes: true, expectedPlanHash: plan.planHash }), /plan_changed/);
    assert.ok(!f.calls.includes('stop'));
  });
});

test('snapshot catches a concurrent history write and keeps the latest old-instance state', async t => {
  const f = fixture(t), backup = f.adapters.backupService;
  f.adapters.backupService = async (...args) => {
    const value = await backup(...args); const db = new DatabaseSync(f.database);
    db.exec("INSERT INTO events VALUES('concurrent-user-work')"); db.close(); return value;
  };
  const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
  assert.equal(result.status, 'rolled-back'); assert.equal(result.failure, 'adoption_state_changed_during_snapshot');
  assert.equal(readFileSync(path.join(f.input.codeRoot, 'revision'), 'utf8'), OLD);
  const db = new DatabaseSync(f.database); assert.deepEqual(db.prepare('SELECT value FROM events').all().map(row => row.value), ['before','concurrent-user-work']); db.close();
  assert.ok(!f.calls.includes('build'));
});

test('snapshot keeps ordinary journal-named files and executable owner permissions', async t => {
  const f = fixture(t); f.control.buildFails = true;
  writeFileSync(path.join(f.input.stateRoot, 'notes'), 'notes'); writeFileSync(path.join(f.input.stateRoot, 'notes-journal'), 'not SQLite auxiliary');
  writeFileSync(path.join(f.input.stateRoot, 'private-runner'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true }); assert.equal(result.status, 'rolled-back');
  assert.equal(readFileSync(path.join(f.input.stateRoot, 'notes-journal'), 'utf8'), 'not SQLite auxiliary');
  assert.equal(lstatSync(path.join(f.input.stateRoot, 'private-runner')).mode & 0o100, 0o100);
});

test('tampered or extra snapshot paths and manifest prevent destructive restore', async t => {
  for (const kind of ['extra-file','parent-symlink','manifest','service-backup']) await t.test(kind, async t => {
    const f = fixture(t), build = f.adapters.bootstrapAndBuild; f.control.buildFails = true;
    mkdirSync(path.join(f.input.stateRoot, 'private')); writeFileSync(path.join(f.input.stateRoot, 'private/kept'), 'before');
    f.adapters.bootstrapAndBuild = async (...args) => {
      const result = await build(...args), snapshot = path.join(f.input.backupRoot, 'state');
      if (kind === 'extra-file') writeFileSync(path.join(snapshot, 'unexpected'), 'injected');
      if (kind === 'parent-symlink') { rmSync(path.join(snapshot, 'private'), { recursive: true }); symlinkSync(path.join(f.input.stateRoot, 'private'), path.join(snapshot, 'private')); }
      if (kind === 'manifest') { const file = path.join(f.input.backupRoot, 'manifest.json'); chmodSync(file, 0o600); writeFileSync(file, readFileSync(file, 'utf8').replace('"kind": "sqlite"', '"kind": "file"')); }
      if (kind === 'service-backup') rmSync(path.join(f.input.backupRoot, 'service.plist'));
      return result;
    };
    const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
    assert.equal(result.status, 'rollback-incomplete'); assert.equal(result.maintenanceRetained, true);
    assert.equal(readFileSync(path.join(f.input.codeRoot, 'revision'), 'utf8'), NEXT);
    assert.equal(existsSync(path.join(f.input.backupRoot, 'previous-checkout')), true);
    assert.equal(f.control.running, false);
  });
});

test('a throwing stop or rollback stop retains maintenance and never renames a possibly live checkout', async t => {
  await t.test('initial stop lost acknowledgement', async t => {
    const f = fixture(t), manager = f.adapters.manager;
    f.adapters.manager = async action => { if (action === 'stop') throw new Error('acknowledgement lost'); return manager(action); };
    const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
    assert.equal(result.maintenanceRetained, true); assert.equal(result.rollbackPerformed, false);
    assert.equal(readFileSync(path.join(f.input.codeRoot, 'revision'), 'utf8'), OLD); assert.ok(!f.calls.includes('build'));
  });
  await t.test('rollback stop lost acknowledgement', async t => {
    const f = fixture(t), manager = f.adapters.manager; f.control.healthFails = true; let stops = 0;
    f.adapters.manager = async action => { if (action === 'stop' && ++stops === 2) throw new Error('acknowledgement lost'); return manager(action); };
    const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
    assert.equal(result.status, 'rollback-stop-failed'); assert.equal(result.maintenanceRetained, true);
    assert.equal(readFileSync(path.join(f.input.codeRoot, 'revision'), 'utf8'), NEXT);
  });
});

test('final source mutation and manager ownership changes fail the successful-release gate', async t => {
  for (const kind of ['source','ownership']) await t.test(kind, async t => {
    const f = fixture(t), health = f.adapters.health, git = f.adapters.gitIdentity, manager = f.adapters.manager; let changed = false;
    f.adapters.health = async commit => { const result = await health(commit); if (commit === NEXT) changed = true; return result; };
    f.adapters.gitIdentity = async directory => ({ ...await git(directory), clean: !(changed && kind === 'source' && directory === f.input.codeRoot) });
    f.adapters.manager = async action => { const result = await manager(action); if (action === 'status' && changed && kind === 'ownership' && f.control.running) result.port.ownerMatch = false; return result; };
    const result = await applyInstanceAdoption(f.input, f.adapters, { yes: true });
    assert.equal(result.status, 'rolled-back'); assert.equal(result.failure, kind === 'source' ? 'adoption_final_git_changed' : 'adoption_started_instance_unverified');
  });
});

test('logical state fingerprint includes SQLite counters and schema version', t => {
  const f = fixture(t), db = new DatabaseSync(f.database); t.after(() => db.close());
  db.exec('CREATE TABLE ids(id INTEGER PRIMARY KEY AUTOINCREMENT); INSERT INTO ids DEFAULT VALUES; DELETE FROM ids;');
  const before = adoptionStateFingerprint(f.input.stateRoot);
  db.exec('UPDATE sqlite_sequence SET seq=9'); const counter = adoptionStateFingerprint(f.input.stateRoot); assert.notEqual(counter, before);
  db.exec('PRAGMA user_version=4'); assert.notEqual(adoptionStateFingerprint(f.input.stateRoot), counter);
});
