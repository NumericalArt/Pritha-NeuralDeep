import { createHash } from 'node:crypto';

/** Read the launcher's accounting deltas, never cumulative model stdout totals. */
export function creationRuntimeReceipt(coordination,turnId,{dispatched=true}={}) {
  const rows=coordination.db.prepare("SELECT id,receipt FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=? ORDER BY id").all(turnId);
  if(!rows.length)return {receiptId:null,tokens:dispatched?null:0,processExited:!dispatched,coverage:dispatched?'unknown':'complete',runs:[]};
  let tokens=0,known=true,processExited=true,blocker=null;
  const runs=[];
  for(const row of rows) {
    const receipt=JSON.parse(row.receipt),usage=receipt.usage_record;
    if(receipt.budget_blocker)blocker={code:receipt.budget_blocker.code,message:'Шаг остановлен до следующего запроса: остатка бюджета недостаточно или учёт не подтверждён. Квитанции и документы сохранены.'};
    const noDispatch=receipt.exit_evidence==='no_stock_dispatch' && receipt.dispatch_authorized===false;
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
  let unfinalizedTokens=0,unknownRequests=0;
  for(const turnId of turnIds) {
    if(Number.isSafeInteger(job.budget.turns?.[turnId]?.tokens))continue;
    const rows=coordination.db.prepare("SELECT id FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=?").all(turnId);
    for(const row of rows) {
      const summary=coordination.providerUsageSummary(row.id);
      unfinalizedTokens+=summary.usage.totalTokens;unknownRequests+=summary.unknownRequests;
      if(!Number.isSafeInteger(unfinalizedTokens))throw new Error('creation_usage_overflow');
    }
  }
  const knownMinimumTokens=job.budget.tokensUsed+unfinalizedTokens;
  if(!Number.isSafeInteger(knownMinimumTokens))throw new Error('creation_usage_overflow');
  return {knownMinimumTokens,unfinalizedTokens,unknownRequests};
}
