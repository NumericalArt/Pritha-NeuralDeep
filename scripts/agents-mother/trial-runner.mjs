import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { createExecutionBackend, ExecutionBackendError } from "./execution-backends.mjs";
import { recordTrialUsage } from "./phase-usage.mjs";
import {
  outcomeDocumentLock,
  outcomeSemanticLock,
  TRIAL_PLAN_SCHEMA,
  validateOutcomeSpecText,
} from "./outcome-spec.mjs";
import { workspaceRevision, workspaceRevisionMatches } from "./workspace-revision.mjs";
import { hasAutomatedTrialWaiver } from "./automated-trial-waiver.mjs";
import { inspectProtectedTrialInputs, verifyProtectedTrialInputs, PROTECTED_TRIAL_INPUTS_SCHEMA } from "./delivery-worktree.mjs";

export const TRIAL_RESULT_SCHEMA = "pritha-trial-result-v1";
const MAX_PLAN_BYTES = 5 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;

function sha256(value) {
  const input = value instanceof Uint8Array ? value : String(value);
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function safeRelativePath(value, { allowDot = false } = {}) {
  const source = String(value || "").trim().replaceAll("\\", "/");
  if (allowDot && source === ".") return true;
  if (!source || source.includes("\0") || path.posix.isAbsolute(source)) return false;
  return source.split("/").every((part) => part && part !== "." && part !== "..");
}

function projectRootFor(value) {
  const requested = path.resolve(String(value || ""));
  if (!existsSync(requested)) throw new Error("Trial project does not exist");
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Trial project must be a regular directory, not a symlink");
  return realpathSync(requested);
}

function projectPath(projectRoot, relativePath, options = {}) {
  if (!safeRelativePath(relativePath, { allowDot: options.allowDot })) {
    throw new Error("Path must be project-relative and may not contain traversal segments");
  }
  const parts = relativePath === "." ? [] : String(relativePath).replaceAll("\\", "/").split("/");
  let current = projectRoot;
  for (const part of parts) {
    current = path.join(current, part);
    if (!existsSync(current)) break;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("Symlinks are not accepted in Trial paths");
  }
  const resolved = path.resolve(projectRoot, ...parts);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Trial path escapes the project root");
  return resolved;
}

function boundedArtifactText(projectRoot, relativePath, maxBytes = MAX_ARTIFACT_BYTES) {
  const fullPath = projectPath(projectRoot, relativePath);
  if (!existsSync(fullPath)) throw new Error("Expected artifact does not exist");
  const stat = lstatSync(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Artifact content assertion requires a regular file");
  if (stat.size > maxBytes) throw new Error(`Artifact exceeds the ${maxBytes}-byte evidence limit`);
  return readFileSync(fullPath, "utf8");
}

function loadPlan(value) {
  if (typeof value === "string") {
    const text = readFileSync(path.resolve(value), "utf8");
    return {
      plan: parseBoundedJson(text, { maxBytes: MAX_PLAN_BYTES, maxDepth: 16, maxNodes: 50_000 }),
      planPath: path.resolve(value),
    };
  }
  return { plan: value, planPath: null };
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || plan.schema !== TRIAL_PLAN_SCHEMA) throw new Error("Unsupported Trial plan schema");
  if (!Array.isArray(plan.trials) || plan.trials.length === 0 || plan.trials.length > 500) throw new Error("Trial plan requires a bounded non-empty trials array");
  for (const trial of plan.trials) {
    if (!trial || typeof trial !== "object" || !/^[a-z0-9][a-z0-9-]*$/.test(String(trial.id || ""))) throw new Error("Trial plan contains an invalid Trial id");
    if (!new Set(["automated", "operator-judged"]).has(trial.kind)) throw new Error(`Trial ${trial.id} has an unsupported kind`);
  }
  return plan;
}

function assertion(type, expected, passed, message = "") {
  return { type, expected, passed: Boolean(passed), message };
}

function textAssertions(result, trial) {
  const checks = [];
  checks.push(assertion("exit_code", trial.thenExitCode, result.exitCode === trial.thenExitCode, `received ${result.exitCode}`));
  for (const expected of trial.thenStdoutContains || []) {
    checks.push(assertion("stdout_contains", expected, result.stdout.includes(expected), "expected text was not found"));
  }
  for (const expected of trial.thenStdoutExcludes || []) {
    checks.push(assertion("stdout_excludes", expected, !result.stdout.includes(expected), "forbidden text was found"));
  }
  for (const expected of trial.thenStderrContains || []) {
    checks.push(assertion("stderr_contains", expected, result.stderr.includes(expected), "expected text was not found"));
  }
  for (const expected of trial.thenStderrExcludes || []) {
    checks.push(assertion("stderr_excludes", expected, !result.stderr.includes(expected), "forbidden text was found"));
  }
  if (trial.thenMinStdoutChars !== null && trial.thenMinStdoutChars !== undefined) {
    checks.push(assertion("min_stdout_chars", trial.thenMinStdoutChars, result.stdout.length >= trial.thenMinStdoutChars, `received ${result.stdout.length}`));
  }
  if (trial.thenMaxDurationMs !== null && trial.thenMaxDurationMs !== undefined) {
    checks.push(assertion("max_duration_ms", trial.thenMaxDurationMs, result.durationMs <= trial.thenMaxDurationMs, `received ${result.durationMs}`));
  }
  checks.push(assertion("not_timed_out", true, !result.timedOut, result.timedOut ? "command timed out" : ""));
  return checks;
}

function fileAssertions(projectRoot, trial, maxArtifactBytes) {
  const checks = [];
  for (const expected of trial.thenArtifacts || []) {
    try {
      const fullPath = projectPath(projectRoot, expected);
      const present = existsSync(fullPath) && !lstatSync(fullPath).isSymbolicLink();
      checks.push(assertion("artifact_exists", expected, present, present ? "" : "artifact does not exist"));
    } catch (error) {
      checks.push(assertion("artifact_exists", expected, false, error.message));
    }
  }
  for (const expected of trial.thenArtifactContains || []) {
    try {
      const text = boundedArtifactText(projectRoot, expected.path, maxArtifactBytes);
      checks.push(assertion("artifact_contains", expected, text.includes(expected.contains), "expected text was not found"));
    } catch (error) {
      checks.push(assertion("artifact_contains", expected, false, error.message));
    }
  }
  for (const expected of trial.thenAbsentPaths || []) {
    try {
      const fullPath = projectPath(projectRoot, expected);
      checks.push(assertion("path_absent", expected, !existsSync(fullPath), "forbidden path exists"));
    } catch (error) {
      checks.push(assertion("path_absent", expected, false, error.message));
    }
  }
  return checks;
}

function artifactEvidencePaths(trial) {
  const paths = new Map();
  const add = (relativePath, role) => {
    if (!relativePath) return;
    const roles = paths.get(relativePath) || new Set();
    roles.add(role);
    paths.set(relativePath, roles);
  };
  add(trial.fixture, "fixture");
  for (const relativePath of trial.thenArtifacts || []) add(relativePath, "exists");
  for (const expected of trial.thenArtifactContains || []) add(expected.path, "contains");
  for (const relativePath of trial.thenAbsentPaths || []) add(relativePath, "absent");
  return [...paths.entries()]
    .map(([relativePath, roles]) => ({ path: relativePath, roles: [...roles].sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function artifactSnapshot(projectRoot, entry, maxArtifactBytes) {
  try {
    const fullPath = projectPath(projectRoot, entry.path);
    if (!existsSync(fullPath)) return { ...entry, state: "absent" };
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) return { ...entry, state: "symlink" };
    if (stat.isDirectory()) return { ...entry, state: "directory" };
    if (!stat.isFile()) return { ...entry, state: "other", size: stat.size };
    const contentSensitive = entry.roles.includes("contains") || entry.roles.includes("fixture");
    if (!contentSensitive) return { ...entry, state: "file", size: stat.size };
    if (stat.size > maxArtifactBytes) return { ...entry, state: "file-too-large", size: stat.size };
    return {
      ...entry,
      state: "file",
      size: stat.size,
      content_hash: sha256(readFileSync(fullPath)),
    };
  } catch (error) {
    return { ...entry, state: "invalid", error: error instanceof Error ? error.message : String(error) };
  }
}

function trialArtifactEvidence(projectRoot, trial, maxArtifactBytes) {
  return artifactEvidencePaths(trial).map((entry) => artifactSnapshot(projectRoot, entry, maxArtifactBytes));
}

function sanitizeEvidence(value, context) {
  if (typeof value === "string") return redactFilesystemPaths(value, context);
  if (Array.isArray(value)) return value.map((entry) => sanitizeEvidence(entry, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeEvidence(entry, context)]));
  }
  return value;
}

function trialError(error, context) {
  return {
    code: error instanceof ExecutionBackendError ? error.code : "trial_execution_error",
    message: sanitizeEvidence(error instanceof Error ? error.message : String(error), context),
  };
}

async function runAutomatedTrial(trial, context) {
  const cwd = projectPath(context.projectRoot, trial.cwd || ".", { allowDot: true });
  const fixtureChecks = [];
  if (trial.fixture) {
    try {
      const fixturePath = projectPath(context.projectRoot, trial.fixture);
      fixtureChecks.push(assertion("fixture_exists", trial.fixture, existsSync(fixturePath), "fixture does not exist"));
    } catch (error) {
      fixtureChecks.push(assertion("fixture_exists", trial.fixture, false, error.message));
    }
  }
  if (fixtureChecks.some((entry) => !entry.passed)) {
    return {
      id: trial.id,
      kind: trial.kind,
      status: "failed",
      assertions: fixtureChecks,
      artifact_evidence: trialArtifactEvidence(context.projectRoot, trial, context.maxArtifactBytes),
      execution: null,
      error: null,
    };
  }

  let dispatched = false;
  const recordUsage = (status, execution = null) => {
    if (!context.usage?.runRoot) return;
    try {
      recordTrialUsage(context.usage.runRoot, { ...context.usage, trialId: trial.id, status,
        backend: context.backend.name, runtimeVersion: execution?.runtimeVersion || context.probe?.runtimeVersion,
        commandHash: sha256(JSON.stringify([trial.argv, trial.cwd || ".", trial.timeoutMs, trial.isolation])),
        terminalObserved: execution != null && Number.isInteger(execution.exitCode) }, context.usage.options);
    } catch {
      if (status === "dispatching") throw new ExecutionBackendError("trial_receipt_unavailable", "The host could not persist the Trial intent before execution");
      // A failed terminal write leaves the durable dispatch receipt unresolved.
    }
  };
  try {
    if (trial.isolation === "sandbox" && (
      context.probe?.available !== true
      || context.probe?.isolation !== "sandboxed"
      || context.probe?.capabilities?.sandbox !== true
    )) {
      throw new ExecutionBackendError("isolation_unavailable", "Backend probe did not confirm required sandbox isolation");
    }
    recordUsage("dispatching");
    dispatched = true;
    const execution = await context.backend.execute({
      argv: trial.argv,
      cwd,
      timeoutMs: trial.timeoutMs,
      outputBytesCap: context.outputBytesCap,
      sandbox: trial.isolation === "sandbox"
        ? { required: true, type: "workspaceWrite", writableRoots: [context.projectRoot], networkAccess: false }
        : { required: false, type: "none", writableRoots: [], networkAccess: false },
    });
    recordUsage("completed", execution);
    if (trial.isolation === "sandbox" && execution.isolation !== "sandboxed") {
      throw new ExecutionBackendError("isolation_unavailable", "Backend did not prove the required sandbox isolation");
    }
    const assertions = [
      ...fixtureChecks,
      ...textAssertions(execution, trial),
      ...fileAssertions(context.projectRoot, trial, context.maxArtifactBytes),
    ];
    const status = assertions.every((entry) => entry.passed) ? "passed" : "failed";
    return {
      id: trial.id,
      kind: trial.kind,
      covers: trial.covers || [],
      status,
      assertions: sanitizeEvidence(assertions, context.redaction),
      artifact_evidence: trialArtifactEvidence(context.projectRoot, trial, context.maxArtifactBytes),
      execution: sanitizeEvidence(execution, context.redaction),
      error: null,
    };
  } catch (error) {
    if (error.code === "trial_receipt_unavailable") throw error;
    recordUsage(dispatched ? "unknown" : "not-started");
    return {
      id: trial.id,
      kind: trial.kind,
      covers: trial.covers || [],
      status: "failed",
      assertions: sanitizeEvidence(fixtureChecks, context.redaction),
      artifact_evidence: trialArtifactEvidence(context.projectRoot, trial, context.maxArtifactBytes),
      execution: null,
      error: trialError(error, context.redaction),
    };
  }
}

function evidenceProjection(result) {
  const { started_at: _startedAt, finished_at: _finishedAt, evidence_lock: _evidenceLock, ...projection } = result;
  return projection;
}

export function verifyTrialResultIntegrity(result) {
  return result?.schema === TRIAL_RESULT_SCHEMA && sha256(JSON.stringify(evidenceProjection(result))) === result.evidence_lock;
}

export async function runTrialPlan(planOrPath, options = {}) {
  const loaded = loadPlan(planOrPath);
  const plan = validatePlan(loaded.plan);
  const projectRoot = projectRootFor(options.projectPath);
  const protectedInputs = plan.trials.some(trial => trial.verifierInputs || trial.productTargets)
    ? { schema: PROTECTED_TRIAL_INPUTS_SCHEMA, entries: inspectProtectedTrialInputs(plan, projectRoot) } : null;
  const backend = typeof options.backend === "object" && options.backend
    ? options.backend
    : createExecutionBackend(options.backend || "local", { cwd: projectRoot, codexBin: options.codexBin });
  const before = workspaceRevision(projectRoot, options.workspaceRevisionOptions);
  const startedAt = new Date().toISOString();
  const usage = { runRoot: options.runRoot || (loaded.planPath ? path.dirname(loaded.planPath) : null),
    runId: options.runId || path.basename(options.runRoot || (loaded.planPath ? path.dirname(loaded.planPath) : "unbound")),
    attemptId: randomUUID(), planLock: sha256(JSON.stringify(plan)), options: { root: options.root, stateRoot: options.stateRoot } };
  const trials = [];
  const redaction = { projectRoot, stateRoot: options.stateRoot, root: options.root };
  let runtimeProbe;
  try {
    runtimeProbe = typeof backend.probe === "function"
      ? await backend.probe({ timeoutMs: options.probeTimeoutMs })
      : {
          backend: backend.name || "custom-trial-backend",
          available: true,
          isolation: "unknown",
          runtimeVersion: "unknown",
          capabilities: { structuredArgv: true, commandExec: "unknown", sandbox: false },
        };
    for (const trial of plan.trials) {
      if (trial.kind === "operator-judged") {
        trials.push({
          id: trial.id,
          kind: trial.kind,
          covers: trial.covers || [],
          status: "awaiting-operator",
          pass_criteria: sanitizeEvidence(trial.passCriteria, redaction),
          assertions: [],
          artifact_evidence: [],
          execution: null,
          error: null,
        });
      } else {
        trials.push(await runAutomatedTrial(trial, {
          projectRoot,
          backend,
          probe: runtimeProbe,
          outputBytesCap: options.outputBytesCap || 1_048_576,
          maxArtifactBytes: options.maxArtifactBytes || MAX_ARTIFACT_BYTES,
          redaction,
          usage,
        }));
      }
    }
  } finally {
    if (options.closeBackend !== false) backend.close?.();
  }
  const after = workspaceRevision(projectRoot, options.workspaceRevisionOptions);
  if (protectedInputs && !verifyProtectedTrialInputs(protectedInputs, projectRoot).ok) {
    throw new Error("Protected Trial inputs changed during verification");
  }
  const automated = trials.filter((entry) => entry.kind === "automated");
  const operator = trials.filter((entry) => entry.kind === "operator-judged");
  const failed = automated.filter((entry) => entry.status !== "passed");
  const verificationStatus = failed.length > 0 ? "failed"
    : operator.length > 0 || automated.length === 0 || plan.autonomous_verification_allowed === false || hasAutomatedTrialWaiver(plan.automated_trial_waiver)
      ? "awaiting_acceptance" : "verified";
  const result = {
    schema: TRIAL_RESULT_SCHEMA,
    spec_id: plan.spec_id,
    spec_path: plan.spec_path,
    agent_slug: plan.agent_slug,
    contract_fingerprint: plan.contract_fingerprint,
    semantic_lock: plan.semantic_lock,
    document_lock: plan.document_lock,
    approval_id: plan.approval_id,
    plan_lock: sha256(JSON.stringify(plan)),
    verification_status: verificationStatus,
    counts: {
      trials: trials.length,
      automated: automated.length,
      passed: automated.length - failed.length,
      failed: failed.length,
      operator_judged: operator.length,
      awaiting_operator: operator.filter((entry) => entry.status === "awaiting-operator").length,
    },
    workspace_before: before,
    workspace_after: after,
    workspace_changed_during_trials: !workspaceRevisionMatches(before, after),
    runtime_probe: sanitizeEvidence(runtimeProbe, redaction),
    trials,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    evidence_lock: "pending",
  };
  result.evidence_lock = sha256(JSON.stringify(evidenceProjection(result)));

  const runRoot = options.runRoot || (loaded.planPath ? path.dirname(loaded.planPath) : null);
  let resultPath = null;
  if (runRoot) {
    mkdirSync(runRoot, { recursive: true });
    resultPath = path.join(runRoot, "trial-result.json");
    atomicWriteFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  return { result, resultPath, projectRoot };
}

export function verifyTrialResultFreshness(resultOrPath, projectPathValue, options = {}) {
  const result = typeof resultOrPath === "string"
    ? parseBoundedJson(readFileSync(path.resolve(resultOrPath), "utf8"), { maxBytes: 20 * 1024 * 1024, maxDepth: 32, maxNodes: 100_000 })
    : resultOrPath;
  if (!result || result.schema !== TRIAL_RESULT_SCHEMA) return { ok: false, reason: "unsupported_result_schema", current: null };
  if (!verifyTrialResultIntegrity(result)) return { ok: false, reason: "evidence_lock_mismatch", current: null };
  if (options.outcomeSpecPath) {
    try {
      const root = path.resolve(options.root || process.cwd());
      const specPath = path.isAbsolute(options.outcomeSpecPath)
        ? path.resolve(options.outcomeSpecPath)
        : path.resolve(root, options.outcomeSpecPath);
      if (!existsSync(specPath)) return { ok: false, reason: "outcome_spec_changed", current: null, detail: "spec_missing" };
      const text = readFileSync(specPath, "utf8");
      const validation = validateOutcomeSpecText(text, { root });
      const fm = validation.parsed.frontmatter;
      const currentBinding = {
        spec_id: String(fm.id || ""),
        contract_fingerprint: String(validation.contract?.fingerprint || fm.contract_fingerprint || ""),
        semantic_lock: outcomeSemanticLock(validation.parsed),
        document_lock: outcomeDocumentLock(text),
        status: String(fm.status || ""),
      };
      const bindingMatches = validation.ok
        && currentBinding.status === "approved"
        && currentBinding.spec_id === result.spec_id
        && currentBinding.contract_fingerprint === result.contract_fingerprint
        && currentBinding.semantic_lock === result.semantic_lock
        && currentBinding.document_lock === result.document_lock;
      if (!bindingMatches) {
        return { ok: false, reason: "outcome_spec_changed", current: null, detail: "binding_mismatch" };
      }
    } catch {
      return { ok: false, reason: "outcome_spec_changed", current: null, detail: "spec_invalid" };
    }
  }
  const projectRoot = projectRootFor(projectPathValue);
  const maxArtifactBytes = options.maxArtifactBytes || MAX_ARTIFACT_BYTES;
  for (const trial of result.trials || []) {
    for (const expected of trial.artifact_evidence || []) {
      const currentArtifact = artifactSnapshot(projectRoot, { path: expected.path, roles: expected.roles || [] }, maxArtifactBytes);
      if (JSON.stringify(currentArtifact) !== JSON.stringify(expected)) {
        return { ok: false, reason: "asserted_artifact_changed", current: null, artifact: expected.path };
      }
    }
  }
  const current = workspaceRevision(projectRoot, options.workspaceRevisionOptions);
  if (!workspaceRevisionMatches(result.workspace_after, current)) return { ok: false, reason: "workspace_revision_changed", current };
  return { ok: true, reason: "fresh", current };
}
