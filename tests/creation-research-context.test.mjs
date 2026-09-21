import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {NeuralDeepCoordinationStore} from '../scripts/neuraldeep/coordination-store.mjs';
import {AgentCreationStore} from '../scripts/neuraldeep/agent-creation-store.mjs';
import {creationDraftRoot,reconcileCreationArtifacts,approveCreationDocument} from '../scripts/neuraldeep/agent-creation.mjs';
import {prepareCreationContract,prepareCreationOutcome} from '../scripts/neuraldeep/creation-preparation.mjs';
import {prepareCreationResearch,readCreationResearch} from '../scripts/neuraldeep/creation-research-context.mjs';
import {prepareCreationContextPacket,readCreationContextPacket,readCreationContextArtifact,creationSemanticProgress} from '../scripts/neuraldeep/creation-context-packet.mjs';
import {settleCreationPreparation} from '../scripts/neuraldeep/creation-preparation-control.mjs';
import {contractData} from '../scripts/agents-mother/contract.mjs';
import {patternPackMarkdown,verifyPatternPackIntegrity} from '../scripts/agents-mother/pattern-research.mjs';
import {deriveExternalResearchTopics} from '../scripts/agents-mother/external-research-topics.mjs';
import {applyExternalResearchEvidence} from '../scripts/agents-mother/external-research.mjs';
import {markdownDocumentLock} from '../scripts/lib/markdown-content-lock.mjs';

const brief={identity:{name:'Feed and digest'},goal:'Read public feeds and retain a local digest',user:'Local operator',successCriteria:['Refresh without duplicates and keep SQLite after restart'],
  coreFunctions:['Refresh feeds','Create a digest'],workflows:['Open UI, refresh, select up to 20 items, create a digest and export Markdown'],
  sources:['https://example.test/rss'],constraints:['No credentials in the browser'],nonGoals:['Automatic schedules'],
  permissions:{network:['Declared public feed and Pritha provider binding'],filesystem:['Own target only'],authorization:'Explicit operator UI actions'},
  technical:{preset:'llm-app',sourceFormat:'rss',repositoryResearchPolicy:'not-applicable',repositoryResearchWaiverReason:'No repository discovery; runtime, source and provider checks stay mandatory'}};
function fixture(t) {
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'creation-research-context-'));t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const options={root:process.cwd(),stateRoot,model:'fixture-model',effort:null};
  const store=new NeuralDeepCoordinationStore({databasePath:path.join(stateRoot,'coord.sqlite')});t.after(()=>store.close());
  const jobs=new AgentCreationStore(store),chatId='chat_research_context',draftRoot=creationDraftRoot(stateRoot,'fixture',chatId),target=path.join(stateRoot,'children','feed');
  mkdirSync(draftRoot,{recursive:true});mkdirSync(target,{recursive:true});
  let job=jobs.create({chatId,instanceId:'fixture',agentId:'feed',target,draftRoot,releaseSha:'a'.repeat(40),preparationPolicyVersion:2});
  const contract=prepareCreationContract(job,brief,options);job={...job,contract:contract.contract,preparation:{brief:contract.brief,briefHash:contract.briefHash}};
  const approve=kind=>{job=reconcileCreationArtifacts({...job,status:'pending'},options);job=approveCreationDocument(job,kind,{action:`approve_${kind}`,requestId:`approve_${kind}`,expectedRevision:job.revision,actor:'user'},options);};
  approve('contract');Object.assign(job,prepareCreationOutcome(job,options));approve('outcome');
  const data=contractData(job.contract.path,options),directory=path.join(draftRoot,'research');
  const pattern=patternPackMarkdown(data,{memoryResults:[{path:'04_standards/fixture.md',title:'Retain local history',type:'standard',status:'accepted',snippet:'Use bounded requests and preserve successful data on failure.'}]});
  const topics=deriveExternalResearchTopics(data,{patternPack:{externalResearchSeeds:verifyPatternPackIntegrity(pattern.text).payload.external_research_seeds}});
  const reportPath=path.join(directory,'research.md');let localCalls=0;
  const command=()=>{
    localCalls++;mkdirSync(directory,{recursive:true});const patternPath=path.join(directory,'patterns.md');writeFileSync(patternPath,pattern.text);
    let text=`---\nid: fixture-research\ntype: review\nstatus: draft\nresearch_gate_status: pending\nmemory_research_status: complete\nexternal_research_status: pending\nsynthesis_status: pending\ncontract_fingerprint: ${data.fingerprint}\npattern_pack: ${JSON.stringify(patternPath)}\npattern_pack_lock: ${pattern.lock}\npattern_pack_contract_fingerprint: ${data.fingerprint}\nexternal_research_topics: ${JSON.stringify(topics.map(topic=>topic.id))}\nresearch_content_lock: pending\nsources:\n  - ${JSON.stringify(data.relPath)}\n---\n\n# Synthetic local research\n\nContract: ${data.relPath}\n\n## Evidence volume fixture\n`;
    const padding='Public synthetic pattern rationale, without private records.\n';
    while(Buffer.byteLength(text)+Buffer.byteLength(pattern.text)<90*1024)text+=padding;
    text=text.replace(/^research_content_lock:.*$/m,`research_content_lock: ${markdownDocumentLock(text)}`);writeFileSync(reportPath,text);
  };
  const importEvidence=(all=false,old=false)=>{
    const now=old?'2001-01-01T00:00:00.000Z':new Date().toISOString();
    const items=(all?topics:topics.slice(0,1)).map(topic=>({topic_id:topic.id,source_url:`https://example.test/docs/${topic.id}`,source_type:'official-docs',
      source_updated:now,retrieved_at:now,claim:'Synthetic primary source confirms the declared local runtime and bounded inputs.',confidence:'high'}));
    const updated=applyExternalResearchEvidence(readFileSync(reportPath,'utf8'),data,{backend:'manual',items,
      synthesis:{relationship:'confirms',memory_comparison:'The fixture confirms local history preservation.',summary:'Retain a bounded local service.',architecture_decision:'Use the instance provider binding.',alternatives:['Defer the integration'],tradeoffs:['More verification effort']}},{topics});
    writeFileSync(reportPath,updated.text);
  };
  return {job,options,command,importEvidence,topics,reportPath,localCalls:()=>localCalls};
}

