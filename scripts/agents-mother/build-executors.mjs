import { runSyncProbe } from "../lib/sync-probe.mjs";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { ExecutionBackendError } from "./execution-backends.mjs";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from "../neuraldeep/coordination-store.mjs";
import { recordNeuralDeepRun } from "../neuraldeep/usage-ledger.mjs";

export const BUILD_EXECUTOR_RESULT_SCHEMA = "pritha-build-executor-result-v1";

function bounded(value, maximum = 20_000) {
  const text = String(value || "").trim();
  return text.length <= maximum ? text : `${text.slice(0, maximum - 3)}...`;
}

function worktreeRoot(value) {
  const requested = path.resolve(String(value || ""));
  if (!existsSync(requested)) throw new Error("Build worktree does not exist");
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Build worktree must be a regular directory, not a symlink");
  return realpathSync(requested);
}

function sanitized(value, context) {
  if (typeof value === "string") return redactFilesystemPaths(value, context);
  if (Array.isArray(value)) return value.map((entry) => sanitized(entry, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitized(entry, context)]));
  return value;
}

function outcomeProjection(plan) {
  return {
    spec_id: plan.spec_id,
    agent_slug: plan.agent_slug,
    contract_fingerprint: plan.contract_fingerprint,
    semantic_lock: plan.semantic_lock,
    interaction_mode: plan.interaction_mode,
    trials: (plan.trials || []).map((trial) => ({
      id: trial.id,
      statement: trial.statement,
      kind: trial.kind,
      covers: trial.covers,
      pass_criteria: trial.passCriteria || null,
      assertions: trial.kind === "automated" ? {
        exit_code: trial.thenExitCode,
        stdout_contains: trial.thenStdoutContains,
        stdout_excludes: trial.thenStdoutExcludes,
        stderr_contains: trial.thenStderrContains,
        stderr_excludes: trial.thenStderrExcludes,
        artifacts: trial.thenArtifacts,
        artifact_contains: trial.thenArtifactContains,
        absent_paths: trial.thenAbsentPaths,
      } : null,
    })),
    demo: plan.demo || [],
  };
}

function buildPrompt(input) {
  const protectedPaths = (input.protectedPaths || []).map((entry) => entry.path || entry).filter(Boolean);
  const payload = {
    run_id: input.runId,
    iteration: input.iteration,
    remaining_iterations: input.remainingIterations,
    approved_outcome: outcomeProjection(input.plan),
    latest_trial_failures: input.failures || [],
    protected_trial_inputs: protectedPaths,
  };
  return [
    "You are the bounded implementation executor for a Pritha agent-delivery run.",
    "Work only inside the supplied worktree. Implement the approved outcome and repair the listed Trial failures.",
    "The approved outcome, Trial definitions, approval evidence, budgets, ledger and verifier are host-owned and immutable.",
    "Do not edit protected Trial input files. Do not weaken, delete, skip or replace tests to obtain a green result.",
    "Do not push, merge, deploy, enable services, provision secrets, change Git remotes or bypass hooks.",
    "Network access is disabled. Use only files and dependencies already present in the worktree.",
    "Make the smallest coherent implementation, run relevant local checks if useful, and finish with a concise summary.",
    "Do not stop after a plan, acknowledgement, or progress note. Continue using tools until the implementation and its local verification are complete.",
    "If a preferred editing tool is unavailable in this Codex/model combination, use another available local file-editing method and continue.",
    "A completion claim is not trusted; Pritha will independently run the approved Trials after this turn.",
    "The final response must satisfy the supplied output schema; intermediate progress text is not a completion result.",
    "",
    "Delivery payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function outputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "changed_files", "remaining_risks"],
    properties: {
      summary: { type: "string" },
      changed_files: { type: "array", items: { type: "string" } },
      remaining_risks: { type: "array", items: { type: "string" } },
    },
  };
}

function parseSummary(text) {
  const source = String(text || "").trim();
  if (!source) return { summary: "Codex completed without a textual summary.", changed_files: [], remaining_risks: [] };
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object") {
      return {
        summary: bounded(parsed.summary || source, 4_000),
        changed_files: Array.isArray(parsed.changed_files) ? parsed.changed_files.map((entry) => bounded(entry, 500)).slice(0, 200) : [],
        remaining_risks: Array.isArray(parsed.remaining_risks) ? parsed.remaining_risks.map((entry) => bounded(entry, 1_000)).slice(0, 50) : [],
      };
    }
  } catch {
    // Some provider/model combinations may return unconstrained text.
  }
  return { summary: bounded(source, 4_000), changed_files: [], remaining_risks: [] };
}

