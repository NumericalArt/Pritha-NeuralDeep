import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { acquireFileLock, atomicWriteFile } from "../lib/atomic-file.mjs";
import { resolvePrithaStatePathFrom } from "../lib/paths.mjs";
import { deliverOutcome, findDeliveryRun, resumeDelivery, withDeliveryHostControl } from "../agents-mother/delivery-loop.mjs";
import { deliveryUsageStatus, readDeliveryLedger } from "../agents-mother/delivery-ledger.mjs";
import { readDeliveryWorktree } from "../agents-mother/delivery-worktree.mjs";
import { performTaskDeliveryAction, readTaskDelivery } from "../agents-mother/task-delivery.mjs";
import { verifyTrialResultFreshness } from "../agents-mother/trial-runner.mjs";
import { workspaceRevision } from "../agents-mother/workspace-revision.mjs";
import { deliveryAccountingLineage } from "./creation-usage-lineage.mjs";
import { deliveryProcessesExited, trialModelUse } from "../agents-mother/trial-model-use.mjs";
import { verifyOutcomeApproval, verifyCompiledTrialPlan } from "../agents-mother/outcome-spec.mjs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";

const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const taskHash = task => digest([task?.chatId, task?.providerId, task?.stateIdentityHash, task?.nativeThreadId]);
const completed = new Set(["verified", "awaiting_acceptance"]);
export class CreationDeliveryError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new CreationDeliveryError(code, message); };
const git = (directory, args) => execFileSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd: directory, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "pipe"] }).trim();
export function creationDeliveryRunId(job) { return `creation-${digest([job.instanceId, job.jobId]).slice(0, 40)}`; }
function paths(job, options) {
  const runId = creationDeliveryRunId(job);
  const receiptPath = resolvePrithaStatePathFrom(options, "audit", "creation-delivery", `${runId}.json`);
  return { runId, receiptPath };
}
function receiptFor(job, options) {
  const { runId, receiptPath } = paths(job, options);
  if (!existsSync(receiptPath)) return null;
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (receipt.schema !== "pritha-creation-delivery-v1" || receipt.jobId !== job.jobId || receipt.releaseSha !== job.releaseSha
    || receipt.runId !== runId || receipt.sourceProject !== realpathSync(job.target)
    || receipt.taskHash !== taskHash(options.task) || receipt.outcomePath !== path.resolve(job.outcome.path)) fail("creation_delivery_identity_changed");
  return receipt;
}
function writeReceipt(job, options, receipt) { atomicWriteFile(paths(job, options).receiptPath, `${JSON.stringify(receipt, null, 2)}\n`); }

function recoveryState(job, options, receipt, runRoot, state) {
  const blocked = reason => ({verifySaved:false,adoptVerified:false,evidenceFresh:false,modelUse:'unknown',reason});
  if (!deliveryProcessesExited(state.budget)) return blocked('creation_execution_unconfirmed');
  if (job.budget.unknownAttempts.some(id=>id!==state.run_id)) return blocked('creation_preparation_usage_unknown');
  const metadata=readDeliveryWorktree(runRoot);
  if (!metadata || metadata.source_project!==receipt.sourceProject || metadata.base_revision!==receipt.scaffoldRevision) return blocked('creation_scaffold_baseline_changed');
  try {
    const plan=JSON.parse(readBoundedRegularFile(path.join(runRoot,'trial-plan.json'),{allowedRoots:[runRoot]}).text);
    if (!verifyCompiledTrialPlan(plan,options) || !verifyOutcomeApproval(job.outcome.path,options).ok) return blocked('creation_candidate_evidence_stale');
    const backend=plan.execution_policy?.trial_backend_policy==='local-trusted-only'?'local':'codex-cli';
    const modelUse=trialModelUse(plan,backend);
    const candidate=workspaceRevision(metadata.worktree,{requireComplete:true});
    const source=workspaceRevision(receipt.sourceProject,{requireComplete:true});
    if (source.dirty || ![receipt.scaffoldRevision,candidate.head].includes(source.head)) return blocked('creation_source_changed');
    const evidenceFresh=Boolean(completed.has(state.status) && metadata.verified_checkpoint===candidate.head && !candidate.dirty && state.last_trial_result?.path
      && verifyTrialResultFreshness(path.join(runRoot,state.last_trial_result.path),metadata.worktree,{...options,outcomeSpecPath:job.outcome.path,workspaceRevisionOptions:{requireComplete:true}}).ok);
    return {verifySaved:evidenceFresh || modelUse.kind==='none',adoptVerified:evidenceFresh && !receipt.adoptedHead,
      evidenceFresh,modelUse:modelUse.kind,reason:evidenceFresh?'verified-candidate-preserved':modelUse.kind==='none'?'sandbox-verification-available':'trial_model_usage_unknown'};
  } catch { return blocked('creation_candidate_evidence_stale'); }
}

