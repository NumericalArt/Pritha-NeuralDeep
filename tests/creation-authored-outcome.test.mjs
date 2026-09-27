import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { AgentCreationStore } from '../scripts/neuraldeep/agent-creation-store.mjs';
import { creationDraftRoot, reconcileCreationArtifacts, approveCreationDocument, creationPrompt } from '../scripts/neuraldeep/agent-creation.mjs';
import { completeCreationBrief, completeCreationOutcome, creationOutcomeAuthoringContext, readCreationOutcome } from '../scripts/neuraldeep/creation-preparation.mjs';
import { verifyOutcomeApproval } from '../scripts/agents-mother/outcome-spec.mjs';
import { encodeProductApi } from '../scripts/agents-mother/outcome-verifier-presets.mjs';
import { actionItemsBrief as brief, actionItemsOutcome as outcome } from './fixtures/action-items-brief.mjs';
import { creationOutcomePrompt } from '../scripts/neuraldeep/creation-preparation.mjs';

test('the Outcome prompt explains model access through the Pritha binding (kimi-k2.6 invented NEURALDEEP_API_KEY, 2026-09-27)', () => {
  const prompt = creationOutcomePrompt({ preparation: {} });
  assert.match(prompt, /never holds, asks for or reads a NeuralDeep key/);
  assert.match(prompt, /PRITHA_LLM_BASE_URL, PRITHA_LLM_MODEL and PRITHA_LLM_TOKEN/);
  assert.match(prompt, /disabling the agent's binding in Pritha/);
});

function setup(t) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'creation-authored-outcome-')); t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const coordination = new NeuralDeepCoordinationStore({ databasePath: path.join(stateRoot, 'coord.sqlite') }); t.after(() => coordination.close());
  const store = new AgentCreationStore(coordination), options = { root: process.cwd(), stateRoot, coordination };
  const chatId = 'chat_authored', draftRoot = creationDraftRoot(stateRoot, 'test-instance', chatId), target = path.join(stateRoot, 'children', 'action-desk');
  mkdirSync(draftRoot, { recursive: true }); mkdirSync(target, { recursive: true });
  let job = store.create({ chatId, instanceId: 'test-instance', agentId: 'action-desk', draftRoot, target, releaseSha: 'a'.repeat(40), preparationPolicyVersion: 2, briefProtocolVersion: 1, outcomeProtocolVersion: 1 });
  job = reconcileCreationArtifacts(completeCreationBrief(job, '```pritha-brief-json\n' + JSON.stringify(brief) + '\n```', { ...options, turnId: 'turn_brief' }), options);
  job = approveCreationDocument(job, 'contract', approval(job, 'contract'), options);
  return { job: reconcileCreationArtifacts({ ...job, status: 'pending' }, options), options };
}
const approval = (job, kind) => ({ action: `approve_${kind}`, requestId: `approve_${kind}`, expectedRevision: job.revision, actor: 'codex-operator', authorizationBasis: 'Delegated operator test' });
const authored = value => `Готово: сценарии и проверки для Action Items Desk.\n\n\`\`\`pritha-outcome-json\n${JSON.stringify(value)}\n\`\`\``;

test('the model authors a product-specific Outcome that the host renders, validates and locks', t => {
  let { job, options } = setup(t);
  assert.equal(job.outcomeProtocolVersion, 1);
  assert.equal(job.outcome, null, 'no host template is published after contract approval');
  assert.match(job.contract.text, /Build iteration budget: 12\n/);
  assert.match(job.contract.text, /Build elapsed budget ms: 10800000\n/);
  assert.match(job.contract.text, /Repeated failure threshold: 6\n/);
  assert.match(creationPrompt(job), /pritha-outcome-json/);
  const context = creationOutcomeAuthoringContext(job, options);
  assert.equal(context.preset, 'llm-operation-v1', 'an LLM app selects the generic declared-API verifier');
  assert.equal(context.coreFunctions.length, brief.coreFunctions.length);
  assert.equal(context.coreFunctions[5].ref, 'core:6');

  job = reconcileCreationArtifacts(completeCreationOutcome(job, authored(outcome), { ...options, turnId: 'turn_outcome' }), options);
  assert.equal(job.status, 'awaiting_outcome_approval', JSON.stringify(job.blocker));
  const text = job.outcome.text;
  for (const item of outcome.acceptance) assert.ok(text.includes(item.passCriteria), item.statement);
  assert.match(text, /Анна готовит отчёт к пятнице/, 'example sessions carry concrete sample data');
  assert.match(text, /POST \/api\/analyses accepts JSON \{notes: <user text>\}/);
  assert.ok(text.includes(encodeProductApi(outcome.productApi)), 'the protected Trial is configured by the declared API');
  assert.doesNotMatch(text, /\/api\/sources|\/api\/digests|RSS/, 'no foreign product protocol leaks into the Outcome');
  assert.doesNotMatch(text, /Demonstrate .* through the web interface/, 'authored checks replace generic placeholders');
  job = approveCreationDocument(job, 'outcome', approval(job, 'outcome'), options);
  assert.equal(verifyOutcomeApproval(job.outcome.path, options).ok, true);
  assert.equal(job.phase, 'research');
});

test('an invalid authored Outcome gets one repair turn, then a visible blocker; nothing is published', t => {
  let { job, options } = setup(t);
  const { productApi, ...withoutApi } = outcome;
  assert.ok(readCreationOutcome(authored(withoutApi), 'llm-operation-v1').issues.some(issue => /productApi/.test(issue)));
  job = completeCreationOutcome(job, authored(withoutApi), { ...options, turnId: 'turn_one' });
  assert.equal(job.status, 'pending');
  assert.equal(job.blocker.code, 'creation_outcome_repair');
  assert.equal(job.outcome, null);
  assert.match(creationPrompt(job), /Correct only these errors/);
  job = completeCreationOutcome(job, authored({ ...outcome, acceptance: [] }), { ...options, turnId: 'turn_two' });
  assert.equal(job.status, 'blocked');
  assert.equal(job.blocker.code, 'creation_outcome_invalid');
  // A valid answer after an explicit Continue still publishes: no half-written document blocks it.
  job = reconcileCreationArtifacts(completeCreationOutcome({ ...job, status: 'pending' }, authored(outcome), { ...options, turnId: 'turn_three' }), options);
  assert.equal(job.status, 'awaiting_outcome_approval', JSON.stringify(job.blocker));
});

test('every place that creates a UI creation job selects the model-authored Outcome protocol', () => {
  const gateway = readFileSync(new URL('../interfaces/control-center/src/lib/codex-chat/gateway.ts', import.meta.url), 'utf8');
  const creates = gateway.match(/preparationPolicyVersion:2,briefProtocolVersion:1[^\n]*/g);
  assert.ok(creates.length >= 2);
  for (const call of creates) assert.match(call, /outcomeProtocolVersion:1/);
});
