import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CodexCliBuildExecutor,
  FunctionBuildExecutor,
  ManualBuildExecutor,
  createBuildExecutor,
  reliableBuildSummary,
} from "../scripts/agents-mother/build-executors.mjs";
import { approvedBuildContext, approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec, verifyCompiledTrialPlan } from "../scripts/agents-mother/outcome-spec.mjs";
import { runDeliveryLoop } from "../scripts/agents-mother/delivery-loop.mjs";

function plan() {
  return {
    spec_id: "fixture-outcome",
    agent_slug: "fixture",
    contract_fingerprint: "sha256:contract",
    semantic_lock: "sha256:semantic",
    interaction_mode: "interface",
    trials: [{ id: "main", statement: "Produce ready output", kind: "automated", covers: ["core:main"], thenExitCode: 0, thenStdoutContains: ["READY"] }],
    demo: ["run main"],
  };
}

function gitFixture() {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "pritha-cli-build-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.name", "Pritha Test"], { cwd });
  execFileSync("git", ["config", "user.email", "pritha-test@example.invalid"], { cwd });
  writeFileSync(path.join(cwd, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd });
  return cwd;
}

class FakeCodexCliBuildExecutor extends CodexCliBuildExecutor {
  constructor() {
    super({ model: "fixture-model", effort: "medium" });
    this.calls = [];
  }

  runtimeVersion() {
    return "codex-cli 0.135.0";
  }

  async run(options) {
    this.calls.push(options);
    if (this.calls.length === 1) {
      writeFileSync(path.join(options.cwd, "agent-state.json"), '{"status":"ready"}\n');
      return {
        code: 0,
        timedOut: false,
        durationMs: 10,
        stderr: "",
        events: [{ type: "thread.started", thread_id: "tool-thread" }],
        threadId: "tool-thread",
        agentText: "Implemented the fixture and verified the local state.",
        tokensUsed: 120,
      };
    }
    writeFileSync(options.outputPath, JSON.stringify({
      summary: "Implemented the fixture.",
      changed_files: ["untrusted-model-claim.txt"],
      remaining_risks: [],
    }));
    return {
      code: 0,
      timedOut: false,
      durationMs: 5,
      stderr: "",
      events: [{ type: "thread.started", thread_id: "summary-thread" }],
      threadId: "summary-thread",
      agentText: "",
      tokensUsed: 30,
    };
  }
}

test("Codex CLI build executor separates tool execution from structured summary", async () => {
  const worktree = gitFixture();
  const executor = new FakeCodexCliBuildExecutor();
  const result = await executor.execute({
    runId: "run-1",
    stateRoot: mkdtempSync(path.join(os.tmpdir(), "pritha-cli-build-state-")),
    iteration: 1,
    remainingIterations: 5,
    worktree,
    plan: plan(),
    failures: [{ id: "main", error: "not ready" }],
    protectedPaths: [{ path: "scripts/eval.mjs" }],
    timeoutMs: 30_000,
    tokenBudget: 1_000,
    goalObjective: "Run run-1 for fixture-outcome and satisfy sha256:semantic.",
  });

  assert.equal(executor.calls.length, 2);
  assert.equal(executor.calls[0].sandbox, "workspace-write");
  assert.equal(executor.calls[0].tokenBudget, 1000);
  assert.equal(executor.calls[0].outputSchemaPath, undefined);
  assert.match(executor.calls[0].prompt, /Do not push, merge, deploy/);
  assert.match(executor.calls[0].prompt, /scripts\/eval\.mjs/);
  assert.equal(executor.calls[1].sandbox, "read-only");
  assert.equal(executor.calls[1].tokenBudget, 880, 'the summary receives only the measured remaining allocation');
  assert.ok(executor.calls[1].outputSchemaPath);
  assert.equal(result.provider, "neuraldeep");
  assert.equal(result.model, "fixture-model");
  assert.equal(result.summary, "Implemented the fixture.");
  assert.deepEqual(result.changed_files, ["agent-state.json"], "host-observed Git diff overrides the model claim");
  assert.equal(result.tokens_used, 150);
  assert.equal(result.goal_status, "host-budget-enforced");
});

