import { createHash } from "node:crypto";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SCOPE = /^[a-f0-9]{24,64}$/;
const HELD = "('active','resume_confirmation_required')";

export const HANDOFF_SCHEMA = `
  CREATE TABLE IF NOT EXISTS handoff_barriers(id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,
    owner TEXT NOT NULL,topic_scope TEXT NOT NULL,session_scope TEXT,state TEXT NOT NULL,
    context TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT);
  CREATE TABLE IF NOT EXISTS handoff_scopes(scope TEXT PRIMARY KEY,barrier_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS handoff_predecessors(barrier_id TEXT NOT NULL,workload TEXT NOT NULL,
    PRIMARY KEY(barrier_id,workload));
  CREATE TABLE IF NOT EXISTS handoff_members(owner TEXT PRIMARY KEY,barrier_id TEXT NOT NULL,request_hash TEXT NOT NULL,state TEXT NOT NULL);
`;

export function handoffRequestHash({owner,topicScope,sessionScope=null,predecessors,context}) {
  return createHash("sha256").update(JSON.stringify([owner,topicScope,sessionScope,[...new Set(predecessors)].sort(),JSON.stringify(context)])).digest("hex");
}

// Used with the internal attempts alias `a`, including FIFO selection. A future
// Voice task must not jump ahead through predecessorPriority while this handoff
// waits for the specifically captured workflow(s).
export const HANDOFF_ELIGIBLE = `NOT EXISTS (
  SELECT 1 FROM handoff_scopes hs JOIN handoff_barriers hb ON hb.id=hs.barrier_id
  WHERE (hs.scope=a.scope OR hs.scope=a.session_scope) AND NOT (
    (hb.state='ready' AND a.surface='task_chat' AND EXISTS (SELECT 1 FROM handoff_members hm WHERE hm.barrier_id=hb.id AND hm.owner=a.workload AND hm.state='waiting')) OR
    (hb.state='reserved' AND a.surface='voice' AND EXISTS (
      SELECT 1 FROM handoff_predecessors hp WHERE hp.barrier_id=hb.id AND hp.workload=a.workload))))`;

export class NeuralDeepHandoffBarriers {
  constructor(store) { this.store = store; this.db = store.db; }

  get(id) {
    const row = this.db.prepare("SELECT * FROM handoff_barriers WHERE id=?").get(id);
    if (!row) return null;
    return { id: row.id, requestHash: row.request_hash, owner: row.owner,
      topicScope: row.topic_scope, sessionScope: row.session_scope, state: row.state,
      context: JSON.parse(row.context), predecessors: this.db.prepare("SELECT workload FROM handoff_predecessors WHERE barrier_id=? ORDER BY workload").all(id).map(x => x.workload) };
  }

  forScope(scope) {
    const row=this.db.prepare("SELECT barrier_id FROM handoff_scopes WHERE scope=?").get(scope);
    return row ? this.get(row.barrier_id) : null;
  }

  join(id,requestHash,owner,inputHash) {
    if (!ID.test(owner) || !/^[a-f0-9]{64}$/.test(inputHash)) throw new Error("handoff_context_invalid");
    return this.store.transaction(()=>{
      const barrier=this.get(id),prior=this.db.prepare("SELECT * FROM handoff_members WHERE owner=?").get(owner);
      if (prior) {
        if(prior.barrier_id!==id || prior.request_hash!==inputHash) throw new Error("handoff_idempotency_conflict");
        return prior.state;
      }
      if(!barrier || barrier.requestHash!==requestHash || !["reserved","ready"].includes(barrier.state)) throw new Error("handoff_context_changed");
      this.db.prepare("INSERT INTO handoff_members VALUES(?,?,?,'waiting')").run(owner,id,inputHash);
      return "waiting";
    });
  }

  reserve({ id, owner, topicScope, sessionScope = null, predecessors, context }) {
    if (!ID.test(id) || !ID.test(owner) || !SCOPE.test(topicScope) || (sessionScope !== null && !SCOPE.test(sessionScope))
      || !Array.isArray(predecessors) || !predecessors.length || predecessors.length > 100 || predecessors.some(x => !ID.test(x))) throw new Error("handoff_context_invalid");
    const allowed = [...new Set(predecessors)].sort(), body = JSON.stringify(context);
    if (!body || Buffer.byteLength(body) > 32 * 1024) throw new Error("handoff_context_invalid");
    const requestHash = handoffRequestHash({owner,topicScope,sessionScope,predecessors:allowed,context});
    return this.store.transaction(() => {
      const prior = this.get(id);
      if (prior) {
        if (prior.requestHash !== requestHash) throw new Error("handoff_idempotency_conflict");
        return prior;
      }
      for (const scope of new Set([topicScope, sessionScope].filter(Boolean))) {
        if (this.db.prepare("SELECT 1 FROM handoff_scopes WHERE scope=?").get(scope)
          || this.db.prepare("SELECT 1 FROM session_controls WHERE scope=?").get(scope)) throw new Error("handoff_scope_busy");
        const active = this.db.prepare(`SELECT surface,workload FROM attempts WHERE (scope=? OR session_scope=?) AND status IN ${HELD}`).all(scope,scope);
        if (active.some(row => row.surface !== "voice" || !allowed.includes(row.workload))) throw new Error("handoff_scope_busy");
        const logical = this.db.prepare("SELECT owner FROM logical_owners WHERE scope=? AND held=1").get(scope);
        if (logical && !allowed.includes(logical.owner)) throw new Error("handoff_scope_busy");
      }
      this.db.prepare("INSERT INTO handoff_barriers(id,request_hash,owner,topic_scope,session_scope,state,context,created_at) VALUES(?,?,?,?,?,'reserved',?,?)")
        .run(id,requestHash,owner,topicScope,sessionScope,body,new Date().toISOString());
      for (const scope of new Set([topicScope,sessionScope].filter(Boolean))) this.db.prepare("INSERT INTO handoff_scopes(scope,barrier_id) VALUES(?,?)").run(scope,id);
      for (const workload of allowed) this.db.prepare("INSERT INTO handoff_predecessors(barrier_id,workload) VALUES(?,?)").run(id,workload);
      this.db.prepare("INSERT INTO handoff_members VALUES(?,?,?,'waiting')").run(owner,id,requestHash);
      return this.get(id);
    });
  }

