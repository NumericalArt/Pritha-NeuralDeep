import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, rmSync, writeFileSync, renameSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { AgentProviderBindings, managedAgentEnvironment, redactAgentRuntimeOutput } from '../scripts/neuraldeep/agent-provider-binding.mjs';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { readAgentCatalog } from '../scripts/agents-mother/identity.mjs';
import { handleAgentProviderRequest, flushAgentProviderAccounting } from '../scripts/neuraldeep/agent-provider-broker.mjs';

const provider = { configured: true, models: ['test-chat-model', 'second-model'] };
function fixture(t) {
  const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'pritha-provider-binding-')));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, 'mother'), stateRoot = path.join(tmp, 'state'), agentParent = path.join(tmp, 'children');
  for (const file of [root, path.join(stateRoot, 'agents', 'contracts'), agentParent]) mkdirSync(file, { recursive: true });
  const options = { root, stateRoot, agentParent };
  function agent(name) {
    const folder = path.join(agentParent, name); mkdirSync(folder); writeFileSync(path.join(folder,'AGENTS.md'), '# Child');
    mkdirSync(path.join(folder, 'operations')); writeFileSync(path.join(folder, 'operations/manifest.json'), JSON.stringify({ control_center_managed: true, control_center_runtime: { manager: 'detached-node-process' } }));
    writeFileSync(path.join(stateRoot, 'agents', 'contracts', `${name}.md`), `---\ntype: agent-contract\nagent_id: ${name}\nsubject:\n  kind: child-agent\n  id: ${name}\n---\n- Agent name: ${name}\n- Target folder: ${folder}\n`);
    return readAgentCatalog({ ...options, fresh: true }).agents.find(item => item.agentId === name).id;
  }
  const id = agent('first'), second = agent('second');
  const file = path.join(stateRoot, 'admission.sqlite');
  let coordination, bindings;
  function open() { coordination = new NeuralDeepCoordinationStore({ databasePath: file }); bindings = new AgentProviderBindings(coordination, options); return bindings; }
  open(); t.after(() => coordination.close());
  function restart() { coordination.close(); return open(); }
  return { ...options, tmp, id, second, file, get bindings() { return bindings; }, get coordination() { return coordination; }, restart,
    connect(target = id) { const current = bindings.view(target, provider); bindings.set(target, { mode: 'instance-neuraldeep', model: 'test-chat-model', expectedRevision: current.revision }, provider); return bindings.issueEnvironment(target, { provider, port: 43210 }); } };
}
const body = (patch = {}) => ({ model: 'test-chat-model', messages: [{ role: 'user', content: 'Summarize a public feed in Russian.' }], stream: false, max_tokens: 100, ...patch });
function request(id, env, data = body(), headers = {}, signal) {
  return new Request(`http://127.0.0.1:43210/api/agents/${id}/llm/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PRITHA_LLM_TOKEN}`, ...headers }, body: JSON.stringify(data), signal });
}
const completion = (usage = { prompt_tokens: 10, completion_tokens: 8 }) => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Русская сводка.' } }], usage });
function harness(f, overrides = {}) {
  const stats = { dispatched: 0, releases: [], usage: [], lease: [] };
  const options = { bindings: f.bindings, stateRoot: f.stateRoot,
    credentials: () => ({ origin: 'https://provider.invalid', key: 'HOST_PROVIDER_SECRET' }),
    acquire: async input => { stats.lease.push(input); return { release: async status => { stats.releases.push(status); } }; },
    fetcher: async (url, init) => { stats.dispatched++; assert.equal(url.href, 'https://provider.invalid/v1/chat/completions'); assert.equal(init.headers.Authorization, 'Bearer HOST_PROVIDER_SECRET'); return completion(); },
    recorder: record => { stats.usage.push(record); }, ...overrides };
  return { options, stats };
}

