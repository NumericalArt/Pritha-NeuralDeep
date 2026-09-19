import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as coordination from '../scripts/neuraldeep/coordination-store.mjs';
import * as creationStore from '../scripts/neuraldeep/agent-creation-store.mjs';
import * as creation from '../scripts/neuraldeep/agent-creation.mjs';
import * as runtimeReceipt from '../scripts/neuraldeep/creation-runtime-receipt.mjs';
import * as creationRevision from '../scripts/neuraldeep/creation-revision.mjs';
import * as creationDelivery from '../scripts/neuraldeep/creation-delivery.mjs';
import * as targetManifest from '../scripts/neuraldeep/target-file-manifest.mjs';
import * as creationPreflight from '../scripts/neuraldeep/creation-preflight.mjs';
import { NeuralDeepExecutionWorkspaces } from '../scripts/neuraldeep/execution-workspaces.mjs';
import * as chatHistory from '../scripts/neuraldeep/chat-history-store.mjs';
import * as attachmentStore from '../scripts/neuraldeep/attachment-store.mjs';
import { contractData } from '../scripts/agents-mother/contract.mjs';
import { readAgentCatalog } from '../scripts/agents-mother/identity.mjs';
import { renderOutcomeSpecFromContract, verifyOutcomeApproval } from '../scripts/agents-mother/outcome-spec.mjs';

const require = createRequire(import.meta.url);
const sourceDirectory = 'interfaces/control-center/src/lib/codex-chat';
function load(file, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => id.startsWith('node:') ? require(id) : dependencies[id] || {}, module, module.exports);
  return module.exports;
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(t, { hostStep } = {}) {
  const temporary = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pritha-creation-gateway-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'code'), stateRoot = path.join(temporary, 'state'), target = path.join(temporary, 'children', 'alpha');
  mkdirSync(root, { recursive: true }); mkdirSync(stateRoot); mkdirSync(path.join(target, 'scripts'), { recursive: true });
  writeFileSync(path.join(target, 'scripts', 'smoke-test.mjs'), "console.log('Smoke test passed.');\n");
  const chatId = 'chat_creationfixture', instanceId = 'fixture-instance', draftRoot = creation.creationDraftRoot(stateRoot, instanceId, chatId);
  const cli = spawnSync(process.execPath, [path.resolve('scripts/pritha.mjs'), 'init', '--no-input', '--contract-only', '--name', 'Alpha', '--slug', 'alpha', '--mission', 'Produce a report', '--success', 'Operator receives the report', '--target-folder', target], {
    encoding: 'utf8', env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: path.dirname(target), PRITHA_AGENT_AUTHORING_ROOT: draftRoot },
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const options = { root, stateRoot }, binding = { chatId, creationWorkflowVersion: 1, archived: false, subject: { taskType: 'agent_creation', subjectId: 'alpha' },
    modelId: 'fixture-model', effortId: null, nativeThreadId: 'fixture-native-session', stateIdentityHash: instanceId, workspacePath: root };
  const journal = new coordination.NeuralDeepCoordinationStore(coordination.neuralDeepCoordinationPaths(stateRoot, root));
  t.after(() => journal.close());
  new NeuralDeepExecutionWorkspaces(journal, { stateRoot });
  journal.db.prepare('INSERT INTO execution_agent_targets(owner,path,state) VALUES(?,?,?)').run(chatId, target, 'ready');
  const jobs = new creationStore.AgentCreationStore(journal);
  jobs.create({ chatId, instanceId, agentId: 'alpha', releaseSha: 'a'.repeat(40), target, draftRoot });
  jobs.update(chatId, job => creation.reconcileCreationArtifacts({ ...job, autoContinue: false }, options));
  const dispatches = [], unexpected = () => assert.fail('creation API tests must never dispatch a real model or delivery');
  let gateway;
  const gatewayModule = load(`${sourceDirectory}/gateway.ts`, {
    '../../../../../scripts/neuraldeep/coordination-store.mjs': coordination,
    '../../../../../scripts/neuraldeep/agent-creation-store.mjs': creationStore,
    '../../../../../scripts/neuraldeep/agent-creation.mjs': { ...creation, creationHostStep: hostStep || unexpected },
    '../../../../../scripts/neuraldeep/creation-runtime-receipt.mjs': runtimeReceipt,
    '../../../../../scripts/neuraldeep/creation-revision.mjs': creationRevision,
    '../../../../../scripts/neuraldeep/creation-delivery.mjs': { ...creationDelivery, runCreationDelivery: unexpected },
    '../../../../../scripts/neuraldeep/target-file-manifest.mjs': targetManifest,
    '../../../../../scripts/neuraldeep/creation-preflight.mjs': creationPreflight,
    '@/lib/pritha-paths': { resolvePrithaAgentParent: () => path.dirname(target) },
  });
  function restart() {
    gateway = Object.create(gatewayModule.CodexChatGateway.prototype);
    Object.assign(gateway, { root, store: { stateRoot, stateIdentityHash: instanceId, get: async id => id === chatId ? binding : null },
      activeTurns: new Map(), waitingTurns: new Map(), events: new Map(), subscribers: new Map(), creationAdvances: new Set(), creationDeliveries: new Map(), recoveryComplete: true,
      runtime: new Proxy({}, { get: () => unexpected }), runner: { start: unexpected }, admission: { reconcileWorkload: unexpected }, emitThreadUpdated: async () => {},
      startTurn: async (id, input) => { dispatches.push({ chatId: id, input }); gateway.activeTurns.set(id, { turnId: 'fixture-turn' }); },
    });
    return gateway;
  }
  restart();
  const http = load(`${sourceDirectory}/http.ts`, { './gateway': gatewayModule, '../../../../../scripts/neuraldeep/chat-history-store.mjs': chatHistory, '../../../../../scripts/neuraldeep/attachment-store.mjs': attachmentStore });
  const route = load('interfaces/control-center/src/app/api/codex-chat/v1/threads/[chatId]/creation/route.ts', {
    '@/lib/codex-chat/http': http, '@/lib/codex-chat/gateway': { ...gatewayModule, getCodexChatGateway: () => gateway },
  });
  let sequence = 0;
  const request = (action, extra = {}) => ({ action, requestId: `request_${++sequence}`, expectedRevision: jobs.get(chatId).revision, actor: 'codex-operator', authorizationBasis: 'User delegated the controlled UI test', ...extra });
  async function post(body, headers = {}) {
    const response = await route.POST(new Request(`http://localhost:3999/api/codex-chat/v1/threads/${chatId}/creation`, { method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: 'http://localhost:3999', Host: 'localhost:3999', 'Idempotency-Key': body.requestId, ...headers,
    }, body: JSON.stringify(body) }), { params: Promise.resolve({ chatId }) });
    return { status: response.status, body: await response.json() };
  }
  async function get() {
    const response = await route.GET(new Request('http://localhost:3999'), { params: Promise.resolve({ chatId }) });
    return { status: response.status, body: await response.json() };
  }
  function outcome() {
    const job = jobs.get(chatId), data = contractData(job.contract.path, { root });
    writeFileSync(path.join(draftRoot, 'contracts', 'alpha-outcome.md'), renderOutcomeSpecFromContract(data, { artifactId: 'alpha-outcome', date: '2026-09-19' }));
    return jobs.update(chatId, current => creation.reconcileCreationArtifacts(current, options));
  }
  return { root, stateRoot, options, chatId, target, draftRoot, binding, journal, jobs, dispatches, request, post, get, outcome, restart, get gateway() { return gateway; } };
}

