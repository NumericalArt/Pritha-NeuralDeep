import * as maintenance from '../scripts/neuraldeep/release-maintenance.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import * as coordination from '../scripts/neuraldeep/coordination-store.mjs';
import * as operatorRequests from '../scripts/neuraldeep/operator-requests.mjs';
import * as workspaces from '../scripts/neuraldeep/execution-workspaces.mjs';
import * as resources from '../scripts/neuraldeep/execution-resources.mjs';
import * as identity from '../scripts/neuraldeep/runtime-identity.mjs';
import * as handoffs from '../scripts/neuraldeep/handoff-barriers.mjs';
import { NeuralDeepChatHistoryStore } from '../scripts/neuraldeep/chat-history-store.mjs';
const require=createRequire(import.meta.url), root=process.cwd();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate) { for(let i=0;i<200;i++) { if(await predicate()) return; await sleep(10); } assert.fail('bounded wait expired'); }
function load(file,dependencies) {
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)(id=>id.startsWith('node:')?require(id):(id.endsWith('/release-maintenance.mjs') ? maintenance : dependencies[id])||{},module,module.exports);
  return module.exports;
}
async function fixture(t,{sourceProject=null}={}) {
  const root=sourceProject || process.cwd();
  const tmp=mkdtempSync(path.join(os.tmpdir(),'nd-queue-behavior-')),stateRoot=path.join(tmp,'state');mkdirSync(stateRoot);
  const runtimeIdentity=identity.neuralDeepRuntimeIdentity(stateRoot),privateRoot=path.join(stateRoot,'codex-chat');
  const history=new NeuralDeepChatHistoryStore({databasePath:path.join(privateRoot,'history.sqlite'),instanceScope:createHash('sha256').update(stateRoot).digest('hex')});
  const settings={codexSandbox:'read-only',codexNetworkAccess:false,codexTimeoutMs:22_222,updatedAt:new Date().toISOString()};
  const coordinatorModule=load('interfaces/control-center/src/lib/codex-chat/admission-coordinator.ts',{
    '@/lib/pritha-paths':{resolveTechscopeRoot:()=>root,resolvePrithaStateRoot:()=>stateRoot},
    '../../../../../scripts/neuraldeep/coordination-store.mjs':coordination,
    '../../../../../scripts/neuraldeep/operator-requests.mjs':operatorRequests,
  });
  const admission=new coordinatorModule.NeuralDeepAdmissionCoordinator({stateRoot,ledgerPath:null,databasePath:path.join(privateRoot,'admission.sqlite'),limitProvider:async()=>3,pollMs:25});
  const topics=new Map();let topicLock=Promise.resolve();
  const topicStore={get:async id=>topics.get(id),withTopic(id,generation,operation){
    const next=topicLock.then(()=>{const topic=topics.get(id);if(!topic || topic.scope.generation!==generation)throw new Error('voice_topic_generation_conflict');return operation(structuredClone(topic));});
    topicLock=next.catch(()=>{});return next;
  }};
  const handoffModule=load('interfaces/control-center/src/lib/codex-chat/voice-queued-handoff.ts',{
    '../../../../../scripts/neuraldeep/coordination-store.mjs':coordination,
    '../../../../../scripts/neuraldeep/handoff-barriers.mjs':handoffs,
    '../../../../../scripts/neuraldeep/runtime-identity.mjs':identity,
  });
  const {CodexChatGateway}=load('interfaces/control-center/src/lib/codex-chat/gateway.ts',{
    './voice-queued-handoff':handoffModule,
    './voice-task-links':{getVoiceTaskLinkService:()=>({topicStore})},
    '../../../../../scripts/neuraldeep/runtime-identity.mjs':identity,
    '../../../../../scripts/neuraldeep/coordination-store.mjs':coordination,
    '../../../../../scripts/neuraldeep/execution-workspaces.mjs':workspaces,
    '../../../../../scripts/neuraldeep/execution-resources.mjs':resources,
    '@/lib/realtime/pritha-runtime':{getPrithaRuntimeSettings:()=>settings},
    '@/lib/private-user-context':{privateUserContextFor:()=>''},
    './admission-coordinator':coordinatorModule,
    './budget-intent':{parseBudgetIntent:()=>({kind:'none'})},
    './attachment-store':{AttachmentError:class AttachmentError extends Error{}},
    './neuraldeep-cli-runner':{classifyNeuralDeepRunnerFailure:result=>({kind:result.kind||'none'})},
  });
  const store={stateRoot,stateIdentityHash:runtimeIdentity.stateIdentityHash,root:privateRoot,
    historyStore:async()=>history,get:async id=>history.get(id),getTurn:async(id,turn)=>history.turn(id,turn),receipt:async(id,key)=>history.receipt(id,key),
    mutate:async(id,update)=>history.mutate(id,update)?.binding,mutateTurn:async(id,turn,update)=>history.mutateTurn(id,turn,update),
    patch:async(id,patch)=>history.mutate(id,current=>({...current,...patch}))?.binding,putItem:async(...args)=>history.putItem(...args),
  };
  const runs=[];
  const gateway=Object.create(CodexChatGateway.prototype);
  Object.assign(gateway,{root,store,admission,recoveryComplete:true,activeTurns:new Map(),waitingTurns:new Map(),events:new Map(),subscribers:new Map(),
    runtime:{probe:async()=>({ok:true,state:'available'})},emit(){},emitThreadUpdated:async()=>{},threadDetail:async id=>({thread:history.get(id)}),
    prepareAttachments:async()=>[],attachmentDispatch:async()=>({images:[],prompt:''}),
    runner:{start:async options=>{
      let finish;const completion=new Promise(resolve=>{finish=resolve;});
      const run={options,completion,child:{pid:0},finish,interrupt:()=>finish({kind:'interrupted'})};runs.push(run);return run;
    }},
  });
  function chat(id='chat_one',session='session_one') {
    history.put({chatId:id,clientThreadId:`client_${id}`,createHash:'fixture',nativeThreadId:session,providerId:'neuraldeep_cli',providerState:'available',
      modelId:'fixture-model',effortId:null,stateIdentityHash:runtimeIdentity.stateIdentityHash,profileIdentity:runtimeIdentity.profileIdentity,identityStatus:'recorded',workspacePath:root,
      group:'my_chats',origin:'chat',continuationEnabled:true,voiceTopicId:null,title:'Fixture',preview:'',createdAt:settings.updatedAt,updatedAt:settings.updatedAt,
      pinned:false,archived:false,lastStatus:'idle',messageReceipts:{},taskLinks:[],turns:[]});return id;
  }
  t.after(async()=>{await gateway.dispose();await sleep(30);admission.close();history.close();rmSync(tmp,{recursive:true,force:true});});
  const journal=new coordination.NeuralDeepCoordinationStore(coordination.neuralDeepCoordinationPaths(stateRoot,root));
  t.after(()=>journal.close());
  function voice(){
    const id=chat('chat_voice','session_voice'),topicId='topic_fixture',scope={kind:'task',id:'subject',label:'Fixture',generation:1};
    const taskId='voice_first',turn={turnId:'turn_voicefirst',taskId,status:'in_progress',startedAt:settings.updatedAt,completedAt:null,
      userMessage:{id:'msg_voice',markdown:'Voice task',attachments:[]},items:[],error:null};
    history.mutate(id,current=>({...current,origin:'voice',group:'voice_work',voiceTopicId:topicId,continuationEnabled:false,
      taskLinks:[{taskId,mode:'shared_thread',status:'active',subjectScope:scope}],turns:[turn]}));
    topics.set(topicId,{topicId,scope,chatId:id,sessionId:'session_voice',stateIdentityHash:runtimeIdentity.stateIdentityHash,
      activeTaskId:taskId,queuedTaskIds:[],lastTaskId:taskId,operationalStatus:'active'});
    journal.enqueue({attemptId:'voice_initial',workloadId:taskId,surface:'voice',coordinationKeyHash:coordination.coordinationHash(topicId),sessionKeyHash:identity.neuralDeepSessionKey(stateRoot,'session_voice'),queuedAt:settings.updatedAt});
    const lease=journal.claim('voice_initial',3);assert.ok(lease);
    function complete(){history.mutateTurn(id,turn.turnId,row=>({...row,status:'completed',completedAt:new Date().toISOString()}));Object.assign(topics.get(topicId),{activeTaskId:null,operationalStatus:'idle'});journal.finish(lease.attemptId,lease.ownerToken,'completed');}
    return {id,topicId,taskId,turn,lease,complete,input:{taskId,topicGeneration:1}};
  }
  return {gateway,history,admission,runs,settings,chat,topics,journal,voice};
}
const message=(id,text=id,mode)=>({clientMessageId:`message_${id}`,input:[{type:'text',text}],...(mode?{mode}: {})});