test('binding defaults disconnected; explicit model/readiness; capability only in process env, hash on disk', t => {
  const f = fixture(t);
  assert.equal(f.bindings.view(f.id, provider).state, 'disconnected');
  assert.throws(() => f.bindings.set(f.id, { mode: 'instance-neuraldeep', model: 'missing', expectedRevision: 0 }, provider), /model_unavailable/);
  f.bindings.set(f.id, { mode: 'instance-neuraldeep', model: 'test-chat-model', expectedRevision: 0 }, provider);
  assert.equal(f.bindings.view(f.id, provider).state, 'restart_required');
  assert.throws(() => f.bindings.issueEnvironment(f.id, { port: 43210, provider: { ...provider, configured: false } }), /provider_not_configured/);
  const env = f.bindings.issueEnvironment(f.id, { port: 43210, provider });
  assert.equal(f.bindings.view(f.id, provider).state, 'ready');
  assert.equal(Object.keys(env).length, 3);
  assert.equal(env.PRITHA_LLM_MODEL, 'test-chat-model');
  assert.equal(env.PRITHA_LLM_BASE_URL, `http://127.0.0.1:43210/api/agents/${f.id}/llm/v1`);
  assert.equal(JSON.stringify(f.bindings.view(f.id, provider)).includes(env.PRITHA_LLM_TOKEN), false);
  assert.equal(readFileSync(f.file).includes(Buffer.from(env.PRITHA_LLM_TOKEN)), false);
  f.restart(); assert.equal(f.bindings.authorize(f.id, env.PRITHA_LLM_TOKEN).model, 'test-chat-model');
});

