import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FunctionBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { readDeliveryLedger, transitionDelivery } from "../scripts/agents-mother/delivery-ledger.mjs";
import {
  cleanupDeliveryRun,
  cleanupStaleDeliveryRuns,
  resumeDelivery,
  runDeliveryLoop as executeDeliveryLoop,
} from "../scripts/agents-mother/delivery-loop.mjs";
import { TRIAL_PLAN_SCHEMA } from "../scripts/agents-mother/outcome-spec.mjs";

// Every fixture owns its receipts as well as its source/worktree.
function runDeliveryLoop(options) {
  return executeDeliveryLoop({ stateRoot: path.resolve(options.runRoot, "../../.."), ...options });
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "tests@pritha.local"]);
  git(root, ["config", "user.name", "Pritha Tests"]);
  writeFileSync(path.join(root, "implementation.txt"), "not-ready\n", "utf8");
  writeFileSync(path.join(root, "eval.mjs"), `
import { readFileSync } from "node:fs";
const value = readFileSync("implementation.txt", "utf8").trim();
if (value !== "ready") { process.stderr.write("not ready"); process.exit(1); }
process.stdout.write("READY");
`, "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "initial"]);
  return root;
}

function plan() {
  const trials = [{
    id: "main",
    statement: "Implementation is ready",
    kind: "automated",
    covers: ["core:main"],
    given: [],
    isolation: "none",
    argv: [process.execPath, "eval.mjs"],
    cwd: ".",
    thenExitCode: 0,
    thenStdoutContains: ["READY"],
    thenStdoutExcludes: [],
    thenStderrContains: [],
    thenStderrExcludes: [],
    thenArtifacts: [],
    thenArtifactContains: [],
    thenAbsentPaths: [],
    thenMinStdoutChars: null,
    thenMaxDurationMs: 5_000,
    passCriteria: "",
    fixture: "",
    timeoutMs: 5_000,
  }];
  return {
    schema: TRIAL_PLAN_SCHEMA,
    spec_id: "fixture-outcome",
    spec_path: "11_agents/contracts/fixture-agent-outcome-spec.md",
    agent_slug: "fixture-agent",
    contract_path: "11_agents/contracts/fixture-agent-contract.md",
    contract_fingerprint: "sha256:contract",
    semantic_lock: "sha256:semantic",
    document_lock: "sha256:document",
    approval_id: null,
    interaction_mode: "headless",
    automated_trial_waiver: "none",
    autonomous_verification_allowed: true,
    counts: { trials: 1, automated: 1, operator_judged: 0 },
    coverage: [],
    trials,
    demo: ["run evaluator"],
  };
}

test("delivery loop repairs a failing fixture, independently verifies, commits and preserves active worktree", async () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-loop-run-")), "builds", "fixture-agent", "run-success");
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "implementation.txt"), "ready\n", "utf8");
    return { summary: "implemented", changed_files: ["implementation.txt"] };
  });
  const result = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-success",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });

  assert.equal(result.state.status, "verified");
  assert.equal(result.state.iteration, 1);
  assert.equal(readFileSync(path.join(project, "implementation.txt"), "utf8"), "not-ready\n");
  assert.equal(readFileSync(path.join(result.worktree.worktree, "implementation.txt"), "utf8"), "ready\n");
  assert.equal(git(project, ["status", "--porcelain"]), "");
  assert.equal(git(result.worktree.worktree, ["status", "--porcelain"]), "");
  assert.equal(git(result.worktree.worktree, ["branch", "--show-current"]), "pritha/build-run-success");
  assert.equal(Boolean(result.worktree.verified_checkpoint), true);
  const probes = readDeliveryLedger(runRoot).runtime_probes;
  assert.equal(probes.some((entry) => entry.kind === "trial-execution" && entry.command_exec === true), true);
  assert.equal(probes.some((entry) => entry.kind === "build-executor" && entry.available === true), true);
});

