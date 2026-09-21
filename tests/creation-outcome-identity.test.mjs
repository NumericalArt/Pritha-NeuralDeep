import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {NeuralDeepCoordinationStore} from '../scripts/neuraldeep/coordination-store.mjs';
import {AgentCreationStore} from '../scripts/neuraldeep/agent-creation-store.mjs';
import {creationDraftRoot,reconcileCreationArtifacts,approveCreationDocument} from '../scripts/neuraldeep/agent-creation.mjs';
import {createOutcomeSpec,verifyOutcomeApproval} from '../scripts/agents-mother/outcome-spec.mjs';
import {parseFrontmatterData} from '../scripts/lib/frontmatter.mjs';

test('two same-name UI proposals publish independent technical Outcome identities and preserve the first approval',t=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'creation-outcome-identity-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const root=path.join(temp,'code'),stateRoot=path.join(temp,'state'),parent=path.join(temp,'children');
  for(const p of [root,stateRoot,parent])mkdirSync(p);
  const coordination=new NeuralDeepCoordinationStore({databasePath:path.join(stateRoot,'admission.sqlite')});t.after(()=>coordination.close());
  const store=new AgentCreationStore(coordination),options={root,stateRoot};
  let first,firstBytes,firstEvent;
  for(const agentId of ['signal-desk-one','signal-desk-two']) {
    const chatId=`chat_${agentId}`,draftRoot=creationDraftRoot(stateRoot,'fixture-instance',chatId),target=path.join(parent,agentId);
    let job=store.create({chatId,instanceId:'fixture-instance',agentId,target,draftRoot,releaseSha:'a'.repeat(40),preparationPolicyVersion:2});
    execFileSync(process.execPath,[path.resolve('scripts/pritha.mjs'),'init','--no-input','--contract-only','--name','Signal Desk ND','--slug',agentId,'--mission','Review public feeds','--success','Items persist without duplicates','--target-folder',target],
      {env:{...process.env,TECHSCOPE_ROOT:root,PRITHA_STATE_ROOT:stateRoot,PRITHA_AGENT_PARENT:parent,PRITHA_AGENT_AUTHORING_ROOT:draftRoot},stdio:'pipe'});
    job=reconcileCreationArtifacts(job,options);
    const request=kind=>({action:`approve_${kind}`,requestId:`${agentId}_${kind}`,expectedRevision:job.revision,actor:'codex-operator',authorizationBasis:'Synthetic delegated UI test'});
    job=approveCreationDocument(job,'contract',request('contract'),options);
    const init = date => {
      const before=process.env.PRITHA_AGENT_AUTHORING_ROOT;process.env.PRITHA_AGENT_AUTHORING_ROOT=draftRoot;
      try {return createOutcomeSpec(job.contract.path,{root,stateRoot,date});}
      finally {if(before===undefined)delete process.env.PRITHA_AGENT_AUTHORING_ROOT;else process.env.PRITHA_AGENT_AUTHORING_ROOT=before;}
    };
    const result=init('2026-09-21');
    const authored=readFileSync(result.path,'utf8');
    assert.equal(parseFrontmatterData(authored).agent_slug,agentId);
    writeFileSync(result.path,authored+'\nOperator annotation: preserve this exact authored sentence.\n');
    const repeated=init('2026-09-22');
    assert.equal(repeated.path,result.path);assert.equal(repeated.unchanged,true);
    job=reconcileCreationArtifacts({...job,status:'pending'},options);
    job=approveCreationDocument(job,'outcome',request('outcome'),options);
    assert.match(path.basename(job.outcome.path),new RegExp(agentId+'.*'+job.jobId));
    assert.equal(verifyOutcomeApproval(job.outcome.path,options).ok,true);
    const again=approveCreationDocument(job,'outcome',request('outcome'),options);
    assert.equal(again.outcome.hash,job.outcome.hash);
    if(!first) {first=job;firstBytes=readFileSync(job.outcome.path,'utf8');firstEvent=verifyOutcomeApproval(job.outcome.path,options).event;}
    else {
      assert.notEqual(job.outcome.path,first.outcome.path);
      assert.equal(readFileSync(first.outcome.path,'utf8'),firstBytes);
      assert.deepEqual(verifyOutcomeApproval(first.outcome.path,options).event,firstEvent);
      assert.equal(readFileSync(path.join(stateRoot,'audit','outcome-approvals.jsonl'),'utf8').trim().split('\n').length,2);
    }
  }
});