export function reliableBuildSummary(structured, implementationText) {
  const candidate = bounded(structured?.summary, 4_000);
  const fallback = bounded(implementationText, 4_000);
  const looksTruncated = candidate.length < 24 || /[`*_(:;\[\{-]$/.test(candidate);
  return {
    ...structured,
    summary: fallback && looksTruncated ? fallback : candidate || fallback || "Codex completed without a textual summary.",
  };
}

function gitChangedFiles(cwd) {
  const tracked = runSyncProbe("git", ["diff", "--name-only", "HEAD", "--"], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
  });
  const untracked = runSyncProbe("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (tracked.status !== 0 || untracked.status !== 0) throw new Error("codex_cli_worktree_diff_failed");
  return [...new Set(`${tracked.stdout || ""}\n${untracked.stdout || ""}`
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean))]
    .sort()
    .slice(0, 500);
}

function structuredSummaryPrompt(implementationText, changedFiles) {
  return [
    "Return the required structured delivery summary. This is a read-only formatting step; do not call tools and do not claim unobserved changes.",
    `Host-observed changed files: ${JSON.stringify(changedFiles)}`,
    "Use that exact list for changed_files.",
    "Summarize only the implementation report below; if it is incomplete, record that fact in remaining_risks.",
    "",
    bounded(implementationText || "The implementation turn returned no final narrative.", 12_000),
  ].join("\n");
}

export class FunctionBuildExecutor {
  constructor(callback, options = {}) {
    if (typeof callback !== "function") throw new Error("FunctionBuildExecutor requires a callback");
    this.callback = callback;
    this.name = options.name || "function-build-executor";
  }

  async execute(input) {
    const started = Date.now();
    const value = await this.callback(input);
    return {
      schema: BUILD_EXECUTOR_RESULT_SCHEMA,
      executor: this.name,
      status: value?.status || "completed",
      summary: bounded(value?.summary || "Fixture executor completed."),
      changed_files: Array.isArray(value?.changed_files) ? value.changed_files.slice(0, 200) : [],
      remaining_risks: Array.isArray(value?.remaining_risks) ? value.remaining_risks.slice(0, 50) : [],
      duration_ms: Date.now() - started,
      runtime_version: value?.runtime_version || "fixture",
      thread_id: value?.thread_id || null,
      turn_id: value?.turn_id || null,
      tokens_used: Number.isSafeInteger(value?.tokens_used) ? value.tokens_used : 0,
      goal_enforcement: value?.goal_enforcement || "not-applicable",
      usage_status: value?.usage_status || (value?.thread_id && value?.turn_id ? "measured" : "not-applicable"),
    };
  }

  async probe() {
    return {
      backend: this.name,
      available: true,
      isolation: "caller-defined",
      runtimeVersion: "fixture",
      capabilities: { commandExec: true, threadStart: false, goal: false },
    };
  }

  close() {}
}

export class ManualBuildExecutor {
  constructor() {
    this.name = "manual-build";
  }

  async execute() {
    throw new ExecutionBackendError(
      "manual_build_required",
      "The approved contract selects manual implementation; Pritha cannot autonomously repair the failing Trials",
    );
  }

  async probe() {
    return {
      backend: this.name,
      available: true,
      isolation: "none",
      runtimeVersion: "manual",
      capabilities: { commandExec: false, threadStart: false, goal: false },
      error: "Manual build executor requires operator implementation.",
    };
  }

  close() {}
}

export class CodexCliBuildExecutor {
  constructor(options = {}) {
    this.name = "codex-cli-build";
    this.options = options;
    this.projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    this.runner = path.join(this.projectRoot, "scripts", "neuraldeep-codex.mjs");
    this.model = String(options.model || process.env.PRITHA_NEURALDEEP_MODEL || "qwen3.6-35b-a3b");
    this.effort = String(options.effort || "high");
  }

  environment() {
    const environment = { ...process.env, TECHSCOPE_ROOT: this.projectRoot };
    for (const key of Object.keys(environment)) {
      if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
    }
    return environment;
  }

  runtimeVersion() {
    const result = runSyncProbe(process.env.PRITHA_CODEX_BIN || "codex", ["--version"], { encoding: "utf8", timeout: 5_000 });
    return result.status === 0 ? String(result.stdout || "").trim() : "codex-cli/unknown";
  }

  async phase(input, phase, options) {
    await input.beforeDispatch?.({ phase });
    const attemptId = `nd_${randomUUID()}`;
    let receipt = {
      schema: BUILD_EXECUTOR_RESULT_SCHEMA, provider: "neuraldeep", executor: this.name,
      run_id: input.runId || null, attempt_id: attemptId, launcher_run_id: attemptId, phase,
      request_hash: createHash("sha256").update(JSON.stringify([options.prompt, this.model, this.effort, options.cwd, options.sandbox])).digest("hex"),
      status: "dispatching", usage_status: "unknown", tokens_used: null,
      goal_enforcement: "not-applicable", usage_source: "neuraldeep-provider-ledger",
      model_requested: this.model, effort_requested: this.effort, runtime_version: this.runtimeVersion(),
      token_budget: input.tokenBudget ?? null, started_at: new Date().toISOString(),
    };
    const checkpoint = async () => {
      if (input.onCheckpoint) await input.onCheckpoint(receipt);
      else {
        const root = input.stateRoot || process.env.PRITHA_STATE_ROOT;
        if (!root) throw new Error("neuraldeep_paid_attempt_requires_private_state");
        atomicWriteFile(path.join(root, "private", "neuraldeep", "delivery-receipts", `${attemptId}.json`), `${JSON.stringify(receipt)}\n`);
      }
    };
    // This checkpoint must finish before invoking a runner, including a capability probe.
    await checkpoint();
    try {
      const result = await this.run({ ...options, runId: attemptId });
      const measured = result.usageKnown !== false && Number.isSafeInteger(result.tokensUsed) && result.tokensUsed >= 0;
      receipt = { ...receipt, status: result.timedOut ? "interrupted" : result.code === 0 ? "completed" : "failed",
        thread_id: result.threadId || null, turn_id: null,
        usage_status: measured ? "measured" : "unknown", tokens_used: measured ? result.tokensUsed : null,
        process_exited: result.processExited !== false, finished_at: new Date().toISOString(),
        usage_ledger_recorded: result.usageLedgerRecorded ?? null };
      await checkpoint();
      return { ...result, receipt };
    } catch (error) {
      // A lost acknowledgement cannot authorize another paid attempt.
      receipt = { ...receipt, status: "uncertain", error_code: error.code || "runner_result_unavailable" };
      await checkpoint();
      throw error;
    }
  }

  async recover(input, saved) {
    if (saved.provider !== "neuraldeep" || saved.run_id !== input.runId || saved.attempt_id !== saved.launcher_run_id) throw new Error("neuraldeep_receipt_identity_mismatch");
    const root = input.stateRoot || process.env.PRITHA_STATE_ROOT;
    const store = new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(root, this.projectRoot));
    try {
      const runtime = store.runtimeRun(saved.launcher_run_id);
      if (!runtime?.process_exited) return saved;
      let accounting = runtime.usage_record;
      if (!runtime.usage_ledger_recorded && runtime.usage_event) {
        accounting = recordNeuralDeepRun(runtime.usage_event);
        store.updateRuntimeRun(saved.launcher_run_id, { usage_ledger_recorded: true, usage_record: accounting });
      }
      const usage = accounting?.usage;
      const measured = runtime.usage_status === "measured" && Number.isSafeInteger(usage?.totalTokens);
      return { ...saved, status: runtime.status, process_exited: true, thread_id: runtime.session_id || null,
        usage_status: measured ? "measured" : "unknown", tokens_used: measured ? usage.totalTokens : null };
    } finally { store.close(); }
  }

  run({ cwd, prompt, sandbox, timeoutMs, outputSchemaPath, outputPath, usageSource = "agent-mother", workloadId, runId }) {
    const args = [
      this.runner,
      "exec-json",
      "--model", this.model,
      "--effort", this.effort,
      "--sandbox", sandbox,
      "--cwd", cwd,
      "--network", "disabled",
      "--ephemeral",
      "--usage-source", usageSource,
      ...(runId ? ["--run-id", runId] : []),
      ...(workloadId ? ["--workload-id", String(workloadId)] : []),
      ...(outputSchemaPath ? ["--output-schema", outputSchemaPath] : []),
      ...(outputPath ? ["--output-last-message", outputPath] : []),
    ];
    const stdout = [];
    const stderr = [];
    const events = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd,
        env: this.environment(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let lineBuffer = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdoutBytes += Buffer.byteLength(chunk);
        if (stdoutBytes <= 4 * 1024 * 1024) stdout.push(chunk);
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() || "";
        for (const line of lines) {
          try { events.push(JSON.parse(line)); } catch { /* stdout is retained for evidence */ }
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderrBytes += Buffer.byteLength(chunk);
        if (stderrBytes <= 2 * 1024 * 1024) stderr.push(chunk);
      });
      child.stdin.end(prompt);
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 5_000).unref();
      }, timeoutMs);
      child.once("error", reject);
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        if (lineBuffer.trim()) {
          try { events.push(JSON.parse(lineBuffer)); } catch { /* retained below */ }
        }
        const finished = events.findLast((event) => event?.type === "pritha.run_finished");
        const usage = finished?.usage || null;
        const usageKnown = finished?.usage_known === true && finished?.usage_ledger_recorded === true
          && Number.isSafeInteger(usage?.inputTokens) && Number.isSafeInteger(usage?.outputTokens);
        const threadId = String(events.find((event) => event?.type === "thread.started")?.thread_id || "");
        const agentText = events
          .filter((event) => event?.type === "item.completed" && event?.item?.type === "agent_message")
          .map((event) => String(event.item.text || ""))
          .join("\n")
          .trim();
        resolve({
          code,
          signal,
          timedOut,
          durationMs: Date.now() - startedAt,
          stdout: stdout.join(""),
          stderr: stderr.join(""),
          events,
          threadId,
          agentText,
          tokensUsed: usageKnown ? usage.inputTokens + usage.outputTokens : null,
          usageKnown, usageLedgerRecorded: finished?.usage_ledger_recorded === true,
          processExited: finished?.process_exited === true,
        });
      });
    });
  }

  async probe(options = {}) {
    const cwd = worktreeRoot(options.cwd || options.worktree);
    const timeoutMs = Number.isSafeInteger(options.timeoutMs) ? Math.min(Math.max(options.timeoutMs, 20_000), 120_000) : 90_000;
    const temporary = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-cli-probe-"));
    const schemaPath = path.join(temporary, "output-schema.json");
    const outputPath = path.join(temporary, "last-message.json");
    writeFileSync(schemaPath, `${JSON.stringify(outputSchema())}\n`, { encoding: "utf8", mode: 0o600 });
    try {
      const toolResult = await this.phase(options, "probe-tools", {
        cwd,
        sandbox: "read-only",
        timeoutMs,
        prompt: "Use the shell tool once to run `/usr/bin/printf PRITHA_NEURALDEEP_TOOL_OK`, then answer exactly PRITHA_NEURALDEEP_TOOL_PHASE_OK. Do not answer before the command runs.",
        usageSource: "agent-mother",
        workloadId: "capability-probe-tools",
      });
      const commandCompleted = toolResult.events.some((event) => (
        event?.type === "item.completed"
        && event?.item?.type === "command_execution"
        && Number(event.item.exit_code) === 0
        && String(event.item.aggregated_output || "").includes("PRITHA_NEURALDEEP_TOOL_OK")
      ));
      const schemaResult = await this.phase(options, "probe-schema", {
        cwd,
        sandbox: "read-only",
        timeoutMs,
        outputSchemaPath: schemaPath,
        outputPath,
        prompt: "Return the required structured result with summary PRITHA_NEURALDEEP_PROBE_OK and empty changed_files and remaining_risks arrays. Do not call tools.",
        usageSource: "agent-mother",
        workloadId: "capability-probe-schema",
      });
      let structuredOutput = null;
      try {
        structuredOutput = JSON.parse(existsSync(outputPath) ? readFileSync(outputPath, "utf8") : schemaResult.agentText);
      } catch {
        structuredOutput = null;
      }
      const schemaCompleted = structuredOutput?.summary === "PRITHA_NEURALDEEP_PROBE_OK"
        && Array.isArray(structuredOutput?.changed_files)
        && Array.isArray(structuredOutput?.remaining_risks);
      const available = toolResult.code === 0 && schemaResult.code === 0 && commandCompleted && schemaCompleted;
      return {
        backend: this.name,
        provider: "neuraldeep",
        model: this.model,
        available,
        isolation: available ? "sandboxed" : "unavailable",
        runtimeVersion: this.runtimeVersion(),
        capabilities: {
          commandExec: commandCompleted,
          threadStart: Boolean(toolResult.threadId) && Boolean(schemaResult.threadId),
          goal: false,
          tools: commandCompleted,
          structuredOutput: schemaCompleted,
        },
        error: available ? null : bounded([
          "NeuralDeep model did not pass the two-phase tool + structured-output capability probe.",
          `tool_phase=${toolResult.code === 0 && commandCompleted ? "passed" : "failed"}`,
          `schema_phase=${schemaResult.code === 0 && schemaCompleted ? "passed" : "failed"}`,
          toolResult.stderr,
          schemaResult.stderr,
        ].filter(Boolean).join("\n"), 2_000),
      };
    } catch (error) {
      return {
        backend: this.name,
        provider: "neuraldeep",
        model: this.model,
        available: false,
        isolation: "unavailable",
        runtimeVersion: this.runtimeVersion(),
        capabilities: { commandExec: false, threadStart: false, goal: false, tools: false, structuredOutput: false },
        error: bounded(error instanceof Error ? error.message : String(error), 2_000),
      };
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  async execute(input) {
    const cwd = worktreeRoot(input.worktree);
    const timeoutMs = Number.isSafeInteger(input.timeoutMs) ? Math.min(Math.max(input.timeoutMs, 10_000), 3_600_000) : 900_000;
    const tokenBudget = Number(input.tokenBudget);
    if (!Number.isSafeInteger(tokenBudget) || tokenBudget < 1) {
      throw new ExecutionBackendError("token_budget_exhausted", "Build turn has no positive remaining token budget");
    }
    const temporary = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-cli-build-"));
    const schemaPath = path.join(temporary, "output-schema.json");
    const outputPath = path.join(temporary, "last-message.json");
    writeFileSync(schemaPath, `${JSON.stringify(outputSchema())}\n`, { encoding: "utf8", mode: 0o600 });
    try {
      const result = await this.phase(input, "build", {
        cwd,
        prompt: buildPrompt(input),
        sandbox: "workspace-write",
        timeoutMs,
        usageSource: "child-agent",
        workloadId: `${input.runId}-iteration-${input.iteration}`,
      });
      if (result.timedOut) throw new ExecutionBackendError("build_executor_timeout", "NeuralDeep Codex CLI build turn timed out");
      if (result.code !== 0) {
        throw new ExecutionBackendError("codex_cli_build_failed", bounded(result.stderr || `Codex CLI exited with ${result.code}`, 2_000));
      }
      const observedChangedFiles = gitChangedFiles(cwd);
      let summaryResult;
      try { summaryResult = await this.phase(input, "summary", {
        cwd,
        prompt: structuredSummaryPrompt(result.agentText, observedChangedFiles),
        sandbox: "read-only",
        timeoutMs: Math.min(timeoutMs, 180_000),
        outputSchemaPath: schemaPath,
        outputPath,
        usageSource: "agent-mother",
        workloadId: `${input.runId}-summary-${input.iteration}`,
      }); } catch (error) { summaryResult = { code: null, durationMs: 0, tokensUsed: null, error: error.code || "summary_unavailable" }; }
      const hasSummary = summaryResult.code === 0 && existsSync(outputPath);
      const summary = reliableBuildSummary(parseSummary(hasSummary ? readFileSync(outputPath, "utf8") : result.agentText), result.agentText);
      if (!hasSummary) summary.remaining_risks.push("Structured summary unavailable; host verification uses the preserved implementation and filesystem evidence.");
      const context = { projectRoot: cwd, stateRoot: input.stateRoot, root: input.root };
      return sanitized({
        schema: BUILD_EXECUTOR_RESULT_SCHEMA,
        executor: this.name,
        provider: "neuraldeep",
        model: this.model,
        status: "completed",
        ...summary,
        changed_files: observedChangedFiles,
        duration_ms: result.durationMs + summaryResult.durationMs,
        runtime_version: this.runtimeVersion(),
        thread_id: result.threadId || null,
        turn_id: null,
        usage_status: "not-applicable",
        receipt_kind: "iteration-summary",
        attempts: [result.receipt, summaryResult.receipt].filter(Boolean).map(entry => entry.attempt_id),
        token_budget: tokenBudget,
        tokens_used: Number.isSafeInteger(result.tokensUsed) && Number.isSafeInteger(summaryResult.tokensUsed) ? result.tokensUsed + summaryResult.tokensUsed : null,
        goal_enforcement: "not-applicable",
        goal_status: "host-budget-enforced",
      }, context);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  close() {}
}

export function createBuildExecutor(name = "codex-cli", options = {}) {
  if (name === "codex-cli" || name === "codex-app-server" || name === "app-server") return new CodexCliBuildExecutor(options);
  if (name === "manual") return new ManualBuildExecutor();
  throw new Error(`Unknown build executor: ${name}`);
}
