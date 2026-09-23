import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createOutcomeSpec, approveOutcomeSpec } from "../scripts/agents-mother/outcome-spec.mjs";
import { FunctionBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { readDeliveryLedger, updateDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { creationDeliveryRunId, readCreationDelivery, runCreationDelivery, recoverCreationDelivery } from "../scripts/neuraldeep/creation-delivery.mjs";
import { trialModelUse } from '../scripts/agents-mother/trial-model-use.mjs';

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

async function interruptedVerifiedFixture(t) {
  const f=fixture(t);let calls=0;
  const result=await runCreationDelivery(f.job,{...f.options,buildExecutor:executor(()=>{calls++;writeFileSync(path.join(f.target,'operator-note.txt'),'keep');})});
  rmSync(path.join(f.target,'operator-note.txt'));
  updateDeliveryLedger(result.runRoot,state=>({...state,budget:{...state.budget,unaccounted_attempts:[{executor_result:'executor/attempt-nd_dead.json',reason:'usage_unavailable',
    process_protocol:1,process_exited:true,process_tree_exited:true,adapter_closed:true,reserved_tokens:500}]}}),{eventType:'test_interrupted_receipt'});
  f.job.deliveryRunId=result.runId;f.job.budget.unknownAttempts=[result.runId];
  return {...f,result,calls:()=>calls};
}

test('verified interrupted candidate can be inspected and adopted with no new inference or Trial execution',async t=>{
  const f=await interruptedVerifiedFixture(t),before=readDeliveryLedger(f.result.runRoot);
  const view=readCreationDelivery(f.job,f.options);
  assert.equal(view.recovery.evidenceFresh,true,JSON.stringify(view.recovery));assert.equal(view.recovery.adoptVerified,true);
  const inspected=await recoverCreationDelivery(f.job,{...f.options,action:'verify_saved',requestId:'inspect-saved-1'});
  assert.equal(inspected.adopted,false);assert.equal(readDeliveryLedger(f.result.runRoot).version,before.version);
  const adopted=await recoverCreationDelivery(f.job,{...f.options,action:'adopt_verified',requestId:'adopt-saved-1'});
  assert.equal(adopted.adopted,true);assert.equal(adopted.usage.coverage,'unknown');assert.equal(adopted.acceptance,'not_accepted');
  assert.equal(f.calls(),1);assert.equal(readFileSync(path.join(f.target,'result.txt'),'utf8'),'working');
  assert.equal(readDeliveryLedger(f.result.runRoot).version,before.version,'adoption reused fresh evidence without executing commands');
  const replay=await recoverCreationDelivery(f.job,{...f.options,action:'adopt_verified',requestId:'adopt-saved-1'});
  assert.equal(replay.head,adopted.head);assert.equal(replay.usage.knownTotalTokens,125);assert.equal(f.job.budget.unknownAttempts.length,1);
});

test('recovery refuses live descendants and modified candidates without touching the target',async t=>{
  const f=await interruptedVerifiedFixture(t);
  updateDeliveryLedger(f.result.runRoot,s=>({...s,budget:{...s.budget,unaccounted_attempts:s.budget.unaccounted_attempts.map(a=>({...a,adapter_closed:false}))}}),{eventType:'test_live_adapter'});
  await assert.rejects(recoverCreationDelivery(f.job,{...f.options,action:'adopt_verified',requestId:'adopt-refused-1'}),{code:'creation_execution_unconfirmed'});
  updateDeliveryLedger(f.result.runRoot,s=>({...s,budget:{...s.budget,unaccounted_attempts:s.budget.unaccounted_attempts.map(a=>({...a,adapter_closed:true}))}}),{eventType:'test_stopped_adapter'});
  writeFileSync(path.join(f.result.runRoot,'worktree/result.txt'),'changed after verification');
  await assert.rejects(recoverCreationDelivery(f.job,{...f.options,action:'adopt_verified',requestId:'adopt-refused-2'}));
  assert.equal(existsSync(path.join(f.target,'result.txt')),false);assert.equal(f.calls(),1);
});

test('a command called local is not proof of zero inference; only enforced network isolation qualifies',()=>{
  const plan={trials:[{kind:'automated',isolation:'none',argv:['node','may-call-provider.mjs']}]};
  assert.equal(trialModelUse(plan,'local').kind,'unknown');
  plan.trials[0].isolation='sandbox';assert.equal(trialModelUse(plan,'local').kind,'unknown');
  assert.equal(trialModelUse(plan,'codex-cli').kind,'none');
  plan.execution_policy={trial_model_usage:'metered'};assert.equal(trialModelUse(plan,'codex-cli').kind,'metered');
});

test('a different task or changed approved specification cannot adopt a preserved candidate',async t=>{
  const f=await interruptedVerifiedFixture(t);
  await assert.rejects(recoverCreationDelivery(f.job,{...f.options,task:{...f.options.task,nativeThreadId:'another-session'},action:'adopt_verified',requestId:'wrong-task'}),{code:'creation_delivery_identity_changed'});
  writeFileSync(f.job.outcome.path,readFileSync(f.job.outcome.path,'utf8')+'\nChanged outcome.\n');
  await assert.rejects(recoverCreationDelivery(f.job,{...f.options,action:'adopt_verified',requestId:'changed-spec'}),{code:'delivery_approval_stale'});
  assert.equal(existsSync(path.join(f.target,'result.txt')),false);
});
