import test from 'node:test';
import assert from 'node:assert/strict';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { AgentCreationStore } from '../scripts/neuraldeep/agent-creation-store.mjs';
import { assertPreparationPolicy, creationPreparationPolicy, preparationLimit } from '../scripts/neuraldeep/creation-preparation-policy.mjs';

const input = { chatId: 'chat-limits', instanceId: 'fixture', agentId: 'limits-app', releaseSha: 'a'.repeat(40), target: '/tmp/limits-agent', draftRoot: '/tmp/limits-draft', preparationPolicyVersion: 2 };

test('new creation jobs pin doubled limits while base jobs keep their original values', t => {
  const coordination = new NeuralDeepCoordinationStore(); t.after(() => coordination.close());
  const job = new AgentCreationStore(coordination).create(input);
  assert.equal(job.budget.maxTokens, 2_000_000);
  assert.equal(job.budget.maxActiveMs, 180 * 60 * 1000);
  assert.equal(job.budget.maxIterations, 12);
  assert.equal(job.budget.repeatedFailureThreshold, 6);
  assert.deepEqual({ ...job.preparationPolicy }, { version: 2, limitsProfile: 'v2-double', maxRequests: 24, freshBytes: 131072, rotationBytes: 196608, hardBytes: 262144,
    outputTokens: 16384, maxRotationsPerPhase: 2, localReadsWithoutProgress: 4, sourceAttemptsPerTopic: 4, providerOutageContinuations: 2,
    briefTokens: 200_000, researchTokens: 400_000, totalTokens: 600_000, deliveryTokens: 1_400_000 });
  assert.doesNotThrow(() => assertPreparationPolicy(job));
  assert.equal(preparationLimit(job, 'sourceAttemptsPerTopic'), 4);

  // A job saved before profiles existed has no limitsProfile key and must still verify.
  const legacyPolicy = creationPreparationPolicy(1_000_000, null, 'v2-base');
  assert.equal('limitsProfile' in legacyPolicy, false);
  const legacy = { preparationPolicyVersion: 2, preparationPolicy: legacyPolicy, budget: { maxTokens: 1_000_000 } };
  assert.doesNotThrow(() => assertPreparationPolicy(legacy));
  assert.deepEqual([legacyPolicy.maxRequests, legacyPolicy.freshBytes, legacyPolicy.outputTokens], [12, 65536, 8192]);
  assert.deepEqual(['localReadsWithoutProgress', 'sourceAttemptsPerTopic', 'providerOutageContinuations'].map(key => preparationLimit(legacy, key)), [2, 2, 1]);

  // An operator budget extension keeps the policy derived from the original budget.
  assert.doesNotThrow(() => assertPreparationPolicy({ ...job, budget: { ...job.budget, baseMaxTokens: 2_000_000, maxTokens: 3_000_000 } }));
  assert.throws(() => assertPreparationPolicy({ ...job, budget: { ...job.budget, maxTokens: 3_000_000 } }), { code: 'provider_budget_policy_changed' });
});
