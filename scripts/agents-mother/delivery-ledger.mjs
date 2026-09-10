import { randomUUID } from "node:crypto";
import { sha256Text as sha256 } from "../lib/hash.mjs";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { atomicWriteFile, withFileLock } from "../lib/atomic-file.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";
import { redactFilesystemPaths } from "../lib/redaction.mjs";

export const DELIVERY_LEDGER_SCHEMA = "pritha-delivery-ledger-v2";
export const LEGACY_DELIVERY_LEDGER_SCHEMA = "pritha-delivery-ledger-v1";
export const DELIVERY_EVENT_SCHEMA = "pritha-delivery-event-v1";
export const DELIVERY_TARGET_CLAIM_SCHEMA = "pritha-delivery-target-claim-v1";

export const DELIVERY_TERMINAL_STATUSES = new Set([
  "verified",
  "awaiting_acceptance",
  "accepted",
  "failed",
  "abandoned",
  "cancelled",
]);
export const DELIVERY_ACTIVE_STATUSES = new Set([
  "created",
  "preparing",
  "building",
  "verifying",
  "correcting",
  "paused",
  "blocked",
]);
export const DELIVERY_STATUSES = new Set([...DELIVERY_ACTIVE_STATUSES, ...DELIVERY_TERMINAL_STATUSES]);

const ALLOWED_TRANSITIONS = new Map([
  ["created", new Set(["preparing", "blocked", "failed", "cancelled"])],
  ["preparing", new Set(["building", "verifying", "blocked", "failed", "cancelled"])],
  ["building", new Set(["verifying", "blocked", "failed", "cancelled"])],
  ["verifying", new Set(["verified", "awaiting_acceptance", "building", "correcting", "blocked", "failed", "cancelled"])],
  ["correcting", new Set(["preparing", "building", "verifying", "blocked", "failed", "cancelled"])],
  ["paused", new Set(["preparing", "building", "verifying", "correcting", "blocked", "cancelled", "abandoned"])],
  ["blocked", new Set(["preparing", "building", "verifying", "correcting", "cancelled", "abandoned"])],
  ["verified", new Set(["accepted", "awaiting_acceptance", "correcting"])],
  ["awaiting_acceptance", new Set(["accepted", "correcting", "cancelled", "abandoned"])],
  ["failed", new Set(["correcting", "cancelled", "abandoned"])],
  ["accepted", new Set()],
  ["abandoned", new Set()],
  ["cancelled", new Set()],
]);

function boundedText(value, name, maximum = 2_000) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  if (text.length > maximum) throw new Error(`${name} exceeds ${maximum} characters`);
  return text;
}

function safeIdentifier(value, name) {
  const text = boundedText(value, name, 128);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(text)) throw new Error(`${name} contains unsupported characters`);
  return text;
}

function normalizeEvidenceRefs(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("blocker evidence_refs must be a bounded array");
  return value.map((entry) => boundedText(entry, "blocker evidence reference", 500));
}

export function typedBlocker(value = {}) {
  const code = safeIdentifier(value.code, "blocker code").toLowerCase();
  const summary = boundedText(value.summary, "blocker summary", 1_000);
  const question = boundedText(value.question, "blocker question", 1_000);
  if (!question.endsWith("?")) throw new Error("blocker question must be an explicit question ending in ?");
  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 5) {
    throw new Error("blocker requires 2 to 5 bounded answer options");
  }
  const optionIds = new Set();
  const options = value.options.map((entry) => {
    const id = safeIdentifier(entry?.id, "blocker option id").toLowerCase();
    if (optionIds.has(id)) throw new Error("blocker option ids must be unique");
    optionIds.add(id);
    return {
      id,
      label: boundedText(entry?.label, "blocker option label", 160),
      effect: boundedText(entry?.effect, "blocker option effect", 600),
    };
  });
  return { code, summary, question, options, evidence_refs: normalizeEvidenceRefs(value.evidence_refs || []) };
}

