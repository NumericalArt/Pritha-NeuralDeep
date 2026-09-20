import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as coordination from '../scripts/neuraldeep/coordination-store.mjs';
import * as creationStore from '../scripts/neuraldeep/agent-creation-store.mjs';
import * as creation from '../scripts/neuraldeep/agent-creation.mjs';
import * as historyModule from '../scripts/neuraldeep/chat-history-store.mjs';
import * as identity from '../scripts/neuraldeep/runtime-identity.mjs';
import * as workspaces from '../scripts/neuraldeep/execution-workspaces.mjs';
import * as resources from '../scripts/neuraldeep/execution-resources.mjs';
import * as targetReservation from '../scripts/neuraldeep/task-chat-agent-creation.mjs';
import * as phases from '../scripts/neuraldeep/task-chat-phases.mjs';
import * as preflight from '../scripts/neuraldeep/creation-preflight.mjs';
import * as manifest from '../scripts/neuraldeep/target-file-manifest.mjs';
import * as receipts from '../scripts/neuraldeep/creation-runtime-receipt.mjs';
import * as delivery from '../scripts/neuraldeep/creation-delivery.mjs';
import { runCreationScaffoldStep } from '../scripts/neuraldeep/creation-scaffold.mjs';
import { FunctionBuildExecutor } from '../scripts/agents-mother/build-executors.mjs';
import { contractData } from '../scripts/agents-mother/contract.mjs';
import { renderOutcomeSpecFromContract } from '../scripts/agents-mother/outcome-spec.mjs';
import { patternPackMarkdown, verifyPatternPackIntegrity } from '../scripts/agents-mother/pattern-research.mjs';
import { deriveExternalResearchTopics } from '../scripts/agents-mother/external-research-topics.mjs';
import { applyExternalResearchEvidence } from '../scripts/agents-mother/external-research.mjs';
import { markdownDocumentLock } from '../scripts/lib/markdown-content-lock.mjs';

const require = createRequire(import.meta.url), repo = path.resolve('.');
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

