import test from 'node:test';
import assert from 'node:assert/strict';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { AgentCreationStore } from '../scripts/neuraldeep/agent-creation-store.mjs';
import { providerBudgetGate, prepareBudgetedRequest } from '../scripts/neuraldeep/provider-budget.mjs';
import { creationObservedUsage } from '../scripts/neuraldeep/creation-runtime-receipt.mjs';
import { listenNeuralDeepAdapter, closeNeuralDeepAdapter } from '../scripts/neuraldeep/responses-adapter.mjs';

function fixture(t) {
  const store=new NeuralDeepCoordinationStore();t.after(()=>store.close());
  const jobs=new AgentCreationStore(store);
  const job=jobs.create({chatId:'chat-budget',instanceId:'fixture',agentId:'budget-app',releaseSha:'a'.repeat(40),target:'/tmp/fixture-agent',draftRoot:'/tmp/fixture-draft',tokenBudget:50_000});
  jobs.update(job.chatId,j=>({...j,status:'running',activeTurnId:'turn-budget'}));
  store.beginRuntimeRun({runId:'run-budget',requestHash:'a'.repeat(64),receipt:{workload_id:'turn-budget'}});
  const creation={chatId:job.chatId,jobId:job.jobId,releaseSha:job.releaseSha,generation:1};
  const gate=providerBudgetGate(store,{runId:'run-budget',workloadId:'turn-budget',creation});
  return {store,jobs,job,gate,creation};
}

