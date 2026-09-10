import { createHash, randomUUID } from 'node:crypto';

export const VOICE_SCHEMA = `
CREATE TABLE IF NOT EXISTS voice_operations (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, turn_id TEXT NOT NULL,
  name TEXT NOT NULL, request_hash TEXT NOT NULL, task_id TEXT,
  status TEXT NOT NULL, created_at TEXT NOT NULL, result TEXT, worker_pid INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS voice_turns (
  session_id TEXT NOT NULL, id TEXT NOT NULL, request_hash TEXT NOT NULL,
  status TEXT NOT NULL, created_at TEXT NOT NULL, worker_pid INTEGER NOT NULL, PRIMARY KEY(session_id,id)
);
CREATE TABLE IF NOT EXISTS voice_http_requests (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, turn_id TEXT NOT NULL,
  kind TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, metadata TEXT NOT NULL,
  accounting_pending INTEGER NOT NULL DEFAULT 0
);`;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH = /^[a-f0-9]{64}$/;
function valid(...ids) {
  if (!ids.every((id) => ID.test(id)))
    throw new Error('voice_identity_invalid');
}
export function stableVoiceJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableVoiceJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableVoiceJson(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const voiceRequestHash = (value) =>
  createHash('sha256').update(stableVoiceJson(value)).digest('hex');
export const voiceOperationId = (session, turn, step, ordinal) =>
  `op_${voiceRequestHash([session, turn, step, ordinal]).slice(0, 48)}`;
function operation(row) {
  return row
    ? { ...row, result: row.result ? JSON.parse(row.result) : null }
    : null;
}

/** Shares the admission transaction boundary; never stores audio or full prompts. */
export class NeuralDeepVoiceJournal {
  constructor(store) {
    this.store = store;
    this.db = store.db;
  }
  reserveOperation({ id, sessionId, turnId, name, args }) {
    valid(id, sessionId, turnId, name);
    const requestHash = voiceRequestHash({ sessionId, turnId, name, args });
    return this.store.transaction(() => {
      const prior = this.operation(id);
      if (prior) {
        if (prior.request_hash !== requestHash)
          throw new Error('voice_operation_conflict');
        return { ...prior, dispatch: false };
      }
      const taskId =
        name === 'run_codex_task'
          ? `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
          : null;
      this.db
        .prepare(
          "INSERT INTO voice_operations VALUES(?,?,?,?,?,?,'accepted',?,NULL,?)",
        )
        .run(
          id,
          sessionId,
          turnId,
          name,
          requestHash,
          taskId,
          new Date().toISOString(),
          process.pid,
        );
      return { ...this.operation(id), dispatch: true };
    });
  }
  operation(id) {
    valid(id);
    return operation(
      this.db.prepare('SELECT * FROM voice_operations WHERE id=?').get(id),
    );
  }
  finishOperation(id, result) {
    valid(id);
    const encoded = JSON.stringify(result);
    if (Buffer.byteLength(encoded) > 256 * 1024)
      throw new Error('voice_operation_result_too_large');
    this.store.transaction(() => {
      const prior = this.operation(id);
      if (!prior) throw new Error('voice_operation_missing');
      if (prior.status !== 'accepted') {
        if (stableVoiceJson(prior.result) !== stableVoiceJson(result))
          throw new Error('voice_operation_result_conflict');
        return;
      }
      this.db
        .prepare('UPDATE voice_operations SET status=?,result=? WHERE id=?')
        .run(
          result?.ok === true ? 'completed' : 'recovery_required',
          encoded,
          id,
        );
    });
    return this.operation(id);
  }
  reserveTurn(sessionId, id, requestHash) {
    valid(sessionId, id);
    if (!HASH.test(requestHash)) throw new Error('voice_hash_invalid');
    return this.store.transaction(() => {
      const prior = this.turn(sessionId, id);
      if (prior) {
        if (prior.request_hash !== requestHash)
          throw new Error('voice_turn_conflict');
        return { ...prior, dispatch: false };
      }
      this.db
        .prepare("INSERT INTO voice_turns VALUES(?,?,?,'accepted',?,?)")
        .run(sessionId, id, requestHash, new Date().toISOString(), process.pid);
      return { ...this.turn(sessionId, id), dispatch: true };
    });
  }
  turn(sessionId, id) {
    valid(sessionId, id);
    return (
      this.db
        .prepare('SELECT * FROM voice_turns WHERE session_id=? AND id=?')
        .get(sessionId, id) || null
    );
  }
  finishTurn(sessionId, id, status) {
    valid(sessionId, id);
    if (!['completed', 'interrupted', 'failed'].includes(status))
      throw new Error('voice_turn_status_invalid');
    this.db
      .prepare(
        "UPDATE voice_turns SET status=? WHERE session_id=? AND id=? AND status='accepted'",
      )
      .run(status, sessionId, id);
  }
  claimRequest({ id, sessionId, turnId, kind, requestHash, metadata = {} }) {
    valid(id, sessionId, turnId);
    if (!['llm', 'stt', 'tts'].includes(kind) || !HASH.test(requestHash))
      throw new Error('voice_request_invalid');
    this.store.transaction(() => {
      if (this.request(id)) throw new Error('voice_request_replay_blocked');
      this.db
        .prepare(
          "INSERT INTO voice_http_requests VALUES(?,?,?,?,?,'dispatching',?,NULL,?,0)",
        )
        .run(
          id,
          sessionId,
          turnId,
          kind,
          requestHash,
          new Date().toISOString(),
          JSON.stringify(metadata),
        );
    });
    return this.request(id);
  }
  request(id) {
    valid(id);
    const row = this.db
      .prepare('SELECT * FROM voice_http_requests WHERE id=?')
      .get(id);
    return row ? { ...row, metadata: JSON.parse(row.metadata) } : null;
  }
  finishRequest(id, status, metadata, accountingPending = false) {
    valid(id);
    if (!['completed', 'failed', 'interrupted'].includes(status))
      throw new Error('voice_request_status_invalid');
    const prior = this.request(id);
    if (!prior) throw new Error('voice_request_missing');
    this.db
      .prepare(
        "UPDATE voice_http_requests SET status=?,finished_at=?,metadata=?,accounting_pending=? WHERE id=? AND status='dispatching'",
      )
      .run(
        status,
        new Date().toISOString(),
        JSON.stringify({ ...prior.metadata, ...metadata }),
        accountingPending ? 1 : 0,
        id,
      );
  }
  pendingAccounting() {
    return this.db
      .prepare('SELECT id FROM voice_http_requests WHERE accounting_pending=1')
      .all()
      .map((row) => this.request(row.id));
  }
  accounted(id) {
    valid(id);
    this.db
      .prepare('UPDATE voice_http_requests SET accounting_pending=0 WHERE id=?')
      .run(id);
  }
}
