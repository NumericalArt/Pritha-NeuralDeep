import test from 'node:test';
import assert from 'node:assert/strict';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { listenNeuralDeepAdapter, closeNeuralDeepAdapter, responsesUsage } from '../scripts/neuraldeep/responses-adapter.mjs';
import { creationRuntimeReceipt } from '../scripts/neuraldeep/creation-runtime-receipt.mjs';

const measured={input_tokens:120,cached_input_tokens:100,output_tokens:20,total_tokens:140};
const sse=usage=>`data: ${JSON.stringify({type:'response.completed',response:{id:'response-fixture',status:'completed',output:[{id:'message-fixture',type:'message',role:'assistant',content:[{type:'output_text',text:'Fixture answer'}]}],usage}})}\n\ndata: [DONE]\n\n`;
test('provider usage requires valid terminal counts and never infers a truncated response as zero',()=>{
  for(const body of [sse(measured),JSON.stringify({usage:measured})]) {
    const result=responsesUsage(body,body.startsWith('data:')?'text/event-stream':'application/json');
    assert.equal(result.totalTokens,140);assert.equal(result.cachedInputTokens,100);
  }
  for(const body of ['', 'data: {"type":"response.output_text.delta","delta":"hello"}\n\n', sse({...measured,total_tokens:141}), 'data: invalid\n\n'])assert.equal(responsesUsage(body,'text/event-stream'),null);
});

test('adapter records each final response before an interrupted turn and preserves the unknown remainder',async t=>{
  const store=new NeuralDeepCoordinationStore();t.after(()=>store.close());
  store.beginRuntimeRun({runId:'run-fixture',requestHash:'a'.repeat(64),receipt:{workload_id:'turn-fixture'}});
  let calls=0;
  const server=await listenNeuralDeepAdapter({port:0,
    beforeResponsesDispatch:event=>store.claimProviderRequest('run-fixture',event.requestHash,{model:event.model,bytes:event.bytes}),
    onRequest:event=>store.recordProviderResponse('run-fixture',event),
    fetchImpl:async()=>{calls++;if(calls===2)throw new Error('source stream interrupted');return new Response(sse(measured),{headers:{'content-type':'text/event-stream'}});}});
  t.after(()=>closeNeuralDeepAdapter(server));
  const send=async input=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:JSON.stringify({model:'fixture',input})});await response.text();return response.status;};
  assert.equal(await send('first'),200);
  assert.deepEqual(store.providerUsageSummary('run-fixture'),{providerRequests:1,unknownRequests:0,usageKnown:true,usage:{inputTokens:120,cachedInputTokens:100,outputTokens:20,reasoningTokens:0,totalTokens:140}});
  assert.equal(await send('second'),502);
  assert.equal(await send('second'),409);
  const summary=store.providerUsageSummary('run-fixture');
  assert.equal(calls,2);assert.equal(summary.unknownRequests,1);assert.equal(summary.usageKnown,false);assert.equal(summary.usage.totalTokens,140);
  store.updateRuntimeRun('run-fixture',{process_exited:true,process_tree_exited:true,adapter_closed:true,usage_record:summary});
  assert.equal(creationRuntimeReceipt(store,'turn-fixture').tokens,null,'known partial counts must not authorize another paid creation step');
  const row=store.db.prepare('SELECT request_hash,metadata FROM provider_dispatches WHERE run_id=? ORDER BY created_at LIMIT 1').get('run-fixture');
  assert.equal(store.recordProviderResponse('run-fixture',{requestHash:row.request_hash,status:200,usage:measured,upstreamAttempted:true}),false);
  assert.throws(()=>store.recordProviderResponse('run-fixture',{requestHash:row.request_hash,status:200,usage:{...measured,output_tokens:21,total_tokens:141},upstreamAttempted:true}),/receipt_conflict/);
  assert.equal(store.providerUsageSummary('run-fixture').usage.totalTokens,140,'duplicate receipt does not charge twice');
  assert.doesNotMatch(row.metadata,/first|Bearer|response-fixture/,'receipt contains no source content or credentials');
});

test('a complete provider error response settles at its reservation; interrupted transport stays unknown',async t=>{
  const store=new NeuralDeepCoordinationStore();t.after(()=>store.close());
  let current={run:null,budgeted:false,interrupted:false};
  const server=await listenNeuralDeepAdapter({port:0,
    beforeResponsesDispatch:event=>store.claimProviderRequest(current.run,event.requestHash,{model:event.model,bytes:event.bytes,
      ...(current.budgeted?{budget:{reservation:5000,outputLimit:1000}}:{})}),
    onRequest:event=>store.recordProviderResponse(current.run,event),
    fetchImpl:async()=>{
      if(current.interrupted)throw new Error('source stream interrupted');
      return new Response(JSON.stringify({error:{message:'Модель не ответила за отведённое время.'}}),{status:504,headers:{'content-type':'application/json'}});
    }});
  t.after(()=>closeNeuralDeepAdapter(server));
  const send=async(run,options={})=>{
    current={run,budgeted:true,interrupted:false,...options};
    store.beginRuntimeRun({runId:run,requestHash:'a'.repeat(64),receipt:{workload_id:`turn-${run}`}});
    const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:JSON.stringify({model:'fixture',input:run})});
    await response.text();
    store.updateRuntimeRun(run,{process_exited:true,process_tree_exited:true,adapter_closed:true,usage_record:store.providerUsageSummary(run)});
    return response.status;
  };

  assert.equal(await send('gateway-run'),504);
  assert.deepEqual(store.providerUsageSummary('gateway-run'),{providerRequests:1,unknownRequests:0,usageKnown:true,usage:{inputTokens:4000,cachedInputTokens:0,outputTokens:1000,reasoningTokens:0,totalTokens:5000}});
  assert.equal(creationRuntimeReceipt(store,'turn-gateway-run').tokens,5000,'the upper bound settles the step without inventing a smaller spend');
  assert.match(store.db.prepare('SELECT metadata FROM provider_dispatches WHERE run_id=?').get('gateway-run').metadata,/reservation_upper_bound/);

  assert.equal(await send('unbudgeted-run',{budgeted:false}),504);
  assert.equal(store.providerUsageSummary('unbudgeted-run').usageKnown,false,'without a reservation there is no bound to settle at');

  assert.equal(await send('interrupted-run',{interrupted:true}),502);
  assert.equal(store.providerUsageSummary('interrupted-run').usageKnown,false,'a broken transport is not a provider rejection');
  assert.equal(creationRuntimeReceipt(store,'turn-interrupted-run').tokens,null);
});

test('durable request usage is scoped to each run, including exact-session continuation',()=>{
  const store=new NeuralDeepCoordinationStore();
  try {
    for(const runId of ['first-run','resumed-run']) {
      store.beginRuntimeRun({runId,requestHash:'a'.repeat(64),receipt:{session_id:'same-session',workload_id:'same-turn'}});
      store.claimProviderRequest(runId,'b'.repeat(64));
      store.recordProviderResponse(runId,{requestHash:'b'.repeat(64),upstreamAttempted:true,status:200,usage:measured});
      const summary=store.providerUsageSummary(runId);
      store.updateRuntimeRun(runId,{process_exited:true,process_tree_exited:true,adapter_closed:true,usage_record:summary});
    }
    assert.equal(creationRuntimeReceipt(store,'same-turn').tokens,280);
    assert.equal(creationRuntimeReceipt(store,'same-turn').tokens,280);
  } finally {store.close();}
});