test('binding tables preserve admission schema and drained rows across reopen', t => {
  const f = fixture(t), env = f.connect();
  assert.equal(f.coordination.db.prepare('PRAGMA user_version').get().user_version, 4);
  f.coordination.enqueue({ attemptId: 'completed-child', surface: 'child_agent', workloadId: f.id, coordinationKeyHash: 'd'.repeat(24), queuedAt: new Date().toISOString() });
  const lease = f.coordination.claim('completed-child', 1); f.coordination.finish(lease.attemptId, lease.ownerToken, 'completed');
  // Additive binding tables do not alter attempts or the version compatibility gate.
  f.restart();
  assert.equal(f.coordination.get('completed-child').status, 'completed');
  assert.equal(f.coordination.get('completed-child').surface, 'child_agent');
  assert.equal(f.coordination.db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(f.bindings.authorize(f.id, env.PRITHA_LLM_TOKEN).model, 'test-chat-model');
});

test('launchd and external runtimes cannot receive a misleading process-only binding', t => {
  const f = fixture(t);
  writeFileSync(path.join(f.agentParent, 'first/operations/manifest.json'), JSON.stringify({ control_center_managed: true, control_center_runtime: { manager: 'launchd' } }));
  assert.throws(() => f.bindings.set(f.id, { mode: 'instance-neuraldeep', model: 'test-chat-model', expectedRevision: 0 }, provider), /runtime_unsupported/);
});

test('none immediately denies and restoration preserves running capability; model changes require restart', t => {
  const f = fixture(t), env = f.connect();
  const select = (mode, model) => f.bindings.set(f.id, { mode, model, expectedRevision: f.bindings.view(f.id, provider).revision }, provider);
  select('none'); assert.throws(() => f.bindings.authorize(f.id, env.PRITHA_LLM_TOKEN), /binding_disabled/);
  select('instance-neuraldeep', 'test-chat-model'); assert.equal(f.bindings.authorize(f.id, env.PRITHA_LLM_TOKEN).model, 'test-chat-model');
  select('instance-neuraldeep', 'second-model'); assert.equal(f.bindings.view(f.id, provider).restartRequired, true);
  assert.throws(() => f.bindings.authorize(f.id, env.PRITHA_LLM_TOKEN), /unauthorized/);
  const next = f.bindings.issueEnvironment(f.id, { port: 43210, provider });
  assert.equal(next.PRITHA_LLM_MODEL, 'second-model'); assert.notEqual(next.PRITHA_LLM_TOKEN, env.PRITHA_LLM_TOKEN);
  assert.throws(() => f.bindings.set(f.id, { mode: 'none', expectedRevision: 0 }, provider), /revision_stale/);
});

test('foreign IDs, another agent capability, and symlink target substitution are denied', t => {
  const f = fixture(t), g = fixture(t), env = f.connect();
  assert.notEqual(f.id, g.id);
  assert.throws(() => f.bindings.view(g.id), /not_owned/);
  assert.throws(() => f.bindings.view('first'), /not_owned/); // No basename/alias authorization.
  f.connect(f.second);
  assert.throws(() => f.bindings.authorize(f.second, env.PRITHA_LLM_TOKEN), /unauthorized/);
  const target = path.join(f.agentParent, 'first'); renameSync(target, `${target}-old`); symlinkSync(path.join(g.agentParent, 'first'), target);
  assert.throws(() => f.bindings.authorize(f.id, env.PRITHA_LLM_TOKEN), /not_owned/);
});

test('managed start strips ambient credentials and host config even from declared allowlist', () => {
  const parent = { PATH: '/bin', HOME: '/tmp/home', LANG: 'ru_RU', PRITHA_NEURALDEEP_API_KEY: 'private-key', NEURALDEEP_API_KEY: 'private-key', OPENAI_API_KEY: 'foreign-key', AWS_SECRET_ACCESS_KEY: 'aws-key', CUSTOM_TOKEN: 'token', PRITHA_LLM_TOKEN: 'foreign-child', CODEX_HOME: '/secret/state', NODE_OPTIONS: '--require bad.mjs', CUSTOM_PORT: '1234' };
  const env = managedAgentEnvironment(parent, parent, { PRITHA_LLM_BASE_URL: 'http://127.0.0.1:43210/local', PRITHA_LLM_MODEL: 'test', PRITHA_LLM_TOKEN: 'scoped-child' });
  assert.equal(env.PATH, '/bin'); assert.equal(env.CUSTOM_PORT, '1234');
  for (const key of ['PRITHA_NEURALDEEP_API_KEY','NEURALDEEP_API_KEY','OPENAI_API_KEY','AWS_SECRET_ACCESS_KEY','CUSTOM_TOKEN','CODEX_HOME','NODE_OPTIONS']) assert.equal(env[key], undefined);
  assert.equal(env.PRITHA_LLM_TOKEN, 'scoped-child'); assert.equal(redactAgentRuntimeOutput('token: scoped-child', env), 'token: [redacted]');
  const child = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(process.env))'], { env, encoding: 'utf8' });
  assert.equal(child.status, 0); const observed = JSON.parse(child.stdout);
  assert.equal(observed.PRITHA_LLM_TOKEN, 'scoped-child');
  for (const secret of ['private-key','foreign-key','aws-key','foreign-child','--require bad.mjs']) assert.equal(child.stdout.includes(secret), false);
});

test('managed environment preserves the child own private credential loader', t => {
  const f = fixture(t), childRoot = path.join(f.agentParent, 'first');
  const privateFile = path.join(childRoot, '.env.local');
  writeFileSync(privateFile, 'CUSTOM_API_KEY=child-owned-fixture\n');
  const runner = `const fs=require('node:fs');const own=fs.readFileSync('.env.local','utf8').trim().split('=');process.env[own[0]]=own[1];console.log(JSON.stringify({own:process.env.CUSTOM_API_KEY==='child-owned-fixture',hostAbsent:!process.env.PRITHA_NEURALDEEP_API_KEY}));`;
  const child = spawnSync(process.execPath, ['-e', runner], { cwd: childRoot,
    env: managedAgentEnvironment({ ...process.env, PRITHA_NEURALDEEP_API_KEY: 'host-only-fixture' }, { PATH: process.env.PATH }), encoding: 'utf8' });
  assert.equal(child.status, 0); assert.deepEqual(JSON.parse(child.stdout), { own: true, hostAbsent: true });
  assert.equal(readFileSync(privateFile, 'utf8'), 'CUSTOM_API_KEY=child-owned-fixture\n');
});

