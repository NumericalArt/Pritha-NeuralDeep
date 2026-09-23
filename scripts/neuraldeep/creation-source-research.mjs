import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {atomicWriteFile,atomicCompareAndSwapFile,withFileLock} from '../lib/atomic-file.mjs';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {SearchService} from '../search/service.mjs';
import {contractData} from '../agents-mother/contract.mjs';
import {applyExternalResearchEvidence} from '../agents-mother/external-research.mjs';
import {researchGateDecisionForReport} from '../agents-mother/research-gate.mjs';
import {creationHostDirectory} from './creation-research.mjs';
import {AgentCreationError} from './agent-creation-store.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const fail=(code,message)=>{throw new AgentCreationError(code,message);};
const read=(file,root)=>readBoundedRegularFile(file,{allowedRoots:[root],maxBytes:1024*1024}).text;
function location(job,options) {
 if(process.env.PRITHA_AGENT_AUTHORING_ROOT || job.researchProtocolVersion!==2)fail('creation_preparation_host_required');
 return path.join(creationHostDirectory(options.stateRoot,'audit','creation-preparation',job.jobId,`generation-${job.generation||1}`),'sources.json');
}
const binding=job=>hash({job:job.jobId,contract:job.contract.hash,outcome:job.outcome.hash,release:job.releaseSha});
function load(job,options) {
 const file=location(job,options);
 const state=existsSync(file)?JSON.parse(read(file,options.stateRoot)):{schema:'pritha-creation-sources-v1',binding:binding(job),topics:{},sources:[]};
 if(state.schema!=='pritha-creation-sources-v1' || state.binding!==binding(job))fail('creation_research_context_changed');
 return {file,state};
}
function allowed(url,domains) {
 try {const parsed=new URL(url);return parsed.protocol==='https:' && !parsed.username && !parsed.password && domains.some(domain=>parsed.hostname===domain || parsed.hostname.endsWith('.'+domain));}catch{return false;}
}
export function sourceExcerpt(text,query,maxBytes=2400) {
 const paragraphs=String(text).split(/\n+/).filter(line=>line.trim().length>35);
 const words=[...new Set(query.toLowerCase().match(/[a-z]{4,}/g)||[])];
 const ranked=paragraphs.map((line,index)=>({line,index,score:words.reduce((n,word)=>n+Number(line.toLowerCase().includes(word)),0)})).sort((a,b)=>b.score-a.score || a.index-b.index);
 let excerpt='';for(const {line} of ranked){if(Buffer.byteLength(excerpt+'\n'+line)<=maxBytes)excerpt+=(excerpt?'\n':'')+line;}
 return excerpt;
}
export function readCreationSources(job,options) {
 const {state}=load(job,options);
 for(const source of state.sources)if(hash(source.text)!==source.contentHash || !Number.isFinite(Date.parse(source.retrievedAt)) || Date.now()-Date.parse(source.retrievedAt)>30*86400000 || Date.parse(source.retrievedAt)-Date.now()>300000)fail('creation_research_source_stale');
 return state.sources.map(({text,...source})=>source);
}

function recoverPublication(job,research,options,state,file) {
 const saved=state.publication;if(!saved)return;
 const target=research.artifacts.find(item=>item.id==='research')?.path;
 if(saved.path!==target || hash(saved.text)!==saved.hash)fail('creation_research_context_changed');
 const current=read(target,job.draftRoot);
 if(hash(current)!==saved.hash) {
  if(state.completedTurn || hash(current)!==saved.previousHash)fail('creation_research_context_changed');
  atomicCompareAndSwapFile(target,current,saved.text);
 }
 state.completedTurn=saved.turnId;atomicWriteFile(file,JSON.stringify(state));
}

