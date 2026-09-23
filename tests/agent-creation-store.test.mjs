import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NeuralDeepCoordinationStore } from '../scripts/neuraldeep/coordination-store.mjs';
import { AgentCreationStore, creationBudgetBlocker, creationPhase } from '../scripts/neuraldeep/agent-creation-store.mjs';
const make=()=>{const coordination=new NeuralDeepCoordinationStore({databasePath:':memory:'});return {coordination,store:new AgentCreationStore(coordination)};};
const input={chatId:'chat_test',instanceId:'test-instance',agentId:'sample-agent',releaseSha:'a'.repeat(40),target:'/tmp/test-agent',draftRoot:'/tmp/draft'};
test('new research jobs pin topic policy 3, saved policy 2 survives replay, and updates cannot migrate either',()=>{
 const {coordination,store}=make();try {
  const modern=store.create({...input,preparationPolicyVersion:2,researchProtocolVersion:2});
  assert.equal(modern.researchTopicPolicyVersion,3);
  assert.throws(()=>store.update(modern.chatId,j=>({...j,researchTopicPolicyVersion:2})),{code:'creation_policy_immutable'});
  const old={...input,chatId:'old_topic_chat',agentId:'old-topic-agent',preparationPolicyVersion:2,researchProtocolVersion:2,researchTopicPolicyVersion:2};
  store.create(old);assert.equal(store.create({...old,researchTopicPolicyVersion:3}).researchTopicPolicyVersion,2);
  assert.throws(()=>store.update(old.chatId,j=>({...j,researchTopicPolicyVersion:3})),{code:'creation_policy_immutable'});
  for(const version of [0,1,4,'3',null])assert.throws(()=>store.create({...old,researchTopicPolicyVersion:version}),{code:'creation_policy_invalid'});
  assert.throws(()=>store.create({...old,researchProtocolVersion:1}),{code:'creation_policy_invalid'});
 }finally{coordination.close();}
});
test('one creation job owns an instance target across retries and chats',()=>{
 const {coordination,store}=make();try {
  const job=store.create(input);assert.equal(store.create(input).jobId,job.jobId);
  assert.throws(()=>store.create({...input,chatId:'chat_other'}),{code:'creation_target_owned'});
  assert.throws(()=>store.create({...input,agentId:'other'}),{code:'creation_identity_conflict'});
  assert.equal(store.create({...input,chatId:'chat_other',instanceId:'another'}).agentId,input.agentId);
 }finally{coordination.close();}
});