test('active Voice handoff preserves multiple typed inputs, blocks future Voice priority, and resumes the exact session once per input',async t=>{
  const f=await fixture(t),v=f.voice(),input={...message('voice_after','Original typed input','after_completion'),voiceHandoff:v.input};
  const replies=await Promise.all([f.gateway.startTurn(v.id,input),f.gateway.startTurn(v.id,input)]);
  assert.equal(replies.filter(row=>row.replayed).length,1);
  const first=replies[0].accepted.turn,second=(await f.gateway.startTurn(v.id,{...input,clientMessageId:'second_typed'})).accepted.turn;
  assert.equal(first.executionIntent.voiceHandoff.id,second.executionIntent.voiceHandoff.id);
  assert.equal(second.executionIntent.predecessorTurnId,first.turnId);
  f.journal.enqueue({attemptId:'future_voice',workloadId:'future_voice',surface:'voice',coordinationKeyHash:coordination.coordinationHash(v.topicId),sessionKeyHash:identity.neuralDeepSessionKey(f.gateway.store.stateRoot,'session_voice'),queuedAt:new Date().toISOString(),predecessorPriority:true});
  f.topics.get(v.topicId).queuedTaskIds.push('future_voice');
  const other=f.chat('chat_independent','independent_session');await f.gateway.startTurn(other,message('independent'));await until(()=>f.runs.length===1);
  assert.equal(f.runs[0].options.resume,'independent_session');v.complete();
  await until(()=>f.runs.length===2);assert.equal(f.runs[1].options.resume,'session_voice');assert.equal(f.journal.claim('future_voice',3),null);
  f.runs[1].finish({});await until(()=>f.runs.length===3);assert.equal(f.runs[2].options.resume,'session_voice');
  assert.equal(f.journal.claim('future_voice',3),null);f.runs[2].finish({});f.runs[0].finish({});await until(()=>f.admission.snapshot().active.length===0);
  assert.ok(f.journal.claim('future_voice',3));assert.equal(f.history.get(v.id).continuationEnabled,true);
});

