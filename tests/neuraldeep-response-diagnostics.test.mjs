import test from 'node:test';
import assert from 'node:assert/strict';
import {responsesSummary, responsesTerminalSummary} from '../scripts/neuraldeep/responses-normalizer.mjs';
import {listenNeuralDeepAdapter,closeNeuralDeepAdapter} from '../scripts/neuraldeep/responses-adapter.mjs';
import {dispatchBlockerMessage} from '../scripts/neuraldeep/dispatch-blocker-message.mjs';

const frame=event=>`data: ${JSON.stringify(event)}\n\n`;
const publicMessage={id:'private-id',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'PUBLIC FIXTURE'}]};
const terminal=(status='completed',output=[])=>({type:`response.${status}`,response:{status,output,
  usage:{input_tokens:1613,output_tokens:8192,total_tokens:9805}}});

test('terminal diagnostics preserve absent reasoning counts and discard all provider content',()=>{
  const response={...terminal().response,id:'private-response-id',error:{message:'private error'},
    incomplete_details:{reason:'private detail'},output:[{type:'reasoning',content:[{text:'private reasoning'}]},publicMessage,{type:'private-kind'}]};
  const summary=responsesTerminalSummary(response,{outputLimit:8192});
  assert.equal(summary.outputLimitReached,true);assert.equal(summary.reasoningTokens,null);
  assert.equal(summary.incompleteReason,'other');assert.equal(summary.terminalPublicText,true);
  assert.deepEqual(summary.outputItems,{message:1,reasoning:1,function_call:0,custom_tool_call:0,local_shell_call:0,other:1});
  assert.doesNotMatch(JSON.stringify(summary),/private|FIXTURE/);
  assert.equal(responsesTerminalSummary({...response,usage:{...response.usage,output_tokens_details:{reasoning_tokens:0}}}).reasoningTokens,0);
  assert.equal(responsesSummary('{','application/json'),null);
  assert.equal(responsesSummary(frame({type:'response.in_progress',response:{}}),'text/event-stream'),null);
  assert.equal(responsesTerminalSummary({status:'private-status'}),null);
});

for(const buffered of [false,true]) for(const variant of ['empty-cap','empty-below','incomplete-cap','valid-cap']) {
  test(`HTTP ${buffered?'buffered':'incremental'} response diagnostic: ${variant}`,async t=>{
    const incomplete=variant==='incomplete-cap',valid=variant==='valid-cap';
    const event=terminal(incomplete?'incomplete':'completed',valid?[publicMessage]:[]);
    if(incomplete) {
      event.response.incomplete_details={reason:'max_output_tokens'};
      event.response.output=[{id:'fc',type:'function_call',call_id:'call',name:'must_not_execute',arguments:'{}'}];
    }
    if(variant==='empty-below') {event.response.usage.output_tokens=12;event.response.usage.total_tokens=1625;}
    let calls=0;const observed=[];
    const server=await listenNeuralDeepAdapter({port:0,...(buffered?{validateResponsesResponse:()=>{}}:{}),
      fetchImpl:async()=>{calls++;return new Response(frame(event),{headers:{'content-type':'text/event-stream'}});},
      onRequest:value=>observed.push(value)});
    t.after(()=>closeNeuralDeepAdapter(server));
    const response=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:JSON.stringify({model:'qwen3.8-27b',max_output_tokens:8192})});
    const body=await response.text();
    assert.equal(calls,1);assert.equal(observed.length,1);
    assert.equal(observed[0].usage.totalTokens,variant==='empty-below'?1625:9805);
    assert.equal(observed[0].responseSummary.outputLimitReached,variant!=='empty-below');
    if(valid) {assert.equal(observed[0].error,null);assert.match(body,/PUBLIC FIXTURE/);}
    else {
      assert.equal(observed[0].error.code,variant==='empty-below'?'neuraldeep_empty_response':'neuraldeep_output_limit');
      assert.equal(observed[0].error.class,'input');assert.equal(observed[0].error.retryAfter,null);
      assert.doesNotMatch(body,/response\.output_item\.done|response\.completed/);
    }
  });
}

test('response and unrecognized blockers never tell the operator to fix attachments',()=>{
  for(const code of ['neuraldeep_empty_response','neuraldeep_output_limit','neuraldeep_response_incomplete','neuraldeep_stream_truncated','future_error']) {
    const message=dispatchBlockerMessage(code);assert.doesNotMatch(message,/Attachment validation/);assert.match(message,/сохран|сохранён/);
  }
  assert.match(dispatchBlockerMessage('neuraldeep_output_limit'),/не переполнение входного контекста/);
  assert.match(dispatchBlockerMessage('attachment_original_not_preserved'),/Attachment validation/);
});
