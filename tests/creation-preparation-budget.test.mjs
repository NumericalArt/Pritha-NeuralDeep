import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {NeuralDeepCoordinationStore} from '../scripts/neuraldeep/coordination-store.mjs';
import {AgentCreationStore,creationBudgetBlocker} from '../scripts/neuraldeep/agent-creation-store.mjs';
import {creationDraftRoot} from '../scripts/neuraldeep/agent-creation.mjs';
import {prepareCreationContextPacket,creationSemanticProgress} from '../scripts/neuraldeep/creation-context-packet.mjs';
import {creationDocumentIdentity} from '../scripts/neuraldeep/creation-generation.mjs';
import {creationPreparationUsage} from '../scripts/neuraldeep/creation-preparation-policy.mjs';
import {settleCreationPreparation} from '../scripts/neuraldeep/creation-preparation-control.mjs';
import {providerBudgetGate} from '../scripts/neuraldeep/provider-budget.mjs';
import {listenNeuralDeepAdapter,closeNeuralDeepAdapter} from '../scripts/neuraldeep/responses-adapter.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
function setup(t) {
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'creation-phase-budget-'));t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const store=new NeuralDeepCoordinationStore({databasePath:path.join(stateRoot,'coord.sqlite')});t.after(()=>store.close());
  const jobs=new AgentCreationStore(store),chatId='chat_phase_budget',draftRoot=creationDraftRoot(stateRoot,'fixture',chatId);
  mkdirSync(draftRoot,{recursive:true});
  const initial=jobs.create({chatId,instanceId:'fixture',agentId:'phase-app',releaseSha:'a'.repeat(40),target:path.join(stateRoot,'phase-app'),draftRoot,preparationPolicyVersion:2});
  const options={root:process.cwd(),stateRoot};let current;
  const start=(n,generation=1)=>{
    let job=jobs.update(chatId,j=>({...j,generation,documentIdentity:creationDocumentIdentity({...j,generation}),phase:'interview',status:'running',activeTurnId:`turn_${n}`}));
    const packet=prepareCreationContextPacket(job,{restart:true,text:JSON.stringify([{role:'user',text:'Create a public feed reader.'}])},{...options,turnId:`turn_${n}`});
    job=jobs.update(chatId,j=>({...j,contextPacket:packet}));
    const runId=`run_${n}`,workloadId=`turn_${n}`;
    store.beginRuntimeRun({runId,requestHash:hash(runId),receipt:{workload_id:workloadId,process_exited:false}});
    const creation={chatId,jobId:initial.jobId,releaseSha:initial.releaseSha,generation,stateRoot,codeRoot:options.root,
      preparation:{policyVersion:2,phase:'brief',workUnitId:workloadId,packetHash:packet.hash}};
    current={runId,workloadId,creation,gate:providerBudgetGate(store,{runId,workloadId,creation})};return current;
  };
  const complete=(tokens=100)=>{
    store.updateRuntimeRun(current.runId,{process_exited:true,process_tree_exited:true,adapter_closed:true});
    jobs.recordTurn(chatId,{turnId:current.workloadId,tokens,dispatched:true,ok:true});
  };
  const dispatch=(input='hello',tokens=100)=>{
    const payload=current.gate.prepare({model:'fixture',input}),requestHash=hash(JSON.stringify(payload));
    current.gate.claim({model:'fixture',payload,bytes:Buffer.byteLength(JSON.stringify(payload)),requestHash});
    store.recordProviderResponse(current.runId,{requestHash,status:200,upstreamAttempted:true,usage:{inputTokens:tokens-10,outputTokens:10,totalTokens:tokens}});
    return payload;
  };
  return {store,jobs,initial,options,start,complete,dispatch};
}