  allows(row) {
    for (const scope of new Set([row.scope,row.session_scope].filter(Boolean))) {
      const ref = this.db.prepare("SELECT barrier_id FROM handoff_scopes WHERE scope=?").get(scope);
      if (!ref) continue;
      const barrier = this.get(ref.barrier_id);
      if (!barrier || !(barrier.state === "ready" && row.surface === "task_chat" && this.db.prepare("SELECT 1 FROM handoff_members WHERE barrier_id=? AND owner=? AND state='waiting'").get(barrier.id,row.workload)
        || barrier.state === "reserved" && row.surface === "voice" && barrier.predecessors.includes(row.workload))) return false;
    }
    return true;
  }

  // Internal hooks run inside the admission store's existing transaction.
  _bindSession(row, sessionScope) {
    if (!this.allows({ ...row, session_scope: sessionScope })) throw new Error("handoff_session_busy");
    const ref = this.db.prepare("SELECT barrier_id FROM handoff_scopes WHERE scope=?").get(row.scope);
    if (!ref) return;
    const barrier = this.get(ref.barrier_id);
    if (barrier.sessionScope && barrier.sessionScope !== sessionScope) throw new Error("handoff_session_changed");
    const prior = this.db.prepare("SELECT barrier_id FROM handoff_scopes WHERE scope=?").get(sessionScope);
    if (prior && prior.barrier_id !== barrier.id) throw new Error("handoff_session_busy");
    this.db.prepare("INSERT OR IGNORE INTO handoff_scopes(scope,barrier_id) VALUES(?,?)").run(sessionScope,barrier.id);
    this.db.prepare("UPDATE handoff_barriers SET session_scope=? WHERE id=?").run(sessionScope,barrier.id);
  }

  ready(id, requestHash) {
    return this.store.transaction(() => {
      const barrier = this.get(id);
      if (!barrier || barrier.requestHash !== requestHash || !["reserved","ready"].includes(barrier.state) || !barrier.sessionScope) throw new Error("handoff_context_changed");
      if (barrier.state === "ready") return barrier;
      for (const task of barrier.predecessors) {
        const last = this.db.prepare("SELECT status FROM attempts WHERE workload=? AND scope=? AND surface='voice' ORDER BY sequence DESC LIMIT 1").get(task,barrier.topicScope);
        if (last?.status !== "completed") throw new Error("handoff_predecessor_unconfirmed");
      }
      for (const scope of new Set([barrier.topicScope,barrier.sessionScope])) {
        if (this.db.prepare("SELECT 1 FROM session_controls WHERE scope=?").get(scope)) throw new Error("handoff_scope_busy");
        this.store._invalidateIdleOwner(scope,id);
      }
      this.db.prepare("UPDATE handoff_barriers SET state='ready' WHERE id=?").run(id);
      return this.get(id);
    });
  }

  cancel(id, requestHash, owner) {
    return this.store.transaction(() => {
      const barrier = this.get(id);
      if (!barrier || barrier.requestHash !== requestHash) throw new Error("handoff_context_changed");
      owner ||= barrier.owner;
      if(!this.db.prepare("SELECT 1 FROM handoff_members WHERE barrier_id=? AND owner=?").get(id,owner)) throw new Error("handoff_context_changed");
      const active = this.db.prepare(`SELECT 1 FROM attempts WHERE workload=? AND surface='task_chat' AND status IN ${HELD}`).get(owner);
      if (active) throw new Error("handoff_execution_unconfirmed");
      this._releaseWorkload(owner,"cancelled");
      return this.get(id);
    });
  }

  _releaseWorkload(owner, outcome) {
    if (this.db.prepare(`SELECT 1 FROM attempts WHERE workload=? AND surface='task_chat' AND status IN ${HELD}`).get(owner)) return;
    const member=this.db.prepare("SELECT barrier_id FROM handoff_members WHERE owner=? AND state='waiting'").get(owner);
    if(!member)return;
    this.db.prepare("UPDATE handoff_members SET state=? WHERE owner=?").run(outcome,owner);
    if(this.db.prepare("SELECT 1 FROM handoff_members WHERE barrier_id=? AND state='waiting'").get(member.barrier_id))return;
    for (const row of this.db.prepare("SELECT id FROM handoff_barriers WHERE id=? AND state IN ('reserved','ready')").all(member.barrier_id)) {
      this.db.prepare("UPDATE handoff_barriers SET state=?,finished_at=? WHERE id=?").run(outcome === "completed" ? "finished" : "cancelled",new Date().toISOString(),row.id);
      this.db.prepare("DELETE FROM handoff_scopes WHERE barrier_id=?").run(row.id);
    }
  }
}
