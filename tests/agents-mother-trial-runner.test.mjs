import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveOutcomeSpec,
  compileOutcomeSpec,
  createOutcomeSpec,
  TRIAL_PLAN_SCHEMA,
} from "../scripts/agents-mother/outcome-spec.mjs";
import { runTrialPlan, verifyTrialResultFreshness } from "../scripts/agents-mother/trial-runner.mjs";

function projectFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-trial-runner-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  writeFileSync(path.join(root, "fixture.txt"), "input", "utf8");
  writeFileSync(path.join(root, "scripts", "trial.mjs"), `
import { writeFileSync } from "node:fs";
writeFileSync("result.txt", "verified artifact");
process.stdout.write("READY verified");
process.stderr.write("diagnostic");
`, "utf8");
  return root;
}

function plan(trials) {
  return {
    schema: TRIAL_PLAN_SCHEMA,
    spec_id: "fixture-outcome",
    spec_path: "11_agents/contracts/fixture-agent-outcome-spec.md",
    agent_slug: "fixture-agent",
    contract_path: "11_agents/contracts/fixture-agent-contract.md",
    contract_fingerprint: "sha256:contract",
    semantic_lock: "sha256:semantic",
    document_lock: "sha256:document",
    approval_id: "approval-fixture",
    interaction_mode: "interface",
    automated_trial_waiver: "none",
    autonomous_verification_allowed: true,
    counts: { trials: trials.length, automated: trials.filter((entry) => entry.kind === "automated").length, operator_judged: trials.filter((entry) => entry.kind === "operator-judged").length },
    coverage: [],
    trials,
    demo: ["run"],
  };
}

function automated(overrides = {}) {
  return {
    id: "automated-main",
    statement: "Run deterministic fixture",
    kind: "automated",
    covers: ["core:main"],
    given: [],
    isolation: "none",
    argv: [process.execPath, "scripts/trial.mjs"],
    cwd: ".",
    thenExitCode: 0,
    thenStdoutContains: ["READY"],
    thenStdoutExcludes: ["SECRET"],
    thenStderrContains: ["diagnostic"],
    thenStderrExcludes: ["fatal"],
    thenArtifacts: ["result.txt"],
    thenArtifactContains: [{ path: "result.txt", contains: "verified" }],
    thenAbsentPaths: ["secret.txt"],
    thenMinStdoutChars: 5,
    thenMaxDurationMs: 5_000,
    passCriteria: "",
    fixture: "fixture.txt",
    timeoutMs: 5_000,
    ...overrides,
  };
}

function approvedOutcomeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-live-outcome-"));
  const stateRoot = path.join(root, "state");
  const contractPath = path.join(root, "11_agents", "contracts", "fixture-agent-contract.md");
  mkdirSync(path.dirname(contractPath), { recursive: true });
  writeFileSync(contractPath, `---
id: fixture-agent-contract
type: agent-contract
status: accepted
created: 2026-08-16
updated: 2026-08-16
---

# Agent Project Contract: Fixture Agent

## Purpose

- Agent name: Fixture Agent
- Primary mission: Produce a verified result
- Target user: operator
- Success criteria: The result is verified
- Out of scope: deployment

## Functional scope

### V1 core functions

- Produce the result

### Critical user workflows

- Run and inspect the result

## Runtime and interface

- Primary interface: Codex project
- Proactive mode: none

## Data, memory and sources

- Input data types: text
- Stored data: result
`);
  const created = createOutcomeSpec(path.relative(root, contractPath), { root, date: "2026-08-16" });
  approveOutcomeSpec(created.path, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-16T12:00:00.000Z" });
  const compiled = compileOutcomeSpec(created.path, { root, stateRoot, runId: "live-binding" });
  return { root, stateRoot, contractPath, specPath: created.path, compiled };
}

