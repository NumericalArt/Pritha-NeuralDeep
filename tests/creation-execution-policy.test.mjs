import test from 'node:test';
import assert from 'node:assert/strict';
import { creationExecutionPolicy,executionDeadline,requestDeadlineWindow } from '../scripts/neuraldeep/creation-execution-policy.mjs';
import { AgentCreationStore } from '../scripts/neuraldeep/agent-creation-store.mjs';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { CodexCliBuildExecutor } from '../scripts/agents-mother/build-executors.mjs';

test('one absolute deadline reserves settlement and refuses admission after suspend or soft deadline',()=>{
 const policy=creationExecutionPolicy({modelId:'qwen3.8-27b',timeoutMs:1_800_000});
 const deadline=executionDeadline({hardDeadlineAt:1_801_000,...policy},1000);
 assert.equal(deadline.softDeadlineAt,841000);
 assert.equal(requestDeadlineWindow(deadline,841000),930000);
 for(const now of [841001,1801000,9999999])assert.throws(()=>requestDeadlineWindow(deadline,now),{code:'provider_iteration_deadline'});
 assert.throws(()=>requestDeadlineWindow({...deadline,softDeadlineAt:1800000},1000),/execution_deadline_invalid/);
 const short=executionDeadline({hardDeadlineAt:11000},1000);
 assert.ok(short.requestTimeoutMs+short.settlementGraceMs+short.softDeadlineAt<=short.hardDeadlineAt);
});

test('creation settings are pinned once and old jobs retain their policy',()=>{
 const journal=new NeuralDeepCoordinationStore({databasePath:':memory:'});
 try {
  const store=new AgentCreationStore(journal),input={chatId:'test',instanceId:'test',agentId:'test',releaseSha:'a'.repeat(40),target:'/tmp/test',draftRoot:'/tmp/draft',executionSettings:{modelId:'qwen3.8-27b',effortId:'medium'}};
  const job=store.create(input);
  assert.equal(store.create({...input,executionSettings:{modelId:'different',timeoutMs:1000}}).executionPolicy.modelId,'qwen3.8-27b');
  assert.throws(()=>store.update('test',value=>({...value,executionPolicy:{...value.executionPolicy,modelId:'different'}})),{code:'creation_policy_immutable'});
  assert.equal(job.executionPolicy.iterationTimeoutMs,1_800_000);
  const old=store.create({...input,chatId:'old',agentId:'old',executionSettings:undefined});
  assert.equal(old.executionPolicy,undefined);
 } finally {journal.close();}
});

test('expired phase does not create an attempt or call executor; all admitted phases share the same deadline',async()=>{
 const executor=new CodexCliBuildExecutor();executor.runtimeVersion=()=> 'fixture';
 let checkpoints=0,calls=0;const deadline=executionDeadline({hardDeadlineAt:Date.now()+1_800_000});
 executor.run=async options=>{calls++;assert.deepEqual(options.deadline,deadline);return {code:0,usageKnown:true,tokensUsed:1,processExited:true};};
 const input={deadline,onCheckpoint:()=>checkpoints++};
 await executor.phase(input,'probe-tools',{timeoutMs:90000});
 await executor.phase(input,'build',{timeoutMs:1800000});
 const expired=executionDeadline({hardDeadlineAt:Date.now()-1000+3},Date.now()-1000);
 await assert.rejects(executor.phase({...input,deadline:expired},'summary',{}),{code:'provider_iteration_deadline'});
 assert.equal(calls,2);assert.equal(checkpoints,4);
});
