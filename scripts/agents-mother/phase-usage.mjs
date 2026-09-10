import { readNeuralDeepSessionUsage } from "../neuraldeep/usage-ledger.mjs";
import { neuralDeepRuntimeIdentity } from "../neuraldeep/runtime-identity.mjs";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile, withFileLock } from "../lib/atomic-file.mjs";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { readIdentityEvidence } from "./identity.mjs";
import { deliveryUsageStatus } from "./delivery-ledger.mjs";

export const PHASE_USAGE_SCHEMA = "pritha-phase-usage-v1";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const count = value => Number.isSafeInteger(value) && value >= 0;
const label = value => typeof value === "string" && value.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9 _.,;:/@()+-]*$/.test(value) ? value : null;
const nativeId = value => typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\x00-\x1f]/.test(value);
const terminal = new Set(["completed", "failed", "interrupted", "not-started"]);

function contextFor(options) {
  const root = path.resolve(options.root || resolveTechscopeRoot());
  return { root, stateRoot: resolvePrithaStateRoot({ ...options, root }) };
}

function assertPath(file, boundary) {
  const relative = path.relative(boundary, file);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("usage_path_outside_instance");
  for (let current = file; ; current = path.dirname(current)) {
    try { if (lstatSync(current).isSymbolicLink()) throw new Error("usage_path_symlink"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (current === boundary) break;
  }
}

function readReceipt(file, boundary) {
  const raw = readIdentityEvidence(file, boundary, 64_000);
  if (!raw) throw new Error("usage_receipt_unavailable");
  const value = JSON.parse(raw);
  if (value.schema !== PHASE_USAGE_SCHEMA || !value.identity || !value.scope) throw new Error("usage_receipt_invalid");
  if (value.scope === "parent-task-chat" && value.counterTotal !== null && !count(value.counterTotal)) throw new Error("usage_counter_invalid");
  if (value.scope === "trials" && (value.tokensUsed !== null || typeof value.terminalObserved !== "boolean" || !["unknown", "not-started"].includes(value.usageStatus))) throw new Error("usage_trial_receipt_invalid");
  return value;
}

function updateReceipt(file, boundary, identity, update) {
  assertPath(file, boundary);
  mkdirSync(path.dirname(file), { recursive: true });
  return withFileLock(file, () => {
    assertPath(file, boundary);
    const previous = existsSync(file) ? readReceipt(file, boundary) : null;
    if (previous && hash(previous.identity) !== hash(identity)) throw new Error("usage_identity_conflict");
    const next = update(previous);
    if (previous && hash(next) === hash(previous)) return previous;
    const now = new Date().toISOString();
    const receipt = { ...next, schema: PHASE_USAGE_SCHEMA, identity, createdAt: previous?.createdAt || now, updatedAt: now };
    atomicWriteFile(file, `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  });
}

function taskContext(task, options) {
  if (!nativeId(task?.nativeThreadId) || !nativeId(task?.stateIdentityHash)) throw new Error("usage_task_identity_invalid");
  const context = contextFor(options);
  // Physical native history may be visible through two provider aliases. Its
  // cumulative counter is still one counter, never an additive per-alias cost.
  const identity = { storageIdentity: task.stateIdentityHash, threadId: task.nativeThreadId };
  const parent = context.stateRoot === context.root ? path.join(context.root, ".private", "codex-chat") : path.join(context.stateRoot, "codex-chat");
  return { ...context, identity, directory: path.join(parent, "usage", hash(identity)) };
}

// Compatibility entry point: observations never create a second token counter.
export function recordParentUsage(task, _observation, options = {}) {
  return readParentUsage(task, options);
}

function receiptFiles(directory, boundary, limit = 5000) {
  if (!existsSync(directory)) return { files: [], truncated: false };
  assertPath(directory, boundary);
  const files = [];
  let truncated = false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if ((!entry.isFile() && !entry.isSymbolicLink()) || !/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
    if (files.length === limit) { truncated = true; break; }
    files.push(path.join(directory, entry.name));
  }
  return { files, truncated };
}

export function readParentUsage(task, options = {}) {
  const context = taskContext(task, options);
  const profile = neuralDeepRuntimeIdentity(context.stateRoot);
  let row = { observedTokens: null, measuredRuns: 0, unknownRuns: 0, legacyRuns: 0 }, issues = 0;
  try {
    if (task.providerId !== "neuraldeep_cli" || task.stateIdentityHash !== profile.stateIdentityHash) throw new Error("usage_profile_mismatch");
    row = readNeuralDeepSessionUsage({ stateRoot: context.stateRoot, profileIdentity: profile.profileIdentity, sessionId: task.nativeThreadId });
  } catch { issues++; }
  return { scope: "parent-task-chat", observedTokens: row.observedTokens,
    coverage: row.observedTokens === null ? "unknown" : "partial", allocation: "whole-native-thread-unallocated",
    counterSemantics: "provider-ledger-idempotent-run-deltas", observedTurns: row.measuredRuns,
    unknownAttempts: row.unknownRuns + row.legacyRuns, receiptIssues: issues, truncated: false,
    counterRegression: false, runtimeVersions: [], source: "neuraldeep-usage-ledger-v2" };
}

export function recordTrialUsage(runRoot, attempt, options = {}) {
  const context = contextFor(options);
  if (!nativeId(attempt?.attemptId) || !nativeId(attempt?.trialId) || !nativeId(attempt?.runId) || !/^sha256:[a-f0-9]{64}$/.test(attempt.planLock || "")) throw new Error("usage_trial_identity_invalid");
  const identity = { runId: attempt.runId, planLock: attempt.planLock, attemptId: attempt.attemptId, trialId: attempt.trialId };
  const file = path.join(path.resolve(runRoot), "usage-trials", `${hash(identity)}.json`);
  return updateReceipt(file, context.stateRoot, identity, previous => ({ ...previous, scope: "trials",
    backend: label(attempt.backend), runtimeVersion: label(attempt.runtimeVersion) || previous?.runtimeVersion || null, hostVersion: `node/${process.version}`,
    turnStatus: previous?.terminalObserved ? previous.turnStatus : label(attempt.status) || "unknown", tokensUsed: null,
    usageStatus: previous?.terminalObserved ? previous.usageStatus : attempt.status === "not-started" ? "not-started" : "unknown",
    usageSource: "command-model-usage-not-instrumented", commandHash: attempt.commandHash || previous?.commandHash || null,
    // An exited command proves command completion, never that all calls inside
    // that command were free or that a provider reported zero tokens.
    terminalObserved: previous?.terminalObserved === true || attempt.terminalObserved === true,
  }));
}

export function readTrialUsage(runRoot, state, options = {}) {
  const context = contextFor(options), rows = [], issues = [];
  let truncated = false;
  try {
    const found = receiptFiles(path.join(path.resolve(runRoot), "usage-trials"), context.stateRoot); truncated = found.truncated;
    const planText = readIdentityEvidence(path.join(path.resolve(runRoot), "trial-plan.json"), context.stateRoot, 5_000_000);
    let planLock = null;
    try { if (planText) planLock = `sha256:${hash(JSON.parse(planText))}`; } catch { /* Existing receipts remain unavailable without their exact plan. */ }
    for (const file of found.files) {
      try {
        const row = readReceipt(file, context.stateRoot);
        if (row.scope !== "trials" || row.identity.runId !== state.run_id || !planLock || row.identity.planLock !== planLock) throw new Error("usage_identity_conflict");
        rows.push(row);
      } catch { issues.push("receipt_unavailable"); }
    }
  } catch { issues.push("receipts_unavailable"); }
  return { scope: "trials", tokensUsed: null, coverage: rows.length ? "unknown" : "not-observed",
    attempts: rows.length, unknownAttempts: rows.filter(row => row.usageStatus !== "not-started").length,
    unconfirmedTerminals: rows.filter(row => !row.terminalObserved && row.usageStatus !== "not-started").length,
    receiptIssues: issues.length, truncated, legacyEvidenceUnaccounted: Boolean(state.last_trial_result) && rows.length === 0,
    runtimeVersions: [...new Set(rows.map(row => row.runtimeVersion).filter(Boolean))] };
}

export function readDeliveryUsage(runRoot, state, task, options = {}) {
  return { schema: "pritha-delivery-usage-view-v1", runId: state.run_id,
    build: { scope: "build-executor", tokensUsed: state.budget.tokens_used, coverage: deliveryUsageStatus(state.budget),
      measuredTurns: state.budget.accounted_turns.length, unknownAttempts: state.budget.unaccounted_attempts.length },
    parent: task ? readParentUsage(task, options) : { scope: "parent-task-chat", observedTokens: null, coverage: "unbound", allocation: "whole-native-thread-unallocated" },
    trials: readTrialUsage(runRoot, state, options), other: { scope: "other-phases", coverage: "not-instrumented", tokensUsed: null },
    totalTokens: null, totalStatus: "not-comparable-scopes", // no invented run total from a shared native thread and uninstrumented commands
  };
}
