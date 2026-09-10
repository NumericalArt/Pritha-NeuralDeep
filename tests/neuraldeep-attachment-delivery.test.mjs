import * as maintenance from '../scripts/neuraldeep/release-maintenance.mjs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
import { NeuralDeepAttachmentStore } from '../scripts/neuraldeep/attachment-store.mjs';
import { NeuralDeepChatHistoryStore } from '../scripts/neuraldeep/chat-history-store.mjs';
import * as policy from '../scripts/neuraldeep/attachment-policy.mjs';
import * as transport from '../scripts/neuraldeep/attachment-transport.mjs';
import * as identity from '../scripts/neuraldeep/runtime-identity.mjs';
import * as resources from '../scripts/neuraldeep/execution-resources.mjs';
const require = createRequire(import.meta.url), root = process.cwd();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function loadGateway(dependencies) {
  const code = ts.transpileModule(readFileSync('interfaces/control-center/src/lib/codex-chat/gateway.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',code)(id => id.startsWith('node:') ? require(id) : (id.endsWith('/release-maintenance.mjs') ? maintenance : dependencies[id]) || {},module,module.exports);
  return module.exports.CodexChatGateway;
}
async function fixture(t) {
  const tmp = mkdtempSync(path.join(os.tmpdir(),'nd-attachment-delivery-')), stateRoot = path.join(tmp,'state'), privateRoot = path.join(stateRoot,'codex-chat');
  mkdirSync(privateRoot,{recursive:true});
  const originals = new NeuralDeepAttachmentStore({stateRoot,privateRoot});
  const history = new NeuralDeepChatHistoryStore({ databasePath:path.join(privateRoot,'history.sqlite'),instanceScope:hash(`${stateRoot}:neuraldeep-chat-v1`) });
  t.after(async () => { history.close(); await originals.close(); rmSync(tmp,{recursive:true,force:true}); });
  const runtimeIdentity = identity.neuralDeepRuntimeIdentity(stateRoot);
  const model = { id:'fixture-image',provider:'neuraldeep',capabilitiesKnown:true,inputModalities:['text','image'],visionAdvertised:true,toolsAdvertised:true,capabilities:{reasoning:false},supportedReasoningEfforts:[],defaultReasoningEffort:'none' };
  const catalog = { models:[model],source:'neuraldeep',refreshedAt:new Date().toISOString() };
  const codexBin = path.join(tmp,'fixture-codex'); writeFileSync(codexBin,'#!/bin/sh\nprintf "codex-cli fixture-1\\n"\n'); chmodSync(codexBin,0o700);
  const evidence = { version:1,protocolVersion:policy.ATTACHMENT_TRANSPORT_VERSION,profileIdentity:runtimeIdentity.profileIdentity,cliVersion:'codex-cli fixture-1',adapterHash:transport.attachmentTransportHash(root),entries:['initial','resume'].map(p => ({ model:model.id,path:p,modelEvidenceHash:policy.attachmentModelEvidenceHash(model),verifiedAt:catalog.refreshedAt,image:'passed',files:'passed',imageFormats:['image/png'],source:'synthetic-provider-smoke' })) };
  const evidencePath = path.join(privateRoot,'attachment-capabilities.json'); writeFileSync(evidencePath,JSON.stringify(evidence),{mode:0o600});
  const payload = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('synthetic-original-exact-bytes')]);
  const id = randomUUID(); const view = await originals.upload(id,'original.png',new Request('http://fixture',{method:'PUT',body:payload}));
  const file = { ...view,sha256:hash(payload) };
  const turn = {turnId:'turn_fixture',clientMessageId:'message_fixture',status:'queued',userMessage:{id:'item_user',role:'user',markdown:'',status:'completed',createdAt:catalog.refreshedAt,attachments:[file]},items:[],pendingRequestIds:[],startedAt:catalog.refreshedAt,completedAt:null,error:null};
  const binding = {chatId:'chat_fixture',clientThreadId:'client_fixture',providerId:'neuraldeep_cli',nativeThreadId:null,modelId:model.id,profileIdentity:runtimeIdentity.profileIdentity,stateIdentityHash:runtimeIdentity.stateIdentityHash,identityStatus:'recorded',turns:[turn],messageReceipts:{},taskLinks:[],createdAt:catalog.refreshedAt,updatedAt:catalog.refreshedAt};
  history.put(binding);
  const directory = path.join(privateRoot,'turns',turn.turnId,'inputs',randomUUID());
  const attachments = await originals.snapshotForDispatch([id],directory);
  const attachmentManifest = path.join(directory,'manifest.json');
  const manifest = {version:1,chatId:binding.chatId,turnId:turn.turnId,profileIdentity:runtimeIdentity.profileIdentity,resume:null,path:'initial',model,catalog,attachments};
  writeFileSync(attachmentManifest,JSON.stringify(manifest),{mode:0o600});
  const runtime = {stateRoot,projectRoot:root,codexBin};
  const options = {attachmentManifest,workloadId:turn.turnId,model:model.id,resume:null,images:attachments.map(file=>file.filePath)};
  return {tmp,stateRoot,privateRoot,originals,history,runtimeIdentity,model,catalog,evidence,evidencePath,payload,id,binding,turn,manifest,attachmentManifest,runtime,options};
}
const request = f => ({ model:f.model.id,input:[{ role:'user',content:[{type:'input_image',image_url:`data:image/png;base64,${f.payload.toString('base64')}`}] }] });

