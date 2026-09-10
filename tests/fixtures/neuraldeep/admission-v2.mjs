// Frozen pre-host-resource writer from 681567b08c05c581b240163ed8be9d8bc991bff7; only import paths are adapted.
// Verifies that a barrier-aware but host-unaware writer refuses the new schema.
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { processSnapshot, processTreeExited } from "../../../scripts/neuraldeep/process-snapshot.mjs";
import { normalizeResourceClaims } from "../../../scripts/neuraldeep/execution-resources.mjs";
import { HANDOFF_SCHEMA, HANDOFF_ELIGIBLE, NeuralDeepHandoffBarriers } from "../../../scripts/neuraldeep/handoff-barriers.mjs";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SCOPE = /^[a-f0-9]{24,64}$/;
const STATUSES = new Set(["queued", "active", "completed", "failed", "cancelled", "waiting_for_provider", "waiting_for_operator", "resume_confirmation_required"]);
const HELD = "('active','resume_confirmation_required')";
export const coordinationHash = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 24);

export function neuralDeepCoordinationPaths(stateRoot, codeRoot) {
  const root = path.resolve(stateRoot);
  const directory = root === path.resolve(codeRoot || root) ? path.join(root, ".private", "codex-chat") : path.join(root, "codex-chat");
  return { databasePath: path.join(directory, "admission.sqlite"), legacyPath: path.join(directory, "admission-registry.json") };
}

