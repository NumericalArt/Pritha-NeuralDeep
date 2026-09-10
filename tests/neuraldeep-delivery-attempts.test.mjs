import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CodexCliBuildExecutor } from '../scripts/agents-mother/build-executors.mjs';
import { createDeliveryLedger, accountDeliveryExecutorResult, deliveryTokenPreflight, readDeliveryLedger } from '../scripts/agents-mother/delivery-ledger.mjs';
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths, coordinationHash } from '../scripts/neuraldeep/coordination-store.mjs';
import { acquireRuntimeAdmission } from '../scripts/neuraldeep/runtime-admission.mjs';
import { executionResourceClaims } from '../scripts/neuraldeep/execution-resources.mjs';
import { recordNeuralDeepRun, neuralDeepUsageKnown } from '../scripts/neuraldeep/usage-ledger.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nd-attempt-'));
  t.after(() => rmSync(root, {recursive:true, force:true}));
  const worktree = path.join(root,'project'); mkdirSync(worktree);
  execFileSync('git',['init','-q'],{cwd:worktree});
  execFileSync('git',['config','user.name','Fixture'],{cwd:worktree});
  execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:worktree});
  writeFileSync(path.join(worktree,'README.md'),'fixture');
  execFileSync('git',['add','.'],{cwd:worktree}); execFileSync('git',['commit','-qm','fixture'],{cwd:worktree});
  const runRoot=path.join(root,'build');
  createDeliveryLedger(runRoot,{runId:'run-1',agentSlug:'fixture',targetKey:'sha256:'+'1'.repeat(64),targetLabel:'fixture',spec:{id:'fixture',semanticLock:'sha256:x',documentLock:'sha256:y',contractFingerprint:'sha256:z',approvalId:'approved'}});
  return {root,worktree,runRoot};
}
function context(f) {
  return {runId:'run-1',iteration:1,worktree:f.worktree,stateRoot:f.root,tokenBudget:100,
    plan:{trials:[]}, onCheckpoint:receipt=>accountDeliveryExecutorResult(f.runRoot,receipt,`executor/attempt-${receipt.attempt_id}.json`),
    beforeDispatch:()=>{const available=deliveryTokenPreflight(readDeliveryLedger(f.runRoot).budget).available; if(available===null)throw Object.assign(new Error('unknown'),{code:'goal_usage_unavailable'});if(available<1)throw Object.assign(new Error('limit'),{code:'token_budget_exhausted'});}};
}

test('failed structured summary preserves build, exact phase charges and native identity',async t=>{
  const f=fixture(t), executor=new CodexCliBuildExecutor({model:'fixture'}); executor.runtimeVersion=()=> 'fixture';
  let calls=0;
  executor.run=async options=>{
    calls++;
    const saved=readDeliveryLedger(f.runRoot);
    assert.equal(saved.budget.unaccounted_attempts.length,1,'intent is durable before any runner');
    if(calls===1)writeFileSync(path.join(f.worktree,'result.txt'),'ready');
    return {code:calls===1?0:1,timedOut:false,durationMs:1,tokensUsed:calls===1?120:30,usageKnown:true,processExited:true,
      threadId:`session-${calls}`,agentText:'Implemented the durable fixture.',stderr:'synthetic summary failure'};
  };
  const result=await executor.execute(context(f));
  assert.equal(calls,2);assert.equal(result.status,'completed');assert.equal(result.turn_id,null);
  assert.deepEqual(result.changed_files,['result.txt']); assert.match(result.remaining_risks.join(' '),/summary unavailable/i);
  const state=readDeliveryLedger(f.runRoot);assert.equal(state.budget.tokens_used,150);assert.equal(state.budget.accounted_turns.length,2);
  assert.deepEqual(state.budget.accounted_turns.map(r=>r.phase),['build','summary']);
  assert.equal(new Set(state.budget.accounted_turns.map(r=>r.attempt_id)).size,2);
  accountDeliveryExecutorResult(f.runRoot,result,'executor/iteration-001.json');assert.equal(readDeliveryLedger(f.runRoot).budget.tokens_used,150);
});

test('unknown build usage prevents paid summary and preserves existing implementation',async t=>{
  const f=fixture(t), executor=new CodexCliBuildExecutor();executor.runtimeVersion=()=> 'fixture';let calls=0;
  executor.run=async()=>{calls++;return{code:0,durationMs:1,tokensUsed:null,usageKnown:false,processExited:true,threadId:'session',agentText:'Work preserved.'};};
  const result=await executor.execute(context(f));assert.equal(calls,1);assert.equal(result.status,'completed');
  const state=readDeliveryLedger(f.runRoot);assert.equal(state.budget.tokens_used,0);assert.equal(deliveryTokenPreflight(state.budget).available,null);
  assert.equal(state.budget.unaccounted_attempts[0].process_exited,true);
});

