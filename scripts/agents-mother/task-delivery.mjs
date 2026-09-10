import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile } from "../lib/atomic-file.mjs";
import { resolvePrithaStateRoot, resolvePrithaStatePathFrom, resolveTechscopeRoot } from "../lib/paths.mjs";
import { readAgentCatalog, readCatalogArtifact, readIdentityEvidence } from "./identity.mjs";
import { DELIVERY_ACTIVE_STATUSES, deliveryUsageStatus, grantDeliveryBudget, readDeliveryLedger, targetKey } from "./delivery-ledger.mjs";
import { canHostVerifyDelivery, defaultDeliveryTrialBackend, withDeliveryBudgetControl, withDeliveryHostControl } from "./delivery-loop.mjs";
import { approvalEvidencePath, verifyCompiledTrialPlan } from "./outcome-spec.mjs";
import { verifyTrialResultFreshness } from "./trial-runner.mjs";
import { readDeliveryUsage } from "./phase-usage.mjs";

const SCHEMA = "pritha-task-delivery-control-v1";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const canonical = value => realpathSync(path.resolve(value));
const finished = new Set(["verified", "awaiting_acceptance", "accepted"]);
export class TaskDeliveryError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new TaskDeliveryError(code, message, status); };

function optionsFor(options) {
  const root = path.resolve(options.root || resolveTechscopeRoot());
  const stateRoot = resolvePrithaStateRoot({ ...options, root });
  return { ...options, root, stateRoot, buildsRoot: resolvePrithaStatePathFrom({ root, stateRoot }, "builds") };
}
function json(file, boundary, max = 5_000_000) {
  const text = readIdentityEvidence(file, boundary, max);
  if (!text) fail("delivery_evidence_unavailable", "The run evidence is missing or outside this instance.");
  try { return JSON.parse(text); } catch { return fail("delivery_evidence_invalid", "The run evidence needs recovery before another action."); }
}
function taskIdentity(task) {
  if (!task || !/^chat_[A-Za-z0-9]+$/.test(task.chatId) || !["neuraldeep_cli"].includes(task.providerId)
    || typeof task.nativeThreadId !== "string" || !task.nativeThreadId || task.nativeThreadId.length > 200
    || typeof task.stateIdentityHash !== "string" || !task.stateIdentityHash || task.stateIdentityHash.length > 256) {
    fail("delivery_task_unverified", "Restore access to the original native task before linking a delivery.");
  }
  return { chatId: task.chatId, providerId: task.providerId, nativeThreadId: task.nativeThreadId, stateIdentityHash: task.stateIdentityHash };
}
const taskKey = task => hash([task.providerId, task.stateIdentityHash, task.nativeThreadId]);

