import assert from 'node:assert/strict';import test from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import {NeuralDeepCoordinationStore,coordinationHash} from '../scripts/neuraldeep/coordination-store.mjs';
import {NeuralDeepOperatorRequests} from '../scripts/neuraldeep/operator-requests.mjs';
async function fixture(t) {
 const root=mkdtempSync(path.join(os.tmpdir(),'nd-voice-operator-'));
 for(const name of ['voice-operator-context','voice-operator-service']){
  const source=readFileSync(`interfaces/control-center/src/lib/codex-chat/${name}.ts`,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace('"./voice-operator-context"','"./voice-operator-context.mjs"');
  writeFileSync(path.join(root,`${name}.mjs`),js);
 }
 const module=await import(pathToFileURL(path.join(root,'voice-operator-service.mjs')).href),viewModule=await import(pathToFileURL(path.join(root,'voice-operator-context.mjs')).href);
 const store=new NeuralDeepCoordinationStore({databasePath:path.join(root,'admission.sqlite')}),requests=new NeuralDeepOperatorRequests(store);
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});
 const control={operatorRequests:()=>requests,logicalOwnerForKey:key=>store.logicalOwner(coordinationHash(key)),
  acquireTaskControl:(task,owner)=>store.acquireSessionControl(coordinationHash(`voice-operation:${task}`),owner),
  releaseTaskControl:(task,owner)=>store.releaseSessionControl(coordinationHash(`voice-operation:${task}`),owner)};
 const link={taskId:'task_fixture',topicId:'topic_fixture',scope:{generation:3},modelId:'synthetic',effortId:null,stateIdentityHash:'a'.repeat(24),sessionId:'exact-session'};
 store.holdLogicalOwner(coordinationHash(link.topicId),link.taskId);
 const descriptor=module.registerVoiceOperatorQuestion(control,link.taskId,link,'Choose the synthetic branch.',{sandbox:'read-only',network_access:false});
 const snapshot={request:{id:link.taskId},status:{status:'waiting_for_operator',question:descriptor.question,operator_request_id:descriptor.request_id,sandbox:'read-only',network_access:false},link};
 const input={taskId:link.taskId,kind:'answer',operator_request_id:descriptor.request_id,topic_generation:descriptor.topic_generation,expected_revision:1,
  answer:{text:'synthetic answer',operatorConfirmation:''},control,readSnapshot:async()=>snapshot};
 return{module,viewModule,store,requests,control,link,snapshot,input,descriptor};
}

test('typed and Voice replies share a durable receipt before side effects and replay the same completed acknowledgement',async t=>{
 const f=await fixture(t);let resolveApply,started;const active=new Promise(resolve=>started=resolve),finish=new Promise(resolve=>resolveApply=resolve);let calls=0;
 const apply=async()=>{calls++;assert.equal(f.requests.get(f.descriptor.request_id).status,'accepted');started();await finish;return{ok:true,task_id:f.link.taskId,status:'queued',short_id:'ABC'};};
 const first=f.module.dispatchVoiceOperatorResponse({...f.input,apply});await active;
 const waiting=await f.module.dispatchVoiceOperatorResponse({...f.input,apply});assert.equal(waiting.ok,true);assert.equal(waiting.status,'accepted');assert.equal(calls,1);
 const conflict=await f.module.dispatchVoiceOperatorResponse({...f.input,answer:{text:'different'},apply});assert.equal(conflict.error,'operator_answer_conflict');
 resolveApply();const result=await first;assert.equal(result.operator_intent_id,waiting.operator_intent_id);
 assert.deepEqual(await f.module.dispatchVoiceOperatorResponse({...f.input,apply}),result);assert.equal(calls,1);
});

test('wrong question, generation, revision or owner cannot accept input or invoke an action',async t=>{
 const f=await fixture(t);let calls=0;const apply=async()=>{calls++;return{ok:true};};
 for(const patch of [{operator_request_id:'wrong_question'},{topic_generation:4},{expected_revision:2},{operator_request_id:undefined}]){
  assert.equal((await f.module.dispatchVoiceOperatorResponse({...f.input,...patch,apply})).ok,false);
 }
 const owner=f.store.logicalOwner(coordinationHash(f.link.topicId));f.store.releaseLogicalOwner(coordinationHash(f.link.topicId),f.link.taskId,owner.generation);
 f.store.holdLogicalOwner(coordinationHash(f.link.topicId),f.link.taskId);
 assert.equal((await f.module.dispatchVoiceOperatorResponse({...f.input,apply})).ok,false);assert.equal(calls,0);
 assert.equal(f.requests.get(f.descriptor.request_id).status,'pending');
});

test('a failed or lost host action preserves its original answer and cannot automatically dispatch again',async t=>{
 const f=await fixture(t);let calls=0;const apply=async()=>{calls++;throw Object.assign(new Error('fixture'),{code:'disk_checkpoint_failed'});};
 const result=await f.module.dispatchVoiceOperatorResponse({...f.input,apply});assert.equal(result.error,'disk_checkpoint_failed');
 const receipt=f.requests.get(f.descriptor.request_id);assert.equal(receipt.status,'recovery_required');assert.deepEqual(receipt.answer,f.input.answer);
 assert.deepEqual(await f.module.dispatchVoiceOperatorResponse({...f.input,apply}),result);assert.equal(calls,1);
});