test("Trial runner evaluates all assertion families and persists revision-bound evidence", async () => {
  const project = projectFixture();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-run-state-")), "run");
  const { result, resultPath } = await runTrialPlan(plan([automated()]), { projectPath: project, runRoot, stateRoot: path.dirname(runRoot) });

  assert.equal(result.verification_status, "verified");
  assert.equal(result.counts.passed, 1);
  assert.equal(result.trials[0].assertions.every((entry) => entry.passed), true);
  assert.equal(result.workspace_changed_during_trials, true);
  assert.equal(readFileSync(resultPath, "utf8").includes('"evidence_lock": "sha256:'), true);
  assert.equal(verifyTrialResultFreshness(result, project).ok, true);

  writeFileSync(path.join(project, "after-evidence.txt"), "changed", "utf8");
  assert.equal(verifyTrialResultFreshness(result, project).reason, "workspace_revision_changed");
});

test("operator-judged Trial prevents autonomous verification", async () => {
  const project = projectFixture();
  const operator = {
    id: "operator-demo",
    statement: "Judge the user-facing flow",
    kind: "operator-judged",
    covers: ["core:experience"],
    passCriteria: "The demonstrated flow is understandable",
  };
  const { result } = await runTrialPlan(plan([automated(), operator]), { projectPath: project });

  assert.equal(result.verification_status, "awaiting_acceptance");
  assert.equal(result.counts.awaiting_operator, 1);
});

test("required isolation fails closed on the local backend", async () => {
  const project = projectFixture();
  const { result } = await runTrialPlan(plan([automated({ isolation: "sandbox" })]), { projectPath: project });

  assert.equal(result.verification_status, "failed");
  assert.equal(result.trials[0].error.code, "isolation_unavailable");
});

test("required isolation blocks before execute when the runtime probe is unconfirmed", async () => {
  const project = projectFixture();
  let executions = 0;
  const backend = {
    name: "unconfirmed-sandbox-fixture",
    async probe() {
      return {
        backend: this.name,
        available: true,
        isolation: "unknown",
        runtimeVersion: "fixture/1",
        capabilities: { commandExec: true, sandbox: false },
      };
    },
    async execute() {
      executions += 1;
      throw new Error("execute must not be called");
    },
    close() {},
  };
  const { result } = await runTrialPlan(plan([automated({ isolation: "sandbox" })]), { projectPath: project, backend });
  assert.equal(executions, 0);
  assert.equal(result.trials[0].error.code, "isolation_unavailable");
  assert.equal(result.runtime_probe.runtimeVersion, "fixture/1");
});

test("artifact assertions reject symlink evidence", async () => {
  const project = projectFixture();
  const outside = mkdtempSync(path.join(os.tmpdir(), "pritha-outside-artifact-"));
  writeFileSync(path.join(outside, "evidence.txt"), "verified", "utf8");
  symlinkSync(path.join(outside, "evidence.txt"), path.join(project, "linked.txt"));
  const { result } = await runTrialPlan(plan([automated({
    argv: [process.execPath, "-e", "process.exit(0)"],
    thenStdoutContains: [],
    thenStderrContains: [],
    thenArtifacts: ["linked.txt"],
    thenArtifactContains: [{ path: "linked.txt", contains: "verified" }],
    fixture: "",
  })]), { projectPath: project });

  assert.equal(result.verification_status, "failed");
  assert.equal(result.trials[0].assertions.some((entry) => entry.type === "artifact_contains" && !entry.passed), true);
});

test("Trial evidence redacts project paths in command output", async () => {
  const project = projectFixture();
  const { result } = await runTrialPlan(plan([automated({
    argv: [process.execPath, "-e", `process.stdout.write(${JSON.stringify(project)})`],
    thenStdoutContains: [project],
    thenStdoutExcludes: [],
    thenStderrContains: [],
    thenArtifacts: [],
    thenArtifactContains: [],
    fixture: "",
  })]), { projectPath: project });

  assert.equal(result.verification_status, "verified");
  assert.equal(result.trials[0].execution.stdout.includes(project), false);
  assert.match(result.trials[0].execution.stdout, /^<(?:PROJECT_ROOT|TEMP_PATH)>$/);
});

