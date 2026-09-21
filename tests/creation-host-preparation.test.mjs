import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NeuralDeepCoordinationStore} from '../scripts/neuraldeep/coordination-store.mjs';
import {AgentCreationStore} from '../scripts/neuraldeep/agent-creation-store.mjs';
import {creationDraftRoot,reconcileCreationArtifacts,approveCreationDocument,creationPrompt} from '../scripts/neuraldeep/agent-creation.mjs';
import {prepareCreationContract,prepareCreationOutcome,completeCreationBrief} from '../scripts/neuraldeep/creation-preparation.mjs';
import {verifyOutcomeApproval} from '../scripts/agents-mother/outcome-spec.mjs';
import {reviseCreationProposal} from '../scripts/neuraldeep/creation-revision.mjs';
import {contractData} from '../scripts/agents-mother/contract.mjs';

import {signalDeskBrief as product} from './fixtures/signal-desk-brief.mjs';

function setup(t) {
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'creation-host-prep-'));t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const coordination=new NeuralDeepCoordinationStore({databasePath:path.join(stateRoot,'coord.sqlite')});t.after(()=>coordination.close());
  const store=new AgentCreationStore(coordination),options={root:process.cwd(),stateRoot,coordination};
  const chatId='chat_hostprep',draftRoot=creationDraftRoot(stateRoot,'test-instance',chatId),target=path.join(stateRoot,'children','signal-desk');
  mkdirSync(draftRoot,{recursive:true});mkdirSync(target,{recursive:true});
  const job=store.create({chatId,instanceId:'test-instance',agentId:'signal-desk',draftRoot,target,releaseSha:'a'.repeat(40),preparationPolicyVersion:2});
  return {job,store,options};
}
const answer=brief=>'```pritha-brief-json\n'+JSON.stringify(brief)+'\n```';
const approval=(job,kind)=>({action:`approve_${kind}`,requestId:`approve_${kind}`,expectedRevision:job.revision,actor:'codex-operator',authorizationBasis:'Isolated delegated operator test'});

test('host creates complete product documents with separate approvals and zero Outcome inference',t=>{
  let {job,options}=setup(t);
  assert.match(creationPrompt(job),/pritha-brief-json/);assert.doesNotMatch(creationPrompt(job),/outcome init|\.mjs init/);
  job=completeCreationBrief(job,answer(product),{...options,turnId:'turn_brief'});
  job=reconcileCreationArtifacts(job,options);
  assert.equal(job.status,'awaiting_contract_approval');
  assert.deepEqual(job.preparation.brief.sources,product.sources);
  for(const value of [...product.sources,...product.constraints,...product.successCriteria])assert.ok(job.contract.text.includes(value),value);
  assert.throws(()=>prepareCreationOutcome(job,options),{code:'creation_contract_approval_required'});
  job=approveCreationDocument(job,'contract',approval(job,'contract'),options);
  const accepted=readFileSync(job.contract.path,'utf8');
  Object.assign(job,prepareCreationOutcome(job,options));
  job=reconcileCreationArtifacts({...job,status:'pending'},options);
  assert.equal(job.status,'awaiting_outcome_approval');
  for(const value of product.successCriteria)assert.ok(job.outcome.text.includes(value),value);
  assert.equal(readFileSync(job.contract.path,'utf8'),accepted);
  assert.equal(job.approvals.outcome,undefined);
  job=approveCreationDocument(job,'outcome',approval(job,'outcome'),options);
  assert.equal(verifyOutcomeApproval(job.outcome.path,options).ok,true);
  assert.equal(job.phase,'research');assert.equal(job.budget.tokensUsed,0);
});

test('publication recovers exact operation after file write and refuses unexpected authored edits',t=>{
  const {job,options}=setup(t);
  assert.throws(()=>prepareCreationContract(job,product,{...options,afterPublish(){throw Error('synthetic crash');}}),/synthetic crash/);
  const directory=path.join(job.draftRoot,'contracts');
  const file=path.join(directory,readdirSync(directory).find(name=>name.endsWith('.md'))),bytes=readFileSync(file,'utf8');
  const recovered=prepareCreationContract(job,product,options);
  assert.equal(recovered.contract.text,bytes);
  assert.equal(prepareCreationContract(job,product,options).contract.hash,recovered.contract.hash);
  assert.equal(readdirSync(directory).filter(name=>name.endsWith('.md')).length,1);
  writeFileSync(file,bytes+'\nAuthor addition.\n');
  assert.throws(()=>prepareCreationContract(job,product,options),{code:'creation_preparation_draft_changed'});
  assert.ok(readFileSync(file,'utf8').endsWith('Author addition.\n'));
});

test('invalid JSON gets one structural correction and replay cannot reset the count',t=>{
  let {job,options}=setup(t);
  job=completeCreationBrief(job,'```pritha-brief-json\n{broken}\n```',{...options,turnId:'turn_one'});
  assert.equal(job.status,'pending');assert.equal(job.preparation.briefRepairCount,1);
  const repeated=completeCreationBrief(job,answer(product),{...options,turnId:'turn_one'});
  assert.deepEqual(repeated,job);
  job=completeCreationBrief(job,answer({...product,identity:{name:'Signal Desk ND',slug:'foreign-agent'}}),{...options,turnId:'turn_two'});
  assert.equal(job.status,'blocked');assert.equal(job.autoContinue,false);assert.equal(job.preparation.briefRepairCount,2);
  assert.equal(job.contract,null);
});

