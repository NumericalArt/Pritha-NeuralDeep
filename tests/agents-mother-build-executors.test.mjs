import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
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
  assert.equal(executor.calls[0].outputSchemaPath, undefined);
  assert.match(executor.calls[0].prompt, /Do not push, merge, deploy/);
  assert.match(executor.calls[0].prompt, /scripts\/eval\.mjs/);
  assert.equal(executor.calls[1].sandbox, "read-only");
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