test("freshness binds content-asserted artifacts even when Git ignores them", async () => {
  const project = projectFixture();
  writeFileSync(path.join(project, ".gitignore"), "result.txt\n", "utf8");
  execFileSync("git", ["init"], { cwd: project, stdio: "ignore" });
  execFileSync("git", ["add", "-A"], { cwd: project, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.name=Pritha Test", "-c", "user.email=pritha-test@local", "commit", "-m", "fixture"],
    { cwd: project, stdio: "ignore" },
  );

  const { result } = await runTrialPlan(plan([automated()]), { projectPath: project });
  assert.equal(result.verification_status, "verified");
  assert.equal(result.workspace_changed_during_trials, false);
  assert.equal(verifyTrialResultFreshness(result, project).ok, true);

  writeFileSync(path.join(project, "result.txt"), "tampered artifact", "utf8");
  assert.equal(verifyTrialResultFreshness(result, project).reason, "asserted_artifact_changed");
});

test("freshness rejects changed, superseded, missing, invalid, or contract-stale live Outcome Specs", async () => {
  const project = projectFixture();
  const fixture = approvedOutcomeFixture();
  const originalSpec = readFileSync(fixture.specPath, "utf8");
  const originalContract = readFileSync(fixture.contractPath, "utf8");
  const boundPlan = {
    ...fixture.compiled.plan,
    trials: [automated()],
    counts: { trials: 1, automated: 1, operator_judged: 0 },
  };
  const { result } = await runTrialPlan(boundPlan, { projectPath: project });
  const options = { outcomeSpecPath: fixture.specPath, root: fixture.root, stateRoot: fixture.stateRoot };
  try {
    assert.equal(verifyTrialResultFreshness(result, project, options).ok, true);

    writeFileSync(fixture.specPath, originalSpec.replace("approved_at: 2026-08-16T12:00:00.000Z", "approved_at: 2026-08-16T13:00:00.000Z"));
    assert.equal(verifyTrialResultFreshness(result, project, options).ok, true, "approved_at alone is mutable metadata");

    writeFileSync(fixture.specPath, originalSpec.replace("Produce the result", "Produce a materially different result"));
    assert.equal(verifyTrialResultFreshness(result, project, options).reason, "outcome_spec_changed");

    writeFileSync(fixture.specPath, originalSpec.replace("status: approved", "status: superseded").replace("outcome_spec_status: approved", "outcome_spec_status: superseded"));
    assert.equal(verifyTrialResultFreshness(result, project, options).reason, "outcome_spec_changed");

    writeFileSync(fixture.specPath, originalSpec);
    writeFileSync(fixture.contractPath, originalContract.replace("Produce a verified result", "Produce two verified results"));
    assert.equal(verifyTrialResultFreshness(result, project, options).reason, "outcome_spec_changed");

    writeFileSync(fixture.contractPath, originalContract);
    writeFileSync(fixture.specPath, "not a valid outcome spec\n");
    assert.equal(verifyTrialResultFreshness(result, project, options).reason, "outcome_spec_changed");

    rmSync(fixture.specPath);
    const missing = verifyTrialResultFreshness(result, project, options);
    assert.equal(missing.reason, "outcome_spec_changed");
    assert.equal(JSON.stringify(missing).includes(fixture.specPath), false, "freshness result must not disclose an absolute spec path");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("legacy Trial evidence with a v1 nested execution result remains self-verifying", async () => {
  const project = projectFixture();
  const { result } = await runTrialPlan(plan([automated()]), { projectPath: project });
  result.trials[0].execution.schema = "pritha-trial-execution-result-v1";
  const { started_at: _startedAt, finished_at: _finishedAt, evidence_lock: _oldLock, ...projection } = result;
  result.evidence_lock = `sha256:${createHash("sha256").update(JSON.stringify(projection)).digest("hex")}`;
  const before = JSON.stringify(result);
  assert.equal(verifyTrialResultFreshness(result, project).ok, true);
  assert.equal(JSON.stringify(result), before, "legacy evidence is verified in place and is not rewritten or upgraded");
});
