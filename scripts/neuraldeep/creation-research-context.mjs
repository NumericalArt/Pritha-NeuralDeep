import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {atomicWriteFile,withFileLock} from '../lib/atomic-file.mjs';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {parseFrontmatterData} from '../lib/frontmatter.mjs';
import {markdownDocumentLock} from '../lib/markdown-content-lock.mjs';
import {contractData} from '../agents-mother/contract.mjs';
import {verifyPatternPackIntegrity} from '../agents-mother/pattern-research.mjs';
import {deriveExternalResearchTopics} from '../agents-mother/external-research-topics.mjs';
import {verifyExternalResearchIntegrity} from '../agents-mother/external-research.mjs';
import {researchGateDecisionForReport,reportReferencesContract} from '../agents-mother/research-gate.mjs';
import {creationHostDirectory} from './creation-research.mjs';
import {creationGeneration} from './creation-generation.mjs';
import {AgentCreationError} from './agent-creation-store.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const read=(file,root)=>readBoundedRegularFile(file,{allowedRoots:[root],maxBytes:1024*1024}).text;
const fail=(code,message)=>{throw new AgentCreationError(code,message);};
function researchCommand(job,options) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(options.root,'scripts/pritha.mjs'),'research',job.contract.path],{
      cwd:options.root,env:{...process.env,TECHSCOPE_ROOT:options.root,PRITHA_STATE_ROOT:options.stateRoot,
        PRITHA_AGENT_AUTHORING_ROOT:job.draftRoot,PRITHA_AGENT_PARENT:path.dirname(job.target)},stdio:['ignore','pipe','pipe']});
    let output='',timedOut=false,kill;
    const collect=data=>{output=(output+data).slice(-16000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');kill=setTimeout(()=>child.kill('SIGKILL'),5000);},120000);
    child.once('error',error=>{clearTimeout(timer);clearTimeout(kill);reject(error);});
    child.once('close',code=>{clearTimeout(timer);clearTimeout(kill);code===0&&!timedOut?resolve(output):reject(new AgentCreationError('creation_local_research_failed',output));});
  });
}
function researchFiles(job,options) {
  const data=contractData(job.contract.path,{root:options.root});
  if(hash(read(job.contract.path,options.stateRoot))!==job.approvals?.contract?.hash)fail('creation_contract_approval_required');
  const directory=creationHostDirectory(job.draftRoot,'research'),entries=readdirSync(directory);
  if(entries.length>150)fail('creation_documents_limit');
  const reports=entries.filter(name=>name.endsWith('.md')).map(name=>{
    const file=path.join(directory,name),text=read(file,job.draftRoot);return {file,text,fm:parseFrontmatterData(text)};
  }).filter(item=>item.fm?.type==='review' && item.fm.contract_fingerprint===data.fingerprint
    && item.fm.research_gate_status!==undefined && reportReferencesContract(item.text,data).ok);
  if(reports.length>1)fail('creation_research_ambiguous','Для этой версии найдено несколько research-отчётов. Требуется проверка.');
  if(!reports.length)return null;
  const report=reports[0],patternPath=path.resolve(options.root,report.fm.pattern_pack || '');
  if(path.dirname(patternPath)!==directory)fail('creation_research_boundary');
  const patternText=read(patternPath,job.draftRoot),pattern=verifyPatternPackIntegrity(patternText,data.fingerprint);
  if(!pattern.ok || pattern.lock!==report.fm.pattern_pack_lock || report.fm.research_content_lock!==markdownDocumentLock(report.text))fail('creation_research_integrity','Research или pattern pack не прошёл проверку locks.');
  return {data,report,pattern:{...pattern,path:patternPath,text:patternText}};
}

/** One host local-research operation per exact contract and provider/runtime context. */
export async function prepareCreationResearch(job,options) {
  if(process.env.PRITHA_AGENT_AUTHORING_ROOT || job.preparationPolicyVersion!==2)fail('creation_preparation_host_required');
  const directory=creationHostDirectory(options.stateRoot,'audit','creation-preparation',job.jobId,`generation-${creationGeneration(job)}`);
  const input={jobId:job.jobId,instanceId:job.instanceId,contractHash:job.contract.hash,outcomeHash:job.outcome.hash,
    release:job.releaseSha,model:options.model || null,effort:options.effort || null};
  const file=path.join(directory,'local-research.json'),inputHash=hash(JSON.stringify(input));
  return withFileLock(file,async()=>{
    const receipt=existsSync(file)?JSON.parse(read(file,options.stateRoot)):null;
    if(receipt && (receipt.schema!=='pritha-local-research-operation-v1' || receipt.inputHash!==inputHash))fail('creation_research_context_changed');
    if(!receipt)atomicWriteFile(file,JSON.stringify({schema:'pritha-local-research-operation-v1',input,inputHash,status:'prepared'}));
    let files=researchFiles(job,options);
    if(!files) {
      if(receipt?.status==='completed')fail('creation_research_artifact_missing');
      await (options.command || researchCommand)(job,options);
      files=researchFiles(job,options);
      if(!files)fail('creation_research_artifact_missing');
    }
    if(receipt?.patternHash && receipt.patternHash!==hash(files.pattern.text))fail('creation_research_context_changed');
    atomicWriteFile(file,JSON.stringify({schema:'pritha-local-research-operation-v1',input,inputHash,status:'completed',
      report:files.report.file,pattern:files.pattern.path,patternHash:hash(files.pattern.text)}));
    return readCreationResearch(job,options);
  });
}

export function readCreationResearch(job,options) {
  const files=researchFiles(job,options);if(!files)fail('creation_research_artifact_missing');
  const {data,report,pattern}=files;
  const topics=deriveExternalResearchTopics(data,{patternPack:{externalResearchSeeds:pattern.payload.external_research_seeds}});
  const evidence=verifyExternalResearchIntegrity(report.text,topics,{contractFingerprint:data.fingerprint,repositoryAdoptionMode:data.repositoryAdoptionMode});
  const facts=(evidence.verifiedItems || []).map(item=>({topic:item.topic_id,url:item.source_url,title:item.source_title,
    retrievedAt:item.retrieved_at,version:item.version_context,claim:item.claim,evidence:item.evidence_summary,compatibility:item.temporal_compatibility}));
  const checked=[...new Set(facts.map(item=>item.topic))];
  const gate=researchGateDecisionForReport(data,report.text,{stateRoot:options.stateRoot,artifactRoots:[job.draftRoot]});
  return {topics,facts,checked,remaining:topics.filter(topic=>topic.required!==false && !checked.includes(topic.id)).map(topic=>topic.id),
    gate:{ok:gate.ok,status:gate.status,reasons:gate.reasons},
    rules:pattern.payload.patterns.map(item=>({id:item.id,path:item.path,heading:item.heading,kind:item.kind,status:item.status})),
    artifacts:[{id:'research',path:report.file,hash:hash(report.text),bytes:Buffer.byteLength(report.text)},
      {id:'patterns',path:pattern.path,hash:hash(pattern.text),bytes:Buffer.byteLength(pattern.text)}]};
}
