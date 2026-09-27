import test from 'node:test';
import assert from 'node:assert/strict';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { creationBudgetBlocker } from '../scripts/neuraldeep/agent-creation-store.mjs';
import { creationUpperBoundReceipt, resolveCreationContinue } from '../scripts/neuraldeep/creation-continue.mjs';

const request = { requestId: 'continue-fixture', actor: 'user' };
const job = (budget = {}, extra = {}) => ({ preparationPolicyVersion: 2, preparationStop: null, ...extra,
  budget: { maxTokens: 100_000, tokensUsed: 0, maxActiveMs: 60_000, activeMs: 0, maxIterations: 12, repeatedFailures: 0, repeatedFailureThreshold: 6,
    lastFailureSignature: null, unknownAttempts: [], turns: {}, ...budget } });

function interruptedTurn(store, turnId, { exited = true, reservation = 5_000 } = {}) {
  store.beginRuntimeRun({ runId: `run-${turnId}`, requestHash: 'a'.repeat(64), receipt: { workload_id: turnId } });
  store.claimProviderRequest(`run-${turnId}`, 'b'.repeat(64), { budget: { reservation } });
  store.recordProviderResponse(`run-${turnId}`, { requestHash: 'b'.repeat(64), status: 200, usage: { input_tokens: 900, output_tokens: 100 }, upstreamAttempted: true });
  store.claimProviderRequest(`run-${turnId}`, 'c'.repeat(64), reservation === null ? {} : { budget: { reservation } });
  if (exited) store.updateRuntimeRun(`run-${turnId}`, { process_exited: true, process_tree_exited: true, adapter_closed: true });
}

test('Continue settles an interrupted turn at its upper bound and records the decision', t => {
  const store = new NeuralDeepCoordinationStore(); t.after(() => store.close());
  interruptedTurn(store, 'turn-a');
  assert.deepEqual(creationUpperBoundReceipt(store, 'turn-a').tokens, 1_000 + 5_000, 'measured request plus the unmeasured reservation');
  const blocked = job({ tokensUsed: 2_000, unknownAttempts: ['turn-a'], turns: { 'turn-a': { tokens: null, activeMs: 10, dispatched: true } } });
  assert.equal(creationBudgetBlocker(blocked).code, 'creation_usage_unknown');
  const next = resolveCreationContinue(blocked, { coordination: store, request, now: '2026-09-26T00:00:00.000Z' });
  assert.equal(creationBudgetBlocker(next), null);
  assert.equal(next.budget.tokensUsed, 8_000);
  assert.deepEqual(next.budget.unknownAttempts, []);
  assert.equal(next.budget.turns['turn-a'].usageReceipt.source, 'reservation-upper-bound');
  assert.deepEqual(next.budget.continueDecisions[0].resolved, ['usage_settled_at_upper_bound']);
  assert.deepEqual(blocked.budget.unknownAttempts, ['turn-a'], 'the saved job is not mutated');
});

test('Continue refuses to guess while a process may still run or a request has no bound', t => {
  const store = new NeuralDeepCoordinationStore(); t.after(() => store.close());
  interruptedTurn(store, 'turn-live', { exited: false });
  interruptedTurn(store, 'turn-unbounded', { reservation: null });
  for (const turnId of ['turn-live', 'turn-unbounded']) {
    assert.equal(creationUpperBoundReceipt(store, turnId), null);
    assert.throws(() => resolveCreationContinue(job({ unknownAttempts: [turnId], turns: { [turnId]: { tokens: null } } }), { coordination: store, request }),
      error => error.code === 'creation_usage_unbounded');
  }
});