function privateDatabase(file) {
  if (file === ":memory:") return;
  const directory = path.dirname(path.resolve(file));
  for (let current = directory; current !== path.dirname(current); current = path.dirname(current)) {
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    // macOS exposes its system temporary directories through these fixed aliases.
    const systemAlias = process.platform === "darwin" && ["/var", "/tmp"].includes(current)
      && stat.isSymbolicLink() && realpathSync(current) === `/private${current}`;
    if (!systemAlias && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error("admission_storage_identity_invalid");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const entry of [file, `${file}-wal`, `${file}-shm`]) {
    if (existsSync(entry) && (lstatSync(entry).isSymbolicLink() || !lstatSync(entry).isFile())) throw new Error("admission_storage_identity_invalid");
  }
}

function validateEntry(entry) {
  if (!entry || !ID.test(entry.attemptId) || !ID.test(entry.workloadId)
    || !["task_chat", "voice", "delivery"].includes(entry.surface)
    || !SCOPE.test(entry.coordinationKeyHash) || !STATUSES.has(entry.status)
    || !Number.isFinite(Date.parse(entry.queuedAt))) throw new Error("admission_registry_invalid");
}

function entry(row) {
  return row ? { attemptId: row.id, surface: row.surface, workloadId: row.workload, coordinationKeyHash: row.scope,
    status: row.status, queuedAt: row.queued_at, admittedAt: row.admitted_at, finishedAt: row.finished_at,
    ownerToken: row.owner, generation: row.generation, workerId: row.worker, sessionKeyHash: row.session_scope,
    payload: row.payload ? JSON.parse(row.payload) : null } : null;
}

/** A single private transactional authority for CLI admission and durable intents. */
export class NeuralDeepCoordinationStore {
  constructor({ databasePath = ":memory:", legacyPath = null, workerId = `worker_${randomUUID()}` } = {}) {
    privateDatabase(databasePath);
    this.workerId = workerId;
    this.db = new DatabaseSync(databasePath);
    this.handoffs = new NeuralDeepHandoffBarriers(this);
    try {
    if (databasePath !== ":memory:") chmodSync(databasePath, 0o600);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    if (![0, 1, 2].includes(version)) throw new Error("admission_schema_unsupported");
    this.transaction(() => {
      this.db.exec(`CREATE TABLE IF NOT EXISTS coordination_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL,
          surface TEXT NOT NULL, workload TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL,
          queued_at TEXT NOT NULL, admitted_at TEXT, finished_at TEXT, owner TEXT, generation INTEGER NOT NULL DEFAULT 0,
          worker TEXT, worker_pid INTEGER, priority INTEGER NOT NULL DEFAULT 0, session_scope TEXT, payload TEXT);
        CREATE INDEX IF NOT EXISTS attempts_scope_status ON attempts(scope,status,priority,sequence);
        CREATE INDEX IF NOT EXISTS attempts_status ON attempts(status,sequence);
        CREATE INDEX IF NOT EXISTS attempts_session ON attempts(session_scope,status);
        CREATE TABLE IF NOT EXISTS paused_scopes(scope TEXT PRIMARY KEY,reason TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS logical_owners(scope TEXT PRIMARY KEY, owner TEXT NOT NULL, generation INTEGER NOT NULL, held INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS attempt_logical_owners(attempt_id TEXT NOT NULL,scope TEXT NOT NULL,owner TEXT NOT NULL,generation INTEGER NOT NULL,PRIMARY KEY(attempt_id,scope));
        CREATE TABLE IF NOT EXISTS runtime_receipts(id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,receipt TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runtime_owners(admission_id TEXT PRIMARY KEY,run_id TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS provider_dispatches(run_id TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL,metadata TEXT NOT NULL,PRIMARY KEY(run_id,request_hash));
        CREATE TABLE IF NOT EXISTS session_controls(scope TEXT PRIMARY KEY,owner TEXT NOT NULL,worker_pid INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attempt_resources(attempt_id TEXT NOT NULL,kind TEXT NOT NULL,resource TEXT NOT NULL,mode TEXT NOT NULL,PRIMARY KEY(attempt_id,kind,resource));
        CREATE TABLE IF NOT EXISTS resource_claims(attempt_id TEXT NOT NULL,surface TEXT NOT NULL,workload TEXT NOT NULL,kind TEXT NOT NULL,resource TEXT NOT NULL,mode TEXT NOT NULL,held INTEGER NOT NULL,PRIMARY KEY(attempt_id,kind,resource));
        CREATE INDEX IF NOT EXISTS resource_claims_held ON resource_claims(held,kind,resource);
        ${HANDOFF_SCHEMA}
        PRAGMA user_version=2;`);
      if (!this.db.prepare("SELECT value FROM coordination_meta WHERE key='legacy_migrated'").get()) {
        if (legacyPath && existsSync(legacyPath)) {
          const stat = lstatSync(legacyPath);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error("admission_registry_invalid");
          let legacy;
          try { legacy = JSON.parse(readFileSync(legacyPath, "utf8")); } catch { throw new Error("admission_registry_invalid"); }
          if (legacy.version !== 1 || !Array.isArray(legacy.attempts)) throw new Error("admission_registry_invalid");
          for (const old of legacy.attempts) {
            validateEntry(old);
            const status = ["queued", "active"].includes(old.status) ? "resume_confirmation_required" : old.status;
            this.db.prepare(`INSERT INTO attempts(id,request_hash,surface,workload,scope,status,queued_at,admitted_at,finished_at)
              VALUES(?,?,?,?,?,?,?,?,?)`).run(old.attemptId, "legacy", old.surface, old.workloadId, old.coordinationKeyHash,
              status, old.queuedAt, old.admittedAt || null, old.finishedAt || null);
            if (["waiting_for_operator", "waiting_for_provider", "resume_confirmation_required"].includes(status)) this.pause(old.coordinationKeyHash, status);
          }
        }
        this.db.prepare("INSERT INTO coordination_meta(key,value) VALUES('legacy_migrated',?)").run(new Date().toISOString());
      }
    });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  transaction(work) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = work(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  enqueue(input) {
    validateEntry({ ...input, status: "queued" });
    if (input.sessionKeyHash != null && !SCOPE.test(input.sessionKeyHash)) throw new Error("admission_session_invalid");
    const payload = input.payload == null ? null : JSON.stringify(input.payload);
    if (payload && Buffer.byteLength(payload) > 1024 * 1024) throw new Error("admission_intent_too_large");
    const identity = [input.surface, input.workloadId, input.coordinationKeyHash, payload];
    const resources=normalizeResourceClaims(input.resources);
    if(resources.length)identity.push(resources);
    if (input.sessionKeyHash) identity.push(input.sessionKeyHash);
    const hash = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
    return this.transaction(() => {
      const prior = this.db.prepare("SELECT * FROM attempts WHERE id=?").get(input.attemptId);
      if (prior) {
        if (prior.request_hash !== hash) throw new Error("admission_attempt_conflict");
        return { ...entry(prior), duplicate: true };
      }
      this.db.prepare(`INSERT INTO attempts(id,request_hash,surface,workload,scope,status,queued_at,worker,worker_pid,priority,payload,session_scope)
        VALUES(?,?,?,?,?,'queued',?,?,?,?,?,?)`).run(input.attemptId, hash, input.surface, input.workloadId,
        input.coordinationKeyHash, input.queuedAt, this.workerId, process.pid, input.predecessorPriority ? -1 : 0, payload, input.sessionKeyHash || null);
      for(const resource of resources)this.db.prepare("INSERT INTO attempt_resources(attempt_id,kind,resource,mode) VALUES(?,?,?,?)")
        .run(input.attemptId,resource.kind,resource.key,resource.mode);
      if (input.resumePausedKey) {
        for (const scope of [input.coordinationKeyHash,input.sessionKeyHash].filter(Boolean)) {
          const logical = this.db.prepare("SELECT owner FROM logical_owners WHERE scope=? AND held=1").get(scope);
          if (logical && logical.owner !== input.workloadId) throw new Error("admission_owner_conflict");
          this.resume(scope);
        }
      }
      return { ...this.get(input.attemptId), duplicate: false };
    });
  }

  get(id) { return entry(this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id)); }

  claim(id, limit = 1) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64) throw new Error("admission_limit_invalid");
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
      if (!row || row.status !== "queued" || row.worker !== this.workerId) return null;
      if (!this.handoffs.allows(row)) return null;
      if(this._resourceConflict(row))return null;
      if (this.db.prepare("SELECT 1 FROM session_controls WHERE scope=?").get(row.scope)) return null;
      if (this.db.prepare("SELECT 1 FROM paused_scopes WHERE scope=?").get(row.scope)) return null;
      const logical = this.db.prepare("SELECT owner FROM logical_owners WHERE scope=? AND held=1").get(row.scope);
      if (logical && logical.owner !== row.workload) return null;
      if (row.session_scope) {
        if (this.db.prepare("SELECT 1 FROM paused_scopes WHERE scope=?").get(row.session_scope)) return null;
        if (this.db.prepare("SELECT 1 FROM session_controls WHERE scope=?").get(row.session_scope)) return null;
        const owner = this.db.prepare("SELECT owner FROM logical_owners WHERE scope=? AND held=1").get(row.session_scope);
        if (owner && owner.owner !== row.workload) return null;
        if (this.db.prepare(`SELECT 1 FROM attempts WHERE session_scope=? AND status IN ${HELD}`).get(row.session_scope)) return null;
        const firstAlias = this.db.prepare(`SELECT a.id FROM attempts a WHERE a.session_scope=? AND a.status='queued'
          AND (? IS NULL OR a.workload=?) AND ${HANDOFF_ELIGIBLE} ORDER BY a.priority,a.sequence LIMIT 1`).get(row.session_scope,owner?.owner || null,owner?.owner || null);
        if (firstAlias?.id !== id) return null;
      }
      if (this.db.prepare(`SELECT count(*) AS count FROM attempts WHERE status IN ${HELD}`).get().count >= limit) return null;
      if (this.db.prepare(`SELECT 1 FROM attempts WHERE scope=? AND status IN ${HELD}`).get(row.scope)) return null;
      const first = this.db.prepare(`SELECT a.id FROM attempts a WHERE a.scope=? AND a.status='queued' AND (? IS NULL OR a.workload=?) AND ${HANDOFF_ELIGIBLE} ORDER BY a.priority,a.sequence LIMIT 1`)
        .get(row.scope,logical?.owner || null,logical?.owner || null);
      if (first?.id !== id) return null;
      if (row.surface === "voice") {
        for (const scope of new Set([row.scope,row.session_scope].filter(Boolean))) this._holdAttemptOwner(row,scope);
      }
      const token = randomUUID();
      this.db.prepare("UPDATE attempts SET status='active',owner=?,generation=generation+1,admitted_at=? WHERE id=? AND status='queued'")
        .run(token, new Date().toISOString(), id);
      this.db.prepare("INSERT OR REPLACE INTO resource_claims(attempt_id,surface,workload,kind,resource,mode,held) SELECT attempt_id,?,?,kind,resource,mode,1 FROM attempt_resources WHERE attempt_id=?")
        .run(row.surface,row.workload,id);
      return this.get(id);
    });
  }

  finish(id, token, outcome = "completed") {
    if (!["completed", "failed", "cancelled", "waiting_for_provider", "waiting_for_operator"].includes(outcome)) throw new Error("admission_outcome_invalid");
    const result = this.transaction(() => {
      const current = this.get(id);
      if (!current || current.status !== "active" || current.ownerToken !== token) return false;
      if (outcome === "waiting_for_provider" && this.db.prepare("SELECT 1 FROM runtime_owners WHERE admission_id=?").get(id)) throw new Error("admission_wait_after_runtime_dispatch");
      const runtime = this.db.prepare("SELECT run_id FROM runtime_owners WHERE admission_id=?").get(id);
      if (runtime && !this._reconcileRuntimeRunExit(runtime.run_id)) {
        this.db.prepare("UPDATE attempts SET status='resume_confirmation_required' WHERE id=?").run(id);
        for (const scope of new Set([current.coordinationKeyHash,current.sessionKeyHash].filter(Boolean))) this.pause(scope,"runtime_exit_unconfirmed");
        return "unconfirmed";
      }
      this.db.prepare("UPDATE attempts SET status=?,finished_at=? WHERE id=? AND owner=?").run(outcome, new Date().toISOString(), id, token);
      if(outcome==="waiting_for_provider")this.db.prepare("UPDATE resource_claims SET held=0 WHERE attempt_id=?").run(id);
      if(["completed","cancelled"].includes(outcome))this._releaseWorkloadResources(current.workloadId,current.surface);
      if (current.surface === "task_chat" && ["completed","cancelled"].includes(outcome)) this.handoffs._releaseWorkload(current.workloadId,outcome);
      if (["failed", "waiting_for_provider", "waiting_for_operator"].includes(outcome)) {
        for (const scope of new Set([current.coordinationKeyHash,current.sessionKeyHash].filter(Boolean))) this.pause(scope, outcome);
      }
      if (["completed","cancelled"].includes(outcome)) this._releaseAttemptOwners(id);
      return true;
    });
    if (result === "unconfirmed") throw new Error("admission_runtime_exit_unconfirmed");
    return result;
  }

  requeueUnstarted(id, token) {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
      if (!row || row.status !== "waiting_for_provider" || row.owner !== token || row.worker !== this.workerId
        || this.db.prepare("SELECT 1 FROM runtime_owners WHERE admission_id=?").get(id)) throw new Error("admission_unstarted_resume_conflict");
      const scopes = new Set([row.scope,row.session_scope].filter(Boolean));
      for (const scope of scopes) {
        const pause = this.db.prepare("SELECT reason FROM paused_scopes WHERE scope=?").get(scope);
        if (pause && pause.reason !== "waiting_for_provider") throw new Error("admission_unstarted_resume_conflict");
      }
      this.db.prepare("UPDATE attempts SET status='queued',owner=NULL,finished_at=NULL WHERE id=? AND owner=?").run(id,token);
      for (const scope of scopes) this.resume(scope);
      return this.get(id);
    });
  }

  cancelUnstarted(id, token) {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
      if (!row || row.status !== "waiting_for_provider" || row.owner !== token || row.worker !== this.workerId
        || this.db.prepare("SELECT 1 FROM runtime_owners WHERE admission_id=?").get(id)) return false;
      this.db.prepare("UPDATE attempts SET status='cancelled',finished_at=? WHERE id=? AND owner=?").run(new Date().toISOString(),id,token);
      for (const scope of new Set([row.scope,row.session_scope].filter(Boolean))) {
        if (this.db.prepare("SELECT reason FROM paused_scopes WHERE scope=?").get(scope)?.reason === "waiting_for_provider") this.resume(scope);
      }
      this._releaseAttemptOwners(id);
      if (row.surface === "task_chat") this.handoffs._releaseWorkload(row.workload,"cancelled");
      return true;
    });
  }

  cancelQueued(id) {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM attempts WHERE id=? AND status='queued'").get(id);
      if (!row) return false;
      this.db.prepare("UPDATE attempts SET status='cancelled',finished_at=? WHERE id=?").run(new Date().toISOString(),id);
      if (row.surface === "task_chat") this.handoffs._releaseWorkload(row.workload,"cancelled");
      return true;
    });
  }

  pause(scope, reason) {
    if (!SCOPE.test(scope)) throw new Error("admission_scope_invalid");
    this.db.prepare(`INSERT INTO paused_scopes(scope,reason) VALUES(?,?) ON CONFLICT(scope)
      DO UPDATE SET reason=excluded.reason,revision=paused_scopes.revision+1`).run(scope, String(reason).slice(0, 100));
  }

  resume(scope) { this.db.prepare("DELETE FROM paused_scopes WHERE scope=?").run(scope); }

  holdLogicalOwner(scope, owner, expectedGeneration = null) {
    if (!SCOPE.test(scope) || !ID.test(owner)) throw new Error("admission_owner_invalid");
    return this.transaction(() => {
      const current = this.db.prepare("SELECT * FROM logical_owners WHERE scope=?").get(scope);
      if (current?.held && (current.owner !== owner || (expectedGeneration !== null && current.generation !== expectedGeneration))) throw new Error("admission_owner_conflict");
      if (!current) this.db.prepare("INSERT INTO logical_owners(scope,owner,generation) VALUES(?,?,1)").run(scope, owner);
      else if (!current.held) this.db.prepare("UPDATE logical_owners SET owner=?,generation=generation+1,held=1 WHERE scope=?").run(owner, scope);
      return this.db.prepare("SELECT * FROM logical_owners WHERE scope=?").get(scope);
    });
  }

  _holdAttemptOwner(row, scope) {
    const current = this.db.prepare("SELECT * FROM logical_owners WHERE scope=?").get(scope);
    if (current?.held && current.owner !== row.workload) throw new Error("admission_owner_conflict");
    const prior = this.db.prepare("SELECT generation FROM attempt_logical_owners WHERE attempt_id=? AND scope=?").get(row.id,scope);
    if (prior && current?.held && prior.generation === current.generation) return;
    if (!current) this.db.prepare("INSERT INTO logical_owners(scope,owner,generation) VALUES(?,?,1)").run(scope,row.workload);
    else this.db.prepare("UPDATE logical_owners SET owner=?,generation=generation+1,held=1 WHERE scope=?").run(row.workload,scope);
    const owner = this.db.prepare("SELECT * FROM logical_owners WHERE scope=?").get(scope);
    this.db.prepare("INSERT OR REPLACE INTO attempt_logical_owners(attempt_id,scope,owner,generation) VALUES(?,?,?,?)")
      .run(row.id,scope,row.workload,owner.generation);
  }

  _releaseAttemptOwners(id) {
    for (const owner of this.db.prepare("SELECT * FROM attempt_logical_owners WHERE attempt_id=?").all(id)) {
      this.releaseLogicalOwner(owner.scope,owner.owner,owner.generation);
    }
  }

  releaseLogicalOwner(scope, owner, generation) {
    return this.db.prepare("UPDATE logical_owners SET held=0 WHERE scope=? AND owner=? AND generation=? AND held=1").run(scope, owner, generation).changes > 0;
  }

  logicalOwner(scope) {
    if (!SCOPE.test(scope)) throw new Error("admission_scope_invalid");
    return this.db.prepare("SELECT owner,generation,held FROM logical_owners WHERE scope=?").get(scope) || null;
  }

  bindSession(id, token, sessionKeyHash) {
    if (!SCOPE.test(sessionKeyHash)) throw new Error("admission_session_invalid");
    return this.transaction(() => this._bindSession(id,token,sessionKeyHash));
  }

  _bindSession(id, token, sessionKeyHash) {
      const current = this.get(id);
      if (current?.status !== "active" || current.ownerToken !== token) throw new Error("admission_owner_conflict");
      if (current.sessionKeyHash && current.sessionKeyHash !== sessionKeyHash) throw new Error("admission_session_identity_changed");
      const logical = this.db.prepare("SELECT owner FROM logical_owners WHERE scope=? AND held=1").get(sessionKeyHash);
      if (logical && logical.owner !== current.workloadId) throw new Error("admission_session_conflict");
      if (this.db.prepare("SELECT 1 FROM session_controls WHERE scope=?").get(sessionKeyHash)) throw new Error("admission_session_conflict");
      if (this.db.prepare(`SELECT 1 FROM attempts WHERE id<>? AND session_scope=? AND status IN ${HELD}`).get(id, sessionKeyHash)) throw new Error("admission_session_conflict");
      this.handoffs._bindSession(this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id),sessionKeyHash);
      this.db.prepare("UPDATE attempts SET session_scope=? WHERE id=? AND owner=?").run(sessionKeyHash, id, token);
      if (current.surface === "voice") this._holdAttemptOwner({id,workload:current.workloadId},sessionKeyHash);
  }

  reconcileWorkload(workload, outcome = "failed") {
    if (!ID.test(workload) || !["failed","cancelled"].includes(outcome)) throw new Error("admission_reconciliation_invalid");
    return this.transaction(() => {
      const rows = this.db.prepare("SELECT * FROM attempts WHERE workload=? ORDER BY sequence").all(workload);
      for (const row of rows) {
        const runtime = this.db.prepare("SELECT run_id FROM runtime_owners WHERE admission_id=?").get(row.id);
        if (runtime && !this._reconcileRuntimeRunExit(runtime.run_id)) throw new Error("admission_runtime_exit_unconfirmed");
        if (!runtime && ["active","resume_confirmation_required"].includes(row.status)) {
          let absent = false;
          if (row.worker_pid) try { process.kill(row.worker_pid,0); } catch (error) { absent = error.code === "ESRCH"; }
          if (!absent) throw new Error("admission_runtime_exit_unconfirmed");
        }
      }
      for (const row of rows) {
        if (["active","queued","resume_confirmation_required","waiting_for_provider","waiting_for_operator"].includes(row.status)) {
          this.db.prepare("UPDATE attempts SET status=?,finished_at=? WHERE id=?").run(outcome,new Date().toISOString(),row.id);
        }
        if (outcome === "cancelled") this._releaseAttemptOwners(row.id);
      }
      if (outcome === "cancelled") {
        this.handoffs._releaseWorkload(workload,outcome);
        for(const surface of new Set(rows.map(row=>row.surface)))this._releaseWorkloadResources(workload,surface);
        for (const scope of new Set(rows.flatMap(row=>[row.scope,row.session_scope]).filter(Boolean))) {
          if (!this.db.prepare(`SELECT 1 FROM attempts WHERE (scope=? OR session_scope=?) AND status IN ${HELD}`).get(scope,scope)
            && !this.db.prepare("SELECT 1 FROM logical_owners WHERE scope=? AND held=1").get(scope)) this.resume(scope);
        }
      }
      return rows.length;
    });
  }

  beginRuntimeRun({ runId, requestHash, receipt }) {
    if (!ID.test(runId) || !/^[a-f0-9]{64}$/.test(requestHash)) throw new Error("runtime_receipt_identity_invalid");
    return this.transaction(() => {
      const previous = this.db.prepare("SELECT request_hash FROM runtime_receipts WHERE id=?").get(runId);
      if (previous) throw new Error(previous.request_hash === requestHash ? "neuraldeep_run_already_dispatched" : "neuraldeep_run_identity_conflict");
      const value = { ...receipt, run_id: runId, status: "dispatching", usage_status: "unknown", created_at: new Date().toISOString() };
      this.db.prepare("INSERT INTO runtime_receipts(id,request_hash,receipt) VALUES(?,?,?)").run(runId, requestHash, JSON.stringify(value));
      return value;
    });
  }

  updateRuntimeRun(runId, update) {
    return this.transaction(() => this._updateRuntimeRun(runId,update));
  }

  _updateRuntimeRun(runId, update) {
      const current = this.runtimeRun(runId);
      if (!current) throw new Error("runtime_receipt_missing");
      const value = { ...current, ...update, run_id: runId, updated_at: new Date().toISOString() };
      this.db.prepare("UPDATE runtime_receipts SET receipt=? WHERE id=?").run(JSON.stringify(value), runId);
      return value;
  }

  claimProviderRequest(runId, requestHash, metadata = {}) {
    if (!/^[a-f0-9]{64}$/.test(requestHash)) throw new Error("provider_request_hash_invalid");
    return this.transaction(() => {
      if (!this.runtimeRun(runId)) throw new Error("runtime_receipt_missing");
      if (this.db.prepare("SELECT 1 FROM provider_dispatches WHERE run_id=? AND request_hash=?").get(runId, requestHash)) {
        throw Object.assign(new Error("A possibly dispatched provider request cannot be replayed automatically."), { code: "provider_request_replay_blocked", statusCode: 409 });
      }
      this.db.prepare("INSERT INTO provider_dispatches VALUES(?,?,?,?)").run(runId, requestHash, new Date().toISOString(), JSON.stringify(metadata));
      return this.db.prepare("SELECT count(*) AS count FROM provider_dispatches WHERE run_id=?").get(runId).count;
    });
  }

  runtimeRun(runId) {
    const row = this.db.prepare("SELECT receipt FROM runtime_receipts WHERE id=?").get(runId);
    return row ? JSON.parse(row.receipt) : null;
  }

  /** Read-only process reconciliation. A saved PID never grants permission to kill. */
  reconcileRuntimeRunExit(runId) {
    return this.transaction(() => this._reconcileRuntimeRunExit(runId));
  }

  _reconcileRuntimeRunExit(runId) {
    const run = this.runtimeRun(runId);
    if (!run) return false;
    if (run.process_exited === true && (run.process_protocol !== 1
      || (run.process_tree_exited === true && run.adapter_closed === true))) return true;
    if (run.process_protocol !== 1 || !Number.isSafeInteger(run.worker_pid) || typeof run.worker_started !== "string") return false;
    let snapshot;
    try { snapshot = processSnapshot(); } catch { return false; }
    if (snapshot.some(row => row.pid === run.worker_pid && row.started === run.worker_started && !row.state.startsWith("Z"))) return false;
    if (run.dispatch_authorized !== false && (run.dispatch_authorized !== true || !processTreeExited(run.process_evidence,snapshot))) return false;
    this._updateRuntimeRun(runId, { process_exited: true, process_tree_exited: true, adapter_closed: true,
      status: "interrupted", exit_evidence: "original_worker_absent_and_owned_session_empty", reconciled_at: new Date().toISOString() });
    return true;
  }

  assertAttemptRuntimeExited(id, token) {
    const attempt = this.get(id);
    if (attempt?.ownerToken !== token) throw new Error("admission_owner_conflict");
    const runtime = this.db.prepare("SELECT run_id FROM runtime_owners WHERE admission_id=?").get(id);
    if (runtime && !this.reconcileRuntimeRunExit(runtime.run_id)) throw new Error("admission_runtime_exit_unconfirmed");
  }

  attachRuntime(id, owner, runId, sessionKeyHash = null) {
    return this.transaction(() => {
      const admission = this.get(id);
      if (admission?.status !== "active" || admission.ownerToken !== owner) throw new Error("admission_runtime_owner_invalid");
      if (sessionKeyHash) {
        if (!SCOPE.test(sessionKeyHash)) throw new Error("admission_session_invalid");
        this._bindSession(id,owner,sessionKeyHash);
      }
      this.db.prepare("INSERT INTO runtime_owners(admission_id,run_id) VALUES(?,?)").run(id, runId);
      return admission;
    });
  }

  reconcileDeadWorkers() {
    return this.transaction(() => {
      const rows = this.db.prepare("SELECT * FROM attempts WHERE status IN ('active','queued')").all();
      let count = 0;
      for (const row of rows) {
        if (!row.worker_pid) continue;
        let absent = false;
        try { process.kill(row.worker_pid, 0); } catch (error) { absent = error.code === "ESRCH"; }
        if (!absent) continue;
        this.db.prepare("UPDATE attempts SET status='resume_confirmation_required' WHERE id=?").run(row.id);
        this.pause(row.scope, "worker_exit_requires_reconciliation");
        count += 1;
      }
      return count;
    });
  }

  acquireSessionControl(scope, owner) {
    if (!SCOPE.test(scope) || !ID.test(owner)) throw new Error("admission_owner_invalid");
    return this.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM handoff_scopes WHERE scope=?").get(scope)) return false;
      if (this.db.prepare(`SELECT 1 FROM attempts WHERE (scope=? OR session_scope=?) AND status IN ${HELD}`).get(scope,scope)) return false;
      if (this.db.prepare("SELECT 1 FROM logical_owners WHERE scope=? AND held=1").get(scope)) return false;
      const prior = this.db.prepare("SELECT * FROM session_controls WHERE scope=?").get(scope);
      if (prior) {
        let absent = false;
        try { process.kill(prior.worker_pid, 0); } catch (error) { absent = error.code === "ESRCH"; }
        if (!absent) return false;
        // This lock owns only the host operation. Its durable action receipt
        // still prevents a crash-lost paid action from being dispatched twice.
        this.db.prepare("DELETE FROM session_controls WHERE scope=? AND owner=?").run(scope, prior.owner);
      }
      this.db.prepare("INSERT INTO session_controls(scope,owner,worker_pid) VALUES(?,?,?)").run(scope, owner, process.pid);
      return true;
    });
  }

  releaseSessionControl(scope, owner) {
    return this.db.prepare("DELETE FROM session_controls WHERE scope=? AND owner=?").run(scope, owner).changes > 0;
  }

  _resourceConflict(row) {
    const match="(c.resource=? OR (?='path' AND (c.resource='/' OR ?='/' OR substr(?,1,length(c.resource)+1)=c.resource||'/' OR substr(c.resource,1,length(?)+1)=?||'/')))";
    for(const resource of this.db.prepare("SELECT * FROM attempt_resources WHERE attempt_id=?").all(row.id)){
      if(this.db.prepare(`SELECT 1 FROM resource_claims c WHERE c.held=1 AND c.kind=? AND NOT(c.surface=? AND c.workload=?)
        AND (c.mode='write' OR ?='write') AND ${match} LIMIT 1`)
        .get(resource.kind,row.surface,row.workload,resource.mode,resource.resource,resource.kind,resource.resource,resource.resource,resource.resource,resource.resource))return true;
    }
    return false;
  }

  _releaseWorkloadResources(workload,surface) {
    if(this.db.prepare(`SELECT 1 FROM attempts WHERE workload=? AND surface=? AND status IN ${HELD}`).get(workload,surface))return false;
    this.db.prepare("UPDATE resource_claims SET held=0 WHERE workload=? AND surface=?").run(workload,surface);
    return true;
  }

  resourceWaitReason(id) {
    const row=this.db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
    return row&&this._resourceConflict(row)?"workspace_conflict":null;
  }

  assertRuntimeResources(id,resources) {
    const expected=this.db.prepare("SELECT kind,resource AS key,mode FROM attempt_resources WHERE attempt_id=?").all(id);
    if(JSON.stringify(normalizeResourceClaims(expected))!==JSON.stringify(normalizeResourceClaims(resources)))throw new Error("runtime_resource_identity_conflict");
  }

  invalidateIdleOwner(scope, operationId) {
    if (!SCOPE.test(scope) || !ID.test(operationId)) throw new Error("admission_owner_invalid");
    return this.transaction(()=>this._invalidateIdleOwner(scope,operationId));
  }

  _invalidateIdleOwner(scope, operationId) {
      const key=`handoff:${scope}:${operationId}`;
      const prior=this.db.prepare("SELECT value FROM coordination_meta WHERE key=?").get(key);
      if(prior)return Number(prior.value);
      if(this.db.prepare(`SELECT 1 FROM attempts WHERE (scope=? OR session_scope=?) AND status IN ${HELD}`).get(scope,scope)
        ||this.db.prepare("SELECT 1 FROM logical_owners WHERE scope=? AND held=1").get(scope))throw new Error("admission_owner_conflict");
      const owner=this.db.prepare("SELECT generation FROM logical_owners WHERE scope=?").get(scope);
      const generation=(owner?.generation || 0)+1;
      this.db.prepare("INSERT INTO logical_owners(scope,owner,generation,held) VALUES(?,?,?,0) ON CONFLICT(scope) DO UPDATE SET generation=excluded.generation,held=0")
        .run(scope,`handoff_${operationId}`,generation);
      this.db.prepare("INSERT INTO coordination_meta(key,value) VALUES(?,?)").run(key,String(generation));
      return generation;
  }

  snapshot() {
    const rows = this.db.prepare(`SELECT * FROM attempts WHERE status IN ('active','queued','resume_confirmation_required') ORDER BY priority,sequence`).all().map(entry);
    return { active: rows.filter(r => r.status === "active"), queued: rows.filter(r => r.status === "queued"),
      unresolved: rows.filter(r => r.status === "resume_confirmation_required"),
      pausedCoordinationKeyHashes: this.db.prepare("SELECT scope FROM paused_scopes ORDER BY scope").all().map(r => r.scope) };
  }

  journal() {
    return { version: 1, updatedAt: new Date().toISOString(), attempts: this.db.prepare(`SELECT * FROM attempts
      WHERE status IN ('active','queued','resume_confirmation_required','waiting_for_provider','waiting_for_operator')
      OR sequence IN (SELECT sequence FROM attempts ORDER BY sequence DESC LIMIT 500) ORDER BY sequence`).all().map(entry) };
  }

  close() { this.db.close(); }
}
