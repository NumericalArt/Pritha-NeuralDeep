import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {atomicWriteFile} from '../lib/atomic-file.mjs';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {creationHostDirectory} from './creation-research.mjs';
import {readCreationResearch} from './creation-research-context.mjs';
import {creationGeneration} from './creation-generation.mjs';
import {creationPhase,AgentCreationError} from './agent-creation-store.mjs';
import {assertPreparationPolicy,preparationPhase} from './creation-preparation-policy.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const read=(file,root,maxBytes=1024*1024)=>readBoundedRegularFile(file,{allowedRoots:[root],maxBytes}).text;
const fail=(code,message)=>{throw new AgentCreationError(code,message);};
const evidenceRef=document=>document?{path:document.path,hash:document.hash}:null;
export function creationSemanticProgress(job,research=null) {
  // Retrieval times, filesystem times and "done" messages are not progress.
  return hash(JSON.stringify({brief:job.preparation?.briefHash || null,contract:job.contract?.hash||null,outcome:job.outcome?.hash||null,
    facts:(research?.facts||[]).map(({topic,url,claim,evidence,version,compatibility})=>({topic,url,claim,evidence,version,compatibility})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}));
}
export function creationCheckpointSummary(job) {
  const checkpoint=job.checkpoint;if(!checkpoint)return null;
  return {phase:checkpoint.phase,turnId:checkpoint.turnId,error:checkpoint.error || null,
    reference:{jobId:job.jobId,turnId:checkpoint.turnId,field:'checkpoint'},
    documents:{contract:evidenceRef(job.contract),outcome:evidenceRef(job.outcome)},nextPhase:creationPhase(job)};
}

export function prepareCreationContextPacket(job,dialogue,options) {
  assertPreparationPolicy(job);
  if(job.preparationPolicyVersion!==2 || !dialogue.restart) return null;
  const phase=preparationPhase(creationPhase(job));
  const research=phase==='research'?readCreationResearch(job,options):null;
  const directory=creationHostDirectory(options.stateRoot,'audit','creation-context',job.jobId);
  const artifacts=[];
  for(const artifact of research?.artifacts||[]) {
    const original=read(artifact.path,job.draftRoot);
    if(hash(original)!==artifact.hash)fail('creation_context_source_changed');
    const content=original.replace(/<!--\s*pritha-[\s\S]*?-->/g,'[Machine payload checked by the host; canonical evidence retained.]');
    const contentHash=hash(content),file=path.join(directory,`${contentHash}.txt`);
    if(!existsSync(file))atomicWriteFile(file,content);
    artifacts.push({...artifact,snapshot:file,contentHash,contentBytes:Buffer.byteLength(content)});
  }
  const progressHash=creationSemanticProgress(job,research);
  const packet={schema:'pritha-creation-context-packet-v1',jobId:job.jobId,instanceId:job.instanceId,agentId:job.agentId,
    ...(job.briefProtocolVersion ? {briefProtocolVersion:job.briefProtocolVersion} : {}),
    generation:creationGeneration(job),releaseSha:job.releaseSha,policyVersion:2,phase,workUnitId:options.turnId,
    dialogue:JSON.parse(dialogue.text),brief:job.preparation?.brief||null,
    documents:{contract:evidenceRef(job.contract),outcome:evidenceRef(job.outcome)},approvals:job.approvals,
    research:research?{topics:research.topics,facts:research.facts,rules:research.rules,remaining:research.remaining,gate:research.gate}:null,
    checkpoint:creationCheckpointSummary(job),limits:job.preparationPolicy,progressHash,
    artifacts:artifacts.map(({id,hash,bytes,contentHash})=>({id,hash,bytes,contentHash}))};
  const text=JSON.stringify(packet),bytes=Buffer.byteLength(text);
  if(bytes>job.preparationPolicy.freshBytes)fail('creation_context_requirements_too_large','Обязательные требования превышают 64 КиБ. Запрос не отправлен; исходное задание сохранено целиком.');
  const packetHash=hash(text),file=path.join(directory,`${packetHash}.json`),index=path.join(directory,`${packetHash}.reader.json`);
  if(!existsSync(file))atomicWriteFile(file,text);
  if(!existsSync(index))atomicWriteFile(index,JSON.stringify({jobId:job.jobId,packetHash,artifacts}));
  return {path:file,hash:packetHash,bytes,phase,workUnitId:options.turnId,progressHash,policyVersion:2};
}

export function readCreationContextPacket(job,options) {
  const ref=job.contextPacket;
  if(!ref || path.dirname(ref.path)!==path.join(path.resolve(options.stateRoot),'audit','creation-context',job.jobId))fail('creation_context_identity');
  const text=read(ref.path,options.stateRoot,128*1024),packet=JSON.parse(text);
  if(hash(text)!==ref.hash || packet.jobId!==job.jobId || packet.instanceId!==job.instanceId || packet.generation!==creationGeneration(job)
    || packet.releaseSha!==job.releaseSha || packet.policyVersion!==2 || packet.workUnitId!==ref.workUnitId
    || packet.phase!==preparationPhase(creationPhase(job)) || packet.briefProtocolVersion!==job.briefProtocolVersion)fail('creation_context_changed');
  for(const kind of ['contract','outcome']) {
    const document=packet.documents[kind];
    if(document && (job[kind]?.hash!==document.hash || job[kind]?.path!==document.path || hash(read(document.path,options.stateRoot))!==document.hash))fail('creation_context_document_changed');
    if(document && JSON.stringify(packet.approvals[kind]||null)!==JSON.stringify(job.approvals[kind]||null))fail('creation_context_approval_changed');
  }
  return {text,packet};
}

/** A complete, hash-bound page; never a cut JSON string or an arbitrary filesystem reader. */
export function readCreationContextArtifact({stateRoot,jobId,packetHash,artifactId,contentHash,cursor=0}) {
  if(!/^creation_[a-f0-9]{24}$/.test(jobId)||!/^[a-f0-9]{64}$/.test(packetHash)||!Number.isSafeInteger(cursor)||cursor<0)fail('creation_context_reader_identity');
  const directory=path.join(stateRoot,'audit','creation-context',jobId),index=JSON.parse(read(path.join(directory,`${packetHash}.reader.json`),stateRoot));
  if(index.jobId!==jobId || index.packetHash!==packetHash)fail('creation_context_reader_identity');
  const artifact=index.artifacts.find(item=>item.id===artifactId && item.contentHash===contentHash);
  if(!artifact || path.dirname(artifact.snapshot)!==directory)fail('creation_context_reader_artifact');
  const content=Buffer.from(read(artifact.snapshot,stateRoot));
  if(hash(content)!==contentHash || cursor>content.length || (content[cursor]&0xc0)===0x80)fail('creation_context_reader_cursor');
  let end=Math.min(content.length,cursor+4096);
  while(end<content.length && (content[end]&0xc0)===0x80)end--;
  let result;
  do {
    const text=content.subarray(cursor,end).toString('utf8');
    result={artifactId,sourceHash:artifact.hash,contentHash,cursor,nextCursor:end<content.length?end:null,hasMore:end<content.length,text};
    if(Buffer.byteLength(JSON.stringify(result))<=8192)break;
    do {end--;} while(end>cursor && (content[end]&0xc0)===0x80);
  } while(end>cursor);
  return result;
}