test('dispatch verifies saved originals, exact model/session/path and encoded image bytes before provider',async t=>{
  const f=await fixture(t), dispatch=transport.loadAttachmentDispatch(f.runtime,f.options);
  await dispatch.validate(request(f)); dispatch.close();
  for(const patch of [{model:'another-model'},{resume:'another-session'},{images:[]},{workloadId:'turn_other'}]) assert.throws(()=>transport.loadAttachmentDispatch(f.runtime,{...f.options,...patch}),error=>error.code==='attachment_manifest_invalid');
  const transformed=transport.loadAttachmentDispatch(f.runtime,f.options), bad=request(f); bad.input[0].content[0].image_url='data:image/png;base64,'+Buffer.from('changed bytes').toString('base64');
  await assert.rejects(transformed.validate(bad),error=>error.code==='attachment_original_not_preserved');transformed.close();
  writeFileSync(f.manifest.attachments[0].filePath,'changed snapshot');
  assert.throws(()=>transport.loadAttachmentDispatch(f.runtime,f.options),error=>error.code==='attachment_integrity_failed');
  const original=await f.originals.openOriginal(f.id); assert.equal(original.sha256,hash(f.payload));await original.handle.close();
});

test('history attachment identity survives projection rebuild and proven aliases without leaking across profiles',async t=>{
  const f=await fixture(t);f.history.put({...f.history.get(f.binding.chatId),nativeThreadId:'exact-session'});
  const alias={...f.binding,chatId:'chat_alias',clientThreadId:'client_alias',nativeThreadId:'exact-session',turns:[]};f.history.put(alias);
  const image={sha256:hash(f.payload),mediaType:'image/png',size:f.payload.length};
  assert.equal(f.history.attachmentInSession('chat_alias',image),true);
  f.history.put({...alias,chatId:'chat_foreign',clientThreadId:'client_foreign',profileIdentity:'another-profile'});
  assert.equal(f.history.attachmentInSession('chat_foreign',image),false);
  const source=f.history.verifySource();f.history.rebuildProjection();assert.deepEqual(f.history.verifySource(),source);
  assert.equal(f.history.attachmentInSession('chat_alias',image),true);
  assert.throws(()=>f.history.putTurn(f.binding.chatId,{...f.turn,userMessage:{...f.turn.userMessage,attachments:[{...f.turn.userMessage.attachments[0],sha256:'b'.repeat(64)}]}}),error=>error.code==='history_attachment_conflict');
});

