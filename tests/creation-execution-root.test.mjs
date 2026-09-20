import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { NeuralDeepExecutionWorkspaces } from '../scripts/neuraldeep/execution-workspaces.mjs';
import { AgentCreationStore } from '../scripts/neuraldeep/agent-creation-store.mjs';
import { creationDraftRoot } from '../scripts/neuraldeep/agent-creation.mjs';
import { executionResourceClaims } from '../scripts/neuraldeep/execution-resources.mjs';
import { assertCreationExecutionRoot } from '../scripts/neuraldeep/creation-execution-root.mjs';
import { buildCodexExecArgs, sanitizedCodexEnvironment } from '../scripts/neuraldeep-codex.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(t, proposal = {}) {
  const temp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pritha-creation-root-'))), root = path.join(temp, 'code'), stateRoot = path.join(temp, 'state');
  mkdirSync(root); mkdirSync(stateRoot); git(root, 'init'); writeFileSync(path.join(root, 'platform.mjs'), 'export const version = 1;\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'Pinned platform');
  const releaseSha = git(root, 'rev-parse', 'HEAD'), chatId = 'chat-fixture', turnId = 'turn-fixture', attemptId = 'attempt-fixture';
  const store = new NeuralDeepCoordinationStore();
  t.after(() => { store.close(); rmSync(temp, { recursive: true, force: true }); });
  const allocator = new NeuralDeepExecutionWorkspaces(store, { stateRoot });
  const workspace = await allocator.prepare({ ownerId: chatId, sourcePath: root, mutating: true, expectedCommit: releaseSha, requireClean: true });
  const jobs = new AgentCreationStore(store), draftRoot = creationDraftRoot(stateRoot, 'fixture', chatId), target = path.join(temp, 'agent');
  mkdirSync(draftRoot, { recursive: true }); mkdirSync(target);
  jobs.create({ chatId, instanceId: 'fixture', agentId: 'alpha', releaseSha, target, draftRoot });
  jobs.update(chatId, job => ({ ...job, status: 'running', activeTurnId: turnId,
    ...(proposal.generation === undefined ? {} : { generation: proposal.generation }) }));
  const options = { cwd: draftRoot, executionCodeRoot: workspace.cwd, model: 'fixture-model', effort: 'high', sandbox: 'workspace-write', workloadId: turnId, addDirs: [draftRoot] };
  const execution = { attemptId, cwd: draftRoot, executionCodeRoot: workspace.cwd, modelId: options.model, effortId: options.effort, sandbox: options.sandbox,
    additionalWritableDirs: options.addDirs, agentCreationRequested: true, executionAgentTarget: target,
    ...(proposal.creationGeneration === undefined ? {} : { creationGeneration: proposal.creationGeneration }),
    ...(proposal.creationSession === undefined ? {} : { creationSession: proposal.creationSession }) };
  store.enqueue({ attemptId, workloadId: turnId, surface: 'task_chat', coordinationKeyHash: 'a'.repeat(24), queuedAt: new Date().toISOString(),
    payload: { chatId, turnId, execution }, resources: executionResourceClaims({ cwd: draftRoot, sandbox: options.sandbox, additionalWritableDirs: [draftRoot] }) });
  const claim = store.claim(attemptId, 1);
  const environment = { PRITHA_AGENT_AUTHORING_ROOT: draftRoot, PRITHA_NEURALDEEP_ADMISSION_RECEIPT: JSON.stringify({ attemptId, ownerToken: claim.ownerToken }) };
  const runtime = { projectRoot: root, stateRoot, codexHome: path.join(stateRoot, 'codex'), instanceId: 'fixture' };
  return { root, stateRoot, store, jobs, workspace, options, environment, runtime, chatId };
}

test('a host-bound creation executes pinned code with only its draft cwd writable', async t => {
  const f = await fixture(t);
  await assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment);
  const args = buildCodexExecArgs(f.options), declaration = args.find(value => value.startsWith('sandbox_workspace_write.writable_roots='));
  const roots = JSON.parse(declaration.split('=').slice(1).join('='));
  assert.ok(roots.every(root => root === f.options.cwd)); assert.ok(!roots.includes(f.options.executionCodeRoot));
  const env = sanitizedCodexEnvironment(f.runtime, f.environment, f.options.executionCodeRoot);
  assert.equal(env.TECHSCOPE_ROOT, f.options.executionCodeRoot); assert.equal(env.PRITHA_AGENT_AUTHORING_ROOT, f.options.cwd);
  assert.equal(env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT, undefined, 'model child cannot replay the launcher bearer');
});