test('creation API requires separate document approvals and repeated navigation has no side effect', async t => {
  const f = fixture(t), initial = f.jobs.get(f.chatId);
  const pages = await Promise.all([f.get(), f.get()]);
  assert.ok(pages.every(page => page.status === 200 && page.body.data.job.jobId === initial.jobId));
  assert.equal(f.jobs.get(f.chatId).revision, initial.revision);
  assert.equal((await f.post(f.request('approve_outcome'))).body.error.code, 'creation_action_unavailable');
  const contractRequest = f.request('approve_contract'), first = await f.post(contractRequest);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.data.job.approvals.contract);
  assert.equal(first.body.data.job.approvals.outcome, undefined);
  const proposal = f.outcome(); assert.equal(proposal.status, 'awaiting_outcome_approval');
  const outcomeRequest = f.request('approve_outcome'), completed = await f.post(outcomeRequest);
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.ok(completed.body.data.job.approvals.outcome);
  assert.equal(verifyOutcomeApproval(completed.body.data.job.outcome.path, f.options).ok, true);
  const revision = f.jobs.get(f.chatId).revision;
  f.gateway.activeTurns.set(f.chatId, { turnId: 'later-active-turn' });
  const repeated = await Promise.all([f.post(contractRequest), f.post(outcomeRequest), f.get()]);
  assert.ok(repeated.every(response => response.status === 200));
  assert.equal(f.jobs.get(f.chatId).revision, revision);
  assert.equal(readFileSync(path.join(f.stateRoot, 'audit', 'outcome-approvals.jsonl'), 'utf8').trim().split('\n').length, 1);
  assert.equal(f.dispatches.length, 0);
});