function runDirectories(options) {
  const result = [];
  if (!existsSync(options.buildsRoot)) return result;
  if (lstatSync(options.buildsRoot).isSymbolicLink()) fail("delivery_evidence_unavailable", "The instance build directory needs recovery.");
  const agents = readdirSync(options.buildsRoot, { withFileTypes: true }).filter(row => row.isDirectory() && id(row.name)).slice(0, 1000);
  for (const agent of agents) {
    for (const run of readdirSync(path.join(options.buildsRoot, agent.name), { withFileTypes: true })) {
      if (!run.isDirectory() || !id(run.name)) continue;
      result.push(path.join(options.buildsRoot, agent.name, run.name));
      if (result.length >= 2000) return result;
    }
  }
  return result;
}
function findRun(runId, options) {
  if (!id(runId)) fail("delivery_run_invalid", "Choose an exact delivery run identifier.", 400);
  const matches = runDirectories(options).filter(file => path.basename(file) === runId && existsSync(path.join(file, "build-state.json")));
  if (matches.length !== 1) fail("delivery_run_unavailable", "The exact run is missing or ambiguous in this instance.", 404);
  // This also rejects a replaced ancestor symlink before any host writer runs.
  json(path.join(matches[0], "build-state.json"), options.stateRoot);
  return matches[0];
}
function readControl(runRoot, options) {
  const file = path.join(runRoot, "task-control.json");
  if (!existsSync(file)) return null;
  const value = json(file, options.stateRoot, 2_000_000);
  if (value?.schema !== SCHEMA || !value.binding || value.bindingHash !== hash(value.binding)
    || !value.requests || typeof value.requests !== "object" || Array.isArray(value.requests)) {
    fail("delivery_binding_invalid", "The saved task binding needs recovery; it was preserved.");
  }
  for (const [key, receipt] of Object.entries(value.requests)) {
    if (!id(key) || !receipt || !["started", "completed", "failed", "interrupted"].includes(receipt.status)
      || !/^[a-f0-9]{64}$/.test(receipt.requestHash || "")) fail("delivery_receipt_invalid", "A saved host action needs recovery; it was preserved.");
  }
  return value;
}
function targetFor(runId, task, options) {
  const runRoot = findRun(runId, options);
  const catalog = readAgentCatalog({ ...options, fresh: true });
  const raw = json(path.join(runRoot, "build-state.json"), options.stateRoot);
  const state = readDeliveryLedger(runRoot);
  const plan = json(path.join(runRoot, "trial-plan.json"), options.stateRoot);
  const contractPath = path.resolve(options.root, String(plan.contract_path || ""));
  const specPath = path.resolve(options.root, String(plan.spec_path || ""));
  const matches = catalog.agents.filter(agent => agent.identityStatus !== "conflict" && agent.projectPath
    && path.resolve(agent.projectPath) === raw.source_project
    && agent.artifacts.some(item => item.type === "agent-contract" && item.path === contractPath)
    && agent.artifacts.some(item => item.type === "agent-outcome-spec" && item.path === specPath));
  if (matches.length !== 1) fail("delivery_agent_unverified", "The run must match one exact local agent, project, contract and Outcome Spec.");
  const agent = matches[0];
  const contract = readCatalogArtifact(agent, contractPath, options);
  const spec = readCatalogArtifact(agent, specPath, options);
  if (!contract || !spec || !readIdentityEvidence(approvalEvidencePath(options), options.stateRoot, 5_000_000)) {
    fail("delivery_approval_unavailable", "The original contract, Outcome Spec or approval evidence is unavailable.");
  }
  if (state.run_id !== runId || path.basename(path.dirname(runRoot)) !== plan.agent_slug || state.target_key !== targetKey(agent.projectPath)
    || state.spec.id !== plan.spec_id || state.spec.approval_id !== plan.approval_id
    || ["contract_fingerprint", "semantic_lock", "document_lock"].some(key => state.spec[key] !== plan[key])
    || !verifyCompiledTrialPlan(plan, options)) {
    fail("delivery_approval_stale", "The run no longer matches its approved plan. Refresh the original evidence before continuing.");
  }
  const worktreeFile = path.join(runRoot, "delivery-worktree.json");
  const worktree = existsSync(worktreeFile) ? json(worktreeFile, options.stateRoot, 128_000) : null;
  if (worktree && (worktree.run_id !== runId || worktree.source_project !== canonical(agent.projectPath)
    || path.resolve(worktree.worktree || "") !== path.join(runRoot, "worktree"))) {
    fail("delivery_worktree_mismatch", "The saved worktree does not belong to this delivery run.");
  }
  const identity = {
    instanceKey: catalog.instanceKey, agentId: agent.id, authoredAgentId: agent.agentId, runId,
    sourceProject: canonical(agent.projectPath), planHash: hash(plan), spec: state.spec,
  };
  const control = readControl(runRoot, options);
  if (control && hash(control.binding.target) !== hash(identity)) fail("delivery_binding_stale", "The linked run changed its identity or approved plan. Its original binding was preserved.");
  const bindingStatus = !control ? "unbound" : taskKey(control.binding.task) === taskKey(task) ? "bound" : "other_task";
  const revision = hash([identity, state.version, control?.bindingHash || null]);
  return { options, runRoot, state, plan, specPath, agent, identity, control, bindingStatus, revision, worktree };
}
function saveControl(target, control) {
  atomicWriteFile(path.join(target.runRoot, "task-control.json"), `${JSON.stringify(control, null, 2)}\n`);
}
function actionPlan(target) {
  const automated = target.plan.trials.filter(trial => trial.kind === "automated");
  return {
    backend: defaultDeliveryTrialBackend(target.plan),
    commands: automated.map(trial => ({ id: trial.id, argv: trial.argv, cwd: trial.cwd || ".", timeoutMs: trial.timeoutMs, isolation: trial.isolation })),
    outputBytesCap: 1_048_576, concurrency: 1,
    maxVerificationPasses: 4,
    effects: "Approved commands may use a model, network or other side effects. Command names do not establish safety; the approved Trial plan and isolation apply.",
  };
}
function view(target) {
  const { state, control, plan } = target;
  let preparation = null;
  const preparationFile = path.join(target.runRoot, "handoff-preparation.json");
  if (control && existsSync(preparationFile)) {
    const saved = json(preparationFile, target.options.stateRoot, 128_000);
    if (saved.bindingHash === control.bindingHash && saved.evidenceLock === state.last_trial_result?.evidence_lock) {
      preparation = { preparedAt: saved.preparedAt, demo: saved.demo, head: saved.workspace?.head || null, verification: saved.verification, acceptance: saved.acceptance };
    }
  }
  return {
    runId: state.run_id, agentId: target.agent.id, agentName: target.agent.name,
    status: state.status, bindingStatus: target.bindingStatus, revision: target.revision,
    specId: plan.spec_id, budget: { tokensUsed: state.budget.tokens_used, maxTokens: state.budget.max_tokens, scope: "build-executor", usageStatus: deliveryUsageStatus(state.budget),
      iterations: state.iteration, maxIterations: state.budget.max_iterations, elapsedMs: Math.max(0, Date.now() - Date.parse(state.created_at)), maxElapsedMs: state.budget.max_elapsed_ms },
    actions: { verify: canHostVerifyDelivery(state), prepareHandoff: finished.has(state.status), budget: DELIVERY_ACTIVE_STATUSES.has(state.status) },
    plan: actionPlan(target),
    receipts: Object.entries(control?.requests || {}).slice(-10).map(([requestId, receipt]) => ({ requestId, action: receipt.action, status: receipt.status, request: receipt.request || null, result: receipt.result || null })),
    acceptance: state.accepted_by === "user" ? "accepted_by_user" : "not_accepted",
    preparation,
    usage: readDeliveryUsage(target.runRoot, state, target.bindingStatus === "bound" ? control.binding.task : null, target.options),
  };
}
export function readTaskDelivery(runId, taskInput, options = {}) {
  const task = taskIdentity(taskInput);
  return view(targetFor(runId, task, optionsFor(options)));
}
export function listTaskDeliveries(taskInput, options = {}) {
  const task = taskIdentity(taskInput), context = optionsFor(options), rows = [];
  for (const runRoot of runDirectories(context)) {
    if (!existsSync(path.join(runRoot, "build-state.json"))) continue;
    try {
      const control = readControl(runRoot, context);
      if (!control || taskKey(control.binding.task) !== taskKey(task)) continue;
      const state = json(path.join(runRoot, "build-state.json"), context.stateRoot);
      rows.push({ runId: path.basename(runRoot), status: String(state.status || "unknown") });
    } catch { /* A damaged run never becomes authorization through discovery. */ }
  }
  return rows.slice(0, 100);
}
function requireBound(target) {
  if (target.bindingStatus !== "bound") fail("delivery_task_mismatch", "Link this exact run to the selected task before using a host action.");
}
function validateRequest(input) {
  if (!input || !id(input.runId) || !id(input.requestId) || !["bind", "verify", "prepare_handoff", "budget"].includes(input.action)
    || !/^[a-f0-9]{64}$/.test(input.expectedRevision || "")) fail("delivery_action_invalid", "Refresh the run and choose a supported host action.", 400);
  if (input.action === "budget") {
    const change = input.budget;
    if (!change || !["add", "set"].includes(change.mode) || !Number.isSafeInteger(change.tokens) || change.tokens < 0 || typeof change.resume !== "boolean"
      || [change.addIterations ?? 0, change.addElapsedMs ?? 0].some(value => !Number.isSafeInteger(value) || value < 0)
      || (change.tokens === 0 && (change.mode === "set" || !(change.addIterations || change.addElapsedMs)))
      || (input.sourceTextHash !== undefined && !/^[a-f0-9]{64}$/.test(input.sourceTextHash))) fail("delivery_budget_invalid", "Choose positive whole budget amounts and an explicit continuation preference.", 400);
  }
}
export function normalizeTaskDeliveryBudgetRequest(input) {
  validateRequest(input);
  if (input.action !== "budget") fail("delivery_budget_invalid", "Choose a build budget action.", 400);
  return { requestId: input.requestId, runId: input.runId, expectedRevision: input.expectedRevision, action: "budget",
    budget: { mode: input.budget.mode, tokens: input.budget.tokens, resume: input.budget.resume,
      ...(input.budget.addIterations ? { addIterations: input.budget.addIterations } : {}), ...(input.budget.addElapsedMs ? { addElapsedMs: input.budget.addElapsedMs } : {}) },
    ...(input.sourceTextHash ? { sourceTextHash: input.sourceTextHash } : {}) };
}