test('read-only descriptors preserve native request identity and do not infer another task from recency',async t=>{
 const f=await fixture(t);assert.deepEqual(f.viewModule.voiceOperatorRequestView(f.link.taskId,f.snapshot.request,f.snapshot.status,f.link),f.descriptor);
 assert.equal(f.viewModule.voiceOperatorRequestView('other_task',f.snapshot.request,f.snapshot.status,f.link),null);
 const another=f.viewModule.voiceOperatorRequestView(f.link.taskId,f.snapshot.request,{...f.snapshot.status,operator_request_id:'',admission_attempt_id:'next_attempt'},f.link);
 assert.notEqual(another.request_id,f.descriptor.request_id);
});

test('an explicit recovery has its own receipt and retains the answer after a lost host checkpoint',async t=>{
 const f=await fixture(t);let calls=0;
 await f.module.dispatchVoiceOperatorResponse({...f.input,apply:async()=>{calls++;throw new Error('synthetic lost checkpoint');}});
 const original=f.requests.get(f.descriptor.request_id);
 const recovery=f.viewModule.voiceOperatorRequestView(f.link.taskId,f.snapshot.request,f.snapshot.status,f.link,f.requests.latest(f.link.taskId));
 assert.equal(recovery.kind,'recovery');assert.equal(recovery.recovery_of,original.requestId);
 const input={...f.input,kind:'recovery',operator_request_id:recovery.request_id,answer:{action:'resume'},apply:async receipt=>{
   assert.equal(receipt.context.recoveryOf,original.requestId);assert.deepEqual(f.requests.get(receipt.context.recoveryOf).answer,f.input.answer);
   calls++;return{ok:true,status:'queued'};
 }};
 const result=await f.module.dispatchVoiceOperatorResponse(input);assert.equal(result.ok,true);assert.equal(calls,2);
 assert.deepEqual(await f.module.dispatchVoiceOperatorResponse(input),result);assert.equal(calls,2);
 assert.notEqual(f.requests.latest(f.link.taskId).intentId,original.intentId);
 assert.equal((await f.module.dispatchVoiceOperatorResponse({...f.input,apply:async()=>{calls++;return{ok:true};}})).ok,false);assert.equal(calls,2);
});

test('task control allows only nested work inside its live operation and rejects independent or delayed reuse',async t=>{
 const f=await fixture(t);let release,started;const gate=new Promise(resolve=>release=resolve),active=new Promise(resolve=>started=resolve);let late;
 const running=f.module.withVoiceTaskControl(f.control,f.link.taskId,async()=>{
   assert.equal(await f.module.withVoiceTaskControl(f.control,f.link.taskId,async()=>42),42);
   late=new Promise(resolve=>setTimeout(()=>resolve(f.module.withVoiceTaskControl(f.control,f.link.taskId,async()=>17)),60));
   started();await gate;
 });
 await active;await assert.rejects(()=>f.module.withVoiceTaskControl(f.control,f.link.taskId,async()=>0),{code:'voice_task_operation_busy'});
 release();await running;assert.equal(await late,17);
 assert.equal(f.store.db.prepare('SELECT count(*) AS count FROM session_controls').get().count,0);
});

test('a failed result checkpoint returns a safe unresolved acknowledgement and never replays the action',async t=>{
 const f=await fixture(t);let calls=0;const finish=f.requests.finish;
 f.requests.finish=()=>{throw new Error('fixture storage unavailable');};
 const result=await f.module.dispatchVoiceOperatorResponse({...f.input,apply:async()=>{calls++;return{ok:true};}});
 assert.equal(result.error,'operator_receipt_finish_unconfirmed');assert.equal(f.requests.get(f.descriptor.request_id).status,'accepted');
 f.requests.finish=finish;
 await f.module.dispatchVoiceOperatorResponse({...f.input,apply:async()=>{calls++;return{ok:true};}});assert.equal(calls,1);
});

test('Voice permission ceilings can only tighten across settings changes and malformed saved permissions fail closed',async t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'nd-voice-permission-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(path.join(root,'permissions.mjs'),ts.transpileModule(readFileSync('interfaces/control-center/src/lib/codex-chat/voice-execution-permissions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
 const {voiceExecutionPermissions:permissions}=await import(pathToFileURL(path.join(root,'permissions.mjs')).href);
 const ceiling={sandbox:'workspace-write',network:false};
 assert.deepEqual(permissions({sandbox:'danger-full-access',network:true},ceiling),ceiling);
 const restricted=permissions({sandbox:'read-only',network:false},ceiling);
 assert.deepEqual(permissions({sandbox:'workspace-write',network:true},restricted),restricted);
 assert.deepEqual(permissions({sandbox:'danger-full-access',network:true},{}),{sandbox:'read-only',network:false});
 assert.throws(()=>permissions({sandbox:'danger-full-access',network:true},{sandbox:'danger-full-access',network:false}),{code:'full_access_network_ceiling_conflict'});
});