test("repeated non-progress becomes a typed blocker instead of hanging", async () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-loop-run-")), "builds", "fixture-agent", "run-stuck");
  const executor = new FunctionBuildExecutor(async () => ({ summary: "no progress", changed_files: [] }));
  const result = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-stuck",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
    budget: { maxIterations: 6, maxElapsedMs: 60_000, repeatedFailureThreshold: 2 },
  });

  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "repeated_trial_failure");
  assert.equal(result.state.blockers[0].question.endsWith("?"), true);
  assert.equal(result.state.blockers[0].options.length >= 2, true);
});

test("executor modification of the protected evaluator is blocked and a user-approved discard restores the verifier", async () => {
  const project = repository();
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-run-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-cheat");
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "eval.mjs"), "process.stdout.write('READY');\n", "utf8");
    return { summary: "changed test", changed_files: ["eval.mjs"] };
  });
  const result = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-cheat",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });

  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "verifier_modified");
  assert.equal(readDeliveryLedger(runRoot).status, "blocked");

  const repaired = await resumeDelivery("run-cheat", {
    root: project,
    stateRoot,
    allowDraft: true,
    answer: "discard-iteration",
    buildExecutor: new FunctionBuildExecutor(async ({ worktree }) => {
      writeFileSync(path.join(worktree, "implementation.txt"), "ready\n", "utf8");
      return { summary: "implemented without changing verifier", changed_files: ["implementation.txt"] };
    }),
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(repaired.state.status, "verified");
  assert.match(readFileSync(path.join(repaired.worktree.worktree, "eval.mjs"), "utf8"), /implementation\.txt/);
});

test("a dirty-workspace blocker resumes from the private source-project binding after the user cleans it", async () => {
  const project = repository();
  writeFileSync(path.join(project, "user-note.txt"), "preserve me\n", "utf8");
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-resume-state-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-dirty-resume");
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "implementation.txt"), "ready\n", "utf8");
    return { summary: "implemented", changed_files: ["implementation.txt"] };
  });

  const blocked = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-dirty-resume",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(blocked.state.status, "blocked");
  assert.equal(blocked.state.blockers[0].code, "dirty_workspace");
  assert.equal(blocked.state.source_project, project);

  git(project, ["add", "user-note.txt"]);
  git(project, ["commit", "-m", "preserve user note"]);
  const resumed = await resumeDelivery("run-dirty-resume", {
    root: project,
    stateRoot,
    allowDraft: true,
    answer: "retry-after-clean",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });

  assert.equal(resumed.state.status, "verified");
  assert.equal(readFileSync(path.join(project, "implementation.txt"), "utf8"), "not-ready\n");
  assert.equal(readFileSync(path.join(project, "user-note.txt"), "utf8"), "preserve me\n");
});

