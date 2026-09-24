import {neuralDeepExecutionProfile,effectiveNeuralDeepEffort} from './model-execution-profile.mjs';
const positive = value => Number.isSafeInteger(value) && value > 0;

export function creationExecutionPolicy({modelId,effortId=null,timeoutMs=1_800_000,promptTokenBudget=48_000}={}) {
  if (typeof modelId!=='string' || !modelId || modelId.length>200) throw new Error('creation_model_policy_invalid');
  return {schema:'pritha-creation-execution-policy-v2',version:2,modelId,effortId,
    effectiveEffortId:effectiveNeuralDeepEffort(modelId,effortId),modelProfile:neuralDeepExecutionProfile(modelId),
    iterationTimeoutMs:positive(timeoutMs)?Math.min(timeoutMs,1_800_000):1_800_000,
    requestTimeoutMs:930_000,settlementGraceMs:30_000,
    configuredPromptTokenBudget:positive(promptTokenBudget)?promptTokenBudget:48_000,
    promptBudgetApplicability:'general-chat setting; creation uses pinned preparation byte caps and measured request accounting',
    appliesTo:'new-creation-job; model-and-deadlines-pinned'};
}

/** Host preparation makes one bounded response; its live request uses the remaining step time. */
export function preparationExecutionDeadline(job,now=Date.now()) {
  const policy=job?.executionPolicy;
  if (!policy || policy.version===1) return null;
  if (policy.version!==2 || !positive(policy.iterationTimeoutMs) || policy.iterationTimeoutMs>1_800_000
    || !positive(policy.settlementGraceMs) || !positive(job.budget?.maxActiveMs) || !positive(now)
    || !Number.isSafeInteger(job.budget?.activeMs) || job.budget.activeMs<0) throw new Error('execution_deadline_invalid');
  const remaining=Math.min(policy.iterationTimeoutMs,job.budget.maxActiveMs-job.budget.activeMs);
  if (remaining<3) throw Object.assign(new Error('Creation time budget reached; saved work is preserved.'),{code:'provider_iteration_deadline',statusCode:409});
  const grace=Math.max(1,Math.min(policy.settlementGraceMs,Math.floor(remaining/10)));
  const window=remaining-grace;
  // Do not admit a fresh request in the final minute (or final half of a short window).
  const minimumWindow=Math.max(1,Math.min(60_000,Math.floor(window/2)));
  return {version:2,hardDeadlineAt:now+remaining,softDeadlineAt:now+remaining-grace-minimumWindow,
    requestTimeoutMs:window,settlementGraceMs:grace};
}

export function executionDeadline({hardDeadlineAt,requestTimeoutMs=930_000,settlementGraceMs=30_000},now=Date.now()) {
  if (!positive(hardDeadlineAt) || !positive(requestTimeoutMs) || !positive(settlementGraceMs)) throw new Error('execution_deadline_invalid');
  const remaining=hardDeadlineAt-now;
  if (remaining<3) throw Object.assign(new Error('Iteration deadline reached; saved work is preserved.'),{code:'provider_iteration_deadline',statusCode:409});
  const grace=Math.max(1,Math.min(settlementGraceMs,Math.floor(remaining/10)));
  const requestWindow=Math.max(1,Math.min(requestTimeoutMs,Math.floor((remaining-grace)*0.8)));
  return {version:1,hardDeadlineAt,softDeadlineAt:hardDeadlineAt-grace-requestWindow,
    requestTimeoutMs:requestWindow,settlementGraceMs:grace};
}

export function requestDeadlineWindow(deadline,now=Date.now()) {
  if (!deadline) return null;
  if (![1,2].includes(deadline.version) || !['hardDeadlineAt','softDeadlineAt','requestTimeoutMs','settlementGraceMs'].every(key=>positive(deadline[key]))
    || (deadline.version===1 ? deadline.softDeadlineAt+deadline.requestTimeoutMs+deadline.settlementGraceMs>deadline.hardDeadlineAt
      : deadline.requestTimeoutMs>1_800_000 || deadline.softDeadlineAt+deadline.settlementGraceMs>=deadline.hardDeadlineAt
        || deadline.hardDeadlineAt-deadline.softDeadlineAt-deadline.settlementGraceMs>deadline.requestTimeoutMs)) throw new Error('execution_deadline_invalid');
  if (now>deadline.softDeadlineAt) throw Object.assign(new Error('Not enough iteration time remains for a complete provider request and accounting. Saved work is preserved.'),{code:'provider_iteration_deadline',statusCode:409});
  return Math.min(deadline.requestTimeoutMs,deadline.hardDeadlineAt-deadline.settlementGraceMs-now);
}
