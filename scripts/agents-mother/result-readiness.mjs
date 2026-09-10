import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolvePrithaStatePathFrom, resolvePrithaStateRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { findCatalogAgent, readAgentCatalog, readCatalogArtifact, readIdentityEvidence } from "./identity.mjs";
import { normalizeDeliveryLedger, targetKey, validateDeliveryLedger } from "./delivery-ledger.mjs";
import { approvedTrialPlan, verifyCompiledTrialPlan } from "./outcome-spec.mjs";
import { verifyTrialResultFreshness, verifyTrialResultIntegrity } from "./trial-runner.mjs";

export const RESULT_READINESS_SCHEMA = "pritha-result-readiness-v1";
const hash = value => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const id = value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function json(file, boundary, max = 5_000_000) {
  const text = readIdentityEvidence(file, boundary, max);
  if (!text) throw new Error("evidence-unavailable");
  return JSON.parse(text);
}
function runRoots(buildsRoot) {
  const roots = [];
  if (!existsSync(buildsRoot)) return { roots, truncated: false };
  for (const agent of readdirSync(buildsRoot, { withFileTypes: true })) {
    if (!agent.isDirectory() || !id(agent.name)) continue;
    const directory = path.join(buildsRoot, agent.name);
    for (const run of readdirSync(directory, { withFileTypes: true })) {
      if (!run.isDirectory() || !id(run.name)) continue;
      if (roots.length === 2000) return { roots, truncated: true };
      roots.push(path.join(directory, run.name));
    }
  }
  return { roots, truncated: false };
}

function acceptanceReceipt(runRoot, state, stateRoot) {
  if (!state.accepted_at && state.accepted_by !== "user" && state.status !== "accepted") return null;
  const text = readIdentityEvidence(path.join(runRoot, "events.jsonl"), stateRoot, 50_000_000);
  if (!text) return null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.schema !== "pritha-delivery-event-v1" || event.type !== "delivery_accepted_by_user" || event.run_id !== state.run_id) continue;
    const accepted = event.state;
    if (!validateDeliveryLedger(accepted).ok || accepted?.status !== "accepted" || accepted.accepted_by !== "user" || !accepted.accepted_at
      || accepted.accepted_at !== state.accepted_at || accepted.run_id !== state.run_id || accepted.target_key !== state.target_key
      || !same(accepted.spec, state.spec) || !same(accepted.last_trial_result, state.last_trial_result)
      || !Number.isSafeInteger(event.sequence) || event.sequence !== accepted.version || event.sequence > state.version
      || typeof event.event_id !== "string" || !event.event_id || event.occurred_at !== accepted.updated_at) continue;
    return { at: accepted.accepted_at, eventId: typeof event.event_id === "string" ? event.event_id : null };
  }
  return null;
}

function trialCounts(result, plan) {
  if (!Array.isArray(result.trials) || result.trials.length !== plan.trials.length) throw new Error("trial-set-changed");
  const seen = new Set();
  for (const row of result.trials) {
    const trial = plan.trials.find(item => item.id === row.id);
    if (!trial || seen.has(row.id) || row.kind !== trial.kind) throw new Error("trial-set-changed");
    seen.add(row.id);
  }
  const automated = result.trials.filter(row => row.kind === "automated");
  const passed = automated.filter(row => row.status === "passed");
  const operator = result.trials.filter(row => row.kind === "operator-judged");
  return { automated: automated.length, passed: passed.length, failed: automated.length - passed.length, operator: operator.length,
    status: passed.length !== automated.length ? "failed" : !automated.length || operator.length || !plan.autonomous_verification_allowed ? "awaiting_operator" : "verified" };
}

function freshness(result, project, options) {
  if (!project || !existsSync(project)) return { ok: false, reason: "workspace-unavailable" };
  try {
    const checked = verifyTrialResultFreshness(result, project, { ...options, workspaceRevisionOptions: { requireComplete: true } });
    return checked.ok && checked.current?.dirty === true ? { ...checked, ok: false, reason: "workspace-dirty" } : checked;
  }
  catch { return { ok: false, reason: "revision-unavailable" }; }
}

function verificationStatus(checked, counts) {
  if (checked.ok) return counts.status;
  return ["workspace_revision_changed", "asserted_artifact_changed", "outcome_spec_changed", "workspace-dirty"].includes(checked.reason) ? "stale" : "unknown";
}

