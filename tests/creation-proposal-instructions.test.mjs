import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creationDraftRoot, creationPrompt, reconcileCreationArtifacts } from '../scripts/neuraldeep/agent-creation.mjs';
import { parseInterviewBrief, serializeInterviewBrief, validateInterviewBrief } from '../scripts/agents-mother/interview-brief.mjs';
import { contractData } from '../scripts/agents-mother/contract.mjs';

for (const preset of ['generic','local-feed','llm-app']) {
  test(`host proposal instructions produce a reviewable ${preset} contract without source discovery`,t=>{
    const directory=mkdtempSync(path.join(os.tmpdir(),'pritha-proposal-guide-'));
    t.after(()=>rmSync(directory,{recursive:true,force:true}));
    const root=path.join(directory,'code'),stateRoot=path.join(directory,'state'),target=path.join(directory,'children','proposal-app');
    const draftRoot=creationDraftRoot(stateRoot,'fixture','chat_fixture');
    for(const folder of [root,stateRoot,draftRoot])mkdirSync(folder,{recursive:true});
    const job={jobId:path.basename(draftRoot),chatId:'chat_fixture',instanceId:'fixture',agentId:'proposal-app',
      target,draftRoot,releaseSha:'a'.repeat(40),executionCodeRoot:path.resolve('.'),phase:'interview',status:'pending',approvals:{}};
    const prompt=creationPrompt(job);
    assert.match(prompt,/```pritha-brief-json\n/,'the executor receives the authoritative structured shape before dispatch');
    const brief=parseInterviewBrief(prompt);
    Object.assign(brief,{identity:{...brief.identity,name:'Proposal App'},goal:'Review public source updates',user:'Local operator',
      successCriteria:['Saved results survive restart','Export contains source links'],coreFunctions:['Fetch public sources'],
      workflows:['Refresh, select and export'],sources:['https://example.test/feed.xml'],constraints:['At most 20 selected entries'],nonGoals:['No publishing'],
      permissions:{network:['Declared public sources'],filesystem:['Child project only'],authorization:'Local operator'}});
    brief.technical.preset=preset;
    assert.deepEqual(validateInterviewBrief(brief,{requireComplete:true}),[]);
    writeFileSync(path.join(draftRoot,'brief.json'),serializeInterviewBrief(brief));
    const command=prompt.split('\n').find(line=>line.startsWith('Save this JSON')).split('then run: ')[1];
    const env={...process.env,TECHSCOPE_ROOT:root,PRITHA_STATE_ROOT:stateRoot,PRITHA_AGENT_PARENT:path.dirname(target),PRITHA_AGENT_AUTHORING_ROOT:draftRoot};
    const run=spawnSync('/bin/sh',['-c',command],{cwd:draftRoot,env,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr||run.stdout);
    const reconciled=reconcileCreationArtifacts(job,{root,stateRoot});
    assert.equal(reconciled.status,'awaiting_contract_approval');
    assert.deepEqual(reconciled.contract.issues,[]);
    assert.equal(reconciled.outcome,null);
    const contract=contractData(reconciled.contract.path,{root});
    assert.equal(contract.fm.status,'draft');
    assert.equal(contract.technicalSlug,job.agentId);
    assert.equal(contract.targetFolder,target);
    assert.match(reconciled.contract.text,/At most 20 selected entries/);
    assert.match(reconciled.contract.text,/https:\/\/example.test\/feed.xml/);
    assert.match(reconciled.contract.text,/Declared public sources/);
    assert.equal(existsSync(target),false);
    assert.equal(existsSync(path.join(stateRoot,'agents','contracts')),false);
    assert.equal(existsSync(path.join(stateRoot,'audit','creation-approvals')),false);
    const before=readFileSync(reconciled.contract.path,'utf8');
    const retry=spawnSync('/bin/sh',['-c',command],{cwd:draftRoot,env,encoding:'utf8'});
    assert.equal(retry.status,0,retry.stderr||retry.stdout);
    assert.equal(readFileSync(reconciled.contract.path,'utf8'),before);
    assert.equal(readdirSync(path.join(draftRoot,'contracts')).filter(name=>name.endsWith('.md')).length,1);
  });
}
