import { createHash } from 'node:crypto';
import { dispatchBlockerMessage } from './dispatch-blocker-message.mjs';

/** Read the launcher's accounting deltas, never cumulative model stdout totals. */
export function creationRuntimeReceipt(coordination,turnId,{dispatched=true}={}) {
  const rows=coordination.db.prepare("SELECT id,receipt FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=? ORDER BY id").all(turnId);
  if(!rows.length)return {receiptId:null,tokens:dispatched?null:0,processExited:!dispatched,coverage:dispatched?'unknown':'complete',runs:[]};
  let tokens=0,known=true,processExited=true,blocker=null;
  const runs=[];
  for(const row of rows) {
    const receipt=JSON.parse(row.receipt),usage=receipt.usage_record;
    if(receipt.budget_blocker)blocker={code:receipt.budget_blocker.code,message:dispatchBlockerMessage(receipt.budget_blocker.code)};
    const noDispatch=receipt.exit_evidence==='no_stock_dispatch' && receipt.dispatch_authorized===false;
    if(noDispatch && receipt.bootstrap_error?.code)blocker={code:receipt.bootstrap_error.code,message:dispatchBlockerMessage(receipt.bootstrap_error.code)};
    const exited=receipt.process_exited===true && receipt.process_tree_exited===true && receipt.adapter_closed===true;
    processExited &&= exited;
    const delta=usage?.usageKnown===true ? usage.usage?.totalTokens : noDispatch ? 0 : null;
    if(!Number.isSafeInteger(delta) || delta<0 || !Number.isSafeInteger(tokens+delta))known=false;
    else tokens+=delta;
    runs.push({runId:row.id,tokens:delta,processExited:exited});
  }
  const receiptId='creation_receipt_'+createHash('sha256').update(JSON.stringify(runs)).digest('hex');
  return {receiptId,tokens:known?tokens:null,processExited,coverage:known?'complete':'unknown',runs,...(blocker?{blocker}:{})};
}

/** A read-only lower bound: never settles an unknown turn or charges it twice. */
export function creationObservedUsage(coordination,job) {
  const turnIds=[...new Set([job.activeTurnId,...job.budget.unknownAttempts].filter(Boolean))];
  const binding = job.delivery?.runtimeAccounting?.deliveryRunId === job.deliveryRunId ? job.delivery.runtimeAccounting : null;
  const runs = new Set(), accounted = new Set(binding?.accountedRunIds || []);
  let unboundAttempts = binding?.unboundAttempts?.length || 0;
  for(const turnId of turnIds) {
    if(Number.isSafeInteger(job.budget.turns?.[turnId]?.tokens))continue;
    const rows=coordination.db.prepare("SELECT id FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=?").all(turnId);
    for(const row of rows) runs.add(row.id);
    if (!rows.length && (turnId !== job.deliveryRunId || !binding)) unboundAttempts++;
  }
  if (binding?.deliveryRunId === job.deliveryRunId) for (const id of binding.unsettledRunIds) runs.add(id);
  if (job.jobId && job.deliveryRunId) {
    for (const row of coordination.db.prepare('SELECT run_id FROM runtime_lineage WHERE creation_job_id=? AND delivery_run_id=?').all(job.jobId,job.deliveryRunId)) runs.add(row.run_id);
  }
  let unfinalizedTokens=0,unknownRequests=0,pendingRequests=0,reservedTokens=0;
  let providerProgress=null;
  const provenance = [];
  for (const id of runs) {
    const receipt = coordination.runtimeRun(id);
    if (!receipt) { unboundAttempts++; continue; }
    const p=receipt.provider_progress;
    if(p && ['waiting','receiving','finished','failed'].includes(p.state) && Number.isFinite(Date.parse(p.at)) && (!providerProgress || Date.parse(p.at)>Date.parse(providerProgress.at))) {
      const number=value=>Number.isSafeInteger(value) && value>=0?value:null;
      providerProgress={state:p.state,at:p.at,elapsedMs:number(p.elapsedMs),firstByteMs:number(p.timings?.firstByteMs),lastByteMs:number(p.timings?.lastByteMs),responseBytes:number(p.timings?.responseBytes)};
    }
    if (accounted.has(id)) continue;
    const summary=coordination.providerUsageSummary(id);
    const exited=receipt.process_exited===true && receipt.process_tree_exited===true && receipt.adapter_closed===true;
    unfinalizedTokens+=summary.usage.totalTokens;
    if (exited) unknownRequests+=summary.unknownRequests;
    else pendingRequests+=summary.unknownRequests;
    for (const row of coordination.db.prepare('SELECT metadata FROM provider_dispatches WHERE run_id=?').all(id)) {
      const metadata=JSON.parse(row.metadata);
      if (!metadata.completion?.usage && Number.isSafeInteger(metadata.budget?.reservation)) reservedTokens+=metadata.budget.reservation;
    }
    provenance.push({runId:id,measuredTokens:summary.usage.totalTokens,unresolvedRequests:summary.unknownRequests,processExited:exited});
  }
  const knownMinimumTokens=job.budget.tokensUsed+unfinalizedTokens;
  if (![knownMinimumTokens,unfinalizedTokens,unknownRequests,pendingRequests,reservedTokens].every(Number.isSafeInteger))throw new Error('creation_usage_overflow');
  return {finalizedTokens:job.budget.tokensUsed,knownMinimumTokens,unfinalizedTokens,unknownRequests,pendingRequests,reservedTokens,unboundAttempts,
    coverage:unknownRequests || pendingRequests || unboundAttempts || job.budget.unknownAttempts.length ? 'partial' : 'complete',provenance,...(providerProgress?{providerProgress}:{})};
}