test('full byte boundaries and phase reservation stop before any upstream request',async t=>{
  const f=setup(t),{gate,runId}=f.start(1);let calls=0;const errors=[];
  const server=await listenNeuralDeepAdapter({port:0,responsesOnly:true,prepareResponsesRequest:gate.prepare,beforeResponsesDispatch:gate.claim,
    onRequest:event=>{f.store.recordProviderResponse(runId,event);if(event.error)errors.push(event.error.code);},fetchImpl:async()=>{calls++;return Response.json({usage:{input_tokens:79990,output_tokens:10,total_tokens:80000}});}});
  t.after(()=>closeNeuralDeepAdapter(server));
  const send=async input=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:JSON.stringify({model:'fixture',input})});return {status:response.status,body:await response.json()};};
  assert.equal((await send('я'.repeat(33*1024))).status,409);assert.equal(calls,0,'KiB counts bytes, not characters or token estimates');
  assert.equal((await send('small')).status,200);assert.equal(calls,1);
  const last=f.store.db.prepare('SELECT metadata FROM provider_dispatches').get();
  assert.equal(JSON.parse(last.metadata).budget.outputLimit,8192);
  const result=await send('x'.repeat(30*1024));assert.equal(result.status,409);assert.equal(calls,1);
  assert.equal(errors.at(-1),'provider_budget_preparation_tokens');
  const usage=creationPreparationUsage(f.store,f.jobs.get(f.initial.chatId));
  assert.equal(usage.phase.brief,80000);assert.equal(usage.phaseRemaining.brief,20000);assert.equal(usage.deliveryProtected,700000);
  f.complete(80000);
  assert.equal(creationPreparationUsage(f.store,f.jobs.get(f.initial.chatId)).phase.brief,80000,'final receipt replaces current observations');
});

test('twelve real dispatch receipts remain counted across sessions and proposal generations',t=>{
  const f=setup(t);
  for(let n=1;n<=12;n++){f.start(n,n>6?2:1);f.dispatch(`step ${n}`);f.complete();}
  const usage=creationPreparationUsage(f.store,f.jobs.get(f.initial.chatId));
  assert.equal(usage.requests,12);assert.equal(usage.phase.brief,1200);
  const {gate}=f.start(13,3);
  assert.throws(()=>gate.prepare({model:'fixture',input:'new session cannot reset limits'}),{code:'provider_budget_preparation_requests'});
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM provider_dispatches').get().n,12);
  assert.throws(()=>f.jobs.update(f.initial.chatId,j=>({...j,preparationPolicy:{...j.preparationPolicy,maxRequests:99}})),{code:'creation_policy_immutable'});
});

test('unknown usage, live previous process and substituted packet forbid dispatch',t=>{
  const f=setup(t),first=f.start(1),payload=first.gate.prepare({model:'fixture',input:'first'}),requestHash=hash(JSON.stringify(payload));
  first.gate.claim({model:'fixture',payload,bytes:Buffer.byteLength(JSON.stringify(payload)),requestHash});
  assert.throws(()=>first.gate.prepare({input:'while pending'}),{code:'provider_usage_unconfirmed'});
  f.store.recordProviderResponse(first.runId,{requestHash,status:200,upstreamAttempted:true,usage:{inputTokens:90,outputTokens:10,totalTokens:100}});
  f.jobs.recordTurn(f.initial.chatId,{turnId:first.workloadId,tokens:100,dispatched:true,ok:true});
  const second=f.start(2);
  assert.throws(()=>second.gate.prepare({input:'worker exited but descendant lives'}),{code:'provider_budget_execution_unsettled'});
  f.store.updateRuntimeRun(first.runId,{process_exited:true,process_tree_exited:true,adapter_closed:true});
  const job=f.jobs.get(f.initial.chatId);writeFileSync(job.contextPacket.path,'{}');
  assert.throws(()=>second.gate.prepare({input:'tampered packet'}),{code:'provider_budget_documents_changed'});
});

test('repeated reads are refused without semantic progress and Continue cannot retry the stop',t=>{
  const f=setup(t),{gate}=f.start(1);f.dispatch('start');
  const input=[{type:'function_call',call_id:'a',name:'exec_command',arguments:'{"cmd":"cat research.md"}'},
    {type:'function_call_output',call_id:'a',output:'same facts'},
    {type:'function_call',call_id:'b',name:'exec_command',arguments:'{"cmd":"cat research.md"}'},
    {type:'function_call_output',call_id:'b',output:'same facts'}];
  assert.throws(()=>gate.prepare({model:'fixture',input}),{code:'provider_budget_no_progress'});
  const job=f.jobs.get(f.initial.chatId),stopped=settleCreationPreparation(job,{tokens:100,processExited:true,blocker:{code:'provider_budget_no_progress'}},f.options);
  assert.equal(creationBudgetBlocker(stopped).code,'provider_budget_no_progress');assert.equal(stopped.autoContinue,false);
  const changedTime={...job,checkpoint:{at:'2030-01-01',text:'done'}};
  assert.equal(creationSemanticProgress(job),creationSemanticProgress(changedTime));
});