test('gateway accepts attachment-only first message once and replays accepted input before catalog or archive checks',async t=>{
  const f=await fixture(t);let catalogAvailable=true,dispatches=0;
  const Gateway=loadGateway({
    '../../../../../scripts/neuraldeep/runtime-identity.mjs':identity,
    '../../../../../scripts/neuraldeep/attachment-policy.mjs':policy,
    '../../../../../scripts/neuraldeep/attachment-transport.mjs':{readAttachmentTransport:()=>({...f.evidence,currentCliVersion:f.evidence.cliVersion,currentAdapterHash:f.evidence.adapterHash})},
    './attachment-store':{getChatAttachmentStore:()=>f.originals},
    './budget-intent':{parseBudgetIntent:()=>({kind:'none'})},
    '@/lib/realtime/pritha-runtime':{getPrithaRuntimeSettings:()=>({updatedAt:new Date().toISOString(),codexModel:f.model.id,codexReasoningEffort:'none'})},
    '@/lib/settings/codex-model-catalog-server':{getCodexModelCatalog:async()=>{assert.equal(catalogAvailable,true,'accepted replay must not read model catalog');return f.catalog;}},
  });
  const gateway=Object.create(Gateway.prototype);
  const store={stateRoot:f.stateRoot,stateIdentityHash:f.runtimeIdentity.stateIdentityHash,root:f.privateRoot,
    historyStore:async()=>f.history,get:async id=>f.history.get(id),getTurn:async(id,turn)=>f.history.turn(id,turn),receipt:async(id,key)=>f.history.receipt(id,key),findByClientThreadId:async id=>f.history.findByClient(id),putIfAbsentByClientThreadId:async binding=>f.history.putIfAbsent(binding)};
  Object.assign(gateway,{root,store,recoveryComplete:true,activeTurns:new Map(),runtime:{probe:async()=>({state:'available'})},emit(){},emitThreadUpdated:async()=>{},threadDetail:async id=>({thread:f.history.get(id)}),admitAttempt:async()=>{dispatches++;}});
  const initialTurn={clientMessageId:'first-message-fixture',input:[{type:'text',text:''}],attachments:[f.id]};
  const input={clientThreadId:'new-chat-fixture',source:'chat',initialTurn};
  const results=await Promise.all([gateway.createThreadWithFirstTurn(input),gateway.createThreadWithFirstTurn(input)]);
  assert.equal(dispatches,1);assert.equal(results.filter(x=>!x.replayed).length,1);
  const chatId=results[0].data.detail.thread.chatId;
  assert.equal(f.history.get(chatId).turns[0].userMessage.attachments[0].sha256,hash(f.payload));
  catalogAvailable=false;f.history.put({...f.history.get(chatId),archived:true});
  assert.equal((await gateway.createThreadWithFirstTurn(input)).replayed,true);
  assert.equal((await gateway.startTurn(chatId,initialTurn)).replayed,true);
  await assert.rejects(gateway.startTurn(chatId,{...initialTurn,attachments:[]}),error=>error.code==='invalid_request');
  await assert.rejects(gateway.startTurn(chatId,{...initialTurn,input:[{type:'text',text:'changed'}]}),error=>error.code==='idempotency_conflict');
  assert.equal(dispatches,1);
});

test('a late provider probe from a replaced attempt cannot launch or finish the new attempt',async()=>{
  const Gateway=loadGateway({'../../../../../scripts/neuraldeep/execution-resources.mjs':resources});const gateway=Object.create(Gateway.prototype);
  let finishProbe,announceProbe;const started=new Promise(resolve=>{announceProbe=resolve;});
  const old={turnId:'turn_old',intent:{attemptId:'attempt_old',dispatchState:'accepted',cwd:os.tmpdir(),sandbox:'read-only'},admissionController:new AbortController(),interrupted:false};const next={turnId:'turn_new'};
  Object.assign(gateway,{activeTurns:new Map([['chat_fixture',old]]),store:{get:async()=>({stateIdentityHash:'fixture',chatId:'chat_fixture',voiceTopicId:null}),getTurn:async()=>({executionIntent:old.intent})},
    admission:{acquire:async()=>({launcherReceipt:{ownerToken:'fixture'},release:async()=>{}})},
    runtime:{probe:()=>{announceProbe();return new Promise(resolve=>{finishProbe=resolve;});}},
    prepareExecutionWorkspace:async()=>{},
    launchAttempt:async()=>assert.fail('stale provider probe launched a different attempt'),finishAttempt:async()=>assert.fail('stale provider probe finished a different attempt')});
  const work=gateway.admitAttempt('chat_fixture',old);await started;gateway.activeTurns.set('chat_fixture',next);finishProbe({ok:true,state:'available'});await work;
  assert.equal(gateway.activeTurns.get('chat_fixture'),next);
});