export function normalizeDeliveryLedger(value) {
  if (!value || typeof value !== "object") return value;
  if (![DELIVERY_LEDGER_SCHEMA, LEGACY_DELIVERY_LEDGER_SCHEMA].includes(value.schema)) return value;
  const budget = value.budget && typeof value.budget === "object" ? value.budget : {};
  return {
    ...value,
    schema: DELIVERY_LEDGER_SCHEMA,
    runtime_probes: Array.isArray(value.runtime_probes) ? value.runtime_probes : [],
    budget: {
      ...budget,
      max_tokens: budget.max_tokens === undefined ? 1_000_000 : budget.max_tokens,
      tokens_used: budget.tokens_used === undefined ? 0 : budget.tokens_used,
      token_budget_source: String(budget.token_budget_source || "legacy-default"),
      goal_enforcement: String(budget.goal_enforcement || "required"),
      accounted_turns: budget.accounted_turns === undefined ? [] : budget.accounted_turns,
      goal_waiver: budget.goal_waiver || null,
      accounting_version: budget.accounting_version ?? 1,
      usage_scope: budget.usage_scope ?? "build-executor",
      legacy_usage_unverified: budget.legacy_usage_unverified ?? (budget.accounting_version === undefined),
      unaccounted_attempts: budget.unaccounted_attempts ?? [],
      amendments: budget.amendments ?? [],
    },
  };
}

export function validateDeliveryLedger(input) {
  const value = normalizeDeliveryLedger(input);
  const issues = [];
  if (!value || typeof value !== "object" || value.schema !== DELIVERY_LEDGER_SCHEMA) issues.push("unsupported ledger schema");
  if (!DELIVERY_STATUSES.has(value?.status)) issues.push("unsupported delivery status");
  if (!Number.isSafeInteger(value?.version) || value.version < 1) issues.push("ledger version must be a positive integer");
  if (!value?.run_id || !value?.agent_slug || !value?.target_key) issues.push("run_id, agent_slug and target_key are required");
  if (value?.source_project !== undefined && (typeof value.source_project !== "string" || !path.isAbsolute(value.source_project))) {
    issues.push("source_project must be an absolute path when present");
  }
  const hasNextAction = typeof value?.next_action === "string" && value.next_action.trim().length > 0;
  const blockers = Array.isArray(value?.blockers) ? value.blockers : [];
  const hasBlockers = blockers.length > 0;
  if (DELIVERY_ACTIVE_STATUSES.has(value?.status)) {
    if (hasNextAction === hasBlockers) issues.push("active ledger must contain exactly one of next_action or blockers");
    if (value.status === "blocked" && !hasBlockers) issues.push("blocked status requires blockers");
    if (value.status !== "blocked" && hasBlockers) issues.push("only blocked status may carry blockers");
  } else if (hasNextAction || hasBlockers) {
    issues.push("terminal ledger may not carry next_action or blockers");
  }
  for (const blocker of blockers) {
    try {
      typedBlocker(blocker);
    } catch (error) {
      issues.push(error.message);
    }
  }
  if (!value?.budget || !Number.isSafeInteger(value.budget.max_iterations) || value.budget.max_iterations < 1) issues.push("budget.max_iterations must be positive");
  if (!Number.isSafeInteger(value?.budget?.max_elapsed_ms) || value.budget.max_elapsed_ms < 1) issues.push("budget.max_elapsed_ms must be positive");
  if (!Number.isSafeInteger(value?.budget?.repeated_failure_threshold) || value.budget.repeated_failure_threshold < 2) issues.push("budget.repeated_failure_threshold must be at least 2");
  if (!Number.isSafeInteger(value?.budget?.max_tokens) || value.budget.max_tokens < 1) issues.push("budget.max_tokens must be a positive safe integer");
  if (!Number.isSafeInteger(value?.budget?.tokens_used) || value.budget.tokens_used < 0) issues.push("budget.tokens_used must be a non-negative safe integer");
  // A budget bounds future dispatch, not the observations the ledger may retain.
  if (!new Set(["required", "waived-once", "not-applicable"]).has(value?.budget?.goal_enforcement)) issues.push("budget.goal_enforcement is invalid");
  if (!Array.isArray(value?.budget?.accounted_turns)) issues.push("budget.accounted_turns must be an array");
  const accountedTurns = Array.isArray(value?.budget?.accounted_turns) ? value.budget.accounted_turns : [];
  const turnKeys = accountedTurns.map((entry) => entry?.key).filter(Boolean);
  if (new Set(turnKeys).size !== turnKeys.length) issues.push("budget.accounted_turns keys must be unique");
  const accountedTokenTotal = accountedTurns.reduce((total, entry) => {
    if (
      typeof entry?.key !== "string"
      || !entry.key
      || !(entry?.attempt_id && entry?.launcher_run_id === entry.attempt_id
        && entry.key === `neuraldeep:${entry.attempt_id}`
        || typeof entry?.thread_id === "string" && entry.thread_id
        && typeof entry?.turn_id === "string" && entry.turn_id)
      || !Number.isSafeInteger(entry?.tokens_used)
      || entry.tokens_used < 0
    ) {
      issues.push("budget.accounted_turns entries must contain a key, thread, turn and non-negative safe token count");
      return total;
    }
    return total + entry.tokens_used;
  }, 0);
  if (!Number.isSafeInteger(accountedTokenTotal)) issues.push("accounted token total exceeds safe integer range");
  if (accountedTokenTotal !== value?.budget?.tokens_used) {
    issues.push("budget.tokens_used must equal the sum of accounted turns");
  }
  if (value?.budget?.accounting_version !== 1 || value?.budget?.usage_scope !== "build-executor") issues.push("unsupported build accounting contract");
  if (typeof value?.budget?.legacy_usage_unverified !== "boolean") issues.push("legacy usage marker must be boolean");
  const unresolved = value?.budget?.unaccounted_attempts;
  if (!Array.isArray(unresolved) || unresolved.some((entry) => typeof entry?.executor_result !== "string" || !entry.executor_result || typeof entry?.reason !== "string" || !entry.reason)) {
    issues.push("unaccounted attempts must identify their executor receipt and reason");
  } else if (new Set(unresolved.map((entry) => entry.executor_result)).size !== unresolved.length) {
    issues.push("unaccounted attempt receipts must be unique");
  }
  const amendments = value?.budget?.amendments;
  if (!Array.isArray(amendments) || amendments.some(entry => !entry?.request_id || entry.approved_by !== "user" || !entry.request_hash)) {
    issues.push("budget amendments must contain user authorization and a request identity");
  } else if (new Set(amendments.map(entry => entry.request_id)).size !== amendments.length) issues.push("budget amendment request ids must be unique");
  return { ok: issues.length === 0, issues };
}

