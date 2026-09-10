import * as maintenance from '../scripts/neuraldeep/release-maintenance.mjs';
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import * as identity from "../scripts/neuraldeep/runtime-identity.mjs";
import * as coordination from "../scripts/neuraldeep/coordination-store.mjs";
import * as controller from "../scripts/agents-mother/task-delivery.mjs";
import { resultReadinessFixture } from "./helpers/result-readiness-fixture.mjs";
import { readDeliveryLedger, updateDeliveryLedger, budgetBlocker, transitionDelivery } from "../scripts/agents-mother/delivery-ledger.mjs";

const require = createRequire(import.meta.url);
function load(name, dependencies = {}) {
  const source = readFileSync(`interfaces/control-center/src/lib/codex-chat/${name}.ts`, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(id => id.startsWith("node:") ? require(id) : (id.endsWith('/release-maintenance.mjs') ? maintenance : dependencies[id]) || {}, module, module.exports);
  return module.exports;
}
async function fixture(t) {
  const f = await resultReadinessFixture(t);
  const binding = { chatId: "chat_fixture", nativeThreadId: "nd-session", providerId: "neuraldeep_cli",
    stateIdentityHash: identity.neuralDeepRuntimeIdentity(f.stateRoot).stateIdentityHash,
    archived: false, origin: "chat", continuationEnabled: true, messageReceipts: {}, voiceTopicId: null };
  const { CodexChatGateway } = load("gateway", {
    "../../../../../scripts/neuraldeep/runtime-identity.mjs": identity,
    "../../../../../scripts/neuraldeep/coordination-store.mjs": coordination,
    "../../../../../scripts/agents-mother/task-delivery.mjs": controller,
    "./budget-intent": load("budget-intent"),
  });
  const gateway = Object.create(CodexChatGateway.prototype);
  Object.assign(gateway, { root: f.root, recoveryComplete: true, activeTurns: new Map(),
    store: { stateRoot: f.stateRoot, get: async () => binding, all: async () => [binding],
      receipt: async (_id, requestId) => binding.deliveryBudgetRequests?.[requestId] ? { kind: "budget", value: binding.deliveryBudgetRequests[requestId] } : binding.messageReceipts[requestId] ? { kind: "message", value: binding.messageReceipts[requestId] } : null,
      patch: async (_id, patch) => Object.assign(binding, patch), mutate: async (_id, update) => Object.assign(binding, update(structuredClone(binding))) },
    runtime: new Proxy({}, { get() { assert.fail("Host actions must not call inference, native Goal RPC or runtime probes"); } }),
  });
  const previous = process.env.PRITHA_AGENT_PARENT; process.env.PRITHA_AGENT_PARENT = f.agentParent;
  t.after(() => { if (previous === undefined) delete process.env.PRITHA_AGENT_PARENT; else process.env.PRITHA_AGENT_PARENT = previous; });
  const request = action => ({ runId: f.runId, requestId: `test-${action}`, expectedRevision: controller.readTaskDelivery(f.runId, binding, f.options).revision, action });
  await gateway.deliveryAction(binding.chatId, request("bind"));
  return { ...f, binding, gateway, request };
}

test("ND host budget adds and sets the same run once, keeping measured usage and approved verification", async t => {
  const f = await fixture(t);
  transitionDelivery(f.runRoot, "correcting", { phase: "synthetic-build", nextAction: "build_candidate" });
  updateDeliveryLedger(f.runRoot, state => ({ ...state, budget: { ...state.budget, max_tokens: 100, tokens_used: 101,
    accounted_turns: [{ key: "neuraldeep:fixture-run", attempt_id: "fixture-run", launcher_run_id: "fixture-run", thread_id: "nd-build-session", turn_id: null, tokens_used: 101 }] } }));
  transitionDelivery(f.runRoot, "blocked", { blockers: [budgetBlocker(readDeliveryLedger(f.runRoot))] });
  const input = { clientMessageId: "budget-fixture", text: "Добавь 200 токенов к бюджету сборки" };
  const result = await f.gateway.applyDeliveryBudgetIntent(f.binding.chatId, input);
  assert.equal(result.run.budget.maxTokens, 300); assert.equal(result.run.budget.tokensUsed, 101);
  const original = readDeliveryLedger(f.runRoot);
  assert.equal((await f.gateway.applyDeliveryBudgetIntent(f.binding.chatId, input)).replayed, true);
  assert.deepEqual(readDeliveryLedger(f.runRoot), original);
  await assert.rejects(f.gateway.applyDeliveryBudgetIntent(f.binding.chatId, { ...input, text: input.text.replace("200", "300") }), { code: "idempotency_conflict" });
  await assert.rejects(f.gateway.startTurn(f.binding.chatId, { clientMessageId: input.clientMessageId, input: [{ type: "text", text: "Continue" }] }), { code: "idempotency_conflict" });
  const total = await f.gateway.applyDeliveryBudgetIntent(f.binding.chatId, { clientMessageId: "budget-total", text: "Установи бюджет сборки до 250 токенов и продолжай" });
  assert.equal(total.run.budget.maxTokens, 250); assert.equal(total.run.budget.tokensUsed, 101);
  assert.equal(total.run.acceptance, "not_accepted"); assert.equal(total.run.status, "awaiting_acceptance");
  assert.equal(f.binding.nativeThreadId, "nd-session");
});

test("ND host controller rejects foreign homes, providers, active sessions, archive and Voice ownership", async t => {
  const f = await fixture(t), request = f.request("verify");
  for (const [field, value, code] of [["stateIdentityHash", "foreign", "delivery_task_unverified"], ["providerId", "desktop_bundled", "delivery_task_unverified"], ["archived", true, "chat_archived"]]) {
    const before = f.binding[field]; f.binding[field] = value;
    await assert.rejects(f.gateway.deliveryAction(f.binding.chatId, request), { code }); f.binding[field] = before;
  }
  const store = new coordination.NeuralDeepCoordinationStore(coordination.neuralDeepCoordinationPaths(f.stateRoot, f.root));
  t.after(() => store.close());
  const scope = identity.neuralDeepSessionKey(f.stateRoot, f.binding.nativeThreadId);
  assert.equal(store.acquireSessionControl(scope, "neighbor-host"), true);
  await assert.rejects(f.gateway.deliveryAction(f.binding.chatId, request), { code: "turn_active" });
  assert.equal(store.releaseSessionControl(scope, "stale-host"), false);
  store.releaseSessionControl(scope, "neighbor-host");
  f.binding.origin = "voice"; f.binding.continuationEnabled = false;
  await assert.rejects(f.gateway.deliveryAction(f.binding.chatId, request), { code: "continuation_confirmation_required" });
});

test("ND direct budget parser rejects ambiguous task Goal and quoted instructions", () => {
  const { parseBudgetIntent } = load("budget-intent");
  assert.equal(parseBudgetIntent("Добавь 100 токенов к бюджету задачи").kind, "clarification");
  assert.equal(parseBudgetIntent("«Добавь 100 токенов к бюджету сборки»").kind, "none");
  assert.deepEqual(parseBudgetIntent("Добавь 10 000 токенов к бюджету сборки run-a и продолжай"), { kind: "delivery_budget", mode: "add", tokens: 10000, resume: true, runId: "run-a" });
});