// This read model never repairs files, executes Trials, accepts a result, merges
// a branch or removes a worktree. The asynchronous host adapter bounds its work.
export function readAgentResultReadiness(target, input = {}) {
  const root = path.resolve(input.root || resolveTechscopeRoot());
  const stateRoot = resolvePrithaStateRoot({ ...input, root });
  const options = { ...input, root, stateRoot, fresh: true };
  const agent = findCatalogAgent(readAgentCatalog(options), target);
  const view = { schema: RESULT_READINESS_SCHEMA, agentId: agent?.agentId || null,
    verification: { status: "unverified", scope: "canonical-project", reason: "no-current-evidence", counts: null, head: null },
    candidate: { status: "unverified", reason: "no-current-evidence", head: null },
    acceptance: { status: "not_accepted", at: null }, run: null, evidenceIssues: 0, truncated: false };
  if (input.runId !== undefined && !id(input.runId)) {
    view.verification.reason = "run-identity-invalid"; return view;
  }
  if (!agent?.projectPath || agent.identityStatus === "conflict") {
    view.verification.reason = "project-identity-unavailable"; return view;
  }
  const contract = agent.artifacts.find(item => item.path === agent.contractSource);
  if (!contract || !readCatalogArtifact(agent, contract.path, options)) {
    view.verification.reason = "contract-unavailable"; return view;
  }
  const outcome = agent.artifacts.find(item => item.type === "agent-outcome-spec" && item.contractPath === contract.path);
  if (!outcome || !readCatalogArtifact(agent, outcome.path, options)) {
    view.verification.reason = "outcome-unavailable"; return view;
  }
  let currentPlan;
  try { currentPlan = approvedTrialPlan(outcome.path, options); }
  catch { view.verification.reason = "outcome-approval-not-current"; return view; }
  const buildsRoot = resolvePrithaStatePathFrom({ root, stateRoot }, "builds");
  const candidates = [];
  try {
    const found = runRoots(buildsRoot); view.truncated = found.truncated;
    if (found.truncated) { view.verification.status = "unknown"; view.verification.reason = "run-inventory-truncated"; return view; }
    for (const runRoot of found.roots) {
      let state;
      try { state = normalizeDeliveryLedger(json(path.join(runRoot, "build-state.json"), stateRoot)); } catch { continue; }
      if (state?.source_project !== agent.projectPath || state?.target_key !== targetKey(agent.projectPath)) continue;
      if (!validateDeliveryLedger(state).ok || state.run_id !== path.basename(runRoot)) { view.evidenceIssues++; continue; }
      if (input.runId !== undefined && state.run_id !== input.runId) continue;
      const spec = state.spec;
      if (spec?.id !== currentPlan.spec_id || spec.contract_fingerprint !== currentPlan.contract_fingerprint
        || spec.document_lock !== currentPlan.document_lock || spec.semantic_lock !== currentPlan.semantic_lock || spec.approval_id !== currentPlan.approval_id) continue;
      candidates.push({ runRoot, state });
    }
  } catch { view.evidenceIssues++; }
  const candidate = candidates.sort((a, b) => String(b.state.updated_at).localeCompare(String(a.state.updated_at)))[0];
  if (!candidate) return view;
  const { runRoot, state } = candidate;
  view.run = { id: state.run_id, status: state.status, updatedAt: state.updated_at };
  if (!state.last_trial_result?.path) return view;
  try {
    const plan = json(path.join(runRoot, "trial-plan.json"), stateRoot);
    if (typeof plan.spec_path !== "string" || path.resolve(root, plan.spec_path) !== outcome.path
      || plan.spec_id !== currentPlan.spec_id || plan.approval_id !== currentPlan.approval_id
      || plan.document_lock !== currentPlan.document_lock || plan.semantic_lock !== currentPlan.semantic_lock
      || plan.contract_fingerprint !== currentPlan.contract_fingerprint
      || !verifyCompiledTrialPlan(plan, options)) throw new Error("saved-plan-changed");
    const reference = state.last_trial_result;
    if (!/^trial-results\/verification-\d+\.json$/.test(reference.path)) throw new Error("trial-reference-invalid");
    const result = json(path.join(runRoot, reference.path), stateRoot, 20_000_000);
    if (!verifyTrialResultIntegrity(result) || result.evidence_lock !== reference.evidence_lock || result.plan_lock !== hash(plan) || result.spec_id !== plan.spec_id
      || result.approval_id !== plan.approval_id || result.contract_fingerprint !== plan.contract_fingerprint
      || result.semantic_lock !== plan.semantic_lock || result.document_lock !== plan.document_lock) throw new Error("trial-binding-changed");
    const counts = trialCounts(result, plan);
    const canonical = freshness(result, agent.projectPath, { ...options, outcomeSpecPath: outcome.path });
    const metadata = json(path.join(runRoot, "delivery-worktree.json"), stateRoot, 128_000);
    if (!["pritha-delivery-worktree-v1", "pritha-delivery-worktree-v2"].includes(metadata.schema) || metadata.run_id !== state.run_id
      || metadata.source_project !== agent.projectPath || metadata.worktree !== path.join(runRoot, "worktree")
      || metadata.branch !== `pritha/build-${state.run_id}`) throw new Error("worktree-binding-changed");
    const build = freshness(result, metadata.worktree, { ...options, outcomeSpecPath: outcome.path });
    view.verification = { status: verificationStatus(canonical, counts), scope: "canonical-project", reason: canonical.reason,
      counts, head: canonical.current?.head || null };
    view.candidate = { status: verificationStatus(build, counts), reason: build.reason, head: build.current?.head || null };
    const receipt = acceptanceReceipt(runRoot, state, stateRoot);
    if (receipt) view.acceptance = { status: canonical.ok ? "accepted" : view.verification.status === "unknown" ? "unknown" : "recorded_for_other_revision", at: receipt.at };
    else if (state.status === "accepted" || state.accepted_by === "user") view.acceptance.status = "unknown";
  } catch {
    view.evidenceIssues++;
    view.verification.status = "unknown"; view.verification.reason = "evidence-invalid-or-unavailable";
  }
  return view;
}