test('queued Voice handoff cancellation is replayable and never answers a waiting question or cancels Voice',async t=>{
  const f=await fixture(t),v=f.voice();f.topics.get(v.topicId).operationalStatus='waiting_for_operator';
  const turn=(await f.gateway.startTurn(v.id,{...message('cancel_voice','Draft to preserve','after_completion'),voiceHandoff:v.input})).accepted.turn;
  const request={requestId:'cancel_voice_handoff',expectedRevision:turn.executionIntent.queueRevision};
  await f.gateway.cancelQueuedTurn(v.id,turn.turnId,request);assert.equal((await f.gateway.cancelQueuedTurn(v.id,turn.turnId,request)).replayed,true);
  assert.equal(f.journal.handoffs.get(turn.executionIntent.voiceHandoff.id).state,'cancelled');
  assert.equal(f.topics.get(v.topicId).operationalStatus,'waiting_for_operator');assert.equal(f.history.turn(v.id,v.turn.turnId).status,'in_progress');assert.equal(f.runs.length,0);
  assert.equal(f.history.originalUserText(v.id,turn.turnId),'Draft to preserve');v.complete();
});

test('failed Voice predecessors keep the handoff visible and stale topic generations cannot dispatch it',async t=>{
  const f=await fixture(t),v=f.voice();
  const turn=(await f.gateway.startTurn(v.id,{...message('failed_voice','Keep this','after_completion'),voiceHandoff:v.input})).accepted.turn;
  f.journal.finish(v.lease.attemptId,v.lease.ownerToken,'failed');Object.assign(f.topics.get(v.topicId),{activeTaskId:null,operationalStatus:'failed'});
  await until(()=>f.history.turn(v.id,turn.turnId).status==='failed');assert.equal(f.runs.length,0);
  assert.equal(f.journal.handoffs.get(turn.executionIntent.voiceHandoff.id).state,'reserved');
  f.topics.get(v.topicId).scope.generation=2;
  await f.gateway.recoverTurn(v.id,turn.turnId,'resume',{requestId:'stale_generation_recovery',expectedAttemptId:turn.executionIntent.attemptId});
  await until(()=>f.history.turn(v.id,turn.turnId).status==='failed');assert.equal(f.runs.length,0);
  await f.gateway.recoverTurn(v.id,turn.turnId,'cancel',{requestId:'cancel_failed_handoff',expectedAttemptId:f.history.turn(v.id,turn.turnId).executionIntent.attemptId});
  assert.equal(f.journal.handoffs.get(turn.executionIntent.voiceHandoff.id).state,'cancelled');
});

