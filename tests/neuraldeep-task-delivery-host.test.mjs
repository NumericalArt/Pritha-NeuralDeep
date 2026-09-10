import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireFileLock } from "../scripts/lib/atomic-file.mjs";
import { budgetBlocker, createDeliveryLedger, grantDeliveryBudget, readDeliveryLedger, targetKey, transitionDelivery, updateDeliveryLedger } from "../scripts/agents-mother/delivery-ledger.mjs";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec, verifyCompiledTrialPlan } from "../scripts/agents-mother/outcome-spec.mjs";
import { listTaskDeliveries, performTaskDeliveryAction, readTaskDelivery } from "../scripts/agents-mother/task-delivery.mjs";
import { resumeDelivery } from "../scripts/agents-mother/delivery-loop.mjs";

const task = { chatId: "chat_fixture", nativeThreadId: "native-fixture", providerId: "neuraldeep_cli", stateIdentityHash: "storage-v2:fixture" };
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function fixture(t, runId = "controlled-run", isolation = "none", createdAt) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-task-delivery-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), project = path.join(agentParent, "fixture-agent");
  const options = { root, stateRoot, agentParent }, contracts = path.join(stateRoot, "agents/contracts");
  for (const dir of [root, contracts, path.join(project, "scripts")]) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(project, "AGENTS.md"), "# Synthetic fixture\n");
  writeFileSync(path.join(project, "scripts/smoke-test.mjs"), "process.stdout.write('fixture passed');\n");
  git(project, ["init"]); git(project, ["config", "user.email", "tests@pritha.local"]); git(project, ["config", "user.name", "Pritha Tests"]);
  git(project, ["add", "."]); git(project, ["commit", "-m", "synthetic fixture"]);
  const contractPath = path.join(contracts, "contract.md");
  writeFileSync(contractPath, readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("type: agent-contract", "type: agent-contract\nagent_id: stable-fixture")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${project}`)
    .replace(/^- Build executor:.*$/m, "- Build executor: manual"));
  const specPath = createOutcomeSpec(contractPath, options).path;
  if (isolation === "sandbox") writeFileSync(specPath, readFileSync(specPath, "utf8").replace("- Isolation: none", "- Isolation: sandbox"));
  approveOutcomeSpec(specPath, { ...options, approvedBy: "user" });
  const { plan, runRoot } = compileOutcomeSpec(specPath, { ...options, runId });
  createDeliveryLedger(runRoot, { runId, agentSlug: plan.agent_slug, targetKey: targetKey(project), sourceProject: project, createdAt, budget: { maxTokens: 100 },
    spec: { id: plan.spec_id, semanticLock: plan.semantic_lock, documentLock: plan.document_lock, contractFingerprint: plan.contract_fingerprint, approvalId: plan.approval_id } });
  updateDeliveryLedger(runRoot, state => ({ ...state, budget: { ...state.budget, tokens_used: 101, accounted_turns: [{ key: "synthetic-thread:synthetic-turn", thread_id: "synthetic-thread", turn_id: "synthetic-turn", tokens_used: 101 }] } }));
  transitionDelivery(runRoot, "blocked", { blockers: [budgetBlocker(readDeliveryLedger(runRoot))] });
  const read = (actor = task) => readTaskDelivery(runId, actor, options);
  const action = (kind, actor = task, extra = {}) => ({ requestId: `fixture-${kind}-${Date.now()}`, runId, expectedRevision: read(actor).revision, action: kind, ...extra });
  const bind = async () => performTaskDeliveryAction(task, action("bind"), options);
  return { ...options, options, project, plan, runRoot, runId, contractPath, specPath, read, action, bind };
}

test("exact linking, budget-limited verification and handoff preparation preserve separate acceptance and usage", async t => {
  const f = fixture(t);
  const before = readDeliveryLedger(f.runRoot);
  assert.equal(f.read().bindingStatus, "unbound");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false, "GET never starts a verifier");
  const linked = await f.bind();
  assert.equal(linked.run.bindingStatus, "bound");
  assert.equal(listTaskDeliveries(task, f.options).length, 1);
  const input = f.action("verify");
  const result = await performTaskDeliveryAction(task, input, f.options);
  assert.equal(result.run.status, "awaiting_acceptance");
  assert.equal(result.run.acceptance, "not_accepted");
  const state = readDeliveryLedger(f.runRoot);
  assert.equal(state.iteration, 0, "no build turn was started");
  assert.deepEqual(state.budget, before.budget, "budget, usage and accounting scope remain unchanged");
  assert.equal((await performTaskDeliveryAction(task, input, f.options)).replayed, true);
  assert.equal(readDeliveryLedger(f.runRoot).version, state.version, "lost-response retry never repeats Trials");
  const handoff = f.action("prepare_handoff");
  await performTaskDeliveryAction(task, handoff, f.options);
  const file = path.join(f.runRoot, "handoff-preparation.json"), original = readFileSync(file, "utf8");
  assert.equal(JSON.parse(original).acceptance, "not_accepted");
  assert.equal(JSON.parse(original).disposition, "prepared_for_review");
  await performTaskDeliveryAction(task, handoff, f.options);
  assert.equal(readFileSync(file, "utf8"), original);
  await performTaskDeliveryAction(task, f.action("prepare_handoff", task, { requestId: "another-explicit-preparation" }), f.options);
  assert.equal(readFileSync(file, "utf8"), original, "the same reviewed handoff is not rewritten for a new request identifier");
  assert.deepEqual(f.read().preparation.demo, f.plan.demo, "the prepared demo is reviewable from Task Chat");
  assert.equal(git(f.project, ["status", "--porcelain"]), "", "the active source checkout remains unchanged");
});

test("same names, other tasks, providers, instances and stale revisions cannot authorize a host run", async t => {
  const f = fixture(t), other = fixture(t);
  const before = f.action("verify");
  await f.bind();
  for (const actor of [{ ...task, nativeThreadId: "different" }, { ...task, stateIdentityHash: "storage-v2:other" }]) {
    assert.equal(f.read(actor).bindingStatus, "other_task");
    await assert.rejects(performTaskDeliveryAction(actor, f.action("verify", actor), f.options), { code: "delivery_task_mismatch" });
  }
  await assert.rejects(performTaskDeliveryAction(task, before, f.options), { code: "delivery_changed" });
  writeFileSync(path.join(other.runRoot, "task-control.json"), readFileSync(path.join(f.runRoot, "task-control.json")));
  assert.throws(() => other.read(), { code: "delivery_binding_stale" });
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
});

test("compiled command and policy substitution is rejected even with copied approval locks", async t => {
  const f = fixture(t);
  assert.equal(verifyCompiledTrialPlan(f.plan, f.options), true);
  const changes = [
    plan => { plan.trials[0].argv = ["node", "unexpected.mjs"]; },
    plan => { plan.trials[0].timeoutMs += 1; },
    plan => { plan.delivery_policy.trial_backend_policy = "app-server-required"; },
    plan => { plan.demo = ["unapproved action"]; },
  ];
  for (const change of changes) {
    const plan = structuredClone(f.plan); change(plan);
    writeFileSync(path.join(f.runRoot, "trial-plan.json"), JSON.stringify(plan));
    assert.equal(verifyCompiledTrialPlan(plan, f.options), false);
    assert.throws(() => f.read(), { code: "delivery_approval_stale" });
  }
  const result = await resumeDelivery(f.runId, { ...f.options, hostOnly: true });
  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "trial_plan_changed");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
});

test("binding and action evidence reject symlinks, project substitution and contract changes", async t => {
  const f = fixture(t), other = fixture(t);
  const input = f.action("bind");
  const stateFile = path.join(f.runRoot, "build-state.json"), state = readFileSync(stateFile);
  rmSync(stateFile); symlinkSync(path.join(other.runRoot, "build-state.json"), stateFile);
  assert.throws(() => f.read(), { code: "delivery_evidence_unavailable" });
  rmSync(stateFile); writeFileSync(stateFile, state);
  const auditFile = path.join(f.stateRoot, "audit/outcome-approvals.jsonl"), audit = readFileSync(auditFile);
  rmSync(auditFile); symlinkSync(path.join(other.stateRoot, "audit/outcome-approvals.jsonl"), auditFile);
  await assert.rejects(performTaskDeliveryAction(task, input, f.options), { code: "delivery_approval_unavailable" });
  rmSync(auditFile); writeFileSync(auditFile, audit);
  await f.bind();
  writeFileSync(f.contractPath, `${readFileSync(f.contractPath, "utf8")}\nChanged accepted meaning.\n`);
  assert.throws(() => f.read(), { code: "delivery_approval_stale" });
});

test("execution lease and durable started receipts prevent repeated unknown subprocess effects", async t => {
  const f = fixture(t); await f.bind();
  const input = f.action("verify");
  const lock = acquireFileLock(path.join(f.runRoot, "delivery-execution"));
  try { await assert.rejects(performTaskDeliveryAction(task, input, f.options), { code: "delivery_running" }); }
  finally { lock.release(); }
  const file = path.join(f.runRoot, "task-control.json"), control = JSON.parse(readFileSync(file, "utf8"));
  control.requests[input.requestId] = { request: input, action: "verify", status: "started", requestHash: hash([input.action, input.runId, input.expectedRevision, hash([task.providerId, task.stateIdentityHash, task.nativeThreadId])]) };
  writeFileSync(file, JSON.stringify(control));
  updateDeliveryLedger(f.runRoot, state => ({ ...state, status: "verifying", phase: "verification", blockers: [], next_action: "run_trials" }));
  assert.equal(f.read().receipts.at(-1).request.requestId, input.requestId, "reload can reconcile the exact saved request");
  await assert.rejects(performTaskDeliveryAction(task, { ...input, requestId: "another-request" }, f.options), { code: "delivery_action_pending" });
  const replay = await performTaskDeliveryAction(task, input, f.options);
  assert.equal(replay.replayed, true); assert.equal(replay.run.receipts.at(-1).status, "interrupted");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
  const next = await performTaskDeliveryAction(task, f.action("verify", task, { requestId: "explicit-new-action" }), f.options);
  assert.equal(next.run.status, "awaiting_acceptance", "a new explicit action can continue after interrupted evidence was reconciled");
});

test("saved budget survives the ledger-to-receipt crash window without adding twice", async t => {
  const f = fixture(t); await f.bind();
  const request = f.action("budget", task, { requestId: "crash-budget-request", budget: { mode: "add", tokens: 150, resume: false } });
  await performTaskDeliveryAction(task, request, f.options);
  const file = path.join(f.runRoot, "task-control.json"), control = JSON.parse(readFileSync(file, "utf8"));
  const receipt = control.requests[request.requestId]; receipt.status = "started";
  delete receipt.finishedAt; delete receipt.budgetAppliedVersion; delete receipt.result;
  writeFileSync(file, JSON.stringify(control));
  const before = readDeliveryLedger(f.runRoot);
  const replay = await performTaskDeliveryAction(task, request, f.options);
  assert.equal(replay.replayed, true);
  assert.equal(replay.run.receipts.at(-1).status, "completed");
  assert.deepEqual(readDeliveryLedger(f.runRoot), before);
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
});

test("budget replay never dispatches an already-started resume or overrides newer run progress", async t => {
  for (const interrupted of [true, false]) {
    const f = fixture(t); await f.bind();
    const request = f.action("budget", task, { requestId: "resume-budget-request", budget: { mode: "add", tokens: 200, resume: true } });
    const file = path.join(f.runRoot, "task-control.json"), control = JSON.parse(readFileSync(file, "utf8"));
    const key = hash([task.providerId, task.stateIdentityHash, task.nativeThreadId]);
    const budgetRequestId = `task-budget-${hash([key, request.requestId]).slice(0, 40)}`;
    const versionBefore = readDeliveryLedger(f.runRoot).version;
    grantDeliveryBudget(f.runRoot, { approvedBy: "user", requestId: budgetRequestId, addTokens: 200, expectedVersion: versionBefore });
    control.requests[request.requestId] = { action: "budget", status: "started", request, versionBefore, budgetRequestId,
      requestHash: hash(["budget", f.runId, request.expectedRevision, key, request.budget, null]), ...(interrupted ? { resumeStartedAt: new Date().toISOString() } : {}) };
    writeFileSync(file, JSON.stringify(control));
    if (!interrupted) updateDeliveryLedger(f.runRoot, state => ({ ...state, phase: "newer-progress" }));
    const before = readDeliveryLedger(f.runRoot);
    const replay = await performTaskDeliveryAction(task, request, f.options);
    assert.equal(replay.run.receipts.at(-1).result.resume, interrupted ? "unconfirmed_review_existing_run" : "superseded_by_run_progress");
    assert.equal(existsSync(path.join(f.runRoot, "worktree")), false, "recovery must never dispatch an unconfirmed paid continuation twice");
    assert.deepEqual(readDeliveryLedger(f.runRoot), before);
  }
});

test("the CLI accepts an absolute token cap and retains its idempotent budget history", async t => {
  const f = fixture(t);
  const args = [path.resolve("scripts/pritha.mjs"), "delivery", "budget", f.runId, "--set-tokens", "350", "--answered-by", "user", "--request-id", "cli-absolute-budget"];
  const options = { cwd: f.root, env: { ...process.env, TECHSCOPE_ROOT: f.root, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_PARENT: f.agentParent }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  const output = execFileSync(process.execPath, args, options);
  assert.match(output, /Build tokens observed: 101\/350/);
  const before = readDeliveryLedger(f.runRoot);
  execFileSync(process.execPath, args, options);
  assert.deepEqual(readDeliveryLedger(f.runRoot), before);
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false);
  await f.bind();
  const usage = JSON.parse(execFileSync(process.execPath, [path.resolve("scripts/pritha.mjs"), "delivery", "usage", f.runId], options));
  assert.equal(usage.runId, f.runId);assert.equal(usage.build.tokensUsed, 101);assert.equal(usage.totalTokens, null);
  assert.equal(usage.parent.coverage, "unknown");
});

test("approved sandbox Trials select a sandbox-capable host backend without weakening isolation", t => {
  const f = fixture(t, "sandbox-run", "sandbox");
  const view = f.read();
  assert.equal(view.plan.backend, "codex-cli");
  assert.equal(view.plan.commands[0].isolation, "sandbox");
  assert.equal(existsSync(path.join(f.runRoot, "worktree")), false, "preview does not dispatch a backend probe or command");
});