test('checkpoint session admission rejects native resume and malformed context identity', async t => {
  const creationSession = { mode: 'checkpoint', previousSessionId: 'prior-session', contextHash: 'b'.repeat(64) };
  const f = await fixture(t, { creationSession });
  await assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment);
  await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, { ...f.options, resume: 'prior-session' }, f.environment), /execution_code_root_unverified/);
  for (const changed of [{ ...creationSession, contextHash: '' }, { ...creationSession, mode: 'resume' }, { ...creationSession, previousSessionId: {} }]) {
    const invalid = await fixture(t, { creationSession: changed });
    await assert.rejects(assertCreationExecutionRoot(invalid.store, invalid.runtime, invalid.options, invalid.environment), /execution_code_root_unverified/);
  }
});

test('host proof rejects spoofed leases, roots, writable scopes, models and lost authoring transport', async t => {
  const f = await fixture(t);
  for (const [options, environment] of [
    [{ ...f.options, cwd: f.workspace.cwd }, f.environment],
    [{ ...f.options, executionCodeRoot: f.root }, f.environment],
    [{ ...f.options, addDirs: [f.stateRoot] }, f.environment],
    [{ ...f.options, addDirs: [f.workspace.cwd] }, f.environment],
    [{ ...f.options, workloadId: 'another-turn' }, f.environment],
    [{ ...f.options, model: 'another-model' }, f.environment],
    [{ ...f.options, sandbox: 'danger-full-access' }, f.environment],
    [f.options, { ...f.environment, PRITHA_NEURALDEEP_ADMISSION_RECEIPT: '{}' }],
    [f.options, { ...f.environment, PRITHA_AGENT_AUTHORING_ROOT: '' }],
  ]) await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, options, environment), /execution_code_root_unverified/);
});

test('dirty execution code, a different pinned release and a paused job cannot dispatch', async t => {
  const f = await fixture(t);
  writeFileSync(path.join(f.workspace.cwd, 'platform.mjs'), 'export const version = 2;\n');
  await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment), /execution_code_root_unverified/);
  git(f.workspace.cwd, 'add', '.'); git(f.workspace.cwd, 'commit', '-m', 'Other release');
  await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment), /execution_code_root_unverified/);
  f.jobs.update(f.chatId, job => ({ ...job, status: 'paused' }));
  await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment), /execution_code_root_unverified/);
});

test('a revised proposal rejects a saved first-generation launch and accepts only its own generation', async t => {
  for (const creationGeneration of [undefined, 1]) {
    const stale = await fixture(t, { generation: 2, creationGeneration });
    await assert.rejects(assertCreationExecutionRoot(stale.store, stale.runtime, stale.options, stale.environment), /execution_code_root_unverified/);
  }
  const current = await fixture(t, { generation: 2, creationGeneration: 2 });
  await assertCreationExecutionRoot(current.store, current.runtime, current.options, current.environment);
  assert.equal(current.jobs.get(current.chatId).draftRoot, current.options.cwd);
  assert.equal(current.environment.PRITHA_AGENT_AUTHORING_ROOT, current.options.cwd);
});

test('malformed job or launch generations cannot fall back to the legacy generation', async t => {
  for (const value of [null, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ['generation', 'creationGeneration']) {
      const f = await fixture(t, { [field]: value });
      await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment), /execution_code_root_unverified/, `${field}=${String(value)}`);
    }
  }
});

test('an unfinished revise action fences a launch even when its job still says running', async t => {
  const f = await fixture(t, { generation: 2, creationGeneration: 2 });
  const request = { requestId: 'revise-fixture', action: 'revise_proposal', expectedRevision: f.jobs.get(f.chatId).revision };
  f.store.db.prepare("INSERT INTO agent_creation_actions(chat_id,request_id,request_hash,status,result,request) VALUES(?,?,?,'started',NULL,?)")
    .run(f.chatId, request.requestId, 'fixture-hash', JSON.stringify(request));
  assert.equal(f.jobs.get(f.chatId).status, 'running');
  await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment), /execution_code_root_unverified/);
  f.store.db.prepare("UPDATE agent_creation_actions SET status='completed' WHERE chat_id=? AND request_id=?").run(f.chatId, request.requestId);
  await assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment);
});

test('the generation fence is checked again after asynchronous workspace verification', async t => {
  const f = await fixture(t);
  const verify = NeuralDeepExecutionWorkspaces.prototype.verify;
  NeuralDeepExecutionWorkspaces.prototype.verify = async function(record) {
    const result = await verify.call(this, record);
    f.jobs.update(f.chatId, job => ({ ...job, generation: 2 }));
    return result;
  };
  try {
    await assert.rejects(assertCreationExecutionRoot(f.store, f.runtime, f.options, f.environment), /execution_code_root_unverified/);
  } finally { NeuralDeepExecutionWorkspaces.prototype.verify = verify; }
});