export function readCreationDelivery(job, options) {
  const receipt = receiptFor(job, options), runRoot = findDeliveryRun(creationDeliveryRunId(job), options);
  if (!receipt || !runRoot) return null;
  const state = readDeliveryLedger(runRoot), coverage = deliveryUsageStatus(state.budget);
  return { runId: state.run_id, runRoot, status: state.status, blocker: state.blockers?.[0] || null,
    runtimeAccounting: deliveryAccountingLineage(state, runRoot),
    recovery: recoveryState(job, options, receipt, runRoot, state),
    adopted: Boolean(receipt.adoptedHead), head: receipt.adoptedHead || null, acceptance: "not_accepted",
    usage: { preparationTokens: receipt.preparationTokens, deliveryTokens: state.budget.tokens_used,
      knownTotalTokens: receipt.preparationTokens + state.budget.tokens_used, coverage,
      activeMs: receipt.preparationActiveMs + receipt.activeMs + (receipt.startedAt ? Math.max(0, Date.now() - Date.parse(receipt.startedAt)) : 0),
      iterations: state.iteration, maxTokens: receipt.totalMaxTokens,
      scope: "creation-preparation-and-build; command-internal-model-use-not-assumed-zero" },
    taskDelivery: readTaskDelivery(state.run_id, options.task, options) };
}

async function bindToTask(runId, task, options) {
  const view = readTaskDelivery(runId, task, options);
  if (view.bindingStatus === "bound") return view;
  if (view.bindingStatus !== "unbound") fail("creation_delivery_other_task", "This delivery belongs to another native task");
  return (await performTaskDeliveryAction(task, { runId, requestId: `creation-bind-${runId}`, expectedRevision: view.revision, action: "bind" }, options)).run;
}

// Host adoption is confined to the newly reserved target at its recorded
// scaffold commit. It never merges into an existing user project or resolves a
// conflict by resetting, stashing, overwriting, or choosing one side.
async function adoptVerified(job, options, receipt, runRoot, mayContinue) {
  return withDeliveryHostControl(receipt.runId,options,async()=>{
  const state = readDeliveryLedger(runRoot), metadata = readDeliveryWorktree(runRoot);
  if (!completed.has(state.status) || !metadata?.verified_checkpoint) return receipt;
  if (!deliveryProcessesExited(state.budget)) fail('creation_execution_unconfirmed');
  const safety=recoveryState(job,options,receipt,runRoot,state);
  if (!safety.evidenceFresh) fail(safety.reason);
  if (metadata.source_project !== receipt.sourceProject || metadata.base_revision !== receipt.scaffoldRevision) fail("creation_scaffold_baseline_changed");
  if (!await mayContinue()) fail("creation_paused", "Creation paused before adopting its verified result");
  const candidate = workspaceRevision(metadata.worktree, { requireComplete: true });
  if (candidate.dirty || candidate.head !== metadata.verified_checkpoint) fail("creation_candidate_changed");
  const evidence = path.join(runRoot, state.last_trial_result.path);
  const verification = { ...options, outcomeSpecPath: job.outcome.path, workspaceRevisionOptions: { requireComplete: true } };
  if (!verifyTrialResultFreshness(evidence, metadata.worktree, verification).ok) fail("creation_candidate_evidence_stale");
  const source = workspaceRevision(receipt.sourceProject, { requireComplete: true });
  if (source.dirty || ![receipt.scaffoldRevision, candidate.head].includes(source.head)) fail("creation_source_changed", "The target changed after scaffold; the verified candidate is preserved separately");
  if (source.head !== candidate.head) {
    git(receipt.sourceProject, ["merge-base", "--is-ancestor", receipt.scaffoldRevision, candidate.head]);
    git(receipt.sourceProject, ["merge", "--ff-only", "--no-overwrite-ignore", candidate.head]);
  }
  if (!verifyTrialResultFreshness(evidence, receipt.sourceProject, verification).ok) fail("creation_canonical_verification_stale");
  if (receipt.adoptedHead === candidate.head) return receipt;
  // The exact clean commit and its locked evidence have just been checked at
  // both paths. Adoption must not run arbitrary product commands or inference.
  receipt.adoptedHead = candidate.head;
  receipt.adoptedAt = new Date().toISOString();
  writeReceipt(job, options, receipt);
  return receipt;
  });
}