test('each request consumes the current host remainder before fetch; blocked requests keep usage known',async t=>{
  const f=fixture(t);let calls=0;
  const server=await listenNeuralDeepAdapter({port:0,responsesOnly:true,prepareResponsesRequest:f.gate.prepare,beforeResponsesDispatch:f.gate.claim,
    onRequest:e=>f.store.recordProviderResponse('run-budget',e),
    fetchImpl:async(_url,options)=>{
      calls++;const payload=JSON.parse(options.body);
      assert.ok(payload.max_output_tokens>0 && payload.max_output_tokens<=8192);
      return Response.json({usage:{input_tokens:21800,output_tokens:200,total_tokens:22000}});
    }});t.after(()=>closeNeuralDeepAdapter(server));
  const send=async i=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:JSON.stringify({model:'fixture',input:'x'.repeat(20_000)+i})});await r.text();return r.status;};
  assert.equal(await send(1),200);
  assert.equal(await send(2),409);assert.equal(await send(3),409);
  assert.equal(calls,1,'no second paid call after the response consumed the request reserve');
  const alternate=await fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`,{method:'POST',body:'{}'});
  assert.equal(alternate.status,409);await alternate.text();assert.equal(calls,1);
  assert.deepEqual(f.store.providerUsageSummary('run-budget').usage.totalTokens,22000);
  assert.equal(f.store.providerUsageSummary('run-budget').usageKnown,true);
  assert.equal(f.jobs.get(f.job.chatId).budget.tokensUsed,0,'the completed-step ledger is not charged a second time');
  const pending=creationObservedUsage(f.store,f.jobs.get(f.job.chatId));
  assert.equal(pending.knownMinimumTokens,22000);assert.equal(pending.unfinalizedTokens,22000);assert.equal(pending.unknownRequests,0);
  f.jobs.recordTurn(f.job.chatId,{turnId:'turn-budget',tokens:22000,ok:false,dispatched:true});
  const settled=creationObservedUsage(f.store,f.jobs.get(f.job.chatId));
  assert.equal(settled.knownMinimumTokens,22000);assert.equal(settled.unfinalizedTokens,0);assert.equal(settled.coverage,'complete');
});

test('the transaction rechecks pause, generation, limits and unresolved concurrent requests',t=>{
  const f=fixture(t);const payload=f.gate.prepare({model:'fixture',input:'bounded'});
  const event={payload,model:'fixture',bytes:Buffer.byteLength(JSON.stringify(payload)),requestHash:'b'.repeat(64)};
  f.jobs.update(f.job.chatId,j=>({...j,status:'paused'}));
  assert.throws(()=>f.gate.claim(event),{code:'provider_budget_owner_changed'});
  f.jobs.update(f.job.chatId,j=>({...j,status:'running',generation:2}));
  assert.throws(()=>f.gate.claim(event),{code:'provider_budget_owner_changed'});
  f.jobs.update(f.job.chatId,j=>({...j,generation:1,budget:{...j.budget,maxTokens:10}}));
  assert.throws(()=>f.gate.claim(event),{code:'provider_token_budget'});
  f.jobs.update(f.job.chatId,j=>({...j,budget:{...j.budget,maxTokens:50_000}}));
  f.gate.claim(event);
  assert.throws(()=>f.gate.prepare({model:'fixture',input:'second concurrent'}),{code:'provider_usage_unconfirmed'});
  const other=providerBudgetGate(f.store,{runId:'other',workloadId:'turn-budget',creation:f.creation});
  assert.throws(()=>other.prepare({model:'fixture',input:'other worker'}),{code:'provider_usage_unconfirmed'});
  f.jobs.recordTurn(f.job.chatId,{turnId:'turn-budget',tokens:null,ok:false,dispatched:true});
  assert.equal(creationObservedUsage(f.store,f.jobs.get(f.job.chatId)).pendingRequests,1);
});

test('text reserve cannot authorize opaque media, server-side history or hosted tools',()=>{
  for(const payload of [{input:[{type:'input_image',image_url:'https://example.invalid/image'}]},
    {previous_response_id:'opaque'},{conversation:'server-side'},{tools:[{type:'web_search'}]},
    {input:[{type:'input_file',file_id:'opaque'}]}])assert.throws(()=>prepareBudgetedRequest(payload,100_000),{code:'provider_budget_input_unbounded'});
  assert.throws(()=>prepareBudgetedRequest({input:'x'},0),{code:'provider_token_budget'});
  assert.throws(()=>prepareBudgetedRequest({input:'x',max_output_tokens:-1},100_000),{code:'provider_budget_invalid'});
  const result=prepareBudgetedRequest({input:'hello',max_output_tokens:8000},100_000);assert.equal(result.max_output_tokens,8000);
});

test('CLI tool schemas and namespaces remain bounded text, including media-shaped property names',()=>{
  const payload={model:'fixture',input:[{type:'message',role:'user',content:[{type:'input_text',text:'Create a local app'}]},
    {type:'function_call',name:'exec_command',arguments:'{"image_url":"a text value"}'},
    {type:'function_call_output',call_id:'fixture',output:'{"conversation":"ordinary tool output"}'},
    {type:'reasoning',summary:[{type:'summary_text',text:'A text plan'}]}],tools:[{type:'namespace',name:'fixture_tools',tools:[
      {type:'function',name:'send_input',parameters:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{
        type:{type:'string',enum:['text','image','file']},image_url:{type:'string'},file_id:{type:'string'},conversation:{type:'string'},
      }}}}}},
      {type:'custom',name:'apply_patch',format:{type:'text'}},
    ]}]};
  const bounded=prepareBudgetedRequest(payload,100_000);
  assert.equal(bounded.max_output_tokens,8192);
  assert.deepEqual(bounded.tools,payload.tools);assert.deepEqual(bounded.input,payload.input);
  for (const input of [
    [{type:'message',role:'user',content:[{type:'input_image',image_url:'https://example.invalid/image'}]}],
    [{type:'function_call_output',output:[{type:'input_file',file_id:'opaque'}]}],
    [{type:'item_reference',id:'opaque'}],
    [{type:'reasoning',encrypted_content:'opaque',summary:[]}],
  ]) assert.throws(()=>prepareBudgetedRequest({...payload,input},100_000),{code:'provider_budget_input_unbounded'});
  assert.throws(()=>prepareBudgetedRequest({...payload,tools:[{type:'namespace',name:'hidden',tools:[{type:'web_search'}]}]},100_000),{code:'provider_budget_input_unbounded'});
});

test('shrinking the response cap cannot disguise an exact request replay',async t=>{
  const f=fixture(t);f.jobs.update(f.job.chatId,j=>({...j,budget:{...j.budget,maxTokens:31_200}}));
  let calls=0;
  const server=await listenNeuralDeepAdapter({port:0,prepareResponsesRequest:f.gate.prepare,beforeResponsesDispatch:f.gate.claim,
    onRequest:e=>f.store.recordProviderResponse('run-budget',e),
    fetchImpl:async()=>{calls++;return Response.json({usage:{input_tokens:19900,output_tokens:100,total_tokens:20000}});}});
  t.after(()=>closeNeuralDeepAdapter(server));
  const send=async()=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:JSON.stringify({model:'fixture',input:'same caller request'})});await r.text();return r.status;};
  assert.equal(await send(),200);assert.equal(await send(),409);assert.equal(calls,1);
  assert.equal(f.store.providerUsageSummary('run-budget').usage.totalTokens,20000);
});


test('build requests honor the execution profile output cap independently of the preparation phase',()=>{
  for(const model of ['qwen3.8-27b','gpt-oss-120b']) {
    assert.equal(prepareBudgetedRequest({model,input:'Implement the approved product',max_output_tokens:65536},200000).max_output_tokens,8192);
    assert.equal(prepareBudgetedRequest({model,input:'Implement the approved product',max_output_tokens:2048},200000).max_output_tokens,2048);
  }
});