test('90 KiB research is prepared once, checked fully and read in bounded hash-bound pages',async t=>{
  const f=fixture(t);
  await prepareCreationResearch(f.job,{...f.options,command:f.command});
  await prepareCreationResearch(f.job,{...f.options,command:f.command});assert.equal(f.localCalls(),1);
  const research=readCreationResearch(f.job,f.options);assert.equal(research.remaining.length,f.topics.length);assert.equal(research.gate.ok,false);
  assert.ok(research.rules.some(rule=>rule.evidence.includes('preserve successful data')));
  const dialogue={restart:true,text:JSON.stringify([{role:'user',text:'Keep the full original request, both feed URLs, Russian text and up to 20 items.'}])};
  const ref=prepareCreationContextPacket(f.job,dialogue,{...f.options,turnId:'turn_research'}),job={...f.job,contextPacket:ref};
  const packet=readCreationContextPacket(job,f.options);
  assert.ok(ref.bytes<32*1024);assert.doesNotMatch(packet.text,/Public synthetic pattern rationale/);
  assert.equal(packet.packet.research.topics.length,f.topics.length);
  const artifact=packet.packet.artifacts.find(item=>item.id==='research');let cursor=0,combined='';
  do {
    const page=readCreationContextArtifact({stateRoot:f.options.stateRoot,jobId:job.jobId,packetHash:ref.hash,artifactId:'research',contentHash:artifact.contentHash,cursor});
    assert.ok(Buffer.byteLength(JSON.stringify(page))<=8192);combined+=page.text;cursor=page.nextCursor;
    assert.equal(page.hasMore,cursor!==null);
  } while(cursor!==null);
  assert.equal(combined,readFileSync(f.reportPath,'utf8'));
  const cli=JSON.parse(execFileSync(process.execPath,[path.resolve('scripts/creation-context-reader.mjs'),'--packet',ref.hash,'--artifact','research','--hash',artifact.contentHash],
    {env:{...process.env,PRITHA_STATE_ROOT:f.options.stateRoot,PRITHA_AGENT_AUTHORING_ROOT:job.draftRoot},encoding:'utf8'}));
  assert.equal(cli.cursor,0);assert.equal(cli.hasMore,true);
  await assert.rejects(prepareCreationResearch(f.job,{...f.options,model:'changed',command:f.command}),{code:'creation_research_context_changed'});
});

test('partial verified facts survive a checkpoint, stale evidence and timestamps cannot create progress',async t=>{
  const f=fixture(t);await prepareCreationResearch(f.job,{...f.options,command:f.command});
  const original=readCreationResearch(f.job,f.options),initialProgress=creationSemanticProgress(f.job,original);
  f.importEvidence();const partial=readCreationResearch(f.job,f.options);
  assert.equal(partial.checked.length,1);assert.equal(partial.remaining.length,f.topics.length-1);assert.equal(partial.gate.ok,false);
  assert.notEqual(creationSemanticProgress(f.job,partial),initialProgress);
  const job={...f.job,status:'blocked',contextPacket:{hash:'b'.repeat(64),progressHash:initialProgress}};
  const receipt={tokens:5000,processExited:true,blocker:{code:'provider_budget_context_boundary'}};
  const rotated=settleCreationPreparation(job,receipt,f.options);
  assert.equal(rotated.status,'pending');assert.equal(rotated.preparationRotations.research,1);
  const again=settleCreationPreparation({...rotated,contextPacket:job.contextPacket},receipt,f.options);
  assert.equal(again.status,'blocked');assert.equal(again.autoContinue,false);
  for(const unsettled of [{...receipt,processExited:false},{...receipt,tokens:null}])assert.equal(settleCreationPreparation(job,unsettled,f.options).autoContinue,false);
  f.importEvidence(true,true);assert.equal(readCreationResearch(f.job,f.options).checked.length,0);
  writeFileSync(f.reportPath,readFileSync(f.reportPath,'utf8')+'tampered');
  assert.throws(()=>readCreationResearch(f.job,f.options),{code:'creation_research_integrity'});
});
