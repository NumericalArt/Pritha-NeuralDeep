const positive = value => Number.isSafeInteger(value) && value > 0;

export function creationExecutionPolicy({modelId,effortId=null,timeoutMs=1_800_000,promptTokenBudget=48_000}={}) {
  if (typeof modelId!=='string' || !modelId || modelId.length>200) throw new Error('creation_model_policy_invalid');
  return {schema:'pritha-creation-execution-policy-v1',version:1,modelId,effortId,
    iterationTimeoutMs:positive(timeoutMs)?Math.min(timeoutMs,1_800_000):1_800_000,
    requestTimeoutMs:930_000,settlementGraceMs:30_000,
    configuredPromptTokenBudget:positive(promptTokenBudget)?promptTokenBudget:48_000,
    appliesTo:'new-creation-job; model-and-deadlines-pinned'};
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
  if (deadline.version!==1 || !['hardDeadlineAt','softDeadlineAt','requestTimeoutMs','settlementGraceMs'].every(key=>positive(deadline[key]))
    || deadline.softDeadlineAt+deadline.requestTimeoutMs+deadline.settlementGraceMs>deadline.hardDeadlineAt) throw new Error('execution_deadline_invalid');
  if (now>deadline.softDeadlineAt) throw Object.assign(new Error('Not enough iteration time remains for a complete provider request and accounting. Saved work is preserved.'),{code:'provider_iteration_deadline',statusCode:409});
  return Math.min(deadline.requestTimeoutMs,deadline.hardDeadlineAt-deadline.settlementGraceMs-now);
}