test('checkpoint failure prevents a model call, thrown runner remains unresolved',async t=>{
  const f=fixture(t), executor=new CodexCliBuildExecutor();executor.runtimeVersion=()=> 'fixture';let calls=0;
  executor.run=async()=>{calls++;throw new Error('lost acknowledgement');};
  await assert.rejects(executor.phase({...context(f),onCheckpoint:()=>{throw new Error('disk full');}},'probe',{}),/disk full/);assert.equal(calls,0);
  await assert.rejects(executor.phase(context(f),'build',{}),/lost acknowledgement/);assert.equal(calls,1);
  assert.equal(deliveryTokenPreflight(readDeliveryLedger(f.runRoot).budget).available,null);
});

test('usage outbox replay recovers one charge without another runner or synthetic native turn',async t=>{
  const f=fixture(t), executor=new CodexCliBuildExecutor();executor.runtimeVersion=()=> 'fixture';executor.run=()=>{throw new Error('must never execute');};
  const store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(f.root,executor.projectRoot));
  const id='nd_11111111-1111-1111-1111-111111111111';
  store.beginRuntimeRun({runId:id,requestHash:'a'.repeat(64),receipt:{}});
  store.updateRuntimeRun(id,{process_exited:true,status:'completed',session_id:'session',usage_status:'measured',usage_ledger_recorded:false,
    usage_event:{stateRoot:f.root,runId:id,model:'fixture',sessionId:'session',source:'child-agent',usage:{input_tokens:90,output_tokens:10},usageKnown:true,cumulative:true}});
  store.close();
  const receipt={schema:'pritha-build-executor-result-v1',executor:executor.name,provider:'neuraldeep',run_id:'run-1',attempt_id:id,launcher_run_id:id,phase:'build',usage_status:'unknown',status:'uncertain'};
  const first=await executor.recover(context(f),receipt);const second=await executor.recover(context(f),receipt);
  for(const result of [first,second])accountDeliveryExecutorResult(f.runRoot,result,`executor/attempt-${id}.json`);
  assert.equal(readDeliveryLedger(f.runRoot).budget.tokens_used,100);assert.equal(first.thread_id,'session');assert.equal(first.turn_id,undefined);
});

test('invalid and partial usage never represents measured zero; identity conflicts do not replay',t=>{
  const f=fixture(t);
  for(const usage of [{},{input_tokens:1},{input_tokens:null,output_tokens:0},{input_tokens:-1,output_tokens:0},{input_tokens:2,output_tokens:1,total_tokens:2}])assert.equal(neuralDeepUsageKnown(usage),false);
  assert.equal(neuralDeepUsageKnown({input_tokens:0,output_tokens:0}),true);
  const entry={stateRoot:f.root,runId:'usage',source:'child-agent',model:'fixture',usage:{input_tokens:3,output_tokens:2}};
  recordNeuralDeepRun(entry);const retry=recordNeuralDeepRun(entry);assert.equal(retry.usage.totalTokens,5);
  assert.throws(()=>recordNeuralDeepRun({...entry,model:'other'}),/identity_conflict/);
});

test('a shared host admission lease authorizes only one wrapper and exact session',async t=>{
  const f=fixture(t),store=new NeuralDeepCoordinationStore({databasePath:path.join(f.root,'coord.sqlite')});t.after(()=>store.close());
  store.enqueue({attemptId:'a',workloadId:'a',surface:'task_chat',coordinationKeyHash:coordinationHash('chat'),queuedAt:new Date().toISOString(),resources:executionResourceClaims({cwd:f.worktree,sandbox:'workspace-write'})});
  const lease=store.claim('a',1),previous=process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT;
  process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT=JSON.stringify({attemptId:'a',ownerToken:lease.ownerToken});
  try {
    const runtime={codexHome:f.root,projectRoot:f.worktree,upstreamOrigin:'https://provider.invalid'};
    const acquired=await acquireRuntimeAdmission(store,runtime,{resume:'session'},'run-a',()=>{throw new Error('host owns capacity');});
    assert.ok(acquired);await assert.rejects(acquireRuntimeAdmission(store,runtime,{resume:'session'},'run-b',()=>1),/UNIQUE/);
    assert.equal(store.snapshot().active.length,1);
  } finally {if(previous===undefined)delete process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT;else process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT=previous;}
});

test('standalone CLI admission refreshes provider capacity while waiting without stopping an active neighbor', async t => {
  const store=new NeuralDeepCoordinationStore();t.after(()=>store.close());
  store.enqueue({attemptId:'neighbor',surface:'delivery',workloadId:'neighbor',coordinationKeyHash:coordinationHash('neighbor'),queuedAt:new Date().toISOString()});
  const neighbor=store.claim('neighbor',1);let calls=0;
  const runtime={codexHome:'/synthetic-home',projectRoot:os.tmpdir(),upstreamOrigin:'https://neuraldeep.invalid',model:'fixture'};
  store.beginRuntimeRun({runId:'queued-runtime',requestHash:'e'.repeat(64),receipt:{process_exited:false}});
  const lease=await acquireRuntimeAdmission(store,runtime,{limitRefreshMs:100},'queued-runtime',async()=>++calls===1?1:2);
  assert.ok(calls>=2);assert.equal(store.get('neighbor').status,'active');assert.equal(store.snapshot().active.length,2);
  store.updateRuntimeRun('queued-runtime',{process_exited:true});
  lease.finish('completed');store.finish('neighbor',neighbor.ownerToken,'completed');
});