test('reads preceding verified progress do not poison later distinct work, but a new repeat is blocked',t=>{
  const f=setup(t),{gate}=f.start(1);f.dispatch('start');
  const read=id=>({type:'function_call',call_id:id,name:'exec_command',arguments:'{"cmd":"cat research.md"}'});
  const input=[read('a'),read('b')];
  // A host-validated document/brief changes this semantic hash; timestamps do not.
  f.jobs.update(f.initial.chatId,j=>({...j,preparation:{briefHash:'c'.repeat(64)}}));
  f.dispatch(input);
  f.dispatch([...input,{type:'function_call',call_id:'c',name:'exec_command',arguments:'{"cmd":"node verify-new-evidence.mjs"}'}]);
  assert.throws(()=>gate.prepare({model:'fixture',input:[...input,read('d')]}),{code:'provider_budget_no_progress'});
});

test('distinct local pages cannot spend another request without verified progress',t=>{
  const f=setup(t),{gate}=f.start(1);f.dispatch('start');
  const page=(cursor,id=String(cursor))=>({type:'function_call',call_id:id,name:'exec_command',
    arguments:JSON.stringify({cmd:`node creation-context-reader.mjs --artifact research --cursor ${cursor}`})});
  const first=[page(0)];f.dispatch(first);f.dispatch([...first,page(4096)]);
  assert.throws(()=>gate.prepare({model:'fixture',input:[...first,page(4096),page(8192)]}),{code:'provider_budget_no_progress'});
  assert.equal(f.store.providerUsageSummary('run_1').providerRequests,3);
  assert.equal(creationPreparationUsage(f.store,f.jobs.get(f.initial.chatId)).confirmedTotal,300);
});

test('local read allowance survives a new native session and resets only with verified content',t=>{
  const f=setup(t);f.start(1);f.dispatch('start');
  const read=(file,id)=>({type:'function_call',call_id:id,name:'exec_command',arguments:JSON.stringify({cmd:`cat ${file}`})});
  f.dispatch([read('research.md','a')]);f.complete(200);
  f.start(2);f.dispatch('fresh context is not progress');f.dispatch([read('patterns.md','b')]);f.complete(200);
  const third=f.start(3);
  assert.throws(()=>third.gate.prepare({model:'fixture',input:[read('different-page.md','c')]}),{code:'provider_budget_no_progress'});
  f.jobs.update(f.initial.chatId,j=>({...j,preparation:{briefHash:'d'.repeat(64)}}));
  f.dispatch([read('different-page.md','c')]);
  f.dispatch([read('different-page.md','c'),read('new-evidence.md','d')]);
  assert.equal(creationPreparationUsage(f.store,f.jobs.get(f.initial.chatId)).confirmedTotal,600);
});

test('unused brief allowance can fund research without raising the job cap or the delivery reserve',t=>{
  const f=setup(t);
  const job=f.jobs.update(f.initial.chatId,current=>({...current,phase:'research',budget:{...current.budget,turns:{
    turn_brief:{tokens:0,activeMs:0,dispatched:true,phase:'interview',policyVersion:2}}}}));
  const usage=creationPreparationUsage(f.store,job);
  assert.equal(usage.phaseRemaining.brief,100000);
  assert.equal(usage.phaseRemaining.research,300000);
  assert.equal(usage.deliveryProtected,700000);
  assert.equal(job.budget.maxTokens,1000000);
  const spent=f.jobs.update(f.initial.chatId,current=>({...current,budget:{...current.budget,turns:{
    ...current.budget.turns,turn_brief:{...current.budget.turns.turn_brief,tokens:100000}}}}));
  assert.equal(creationPreparationUsage(f.store,spent).phaseRemaining.research,200000);
});

test('one settled provider outage reopens the phase from checkpoint and the second does not',t=>{
  const f=setup(t);
  f.start(1);f.complete(100);
  const blocked=f.jobs.update(f.initial.chatId,current=>({...current,status:'blocked',autoContinue:false,blocker:{code:'neuraldeep_unavailable',message:'network'}}));
  const options={root:f.options.root,stateRoot:f.options.stateRoot,phase:'interview'};
  const receipt={processExited:true,tokens:100,blocker:{code:'neuraldeep_unavailable',message:'network'}};
  const first=settleCreationPreparation(blocked,receipt,options);
  assert.equal(first.status,'pending');
  assert.equal(first.autoContinue,true);
  assert.equal(first.blocker,null);
  assert.equal(first.providerOutageContinuations.brief,1);
  assert.equal(first.checkpoint.providerOutage.continued,true);
  assert.equal(first.budget.maxTokens,blocked.budget.maxTokens);
  const second=settleCreationPreparation({...first,status:'blocked',autoContinue:false},receipt,options);
  assert.equal(second.status,'blocked');
  assert.equal(second.autoContinue,false);
  assert.match(second.blocker.message,/checkpoint/);
  assert.equal(second.budget.maxTokens,1_000_000);
});