function assertValidLedger(value) {
  const normalized = normalizeDeliveryLedger(value);
  const result = validateDeliveryLedger(normalized);
  if (!result.ok) throw new Error(`Invalid delivery ledger: ${result.issues.join("; ")}`);
  return normalized;
}

export function deliveryLedgerPaths(runRoot) {
  const root = path.resolve(runRoot);
  return { runRoot: root, statePath: path.join(root, "build-state.json"), eventsPath: path.join(root, "events.jsonl") };
}

function appendEvent(paths, event) {
  appendFileSync(paths.eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
}

function eventFor(state, type, payload = {}) {
  return {
    schema: DELIVERY_EVENT_SCHEMA,
    event_id: randomUUID(),
    sequence: state.version,
    run_id: state.run_id,
    type: safeIdentifier(type, "event type").toLowerCase(),
    occurred_at: state.updated_at,
    payload,
    state,
  };
}

export function targetKey(projectPath) {
  const resolved = path.resolve(projectPath);
  let canonical = resolved;
  try {
    canonical = realpathSync(resolved);
  } catch {
    // A missing target is still identified by its normalized absolute path.
  }
  return sha256(canonical);
}

export function createDeliveryLedger(runRoot, input = {}) {
  const paths = deliveryLedgerPaths(runRoot);
  mkdirSync(paths.runRoot, { recursive: true });
  if (existsSync(paths.statePath)) throw new Error(`Delivery ledger already exists for run ${input.runId || "unknown"}`);
  const now = input.createdAt || new Date().toISOString();
  const state = assertValidLedger({
    schema: DELIVERY_LEDGER_SCHEMA,
    version: 1,
    run_id: safeIdentifier(input.runId, "run id"),
    agent_slug: safeIdentifier(input.agentSlug, "agent slug").toLowerCase(),
    target_key: boundedText(input.targetKey, "target key", 128),
    target_label: boundedText(input.targetLabel || input.agentSlug, "target label", 256),
    source_project: input.sourceProject ? path.resolve(input.sourceProject) : undefined,
    status: "created",
    phase: "created",
    spec: {
      id: boundedText(input.spec?.id, "spec id", 256),
      semantic_lock: boundedText(input.spec?.semanticLock, "semantic lock", 128),
      document_lock: boundedText(input.spec?.documentLock, "document lock", 128),
      contract_fingerprint: boundedText(input.spec?.contractFingerprint, "contract fingerprint", 128),
      approval_id: boundedText(input.spec?.approvalId, "approval id", 256),
    },
    budget: {
      max_iterations: Number.isSafeInteger(input.budget?.maxIterations) ? input.budget.maxIterations : 6,
      max_elapsed_ms: Number.isSafeInteger(input.budget?.maxElapsedMs) ? input.budget.maxElapsedMs : 90 * 60 * 1_000,
      repeated_failure_threshold: Number.isSafeInteger(input.budget?.repeatedFailureThreshold) ? input.budget.repeatedFailureThreshold : 3,
      max_tokens: Number.isSafeInteger(input.budget?.maxTokens) ? input.budget.maxTokens : 1_000_000,
      tokens_used: 0,
      token_budget_source: input.budget?.tokenBudgetSource || "legacy-default",
      goal_enforcement: input.budget?.goalEnforcement || "required",
      accounted_turns: [],
      goal_waiver: null,
      accounting_version: 1,
      usage_scope: "build-executor",
      legacy_usage_unverified: false,
      unaccounted_attempts: [],
      amendments: [],
    },
    iteration: 0,
    consecutive_failure_signature: null,
    consecutive_failure_count: 0,
    failure_history: [],
    runtime_probes: [],
    workspace: input.workspace || null,
    last_trial_result: null,
    next_action: "prepare_delivery_workspace",
    blockers: [],
    created_at: now,
    updated_at: now,
    accepted_by: null,
    accepted_at: null,
  });
  return withFileLock(paths.statePath, () => {
    if (existsSync(paths.statePath)) throw new Error(`Delivery ledger already exists for run ${state.run_id}`);
    const event = eventFor(state, "run_created", { next_action: state.next_action });
    appendEvent(paths, event);
    atomicWriteFile(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
    return { state, event, ...paths };
  });
}

function parseLedgerText(text) {
  return parseBoundedJson(text, { maxBytes: 5 * 1024 * 1024, maxDepth: 32, maxNodes: 50_000 });
}

export function readDeliveryLedger(runRoot) {
  const paths = deliveryLedgerPaths(runRoot);
  if (!existsSync(paths.statePath)) throw new Error("Delivery ledger does not exist");
  return assertValidLedger(parseLedgerText(readFileSync(paths.statePath, "utf8")));
}

function latestEventState(eventsPath) {
  if (!existsSync(eventsPath)) return null;
  const text = readFileSync(eventsPath, "utf8");
  if (Buffer.byteLength(text) > 50 * 1024 * 1024) throw new Error("Delivery event log exceeds recovery limit");
  let latest = null;
  const lines = text.split("\n");
  const finalLineMayBePartial = !text.endsWith("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = parseBoundedJson(line, { maxBytes: 5 * 1024 * 1024, maxDepth: 40, maxNodes: 60_000 });
    } catch (error) {
      if (finalLineMayBePartial && index === lines.length - 1) break;
      throw error;
    }
    if (event.schema !== DELIVERY_EVENT_SCHEMA || !event.state) throw new Error("Delivery event log contains an unsupported event");
    if (!latest || event.sequence > latest.sequence) latest = event;
  }
  return latest?.state || null;
}

export function recoverDeliveryLedger(runRoot) {
  const paths = deliveryLedgerPaths(runRoot);
  return withFileLock(paths.statePath, () => {
    const recovered = assertValidLedger(latestEventState(paths.eventsPath));
    let current = null;
    try {
      if (existsSync(paths.statePath)) current = assertValidLedger(parseLedgerText(readFileSync(paths.statePath, "utf8")));
    } catch {
      current = null;
    }
    if (!current || current.version < recovered.version) atomicWriteFile(paths.statePath, `${JSON.stringify(recovered, null, 2)}\n`);
    return current && current.version >= recovered.version ? current : recovered;
  });
}

export function updateDeliveryLedger(runRoot, update, options = {}) {
  const paths = deliveryLedgerPaths(runRoot);
  return withFileLock(paths.statePath, () => {
    const current = readDeliveryLedger(paths.runRoot);
    if (options.expectedVersion !== undefined && current.version !== options.expectedVersion) {
      throw new Error(`Delivery ledger changed: expected version ${options.expectedVersion}, found ${current.version}`);
    }
    const proposed = typeof update === "function" ? update(structuredClone(current)) : { ...current, ...update };
    if (options.skipUnchanged && JSON.stringify(proposed) === JSON.stringify(current)) return { state: current, event: null, ...paths };
    const now = options.updatedAt || new Date().toISOString();
    const next = assertValidLedger({
      ...proposed,
      schema: DELIVERY_LEDGER_SCHEMA,
      version: current.version + 1,
      run_id: current.run_id,
      agent_slug: current.agent_slug,
      target_key: current.target_key,
      created_at: current.created_at,
      updated_at: now,
    });
    const event = eventFor(next, options.eventType || "state_updated", options.payload || {});
    appendEvent(paths, event);
    atomicWriteFile(paths.statePath, `${JSON.stringify(next, null, 2)}\n`);
    return { state: next, event, ...paths };
  });
}

export function transitionDelivery(runRoot, status, options = {}) {
  if (!DELIVERY_STATUSES.has(status)) throw new Error(`Unsupported delivery status: ${status}`);
  return updateDeliveryLedger(runRoot, (current) => {
    if (current.status !== status && !ALLOWED_TRANSITIONS.get(current.status)?.has(status)) {
      throw new Error(`Delivery transition is not allowed: ${current.status} -> ${status}`);
    }
    const terminal = DELIVERY_TERMINAL_STATUSES.has(status);
    const blockers = status === "blocked" ? (options.blockers || []).map(typedBlocker) : [];
    const nextAction = terminal || status === "blocked" ? "" : boundedText(options.nextAction, "next action", 256);
    return {
      ...current,
      status,
      phase: options.phase || status,
      next_action: nextAction,
      blockers,
      workspace: options.workspace === undefined ? current.workspace : options.workspace,
      last_trial_result: options.lastTrialResult === undefined ? current.last_trial_result : options.lastTrialResult,
      accepted_by: status === "accepted" ? "user" : current.accepted_by,
      accepted_at: status === "accepted" ? (options.acceptedAt || new Date().toISOString()) : current.accepted_at,
    };
  }, { ...options, eventType: options.eventType || `status_${status}` });
}

function failureSignature(failures) {
  const projection = (failures || []).map((failure) => ({
    id: failure.id,
    failed_assertions: (failure.assertions || []).filter((entry) => !entry.passed).map((entry) => entry.type).sort(),
    error_code: failure.error?.code || null,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return sha256(JSON.stringify(projection));
}

export function recordDeliveryFailure(runRoot, failures, options = {}) {
  const signature = failureSignature(failures);
  return updateDeliveryLedger(runRoot, (current) => {
    const count = current.consecutive_failure_signature === signature ? current.consecutive_failure_count + 1 : 1;
    const threshold = current.budget.repeated_failure_threshold;
    const entry = { iteration: current.iteration, signature, trial_ids: (failures || []).map((failure) => failure.id).filter(Boolean).slice(0, 100) };
    const base = {
      ...current,
      consecutive_failure_signature: signature,
      consecutive_failure_count: count,
      failure_history: [...(current.failure_history || []), entry].slice(-20),
    };
    if (count < threshold) {
      return { ...base, status: "building", phase: "repair", next_action: "repair_latest_trial_failures", blockers: [] };
    }
    return {
      ...base,
      status: "blocked",
      phase: "repeated_failure",
      next_action: "",
      blockers: [typedBlocker({
        code: "repeated_trial_failure",
        summary: `The same Trial failure signature repeated ${count} times.`,
        question: "How should Pritha proceed with this repeated failure?",
        options: [
          { id: "add-guidance", label: "Add guidance", effect: "Provide one missing constraint or implementation clue, then resume the same approved outcome." },
          { id: "revise-outcome", label: "Revise outcome", effect: "Create a new Outcome Spec revision and require fresh approval before continuing." },
          { id: "stop-run", label: "Stop run", effect: "Abandon this delivery run without changing the active user workspace." },
        ],
        evidence_refs: entry.trial_ids.map((id) => `trial:${id}`),
      })],
    };
  }, { ...options, eventType: "trial_failure_recorded", payload: { signature } });
}

export function budgetBlocker(state, now = Date.now()) {
  const elapsed = now - Date.parse(state.created_at);
  if (deliveryUsageStatus(state.budget) !== "complete") {
    return typedBlocker({
      code: "goal_usage_unavailable",
      summary: "Build usage or the end of a prior attempt is unresolved; another model turn is not allowed.",
      question: "How should Pritha reconcile the saved build attempt before another model turn?",
      options: [
        { id: "retry-accounting", label: "Reconcile usage", effect: "Inspect the bound native thread and saved receipt without resending a model turn." },
        { id: "verify-only", label: "Verify existing work", effect: "Run the approved Trials without a model turn, once the saved attempt is confirmed stopped." },
        { id: "inspect-worktree", label: "Inspect evidence", effect: "Keep the run blocked and inspect its saved receipts and worktree." },
        { id: "abandon", label: "Abandon", effect: "Abandon delivery while preserving its evidence." },
      ],
      evidence_refs: ["ledger:budget.unaccounted_attempts", "ledger:budget.legacy_usage_unverified"],
    });
  }
  if (state.budget.tokens_used >= state.budget.max_tokens) {
    return typedBlocker({
      code: "token_budget_exhausted",
      summary: `The build used its ${state.budget.max_tokens}-token budget.`,
      question: "How should Pritha proceed after the confirmed build token budget was exhausted?",
      options: [
        { id: "extend-budget", label: "Continue this run", effect: "Authorize an explicit additional build budget; preserve this run, its worktree, approvals and observed usage." },
        { id: "verify-only", label: "Verify existing work", effect: "Run the approved Trials and prepare the verified result without starting another model turn." },
        { id: "review-failures", label: "Review evidence", effect: "Keep the run blocked and inspect the current worktree and Trial evidence." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without merging or deploying changes." },
      ],
      evidence_refs: ["ledger:budget.tokens_used"],
    });
  }
  if (state.iteration >= state.budget.max_iterations) {
    return typedBlocker({
      code: "iteration_budget_exhausted",
      summary: `The build used its ${state.budget.max_iterations}-iteration budget.`,
      question: "Should Pritha extend the build budget for this approved outcome?",
      options: [
        { id: "extend-budget", label: "Continue this run", effect: "Authorize an explicit number of additional iterations and continue from the latest evidence." },
        { id: "verify-only", label: "Verify existing work", effect: "Run only the approved Trials without another model turn." },
        { id: "review-failures", label: "Review failures", effect: "Keep the run blocked and inspect the latest Trial evidence." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without merging or deploying changes." },
      ],
      evidence_refs: ["ledger:iteration"],
    });
  }
  if (Number.isFinite(elapsed) && elapsed >= state.budget.max_elapsed_ms) {
    return typedBlocker({
      code: "elapsed_budget_exhausted",
      summary: "The delivery run reached its elapsed-time budget.",
      question: "Should Pritha extend the elapsed-time budget for this run?",
      options: [
        { id: "extend-budget", label: "Continue this run", effect: "Authorize an explicit time extension from now and resume this run." },
        { id: "verify-only", label: "Verify existing work", effect: "Run only the approved Trials without another model turn." },
        { id: "review-failures", label: "Review failures", effect: "Keep the run blocked and inspect current evidence." },
        { id: "stop-run", label: "Stop run", effect: "Abandon this run without merging or deployment." },
      ],
      evidence_refs: ["ledger:elapsed"],
    });
  }
  return null;
}

export function deliveryUsageStatus(budget) {
  if (budget.legacy_usage_unverified) return "legacy-unknown";
  return budget.unaccounted_attempts?.length ? "unknown" : "complete";
}

export function deliveryTokenPreflight(budget) {
  const reserved = (budget.unaccounted_attempts || []).reduce((total, entry) => total + (Number.isSafeInteger(entry.reserved_tokens) ? entry.reserved_tokens : 0), 0);
  return {
    usage_status: deliveryUsageStatus(budget),
    used: budget.tokens_used,
    cap: budget.max_tokens,
    reserved: Number.isSafeInteger(reserved) ? reserved : null,
    available: deliveryUsageStatus(budget) === "complete" && Number.isSafeInteger(reserved)
      ? Math.max(0, budget.max_tokens - budget.tokens_used - reserved) : null,
  };
}

export function grantDeliveryBudget(runRoot, input = {}) {
  if (input.approvedBy !== "user") throw new Error("A budget extension requires explicit user authorization");
  const requestId = safeIdentifier(input.requestId, "budget request id");
  const additions = { tokens: input.addTokens ?? 0, iterations: input.addIterations ?? 0, elapsed_ms: input.addElapsedMs ?? 0 };
  const hasTarget = input.setTokens !== undefined;
  if (hasTarget && (!Number.isSafeInteger(input.setTokens) || input.setTokens < 1 || additions.tokens !== 0)) throw new Error("Choose either a positive total token budget or additional tokens");
  if (Object.values(additions).some(value => !Number.isSafeInteger(value) || value < 0) || (!hasTarget && !Object.values(additions).some(value => value > 0))) {
    throw new Error("Specify positive safe integer budget additions");
  }
  // Existing additive receipts keep their original hashes and wire shape.
  const requestHash = sha256(JSON.stringify(hasTarget ? { ...additions, token_target: input.setTokens } : additions));
  return updateDeliveryLedger(runRoot, current => {
    const prior = current.budget.amendments.find(entry => entry.request_id === requestId);
    if (prior) {
      if (prior.request_hash !== requestHash) throw new Error("The budget request id was already used with different additions");
      return current;
    }
    if (!DELIVERY_ACTIVE_STATUSES.has(current.status)) throw new Error("This delivery run no longer needs a build budget");
    if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) throw new Error("The delivery budget changed; refresh its state before extending it");
    const now = input.now ?? Date.now();
    const elapsed = Math.max(0, now - Date.parse(current.created_at));
    const before = { max_tokens: current.budget.max_tokens, max_iterations: current.budget.max_iterations, max_elapsed_ms: current.budget.max_elapsed_ms };
    if (hasTarget && input.setTokens < before.max_tokens && deliveryUsageStatus(current.budget) !== "complete") throw new Error("Resolve unknown build usage before reducing its budget");
    const after = {
      max_tokens: hasTarget ? input.setTokens : before.max_tokens + additions.tokens,
      max_iterations: before.max_iterations + additions.iterations,
      max_elapsed_ms: additions.elapsed_ms ? Math.max(before.max_elapsed_ms, elapsed) + additions.elapsed_ms : before.max_elapsed_ms,
    };
    if (Object.values(after).some(value => !Number.isSafeInteger(value))) throw new Error("The extended budget exceeds the supported range");
    if ((hasTarget || additions.tokens) && after.max_tokens <= current.budget.tokens_used) throw new Error("The token cap must exceed the observed usage");
    const budget = {
      ...current.budget, ...after,
      amendments: [...current.budget.amendments, { request_id: requestId, request_hash: requestHash, approved_by: "user", approved_at: new Date(now).toISOString(), additions, ...(hasTarget ? { token_target: input.setTokens } : {}), before, after, applied_version: current.version + 1 }],
    };
    const recoverable = current.status === "blocked" && ["token_budget_exhausted", "iteration_budget_exhausted", "elapsed_budget_exhausted"].includes(current.blockers[0]?.code);
    const remaining = budgetBlocker({ ...current, budget }, now);
    return {
      ...current, budget,
      ...(recoverable ? remaining
        ? { blockers: [remaining], phase: remaining.code }
        : { status: "correcting", phase: "budget_extended", next_action: "resume_delivery", blockers: [] }
        : {}),
    };
  }, { skipUnchanged: true, eventType: "delivery_budget_authorized", payload: { request_id: requestId, additions, ...(hasTarget ? { token_target: input.setTokens } : {}) } }).state;
}

export function accountDeliveryExecutorResult(runRoot, result, executorPath) {
  if (!["pritha-build-executor-result-v1", "pritha-build-executor-result-v2"].includes(result?.schema)) throw new Error("Unsupported executor receipt");
  if (result.usage_scope && result.usage_scope !== "build-executor") throw new Error("Executor receipt has a different usage scope");
  return updateDeliveryLedger(runRoot, (current) => {
    if (result.run_id && result.run_id !== current.run_id) throw new Error("Executor receipt belongs to another delivery run");
    const budget = { ...current.budget };
    let unresolved = budget.unaccounted_attempts.filter((entry) => entry.executor_result !== executorPath);
    const threadId = String(result.thread_id || "");
    const turnId = String(result.turn_id || "");
    const attemptId = result.provider === "neuraldeep" && result.attempt_id === result.launcher_run_id
      && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(result.attempt_id || "") ? result.attempt_id : null;
    const key = attemptId ? `neuraldeep:${attemptId}` : threadId && turnId ? `${threadId}:${turnId}` : "";
    const count = result.tokens_used;
    const status = result.usage_status ?? (result.goal_enforcement !== "waived-once" && key && Number.isSafeInteger(count) && count >= 0 ? "measured" : "unknown");
    let reason = "";
    if (status === "measured" && key && Number.isSafeInteger(count) && count >= 0) {
      const previous = budget.accounted_turns.find((entry) => entry.key === key);
      const nextCount = Math.max(previous?.tokens_used ?? 0, count);
      const nextTotal = budget.tokens_used - (previous?.tokens_used ?? 0) + nextCount;
      if (!Number.isSafeInteger(nextTotal)) reason = "token_total_out_of_range";
      else if (previous?.usage_source && result.usage_source && previous.usage_source !== result.usage_source && previous.tokens_used !== count) reason = "conflicting_usage_sources";
      else {
        const entry = {
          ...previous, key, thread_id: threadId || null, turn_id: turnId || null,
          ...(attemptId ? { attempt_id: attemptId, launcher_run_id: attemptId } : {}),
          tokens_used: nextCount, executor_result: previous?.executor_result || executorPath,
          phase: result.phase || "build-executor", usage_source: previous?.usage_source || result.usage_source || "legacy-goal",
          turn_status: result.turn_status || result.status,
          runtime_version: result.runtime_version || previous?.runtime_version || null,
          model_requested: result.model_requested || previous?.model_requested || null,
          effort_requested: result.effort_requested || previous?.effort_requested || null,
          model_observed: result.model_observed || previous?.model_observed || null,
          provider_observed: result.provider_observed || previous?.provider_observed || null,
        };
        budget.accounted_turns = [...budget.accounted_turns.filter((item) => item.key !== key), entry];
        budget.tokens_used = nextTotal;
      }
    } else if (!["not-started", "not-applicable"].includes(status)) reason = "usage_unavailable";
    if (result.thread_cleanup === "pending") reason ||= "thread_cleanup_pending";
    if (reason) unresolved.push({ executor_result: executorPath, thread_id: threadId || null, turn_id: turnId || null, phase: "build-executor", reason,
      turn_status: result.turn_status || result.status, thread_cleanup: result.thread_cleanup || "unknown",
      process_exited: result.process_exited === true,
      reserved_tokens: ["dispatching", "running", "uncertain"].includes(result.status) && Number.isSafeInteger(result.token_budget) ? result.token_budget : 0 });
    budget.unaccounted_attempts = unresolved;
    if (result.goal_enforcement === "waived-once" && status !== "not-started" && budget.goal_enforcement === "waived-once") {
      budget.goal_enforcement = "required";
      budget.goal_waiver = { ...budget.goal_waiver, used_at: new Date().toISOString() };
    }
    return {
      ...current, budget, executor_last_result: executorPath,
      next_action: current.status === "building" ? "verify_executor_changes" : current.next_action,
    };
  }, {
    eventType: "build_usage_recorded",
    payload: { executor_result: executorPath, thread_id: result.thread_id || null, turn_id: result.turn_id || null, usage_status: result.usage_status || "legacy" },
  }).state;
}

export function deliveryTargetClaimPath(buildsRoot, key) {
  const digest = String(key).replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("target key must be a sha256 identity");
  return path.join(path.resolve(buildsRoot), ".targets", `${digest}.json`);
}

export function claimDeliveryTarget(buildsRoot, input = {}) {
  const claimPath = deliveryTargetClaimPath(buildsRoot, input.targetKey);
  mkdirSync(path.dirname(claimPath), { recursive: true });
  return withFileLock(claimPath, () => {
    let existing = null;
    if (existsSync(claimPath)) {
      try {
        existing = parseBoundedJson(readFileSync(claimPath, "utf8"), { maxBytes: 64 * 1024, maxDepth: 8, maxNodes: 128 });
      } catch {
        existing = null;
      }
    }
    if (existing?.schema === DELIVERY_TARGET_CLAIM_SCHEMA && existing.run_id !== input.runId && !existing.released_at) {
      let active = true;
      try {
        active = DELIVERY_ACTIVE_STATUSES.has(readDeliveryLedger(existing.run_root).status);
      } catch {
        active = true;
      }
      if (active) throw new Error(`Another delivery run already owns this target: ${existing.run_id}`);
    }
    const claim = {
      schema: DELIVERY_TARGET_CLAIM_SCHEMA,
      target_key: input.targetKey,
      run_id: safeIdentifier(input.runId, "run id"),
      run_root: path.resolve(input.runRoot),
      claimed_at: input.claimedAt || new Date().toISOString(),
      released_at: null,
    };
    atomicWriteFile(claimPath, `${JSON.stringify(claim, null, 2)}\n`);
    return { claimPath, claim };
  });
}

export function releaseDeliveryTarget(claimPathValue, runId, options = {}) {
  const claimPath = path.resolve(claimPathValue);
  return withFileLock(claimPath, () => {
    if (!existsSync(claimPath)) return { released: false, reason: "claim_missing" };
    const claim = parseBoundedJson(readFileSync(claimPath, "utf8"), { maxBytes: 64 * 1024, maxDepth: 8, maxNodes: 128 });
    if (claim.run_id !== runId) return { released: false, reason: "claim_owned_by_another_run" };
    if (claim.released_at) return { released: true, claim };
    const next = { ...claim, released_at: options.releasedAt || new Date().toISOString() };
    atomicWriteFile(claimPath, `${JSON.stringify(next, null, 2)}\n`);
    return { released: true, claim: next };
  });
}

export function redactDeliveryStateForReport(state, options = {}) {
  const text = redactFilesystemPaths(JSON.stringify(state), options);
  return JSON.parse(text);
}