test("review-failures keeps a budget blocker paused instead of silently retrying", async () => {
  const project = repository();
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-review-state-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-review");
  const executor = new FunctionBuildExecutor(async () => ({ summary: "no progress", changed_files: [] }));
  const blocked = await runDeliveryLoop({
    plan: plan(),
    projectPath: project,
    runRoot,
    runId: "run-review",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
    budget: { maxIterations: 1, maxElapsedMs: 60_000, repeatedFailureThreshold: 3 },
  });
  assert.equal(blocked.state.status, "blocked");
  assert.equal(blocked.state.blockers[0].code, "iteration_budget_exhausted");

  const reviewed = await resumeDelivery("run-review", {
    root: project,
    stateRoot,
    allowDraft: true,
    answer: "review-failures",
    guidance: "Show the current failures before any retry.",
    buildExecutor: executor,
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(reviewed.state.status, "blocked");
  assert.equal(reviewed.state.blockers[0].code, "iteration_budget_exhausted");
});

test("resume preserves the approved Trial backend policy before changing blocker state", async () => {
  const project = repository();
  writeFileSync(path.join(project, "dirty.txt"), "user work\n", "utf8");
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-policy-state-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-policy");
  const policyPlan = {
    ...plan(),
    delivery_policy: {
      build_git_mode: "disposable-worktree",
      build_executor: "manual",
      trial_backend_policy: "app-server-required",
    },
  };
  const blocked = await runDeliveryLoop({
    plan: policyPlan,
    projectPath: project,
    runRoot,
    runId: "run-policy",
    buildExecutor: new FunctionBuildExecutor(async () => ({ summary: "unused" })),
    trialBackend: "local",
    reportDir: false,
  });
  assert.equal(blocked.state.status, "blocked");
  const version = blocked.state.version;

  git(project, ["add", "dirty.txt"]);
  git(project, ["commit", "-m", "preserve dirty work"]);
  await assert.rejects(
    () => resumeDelivery("run-policy", {
      root: project,
      stateRoot,
      allowDraft: true,
      answer: "retry-after-clean",
      trialBackend: "local",
      reportDir: false,
    }),
    (error) => error?.code === "trial_backend_policy_conflict",
  );
  assert.equal(readDeliveryLedger(runRoot).version, version);
  assert.equal(readDeliveryLedger(runRoot).status, "blocked");
});

test("cleanup policy preserves verified runs and bulk-cleans only stale clean terminal runs", async () => {
  const project = repository();
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-cleanup-state-"));
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "implementation.txt"), "ready\n");
    return { summary: "implemented", changed_files: ["implementation.txt"] };
  });
  const runs = [];
  for (const runId of ["run-clean-old", "run-dirty-old"]) {
    const runRoot = path.join(stateRoot, "builds", "fixture-agent", runId);
    const result = await runDeliveryLoop({
      plan: plan(), projectPath: project, runRoot, runId,
      buildExecutor: executor, trialBackend: "local", reportDir: false,
    });
    assert.equal(result.state.status, "verified");
    runs.push({ runId, runRoot, worktree: result.worktree.worktree });
  }

  const verifiedPlan = cleanupDeliveryRun(runs[0].runId, { root: project, stateRoot, apply: true, yes: true });
  assert.equal(verifiedPlan.eligible, false);
  assert.equal(verifiedPlan.reason, "acceptance_pending");
  assert.equal(existsSync(runs[0].worktree), true);

  for (const run of runs) {
    transitionDelivery(run.runRoot, "accepted", { acceptedAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" });
  }
  writeFileSync(path.join(runs[1].worktree, "preserve-untracked.txt"), "user work\n");

  const planned = cleanupStaleDeliveryRuns({
    root: project,
    stateRoot,
    olderThanDays: 7,
    now: Date.parse("2026-08-22T00:00:00.000Z"),
  });
  assert.deepEqual(planned.candidates.map((entry) => entry.run_id), ["run-clean-old"]);
  assert.equal(planned.skipped.some((entry) => entry.run_id === "run-dirty-old" && entry.reason === "dirty_worktree"), true);
  assert.equal(existsSync(runs[0].worktree), true, "plan mode is read-only");

  const applied = cleanupStaleDeliveryRuns({
    root: project,
    stateRoot,
    olderThanDays: 7,
    now: Date.parse("2026-08-22T00:00:00.000Z"),
    apply: true,
    yes: true,
  });
  assert.equal(applied.candidates[0].removed, true);
  assert.equal(existsSync(runs[0].worktree), false);
  assert.equal(existsSync(runs[1].worktree), true);
});