test('a failure after the durable input but before the handoff fence preserves a receipt and never dispatches on replay',async t=>{
  const f=await fixture(t),v=f.voice(),input={...message('fence_gap','Saved despite disk failure','after_completion'),voiceHandoff:v.input};
  const reserve=handoffs.NeuralDeepHandoffBarriers.prototype.reserve;
  let response;
  try {
    handoffs.NeuralDeepHandoffBarriers.prototype.reserve=()=>{throw new Error('synthetic_disk_failure');};
    response=await f.gateway.startTurn(v.id,input);
  } finally {handoffs.NeuralDeepHandoffBarriers.prototype.reserve=reserve;}
  const turn=response.accepted.turn;assert.equal(turn.status,'failed');assert.equal(f.runs.length,0);
  assert.equal((await f.gateway.startTurn(v.id,input)).replayed,true);v.complete();await sleep(280);assert.equal(f.runs.length,0);
  assert.equal(f.history.originalUserText(v.id,turn.turnId),'Saved despite disk failure');
  await f.gateway.recoverTurn(v.id,turn.turnId,'cancel',{requestId:'cancel_fence_gap',expectedAttemptId:turn.executionIntent.attemptId});
});

test('A and B share an exact session queue while C runs independently; accepted settings remain immutable',async t=>{
  const f=await fixture(t),a=f.chat(),c=f.chat('chat_other','session_other');
  const first=await f.gateway.startTurn(a,message('a'));await until(()=>f.runs.length===1);
  const queued=await f.gateway.startTurn(a,message('b','  keep exact text  ','after_completion'));
  const independent=await f.gateway.startTurn(c,message('c'));await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].options.workloadId,independent.accepted.turn.turnId);assert.equal(queued.accepted.turn.status,'queued');
  assert.equal(f.history.turn(a,queued.accepted.turn.turnId).executionIntent.predecessorTurnId,first.accepted.turn.turnId);
  f.settings.codexTimeoutMs=11_111;f.runs[0].finish({});await until(()=>f.runs.length===3);
  assert.equal(f.runs[2].options.resume,'session_one');assert.equal(f.runs[2].options.prompt,'  keep exact text  ');assert.equal(f.runs[2].options.timeoutMs,22_222);
  f.runs[1].finish({});f.runs[2].finish({});await until(()=>f.admission.snapshot().active.length===0);
});

test('duplicate queued acceptance makes one receipt; cancellation is revisioned and does not stop the predecessor',async t=>{
  const f=await fixture(t),chat=f.chat();await f.gateway.startTurn(chat,message('first'));await until(()=>f.runs.length===1);
  const input=message('queued','original '.repeat(2000),'after_completion');
  const pair=await Promise.all([f.gateway.startTurn(chat,input),f.gateway.startTurn(chat,input)]);
  assert.equal(pair.filter(result=>result.replayed).length,1);assert.equal(pair[0].accepted.turn.turnId,pair[1].accepted.turn.turnId);
  const turn=pair[0].accepted.turn,request={requestId:'cancel_queued_once',expectedRevision:turn.executionIntent.queueRevision};
  const cancelled=await f.gateway.cancelQueuedTurn(chat,turn.turnId,request);assert.equal(cancelled.originalText,input.input[0].text);
  assert.equal((await f.gateway.cancelQueuedTurn(chat,turn.turnId,request)).replayed,true);
  await assert.rejects(f.gateway.cancelQueuedTurn(chat,turn.turnId,{requestId:'different_cancel',expectedRevision:1}),error=>error.code==='queue_changed');
  assert.equal(f.runs.length,1);f.runs[0].finish({});await until(()=>f.admission.snapshot().active.length===0);await sleep(50);assert.equal(f.runs.length,1);
  assert.equal(f.history.receipt(chat,input.clientMessageId).value.turnId,turn.turnId);
});