test("Codex CLI build environment excludes OpenAI credentials", () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "must-not-leak";
  try {
    const environment = new CodexCliBuildExecutor().environment();
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.AZURE_OPENAI_API_KEY, undefined);
    assert.equal(environment.CHATGPT_API_KEY, undefined);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test("truncated structured summaries fall back to the implementation report", () => {
  const summary = reliableBuildSummary(
    { summary: "Changed `", changed_files: [], remaining_risks: [] },
    "Implemented the runtime probe and verified its local Trial.",
  );
  assert.equal(summary.summary, "Implemented the runtime probe and verified its local Trial.");
  assert.deepEqual(summary.remaining_risks, []);
});

test("historical build executor names are migration aliases to Codex CLI", () => {
  assert.ok(createBuildExecutor("codex-cli") instanceof CodexCliBuildExecutor);
  assert.ok(createBuildExecutor("codex-app-server") instanceof CodexCliBuildExecutor);
  assert.ok(createBuildExecutor("app-server") instanceof CodexCliBuildExecutor);
});

test("function executor provides the same bounded result contract", async () => {
  const result = await new FunctionBuildExecutor(async () => ({ summary: "done", changed_files: ["one.mjs"] })).execute({});
  assert.equal(result.status, "completed");
  assert.equal(result.summary, "done");
  assert.deepEqual(result.changed_files, ["one.mjs"]);
});

test("manual build policy returns a typed implementation boundary", async () => {
  await assert.rejects(new ManualBuildExecutor().execute({}), (error) => error.code === "manual_build_required");
});

function approvedBriefFixture(t, preset = "llm-app") {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pritha-build-brief-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "mother"), stateRoot = path.join(directory, "state"), agentParent = path.join(directory, "children");
  mkdirSync(root, { recursive: true });
  const brief = {
    schemaVersion: 1, identity: { name: "Signal Desk ND", slug: "signal-desk-nd" },
    goal: "Create a saved digest of selected articles", user: "One local operator",
    successCriteria: ["Export a saved Markdown digest", "Keep history between restarts"],
    coreFunctions: ["Collect articles", "Generate and save a digest"],
    sources: ["https://github.blog/changelog/feed/", "https://blog.python.org/feeds/posts/default?alt=rss"],
    constraints: ["Store history in SQLite", "Русский дайджест со ссылками", "At most 20 materials per generation"],
    nonGoals: ["No automatic external publishing"],
    permissions: { network: ["Only the configured public feeds and instance provider"], filesystem: ["Only the child project"], authorization: "Local operator actions" },
    technical: { preset, sourceFormat: "rss" },
  };
  const briefPath = path.join(directory, "brief.json");
  writeFileSync(briefPath, JSON.stringify(brief));
  const init = spawnSync(process.execPath, ["scripts/pritha.mjs", "init", "--no-input", "--contract-only", "--brief", briefPath], {
    cwd: path.resolve("."), encoding: "utf8",
    env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: agentParent, PRITHA_AGENT_AUTHORING_ROOT: "" },
  });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const contracts = path.join(stateRoot, "agents", "contracts");
  const contractPath = path.join(contracts, readdirSync(contracts).find(name => name.endsWith("-agent-contract.md")));
  writeFileSync(contractPath, readFileSync(contractPath, "utf8").replace(/^status: draft$/m, "status: accepted"));
  const options = { root, stateRoot };
  const specPath = createOutcomeSpec(contractPath, options).path;
  writeFileSync(specPath, readFileSync(specPath, "utf8").replace(/^- Done when:.*$/m, "- Done when: The operator downloads the saved selection after a restart"));
  approveOutcomeSpec(specPath, { ...options, approvedBy: "user" });
  const compiled = compileOutcomeSpec(specPath, { ...options, runId: "approved-build-context" });
  return { ...options, ...compiled, brief, contractPath, specPath };
}

