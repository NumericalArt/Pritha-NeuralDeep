import { createHash } from 'node:crypto';
import { AgentCreationError, creationBudgetBlocker } from './agent-creation-store.mjs';

const exited = receipt => receipt.process_exited === true && receipt.process_tree_exited === true && receipt.adapter_closed === true;

/**
 * Upper bound for a dispatched turn whose final usage never arrived: measured
 * requests at their measured size, unmeasured ones at their admission
 * reservation. Returns null while a process may still run or a request has no
 * reservation to bound it.
 */
export function creationUpperBoundReceipt(coordination, turnId) {
  const rows = coordination.db.prepare("SELECT id,receipt FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=? ORDER BY id").all(turnId);
  if (!rows.length) return null;
  let tokens = 0;
  for (const row of rows) {
    if (!exited(JSON.parse(row.receipt))) return null;
    for (const dispatch of coordination.db.prepare('SELECT metadata FROM provider_dispatches WHERE run_id=? ORDER BY rowid').all(row.id)) {
      const metadata = JSON.parse(dispatch.metadata);
      const measured = metadata.completion?.usage?.totalTokens;
      const value = Number.isSafeInteger(measured) && measured >= 0 ? measured : metadata.budget?.reservation;
      if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(tokens + value)) return null;
      tokens += value;
    }
  }
  const receiptId = 'creation_upper_bound_' + createHash('sha256').update(JSON.stringify([turnId, rows.map(row => row.id), tokens])).digest('hex');
  return { receiptId, tokens };
}

/**
 * An explicit operator Continue never leaves a job without a way forward.
 * Unknown usage settles at its upper bound, a repeated-failure streak and a
 * preparation stop are cleared, and an exhausted token or time budget grows by
 * half of its original size. The preparation policy stays derived from the
 * original budget, and every decision is recorded on the job.
 */
export function resolveCreationContinue(job, { coordination, request, now = new Date().toISOString() }) {
  const next = structuredClone(job), budget = next.budget, resolved = [];
  for (let blocker = creationBudgetBlocker(next), guard = 0; blocker; blocker = creationBudgetBlocker(next), guard += 1) {
    if (guard >= 16) throw new AgentCreationError(blocker.code, blocker.message);
    if (blocker.code === 'creation_usage_unknown') {
      for (const turnId of [...budget.unknownAttempts]) {
        const bound = creationUpperBoundReceipt(coordination, turnId);
        if (!bound) throw new AgentCreationError('creation_usage_unbounded', 'Расход прерванного шага пока нельзя ограничить сверху: процесс ещё не завершён или у запроса нет резерва. Нажмите «Сверить расход» и повторите «Продолжить».');
        const turn = budget.turns[turnId] ||= { tokens: null, activeMs: 0, dispatched: true };
        if (Number.isSafeInteger(turn.tokens)) budget.tokensUsed -= turn.tokens;
        turn.tokens = bound.tokens;
        turn.usageReceipt = { id: bound.receiptId, source: 'reservation-upper-bound', hash: createHash('sha256').update(JSON.stringify([bound.receiptId, turnId, bound.tokens])).digest('hex') };
        budget.tokensUsed += bound.tokens;
        budget.unknownAttempts = budget.unknownAttempts.filter(id => id !== turnId);
      }
      resolved.push('usage_settled_at_upper_bound');
    } else if (blocker.code === 'creation_repeated_failure') {
      budget.repeatedFailures = 0;
      budget.lastFailureSignature = null;
      resolved.push('repeated_failure_reset');
    } else if (blocker.code === 'creation_token_budget') {
      budget.baseMaxTokens ??= budget.maxTokens;
      budget.maxTokens += Math.ceil(budget.baseMaxTokens / 2);
      resolved.push('token_budget_extended');
    } else if (blocker.code === 'creation_time_budget') {
      budget.baseMaxActiveMs ??= budget.maxActiveMs;
      budget.maxActiveMs += Math.ceil(budget.baseMaxActiveMs / 2);
      resolved.push('time_budget_extended');
    } else if (next.preparationStop && blocker.code === next.preparationStop.code) {
      next.preparationStop = null;
      resolved.push('preparation_stop_cleared');
    } else {
      throw new AgentCreationError(blocker.code, blocker.message);
    }
  }
  if (resolved.length) {
    budget.continueDecisions = [...(budget.continueDecisions || []), { at: now, requestId: request.requestId, actor: request.actor || 'user', resolved,
      tokensUsed: budget.tokensUsed, maxTokens: budget.maxTokens, maxActiveMs: budget.maxActiveMs }];
  }
  return next;
}