test('broker calls fixed upstream with host credential and bounded text; duplicate request never calls twice', async t => {
  const f = fixture(t), env = f.connect(), { options, stats } = harness(f);
  const response = await handleAgentProviderRequest(request(f.id, env, body(), { 'x-pritha-request-id': 'request-one' }), f.id, options);
  assert.equal(response.status, 200); assert.equal((await response.json()).choices[0].message.content, 'Русская сводка.');
  assert.equal(stats.dispatched, 1); assert.equal(stats.lease[0].surface, 'child_agent'); assert.deepEqual(stats.releases, ['completed']);
  assert.equal(stats.usage.length, 1); assert.equal(stats.usage[0].source, 'child-agent'); assert.equal(stats.usage[0].usageKnown, true);
  flushAgentProviderAccounting(f.bindings, f.stateRoot, record => stats.usage.push(record)); assert.equal(stats.usage.length, 1);
  const duplicate = await handleAgentProviderRequest(request(f.id, env, body(), { 'x-pritha-request-id': 'request-one' }), f.id, options);
  assert.equal(duplicate.status, 409); assert.equal(stats.dispatched, 1);
});

test('broker blocks browser requests, wrong model, tools, oversize payload and token caps before dispatch', async t => {
  const f = fixture(t), env = f.connect(), { options, stats } = harness(f);
  for (const [data, headers] of [[body(), { origin: 'http://127.0.0.1:43210' }], [body({ model: 'other' }), {}], [body({ tools: [] }), {}], [body({ stream: true }), {}], [body({ max_tokens: 4097 }), {}], [body({ messages: [{ role: 'user', content: 'x'.repeat(270000) }] }), {}]]) {
    const response = await handleAgentProviderRequest(request(f.id, env, data, headers), f.id, options);
    assert.ok([400,403,413].includes(response.status));
  }
  assert.equal(stats.dispatched, 0); assert.equal(stats.lease.length, 0);
});

test('disconnect/restore works through real broker without exposing provider credential', async t => {
  const f = fixture(t), env = f.connect(), { options, stats } = harness(f);
  f.bindings.set(f.id, { mode: 'none', expectedRevision: f.bindings.view(f.id).revision }, provider);
  const denied = await handleAgentProviderRequest(request(f.id, env), f.id, options);
  assert.equal(denied.status, 403); assert.equal(stats.dispatched, 0);
  f.bindings.set(f.id, { mode: 'instance-neuraldeep', model: 'test-chat-model', expectedRevision: f.bindings.view(f.id).revision }, provider);
  const restored = await handleAgentProviderRequest(request(f.id, env), f.id, options);
  assert.equal(restored.status, 200); assert.equal((await restored.text()).includes('HOST_PROVIDER_SECRET'), false);
});

test('lost receipt and unknown usage stay blocked across store restart and binding toggles', async t => {
  const f = fixture(t), env = f.connect();
  const { options, stats } = harness(f, { fetcher: async () => { throw new Error('network lost HOST_PROVIDER_SECRET'); } });
  const response = await handleAgentProviderRequest(request(f.id, env), f.id, options);
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('HOST_PROVIDER_SECRET'), false);
  assert.equal(stats.usage[0].usageKnown, false);
  f.restart();
  assert.equal(f.bindings.view(f.id, provider).state, 'reconciliation_required');
  f.bindings.set(f.id, { mode: 'none', expectedRevision: f.bindings.view(f.id).revision }, provider);
  f.bindings.set(f.id, { mode: 'instance-neuraldeep', model: 'test-chat-model', expectedRevision: f.bindings.view(f.id).revision }, provider);
  assert.equal(f.bindings.view(f.id, provider).state, 'reconciliation_required');
  assert.throws(() => f.bindings.issueEnvironment(f.id, { port: 43210, provider }), /usage_unconfirmed/);
  const next = harness(f); assert.equal((await handleAgentProviderRequest(request(f.id, env), f.id, next.options)).status, 409); assert.equal(next.stats.dispatched, 0);
});

