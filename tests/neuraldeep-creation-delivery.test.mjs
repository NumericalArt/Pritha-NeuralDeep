import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createOutcomeSpec, approveOutcomeSpec } from "../scripts/agents-mother/outcome-spec.mjs";
import { FunctionBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { readDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { creationDeliveryRunId, readCreationDelivery, runCreationDelivery } from "../scripts/neuraldeep/creation-delivery.mjs";

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-creation-delivery-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), target = path.join(agentParent, "new-product");
  const contracts = path.join(stateRoot, "agents/contracts");
  for (const directory of [root, contracts, path.join(target, "scripts")]) mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(target, "AGENTS.md"), "# Synthetic child\n");
  writeFileSync(path.join(target, "scripts/smoke-test.mjs"), "import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';assert.equal(readFileSync('result.txt','utf8'),'working');\n");
  git(target, ["init"]); git(target, ["config", "user.name", "Pritha Test"]); git(target, ["config", "user.email", "tests@example.invalid"]);
  git(target, ["add", "."]); git(target, ["commit", "-m", "owned scaffold baseline"]);
  const contractPath = path.join(contracts, "contract.md");
  writeFileSync(contractPath, readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("type: agent-contract", "type: agent-contract\nagent_id: creation-fixture")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${target}`));
  const options = { root, stateRoot, agentParent, trialBackend: "local", reportDir: false,
    task: { chatId: "chat_creationfixture", nativeThreadId: "original-native-thread", providerId: "neuraldeep_cli", stateIdentityHash: "creation-instance-state" } };
  const specPath = createOutcomeSpec(contractPath, options).path;
  approveOutcomeSpec(specPath, { ...options, approvedBy: "user" });
  const job = { jobId: "creation_fixture", instanceId: "creation-instance", chatId: options.task.chatId,
    agentId: "creation-fixture", releaseSha: "a".repeat(40), target, scaffoldReady: true,
    scaffoldReceipt: { revision: git(target, ["rev-parse", "HEAD"]) }, approvals: { contract: {}, outcome: {} }, outcome: { path: specPath },
    budget: { maxTokens: 1000, tokensUsed: 100, maxActiveMs: 5_400_000, activeMs: 100, maxIterations: 6, repeatedFailureThreshold: 3, unknownAttempts: [] } };
  return { ...options, options, job, target };
}
const executor = callback => new FunctionBuildExecutor(async input => {
  await callback?.(input);
  writeFileSync(path.join(input.worktree, "result.txt"), "working");
  return { thread_id: "build-thread", turn_id: "build-turn", tokens_used: 25 };
});

test("creation delivery binds one native task, preserves remaining budget and adopts only verified commit", async t => {
  const f = fixture(t); let calls = 0, recordedRun;
  const result = await runCreationDelivery(f.job, { ...f.options, onRunId: id => recordedRun = id, buildExecutor: executor(() => calls++) });
  assert.equal(result.runId, creationDeliveryRunId(f.job)); assert.equal(recordedRun, result.runId);
  assert.equal(result.status, "awaiting_acceptance", JSON.stringify(result.blocker));
  assert.equal(result.adopted, true); assert.equal(result.acceptance, "not_accepted");
  assert.equal(readFileSync(path.join(f.target, "result.txt"), "utf8"), "working");
  assert.equal(git(f.target, ["rev-parse", "HEAD"]), result.head);
  assert.equal(result.taskDelivery.bindingStatus, "bound");
  assert.equal(result.usage.knownTotalTokens, 125); assert.equal(readDeliveryLedger(result.runRoot).budget.max_tokens, 900);
  const resumed = await runCreationDelivery({ ...f.job, budget: { ...f.job.budget, tokensUsed: 125 } }, { ...f.options, buildExecutor: executor(() => calls++) });
  assert.equal(calls, 1); assert.equal(resumed.runId, result.runId); assert.equal(resumed.usage.knownTotalTokens, 125);
});

test("new source changes are preserved while the verified candidate remains available", async t => {
  const f = fixture(t);
  const result = await runCreationDelivery(f.job, { ...f.options, buildExecutor: executor(() => writeFileSync(path.join(f.target, "operator-note.txt"), "keep")) });
  assert.equal(result.status, "blocked"); assert.equal(result.blocker.code, "creation_source_changed");
  assert.equal(readFileSync(path.join(f.target, "operator-note.txt"), "utf8"), "keep");
  assert.equal(existsSync(path.join(f.target, "result.txt")), false);
  assert.equal(readFileSync(path.join(result.runRoot, "worktree/result.txt"), "utf8"), "working");
});

test("pause after binding prevents model dispatch and continuation uses the same ledger", async t => {
  const f = fixture(t); let permitted = true, calls = 0;
  const paused = await runCreationDelivery(f.job, { ...f.options, onRunId: () => permitted = false, shouldContinue: () => permitted, buildExecutor: executor(() => calls++) });
  assert.equal(paused.status, "blocked"); assert.equal(calls, 0);
  assert.equal(paused.blocker.code, "creation_paused");
  permitted = true;
  const resumed = await runCreationDelivery(f.job, { ...f.options, shouldContinue: () => permitted, buildExecutor: executor(() => calls++) });
  assert.equal(resumed.adopted, true, JSON.stringify(resumed.blocker)); assert.equal(calls, 1);
  assert.equal(resumed.runId, paused.runId);
});

test("missing baseline, unknown preparation usage and another task fail before model execution", async t => {
  const f = fixture(t); let calls = 0;
  for (const job of [{ ...f.job, scaffoldReceipt: {} }, { ...f.job, budget: { ...f.job.budget, unknownAttempts: ["missing-receipt"] } }, { ...f.job, chatId: "chat_elsewhere" }]) {
    await assert.rejects(runCreationDelivery(job, { ...f.options, buildExecutor: executor(() => calls++) }));
  }
  assert.equal(calls, 0); assert.equal(readCreationDelivery(f.job, f.options), null);
});
