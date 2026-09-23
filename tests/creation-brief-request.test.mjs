import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {NeuralDeepCoordinationStore} from '../scripts/neuraldeep/coordination-store.mjs';
import {AgentCreationStore} from '../scripts/neuraldeep/agent-creation-store.mjs';
import {creationDraftRoot} from '../scripts/neuraldeep/agent-creation.mjs';
import {prepareCreationContextPacket} from '../scripts/neuraldeep/creation-context-packet.mjs';
import {providerBudgetGate} from '../scripts/neuraldeep/provider-budget.mjs';
import {creationPreparationUsage} from '../scripts/neuraldeep/creation-preparation-policy.mjs';
import {validateCreationBriefResponse} from '../scripts/neuraldeep/creation-brief-request.mjs';
import {listenNeuralDeepAdapter,closeNeuralDeepAdapter} from '../scripts/neuraldeep/responses-adapter.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
const dialogue=[{role:'user',text:'Русский дайджест из https://example.test/feed. SQLite; максимум 20 материалов; без расписания.'},
  {role:'assistant',text:'Нужен экспорт Markdown?'},{role:'user',text:'Да. Секреты только в привязке Pritha; никаких частных адресов.'}];
function setup(t,{briefProtocolVersion=1,revisionInstruction,executionSettings}={}) {
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'brief-protocol-'));t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const store=new NeuralDeepCoordinationStore({databasePath:path.join(stateRoot,'coord.sqlite')});t.after(()=>store.close());
  const jobs=new AgentCreationStore(store),chatId='chat_brief',draftRoot=creationDraftRoot(stateRoot,'fixture',chatId);
  mkdirSync(draftRoot,{recursive:true});
  let job=jobs.create({chatId,instanceId:'fixture',agentId:'brief-fixture',releaseSha:'a'.repeat(40),target:path.join(stateRoot,'child'),
    draftRoot,tokenBudget:531720,preparationPolicyVersion:2,executionSettings,...(briefProtocolVersion?{briefProtocolVersion}:{})});
  job=jobs.update(chatId,j=>({...j,status:'running',activeTurnId:'turn_brief',
    ...(revisionInstruction?{proposalRevisionPending:true,revisionInstruction,revisionRequestId:'revision-request'}:{})}));
  const packet=prepareCreationContextPacket(job,{restart:true,text:JSON.stringify(dialogue)},{root:process.cwd(),stateRoot,turnId:'turn_brief'});
  job=jobs.update(chatId,j=>({...j,contextPacket:packet}));
  const runId='run_brief';store.beginRuntimeRun({runId,requestHash:hash(runId),receipt:{workload_id:'turn_brief',process_exited:false}});
  const gate=providerBudgetGate(store,{runId,workloadId:'turn_brief',creation:{chatId,jobId:job.jobId,releaseSha:job.releaseSha,generation:1,
    stateRoot,codeRoot:process.cwd(),preparation:{policyVersion:2,phase:'brief',workUnitId:'turn_brief',packetHash:packet.hash}}});
  const claim=payload=>gate.claim({payload,model:payload.model,bytes:Buffer.byteLength(JSON.stringify(payload)),requestHash:hash(JSON.stringify(payload))});
  return {store,jobs,job,runId,gate,claim};
}
const executorPayload={model:'fixture',stream:true,input:'Unneeded executor instructions and tool descriptions. '.repeat(2000),
  instructions:'General coding executor',tools:[{type:'function',name:'exec_command',parameters:{type:'object'}}],tool_choice:'auto'};

test('new Qwen reasoning brief reserves its larger output within the original phase ceiling',t=>{
  const f=setup(t,{executionSettings:{modelId:'qwen3.8-27b',effortId:'none'}});
  const payload=f.gate.prepare({...executorPayload,model:'qwen3.8-27b'});
  assert.equal(f.job.executionPolicy.modelProfile.version,2);
  assert.equal(f.job.preparationPolicy.outputTokens,16384);
  assert.equal(payload.max_output_tokens,16384);
  assert.equal(f.job.preparationPolicy.briefTokens,53172);
  assert.equal(payload.chat_template_kwargs,undefined,'unverified thinking control is not silently injected');
  f.claim(payload);
  const metadata=JSON.parse(f.store.db.prepare('SELECT metadata FROM provider_dispatches').get().metadata);
  assert.equal(metadata.budget.reservation,Buffer.byteLength(JSON.stringify(payload))+8192+16384);
  assert.ok(metadata.budget.reservation<=53172);
});

test('brief sends exact host dialogue without executor overhead and reserves the actual outgoing bytes',t=>{
  const f=setup(t),payload=f.gate.prepare(executorPayload);
  assert.deepEqual(JSON.parse(payload.input[0].content[0].text).dialogue,dialogue);
  assert.equal(payload.tool_choice,'none');assert.deepEqual(payload.tools,[]);
  assert.doesNotMatch(JSON.stringify(payload),/Unneeded executor|General coding executor|exec_command/);
  assert.ok(Buffer.byteLength(JSON.stringify(payload))<8000);
  f.claim(payload);
  const metadata=JSON.parse(f.store.db.prepare('SELECT metadata FROM provider_dispatches').get().metadata);
  assert.equal(metadata.budget.reservation,Buffer.byteLength(JSON.stringify(payload))+8192+8192);
  assert.ok(metadata.budget.reservation<53172);
  assert.equal(f.store.runtimeRun(f.runId).preparation.requestMode,'host-brief-v1');
  assert.equal(f.store.runtimeRun(f.runId).preparation.sourceBytes,Buffer.byteLength(JSON.stringify(executorPayload)));
});

