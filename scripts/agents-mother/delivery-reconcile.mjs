import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { acquireFileLock, atomicWriteFile } from "../lib/atomic-file.mjs";
import { resolvePrithaStatePathFrom, resolvePrithaStateRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { readAgentCatalog, readIdentityEvidence } from "./identity.mjs";
import { deliveryTargetClaimPath, deliveryUsageStatus, normalizeDeliveryLedger, recoverDeliveryLedger, releaseDeliveryTarget, targetKey, updateDeliveryLedger, validateDeliveryLedger } from "./delivery-ledger.mjs";
import { readAgentResultReadiness } from "./result-readiness.mjs";
import { workspaceRevision } from "./workspace-revision.mjs";

export const RECONCILE_SCHEMA = "pritha-delivery-reconcile-v1";
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identifier = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const fail = code => { const error = new Error(`Delivery reconciliation needs review: ${code}`); error.code = code; throw error; };
function context(input) {
  const root = path.resolve(input.root || resolveTechscopeRoot());
  const stateRoot = resolvePrithaStateRoot({ ...input, root });
  return { ...input, root, stateRoot, buildsRoot: resolvePrithaStatePathFrom({ root, stateRoot }, "builds") };
}
function json(file, options, max = 5_000_000) {
  const text = readIdentityEvidence(file, options.stateRoot, max);
  if (!text) fail("evidence_unavailable");
  try { return JSON.parse(text); } catch { return fail("evidence_invalid"); }
}
function ownRun(runId, options) {
  if (!identifier(runId)) fail("run_identity_invalid");
  if (!existsSync(options.buildsRoot) || lstatSync(options.buildsRoot).isSymbolicLink()) fail("run_unavailable");
  const matches = [];
  let count = 0;
  for (const agent of readdirSync(options.buildsRoot, { withFileTypes: true })) {
    if (!agent.isDirectory() || !identifier(agent.name)) continue;
    for (const run of readdirSync(path.join(options.buildsRoot, agent.name), { withFileTypes: true })) {
      if (!run.isDirectory() || !identifier(run.name)) continue;
      if (++count > 2000) fail("run_inventory_truncated");
      if (run.name === runId) matches.push(path.join(options.buildsRoot, agent.name, run.name));
    }
  }
  if (matches.length !== 1) fail("run_missing_or_ambiguous");
  const runRoot = matches[0];
  const state = normalizeDeliveryLedger(json(path.join(runRoot, "build-state.json"), options));
  if (!validateDeliveryLedger(state).ok || state.run_id !== runId) fail("ledger_invalid");
  return { runRoot, state };
}
function snapshot(project) {
  try { return workspaceRevision(project, { requireComplete: true }); } catch { return null; }
}
function handoffEvidence(runRoot, state, trialPlan, canonical, catalog, agent, options) {
  const file = path.join(runRoot, "handoff-preparation.json");
  if (!existsSync(file)) return { status: "not_prepared", receiptHash: null };
  try {
    const saved = json(file, options, 128_000);
    const control = json(path.join(runRoot, "task-control.json"), options, 2_000_000);
    const target = { instanceKey: catalog.instanceKey, agentId: agent.id, authoredAgentId: agent.agentId, runId: state.run_id,
      sourceProject: agent.projectPath, planHash: digest(trialPlan), spec: state.spec };
    const valid = control.schema === "pritha-task-delivery-control-v1" && control.bindingHash === digest(control.binding)
      && digest(control.binding?.target) === digest(target) && saved.bindingHash === control.bindingHash
      && saved.schema === "pritha-task-handoff-preparation-v1" && saved.runId === state.run_id
      && digest(saved.spec) === digest(state.spec) && saved.evidenceLock === state.last_trial_result?.evidence_lock
      && saved.workspace?.token === canonical?.token && digest(saved.demo) === digest(trialPlan.demo)
      && saved.acceptance === (state.accepted_by === "user" ? "accepted_by_user" : "not_accepted")
      && saved.disposition === "prepared_for_review";
    return { status: valid ? "prepared_for_review" : "stale_or_unconfirmed", receiptHash: digest(saved) };
  } catch { return { status: "unavailable", receiptHash: null }; }
}

export function planDeliveryReconciliation(runId, input = {}) {
  const options = context(input), { runRoot, state } = ownRun(runId, options);
  const catalog = readAgentCatalog({ ...options, fresh: true });
  const matches = catalog.agents.filter(agent => agent.identityStatus !== "conflict" && agent.projectPath === state.source_project
    && targetKey(agent.projectPath) === state.target_key);
  if (matches.length !== 1) fail("agent_identity_unavailable");
  const agent = matches[0];
  const view = readAgentResultReadiness(agent.id, { ...options, runId });
  const canonical = snapshot(agent.projectPath);
  const candidateRevision = existsSync(path.join(runRoot, "worktree")) ? snapshot(path.join(runRoot, "worktree")) : null;
  const trialPlan = json(path.join(runRoot, "trial-plan.json"), options);
  let result = null;
  if (/^trial-results\/verification-\d+\.json$/.test(state.last_trial_result?.path || "")) {
    try { result = json(path.join(runRoot, state.last_trial_result.path), options, 20_000_000); } catch { /* Pending evidence is explicit below. */ }
  }
  const pending = [];
  if (view.run?.id !== runId || !["verified", "awaiting_operator"].includes(view.verification.status)) pending.push("canonical_result_not_current");
  if (!canonical || canonical.kind !== "git" || canonical.dirty !== false || canonical.token !== result?.workspace_after?.token) pending.push("canonical_revision_unconfirmed");
  if (result?.evidence_lock !== state.last_trial_result?.evidence_lock || view.evidenceIssues || view.truncated) pending.push("trial_evidence_unconfirmed");
  if (!["blocked", "correcting", "paused", "verifying", "verified", "awaiting_acceptance", "accepted"].includes(state.status)) pending.push("run_phase_requires_review");
  if (deliveryUsageStatus(state.budget) !== "complete" && (state.budget.legacy_usage_unverified || state.budget.unaccounted_attempts.some(attempt =>
    !["completed", "failed", "interrupted"].includes(attempt.turn_status) || attempt.process_exited !== true))) pending.push("build_terminal_unconfirmed");
  if ((state.accepted_by === "user" || state.status === "accepted") && view.acceptance.status !== "accepted") pending.push("acceptance_unconfirmed");
  if (state.status !== "accepted" && state.accepted_by === "user") pending.push("acceptance_history_requires_review");
  const desiredStatus = state.status === "accepted" ? "accepted" : view.verification.status === "awaiting_operator" ? "awaiting_acceptance" : "verified";
  const handoff = handoffEvidence(runRoot, state, trialPlan, canonical, catalog, agent, options);
  const current = ownRun(runId, options).state;
  if (digest(current) !== digest(state)) pending.push("ledger_changed_during_read");
  const claimPath = deliveryTargetClaimPath(options.buildsRoot, state.target_key);
  let claim = null;
  if (existsSync(claimPath)) {
    try { claim = json(claimPath, options, 64_000); } catch { pending.push("target_claim_unavailable"); }
    if (claim && !claim.released_at && claim.run_id !== runId) pending.push("target_claim_owned_by_another_run");
  }
  const plan = {
    schema: RECONCILE_SCHEMA, runId, agentId: agent.id, instanceKey: catalog.instanceKey, targetKey: state.target_key,
    status: pending.length ? "pending" : "ready", pending,
    stateBefore: { version: state.version, status: state.status, hash: digest(state) },
    desiredStatus, willUpdateLedger: !pending.length && state.status !== desiredStatus,
    bindings: { spec: state.spec, trialPlanHash: digest(trialPlan), trialResult: state.last_trial_result, trialResultHash: result ? digest(result) : null,
      canonical, candidate: view.candidate, candidateRevision, targetClaimHash: claim ? digest(claim) : null, handoff },
    acceptance: view.acceptance, effects: { model: false, trials: false, merge: false, cleanup: false, acceptance: false, handoff: false,
      releaseTargetClaim: !pending.length && Boolean(claim && claim.run_id === runId && !claim.released_at) },
  };
  return { ...plan, planLock: digest(plan) };
}

function priorReconcileEvent(runRoot, planLock, options) {
  const text = readIdentityEvidence(path.join(runRoot, "events.jsonl"), options.stateRoot, 50_000_000);
  if (!text) return null;
  for (const line of text.split("\n")) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.schema === "pritha-delivery-event-v1" && event.type === "delivery_facts_reconciled"
      && event.payload?.plan_lock === planLock && event.run_id === path.basename(runRoot)
      && event.sequence === event.state?.version && validateDeliveryLedger(event.state).ok) return event;
  }
  return null;
}

