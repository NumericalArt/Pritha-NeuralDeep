import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, closeSync, readSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acquireNeuralDeepReleaseLock, releaseNeuralDeepReleaseLock } from "../neuraldeep/release-maintenance.mjs";
import { buildTreeDigest } from "./release-artifact.mjs";

export class InstanceAdoptionError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new InstanceAdoptionError(code); };
const hash = value => createHash("sha256").update(value).digest("hex");
function hashFile(file) {
  const fd = openSync(file, "r"), digest = createHash("sha256"), buffer = Buffer.alloc(1024 * 1024);
  try { for (let bytes; (bytes = readSync(fd, buffer, 0, buffer.length, null));) digest.update(buffer.subarray(0, bytes)); }
  finally { closeSync(fd); }
  return digest.digest("hex");
}
const inside = (root, value) => { const relative = path.relative(root, value); return relative === "" || relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const plain = value => value && typeof value === "object" && !Array.isArray(value);
function directory(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || !existsSync(value) || lstatSync(value).isSymbolicLink() || !lstatSync(value).isDirectory()) fail("adoption_directory_unverified");
  return realpathSync(value);
}
function json(file, value, immutable = false) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: immutable ? 0o400 : 0o600, flag: "wx" });
}
function validateInput(input) {
  const source = directory(input.codeRoot), candidate = directory(input.candidateRoot), state = directory(input.stateRoot), agents = directory(input.agentParent);
  if (!/^[a-f0-9]{40}$/.test(input.expectedCommit || "")) fail("adoption_full_commit_required");
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(input.instanceId || "") || !Number.isSafeInteger(input.port) || input.port < 1024 || input.port > 65535) fail("adoption_instance_identity_required");
  if (typeof input.keychainService !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.keychainService)) fail("adoption_existing_keychain_reference_required");
  if (typeof input.backupRoot !== "string" || !path.isAbsolute(input.backupRoot) || existsSync(input.backupRoot)) fail("adoption_new_backup_directory_required");
  const backupRoot = path.join(directory(path.dirname(input.backupRoot)), path.basename(input.backupRoot));
  const roots = [source, candidate, state, agents, backupRoot];
  for (let index = 0; index < roots.length; index++) for (const other of roots.slice(index + 1)) {
    if (inside(roots[index], other) || inside(other, roots[index])) fail("adoption_overlapping_roots");
  }
  if (lstatSync(source).dev !== lstatSync(candidate).dev || lstatSync(source).dev !== lstatSync(path.dirname(backupRoot)).dev) fail("adoption_same_filesystem_required");
  if (!lstatSync(path.join(source, ".git")).isDirectory() || !lstatSync(path.join(candidate, ".git")).isDirectory()) fail("adoption_standalone_checkouts_required");
  return { ...input, codeRoot: source, candidateRoot: candidate, stateRoot: state, agentParent: agents, backupRoot };
}
const LOCAL_CONFIGURATION = [".env", ".env.local", "interfaces/control-center/.env", "interfaces/control-center/.env.local", "interfaces/control-center/.env.production", "interfaces/control-center/.env.production.local"];
const candidateHasLocalState = input => [...LOCAL_CONFIGURATION, ".pritha-instance.json", ".private", ".queue", ".logs", ".memory-private", ".snapshots", ".techscope-setup.json"].some(name => existsSync(path.join(input.candidateRoot, name)));
function localConfiguration(input) {
  const files = [];
  const read = (file, label) => {
    if (!existsSync(file)) return null;
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) fail("adoption_local_config_unverified");
    const text = readFileSync(file, "utf8");
    files.push({ path: label, sha256: hash(text) });
    return text;
  };
  for (const name of LOCAL_CONFIGURATION) {
    const text = read(path.join(input.codeRoot, name), name);
    if (text === null) continue;
    const reference = text.match(/^\s*PRITHA_NEURALDEEP_KEYCHAIN_SERVICE\s*=\s*(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (reference && reference !== input.keychainService) fail("adoption_keychain_reference_conflict");
  }
  const runtime = read(path.join(input.stateRoot, "config/runtime.env"), "<state>/config/runtime.env");
  const runtimeReference = runtime?.match(/^\s*PRITHA_NEURALDEEP_KEYCHAIN_SERVICE\s*=\s*(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (runtimeReference && runtimeReference !== input.keychainService) fail("adoption_keychain_reference_conflict");
  const text = read(path.join(input.codeRoot, ".pritha-instance.json"), ".pritha-instance.json");
  if (text !== null) {
    let pointer; try { pointer = JSON.parse(text); } catch { fail("adoption_local_config_unverified"); }
    if (!plain(pointer) || pointer.schema && pointer.schema !== "pritha-instance-v1") fail("adoption_pointer_schema_unsupported");
    if (pointer.id && pointer.id !== input.instanceId || pointer.port && Number(pointer.port) !== input.port
      || pointer.stateRoot && directory(pointer.stateRoot) !== input.stateRoot
      || pointer.agentParent && directory(pointer.agentParent) !== input.agentParent) fail("adoption_pointer_identity_conflict");
    if (pointer.keychainService && pointer.keychainService !== input.keychainService) fail("adoption_keychain_reference_conflict");
  }
  return files;
}
function managerIdentity(status, input) {
  return status?.ok === true && status.configured?.instanceId === input.instanceId && status.configured?.port === input.port
    && status.configured?.codeRoot === input.codeRoot && status.configured?.stateRoot === input.stateRoot
    && status.port?.ownerMatch === true && status.service?.installed === true;
}

/** Read-only: candidate preparation/clone is an explicit operation outside this plan. */
export async function planInstanceAdoption(value, adapters) {
  const input = validateInput(value);
  const configuration = localConfiguration(input);
  const [source, candidate, manager, activity, isolation] = await Promise.all([
    adapters.gitIdentity(input.codeRoot), adapters.gitIdentity(input.candidateRoot), adapters.manager("status", input), adapters.activity(input), adapters.isolation(input),
  ]);
  const blockers = [];
  if (!source.clean || !/^[a-f0-9]{40}$/.test(source.commit || "")) blockers.push("source_not_clean");
  if (!candidate.clean || candidate.commit !== input.expectedCommit || candidate.origin !== "https://github.com/NumericalArt/Pritha-NeuralDeep.git") blockers.push("candidate_pin_or_origin_mismatch");
  if (candidateHasLocalState(input)) blockers.push("candidate_has_local_state");
  if (!managerIdentity(manager, input) || manager.service?.running !== true || manager.health?.instanceMatch !== true) blockers.push("managed_running_instance_unverified");
  if (!activity?.ready) blockers.push("active_or_unreconciled_execution");
  if (!plain(isolation)) blockers.push("isolation_unverified");
  if (!adapters.rollbackIdentity) fail("adoption_rollback_adapter_required");
  const rollback = await adapters.rollbackIdentity(input);
  if (!rollback?.commit || !rollback.buildId || rollback.commit !== source.commit) blockers.push("old_build_identity_unverified");
  if (existsSync(path.join(input.stateRoot, "setup/neuraldeep-release-lock.json"))) blockers.push("maintenance_lock_exists");
  const plan = { schema: "pritha-instance-adoption-plan-v1", ok: blockers.length === 0, mode: "plan", instance: {
    id: input.instanceId, role: input.instanceRole || "primary", port: input.port, codeRoot: input.codeRoot, stateRoot: input.stateRoot, agentParent: input.agentParent,
  }, candidateRoot: input.candidateRoot, backupRoot: input.backupRoot, previousCommit: source.commit, targetCommit: input.expectedCommit,
  blockers, rollback, isolation, configuration, keychainReferencePreserved: true, keychainReferenceHash: hash(input.keychainService),
  steps: ["verify prepared clone and manager ownership", "acquire maintenance lock and verify idle state", "stop only the verified instance",
    "consistent SQLite/state and service configuration snapshot", "seal immutable rollback manifest", "move old checkout and build to backup",
    "move candidate into the same canonical code path", "preserve local environment and instance pointer", "bootstrap and final build at canonical path",
    "start verified instance and check exact release/pages/chunks", "verify child isolation", "retain rollback artifacts and release maintenance lock"] };
  return { ...plan, planHash: hash(JSON.stringify(plan)) };
}

const STATE_EXCLUDED = new Set(["releases", "cache", "tmp"]);
function sqliteFile(file) {
  const fd = openSync(file, "r");
  try { const header = Buffer.alloc(16); return readSync(fd, header, 0, 16, 0) === 16 && header.toString() === "SQLite format 3\0"; }
  finally { closeSync(fd); }
}
function sqliteAuxiliary(directory, name) {
  if (!/-(?:wal|shm|journal)$/.test(name)) return false;
  const database = path.join(directory, name.replace(/-(?:wal|shm|journal)$/, ""));
  return existsSync(database) && lstatSync(database).isFile() && !lstatSync(database).isSymbolicLink() && sqliteFile(database);
}
async function snapshotTree(source, destination, files, relative = "") {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) { symlinkSync(readlinkSync(source), destination); files.push({ path: relative, kind: "symlink", hash: hash(readlinkSync(source)) }); return; }
  if (stat.isDirectory()) {
    mkdirSync(destination, { mode: 0o700 });
    for (const name of readdirSync(source).sort()) {
      if (!relative && STATE_EXCLUDED.has(name)) continue;
      if (sqliteAuxiliary(source, name)) continue;
      await snapshotTree(path.join(source, name), path.join(destination, name), files, relative ? `${relative}/${name}` : name);
    }
    return;
  }
  if (!stat.isFile()) fail("adoption_snapshot_unsupported_entry");
  const sqlite = sqliteFile(source);
  if (sqlite) {
    const db = new DatabaseSync(source, { readOnly: true });
    try { db.exec("PRAGMA busy_timeout=1000"); await backup(db, destination); } finally { db.close(); }
    const check = new DatabaseSync(destination);
    try {
      // A sealed backup must be self-contained: readers must not create mutable
      // WAL/SHM sidecars beside files covered by its integrity manifest.
      check.exec("PRAGMA journal_mode=DELETE");
      if (check.prepare("PRAGMA quick_check").get().quick_check !== "ok") fail("adoption_sqlite_snapshot_invalid");
    } finally { check.close(); }
  } else copyFileSync(source, destination);
  chmodSync(destination, 0o600 | (stat.mode & 0o111));
  files.push({ path: relative, kind: sqlite ? "sqlite" : "file", bytes: lstatSync(destination).size, hash: hashFile(destination) });
}

/** Logical SQLite content ignores WAL/checkpoint churn, not user or usage rows. */
export function adoptionStateFingerprint(stateRoot) {
  const digest = createHash("sha256");
  function visit(file, relative = "") {
    if (relative === "setup/control-center-runtime" || ["logs", "memory", ...STATE_EXCLUDED].includes(relative)) return;
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) { digest.update(`${relative}\0link\0${readlinkSync(file)}\0`); return; }
    if (stat.isDirectory()) {
      for (const name of readdirSync(file).sort()) {
        if (sqliteAuxiliary(file, name)) continue;
        visit(path.join(file, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile()) fail("adoption_state_fingerprint_unsupported");
    digest.update(`${relative}\0${stat.mode & 0o111}\0`);
    if (!sqliteFile(file)) { digest.update(hashFile(file)); return; }
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.exec("PRAGMA busy_timeout=1000; BEGIN");
      digest.update(JSON.stringify([db.prepare('PRAGMA user_version').get(), db.prepare('PRAGMA application_id').get()]));
      const schema = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' OR name='sqlite_sequence' ORDER BY type,name").all();
      digest.update(JSON.stringify(schema));
      for (const table of schema.filter(row => row.type === "table" && !/^CREATE VIRTUAL TABLE/i.test(row.sql || ""))) {
        const escaped = `"${table.name.replaceAll('"', '""')}"`;
        const columns = db.prepare(`PRAGMA table_info(${escaped})`).all().map(row => `"${row.name.replaceAll('"', '""')}"`);
        if (!columns.length) continue;
        const statement = db.prepare(`SELECT * FROM ${escaped} ORDER BY ${columns.join(",")}`); statement.setReadBigInts(true);
        for (const row of statement.iterate()) digest.update(JSON.stringify(row, (_, value) => typeof value === "bigint" ? { sqliteInteger: String(value) } : value));
      }
    } finally { try { db.exec("ROLLBACK"); } catch { /* no active read transaction */ } db.close(); }
  }
  visit(stateRoot); return digest.digest("hex");
}

function preserveLocalConfiguration(input, previousRoot) {
  for (const name of LOCAL_CONFIGURATION) {
    const old = path.join(previousRoot, name), next = path.join(input.codeRoot, name);
    if (!existsSync(old)) continue;
    if (!lstatSync(old).isFile() || lstatSync(old).isSymbolicLink()) fail("adoption_local_config_unverified");
    if (existsSync(next)) fail("adoption_candidate_contains_private_config");
    copyFileSync(old, next); chmodSync(next, 0o600);
  }
  const oldPointer = path.join(previousRoot, ".pritha-instance.json");
  const pointer = existsSync(oldPointer) ? JSON.parse(readFileSync(oldPointer, "utf8")) : {};
  if (pointer.schema && pointer.schema !== "pritha-instance-v1") fail("adoption_pointer_schema_unsupported");
  json(path.join(input.codeRoot, ".pritha-instance.json"), { ...pointer, schema: "pritha-instance-v1", id: input.instanceId,
    stateRoot: input.stateRoot, agentParent: input.agentParent, port: input.port, keychainService: input.keychainService });
}

function verifyStateSnapshot(stateCopy, manifest) {
  const expected = new Set(manifest.stateSnapshot.files.map(saved => saved.path)), actual = new Set();
  function inventory(folder, relative = "") {
    for (const name of readdirSync(folder)) {
      const local = relative ? `${relative}/${name}` : name, file = path.join(folder, name), stat = lstatSync(file);
      if (stat.isDirectory() && !stat.isSymbolicLink()) inventory(file, local); else actual.add(local);
    }
  }
  inventory(stateCopy);
  if (actual.size !== expected.size || [...actual].some(file => !expected.has(file))) fail("adoption_snapshot_integrity_failed");
  for (const saved of manifest.stateSnapshot.files) {
    const file = path.join(stateCopy, saved.path);
    if (!inside(stateCopy, file)) fail("adoption_snapshot_integrity_failed");
    let stat;
    try { stat = lstatSync(file); } catch { fail("adoption_snapshot_integrity_failed"); }
    if (saved.kind === "symlink") {
      if (!stat.isSymbolicLink() || hash(readlinkSync(file)) !== saved.hash) fail("adoption_snapshot_integrity_failed");
    } else if (!stat.isFile() || stat.isSymbolicLink() || hashFile(file) !== saved.hash) fail("adoption_snapshot_integrity_failed");
  }
}

/**
 * All commands and lifecycle operations are injected; CLI adapters use only the
 * instance runtime manager. Failure never permits replacing a possibly live tree.
 */
export async function applyInstanceAdoption(value, adapters, { yes = false, expectedPlanHash } = {}) {
  if (!yes) fail("adoption_apply_requires_yes");
  const input = validateInput(value), plan = await planInstanceAdoption(input, adapters);
  if (!plan.ok) fail(`adoption_preflight_${plan.blockers[0]}`);
  if (expectedPlanHash && expectedPlanHash !== plan.planHash) fail("adoption_plan_changed");
  const owner = randomUUID(), previous = path.join(input.backupRoot, "previous-checkout"), failed = path.join(input.backupRoot, "failed-checkout");
  const stateCopy = path.join(input.backupRoot, "state"), manifestPath = path.join(input.backupRoot, "manifest.json");
  let stopped = false, switched = false, movedOld = false, started = false, locked = false, snapshotReady = false, releaseLock = true, stateTouched = false;
  let safeStateFingerprint = null, sealedManifestHash = null;
  mkdirSync(input.backupRoot, { mode: 0o700 });
  function result(status, extra = {}) {
    const receipt = { schema: "pritha-instance-adoption-result-v1", ok: status === "deployed", status, instanceId: input.instanceId,
      targetCommit: input.expectedCommit, previousCommit: plan.previousCommit, manifest: manifestPath, ...extra };
    json(path.join(input.backupRoot, `result-${randomUUID()}.json`), receipt); return receipt;
  }
  try {
    acquireNeuralDeepReleaseLock(input.stateRoot, owner); locked = true;
    if (!(await adapters.activity(input))?.ready) fail("adoption_activity_changed");
    const status = await adapters.manager("status", input);
    if (!managerIdentity(status, input)) fail("adoption_manager_identity_changed");
    releaseLock = false; // Exceptions also leave the stop acknowledgement unknown.
    const stop = await adapters.manager("stop", input);
    if (stop?.ok !== true) fail("adoption_stop_unconfirmed");
    stopped = true;
    const drained = await adapters.manager("status", input);
    if (!managerIdentity(drained, input) || drained.port?.listener || drained.service?.running || !(await adapters.activity(input))?.ready) {
      fail("adoption_drain_unconfirmed");
    }
    releaseLock = true;
    const files = [];
    const stateBeforeSnapshot = adoptionStateFingerprint(input.stateRoot);
    await snapshotTree(input.stateRoot, stateCopy, files); snapshotReady = true;
    const service = await adapters.backupService(input, input.backupRoot);
    const serviceCopy = typeof service?.filename === "string" && path.basename(service.filename) === service.filename ? path.join(input.backupRoot, service.filename) : null;
    if (!service?.ok || !serviceCopy || !existsSync(serviceCopy) || lstatSync(serviceCopy).isSymbolicLink()
      || !lstatSync(serviceCopy).isFile() || service.sha256 !== hashFile(serviceCopy)) fail("adoption_service_snapshot_failed");
    if (!(await adapters.activity(input))?.ready) fail("adoption_activity_changed_during_snapshot");
    if (stateBeforeSnapshot !== adoptionStateFingerprint(input.stateRoot) || stateBeforeSnapshot !== adoptionStateFingerprint(stateCopy)) fail("adoption_state_changed_during_snapshot");
    json(manifestPath, { schema: "pritha-instance-adoption-manifest-v1", createdAt: new Date().toISOString(), owner, plan,
      stateSnapshot: { files, excluded: [...STATE_EXCLUDED] }, previousCheckout: previous, service }, true);
    sealedManifestHash = hashFile(manifestPath);
    const source = await adapters.gitIdentity(input.codeRoot), candidate = await adapters.gitIdentity(input.candidateRoot);
    if (!source.clean || source.commit !== plan.previousCommit || !candidate.clean || candidate.commit !== input.expectedCommit) fail("adoption_source_changed");
    if (candidateHasLocalState(input) || JSON.stringify(localConfiguration(input)) !== JSON.stringify(plan.configuration)) fail("adoption_local_configuration_changed");
    renameSync(input.codeRoot, previous); movedOld = true;
    renameSync(input.candidateRoot, input.codeRoot); switched = true;
    preserveLocalConfiguration(input, previous);
    stateTouched = true;
    if ((await adapters.bootstrapAndBuild(input))?.ok !== true) fail("adoption_build_failed");
    const built = await adapters.gitIdentity(input.codeRoot);
    if (!built.clean || built.commit !== input.expectedCommit) fail("adoption_post_build_git_changed");
    if (JSON.stringify(await adapters.isolation(input)) !== JSON.stringify(plan.isolation)) fail("adoption_child_isolation_changed");
    if ((await adapters.restoreService(input, input.backupRoot))?.ok !== true) fail("adoption_service_configuration_changed");
    safeStateFingerprint = await adapters.stateFingerprint(input);
    started = true; // Start can lose acknowledgement after creating a process.
    if ((await adapters.manager("start", input))?.ok !== true) fail("adoption_start_unconfirmed");
    if ((await adapters.health(input.expectedCommit, input))?.ok !== true) fail("adoption_health_failed");
    const active = await adapters.manager("status", input);
    if (!managerIdentity(active, input) || active.service?.running !== true || active.health?.instanceMatch !== true) fail("adoption_started_instance_unverified");
    const finalGit = await adapters.gitIdentity(input.codeRoot);
    if (!finalGit.clean || finalGit.commit !== input.expectedCommit) fail("adoption_final_git_changed");
    if (JSON.stringify(await adapters.isolation(input)) !== JSON.stringify(plan.isolation)) fail("adoption_final_isolation_changed");
    if (!(await adapters.activity(input))?.ready) fail("adoption_unexpected_execution");
    return result("deployed", { rollbackAvailable: true });
  } catch (error) {
    const code = error instanceof InstanceAdoptionError ? error.code : "adoption_transaction_failed";
    if (!stopped || !releaseLock) return result(code, { rollbackPerformed: false, maintenanceRetained: !releaseLock });
    if (started) {
      releaseLock = false;
      try {
        const stop = await adapters.manager("stop", input);
        if (stop?.ok !== true) return result("rollback-stop-failed", { failure: code, rollbackPerformed: false, maintenanceRetained: true });
        const drained = await adapters.manager("status", input);
        if (!managerIdentity(drained, input) || drained.port?.listener || drained.service?.running || !(await adapters.activity(input))?.ready) {
          return result("rollback-drain-unconfirmed", { failure: code, rollbackPerformed: false, maintenanceRetained: true });
        }
      } catch { return result("rollback-stop-failed", { failure: code, rollbackPerformed: false, maintenanceRetained: true }); }
      releaseLock = true;
      // Do not overwrite new usage/history/operator writes with an old snapshot.
      // The untouched snapshot and failed checkout stay available for inspection.
      let afterStop;
      try { afterStop = await adapters.stateFingerprint(input); }
      catch { releaseLock = false; return result("rollback-state-unverified", { failure: code, rollbackPerformed: false, maintenanceRetained: true }); }
      if (safeStateFingerprint !== afterStop) {
        releaseLock = false; return result("rollback-state-changed", { failure: code, rollbackPerformed: false, maintenanceRetained: true });
      }
    }
    try {
      if (movedOld) {
        const identity = await adapters.gitIdentity(previous);
        if (!identity.clean || identity.commit !== plan.previousCommit) fail("adoption_rollback_source_changed");
        if (plain(plan.rollback.digest) && JSON.stringify(buildTreeDigest(path.join(previous, "interfaces/control-center/.next"))) !== JSON.stringify(plan.rollback.digest)) fail("adoption_rollback_build_changed");
      }
      if (stateTouched && snapshotReady) {
        if (!sealedManifestHash || hashFile(manifestPath) !== sealedManifestHash) fail("adoption_rollback_manifest_changed");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (manifest.owner !== owner || manifest.plan.planHash !== plan.planHash) fail("adoption_rollback_manifest_changed");
        verifyStateSnapshot(stateCopy, manifest);
        const savedService = path.join(input.backupRoot, manifest.service.filename);
        if (!existsSync(savedService) || lstatSync(savedService).isSymbolicLink() || hashFile(savedService) !== manifest.service.sha256) fail("adoption_service_snapshot_changed");
      }
      if (switched) renameSync(input.codeRoot, failed);
      if (movedOld) renameSync(previous, input.codeRoot);
      if (stateTouched && snapshotReady) {
        const failedState = path.join(input.backupRoot, "failed-state");
        renameSync(input.stateRoot, failedState);
        cpSync(stateCopy, input.stateRoot, { recursive: true, dereference: false, preserveTimestamps: true });
        for (const name of STATE_EXCLUDED) {
          if (existsSync(path.join(failedState, name))) renameSync(path.join(failedState, name), path.join(input.stateRoot, name));
        }
      }
      if ((await adapters.restoreService(input, input.backupRoot))?.ok !== true) fail("adoption_service_restore_failed");
      if ((await adapters.manager("start", input))?.ok !== true || (await adapters.health(plan.previousCommit, input))?.ok !== true) fail("adoption_rollback_health_failed");
      return result("rolled-back", { failure: code, rollbackPerformed: true });
    } catch (rollbackError) {
      releaseLock = false; return result("rollback-incomplete", { failure: code,
        rollbackFailure: rollbackError instanceof InstanceAdoptionError ? rollbackError.code : "adoption_rollback_failed",
        rollbackPerformed: false, maintenanceRetained: true });
    }
  } finally {
    if (locked && releaseLock) releaseNeuralDeepReleaseLock(input.stateRoot, owner);
  }
}