test('prepared host brief cannot gain tools, different input or another model before the claim',t=>{
  const f=setup(t),payload=f.gate.prepare(executorPayload);
  for(const change of [{tools:executorPayload.tools},{input:'substituted'},{model:'foreign'}])
    assert.throws(()=>f.claim({...payload,...change}),{code:'provider_budget_context_changed'});
  assert.equal(f.store.providerUsageSummary(f.runId).providerRequests,0);
  assert.throws(()=>f.jobs.update(f.job.chatId,j=>({...j,briefProtocolVersion:undefined})),{code:'creation_policy_immutable'});
  writeFileSync(f.job.contextPacket.path,'{}');
  assert.throws(()=>f.claim(payload),{code:'provider_budget_documents_changed'});
});

test('UI revision instructions reach the paid request exactly and cannot change after preparation',t=>{
  const revisionInstruction='Исправь предложение на приложение с LLM. Сохрани RSS, SQLite и лимит 20.\nПодключение NeuralDeep управляется Pritha.';
  const f=setup(t,{revisionInstruction}),payload=f.gate.prepare(executorPayload);
  const packet=JSON.parse(payload.input[0].content[0].text);
  assert.deepEqual(packet.proposalRevision,{requestId:'revision-request',instruction:revisionInstruction});
  assert.deepEqual(packet.dialogue,dialogue);
  f.jobs.update(f.job.chatId,j=>({...j,revisionInstruction:'Substituted instruction'}));
  assert.throws(()=>f.claim(payload),{code:'provider_budget_documents_changed'});
  assert.equal(f.store.providerUsageSummary(f.runId).providerRequests,0);
});

test('unsolicited streamed tool call is withheld from CLI; usage is recorded and no next request is sent',async t=>{
  const f=setup(t);let calls=0;const observed=[];
  const response={id:'response_brief',status:'completed',output:[{id:'msg',type:'message',role:'assistant',content:[{type:'output_text',text:'Drafting now'}]}],
    usage:{input_tokens:2300,output_tokens:28,total_tokens:2328}};
  const raw=[{type:'response.output_item.added',item:{type:'function_call',name:'exec_command',arguments:'{"cmd":"echo ok"}'}},
    {type:'response.completed',response}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n';
  const server=await listenNeuralDeepAdapter({port:0,responsesOnly:true,prepareResponsesRequest:f.gate.prepare,beforeResponsesDispatch:f.gate.claim,
    validateResponsesResponse:f.gate.validateResponse,onRequest:e=>{observed.push(e);f.store.recordProviderResponse(f.runId,e);},
    fetchImpl:async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).tool_choice,'none');return new Response(raw,{headers:{'content-type':'text/event-stream'}});}});
  t.after(()=>closeNeuralDeepAdapter(server));
  const send=async suffix=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/responses`,{method:'POST',body:JSON.stringify({...executorPayload,input:executorPayload.input+suffix})});return {status:r.status,text:await r.text()};};
  const first=await send('');assert.equal(first.status,409);assert.doesNotMatch(first.text,/exec_command|echo ok|response\.output_item/);
  assert.equal(observed[0].error.code,'provider_budget_brief_tool_call');
  assert.equal(observed[0].upstreamAttempted,true);
  assert.equal(creationPreparationUsage(f.store,f.jobs.get(f.job.chatId)).total,2328);
  assert.equal((await send('changed retry')).status,409);assert.equal(calls,1);
  assert.equal(observed.at(-1).error.code,'provider_budget_brief_request_limit');
  assert.equal(f.store.providerUsageSummary(f.runId).usageKnown,true);
});

test('tool prohibition covers JSON, late terminal items, custom and unknown tools but permits a normal message',()=>{
  for(const type of ['function_call','custom_tool_call','local_shell_call','web_search_call','future_tool_call'])
    assert.throws(()=>validateCreationBriefResponse(JSON.stringify({output:[{type}]}),'application/json'),{code:'provider_budget_brief_tool_call'});
  assert.throws(()=>validateCreationBriefResponse('data: '+JSON.stringify({type:'response.function_call_arguments.delta',delta:'{}'})+'\n\n','text/event-stream'),{code:'provider_budget_brief_tool_call'});
  assert.doesNotThrow(()=>validateCreationBriefResponse(JSON.stringify({output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'```pritha-brief-json\n{}\n```'}]}]}),'application/json'));
});

test('existing jobs retain their request protocol and cannot silently opt into the new one',t=>{
  const f=setup(t,{briefProtocolVersion:null}),payload=f.gate.prepare({...executorPayload,input:'legacy short request'});
  assert.deepEqual(payload.tools,executorPayload.tools);assert.equal(payload.tool_choice,'auto');
  assert.throws(()=>f.jobs.update(f.job.chatId,j=>({...j,briefProtocolVersion:1})),{code:'creation_policy_immutable'});
});

test('compact brief never silently removes attachments or oversized mandatory requirements',t=>{
  const f=setup(t);
  assert.throws(()=>f.gate.prepare({...executorPayload,input:[{role:'user',content:[{type:'input_image',image_url:'https://example.test/image'}]}]}),{code:'provider_budget_input_unbounded'});
  const oversized={restart:true,text:JSON.stringify([{role:'user',text:'я'.repeat(33000)}])};
  assert.throws(()=>prepareCreationContextPacket(f.job,oversized,{root:process.cwd(),stateRoot:path.dirname(path.dirname(f.job.draftRoot)),turnId:'turn_brief'}),{code:'creation_context_requirements_too_large'});
  assert.equal(f.store.providerUsageSummary(f.runId).providerRequests,0);
});