test("typed brief requirements reach the build prompt through unchanged approved v1 artifacts", async t => {
  const fixture = approvedBriefFixture(t);
  const savedPlan = readFileSync(fixture.planPath, "utf8");
  // None of these requirements is redundantly encoded in the Trial projection.
  for (const requirement of [...fixture.brief.sources, ...fixture.brief.constraints]) assert.equal(JSON.stringify(fixture.plan).includes(requirement), false);
  const executor = new FakeCodexCliBuildExecutor();
  const worktree = gitFixture();
  t.after(() => rmSync(worktree, { recursive: true, force: true }));
  await executor.execute({ ...fixture, worktree, runId: "context-run", iteration: 1, remainingIterations: 5, tokenBudget: 1_000,
    approvedArtifacts: { contract: "unapproved input must not replace host artifacts" } });
  const payload = JSON.parse(executor.calls[0].prompt.split("Delivery payload:\n")[1]);
  const context = payload.approved_artifacts;
  for (const requirement of [...fixture.brief.sources, ...fixture.brief.constraints, ...fixture.brief.successCriteria,
    ...fixture.brief.permissions.filesystem, ...fixture.brief.permissions.network, ...fixture.brief.nonGoals]) {
    assert.ok(context.contract.markdown.includes(requirement), requirement);
  }
  assert.match(context.outcome.markdown, /Done when: The operator downloads the saved selection after a restart/);
  assert.equal(context.contract.markdown, readFileSync(fixture.contractPath, "utf8"));
  assert.equal(context.outcome.markdown, readFileSync(fixture.specPath, "utf8"));
  assert.equal(context.approval_id, fixture.plan.approval_id);
  assert.equal(context.contract.fingerprint, fixture.plan.contract_fingerprint);
  assert.equal(verifyCompiledTrialPlan(fixture.plan, fixture), true, "Existing wire-format plans still verify without migration or replacement approval");
  assert.equal(readFileSync(fixture.planPath, "utf8"), savedPlan);
  assert.equal(Object.hasOwn(fixture.plan, "approved_artifacts"), false);
});

for (const artifact of ["contract", "outcome"]) test(`changed approved ${artifact} blocks build before any model call`, async t => {
  const fixture = approvedBriefFixture(t);
  const file = artifact === "contract" ? fixture.contractPath : fixture.specPath;
  writeFileSync(file, `${readFileSync(file, "utf8")}\nUnreviewed product change.\n`);
  const executor = new FakeCodexCliBuildExecutor();
  const worktree = gitFixture();
  t.after(() => rmSync(worktree, { recursive: true, force: true }));
  await assert.rejects(executor.execute({ ...fixture, worktree, runId: "stale-context", iteration: 1, tokenBudget: 1_000 }), error => error.code === "outcome_approval_stale");
  assert.equal(executor.calls.length, 0);
  assert.throws(() => approvedBuildContext({ ...fixture.plan, approval_id: null }, fixture), error => error.code === "outcome_approval_stale");
});

test("delivery rechecks frozen requirements after dispatch hooks and blocks before a paid probe", async t => {
  const fixture = approvedBriefFixture(t, "generic");
  const project = gitFixture();
  t.after(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(path.join(project, "scripts"));
  writeFileSync(path.join(project, "scripts/smoke-test.mjs"), "process.exit(1);\n");
  execFileSync("git", ["add", "."], { cwd: project });
  execFileSync("git", ["commit", "-qm", "unimplemented product"], { cwd: project });
  let calls = 0;
  const result = await runDeliveryLoop({ ...fixture, projectPath: project, trialBackend: "local", reportDir: false,
    beforeDispatch: () => writeFileSync(fixture.contractPath, `${readFileSync(fixture.contractPath, "utf8")}\nUnreviewed change at dispatch boundary.\n`),
    buildExecutor: { name: "must-not-dispatch", async probe() { calls += 1; throw new Error("unexpected probe"); }, async execute() { calls += 1; throw new Error("unexpected build"); } },
  });
  assert.equal(calls, 0);
  assert.equal(result.state.status, "blocked");
  assert.equal(result.state.blockers[0].code, "outcome_approval_stale");
  assert.equal(result.state.iteration, 1, "Changed approval is a direct blocker, not three artificial implementation failures");
});
