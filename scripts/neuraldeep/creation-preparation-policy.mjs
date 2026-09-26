export const CREATION_PREPARATION_POLICY_VERSION=2;
// The v2 protocol is unchanged; a job pins the limits profile it was created
// with. Jobs saved without a profile keep the base limits.
export const PREPARATION_LIMITS_PROFILES=Object.freeze({
  'v2-base':Object.freeze({maxRequests:12,freshBytes:64*1024,rotationBytes:96*1024,hardBytes:128*1024,outputTokens:8192,maxRotationsPerPhase:1}),
  'v2-double':Object.freeze({maxRequests:24,freshBytes:128*1024,rotationBytes:192*1024,hardBytes:256*1024,outputTokens:16384,maxRotationsPerPhase:2,
    localReadsWithoutProgress:4,sourceAttemptsPerTopic:4,providerOutageContinuations:2}),
});
// Limits added after v2-base; a base-profile job keeps these original values.
export const BASE_PROFILE_EXTRA_LIMITS=Object.freeze({localReadsWithoutProgress:2,sourceAttemptsPerTopic:2,providerOutageContinuations:1});
export const preparationLimit=(job,key)=>job?.preparationPolicy?.[key] ?? BASE_PROFILE_EXTRA_LIMITS[key];
export const CURRENT_PREPARATION_LIMITS_PROFILE='v2-double';
export const PREPARATION_LIMITS=PREPARATION_LIMITS_PROFILES[CURRENT_PREPARATION_LIMITS_PROFILE];
export function creationPreparationPolicy(budget,executionPolicy=null,limitsProfile=CURRENT_PREPARATION_LIMITS_PROFILE) {
  const limits=PREPARATION_LIMITS_PROFILES[limitsProfile];
  if(!limits)throw Object.assign(new Error('Unknown preparation limits profile.'),{code:'provider_budget_policy_changed',statusCode:409});
  const cap=executionPolicy?.modelProfile?.applicationOutputCap ?? limits.outputTokens;
  if(![8192,16384,32768].includes(cap))throw Object.assign(new Error('Invalid pinned output limit.'),{code:'provider_budget_policy_changed',statusCode:409});
  return {version:CREATION_PREPARATION_POLICY_VERSION,...(limitsProfile==='v2-base'?{}:{limitsProfile}),...limits,outputTokens:cap,briefTokens:Math.floor(budget/10),
    researchTokens:Math.floor(budget/5),totalTokens:Math.floor(budget*3/10),deliveryTokens:budget-Math.floor(budget*3/10)};
}
export const preparationPhase=phase=>['interview','contract','outcome'].includes(phase)?'brief':phase==='research'?'research':null;
export function assertPreparationPolicy(job) {
  if(job.preparationPolicyVersion!==2)return;
  if(JSON.stringify(job.preparationPolicy)!==JSON.stringify(creationPreparationPolicy(job.budget.baseMaxTokens ?? job.budget.maxTokens,job.executionPolicy,job.preparationPolicy?.limitsProfile ?? 'v2-base')))
    throw Object.assign(new Error('The saved preparation policy changed.'),{code:'provider_budget_policy_changed',statusCode:409});
}

/** Final turn accounting replaces its provisional responses. Request count never resets. */
export function creationPreparationUsage(store,job) {
  assertPreparationPolicy(job);
  const rows=store.db.prepare("SELECT p.run_id,r.receipt,p.metadata FROM provider_dispatches p JOIN runtime_receipts r ON r.id=p.run_id WHERE json_extract(p.metadata,'$.creation.jobId')=?").all(job.jobId);
  const phase={brief:0,research:0};let pending=0,unknown=0,unsettledKnown=0;
  const byTurn=new Map();
  for(const row of rows) {
    const metadata=JSON.parse(row.metadata),runtime=JSON.parse(row.receipt),key=runtime.workload_id;
    const entry=byTurn.get(key)||{phase:metadata.creation.phase,tokens:0};
    if(entry.phase!==metadata.creation.phase)throw new Error('creation_request_phase_changed');
    const completion=metadata.completion,tokens=completion?.usage?.totalTokens;
    if(Number.isSafeInteger(tokens)&&tokens>=0)entry.tokens+=tokens;
    else if(!completion && !runtime.process_exited)pending++;
    // A turn settled at its upper bound by an operator Continue is no longer unknown.
    else if(!Number.isSafeInteger(job.budget.turns[key]?.tokens))unknown++;
    byTurn.set(key,entry);
  }
  for(const [turnId,turn] of Object.entries(job.budget.turns)) {
    const phaseKey=preparationPhase(turn.phase),entry=byTurn.get(turnId)||{phase:phaseKey,tokens:0};
    if(phaseKey && Number.isSafeInteger(turn.tokens))entry.tokens=Math.max(entry.tokens,turn.tokens);
    if(phaseKey)entry.phase=phaseKey;
    byTurn.set(turnId,entry);
  }
  for(const [turnId,entry] of byTurn) {
    if(entry.phase in phase)phase[entry.phase]+=entry.tokens;
    if(!Number.isSafeInteger(job.budget.turns[turnId]?.tokens))unsettledKnown+=entry.tokens;
  }
  const total=phase.brief+phase.research,policy=job.preparationPolicy;
  const unusedBrief=Math.max(0,policy.briefTokens-phase.brief);
  const researchCeiling=Math.min(policy.researchTokens+unusedBrief,policy.totalTokens-phase.brief);
  return {version:2,phase,phaseRemaining:{brief:unusedBrief,research:Math.max(0,researchCeiling-phase.research)},
    total,remaining:Math.max(0,policy.totalTokens-total),requests:rows.length,requestsRemaining:Math.max(0,policy.maxRequests-rows.length),
    pendingRequests:pending,unknownRequests:unknown,unsettledKnown,confirmedTotal:job.budget.tokensUsed+unsettledKnown,
    deliveryProtected:policy.deliveryTokens,availableForDelivery:pending||unknown?null:Math.max(0,job.budget.maxTokens-total)};
}