test('Continue extends exhausted budgets from the original size and clears failure streaks and stops', () => {
  const store = { db: { prepare: () => ({ all: () => [] }) } };
  const tokens = resolveCreationContinue(job({ tokensUsed: 100_000 }), { coordination: store, request });
  assert.equal(tokens.budget.baseMaxTokens, 100_000);
  assert.equal(tokens.budget.maxTokens, 150_000);
  const again = resolveCreationContinue({ ...tokens, budget: { ...tokens.budget, tokensUsed: 150_000 } }, { coordination: store, request });
  assert.equal(again.budget.maxTokens, 200_000, 'each extension adds half of the original budget');
  const time = resolveCreationContinue(job({ activeMs: 60_000 }), { coordination: store, request });
  assert.equal(time.budget.maxActiveMs, 90_000);
  const failures = resolveCreationContinue(job({ repeatedFailures: 6, lastFailureSignature: 'x' }), { coordination: store, request });
  assert.equal(failures.budget.repeatedFailures, 0);
  const stopped = resolveCreationContinue(job({}, { preparationStop: { code: 'provider_budget_no_progress', message: 'stop' } }), { coordination: store, request });
  assert.equal(stopped.preparationStop, null);
  assert.deepEqual(resolveCreationContinue(job(), { coordination: store, request }).budget.continueDecisions, undefined, 'nothing to resolve, nothing recorded');
});

test('Continue lifts only a queue pause left by a finished attempt', t => {
  const store = new NeuralDeepCoordinationStore(); t.after(() => store.close());
  for (const reason of ['failed', 'cancelled', 'interrupted']) { store.pause('a'.repeat(24), reason); assert.equal(store.resumeFinished('a'.repeat(24)), true, reason); }
  for (const reason of ['runtime_exit_unconfirmed', 'worker_exit_requires_reconciliation', 'waiting_for_operator', 'resume_confirmation_required']) {
    store.pause('b'.repeat(24), reason);
    assert.equal(store.resumeFinished('b'.repeat(24)), false, `${reason} still needs its own decision`);
    store.resume('b'.repeat(24));
  }
});

test('Continue discards a research answer that keeps failing validation', () => {
  const store = { db: { prepare: () => ({ all: () => [] }) } };
  const stuck = job({}, { blocker: { code: 'creation_research_selection_invalid', message: 'quarantined' }, preparation: { pendingResearchTurnId: 'turn_research', researchRepairCount: 1 } });
  const next = resolveCreationContinue(stuck, { coordination: store, request });
  assert.equal(next.preparation.pendingResearchTurnId, null);
  assert.equal(next.preparation.researchRepairCount, 0);
  assert.deepEqual(next.budget.continueDecisions[0].resolved, ['research_answer_discarded']);
});

test('Continue hands an exited delivery attempt with unknown usage to the delivery ledger (qwen3.8-27b, 2026-09-27)', t => {
  const store = new NeuralDeepCoordinationStore(); t.after(() => store.close());
  const blocked = job({ maxTokens: 2_000_000, tokensUsed: 282_879, unknownAttempts: ['creation-run'] }, { deliveryRunId: 'creation-run',
    blocker: { code: 'goal_usage_unavailable', message: 'Build usage or the end of a prior attempt is unresolved' } });
  const next = resolveCreationContinue(blocked, { coordination: store, request, now: '2026-09-27T10:10:00.000Z' });
  assert.deepEqual(next.budget.unknownAttempts, [], 'the delivery run is not bounded as a task turn');
  assert.equal(next.deliveryUsageSettlement.requestId, request.requestId);
  assert.deepEqual(next.budget.continueDecisions[0].resolved, ['delivery_usage_settlement_requested']);
});

test('delivery attempt bounds use measured usage and the reservation of unmeasured requests', async t => {
  const { deliveryAttemptBounds } = await import('../scripts/neuraldeep/creation-delivery.mjs');
  const store = new NeuralDeepCoordinationStore(); t.after(() => store.close());
  store.beginRuntimeRun({ runId: 'nd_cut', requestHash: 'a'.repeat(64), receipt: { workload_id: 'creation-run-iteration-2' } });
  store.claimProviderRequest('nd_cut', 'b'.repeat(64), { budget: { reservation: 150_000 } });
  store.recordProviderResponse('nd_cut', { requestHash: 'b'.repeat(64), status: 200, usage: { input_tokens: 26_000, output_tokens: 300 }, upstreamAttempted: true });
  store.claimProviderRequest('nd_cut', 'c'.repeat(64), { budget: { reservation: 251_543 } });
  const bounds = deliveryAttemptBounds(store, [{ attempt_id: 'nd_cut', launcher_run_id: 'nd_cut' }, { attempt_id: 'nd_none', launcher_run_id: 'nd_none' }]);
  assert.equal(bounds.get('nd_cut'), 26_300 + 251_543);
  assert.equal(bounds.get('nd_none'), 0, 'an attempt that never dispatched costs nothing');
});