test('a smaller initial allocation is immutable on replay and does not settle another job',()=>{
 const {coordination,store}=make();try {
  const previous=store.create(input);
  store.recordTurn(previous.chatId,{turnId:'old-unknown',tokens:null,dispatched:true,ok:false});
  const bounded={...input,chatId:'bounded-chat',agentId:'bounded-app',tokenBudget:351052};
  const job=store.create(bounded);
  assert.equal(job.budget.maxTokens,351052);
  assert.deepEqual(store.create(bounded),job);
  assert.throws(()=>store.create({...bounded,tokenBudget:1000000}),{code:'creation_budget_conflict'});
  for(const tokenBudget of [null,0,-1,1.2,1000001,'351052',NaN])assert.throws(()=>store.create({...bounded,tokenBudget}),{code:'creation_budget_invalid'});
  assert.equal(creationBudgetBlocker(store.get(previous.chatId)).code,'creation_usage_unknown');
  assert.deepEqual(store.get(previous.chatId).budget.unknownAttempts,['old-unknown']);
 }finally{coordination.close();}
});
test('host chooses the next phase from distinct bound approvals',()=>{
 const job={contract:null,outcome:null,approvals:{}};assert.equal(creationPhase(job),'interview');
 job.contract={hash:'c'};assert.equal(creationPhase(job),'contract');
 job.approvals.contract={hash:'c'};assert.equal(creationPhase(job),'outcome');
 job.outcome={hash:'o'};assert.equal(creationPhase(job),'outcome');
 job.approvals.outcome={hash:'different'};assert.equal(creationPhase(job),'outcome');
 job.approvals.outcome.hash='o';assert.equal(creationPhase(job),'research');
 job.researchReady=true;assert.equal(creationPhase(job),'scaffold');
 job.scaffoldReady=true;assert.equal(creationPhase(job),'implement');
});
test('action receipts replay the original result and refuse stale/concurrent intent',()=>{
 const {coordination,store}=make();try {
  const job=store.create(input),request={requestId:'request_1',action:'continue',expectedRevision:job.revision};
  assert.equal(store.beginAction(input.chatId,request).replayed,false);
  assert.equal(store.beginAction(input.chatId,request).status,'started');
  assert.throws(()=>store.beginAction(input.chatId,{...request,requestId:'request_2'}),{code:'creation_action_unconfirmed'});
  store.finishAction(input.chatId,'request_1',{revision:2});
  store.update(input.chatId,j=>({...j,status:'running'}));
  assert.deepEqual(store.beginAction(input.chatId,request).result,{revision:2});
  assert.throws(()=>store.beginAction(input.chatId,{...request,requestId:'request_3'}),{code:'creation_revision_stale'});
  assert.throws(()=>store.beginAction(input.chatId,{...request,action:'cancel'}),{code:'idempotency_conflict'});
 }finally{coordination.close();}
});
test('usage remains unknown until receipt reconciliation; duplicates do not add tokens',()=>{
 const {coordination,store}=make();try {
  store.create(input);
  const recorded=store.recordTurn(input.chatId,{turnId:'turn_1',tokens:20,activeMs:100,ok:true,dispatched:true});
  assert.equal(store.recordTurn(input.chatId,{turnId:'turn_1',tokens:20,activeMs:100,ok:true,dispatched:true}).revision,recorded.revision);
  let job=store.get(input.chatId);assert.equal(job.budget.tokensUsed,20);assert.equal(job.budget.activeMs,100);
  job=store.recordTurn(input.chatId,{turnId:'turn_2',tokens:null,activeMs:50,ok:false,dispatched:true});
  assert.equal(creationBudgetBlocker(job).code,'creation_usage_unknown');
  assert.equal(job.budget.turns.turn_2.tokens,null);
 }finally{coordination.close();}
});
test('unknown usage is settled only by an explicit bound terminal receipt and replay changes nothing',()=>{
 const {coordination,store}=make();try{
  store.create(input);
  const pending=store.recordTurn(input.chatId,{turnId:'unknown_turn',tokens:null,activeMs:100,ok:false,dispatched:true,code:'lost_ack'});
  assert.equal(store.recordTurn(input.chatId,{turnId:'unknown_turn',tokens:55,activeMs:900,ok:true,dispatched:true}).revision,pending.revision);
  assert.equal(store.get(input.chatId).budget.tokensUsed,0,'ordinary retry is not accounting authority');
  const receipt={receiptId:'runtime_attempt_1',source:'neuraldeep-runtime',chatId:input.chatId,turnId:'unknown_turn',tokens:55,processExited:true};
  assert.throws(()=>store.reconcileTurnUsage(input.chatId,{...receipt,chatId:'other'}),{code:'creation_usage_receipt_invalid'});
  assert.throws(()=>store.reconcileTurnUsage(input.chatId,{...receipt,processExited:false}),{code:'creation_usage_receipt_invalid'});
  assert.throws(()=>store.reconcileTurnUsage(input.chatId,{...receipt,turnId:'missing'}),{code:'creation_usage_turn_unknown'});
  const reconciled=store.reconcileTurnUsage(input.chatId,receipt);
  assert.equal(reconciled.budget.tokensUsed,55);assert.equal(reconciled.budget.activeMs,100);
  assert.deepEqual(reconciled.budget.unknownAttempts,[]);assert.equal(reconciled.status,'blocked');
  assert.equal(store.reconcileTurnUsage(input.chatId,receipt).revision,reconciled.revision);
  assert.throws(()=>store.reconcileTurnUsage(input.chatId,{...receipt,tokens:65}),{code:'creation_usage_receipt_conflict'});
 }finally{coordination.close();}
});
test('diagnostic threshold counts three identical failures, resets on success and distinguishes phase',()=>{
 const {coordination,store}=make();try{
  store.create(input);
  const fail=(turnId,code)=>store.recordTurn(input.chatId,{turnId,code,tokens:1,ok:false,dispatched:true});
  fail('one','source_unavailable');fail('two','provider_timeout');let job=fail('three','invalid_result');
  assert.equal(job.budget.repeatedFailures,1);assert.equal(creationBudgetBlocker(job),null);
  fail('four','invalid_result');job=fail('five','invalid_result');
  assert.equal(job.budget.repeatedFailures,3);assert.equal(creationBudgetBlocker(job).code,'creation_repeated_failure');
  store.recordTurn(input.chatId,{turnId:'success',tokens:1,ok:true});
  job=fail('six','invalid_result');assert.equal(job.budget.repeatedFailures,1);
  store.update(input.chatId,current=>({...current,phase:'research'}));
  job=fail('seven','invalid_result');assert.equal(job.budget.repeatedFailures,1);
 }finally{coordination.close();}
});
test('late receipt accounts spend without replacing a newer worker or its checkpoint/status',()=>{
 const {coordination,store}=make();try{
  store.create(input);store.update(input.chatId,current=>({...current,status:'running',activeTurnId:'new_turn',checkpoint:{current:true}}));
  const job=store.recordTurn(input.chatId,{turnId:'old_turn',tokens:11,activeMs:10,ok:false,checkpoint:{stale:true}});
  assert.equal(job.status,'running');assert.equal(job.activeTurnId,'new_turn');assert.deepEqual(job.checkpoint,{current:true});
  assert.equal(job.budget.tokensUsed,11);assert.equal(job.budget.repeatedFailures,0);
 }finally{coordination.close();}
});
test('gateway restart can recover the exact started request and active turn from durable state',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'pritha-creation-recovery-')),databasePath=path.join(root,'coord.sqlite');
 let coordination=new NeuralDeepCoordinationStore({databasePath});
 try{
  let store=new AgentCreationStore(coordination),job=store.create(input);
  const request={requestId:'approval_1',action:'approve_contract',expectedRevision:job.revision,documentHash:'document-a',operator:'delegated-ui'};
  store.beginAction(input.chatId,request);
  store.update(input.chatId,current=>({...current,status:'running',activeTurnId:'turn_in_flight'}));
  coordination.close();coordination=new NeuralDeepCoordinationStore({databasePath});store=new AgentCreationStore(coordination);
  const recovered=store.listRecoverable();assert.equal(recovered.length,1);assert.equal(recovered[0].job.activeTurnId,'turn_in_flight');
  assert.deepEqual(recovered[0].startedActions[0].request,request);assert.equal(recovered[0].startedActions[0].recoverable,true);
  assert.equal(store.beginAction(input.chatId,request).status,'started','a restart is not permission to replay an uncertain effect');
 }finally{coordination.close();rmSync(root,{recursive:true,force:true});}
});
test('additive request-column migration preserves legacy unconfirmed actions without inventing an intent',()=>{
 const coordination=new NeuralDeepCoordinationStore({databasePath:':memory:'});try{
  coordination.db.exec(`CREATE TABLE agent_creation_actions(chat_id TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,result TEXT,PRIMARY KEY(chat_id,request_id));`);
  coordination.db.prepare("INSERT INTO agent_creation_actions VALUES(?,?,?,'started',NULL)").run(input.chatId,'old_request','oldhash');
  const store=new AgentCreationStore(coordination);store.create(input);
  const recovered=store.listRecoverable();assert.equal(recovered[0].startedActions[0].request,null);assert.equal(recovered[0].startedActions[0].recoverable,false);
  new AgentCreationStore(coordination);assert.equal(coordination.db.prepare('PRAGMA table_info(agent_creation_actions)').all().filter(column=>column.name==='request').length,1);
 }finally{coordination.close();}
});
test('cancelled job is not revived by a late worker receipt and identity cannot mutate',()=>{
 const {coordination,store}=make();try {
  store.create(input);store.update(input.chatId,j=>({...j,status:'cancelled'}));
  assert.equal(store.recordTurn(input.chatId,{turnId:'turn_late',tokens:3,ok:true}).status,'cancelled');
  assert.throws(()=>store.update(input.chatId,j=>({...j,releaseSha:'b'.repeat(40)})),{code:'creation_identity_immutable'});
 }finally{coordination.close();}
});