test('creation API rejects active-step approvals, executor claims and requests without the UI origin', async t => {
  const f = fixture(t);
  f.gateway.activeTurns.set(f.chatId, { turnId: 'busy' });
  assert.equal((await f.post(f.request('approve_contract'))).body.error.code, 'creation_step_active');
  f.gateway.activeTurns.clear(); f.gateway.creationAdvances.add(f.chatId);
  assert.equal((await f.post(f.request('approve_contract'))).body.error.code, 'creation_step_active');
  f.gateway.creationAdvances.clear();
  for (const extra of [{ actor: 'agent' }, { actor: 'codex-operator', authorizationBasis: '' }]) {
    assert.equal((await f.post(f.request('approve_contract', extra))).body.error.code, 'creation_authorization_required');
  }
  const absentOrigin = await f.post(f.request('approve_contract'), { Origin: '' });
  assert.equal(absentOrigin.status, 403); assert.equal(absentOrigin.body.error.code, 'creation_origin_invalid');
  assert.equal((await f.post(f.request('approve_contract'), { Origin: 'https://external.example' })).status, 403);
  const mismatchedKey = await f.post(f.request('approve_contract'), { 'Idempotency-Key': 'different_key' });
  assert.equal(mismatchedKey.body.error.code, 'idempotency_conflict');
  assert.deepEqual(f.jobs.get(f.chatId).approvals, {}); assert.equal(f.dispatches.length, 0);
});

test('an in-progress request remains unconfirmed until the running step is known to have ended', async t => {
  const f = fixture(t), request = f.request('approve_contract');
  f.jobs.beginAction(f.chatId, request);
  f.restart(); f.gateway.activeTurns.set(f.chatId, { turnId: 'unconfirmed-process' });
  const replay = await f.post(request);
  assert.equal(replay.status, 503);
  assert.equal(replay.body.error.code, 'creation_action_unconfirmed');
  assert.equal((await f.post(f.request('approve_contract'))).body.error.code, 'creation_action_unconfirmed');
  assert.deepEqual(f.jobs.get(f.chatId).approvals, {});
  f.gateway.activeTurns.clear();
  const recovered = await f.post(request);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.data.job.approvals.contract.requestId, request.requestId);
});

for (const kind of ['contract', 'outcome']) {
  for (const stage of ['before_document_intent', 'intent_recorded', 'canonical_written', 'receipt_completed', 'job_updated', 'action_completed']) {
    test(`API restart recovers ${kind} at ${stage} with the saved request and no duplicate side effect`, async t => {
      const f = fixture(t);
      if (kind === 'outcome') { assert.equal((await f.post(f.request('approve_contract'))).status, 200); f.outcome(); }
      const before = f.jobs.get(f.chatId), request = f.request(`approve_${kind}`);
      f.jobs.beginAction(f.chatId, request);
      if (!['before_document_intent', 'job_updated', 'action_completed'].includes(stage)) {
        assert.throws(() => creation.approveCreationDocument(before, kind, request, { ...f.options, onApprovalCheckpoint: point => { if (point === stage) throw new Error('process vanished'); } }), /process vanished/);
      } else if (stage !== 'before_document_intent') {
        const approved = creation.approveCreationDocument(before, kind, request, f.options);
        f.jobs.update(f.chatId, () => approved, before.revision);
        if (stage === 'action_completed') f.jobs.finishAction(f.chatId, request.requestId, { ok: true });
      }
      f.restart();
      const recovered = await f.post(request);
      assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
      assert.equal(recovered.body.data.replayed, true);
      assert.equal(recovered.body.data.job.approvals[kind].requestId, request.requestId);
      const stable = f.jobs.get(f.chatId);
      assert.equal((await f.post(request)).status, 200);
      assert.equal(f.jobs.get(f.chatId).revision, stable.revision);
      assert.equal((await f.post({ ...request, actor: 'user' })).body.error.code, 'idempotency_conflict');
      assert.equal(f.dispatches.length, 0);
      assert.equal(readdirSync(path.join(f.stateRoot, 'agents', 'contracts')).filter(name => name.endsWith('.md')).length, kind === 'contract' ? 1 : 2);
      if (kind === 'outcome') assert.equal(readFileSync(path.join(f.stateRoot, 'audit', 'outcome-approvals.jsonl'), 'utf8').trim().split('\n').length, 1);
    });
  }
}