test('a failed predecessor pauses its queue and an old stop request cannot stop a successor',async t=>{
  const f=await fixture(t),chat=f.chat();const first=await f.gateway.startTurn(chat,message('first'));await until(()=>f.runs.length===1);
  await f.gateway.startTurn(chat,message('after','queued','after_completion'));f.runs[0].finish({kind:'runtime_failed'});
  await until(()=>f.admission.snapshot().active.length===0);await sleep(60);assert.equal(f.runs.length,1);assert.equal(f.admission.snapshot().queued.length,1);
  f.admission.resumeCoordinationKey(`${f.history.get(chat).stateIdentityHash}:${chat}`);
  // The native-session pause is separate and cannot be bypassed by clearing the UI binding's pause.
  await sleep(50);assert.equal(f.runs.length,1);
  const other=f.chat('chat_successor','session_successor');await f.gateway.startTurn(other,message('old'));await until(()=>f.runs.length===2);
  await assert.rejects(f.gateway.interruptTurn(other,first.accepted.turn.turnId),error=>error.code==='turn_changed');assert.equal(f.runs[1].options.resume,'session_successor');
  f.runs[1].finish({});await until(()=>f.admission.snapshot().active.length===0);
});

test('cancelling the last waiting message clears chat activity and allows another command',async t=>{
  const f=await fixture(t),first=f.chat(),waiting=f.chat('chat_waiting','session_one');
  await f.gateway.startTurn(first,message('holds_session'));await until(()=>f.runs.length===1);
  const turn=(await f.gateway.startTurn(waiting,message('waiting_only'))).accepted.turn;
  await until(()=>f.admission.snapshot().queued.length===1);
  await f.gateway.cancelQueuedTurn(waiting,turn.turnId,{requestId:'cancel_last_waiting',expectedRevision:turn.executionIntent.queueRevision});
  assert.equal(f.history.get(waiting).lastStatus,'idle');assert.equal(f.history.liveTurns(waiting).length,0);
  assert.equal(f.history.get(first).lastStatus,'active');assert.equal(f.runs.length,1);
  assert.equal(f.history.originalUserText(waiting,turn.turnId),'waiting_only');
  await f.gateway.startTurn(waiting,message('next_command'));f.runs[0].finish({});
  await until(()=>f.runs.length===2);f.runs[1].finish({});await until(()=>f.admission.snapshot().active.length===0);
});

test('explicit recovery uses a new attempt, has one receipt and runs before its blocked successors',async t=>{
  const f=await fixture(t),chat=f.chat(),original='preserve original '.repeat(1000);
  const first=await f.gateway.startTurn(chat,message('recover_me',original));await until(()=>f.runs.length===1);
  const queued=await f.gateway.startTurn(chat,message('successor','after recovery','after_completion'));
  f.runs[0].finish({kind:'runtime_failed'});await until(()=>f.history.turn(chat,first.accepted.turn.turnId).status==='failed');
  const old=f.history.turn(chat,first.accepted.turn.turnId).executionIntent.attemptId;
  const request={requestId:'recovery_single_intent',expectedAttemptId:old};
  await Promise.all([f.gateway.recoverTurn(chat,first.accepted.turn.turnId,'resume',request),f.gateway.recoverTurn(chat,first.accepted.turn.turnId,'resume',request)]);
  await until(()=>f.runs.length===2);assert.notEqual(f.history.turn(chat,first.accepted.turn.turnId).executionIntent.attemptId,old);
  assert.ok(f.runs[1].options.prompt.endsWith(original));assert.equal(f.runs[1].options.resume,'session_one');
  await assert.rejects(f.gateway.recoverTurn(chat,first.accepted.turn.turnId,'retry',request),error=>error.code==='idempotency_conflict');
  f.runs[1].finish({});await until(()=>f.runs.length===3);assert.equal(f.runs[2].options.workloadId,queued.accepted.turn.turnId);
  f.runs[2].finish({});await until(()=>f.admission.snapshot().active.length===0);
  assert.equal(f.history.originalUserText(chat,first.accepted.turn.turnId),original);
});