async function budgetAction(target, task, input, resume) {
  requireBound(target);
  const control = target.control;
  const change = normalizeTaskDeliveryBudgetRequest(input).budget;
  const requestHash = hash([input.action, input.runId, input.expectedRevision, taskKey(task), change, input.sourceTextHash || null]);
  let receipt = Object.hasOwn(control.requests, input.requestId) ? control.requests[input.requestId] : null;
  const replayed = Boolean(receipt);
  if (receipt) {
    if (receipt.requestHash !== requestHash) fail("idempotency_conflict", "This budget request was already used with a different change.");
    if (receipt.status !== "started") return { run: view(target), replayed: true };
  } else {
    if (Object.values(control.requests).some(row => row.status === "started")) fail("delivery_action_pending", "Reconcile the saved action before changing the build budget.");
    if (input.expectedRevision !== target.revision) fail("delivery_changed", "The run changed. Refresh it before choosing its budget.");
    if (!DELIVERY_ACTIVE_STATUSES.has(target.state.status)) fail("delivery_budget_complete", "This delivery result no longer needs a build budget.");
    const total = change.mode === "set" ? change.tokens : target.state.budget.max_tokens + change.tokens;
    if (!Number.isSafeInteger(total) || ((change.tokens || change.mode === "set") && total <= target.state.budget.tokens_used)) fail("delivery_budget_invalid", "The total build budget must exceed the observed usage.", 400);
    if (change.mode === "set" && total < target.state.budget.max_tokens && deliveryUsageStatus(target.state.budget) !== "complete") fail("delivery_usage_unknown", "Reconcile unknown build usage before reducing the total budget.");
    receipt = { action: "budget", request: { runId: input.runId, requestId: input.requestId, expectedRevision: input.expectedRevision, action: "budget", budget: change,
      ...(input.sourceTextHash ? { sourceTextHash: input.sourceTextHash } : {}) }, requestHash, status: "started", startedAt: new Date().toISOString(), versionBefore: target.state.version,
      budgetRequestId: `task-budget-${hash([taskKey(task), input.requestId]).slice(0, 40)}` };
    control.requests[input.requestId] = receipt;
    saveControl(target, control);
  }
  try {
    // The ledger's original request ID makes both add and absolute-set retries
    // idempotent, including a crash between ledger commit and receipt update.
    const state = grantDeliveryBudget(target.runRoot, { approvedBy: "user", requestId: receipt.budgetRequestId, expectedVersion: receipt.versionBefore,
      ...(change.mode === "set" ? { setTokens: change.tokens } : { addTokens: change.tokens }), addIterations: change.addIterations, addElapsedMs: change.addElapsedMs });
    const amendment = state.budget.amendments.find(row => row.request_id === receipt.budgetRequestId);
    target = { ...target, state };
    receipt.budgetAppliedVersion = amendment.applied_version;
    receipt.result = { status: state.status, maxTokens: state.budget.max_tokens, tokensUsed: state.budget.tokens_used, resume: "not_requested" };
    saveControl(target, control);
    if (change.resume) {
      if (receipt.resumeStartedAt) {
        receipt.status = "interrupted";
        receipt.result.resume = "unconfirmed_review_existing_run";
      } else if (state.version !== receipt.budgetAppliedVersion) {
        receipt.result.resume = "superseded_by_run_progress";
      } else {
        receipt.resumeStartedAt = new Date().toISOString();
        receipt.result.resume = "dispatching";
        saveControl(target, control); // before a possible paid build turn
        await resume();
        receipt.result.resume = "returned";
      }
    }
    target = targetFor(input.runId, task, target.options);
    receipt.result.status = target.state.status;
    receipt.result.maxTokens = target.state.budget.max_tokens;
    receipt.result.tokensUsed = target.state.budget.tokens_used;
    if (receipt.status === "started") receipt.status = "completed";
  } catch (error) {
    try { target = targetFor(input.runId, task, target.options); } catch { /* Keep the last confirmed run snapshot. */ }
    receipt.status = "failed";
    receipt.result = { ...(receipt.result || {}), code: error instanceof TaskDeliveryError ? error.code : "delivery_budget_unconfirmed", status: "review_required" };
  }
  receipt.finishedAt = new Date().toISOString();
  saveControl(target, control);
  return { run: view({ ...target, control }), replayed };
}
function freshHandoff(target) {
  if (!finished.has(target.state.status) || !target.worktree || !/^trial-results\/verification-\d+\.json$/.test(target.state.last_trial_result?.path || "")) {
    fail("delivery_not_verified", "Run the approved checks before preparing the handoff.");
  }
  const result = json(path.join(target.runRoot, target.state.last_trial_result.path), target.options.stateRoot, 20_000_000);
  if (result.plan_lock !== `sha256:${hash(target.plan)}` || result.evidence_lock !== target.state.last_trial_result.evidence_lock
    || !["verified", "awaiting_acceptance"].includes(result.verification_status)) fail("delivery_evidence_stale", "The latest Trial evidence does not belong to this plan.");
  const freshness = verifyTrialResultFreshness(result, target.worktree.worktree, { ...target.options, outcomeSpecPath: target.specPath });
  if (!freshness.ok) fail("delivery_evidence_stale", "The verified workspace changed. Handoff preparation preserved the previous evidence.");
  return {
    schema: "pritha-task-handoff-preparation-v1", preparedAt: new Date().toISOString(), bindingHash: target.control.bindingHash,
    runId: target.state.run_id, spec: target.state.spec, evidenceLock: result.evidence_lock, workspace: result.workspace_after,
    verification: result.verification_status, acceptance: target.state.accepted_by === "user" ? "accepted_by_user" : "not_accepted",
    demo: target.plan.demo, disposition: "prepared_for_review", merge: "not_performed", deployment: "not_performed",
  };
}
export async function performTaskDeliveryAction(taskInput, input, options = {}) {
  validateRequest(input);
  const task = taskIdentity(taskInput), context = optionsFor(options);
  // Validate paths before acquiring a writer's lease; repeat authorization while
  // holding the same lease used by the CLI and all host actions.
  targetFor(input.runId, task, context);
  const withControl = input.action === "budget" ? withDeliveryBudgetControl : withDeliveryHostControl;
  return withControl(input.runId, context, async ({ verify, resume }) => {
    let target = targetFor(input.runId, task, context);
    if (input.action === "budget") return budgetAction(target, task, input, resume);
    const requestHash = hash([input.action, input.runId, input.expectedRevision, taskKey(task)]);
    let control = target.control;
    if (input.action === "bind") {
      if (control) {
        requireBound(target);
        const prior = control.requests[input.requestId];
        if (!prior || prior.requestHash !== requestHash) fail("delivery_binding_exists", "This run is already linked; refresh its host actions.");
        return { run: view(target), replayed: true };
      }
      if (input.expectedRevision !== target.revision) fail("delivery_changed", "The run changed. Refresh its approved plan before linking it.");
      const binding = { target: target.identity, task, boundBy: "user", boundAt: new Date().toISOString() };
      control = { schema: SCHEMA, binding, bindingHash: hash(binding), requests: { [input.requestId]: { requestHash, action: "bind", status: "completed", result: { status: "bound" } } } };
      saveControl(target, control);
      return { run: view(targetFor(input.runId, task, context)), replayed: false };
    }
    requireBound(target);
    const prior = control.requests[input.requestId];
    if (prior) {
      if (prior.requestHash !== requestHash) fail("idempotency_conflict", "This action identifier was used for a different request.");
      if (prior.status === "started") {
        // Acquiring the execution lease proves the old handler is no longer
        // executing. Never replay unknown subprocess side effects automatically.
        prior.status = "interrupted";
        prior.result = { status: target.state.status, code: "host_action_interrupted", retry: "review_current_run_then_choose_a_new_action" };
        saveControl(target, control);
      }
      return { run: view({ ...target, control }), replayed: true };
    }
    if (Object.values(control.requests).some(receipt => receipt.status === "started")) fail("delivery_action_pending", "Reconcile the saved host action before starting another one.");
    if (input.expectedRevision !== target.revision) fail("delivery_changed", "The run changed. Refresh its state before choosing another host action.");
    const allowed = view(target).actions;
    if (input.action === "verify" && !allowed.verify) fail("delivery_verify_unavailable", "This run needs its recorded control step before verification can continue.");
    if (input.action === "prepare_handoff" && !allowed.prepareHandoff) fail("delivery_not_verified", "Run the approved checks before preparing the handoff.");
    const receipt = { action: input.action, request: { runId: input.runId, action: input.action, requestId: input.requestId, expectedRevision: input.expectedRevision }, requestHash, status: "started", startedAt: new Date().toISOString(), versionBefore: target.state.version };
    control.requests[input.requestId] = receipt;
    saveControl(target, control);
    try {
      if (input.action === "verify") await verify();
      else {
        const preparation = freshHandoff(target);
        const file = path.join(target.runRoot, "handoff-preparation.json");
        const prior = existsSync(file) ? json(file, context.stateRoot, 128_000) : null;
        const { preparedAt: _newTime, ...meaning } = preparation;
        const { preparedAt: _oldTime, ...priorMeaning } = prior || {};
        if (hash(meaning) !== hash(priorMeaning)) atomicWriteFile(file, `${JSON.stringify(preparation, null, 2)}\n`);
      }
      target = targetFor(input.runId, task, context);
      receipt.status = "completed";
      receipt.result = { status: target.state.status, handoff: input.action === "prepare_handoff" ? "prepared_for_review" : null };
    } catch (error) {
      receipt.status = "failed";
      receipt.result = { code: error instanceof TaskDeliveryError ? error.code : "host_action_failed", status: "review_required" };
    }
    receipt.finishedAt = new Date().toISOString();
    saveControl(target, control);
    return { run: view({ ...target, control }), replayed: false };
  });
}
