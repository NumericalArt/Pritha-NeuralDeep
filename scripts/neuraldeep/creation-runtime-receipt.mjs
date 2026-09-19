import { createHash } from 'node:crypto';

/** Read the launcher's accounting deltas, never cumulative model stdout totals. */
export function creationRuntimeReceipt(coordination,turnId,{dispatched=true}={}) {
  const rows=coordination.db.prepare("SELECT id,receipt FROM runtime_receipts WHERE json_extract(receipt,'$.workload_id')=? ORDER BY id").all(turnId);
  if(!rows.length)return {receiptId:null,tokens:dispatched?null:0,processExited:!dispatched,coverage:dispatched?'unknown':'complete',runs:[]};
  let tokens=0,known=true,processExited=true;
  const runs=[];
  for(const row of rows) {
    const receipt=JSON.parse(row.receipt),usage=receipt.usage_record;
    const noDispatch=receipt.exit_evidence==='no_stock_dispatch' && receipt.dispatch_authorized===false;
    const exited=receipt.process_exited===true && receipt.process_tree_exited===true && receipt.adapter_closed===true;
    processExited &&= exited;
    const delta=usage?.usageKnown===true ? usage.usage?.totalTokens : noDispatch ? 0 : null;
    if(!Number.isSafeInteger(delta) || delta<0 || !Number.isSafeInteger(tokens+delta))known=false;
    else tokens+=delta;
    runs.push({runId:row.id,tokens:delta,processExited:exited});
  }
  const receiptId='creation_receipt_'+createHash('sha256').update(JSON.stringify(runs)).digest('hex');
  return {receiptId,tokens:known?tokens:null,processExited,coverage:known?'complete':'unknown',runs};
}