export async function recoverCreationDelivery(job, options = {}) {
  if (!options.task || options.task.chatId!==job.chatId || !['verify_saved','adopt_verified'].includes(options.action)) fail('creation_delivery_task_mismatch');
  const {runId,receiptPath}=paths(job,options), lock=acquireFileLock(`${receiptPath}.execution`);
  try {
    const receipt=receiptFor(job,options),runRoot=findDeliveryRun(runId,options);
    if (!receipt || !runRoot || readTaskDelivery(runId,options.task,options).bindingStatus!=='bound') fail('creation_delivery_not_ready');
    const state=readDeliveryLedger(runRoot), recovery=recoveryState(job,options,receipt,runRoot,state);
    if (options.action==='adopt_verified') {
      if (receipt.adoptedHead && recovery.evidenceFresh) return readCreationDelivery(job,options);
      if (!recovery.adoptVerified) fail(recovery.reason);
      await adoptVerified(job,options,receipt,runRoot,async()=>!options.signal?.aborted);
    } else {
      if (!recovery.verifySaved) fail(recovery.reason);
      if (!recovery.evidenceFresh) {
        const view=readTaskDelivery(runId,options.task,options);
        await performTaskDeliveryAction(options.task,{runId,requestId:options.requestId,expectedRevision:view.revision,action:'verify'},options);
      }
    }
    return readCreationDelivery(job,options);
  } finally { lock.release(); }
}

