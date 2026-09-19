import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creationDraftRoot, reconcileCreationArtifacts, approveCreationDocument, creationPrompt } from '../scripts/neuraldeep/agent-creation.mjs';
import { AgentCreationStore } from '../scripts/neuraldeep/agent-creation-store.mjs';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { reviseCreationProposal, creationRevisionPending } from '../scripts/neuraldeep/creation-revision.mjs';
import { prepareOutcomeVerifierPreset } from '../scripts/agents-mother/outcome-verifier-presets.mjs';
import { renderOutcomeSpecFromContract } from '../scripts/agents-mother/outcome-spec.mjs';
import { contractData } from '../scripts/agents-mother/contract.mjs';

function fixture(t) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pritha-creation-revision-')), root = path.join(temp, 'code'), stateRoot = path.join(temp, 'state'), target = path.join(temp, 'alpha');
  const coordination = new NeuralDeepCoordinationStore(), jobs = new AgentCreationStore(coordination), options = { root, stateRoot, coordination };
  t.after(() => { coordination.close(); rmSync(temp, { recursive: true, force: true }); });
  const draftRoot = creationDraftRoot(stateRoot, 'fixture', 'chat');
  for (const dir of [root, stateRoot, target, path.join(draftRoot, 'contracts')]) mkdirSync(dir, { recursive: true });
  let contract = readFileSync('tests/fixtures/contracts/valid-agent-contract.md', 'utf8').replace(/^status: accepted$/m, 'status: draft')
    .replace('type: agent-contract', 'type: agent-contract\ncontract_schema_version: 2\nagent_kind: service\noutcome_trial_preset: llm-http-app-v1');
  for (const [label, value] of Object.entries({ 'Agent name': 'Alpha', 'Runtime family': 'api', 'Primary interface': 'web', 'Secondary interfaces': 'API', 'Service mode': 'process', 'Autostart': 'optional', 'Proactive mode': 'none', 'Target folder': target })) {
    contract = contract.replace(new RegExp(`^- ${label}:.*$`, 'm'), `- ${label}: ${value}`);
  }
  contract = contract.replace('- Agent name: Alpha', '- Agent name: Alpha\n- Technical slug: alpha');
  writeFileSync(path.join(draftRoot, 'contracts', 'alpha-agent-contract.md'), contract);
  jobs.create({ chatId: 'chat', instanceId: 'fixture', agentId: 'alpha', releaseSha: 'a'.repeat(40), target, draftRoot });
  let job = jobs.update('chat', current => reconcileCreationArtifacts(current, options));
  assert.deepEqual(job.contract.issues, []);
  job = jobs.update('chat', current => approveCreationDocument(current, 'contract', { requestId: 'approve-one', expectedRevision: current.revision, action: 'approve_contract' }, options));
  const request = { requestId: 'revision-request', expectedRevision: job.revision, action: 'revise_proposal', reason: 'Change the port and add explicit source settings.', actor: 'codex-operator', authorizationBasis: 'User delegated this UI test.' };
  const begin = () => { request.expectedRevision = jobs.get('chat').revision; jobs.beginAction('chat', request); return jobs.get('chat'); };
  const revise = extra => reviseCreationProposal(jobs.get('chat'), request, { ...options, ...extra });
  return { root, stateRoot, target, draftRoot, coordination, jobs, options, job, request, begin, revise };
}

