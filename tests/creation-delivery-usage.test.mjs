import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { creationObservedUsage } from '../scripts/neuraldeep/creation-runtime-receipt.mjs';
import { deliveryAccountingLineage } from '../scripts/neuraldeep/creation-usage-lineage.mjs';

function fixture(t, legacy = false) {
  const store=new NeuralDeepCoordinationStore();t.after(()=>store.close());
  const id='nd_abcd',workload='explicit-workload-with-no-run-prefix';
  const job={jobId:'creation-fixture',deliveryRunId:'delivery-fixture',activeTurnId:null,
    budget:{tokensUsed:69354,unknownAttempts:['delivery-fixture'],turns:{}},
    delivery:{runtimeAccounting:{deliveryRunId:'delivery-fixture',accountedRunIds:[],unsettledRunIds:[id],unboundAttempts:[]}}};
  if (!legacy) store.bindRuntimeLineage({runId:id,creationJobId:job.jobId,deliveryRunId:job.deliveryRunId,workloadId:workload,iteration:1,phase:'build'});
  store.beginRuntimeRun({runId:id,requestHash:'a'.repeat(64),receipt:{workload_id:workload}});
  for (const [index,tokens] of [10000,20000,90000,10000,9190].entries()) {
    const hash=String(index+1).repeat(64);
    store.claimProviderRequest(id,hash);
    store.recordProviderResponse(id,{requestHash:hash,status:200,upstreamAttempted:true,usage:{inputTokens:tokens-100,cachedInputTokens:tokens-200,outputTokens:100,totalTokens:tokens}});
  }
  store.claimProviderRequest(id,'6'.repeat(64),{budget:{reservation:196929}});
  store.updateRuntimeRun(id,{process_exited:true,process_tree_exited:true,adapter_closed:true});
  return {store,job,id};
}

test('interrupted delivery projects every measured request, one unknown and the held reserve without charging twice',t=>{
  const {store,job,id}=fixture(t);
  const before=JSON.stringify(store.db.prepare('SELECT * FROM runtime_receipts').all());
  const first=creationObservedUsage(store,job);
  assert.equal(first.finalizedTokens,69354);assert.equal(first.unfinalizedTokens,139190);
  assert.equal(first.knownMinimumTokens,208544);assert.equal(first.unknownRequests,1);assert.equal(first.pendingRequests,0);
  assert.equal(first.reservedTokens,196929);assert.equal(first.coverage,'partial');
  assert.deepEqual(creationObservedUsage(store,job),first);
  assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM runtime_receipts').all()),before,'projection is read-only');
  store.recordProviderResponse(id,{requestHash:'6'.repeat(64),status:200,upstreamAttempted:true,usage:{inputTokens:400,outputTokens:100,totalTokens:500}});
  job.budget.tokensUsed=209044;job.budget.unknownAttempts=[];
  job.delivery.runtimeAccounting.accountedRunIds=[id];job.delivery.runtimeAccounting.unsettledRunIds=[];
  const final=creationObservedUsage(store,job);
  assert.equal(final.knownMinimumTokens,209044);assert.equal(final.unfinalizedTokens,0);assert.equal(final.reservedTokens,0);assert.equal(final.coverage,'complete');
});

test('new lineage reaches dispatch metadata, rejects rebinding and distinguishes pending from stopped requests',t=>{
  const {store,job,id}=fixture(t);
  assert.equal(JSON.parse(store.db.prepare('SELECT metadata FROM provider_dispatches WHERE run_id=? LIMIT 1').get(id).metadata).lineage.creationJobId,job.jobId);
  assert.throws(()=>store.bindRuntimeLineage({runId:id,creationJobId:'another-job',deliveryRunId:job.deliveryRunId,workloadId:'other',iteration:1,phase:'build'}),/runtime_lineage_conflict/);
  store.updateRuntimeRun(id,{process_exited:false});
  const view=creationObservedUsage(store,job);assert.equal(view.pendingRequests,1);assert.equal(view.unknownRequests,0);
});

test('legacy delivery uses the exact saved executor receipt, never workload naming or timestamps',t=>{
  const {store,job,id}=fixture(t,true);
  const root=mkdtempSync(path.join(os.tmpdir(),'creation-usage-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(path.join(root,'executor'));
  const name='executor/attempt-nd_abcd.json';
  writeFileSync(path.join(root,name),JSON.stringify({provider:'neuraldeep',run_id:job.deliveryRunId,attempt_id:id,launcher_run_id:id}));
  const state={run_id:job.deliveryRunId,budget:{accounted_turns:[],unaccounted_attempts:[{executor_result:name}]}};
  job.delivery.runtimeAccounting=deliveryAccountingLineage(state,root);
  assert.equal(creationObservedUsage(store,job).knownMinimumTokens,208544);
  writeFileSync(path.join(root,name),JSON.stringify({provider:'neuraldeep',run_id:'different-delivery',attempt_id:id,launcher_run_id:id}));
  job.delivery.runtimeAccounting=deliveryAccountingLineage(state,root);
  const refused=creationObservedUsage(store,job);
  assert.equal(refused.knownMinimumTokens,69354);assert.equal(refused.unboundAttempts,1);assert.equal(refused.coverage,'partial');
  state.budget.unaccounted_attempts=[{executor_result:'../elsewhere.json'}];
  assert.equal(deliveryAccountingLineage(state,root).unsettledRunIds.length,0);
});
