import { createHash } from 'node:crypto';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
export const CREATION_ACTIONS = ['approve_contract', 'approve_outcome', 'continue', 'pause', 'cancel', 'revise_proposal'];
export class AgentCreationError extends Error {
  constructor(code, message = code, status = 409) { super(message); this.code = code; this.status = status; }
}

/** Host metadata in the same transactional authority as admission. No second worker queue. */
export class AgentCreationStore {
  constructor(coordination) {
    this.store = coordination;
    this.db = coordination.db;
    this.store.transaction(() => { this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_creation_jobs(
        chat_id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, agent_id TEXT NOT NULL,
        revision INTEGER NOT NULL, record TEXT NOT NULL, UNIQUE(instance_id,agent_id));
      CREATE TABLE IF NOT EXISTS agent_creation_actions(
        chat_id TEXT NOT NULL, request_id TEXT NOT NULL, request_hash TEXT NOT NULL,
        status TEXT NOT NULL, result TEXT, request TEXT, PRIMARY KEY(chat_id,request_id));
    `);
      const columns = this.db.prepare('PRAGMA table_info(agent_creation_actions)').all();
      if (!columns.some(column => column.name === 'request')) this.db.exec('ALTER TABLE agent_creation_actions ADD COLUMN request TEXT');
    });
  }
  get(chatId) {
    const row = this.db.prepare('SELECT record FROM agent_creation_jobs WHERE chat_id=?').get(chatId);
    return row ? JSON.parse(row.record) : null;
  }
  /** Restart recovery finds saved work; it never dispatches or accepts a guess. */
  listRecoverable(limit = 100) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new AgentCreationError('creation_recovery_limit_invalid');
    return this.db.prepare(`SELECT chat_id,record FROM agent_creation_jobs j
      WHERE json_extract(record,'$.activeTurnId') IS NOT NULL OR json_extract(record,'$.status')='running'
      OR EXISTS (SELECT 1 FROM agent_creation_actions a WHERE a.chat_id=j.chat_id AND a.status='started')
      ORDER BY chat_id LIMIT ?`).all(limit).map(row => ({
      job: JSON.parse(row.record),
      startedActions: this.db.prepare("SELECT request_id,request_hash,request FROM agent_creation_actions WHERE chat_id=? AND status='started' ORDER BY request_id")
        .all(row.chat_id).map(action => ({ requestId: action.request_id, requestHash: action.request_hash,
          request: action.request ? JSON.parse(action.request) : null, recoverable: Boolean(action.request) })),
    }));
  }
  create(input) {
    if (![input.chatId,input.instanceId,input.agentId].every(value => ID.test(value || ''))
      || !/^[a-f0-9]{40}$/.test(input.releaseSha || '')) throw new AgentCreationError('creation_identity_invalid');
    return this.store.transaction(() => {
      const existing = this.get(input.chatId);
      if (existing) {
        if (existing.instanceId !== input.instanceId || existing.agentId !== input.agentId) throw new AgentCreationError('creation_identity_conflict');
        return existing;
      }
      if (this.db.prepare('SELECT chat_id FROM agent_creation_jobs WHERE instance_id=? AND agent_id=?').get(input.instanceId,input.agentId)) {
        throw new AgentCreationError('creation_target_owned', 'Этот агент уже связан с другой задачей. Откройте исходную задачу.');
      }
      const record = { schema: 'pritha-agent-creation-v1', jobId: `creation_${hash([input.instanceId,input.chatId]).slice(0,24)}`,
        chatId: input.chatId, instanceId: input.instanceId, agentId: input.agentId, releaseSha: input.releaseSha,
        target: input.target, draftRoot: input.draftRoot, generation: 1, revision: 1, createdAt: now(), updatedAt: now(),
        phase: 'interview', status: 'pending', autoContinue: true, contract: null, outcome: null,
        approvals: {}, deliveryRunId: null, checkpoint: null, blocker: null, activeTurnId: null,
        budget: { maxTokens: 1_000_000, maxActiveMs: 90*60*1000, maxIterations: 6, repeatedFailureThreshold: 3,
          tokensUsed: 0, activeMs: 0, turns: {}, unknownAttempts: [], repeatedFailures: 0, lastFailureSignature: null } };
      this.db.prepare('INSERT INTO agent_creation_jobs VALUES(?,?,?,?,?)').run(input.chatId,input.instanceId,input.agentId,1,JSON.stringify(record));
      return record;
    });
  }
  update(chatId, update, expectedRevision = null) {
    return this.store.transaction(() => {
      const current = this.get(chatId);
      if (!current) throw new AgentCreationError('creation_not_found', 'Задача создания не найдена.', 404);
      if (expectedRevision !== null && current.revision !== expectedRevision) throw new AgentCreationError('creation_revision_stale', 'Состояние изменилось. Обновите карточку.');
      const changed = update(structuredClone(current));
      if (changed.chatId !== current.chatId || changed.agentId !== current.agentId || changed.instanceId !== current.instanceId || changed.releaseSha !== current.releaseSha) {
        throw new AgentCreationError('creation_identity_immutable');
      }
      if (JSON.stringify(changed) === JSON.stringify(current)) return current;
      const next = {...changed, revision: current.revision+1, updatedAt: now()};
      this.db.prepare('UPDATE agent_creation_jobs SET revision=?,record=? WHERE chat_id=? AND revision=?').run(next.revision,JSON.stringify(next),chatId,current.revision);
      return next;
    });
  }
  beginAction(chatId, request) {
    if (!ID.test(request?.requestId || '') || !CREATION_ACTIONS.includes(request?.action)
      || !Number.isSafeInteger(request.expectedRevision) || Buffer.byteLength(JSON.stringify(request)) > 64*1024) throw new AgentCreationError('creation_request_invalid', 'Некорректное действие.', 400);
    return this.store.transaction(() => {
      const requestHash = hash(request);
      const prior = this.db.prepare('SELECT * FROM agent_creation_actions WHERE chat_id=? AND request_id=?').get(chatId,request.requestId);
      if (prior) {
        if (prior.request_hash !== requestHash) throw new AgentCreationError('idempotency_conflict');
        return {replayed:true,status:prior.status,result:prior.result ? JSON.parse(prior.result) : null};
      }
      const current = this.get(chatId);
      if (!current || current.revision !== request.expectedRevision) throw new AgentCreationError('creation_revision_stale');
      if (this.db.prepare("SELECT request_id FROM agent_creation_actions WHERE chat_id=? AND status='started'").get(chatId)) throw new AgentCreationError('creation_action_unconfirmed');
      this.db.prepare("INSERT INTO agent_creation_actions(chat_id,request_id,request_hash,status,result,request) VALUES(?,?,?,'started',NULL,?)").run(chatId,request.requestId,requestHash,JSON.stringify(request));
      return {replayed:false,status:'started',result:null};
    });
  }
  finishAction(chatId, requestId, result) {
    this.store.transaction(() => this.db.prepare("UPDATE agent_creation_actions SET status='completed',result=? WHERE chat_id=? AND request_id=? AND status='started'").run(JSON.stringify(result),chatId,requestId));
  }
  recordTurn(chatId, input) {
    if (!ID.test(input?.turnId || '') || input.activeMs !== undefined && (!Number.isSafeInteger(input.activeMs) || input.activeMs < 0)
      || input.tokens !== undefined && input.tokens !== null && (!Number.isSafeInteger(input.tokens) || input.tokens < 0)) throw new AgentCreationError('creation_turn_receipt_invalid');
    return this.update(chatId, current => {
      const budget = current.budget;
      if (budget.turns[input.turnId]) return current;
      const known = Number.isSafeInteger(input.tokens) && input.tokens >= 0;
      if (!Number.isSafeInteger(budget.tokensUsed + (known ? input.tokens : 0)) || !Number.isSafeInteger(budget.activeMs + (input.activeMs || 0))) throw new AgentCreationError('creation_budget_overflow');
      budget.turns[input.turnId] = {tokens: known ? input.tokens : null, activeMs: input.activeMs || 0, dispatched: input.dispatched === true};
      budget.tokensUsed += known ? input.tokens : 0;
      budget.activeMs += Math.max(0,input.activeMs || 0);
      if (!known && input.dispatched) budget.unknownAttempts.push(input.turnId);
      if (current.activeTurnId && current.activeTurnId !== input.turnId) return current;
      if (input.ok && current.proposalRevisionPending) current.proposalRevisionPending = false;
      const signature = input.ok ? null : hash({ phase: current.phase, code: input.code || 'creation_step_failed',
        failure: String(input.failureSignature || input.message || '').replace(/\s+/g,' ').trim().slice(0,1000) });
      budget.repeatedFailures = input.ok ? 0 : budget.lastFailureSignature === signature ? budget.repeatedFailures + 1 : 1;
      budget.lastFailureSignature = signature;
      // A late receipt must not clear the identity of a newer worker.
      if (!current.activeTurnId || current.activeTurnId === input.turnId) current.activeTurnId = null;
      current.checkpoint = input.checkpoint || current.checkpoint;
      if (!['cancelled','paused'].includes(current.status)) {
        current.status = input.ok ? 'pending' : 'blocked';
        current.blocker = input.ok ? null : {code:input.code || 'creation_step_failed',message:input.message || 'Проверьте сохранённый шаг и продолжите эту задачу.'};
      }
      return current;
    });
  }
  /** Called only with a host-read, bound final receipt; never from model text. */
  reconcileTurnUsage(chatId, receipt) {
    if (!ID.test(receipt?.receiptId || '') || receipt.chatId !== chatId || !ID.test(receipt.turnId || '')
      || !['neuraldeep-runtime','delivery-ledger'].includes(receipt.source) || receipt.processExited !== true
      || !Number.isSafeInteger(receipt.tokens) || receipt.tokens < 0) throw new AgentCreationError('creation_usage_receipt_invalid');
    return this.update(chatId, current => {
      const turn = current.budget.turns[receipt.turnId];
      if (!turn) throw new AgentCreationError('creation_usage_turn_unknown');
      const receiptHash = hash([receipt.receiptId,receipt.source,receipt.chatId,receipt.turnId,receipt.tokens,receipt.processExited]);
      if (turn.usageReceipt) {
        if (turn.usageReceipt.hash !== receiptHash) throw new AgentCreationError('creation_usage_receipt_conflict');
        return current;
      }
      if (turn.tokens !== null && turn.tokens !== receipt.tokens) throw new AgentCreationError('creation_usage_receipt_conflict');
      const total = current.budget.tokensUsed + (turn.tokens === null ? receipt.tokens : 0);
      if (!Number.isSafeInteger(total)) throw new AgentCreationError('creation_budget_overflow');
      turn.tokens = receipt.tokens;
      turn.usageReceipt = { id: receipt.receiptId, source: receipt.source, hash: receiptHash };
      current.budget.tokensUsed = total;
      current.budget.unknownAttempts = current.budget.unknownAttempts.filter(id => id !== receipt.turnId);
      // Reconciliation settles accounting only. Existing pause/cancel/blocker,
      // approval, phase and checkpoint decisions remain unchanged.
      return current;
    });
  }
}

export function creationBudgetBlocker(job) {
  const b = job.budget;
  if (b.unknownAttempts.length) return {code:'creation_usage_unknown',message:'Расход предыдущего исполнения ещё не подтверждён.'};
  if (b.tokensUsed >= b.maxTokens) return {code:'creation_token_budget',message:'Достигнут бюджет создания.'};
  if (b.activeMs >= b.maxActiveMs) return {code:'creation_time_budget',message:'Достигнут лимит активного времени.'};
  if (b.repeatedFailures >= b.repeatedFailureThreshold) return {code:'creation_repeated_failure',message:'Повторилась ошибка. Требуется диагностика перед продолжением.'};
  return null;
}

export function creationPhase(job) {
  if (!job.contract) return 'interview';
  if (!job.approvals.contract || job.approvals.contract.hash !== job.contract.hash) return 'contract';
  if (!job.outcome) return 'outcome';
  if (!job.approvals.outcome || job.approvals.outcome.hash !== job.outcome.hash) return 'outcome';
  if (!job.researchReady) return 'research';
  if (!job.scaffoldReady) return 'scaffold';
  return job.deliveryRunId ? 'verify' : 'implement';
}