test('explicit pre-scaffold revision preserves accepted bytes, budgets and cwd and requires fresh distinct approvals', t => {
  const f = fixture(t);
  let job = f.jobs.get('chat');
  const outcome = path.join(f.draftRoot, 'contracts', 'alpha-outcome.md');
  writeFileSync(outcome, renderOutcomeSpecFromContract(contractData(job.contract.path, f.options), { artifactId: 'alpha-outcome' }));
  job = f.jobs.update('chat', current => reconcileCreationArtifacts(current, f.options));
  assert.deepEqual(job.outcome.issues, []);
  job = f.jobs.update('chat', current => approveCreationDocument(current, 'outcome', { requestId: 'outcome-one', expectedRevision: current.revision, action: 'approve_outcome' }, f.options));
  const old = [job.contract.path, job.outcome.path, ...['contract', 'outcome'].map(kind => path.join(f.stateRoot, 'audit', 'creation-approvals', job.jobId, `${kind}.json`))].map(file => [file, readFileSync(file, 'utf8')]);
  const oldBudget = structuredClone(job.budget);
  f.begin();
  const next = f.revise();
  assert.equal(next.generation, 2); assert.equal(next.draftRoot, job.draftRoot); assert.equal(next.target, job.target); assert.deepEqual(next.budget, oldBudget);
  assert.equal(next.outcome, null); assert.deepEqual(next.approvals, {}); assert.equal(next.proposalRevisionPending, true);
  assert.equal(readdirSync(f.target).length, 0); assert.equal(creationRevisionPending(job, f.options).generation, 2);
  const saved = f.jobs.update('chat', () => next); f.jobs.finishAction('chat', f.request.requestId, saved);
  assert.equal(creationRevisionPending(saved, f.options), null);
  assert.equal(reconcileCreationArtifacts(saved, f.options).status, 'pending', 'seed waits for corrective authoring turn');
  assert.match(creationPrompt(saved), /Change the port/); assert.match(saved.contract.path, /revision-2\.md$/);
  assert.throws(() => approveCreationDocument(saved, 'contract', { action: 'approve_contract', requestId: 'contract-two', expectedRevision: saved.revision }, f.options), /stale/);
  f.jobs.recordTurn('chat', { turnId: 'revision-authoring', ok: true, tokens: 0, dispatched: false });
  job = f.jobs.update('chat', current => reconcileCreationArtifacts(current, f.options));
  assert.equal(job.status, 'awaiting_contract_approval');
  job = f.jobs.update('chat', current => approveCreationDocument(current, 'contract', { action: 'approve_contract', requestId: 'contract-two', expectedRevision: current.revision }, f.options));
  assert.match(job.contract.path, /revision-2\.md$/); assert.equal(job.approvals.outcome, undefined);
  const revisedOutcome = path.join(f.draftRoot, 'contracts', 'alpha-outcome-revision-2.md');
  writeFileSync(revisedOutcome, renderOutcomeSpecFromContract(contractData(job.contract.path, f.options), { artifactId: 'alpha-outcome-revision-2' }));
  job = f.jobs.update('chat', current => reconcileCreationArtifacts(current, f.options));
  assert.deepEqual(job.outcome.issues, []);
  job = f.jobs.update('chat', current => approveCreationDocument(current, 'outcome', { action: 'approve_outcome', requestId: 'outcome-two', expectedRevision: current.revision }, f.options));
  assert.ok(job.approvals.contract && job.approvals.outcome);
  for (const [file, bytes] of old) assert.equal(readFileSync(file, 'utf8'), bytes);
  assert.ok(existsSync(path.join(f.draftRoot, 'history', 'revision-1', 'contracts', 'alpha-outcome.md')));
  assert.ok(existsSync(path.join(f.stateRoot, 'audit', 'creation-approvals', job.jobId, 'revision-2', 'outcome.json')));
});

for (const stage of ['intent_recorded', 'drafts_archived', 'verifier_cleared', 'seed_written', 'receipt_completed']) {
  test(`same request recovers ${stage} into one generation`, t => {
    const f = fixture(t); prepareOutcomeVerifierPreset(f.target, 'llm-http-app-v1', { ...f.options, jobId: f.job.jobId }); f.begin();
    assert.throws(() => f.revise({ onRevisionCheckpoint: checkpoint => { if (checkpoint === stage) throw new Error('crash'); } }), /crash/);
    assert.equal(creationRevisionPending(f.jobs.get('chat'), f.options).request.requestId, f.request.requestId);
    assert.equal(reconcileCreationArtifacts(f.jobs.get('chat'), f.options).blocker.code, 'creation_revision_incomplete');
    const recovered = f.revise(); assert.equal(recovered.generation, 2); assert.deepEqual(f.revise(), recovered);
    const saved = f.jobs.update('chat', () => recovered); assert.deepEqual(f.revise(), saved);
    f.jobs.finishAction('chat', f.request.requestId, saved);
    const replay = f.jobs.beginAction('chat', f.request); assert.equal(replay.replayed, true); assert.equal(replay.result.generation, 2);
    assert.throws(() => f.jobs.beginAction('chat', { ...f.request, reason: 'Different instruction' }), /idempotency_conflict/);
    assert.equal(readdirSync(path.join(f.stateRoot, 'audit', 'creation-revisions', saved.jobId)).filter(name => name.endsWith('.json')).length, 1);
  });
}

for (const kind of ['extra-file', 'git', 'scaffold-intent', 'wrong-verifier-owner', 'modified-verifier']) {
  test(`revision refuses ${kind} without changing reviewed proposal`, t => {
    const f = fixture(t), before = readFileSync(f.job.contract.path, 'utf8');
    if (kind === 'extra-file') writeFileSync(path.join(f.target, 'notes.txt'), 'Do not remove');
    if (kind === 'git') mkdirSync(path.join(f.target, '.git'));
    if (kind === 'scaffold-intent') { const dir = path.join(f.stateRoot, 'audit', 'creation-scaffolds'); mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, `${f.job.jobId}.json`), '{"status":"started"}'); }
    if (kind.includes('verifier')) {
      prepareOutcomeVerifierPreset(f.target, 'llm-http-app-v1', { ...f.options, jobId: kind === 'wrong-verifier-owner' ? 'other-job' : f.job.jobId });
      if (kind === 'modified-verifier') writeFileSync(path.join(f.target, 'tests/trials/pritha-outcome-verifier.mjs'), 'console.log("passed");');
    }
    f.begin(); assert.throws(() => f.revise(), /creation_revision_target_changed|новая задача|новой задачи/);
    assert.equal(readFileSync(f.job.contract.path, 'utf8'), before); assert.equal(creationRevisionPending(f.job, f.options), null);
  });
}