export async function runCreationDelivery(job, options = {}) {
  if (!job?.scaffoldReady || !job?.approvals?.contract || !job?.approvals?.outcome || !job.outcome?.path) fail("creation_delivery_not_ready");
  if (!/^[a-f0-9]{40,64}$/.test(job.scaffoldReceipt?.revision || "")) fail("creation_scaffold_revision_missing");
  if (job.budget?.unknownAttempts?.length) fail("creation_usage_unknown");
  if (!options.task || options.task.chatId !== job.chatId) fail("creation_delivery_task_mismatch");
  const { runId, receiptPath } = paths(job, options);
  const lock = acquireFileLock(`${receiptPath}.execution`);
  let receipt, start = Date.now();
  const mayContinue = async () => !options.signal?.aborted && (!options.shouldContinue || await options.shouldContinue());
  try {
    if (!await mayContinue()) fail("creation_paused");
    receipt = receiptFor(job, options);
    if (!receipt) {
      const source = workspaceRevision(job.target, { requireComplete: true });
      if (source.dirty || source.head !== job.scaffoldReceipt.revision) fail("creation_scaffold_baseline_changed");
      const budget = job.budget;
      if (!Number.isSafeInteger(budget.tokensUsed) || !Number.isSafeInteger(budget.activeMs) || budget.tokensUsed < 0 || budget.activeMs < 0) fail("creation_budget_invalid");
      if (![budget.maxTokens, budget.maxActiveMs, budget.maxIterations, budget.repeatedFailureThreshold].every(value => Number.isSafeInteger(value) && value > 0)) fail("creation_budget_invalid");
      receipt = { schema: "pritha-creation-delivery-v1", runId, jobId: job.jobId, releaseSha: job.releaseSha,
        sourceProject: realpathSync(job.target), scaffoldRevision: source.head, outcomePath: path.resolve(job.outcome.path), taskHash: taskHash(options.task),
        preparationTokens: budget.tokensUsed, preparationActiveMs: budget.activeMs,
        totalMaxTokens: Math.min(budget.maxTokens, 1_000_000), totalMaxActiveMs: Math.min(budget.maxActiveMs, 5_400_000),
        maxIterations: Math.min(budget.maxIterations, 6), repeatedFailureThreshold: Math.min(budget.repeatedFailureThreshold, 3),
        activeMs: 0, startedAt: null, adoptedHead: null };
    }
    // A stale startedAt is an interrupted run: charge its elapsed interval
    // conservatively rather than silently treating the unobserved time as zero.
    if (receipt.startedAt) receipt.activeMs += Math.max(0, start - Date.parse(receipt.startedAt));
    receipt.startedAt = new Date(start).toISOString();
    writeReceipt(job, options, receipt);
    const remainingTokens = receipt.totalMaxTokens - receipt.preparationTokens;
    const remainingMs = receipt.totalMaxActiveMs - receipt.preparationActiveMs - receipt.activeMs;
    if (remainingTokens <= 0 || remainingMs <= 0) fail("creation_budget_exhausted");
    const beforeDispatch = async () => {
      if (!await mayContinue()) fail("creation_paused");
      if (Date.now() - start >= remainingMs) fail("elapsed_budget_exhausted");
    };
    const input = { ...options, runId, creationJobId: job.jobId, beforeDispatch, shouldContinue: mayContinue,
      buildExecutorOptions: { model: job.executionPolicy?.modelId || options.model, effort: job.executionPolicy ? job.executionPolicy.effectiveEffortId || 'none' : options.effort },
      // Legacy jobs retain their original executor policy. New jobs pin the
      // configured limit and give every phase the same enclosing deadline.
      executorTimeoutMs: Math.min(job.executionPolicy?.iterationTimeoutMs || 12 * 60_000, remainingMs),
      ...(job.executionPolicy ? {executionPolicy:job.executionPolicy,jobDeadlineAt:start+remainingMs} : {}),
      budget: { maxTokens: remainingTokens, maxElapsedMs: remainingMs, maxIterations: receipt.maxIterations,
        repeatedFailureThreshold: receipt.repeatedFailureThreshold, tokenBudgetSource: "creation-job-remaining", goalEnforcement: "not-applicable" },
      onLedgerReady: async () => { await bindToTask(runId, options.task, options); await options.onRunId?.(runId); } };
    const existing = findDeliveryRun(runId, options);
    if (existing) {
      await bindToTask(runId, options.task, options); await options.onRunId?.(runId);
      const state = readDeliveryLedger(existing);
      if (state.budget.max_tokens > remainingTokens || state.budget.max_iterations > receipt.maxIterations) fail("creation_budget_binding_changed");
      if (!completed.has(state.status)) await resumeDelivery(runId, { ...input,
        ...(state.status === "blocked" && ["creation_paused", "build_executor_aborted"].includes(state.blockers?.[0]?.code) ? { answer: "retry", answeredBy: "user" } : {}) });
    } else await deliverOutcome(job.outcome.path, job.target, input);
    const runRoot = findDeliveryRun(runId, options);
    receipt = await adoptVerified(job, options, receipt, runRoot, mayContinue);
    return readCreationDelivery(job, options);
  } catch (error) {
    if (receipt && findDeliveryRun(runId, options)) {
      const result = readCreationDelivery(job, options);
      return { ...result, status: "blocked", blocker: { code: error.code || "creation_delivery_failed", summary: error.message } };
    }
    throw error;
  } finally {
    if (receipt) {
      receipt.activeMs += Math.max(0, Date.now() - start); receipt.startedAt = null;
      writeReceipt(job, options, receipt);
    }
    lock.release();
  }
}