test('dispatched intent without receipt remains unknown; reserved intent cannot be replayed after restart', t => {
  const f = fixture(t), env = f.connect();
  f.bindings.reserve(f.id, env.PRITHA_LLM_TOKEN, 'crash-before-receipt', 'a'.repeat(64));
  f.bindings.dispatched('crash-before-receipt', f.id, env.PRITHA_LLM_TOKEN);
  f.restart(); assert.equal(f.bindings.view(f.id, provider).blocker.code, 'provider_usage_unconfirmed');
  assert.throws(() => f.bindings.reserve(f.id, env.PRITHA_LLM_TOKEN, 'retry', 'b'.repeat(64)), /usage_unconfirmed/);
});

test('malformed response with known usage is accounted, not accepted as a digest', async t => {
  const f = fixture(t), env = f.connect();
  const { options, stats } = harness(f, { fetcher: async () => Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [{}] } }], usage: { prompt_tokens: 8, completion_tokens: 3 } }) });
  assert.equal((await handleAgentProviderRequest(request(f.id, env), f.id, options)).status, 502);
  assert.equal(stats.usage[0].usageKnown, true); assert.equal(f.bindings.view(f.id, provider).state, 'ready');
});

test('abort before dispatch makes no model call; revocation while admitted prevents dispatch', async t => {
  const f = fixture(t), env = f.connect(), aborted = new AbortController(); aborted.abort();
  const a = harness(f); await handleAgentProviderRequest(request(f.id, env, body(), {}, aborted.signal), f.id, a.options); assert.equal(a.stats.dispatched, 0);
  const b = harness(f, { acquire: async () => { f.bindings.set(f.id, { mode: 'none', expectedRevision: f.bindings.view(f.id).revision }, provider); return { release: async () => {} }; } });
  assert.equal((await handleAgentProviderRequest(request(f.id, env), f.id, b.options)).status, 403);
  assert.equal(b.stats.dispatched, 0); assert.equal(f.bindings.view(f.id, provider).blocker, null);
});

test('bounded timeout aborts in-flight fetch and preserves unknown consumption', async t => {
  const f = fixture(t), env = f.connect();
  const { options } = harness(f, { timeoutMs: 20, fetcher: (_url, { signal }) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) });
  // AbortSignal.timeout is unref'ed; keep this fixture alive for its bounded wait.
  const keeper = setTimeout(() => {}, 100);
  try { assert.equal((await handleAgentProviderRequest(request(f.id, env), f.id, options)).status, 504); }
  finally { clearTimeout(keeper); }
  assert.equal(f.bindings.view(f.id, provider).state, 'reconciliation_required');
});

test('revocation during provider fetch aborts the request and never emits a completed digest', async t => {
  const f = fixture(t), env = f.connect();
  const { options } = harness(f, { fetcher: async () => {
    f.bindings.set(f.id, { mode: 'none', expectedRevision: f.bindings.view(f.id).revision }, provider);
    return completion();
  } });
  const response = await handleAgentProviderRequest(request(f.id, env), f.id, options);
  assert.equal(response.status, 403); assert.equal((await response.text()).includes('Русская сводка'), false);
  assert.equal(f.bindings.pendingAccounting().length, 0);
  f.bindings.set(f.id, { mode: 'instance-neuraldeep', model: 'test-chat-model', expectedRevision: f.bindings.view(f.id).revision }, provider);
  assert.equal(f.bindings.view(f.id, provider).state, 'ready'); // The late response included a valid usage receipt.
});