function attempt(f, { tokens = 12, exited = true, status = 'completed', alias = false } = {}) {
  const turnId = 'old-turn', attemptId = 'old-attempt';
  f.coordination.enqueue({ attemptId, workloadId: turnId, surface: 'task_chat', coordinationKeyHash: 'a'.repeat(24), sessionKeyHash: 'c'.repeat(24), queuedAt: new Date().toISOString(), payload: { chatId: 'chat', turnId } });
  f.coordination.db.prepare('UPDATE attempts SET status=?,admitted_at=? WHERE id=?').run(status, new Date().toISOString(), attemptId);
  f.coordination.beginRuntimeRun({ runId: 'old-run', requestHash: 'a'.repeat(64), receipt: { workload_id: turnId } });
  f.coordination.updateRuntimeRun('old-run', { process_exited: true, process_tree_exited: exited, adapter_closed: exited, usage_record: { usageKnown: tokens !== null, usage: { totalTokens: tokens } } });
  f.jobs.recordTurn('chat', { turnId, tokens, ok: true, dispatched: true });
  if (alias) f.coordination.enqueue({ attemptId: 'alias-attempt', workloadId: 'alias-turn', surface: 'task_chat', coordinationKeyHash: 'b'.repeat(24), sessionKeyHash: 'c'.repeat(24), queuedAt: new Date().toISOString(), payload: { chatId: 'other-chat', turnId: 'alias-turn' } });
}
for (const scenario of [{ exited: false }, { tokens: null }, { status: 'resume_confirmation_required' }, { alias: true }]) {
  test(`revision independently rejects unsettled runtime ${JSON.stringify(scenario)}`, t => {
    const f = fixture(t); attempt(f, scenario); f.begin();
    assert.equal(f.jobs.get('chat').activeTurnId, null);
    assert.throws(() => f.revise(), /creation_revision_execution_unsettled/);
    assert.equal(creationRevisionPending(f.job, f.options), null);
  });
}

test('confirmed closed runtime retains counted usage and late receipts cannot reset the new proposal', t => {
  const f = fixture(t); attempt(f); f.begin();
  const next = f.revise(), saved = f.jobs.update('chat', () => next);
  assert.equal(next.budget.tokensUsed, 12);
  assert.deepEqual(f.jobs.recordTurn('chat', { turnId: 'old-turn', tokens: 12, ok: false, dispatched: true }), saved);
});

for (const recorded of [true, false]) {
  test(`admitted prelaunch rejection ${recorded ? 'uses final host no-dispatch proof' : 'without host proof stays blocked'}`, t => {
    const f = fixture(t), turnId = 'prelaunch';
    f.coordination.enqueue({ attemptId: 'prelaunch-attempt', workloadId: turnId, surface: 'task_chat', coordinationKeyHash: 'a'.repeat(24), queuedAt: new Date().toISOString(), payload: { chatId: 'chat', turnId } });
    f.coordination.db.prepare("UPDATE attempts SET status='failed',admitted_at=? WHERE id=?").run(new Date().toISOString(), 'prelaunch-attempt');
    if (recorded) f.jobs.recordTurn('chat', { turnId, tokens: 0, dispatched: false, ok: false, code: 'provider_probe_failed' });
    f.begin();
    if (recorded) assert.equal(f.revise().generation, 2);
    else assert.throws(() => f.revise(), /creation_revision_execution_unsettled/);
  });
}

test('recovery tolerates a crash after creating the empty new contracts directory', t => {
  const f = fixture(t); f.begin();
  assert.throws(() => f.revise({ onRevisionCheckpoint: checkpoint => { if (checkpoint === 'verifier_cleared') throw new Error('crash'); } }), /crash/);
  mkdirSync(path.join(f.draftRoot, 'contracts'));
  assert.equal(f.revise().generation, 2);
});

for (const changed of ['seed', 'target', 'archive']) {
  test(`completed filesystem revision refuses ${changed} changes before the job update`, t => {
    const f = fixture(t); f.begin();
    assert.throws(() => f.revise({ onRevisionCheckpoint: checkpoint => { if (checkpoint === 'receipt_completed') throw new Error('crash'); } }), /crash/);
    if (changed === 'seed') writeFileSync(path.join(f.draftRoot, 'contracts', 'alpha-agent-contract-revision-2.md'), 'Changed draft');
    if (changed === 'target') writeFileSync(path.join(f.target, 'notes.txt'), 'Keep user bytes');
    if (changed === 'archive') writeFileSync(path.join(f.draftRoot, 'history', 'revision-1', 'extra.txt'), 'Changed history');
    assert.throws(() => f.revise(), /creation_revision_(completed_state_changed|drafts_changed)/);
    assert.equal(f.jobs.get('chat').generation, 1);
  });
}