test('RSS query strings and malformed proposal wrappers cannot bypass the structural repair limit',t=>{
  let {job,options}=setup(t);
  const malformed='<previous_brief>'+JSON.stringify({...product,sources:['https://example.test/rss?alt=rss']})+'</previous_brief>';
  job=completeCreationBrief(job,malformed,{...options,turnId:'bad_one'});assert.equal(job.status,'pending');
  job=completeCreationBrief(job,malformed,{...options,turnId:'bad_two'});assert.equal(job.status,'blocked');assert.equal(job.preparation.briefRepairCount,2);
  const question=completeCreationBrief(setup(t).job,'Allow other public feeds? https://example.test/rss?alt=rss',{...options,turnId:'question'});
  assert.equal(question.status,'waiting_input');
});

for(const scenario of ['publish','crash-after-write','authored-edit'])test(`host revision retains its seed until validated publication: ${scenario}`,t=>{
  const {store,options}=setup(t),chatId='chat_hostprep';
  let job=store.update(chatId,j=>reconcileCreationArtifacts(completeCreationBrief(j,answer(product),{...options,turnId:'initial'}),options));
  job=store.update(chatId,j=>approveCreationDocument(j,'contract',approval(j,'contract'),options));
  job=store.update(chatId,j=>reconcileCreationArtifacts({...j,...prepareCreationOutcome(j,options)},options));
  job=store.update(chatId,j=>approveCreationDocument(j,'outcome',approval(j,'outcome'),options));
  const agentId=contractData(job.contract.path,options).agentId;
  const accepted=[job.contract.path,job.outcome.path,...['contract','outcome'].map(kind=>path.join(options.stateRoot,'audit','creation-approvals',job.jobId,`${kind}.json`))]
    .map(file=>[file,readFileSync(file,'utf8')]);
  const request={action:'revise_proposal',requestId:'revise',expectedRevision:job.revision,reason:'Add a visible count before generating the digest.',actor:'codex-operator',authorizationBasis:'Isolated operator revision test'};
  store.beginAction(chatId,request);
  const revised=reviseCreationProposal(job,request,options);
  job=store.update(chatId,()=>revised);store.finishAction(chatId,request.requestId,job);
  const seed=readFileSync(job.contract.path,'utf8'),changed={...product,constraints:[...product.constraints,'Show the selected article count before generating the digest']};
  const receipt={turnId:'revised',ok:true,tokens:17,dispatched:true};
  job=store.recordTurn(chatId,receipt);
  assert.equal(job.proposalRevisionPending,true,'a successful model turn is not publication of the revised document');
  assert.equal(reconcileCreationArtifacts(job,options).status,'pending');
  assert.throws(()=>approveCreationDocument(job,'contract',approval(job,'contract'),options),/stale/);
  if(scenario==='authored-edit') {
    writeFileSync(job.contract.path,seed+'\nAuthor addition.\n');
    assert.throws(()=>completeCreationBrief(job,answer(changed),{...options,turnId:'revised'}),{code:'creation_preparation_draft_changed'});
    assert.ok(readFileSync(job.contract.path,'utf8').endsWith('Author addition.\n'));
  } else {
    if(scenario==='crash-after-write')assert.throws(()=>completeCreationBrief(job,answer(changed),{...options,turnId:'revised',afterPublish(){throw Error('publication crash');}}),/publication crash/);
    job=store.update(chatId,j=>reconcileCreationArtifacts(completeCreationBrief(j,answer(changed),{...options,turnId:'revised'}),options));
    assert.equal(job.proposalRevisionPending,false);assert.equal(job.status,'awaiting_contract_approval');
    assert.equal(contractData(job.contract.path,options).agentId,agentId,'a proposal generation changes document identity, not agent identity');
    assert.ok(job.contract.text.includes(changed.constraints.at(-1)));
    assert.deepEqual(store.recordTurn(chatId,receipt),job,'replayed receipt does not reset publication or add usage');
    job=store.update(chatId,j=>approveCreationDocument(j,'contract',{...approval(j,'contract'),requestId:'contract-revised'},options));
    job=store.update(chatId,j=>reconcileCreationArtifacts({...j,...prepareCreationOutcome(j,options)},options));
    assert.equal(job.status,'awaiting_outcome_approval');assert.equal(job.approvals.outcome,undefined);
    job=store.update(chatId,j=>approveCreationDocument(j,'outcome',{...approval(j,'outcome'),requestId:'outcome-revised'},options));
    assert.equal(verifyOutcomeApproval(job.outcome.path,options).ok,true);
    assert.equal(job.phase,'research');assert.equal(job.budget.tokensUsed,17);
    assert.equal(Object.keys(job.budget.turns).length,1,'host publication and Outcome do not add model turns');
    assert.equal(readdirSync(path.join(job.draftRoot,'contracts')).filter(file=>file.endsWith('.md')).length,2);
  }
  for(const [file,bytes] of accepted)assert.equal(readFileSync(file,'utf8'),bytes,'accepted history stays unchanged');
});