/** A durable, bounded Search -> primary Read pipeline. Replays retain all call counters. */
export async function collectCreationSources(job,research,options) {
 const file=location(job,options);
 return withFileLock(file,async()=>{
  const {state}=load(job,options),topics=research.topics.filter(topic=>topic.required!==false && !research.checked.includes(topic.id));
  recoverPublication(job,research,options,state,file);
  if(state.completedTurn)return readCreationSources(job,options);
  if(topics.length>12)fail('creation_research_topic_limit','Исследование содержит больше 12 обязательных тем. Уточните выбранные возможности агента.');
  const service=options.search || new SearchService({stateRoot:options.stateRoot,codeRoot:options.root,instance:job.instanceId});
  const save=()=>atomicWriteFile(file,JSON.stringify(state));
  try {
   for(const topic of topics) {
    if(options.signal?.aborted)fail('creation_paused');
    if(state.sources.some(source=>source.topicId===topic.id))continue;
    const item=state.topics[topic.id] ||= {attempts:0,status:'pending'};
    if(item.status==='started')fail('creation_research_source_unconfirmed',`Завершение получения источника для ${topic.topic} не подтверждено. Повторный сетевой вызов остановлен.`);
    if(item.attempts>=2)fail('creation_research_source_limit',`Не удалось получить первичный источник: ${topic.topic}. Две попытки сохранены; уточните требование или источник.`);
    if(!topic.primaryDomains?.length)fail('creation_research_authority_needed',`Для темы ${topic.topic} нужно выбрать первичный источник. Уточните техническое решение в задании.`);
    item.attempts++;item.status='started';save();
    const context={owner:job.jobId,turn:`${job.generation||1}:${topic.id}`,surface:'research',explicit:true,signal:options.signal};
    try {
     const found=await service.search({query:topic.query,domains:topic.primaryDomains,max_results:3,freshness:'current'},context);
     item.searchReceipt={id:found.id,status:found.status,error:found.error};save();
     if(!found.ok)throw Object.assign(new Error('search failed'),{code:found.error?.code||'search_unavailable'});
     const candidate=found.sources.find(source=>allowed(source.url,topic.primaryDomains));
     if(!candidate)throw Object.assign(new Error('primary source missing'),{code:'primary_source_missing'});
     const page=await service.readPage({url:candidate.url,max_chars:16000},context);
     item.readReceipt={id:page.id,status:page.status,error:page.error};save();
     if(!page.ok)throw Object.assign(new Error('read failed'),{code:page.error?.code||'read_unavailable'});
     const source=page.sources.find(source=>source.read===true && source.text && allowed(source.url,topic.primaryDomains));
     if(!source)throw Object.assign(new Error('a snippet is not evidence'),{code:'primary_page_not_read'});
     const excerpt=sourceExcerpt(source.text,topic.query);
     if(Buffer.byteLength(excerpt)<80)throw Object.assign(new Error('page has no usable excerpt'),{code:'primary_page_empty'});
     const contentHash=hash(source.text);
     state.sources.push({id:hash([topic.id,source.url,contentHash]).slice(0,24),topicId:topic.id,url:source.url,title:source.title,
      retrievedAt:source.retrieved_at,publishedAt:source.published_at||'unknown',contentHash,text:source.text,excerpt,untrusted:true});
     item.status='completed';item.error=null;save();
    } catch(error) {item.status='failed';item.error=error.code||'source_unavailable';save();
     fail('creation_research_source_unavailable',`Источник для «${topic.topic}» недоступен (${item.error}). Уже полученные страницы сохранены; доступна одна ограниченная повторная попытка.`);}
   }
   return readCreationSources(job,options);
  } finally {if(!options.search)service.store.close();}
 });
}

export function validateResearchSelection(value,sources,topics) {
 if(!value || !Array.isArray(value.facts) || value.facts.length>24)fail('creation_research_selection_invalid');
 const items=value.facts.map(fact=>{
  const source=sources.find(source=>source.id===fact.sourceId && source.topicId===fact.topicId);
  if(!source || !topics.some(topic=>topic.id===fact.topicId && topic.required!==false) || typeof fact.quote!=='string'
    || fact.quote.length<40 || fact.quote.length>1200 || !source.excerpt.includes(fact.quote))fail('creation_research_quote_unbound','Выдержка не совпала с прочитанным первичным источником. Работа сохранена.');
  return {topic_id:source.topicId,source_url:source.url,source_title:source.title,source_type:'official-docs',source_published:source.publishedAt,
   retrieved_at:source.retrievedAt,claim:fact.quote,evidence_summary:fact.quote,confidence:'medium',
   version_context:fact.versionContext,temporal_compatibility:fact.compatibility,temporal_compatibility_status:fact.compatibilityStatus};
 });
 return {backend:'host-primary-pages',items,synthesis:value.synthesis};
}

/** Host validates the model's choices against immutable read pages before writing report/checkpoint. */
export function completeCreationSourceResearch(job,answer,research,options) {
 const file=location(job,options);
 return withFileLock(file,()=>{
  const {state}=load(job,options);
  recoverPublication(job,research,options,state,file);
  if(state.completedTurn===options.turnId)return;
  const blocks=[...String(answer).matchAll(/```pritha-research-json\s*\n([\s\S]*?)\n```/g)];
  if(blocks.length!==1)fail('creation_research_selection_invalid','Не получена проверяемая сводка источников. Исходники и расход сохранены.');
  let value;try{value=JSON.parse(blocks[0][1]);}catch{fail('creation_research_selection_invalid');}
  const input=validateResearchSelection(value,readCreationSources(job,options),research.topics);
  const artifact=research.artifacts.find(item=>item.id==='research'),current=read(artifact.path,job.draftRoot);
  if(hash(current)!==artifact.hash)fail('creation_research_context_changed');
  const data=contractData(job.contract.path,{root:options.root});
  const updated=applyExternalResearchEvidence(current,data,input,{topics:research.topics,
   evaluateOverallGate:text=>researchGateDecisionForReport(data,text,{stateRoot:options.stateRoot,artifactRoots:[job.draftRoot]})});
  if(updated.evidence.invalidCount || !updated.synthesis.complete || !updated.coverage.complete)fail('creation_research_selection_invalid',
   `Сводка источников неполна: ${[...updated.coverage.missingTopicIds,...updated.synthesis.errors].join(', ')}. Проверенные страницы сохранены.`);
  // Journal the exact output first, then publish with CAS; recovery can finish without a new model call.
  state.publication={path:artifact.path,previousHash:hash(current),text:updated.text,hash:hash(updated.text),turnId:options.turnId};
  atomicWriteFile(file,JSON.stringify(state));
  atomicCompareAndSwapFile(artifact.path,current,updated.text);
  state.completedTurn=options.turnId;atomicWriteFile(file,JSON.stringify(state));
 }
 );
}