async function fixture(t) {
  const temporary = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'creation-context-gateway-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'code'), stateRoot = path.join(temporary, 'state'), agentParent = path.join(temporary, 'children');
  for (const directory of [root, stateRoot, agentParent]) mkdirSync(directory);
  const verifier = path.join(root, 'verify-result.mjs');
  writeFileSync(verifier, "import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';assert.equal(readFileSync('result.txt','utf8'),'working');\n");
  git(root, 'init'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Synthetic pinned host');
  const releaseSha = git(root, 'rev-parse', 'HEAD'), chatId = 'chat_contextfixture';
  const runtimeIdentity = identity.neuralDeepRuntimeIdentity(stateRoot);
  const history = new historyModule.NeuralDeepChatHistoryStore({ databasePath: path.join(stateRoot, 'history.sqlite'), instanceScope: runtimeIdentity.stateIdentityHash });
  const journal = new coordination.NeuralDeepCoordinationStore(coordination.neuralDeepCoordinationPaths(stateRoot, root));
  t.after(() => { history.close(); journal.close(); });
  const jobs = new creationStore.AgentCreationStore(journal), target = path.join(agentParent, 'alpha');
  const draftRoot = creation.creationDraftRoot(stateRoot, runtimeIdentity.stateIdentityHash, chatId);
  jobs.create({ chatId, instanceId: runtimeIdentity.stateIdentityHash, agentId: 'alpha', releaseSha, target, draftRoot });
  history.put({ chatId, clientThreadId: 'client_contextfixture', creationWorkflowVersion: 1, origin: 'chat',
    providerId: 'neuraldeep_cli', modelId: 'fixture-model', effortId: null, nativeThreadId: null,
    stateIdentityHash: runtimeIdentity.stateIdentityHash, profileIdentity: runtimeIdentity.profileIdentity,
    workspacePath: root, subject: { taskType: 'agent_creation', subjectId: 'alpha' }, messageReceipts: {}, turns: [], taskLinks: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false });
  const options = { root, stateRoot, agentParent, sourceRoot: root, sourceRevision: releaseSha };
  const cli = (args, authoring = false) => execFileSync(process.execPath, [path.join(repo, 'scripts/pritha.mjs'), ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot,
      PRITHA_AGENT_PARENT: agentParent, PRITHA_AGENT_AUTHORING_ROOT: authoring ? draftRoot : '' }, stdio: 'pipe', timeout: 30000,
  });
  let gateway, sequence = 0, buildCalls = 0;
  const launches = [], leases = [], completions = [];
  const dependencies = {
    '../../../../../scripts/neuraldeep/coordination-store.mjs': coordination,
    '../../../../../scripts/neuraldeep/agent-creation-store.mjs': creationStore,
    '../../../../../scripts/neuraldeep/chat-history-store.mjs': historyModule,
    '../../../../../scripts/neuraldeep/runtime-identity.mjs': identity,
    '../../../../../scripts/neuraldeep/execution-workspaces.mjs': workspaces,
    '../../../../../scripts/neuraldeep/execution-resources.mjs': resources,
    '../../../../../scripts/neuraldeep/task-chat-agent-creation.mjs': targetReservation,
    '../../../../../scripts/neuraldeep/task-chat-phases.mjs': phases,
    '../../../../../scripts/neuraldeep/creation-preflight.mjs': preflight,
    '../../../../../scripts/neuraldeep/target-file-manifest.mjs': manifest,
    '../../../../../scripts/neuraldeep/creation-runtime-receipt.mjs': receipts,
    '../../../../../scripts/neuraldeep/agent-creation.mjs': { ...creation, creationHostStep: job => runCreationScaffoldStep(job, options, args => cli(args)) },
    '../../../../../scripts/neuraldeep/creation-delivery.mjs': { ...delivery, runCreationDelivery: (job, input) => delivery.runCreationDelivery(job, {
      ...input, trialBackend: 'local', reportDir: false, buildExecutor: new FunctionBuildExecutor(async request => {
        buildCalls++;
        if (buildCalls === 1) writeFileSync(path.join(request.worktree, 'scripts/smoke-test.mjs'), "console.log('Smoke test passed.');\n");
        else writeFileSync(path.join(request.worktree, 'result.txt'), 'working');
        return { thread_id: 'synthetic-build', turn_id: `synthetic-build-turn-${buildCalls}`, tokens_used: 25 };
      }),
    }) },
    '@/lib/pritha-paths': { resolvePrithaAgentParent: () => agentParent, resolvePrithaAgentMemoryRoot: () => path.join(stateRoot, 'agents') },
    '@/lib/realtime/pritha-runtime': { getPrithaRuntimeSettings: () => ({ codexSandbox: 'workspace-write', codexNetworkAccess: false, codexTimeoutMs: 10000, updatedAt: new Date().toISOString() }) },
    '@/lib/private-user-context': { privateUserContextFor: () => '' },
    './attachment-store': { AttachmentError: class AttachmentError extends Error {} },
    './admission-coordinator': { AdmissionCancelledError: class AdmissionCancelledError extends Error {}, AdmissionBlockedError: class AdmissionBlockedError extends Error {} },
  };
  const code = ts.transpileModule(readFileSync(path.join(repo, 'interfaces/control-center/src/lib/codex-chat/gateway.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => id.startsWith('node:') ? require(id) : dependencies[id] || {}, module, module.exports);
  function restart() {
    gateway = Object.create(module.exports.CodexChatGateway.prototype);
    Object.assign(gateway, { root, recoveryComplete: true, activeTurns: new Map(), waitingTurns: new Map(), creationAdvances: new Set(), creationDeliveries: new Map(),
      store: { root: path.join(stateRoot, 'codex-chat'), stateRoot, stateIdentityHash: runtimeIdentity.stateIdentityHash,
        get: async id => history.get(id), historyStore: async () => history, getTurn: async (id, turn) => history.turn(id, turn),
        mutate: async (id, update) => history.mutate(id, update), patch: async (id, patch) => history.mutate(id, current => ({ ...current, ...patch })),
        mutateTurn: async (id, turn, update) => history.mutateTurn(id, turn, update) },
      emit: () => {}, emitThreadUpdated: async () => {},
      runtime: { probe: async () => ({ ok: true, state: 'available' }), status: async () => ({ availability: 'ready', effectiveProvider: 'neuraldeep_cli', providerState: 'available', models: [{ id: 'fixture-model' }], selected: { modelId: 'fixture-model' } }) },
      admission: { acquire: async input => {
        leases.push(input); journal.enqueue({ ...input, coordinationKeyHash: hash(input.coordinationKey).slice(0, 24), queuedAt: new Date().toISOString() });
        const claim = journal.claim(input.attemptId, 1); assert.ok(claim);
        return { launcherReceipt: { attemptId: input.attemptId, ownerToken: claim.ownerToken }, release: async status => journal.finish(input.attemptId, claim.ownerToken, status) };
      }, reconcileWorkload: (...args) => journal.reconcileWorkload(...args) },
      runner: { start: async input => {
        launches.push(input); const sessionId = `synthetic-session-${launches.length}`, runId = `synthetic-run-${launches.length}`;
        journal.beginRuntimeRun({ runId, requestHash: hash(input.prompt), receipt: { workload_id: input.workloadId, status: 'running', process_exited: false } });
        journal.attachRuntime(input.admission.attemptId, input.admission.ownerToken, runId, identity.neuralDeepSessionKey(stateRoot, sessionId));
        await input.onEvent({ type: 'thread.started', thread_id: sessionId });
        completions.push({ runId, turnId: input.workloadId });
        return { interrupt: () => {}, completion: new Promise(() => {}) };
      } },
    });
    // Input persistence matches the HTTP host. Workspace, admission, launch,
    // event binding, completion, approvals, scaffold and delivery use production code.
    gateway.startTurn = async (id, input) => {
      const binding = history.get(id), turnId = `turn_context_${++sequence}`;
      const turn = { turnId, clientMessageId: input.clientMessageId, status: 'queued', items: [], pendingRequestIds: [],
        startedAt: new Date().toISOString(), completedAt: null, error: null,
        userMessage: { id: `user_${sequence}`, role: 'user', status: 'completed', markdown: input.input[0].text, createdAt: new Date().toISOString() } };
      turn.executionIntent = gateway.executionIntent(binding, turnId);
      history.mutate(id, current => ({ ...current, messageReceipts: { ...current.messageReceipts,
        [input.clientMessageId]: { clientMessageId: input.clientMessageId, turnId, nativeTurnId: binding.nativeThreadId || '', requestHash: hash(input.input[0].text), startedAt: turn.startedAt } }, turns: [...current.turns, turn] }));
      const active = gateway.activeAttempt(turn, hash(input.input[0].text), input.input[0].text);
      gateway.activeTurns.set(id, active); await gateway.admitAttempt(id, active);
      assert.ok(active.run, JSON.stringify(history.turn(id, turnId).error));
      return turnId;
    };
  }
  restart();
  async function complete() {
    const current = completions.at(-1);
    journal.updateRuntimeRun(current.runId, { status: 'completed', process_exited: true, process_tree_exited: true, adapter_closed: true,
      usage_record: { usageKnown: true, usage: { totalTokens: 100 } } });
    await gateway.finishAttempt(chatId, 'completed', null);
    for (let n = 0; n < 2000 && gateway.creationAdvances.size; n++) await tick();
    assert.equal(gateway.creationAdvances.size, 0, 'bounded host completion');
  }
  const approve = async kind => {
    const request = { action: `approve_${kind}`, requestId: `approve_${kind}`, expectedRevision: jobs.get(chatId).revision,
      actor: 'codex-operator', authorizationBasis: 'Synthetic operator delegated for this isolated test' };
    const result = await gateway.creationAction(chatId, request);
    for (let n = 0; n < 2000 && gateway.creationAdvances.size; n++) await tick();
    assert.equal(gateway.creationAdvances.size, 0, 'bounded host approval advance');
    return { request, result };
  };
  return { root, stateRoot, target, draftRoot, chatId, jobs, journal, history, options, cli, verifier, launches, leases, complete, approve, restart,
    get gateway() { return gateway; }, get buildCalls() { return buildCalls; } };
}

test('one creation task crosses fresh native steps, separate approvals, actual scaffold and verified delivery with additive usage', async t => {
  const f = await fixture(t);
  await f.gateway.startTurn(f.chatId, { clientMessageId: 'initial', input: [{ type: 'text', text: 'Produce a local report. Keep the approved scope and all existing data.' }] });
  f.cli(['init', '--no-input', '--contract-only', '--name', 'Alpha', '--slug', 'alpha', '--mission', 'Produce a local report', '--success', 'A working report is saved', '--target-folder', f.target,
    '--repository-policy', 'not-applicable', '--repository-waiver', 'Synthetic local fixture does not select repository code; runtime checks remain required'], true);
  f.history.putItem(f.chatId, 'turn_context_1', { id: 'large_command', kind: 'command', status: 'completed', commandPreview: 'read document', outputPreview: 'OLD_COMMAND_DATA'.repeat(30000), exitCode: 0 });
  await f.complete();
  assert.equal(f.jobs.get(f.chatId).status, 'awaiting_contract_approval');
  assert.equal(f.jobs.get(f.chatId).budget.tokensUsed, 100);
  f.restart();
  const contractApproval = await f.approve('contract');
  assert.equal(f.launches.length, 2);
  assert.equal(f.launches[1].resume, null);
  assert.match(f.launches[1].prompt, /Keep the approved scope/);
  assert.doesNotMatch(f.launches[1].prompt, /OLD_COMMAND_DATA/);
  assert.match(f.launches[1].prompt, /Saved checkpoint/);
  assert.ok(f.leases.every(lease => lease.sessionKeyHash === null));
  const job = f.jobs.get(f.chatId), data = contractData(job.contract.path, { root: f.root });
  const spec = renderOutcomeSpecFromContract(data, { artifactId: 'alpha-outcome', date: '2026-09-21' })
    .replace('["node", "scripts/smoke-test.mjs"]', JSON.stringify([process.execPath, f.verifier]));
  writeFileSync(path.join(f.draftRoot, 'contracts', 'alpha-outcome.md'), spec);
  await f.complete();
  assert.equal(f.jobs.get(f.chatId).status, 'awaiting_outcome_approval');
  assert.equal(f.jobs.get(f.chatId).budget.tokensUsed, 200);
  await f.gateway.creationAction(f.chatId, contractApproval.request);
  assert.equal(f.launches.length, 2, 'replayed approval does not create a third session');
  await f.approve('outcome');
  assert.equal(f.launches.length, 3);
  const researchJob = f.jobs.get(f.chatId), source = contractData(researchJob.contract.path, { root: f.root });
  const pattern = patternPackMarkdown(source, { memoryResults: [{ path: 'fixture.md', title: 'Fixture', snippet: 'Use bounded local execution.', type: 'standard', status: 'accepted' }] });
  const researchDirectory = path.join(f.draftRoot, 'research'); mkdirSync(researchDirectory, { recursive: true });
  const patternPath = path.join(researchDirectory, 'pattern.md'); writeFileSync(patternPath, pattern.text);
  const topics = deriveExternalResearchTopics(source, { patternPack: { externalResearchSeeds: verifyPatternPackIntegrity(pattern.text).payload.external_research_seeds } });
  let report = `---\nid: fixture-research\ntype: review\nstatus: draft\nresearch_gate_status: complete\nmemory_research_status: complete\nexternal_research_status: not-applicable\nsynthesis_status: not-applicable\ncontract_fingerprint: ${source.fingerprint}\npattern_pack: ${JSON.stringify(path.relative(f.root, patternPath))}\npattern_pack_lock: ${pattern.lock}\npattern_pack_contract_fingerprint: ${source.fingerprint}\nexternal_research_topics: ${JSON.stringify(topics.map(topic => topic.id))}\nresearch_content_lock: pending\nsources:\n  - ${JSON.stringify(source.relPath)}\n---\n\n# Fixture research\n\nContract: ${source.relPath}\n`;
  report = report.replace(/^research_content_lock:.*$/m, `research_content_lock: ${markdownDocumentLock(report)}`);
  if (topics.length) {
    const now = new Date().toISOString();
    const applied = applyExternalResearchEvidence(report, source, { backend: 'manual', completed_at: now,
      items: topics.map(topic => ({ topic_id: topic.id, source_url: `https://example.test/official/${topic.id}`, source_type: 'official-docs', source_updated: now, retrieved_at: now, claim: 'Synthetic official fixture confirms the bounded local runtime.', confidence: 'high' })),
      synthesis: { relationship: 'confirms', memory_comparison: 'Fixture confirms the local standard.', summary: 'Retain bounded local execution.', architecture_decision: 'Use the existing adapter.', alternatives: ['Defer implementation until the interface is stable'], tradeoffs: ['Verification effort'] },
    }, { topics });
    assert.equal(applied.synthesisStatus, 'complete', JSON.stringify(applied.synthesis.errors));
    report = applied.text;
  }
  writeFileSync(path.join(researchDirectory, 'research.md'), report);
  await f.complete();
  for (let n = 0; n < 1000 && (f.gateway.creationAdvances.size || f.gateway.creationDeliveries.size); n++) await tick();
  const ready = f.jobs.get(f.chatId);
  assert.equal(ready.status, 'ready', JSON.stringify(ready.blocker));
  assert.equal(ready.budget.tokensUsed, 350);
  assert.equal(ready.delivery.acceptance, 'not_accepted');
  assert.equal(f.buildCalls, 2, 'stdout-only smoke fails the independent result verifier before correction');
  assert.equal(readFileSync(path.join(f.target, 'result.txt'), 'utf8'), 'working');
  assert.equal(new Set(Object.values(f.history.get(f.chatId).messageReceipts).map(receipt => receipt.nativeTurnId)).size, 3);
  assert.ok(f.history.item(f.chatId, 'large_command').contentRef, 'full original output remains retrievable');
});

test('a fresh creation session rejects stale context and unexpected second session identity before another model call', async t => {
  const f = await fixture(t);
  await f.gateway.startTurn(f.chatId, { clientMessageId: 'initial', input: [{ type: 'text', text: 'Create a bounded local report.' }] });
  const active = f.gateway.activeTurns.get(f.chatId);
  await f.gateway.handleCliEvent(f.chatId, active, { type: 'thread.started', thread_id: 'synthetic-session-1' });
  await assert.rejects(f.gateway.handleCliEvent(f.chatId, active, { type: 'thread.started', thread_id: 'foreign-session' }), { code: 'runtime_identity_mismatch' });
  assert.equal(f.history.get(f.chatId).nativeThreadId, 'synthetic-session-1');
  assert.equal(f.launches.length, 1);
});

test('a changed queued product request fails its saved context hash before provider dispatch', async t => {
  const f = await fixture(t);
  f.gateway.runtime.probe = async () => {
    const changed = f.history.body('Changed after admission.');
    f.history.db.prepare('UPDATE turns SET user_body=? WHERE chat=? AND id=?').run(changed, f.chatId, 'turn_context_1');
    return { ok: true, state: 'available' };
  };
  await assert.rejects(f.gateway.startTurn(f.chatId, { clientMessageId: 'initial', input: [{ type: 'text', text: 'Original authorized scope.' }] }), /runtime_identity_mismatch/);
  assert.equal(f.launches.length, 0);
  assert.equal(f.jobs.get(f.chatId).budget.tokensUsed, 0);
  assert.deepEqual(f.jobs.get(f.chatId).budget.unknownAttempts, []);
});

test('typing another creation message cannot bypass unsettled process or unknown usage gates', async t => {
  for (const reason of ['process', 'usage']) {
    const f = await fixture(t);
    await f.gateway.startTurn(f.chatId, { clientMessageId: 'initial', input: [{ type: 'text', text: 'Prepare a local report.' }] });
    await f.complete();
    f.jobs.update(f.chatId, job => ({ ...job, status: 'blocked',
      ...(reason === 'process' ? { activeTurnId: 'turn_context_1' } : { budget: { ...job.budget, unknownAttempts: ['turn_context_1'] } }) }));
    await assert.rejects(f.gateway.startTurn(f.chatId, { clientMessageId: 'followup', input: [{ type: 'text', text: 'Continue the same report.' }] }),
      reason === 'process' ? /creation_execution_unconfirmed/ : /creation_usage_unknown/);
    assert.equal(f.launches.length, 1);
    assert.equal(f.jobs.get(f.chatId).budget.tokensUsed, 100);
    if (reason === 'process') assert.equal(f.jobs.get(f.chatId).activeTurnId, 'turn_context_1');
    else assert.deepEqual(f.jobs.get(f.chatId).budget.unknownAttempts, ['turn_context_1']);
  }
});
