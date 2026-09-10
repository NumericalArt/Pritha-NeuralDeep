import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { resultReadinessFixture } from "./helpers/result-readiness-fixture.mjs";
import { apiProcessManifest } from "../scripts/agents-mother/scaffold/api-process.mjs";
import { readTaskDelivery, performTaskDeliveryAction } from "../scripts/agents-mother/task-delivery.mjs";
import { planOperationDecision, resolveOperationDecision } from "../scripts/agents-mother/operation-decisions.mjs";

const task = { chatId: "chat_operations", nativeThreadId: "native-operations", providerId: "neuraldeep_cli", stateIdentityHash: "storage-v2:operations" };
test("operation cards bind the canonical revision, cancellation and idempotent execution", async t => {
  const f = await resultReadinessFixture(t, {
    project(project) {
      mkdirSync(path.join(project, "operations"));
      writeFileSync(path.join(project, "operations/manifest.json"), JSON.stringify(apiProcessManifest({ agentId: "readiness-fixture", agentName: "Fixture", autostart: "disabled", primaryInterface: "web", envExampleVariables: "FIXTURE_PORT=3211" })));
    },
    contract: source => source.replace("agent_kind: one-shot-cli", "agent_kind: service"),
  });
  let calls = 0;
  const options = { ...f.options, runtime: {
    startPlan: async () => ({ enabled: true, confirmation: "start reviewed fixture" }), accessPlan: async () => ({ enabled: true }),
    start: async () => { calls++; return { ok: true }; }, serve: async () => { calls++; return { ok: true }; },
  } };
  const runId = path.basename(f.runRoot);
  await assert.rejects(planOperationDecision(task, runId, "start", options), /Bind/);
  const run = readTaskDelivery(runId, task, f.options);
  await performTaskDeliveryAction(task, { runId, requestId: "bind-operations", action: "bind", expectedRevision: run.revision }, f.options);
  const plan = await planOperationDecision(task, runId, "start", options);
  assert.equal(plan.enabled, true, JSON.stringify(f.read())); assert.equal(calls, 0);
  const request = { runId, requestId: "start-once", action: "start", planLock: plan.planLock, decision: "approve" };
  assert.equal((await resolveOperationDecision(task, { ...request, requestId: "cancel-first", decision: "cancel" }, options)).status, "cancelled");
  assert.equal(calls, 0);
  assert.equal((await resolveOperationDecision(task, request, options)).status, "completed");
  assert.equal((await resolveOperationDecision(task, request, options)).replayed, true); assert.equal(calls, 1);
  await assert.rejects(resolveOperationDecision(task, { ...request, decision: "cancel" }, options), /identifier/);
  await assert.rejects(planOperationDecision({ ...task, nativeThreadId: "foreign" }, runId, "start", options));
  const access = await planOperationDecision(task, runId, "tailscale-serve", options); assert.equal(access.enabled, true);
  // Simulate a host disappearing after its durable started receipt: neither a
  // lost-response retry nor a new request identifier may replay that operation.
  const receiptDirectory = path.join(f.options.stateRoot, "audit", "operation-decisions");
  const saved = readdirSync(receiptDirectory).filter(name => name.endsWith(".json"))
    .map(name => ({ file: path.join(receiptDirectory, name), data: JSON.parse(readFileSync(path.join(receiptDirectory, name), "utf8")) }))
    .filter(item => item.data.requestId === request.requestId);
  for (const item of saved) writeFileSync(item.file, JSON.stringify({ ...item.data, status: "started" }));
  assert.deepEqual((await planOperationDecision(task, runId, "start", options)).pendingRequest, request);
  assert.equal((await resolveOperationDecision(task, request, options)).status, "started");
  await assert.rejects(resolveOperationDecision(task, { ...request, requestId: "retry-new-id" }, options), /unconfirmed/);
  assert.equal(calls, 1);
  for (const item of saved) writeFileSync(item.file, JSON.stringify(item.data));
  writeFileSync(path.join(f.project, "changed.txt"), "changed revision");
  await assert.rejects(resolveOperationDecision(task, { ...request, requestId: "stale" }, options), /plan changed/i);
  assert.equal(calls, 1);
});