test("Codex CLI uses host-enforced budgets without an App Server Goal API", async () => {
  const project = repository();
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-cli-budget-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-cli-budget");
  let executions = 0;
  const executor = {
    name: "codex-cli-build",
    async probe() {
      return {
        backend: this.name,
        provider: "neuraldeep",
        available: true,
        isolation: "sandboxed",
        runtimeVersion: "codex-cli/0.135.0",
        capabilities: { commandExec: true, threadStart: true, goal: false, tools: true, structuredOutput: true },
      };
    },
    async execute(input) {
      executions += 1;
      assert.equal(input.goalRequired, true);
      assert.ok(input.tokenBudget > 0);
      writeFileSync(path.join(input.worktree, "implementation.txt"), "ready\n");
      return {
        schema: "pritha-build-executor-result-v1",
        executor: this.name,
        provider: "neuraldeep",
        status: "completed",
        summary: "implemented through CLI",
        changed_files: ["implementation.txt"],
        remaining_risks: [],
        thread_id: "cli-thread",
        turn_id: "cli-turn",
        tokens_used: 123,
        goal_enforcement: "not-applicable",
        goal_status: "host-budget-enforced",
      };
    },
    close() {},
  };
  const result = await runDeliveryLoop({
    plan: plan(), projectPath: project, runRoot, runId: "run-cli-budget",
    buildExecutor: executor, trialBackend: "local", reportDir: false,
  });
  assert.equal(result.state.status, "verified");
  assert.equal(executions, 1);
  assert.equal(readDeliveryLedger(runRoot).budget.tokens_used, 123);
});

test("resume reconciles a crash-saved executor result into token usage exactly once", async () => {
  const project = repository();
  writeFileSync(path.join(project, "dirty.txt"), "preserve\n");
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-loop-token-reconcile-"));
  const runRoot = path.join(stateRoot, "builds", "fixture-agent", "run-token-reconcile");
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    writeFileSync(path.join(worktree, "implementation.txt"), "ready\n");
    return { summary: "ready", changed_files: ["implementation.txt"] };
  });
  const blocked = await runDeliveryLoop({
    plan: plan(), projectPath: project, runRoot, runId: "run-token-reconcile",
    buildExecutor: executor, trialBackend: "local", reportDir: false,
  });
  assert.equal(blocked.state.blockers[0].code, "dirty_workspace");

  const executorDir = path.join(runRoot, "executor");
  mkdirSync(executorDir, { recursive: true });
  writeFileSync(path.join(executorDir, "iteration-001.json"), `${JSON.stringify({
    schema: "pritha-build-executor-result-v1",
    executor: "codex-app-server-build",
    status: "completed",
    thread_id: "crash-thread",
    turn_id: "crash-turn",
    tokens_used: 321,
    goal_enforcement: "required",
  }, null, 2)}\n`);
  git(project, ["add", "dirty.txt"]);
  git(project, ["commit", "-m", "preserve dirty fixture"]);

  const resumed = await resumeDelivery("run-token-reconcile", {
    root: project, stateRoot, allowDraft: true, answer: "retry-after-clean",
    buildExecutor: executor, trialBackend: "local", reportDir: false,
  });
  assert.equal(resumed.state.status, "verified");
  let budget = readDeliveryLedger(runRoot).budget;
  assert.equal(budget.tokens_used, 321);
  assert.equal(budget.accounted_turns.filter((entry) => entry.key === "crash-thread:crash-turn").length, 1);

  await runDeliveryLoop({
    plan: plan(), projectPath: project, runRoot, runId: "run-token-reconcile",
    buildExecutor: executor, trialBackend: "local", reportDir: false,
  });
  budget = readDeliveryLedger(runRoot).budget;
  assert.equal(budget.tokens_used, 321);
  assert.equal(budget.accounted_turns.filter((entry) => entry.key === "crash-thread:crash-turn").length, 1);
});

test("a missing private Trial receipt blocks before command execution or another model attempt", async () => {
  const project = repository();
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-trial-receipt-state-"));
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-trial-receipt-outside-")), "run");
  let builds = 0;
  const result = await executeDeliveryLoop({ plan: plan(), projectPath: project, runRoot,
    stateRoot, runId: "receipt-failure", trialBackend: "local", reportDir: false,
    buildExecutor: new FunctionBuildExecutor(async () => { builds++; return { summary: "must not run" }; }),
  });
  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "trial_receipt_unavailable");
  assert.equal(result.state.iteration, 0);
  assert.equal(builds, 0);
});