test('recovery check keeps an unconfirmed turn blocked and enables a later explicit resume without replaying work',async t=>{
  const f=await fixture(t),chat=f.chat(),original='Preserve this input and history';
  const first=await f.gateway.startTurn(chat,message('check_recovery',original));await until(()=>f.runs.length===1);
  f.runs[0].finish({kind:'runtime_failed'});const turnId=first.accepted.turn.turnId;
  await until(()=>f.history.turn(chat,turnId).status==='failed');
  f.history.mutateTurn(chat,turnId,turn=>({...turn,error:{code:'admission_runtime_exit_unconfirmed',message:'Stop unconfirmed'}}));
  const before=f.history.turn(chat,turnId),realReconcile=f.admission.reconcileWorkload.bind(f.admission);
  f.admission.reconcileWorkload=()=>{throw new Error('admission_runtime_exit_unconfirmed');};
  await assert.rejects(f.gateway.recoverTurn(chat,turnId,'reconcile',{requestId:'check_still_running',expectedAttemptId:before.executionIntent.attemptId}),error=>error.code==='admission_runtime_exit_unconfirmed');
  assert.deepEqual(f.history.turn(chat,turnId),before);assert.equal(f.runs.length,1);
  f.admission.reconcileWorkload=realReconcile;
  const request={requestId:'check_now_stopped',expectedAttemptId:before.executionIntent.attemptId};
  await Promise.all([f.gateway.recoverTurn(chat,turnId,'reconcile',request),f.gateway.recoverTurn(chat,turnId,'reconcile',request)]);
  const checked=f.history.turn(chat,turnId);
  assert.equal(checked.status,'failed');assert.equal(checked.error.code,'resume_confirmation_required');
  assert.deepEqual(checked.executionIntent,before.executionIntent);assert.deepEqual(checked.items,before.items);
  assert.equal(f.history.originalUserText(chat,turnId),original);assert.equal(f.runs.length,1,'a successful check must never launch a model');
  await assert.rejects(f.gateway.recoverTurn(chat,turnId,'resume',request),error=>error.code==='idempotency_conflict');
  await assert.rejects(f.gateway.recoverTurn(chat,turnId,'reconcile',{requestId:'check_stale_attempt',expectedAttemptId:'different_attempt'}),error=>error.code==='turn_changed');
  await f.gateway.recoverTurn(chat,turnId,'resume',{requestId:'resume_after_check',expectedAttemptId:before.executionIntent.attemptId});
  await until(()=>f.runs.length===2);assert.equal(f.runs[1].options.resume,'session_one');
  f.runs[1].finish({});await until(()=>f.admission.snapshot().active.length===0);
});

test('a replayed old queue cancellation cannot interrupt a later execution of that turn',async t=>{
  const f=await fixture(t),chat=f.chat();await f.gateway.startTurn(chat,message('parent'));await until(()=>f.runs.length===1);
  const accepted=await f.gateway.startTurn(chat,message('cancelled','saved request','after_completion'));
  const turn=accepted.accepted.turn,request={requestId:'cancel_before_edit',expectedRevision:turn.executionIntent.queueRevision};
  await f.gateway.cancelQueuedTurn(chat,turn.turnId,request);f.runs[0].finish({});await until(()=>f.admission.snapshot().active.length===0);
  // A later operator recovery is a different intent even when the UI retains the logical turn.
  f.history.mutateTurn(chat,turn.turnId,current=>({...current,status:'failed',error:{code:'resume_confirmation_required',message:'synthetic recovery'}}));
  await f.gateway.recoverTurn(chat,turn.turnId,'resume',{requestId:'later_operator_resume',expectedAttemptId:turn.executionIntent.attemptId});await until(()=>f.runs.length===2);
  assert.equal((await f.gateway.cancelQueuedTurn(chat,turn.turnId,request)).replayed,true);
  assert.equal(f.history.turn(chat,turn.turnId).status,'in_progress');assert.equal(f.admission.snapshot().active.length,1);
  f.runs[1].finish({});await until(()=>f.admission.snapshot().active.length===0);
});