test('continue after reload uses the same chat and the repeated request does not dispatch twice', async t => {
  const f = fixture(t);
  assert.equal((await f.post(f.request('approve_contract'))).status, 200);
  f.jobs.update(f.chatId, job => ({ ...job, status: 'paused', autoContinue: false }));
  f.restart();
  const request = f.request('continue');
  assert.equal((await f.post(request)).status, 200); await tick();
  assert.equal(f.dispatches.length, 1); assert.equal(f.dispatches[0].chatId, f.chatId);
  assert.equal((await f.post(request)).body.data.replayed, true);
  assert.equal((await f.get()).body.data.job.chatId, f.chatId);
  assert.equal(f.dispatches.length, 1);
  assert.equal(f.journal.db.prepare('SELECT COUNT(*) count FROM agent_creation_jobs').get().count, 1);
});

test('UI revision preserves accepted evidence and native chat while replaying one new proposal', async t => {
  const f=fixture(t);
  assert.equal((await f.post(f.request('approve_contract'))).status,200);
  const previous=f.jobs.get(f.chatId), accepted=readFileSync(previous.contract.path,'utf8');
  rmSync(path.join(f.target,'scripts'),{recursive:true});
  const request=f.request('revise_proposal',{reason:'Add a source filter to the report'});
  const revised=await f.post(request);await tick();
  assert.equal(revised.status,200,JSON.stringify(revised.body));
  const current=f.jobs.get(f.chatId);
  assert.equal(current.generation,2);
  assert.equal(current.chatId,previous.chatId);assert.equal(current.target,previous.target);
  assert.deepEqual(current.budget,previous.budget);assert.deepEqual(current.approvals,{});
  assert.equal(readFileSync(previous.contract.path,'utf8'),accepted);
  assert.notEqual(current.contract.path,previous.contract.path);
  assert.equal(current.proposalRevisionPending,true);
  assert.equal(f.dispatches.length,1);
  assert.equal((await f.post(request)).status,200);
  assert.equal(f.jobs.get(f.chatId).generation,2);assert.equal(f.dispatches.length,1);
  assert.equal((await f.post({...request,reason:'Different revision'})).body.error.code,'idempotency_conflict');
});

test('known usage cannot release a creation step while a descendant remains alive', async t=>{
  const f=fixture(t),turnId='turn_knownlive';
  let turn={turnId,status:'in_progress',items:[{id:'command_test',kind:'command',commandPreview:'node check.mjs',exitCode:1,status:'completed'}],executionIntent:{dispatchState:'dispatched'}};
  Object.assign(f.gateway.store,{mutateTurn:async(_chat,_turn,update)=>(turn=update(turn)),getTurn:async()=>turn,
    patch:async()=>{},historyStore:async()=>({liveTurns:()=>[]})});
  f.jobs.update(f.chatId,job=>({...job,status:'running',activeTurnId:turnId}));
  f.journal.beginRuntimeRun({runId:'run_knownlive',requestHash:'b'.repeat(64),receipt:{workload_id:turnId}});
  f.journal.updateRuntimeRun('run_knownlive',{process_exited:true,process_tree_exited:false,adapter_closed:true,usage_record:{usageKnown:true,usage:{totalTokens:123}}});
  f.gateway.activeTurns.set(f.chatId,{turnId,admissionController:new AbortController(),admissionLease:{release:async()=>{throw new Error('live descendant');}}});
  await f.gateway.finishAttempt(f.chatId,'failed',{code:'turn_step_timeout',message:'time limit'});
  let job=f.jobs.get(f.chatId);
  assert.equal(job.activeTurnId,turnId);assert.equal(job.budget.tokensUsed,123);
  assert.equal(job.blocker.code,'creation_execution_unconfirmed');
  assert.equal(job.checkpoint.commands[0].exitCode,1);
  assert.equal(job.checkpoint.releaseSha,job.releaseSha);
  assert.equal((await f.post(f.request('continue'))).body.error.code,'creation_action_unavailable');
  assert.equal((await f.post(f.request('approve_contract'))).body.error.code,'creation_action_unavailable');
  f.journal.updateRuntimeRun('run_knownlive',{process_tree_exited:true});
  f.gateway.admission.reconcileWorkload=()=>{};
  assert.equal((await f.get()).status,200);
  job=f.jobs.get(f.chatId);
  assert.equal(job.activeTurnId,null);assert.equal(job.budget.tokensUsed,123);assert.equal(job.status,'paused');
  assert.equal(f.dispatches.length,0);
});

