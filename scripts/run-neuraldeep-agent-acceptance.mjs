#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { CodexCliBuildExecutor } from "./agents-mother/build-executors.mjs";
import { resumeDelivery, runDeliveryLoop } from "./agents-mother/delivery-loop.mjs";
import { TRIAL_PLAN_SCHEMA } from "./agents-mother/outcome-spec.mjs";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const root = resolveTechscopeRoot();
loadPrithaRuntimeEnv({ root });
const stateRoot = resolvePrithaStateRoot({ root });
const projectPath = path.resolve(
  process.env.PRITHA_NEURALDEEP_ACCEPTANCE_AGENT
  || path.join(process.env.PRITHA_AGENT_PARENT || path.join(stateRoot, "acceptance-agents"), "NeuralDeepRuntimeProbeAgent"),
);
const runId = String(process.env.PRITHA_NEURALDEEP_ACCEPTANCE_RUN_ID || "neuraldeep-acceptance-20260831");
const runRoot = resolvePrithaStatePath("builds", "neuraldeep-runtime-probe-agent", runId);

if (!existsSync(path.join(projectPath, ".git"))) throw new Error("acceptance_agent_git_repository_missing");

const plan = {
  schema: TRIAL_PLAN_SCHEMA,
  spec_id: "neuraldeep-runtime-probe-agent-outcome-v1",
  spec_path: "acceptance://neuraldeep-runtime-probe-agent-outcome-v1",
  agent_slug: "neuraldeep-runtime-probe-agent",
  contract_path: "acceptance://neuraldeep-runtime-probe-agent-contract-v1",
  contract_fingerprint: "sha256:neuraldeep-runtime-probe-contract-v1",
  semantic_lock: "sha256:neuraldeep-runtime-probe-semantic-v1",
  document_lock: "sha256:neuraldeep-runtime-probe-document-v1",
  approval_id: null,
  interaction_mode: "headless",
  automated_trial_waiver: "none",
  autonomous_verification_allowed: true,
  counts: { trials: 1, automated: 1, operator_judged: 0 },
  coverage: [{ requirement: "core:runtime-proof", covered: true, trials: ["runtime-proof"] }],
  trials: [{
    id: "runtime-proof",
    statement: "The local child agent records NeuralDeep as provider, Codex CLI as runtime, and ready status.",
    kind: "automated",
    covers: ["core:runtime-proof"],
    given: ["A local non-production acceptance fixture with no secrets or network dependencies"],
    isolation: "sandbox",
    argv: [process.execPath, "scripts/smoke-test.mjs"],
    cwd: ".",
    thenExitCode: 0,
    thenStdoutContains: ["NEURALDEEP_AGENT_READY"],
    thenStdoutExcludes: [],
    thenStderrContains: [],
    thenStderrExcludes: [],
    thenArtifacts: ["agent-state.json"],
    thenArtifactContains: [{ path: "agent-state.json", contains: "\"status\": \"ready\"" }],
    thenAbsentPaths: [],
    thenMinStdoutChars: null,
    thenMaxDurationMs: 10_000,
    passCriteria: "Protected smoke test exits zero and prints NEURALDEEP_AGENT_READY.",
    fixture: "",
    timeoutMs: 10_000,
  }],
  demo: ["node scripts/smoke-test.mjs"],
  delivery_policy: {
    build_git_mode: "disposable-worktree",
    build_executor: "codex-cli",
    trial_backend_policy: "codex-cli-required",
    max_iterations: 3,
    max_elapsed_ms: 600_000,
    max_tokens: 100_000,
    token_budget_source: "operator-approved-roadmap",
    repeated_failure_threshold: 3,
  },
};

const executor = new CodexCliBuildExecutor({
  model: process.env.PRITHA_NEURALDEEP_MODEL || "qwen3.6-35b-a3b",
  effort: process.env.PRITHA_NEURALDEEP_ACCEPTANCE_EFFORT || "medium",
});

const deliveryOptions = {
  root,
  stateRoot,
  plan,
  projectPath,
  runRoot,
  runId,
  buildExecutor: executor,
  trialBackend: "codex-cli",
  buildGitMode: "disposable-worktree",
  budget: {
    maxIterations: 3,
    maxElapsedMs: 600_000,
    maxTokens: 100_000,
    tokenBudgetSource: "operator-approved-roadmap",
    goalEnforcement: "not-applicable",
    repeatedFailureThreshold: 3,
  },
  probeTimeoutMs: 120_000,
  executorTimeoutMs: 300_000,
};

const result = process.env.PRITHA_NEURALDEEP_ACCEPTANCE_RESUME === "1"
  ? await resumeDelivery(runId, {
      ...deliveryOptions,
      allowDraft: true,
      answer: process.env.PRITHA_NEURALDEEP_ACCEPTANCE_ANSWER || "add-guidance",
      guidance: process.env.PRITHA_NEURALDEEP_ACCEPTANCE_GUIDANCE
        || "Do not stop at a progress note. Edit agent-state.json, run the protected smoke test, and continue until it passes.",
    })
  : await runDeliveryLoop(deliveryOptions);

console.log(JSON.stringify({
  ok: result.state.status === "verified",
  status: result.state.status,
  runId,
  provider: "neuraldeep",
  executor: "codex-cli",
  trialBackend: "codex-cli",
  worktree: result.worktree?.worktree || null,
  reportPath: result.reportPath || null,
  trialStatus: result.trialResult?.verification_status || null,
}));
process.exitCode = result.state.status === "verified" ? 0 : 1;