export function applyDeliveryReconciliation(runId, input = {}) {
  if (!/^[a-f0-9]{64}$/.test(input.planLock || "")) fail("reviewed_plan_required");
  const options = context(input), initial = ownRun(runId, options);
  let lease;
  try { lease = acquireFileLock(path.join(initial.runRoot, "delivery-execution")); } catch { return fail("delivery_running"); }
  try {
    const { runRoot } = ownRun(runId, options);
    const receiptPath = path.join(runRoot, `reconcile-${input.planLock}.json`);
    let receipt = existsSync(receiptPath) ? json(receiptPath, options) : null;
    if (receipt && (receipt.schema !== RECONCILE_SCHEMA || receipt.planLock !== input.planLock || receipt.runId !== runId
      || !["started", "completed"].includes(receipt.status))) fail("reconcile_receipt_invalid");
    if (receipt) {
      const { planLock, ...projection } = receipt.plan || {};
      if (planLock !== input.planLock || digest(projection) !== input.planLock || receipt.plan.runId !== runId) fail("reconcile_receipt_invalid");
    }
    const recorded = priorReconcileEvent(runRoot, input.planLock, options);
    if (receipt?.status === "completed" && !recorded) fail("reconcile_event_unavailable");
    if (recorded) {
      if (!receipt || recorded.state.target_key !== receipt.plan.targetKey || digest(recorded.state.spec) !== digest(receipt.plan.bindings.spec)
        || digest(recorded.state.last_trial_result) !== digest(receipt.plan.bindings.trialResult)
        || recorded.state.status !== receipt.plan.desiredStatus) fail("reconcile_event_invalid");
      if (ownRun(runId, options).state.version < recorded.sequence) recoverDeliveryLedger(runRoot);
      if (receipt.status === "completed") {
        return { schema: RECONCILE_SCHEMA, runId, applied: receipt.plan.willUpdateLedger, status: recorded.state.status,
          planLock: input.planLock, replayed: true, currentStatus: ownRun(runId, options).state.status,
          acceptance: "unchanged", handoff: receipt.plan.bindings.handoff.status, evidenceScope: "recorded-reconciliation", modelTurns: 0, trialInvocations: 0 };
      }
    } else {
      const plan = planDeliveryReconciliation(runId, options);
      if (plan.planLock !== input.planLock) fail("reconcile_plan_stale");
      if (plan.status !== "ready") fail("reconcile_evidence_pending");
      receipt = { schema: RECONCILE_SCHEMA, runId, planLock: input.planLock, status: "started", startedAt: new Date().toISOString(), plan };
      atomicWriteFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      updateDeliveryLedger(runRoot, state => {
        if (digest(state) !== plan.stateBefore.hash) fail("reconcile_plan_stale");
        return plan.willUpdateLedger
          ? { ...state, status: plan.desiredStatus, phase: "verification_reconciled", next_action: "", blockers: [], workspace: plan.bindings.canonical }
          : state;
      }, { eventType: "delivery_facts_reconciled", payload: { plan_lock: plan.planLock, previous_status: plan.stateBefore.status,
        canonical_revision: plan.bindings.canonical.token, acceptance: "unchanged", handoff: plan.bindings.handoff.status } });
    }
    const state = ownRun(runId, options).state;
    const claimPath = deliveryTargetClaimPath(options.buildsRoot, state.target_key);
    let release = { released: false, reason: "claim_missing" };
    if (["verified", "awaiting_acceptance", "accepted"].includes(state.status)
      && state.target_key === receipt.plan.targetKey && existsSync(claimPath)) {
      json(claimPath, options, 64_000); // Reject a replaced boundary before the claim writer.
      release = releaseDeliveryTarget(claimPath, runId);
    }
    const result = { schema: RECONCILE_SCHEMA, runId, applied: receipt.plan.willUpdateLedger, status: recorded?.state.status || state.status, currentStatus: state.status,
      planLock: input.planLock, replayed: Boolean(recorded), acceptance: "unchanged", handoff: receipt.plan.bindings.handoff.status,
      claimReleased: release.released, evidenceScope: "recorded-reconciliation", modelTurns: 0, trialInvocations: 0 };
    receipt = { ...receipt, status: "completed", completedAt: new Date().toISOString(), result };
    atomicWriteFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return result;
  } finally { lease.release(); }
}