for(const stage of ['intent_recorded','drafts_archived','seed_written','receipt_completed']) {
  test(`UI revision retries the exact pending action after ${stage}`,async t=>{
    const f=fixture(t);
    assert.equal((await f.post(f.request('approve_contract'))).status,200);
    rmSync(path.join(f.target,'scripts'),{recursive:true});
    const previous=f.jobs.get(f.chatId),request=f.request('revise_proposal',{reason:'Support a date filter'});
    f.jobs.beginAction(f.chatId,request);
    assert.throws(()=>creationRevision.reviseCreationProposal(previous,request,{...f.options,coordination:f.journal,onRevisionCheckpoint:point=>{if(point===stage)throw new Error('revision process vanished');}}),/revision process vanished/);
    f.restart();
    const inspected=await f.get();assert.equal(inspected.body.data.job.blocker.code,'creation_revision_incomplete');
    const replay=await f.post(request);await tick();
    assert.equal(replay.status,200,JSON.stringify(replay.body));
    assert.equal(f.jobs.get(f.chatId).generation,2);assert.equal(f.dispatches.length,1);
    assert.equal((await f.post(request)).status,200);assert.equal(f.dispatches.length,1);
  });
}

test('a changed reviewed draft cannot be approved with the old UI request', async t => {
  const f = fixture(t), job = f.jobs.get(f.chatId), request = f.request('approve_contract');
  writeFileSync(job.contract.path, job.contract.text.replace('Produce a report', 'Publish a different report'));
  const result = await f.post(request);
  assert.equal(result.status, 409);
  assert.match(result.body.error.code, /^creation_(document_changed|revision_stale)$/);
  assert.deepEqual(f.jobs.get(f.chatId).approvals, {});
  assert.equal(f.dispatches.length, 0);
});

test('a changed accepted document is reported as stale and cannot start another paid step', async t => {
  const f = fixture(t);
  assert.equal((await f.post(f.request('approve_contract'))).status, 200);
  const job = f.jobs.get(f.chatId);
  writeFileSync(job.contract.path, `${readFileSync(job.contract.path, 'utf8')}\nUnreviewed change.\n`);
  const status = await f.get();
  assert.equal(status.body.data.job.blocker?.code, 'creation_approved_document_changed');
  assert.equal(status.body.data.job.actions.continue, false);
  const continued = await f.post(f.request('continue')); await tick();
  assert.equal(continued.status, 409);
  assert.equal(f.dispatches.length, 0);
});

test('the ready-agent link resolves the exact instance catalog identity instead of inventing a slug URL', async t => {
  const f = fixture(t);
  assert.equal((await f.post(f.request('approve_contract'))).status, 200);
  const job = { ...f.jobs.get(f.chatId), status: 'ready', delivery: { adopted: true, acceptance: 'not_accepted' } };
  const view = creation.creationJobView(job, f.options);
  assert.match(view.agentCardUrl, /^\/agents\/agent-[a-f0-9]+$/, JSON.stringify(readAgentCatalog({ ...f.options, agentParent: path.dirname(job.target) }).agents.map(agent => ({ id: agent.id, agentId: agent.agentId, projectPath: agent.projectPath, contractSource: agent.contractSource, diagnostics: agent.diagnostics }))));
  assert.notEqual(view.agentCardUrl, `/agents/${job.agentId}`);
  for (const changed of [
    { ...job, target: path.join(path.dirname(job.target), 'unrelated-agent') },
    { ...job, contract: { ...job.contract, path: path.join(f.draftRoot, 'contracts', 'different-contract.md') } },
    { ...job, delivery: { adopted: false } },
  ]) assert.equal(creation.creationJobView(changed, f.options).agentCardUrl, null);
});

for (const action of ['pause', 'cancel']) {
  test(`${action} during the host scaffold step prevents subsequent dispatch`, async t => {
    const entered = deferred(), release = deferred();
    const f = fixture(t, { hostStep: async job => { entered.resolve(); await release.promise; return { ...job, researchReady: true, scaffoldReady: false, status: 'pending' }; } });
    assert.equal((await f.post(f.request('approve_contract'))).status, 200); f.outcome();
    assert.equal((await f.post(f.request('approve_outcome'))).status, 200);
    f.jobs.update(f.chatId, job => ({ ...job, status: 'pending', researchAttemptCompleted: true, autoContinue: true }));
    const advance = f.gateway.advanceCreation(f.chatId); await entered.promise;
    const stop = await f.post(f.request(action)); assert.equal(stop.status, 200, JSON.stringify(stop.body));
    release.resolve(); await advance;
    const saved = f.jobs.get(f.chatId);
    assert.equal(saved.status, action === 'cancel' ? 'cancelled' : 'paused');
    assert.equal(saved.autoContinue, false);
    assert.equal(f.dispatches.length, 0, 'a late host result must not start another model turn');
  });
}