test('queued permissions never expand when Settings changes and a new restriction stops dispatch',async t=>{
  const f=await fixture(t),chat=f.chat();await f.gateway.startTurn(chat,message('first_read'));await until(()=>f.runs.length===1);
  await f.gateway.startTurn(chat,message('bound_read','read only snapshot','after_completion'));
  f.settings.codexSandbox='workspace-write';f.settings.codexNetworkAccess=true;f.runs[0].finish({});await until(()=>f.runs.length===2);
  assert.equal(f.runs[1].options.sandbox,'read-only');assert.equal(f.runs[1].options.network,false);
  const restricted=await f.gateway.startTurn(chat,message('bound_write','preserve restricted request','after_completion'));
  f.settings.codexSandbox='read-only';f.settings.codexNetworkAccess=false;f.runs[1].finish({});
  await until(()=>f.history.turn(chat,restricted.accepted.turn.turnId).status==='failed');
  assert.equal(f.runs.length,2);assert.equal(f.history.turn(chat,restricted.accepted.turn.turnId).error.code,'execution_permissions_changed');
  assert.equal(f.history.originalUserText(chat,restricted.accepted.turn.turnId),'preserve restricted request');
});

test('sandbox auto and network settings are captured as actual launcher permissions',async t=>{
  const f=await fixture(t);
  for(const [i,sandbox,network,expectedSandbox,expectedNetwork] of [
    [0,'auto',false,'workspace-write',false],[1,'read-only',true,'read-only',false],
    [2,'workspace-write',true,'workspace-write',true],[3,'danger-full-access',true,'danger-full-access',true],
  ]) {
    f.settings.codexSandbox=sandbox;f.settings.codexNetworkAccess=network;
    await f.gateway.startTurn(f.chat(`chat_perm${i}`,`session_perm${i}`),message(`permissions${i}`));await until(()=>f.runs.length===i+1);
    assert.equal(f.runs[i].options.sandbox,expectedSandbox);assert.equal(f.runs[i].options.network,expectedNetwork);
    f.runs[i].finish({});await until(()=>f.admission.snapshot().active.length===0);
  }
});


test('new mutating chats allocate different real Git worktrees before admission and keep their cwd on continuation',async t=>{
 const project=mkdtempSync(path.join(os.tmpdir(),'nd-direct-source-'));t.after(()=>rmSync(project,{recursive:true,force:true}));
 writeFileSync(path.join(project,'code.txt'),'synthetic tracked code\n');
 for(const args of [['init'],['config','user.name','Synthetic'],['config','user.email','synthetic@example.invalid'],['add','.'],['commit','-m','fixture']]) {
  execFileSync('git',['-c','core.hooksPath=/dev/null','-C',project,...args],{stdio:'ignore',timeout:5000,killSignal:'SIGKILL'});
 }
 const f=await fixture(t,{sourceProject:project});f.settings.codexSandbox='workspace-write';
 const a=f.chat('chat_workspacea',null),b=f.chat('chat_workspaceb',null);
 await f.gateway.startTurn(a,message('workspacea'));await f.gateway.startTurn(b,message('workspaceb'));await until(()=>f.runs.length===2);
 const cwdA=f.runs[0].options.cwd,cwdB=f.runs[1].options.cwd;assert.notEqual(cwdA,cwdB);assert.notEqual(cwdA,project);
 assert.equal(readFileSync(path.join(cwdA,'code.txt'),'utf8'),'synthetic tracked code\n');
 assert.equal(f.runs[0].options.executionCodeRoot,cwdA);assert.equal(f.runs[1].options.executionCodeRoot,cwdB);
 f.runs[0].finish({});f.runs[1].finish({});await until(()=>f.admission.snapshot().active.length===0);
 const binding=f.history.get(a);assert.equal(binding.executionWorkspace.cwd,binding.workspacePath);
 await f.gateway.startTurn(a,message('later_workspace'));await until(()=>f.runs.length===3);assert.equal(f.runs[2].options.cwd,binding.workspacePath);
 f.runs[2].finish({});await until(()=>f.admission.snapshot().active.length===0);
});
