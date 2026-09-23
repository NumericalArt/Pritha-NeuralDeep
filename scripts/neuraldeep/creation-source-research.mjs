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
function legacySourceExcerpt(text,query,maxBytes=2400) {
 const paragraphs=String(text).split(/\n+/).filter(line=>line.trim().length>35);
 const words=[...new Set(query.toLowerCase().match(/[a-z]{4,}/g)||[])];
 const ranked=paragraphs.map((line,index)=>({line,index,score:words.reduce((n,word)=>n+Number(line.toLowerCase().includes(word)),0)})).sort((a,b)=>b.score-a.score || a.index-b.index);
 let excerpt='';for(const {line} of ranked){if(Buffer.byteLength(excerpt+'\n'+line)<=maxBytes)excerpt+=(excerpt?'\n':'')+line;}
 return excerpt;
}
// Read providers sometimes return an entire page as one line. Split at Unicode
// code points, retain exact source substrings, and rank bounded passages instead
// of dropping that page or cutting a UTF-8 character in half.
export function sourceExcerpt(text,query,maxBytes=2400) {
 if(!Number.isSafeInteger(maxBytes) || maxBytes<4)return '';
 const passages=[],limit=Math.min(1000,maxBytes);
 for(const line of String(text).split(/\n+/)) {
  let part='',bytes=0;
  for(const character of line) {
   const size=Buffer.byteLength(character);
   if(bytes+size>limit){passages.push(part);part='';bytes=0;}
   part+=character;bytes+=size;
  }
  if(part)passages.push(part);
 }
 const words=[...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[])];
 const ranked=passages.filter(line=>line.trim().length>35).map((line,index)=>({line,index,
  score:words.reduce((n,word)=>n+Number(line.toLowerCase().includes(word)),0)}))
  .sort((a,b)=>b.score-a.score || a.index-b.index);
 const chosen=[];let bytes=0;
 for(const item of ranked) {
  const size=Buffer.byteLength(item.line)+(chosen.length?1:0);
  if(bytes+size<=maxBytes){chosen.push(item);bytes+=size;}
 }
 return chosen.sort((a,b)=>a.index-b.index).map(item=>item.line).join('\n');
}
function nextPrimarySource(topic,item,found) {
 const tried=new Set((item.history||[]).map(attempt=>attempt.url).filter(Boolean));
 const valid=source=>allowed(source.url,topic.primaryDomains) && !tried.has(source.url);
 const curated=(topic.primaryUrls||[]).map(url=>({url})).find(valid);
 if(curated)return curated;
 if(!found)return null;
 const generic=new Set(['current','official','documentation','docs','selected','agent','requires','declared','primary']);
 const terms=[...new Set(topic.query.toLowerCase().match(/[a-z]{4,}/g)||[])].filter(term=>!generic.has(term));
 return (found.sources||[]).filter(valid).map((source,index)=>({source,index,
  score:terms.reduce((n,term)=>n+Number(`${source.url} ${source.title||''} ${source.snippet||''}`.toLowerCase().includes(term)),0)}))
  .filter(candidate=>candidate.score>0).sort((a,b)=>b.score-a.score || a.index-b.index)[0]?.source || null;
}
// A ranked excerpt can join nonadjacent lines. Never ask a model to copy that
// joined text as one source quotation. Bind each exact passage independently.
export function sourcePassages(source) {
 const seen=new Set(),passages=[];
 for(const quote of source.excerpt.split('\n')) {
  if(quote.length<40 || quote.length>1200 || seen.has(quote) || !source.text.includes(quote))continue;
  seen.add(quote);passages.push({id:hash({sourceId:source.id,contentHash:source.contentHash,quote}).slice(0,24),quote});
  if(passages.length===8)break;
 }
 return passages;
}
export function readCreationSources(job,options) {
 const {state}=load(job,options);
 for(const source of state.sources)if(hash(source.text)!==source.contentHash || !Number.isFinite(Date.parse(source.retrievedAt)) || Date.now()-Date.parse(source.retrievedAt)>30*86400000 || Date.parse(source.retrievedAt)-Date.now()>300000)fail('creation_research_source_stale');
 return state.sources.map(({text,...source})=>{
  if(job.researchSelectionVersion!==2)return source;
  const {excerpt,...metadata}=source;
  const passages=sourcePassages({...source,text});
  if(!passages.length)fail('creation_research_source_unavailable','В сохранённом источнике нет цельной проверяемой выдержки. Запрос модели не отправлен.');
  return {...metadata,passages};
 });
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

/** Durable primary Read (or Search -> Read). Replays retain every attempted URL and quota. */
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
    const modern=job.researchTopicPolicyVersion===3;
    const context={owner:job.jobId,turn:`${job.generation||1}:${topic.id}`,surface:'research',explicit:true,signal:options.signal};
    while(item.attempts<2 && item.status!=='completed') {
    if(options.signal?.aborted)fail('creation_paused');
    item.attempts++;item.status='started';
    const attempt={number:item.attempts,status:'started',searchCalls:0,readCalls:0};
    if(modern)(item.history ||= []).push(attempt);
    save();
    try {
     let candidate=modern?nextPrimarySource(topic,item):null;
     if(!candidate) {
     attempt.searchCalls++;save();
     const found=await service.search({query:topic.query,domains:topic.primaryDomains,max_results:3,freshness:'current'},context);
     item.searchReceipt={id:found.id,status:found.status,error:found.error};attempt.searchReceipt=item.searchReceipt;save();
     if(!found.ok)throw Object.assign(new Error('search failed'),{code:found.error?.code||'search_unavailable'});
     candidate=modern?nextPrimarySource(topic,item,found):found.sources.find(source=>allowed(source.url,topic.primaryDomains));
     }
     if(!candidate)throw Object.assign(new Error('primary source missing'),{code:'primary_source_missing'});
     attempt.url=candidate.url;attempt.readCalls++;save();
     const page=await service.readPage({url:candidate.url,max_chars:16000},context);
     item.readReceipt={id:page.id,status:page.status,error:page.error};attempt.readReceipt=item.readReceipt;save();
     if(!page.ok)throw Object.assign(new Error('read failed'),{code:page.error?.code||'read_unavailable'});
     const source=page.sources.find(source=>source.read===true && source.text && allowed(source.url,topic.primaryDomains));
     if(!source)throw Object.assign(new Error('a snippet is not evidence'),{code:'primary_page_not_read'});
     const excerpt=(modern?sourceExcerpt:legacySourceExcerpt)(source.text,topic.query);
     if(Buffer.byteLength(excerpt)<80)throw Object.assign(new Error('page has no usable excerpt'),{code:'primary_page_empty'});
     const contentHash=hash(source.text);
     state.sources.push({id:hash([topic.id,source.url,contentHash]).slice(0,24),topicId:topic.id,url:source.url,title:source.title,
      retrievedAt:source.retrieved_at,publishedAt:source.published_at||'unknown',contentHash,text:source.text,excerpt,untrusted:true});
     item.status='completed';attempt.status='completed';item.error=null;save();
    } catch(error) {item.status='failed';item.error=error.code||'source_unavailable';attempt.status='failed';attempt.error=item.error;save();
     if(options.signal?.aborted)fail('creation_paused');
     // Only a confirmed unusable page can advance automatically to a different
     // source. Credential/quota/uncertain transport failures require a decision.
     if(modern && item.attempts<2 && ['primary_page_empty','primary_page_not_read','primary_source_missing'].includes(item.error))continue;
     const exhausted=item.attempts>=2;
     fail(modern && exhausted?'creation_research_source_limit':'creation_research_source_unavailable',
      `Источник для «${topic.topic}» недоступен (${item.error}). Уже полученные страницы сохранены; ${exhausted?'обе попытки исчерпаны. Уточните требование или источник.':'доступна одна ограниченная повторная попытка.'}`);}
    }
   }
   return readCreationSources(job,options);
  } finally {if(!options.search)service.store.close();}
 });
}

export function validateResearchSelection(value,sources,topics,selectionVersion=1) {
 if(!value || !Array.isArray(value.facts) || value.facts.length>24)fail('creation_research_selection_invalid');
 const items=value.facts.map(fact=>{
  const source=sources.find(source=>source.id===fact.sourceId && source.topicId===fact.topicId);
  const passage=selectionVersion===2?source?.passages?.find(item=>item.id===fact.passageId):null;
  const quote=selectionVersion===2?passage?.quote:fact.quote;
  if(!source || !topics.some(topic=>topic.id===fact.topicId && topic.required!==false) || typeof quote!=='string'
    || quote.length<40 || quote.length>1200 || (selectionVersion===2?Object.hasOwn(fact,'quote'):!source.excerpt.includes(quote))
    || (source.text && !source.text.includes(quote)))fail('creation_research_quote_unbound',selectionVersion===2
      ? 'Идентификатор выдержки не принадлежит выбранному источнику и теме. Выберите passageId из списка этой страницы; не присылайте поле quote.'
      : 'Выдержка не совпала с прочитанным первичным источником. Работа сохранена.');
  return {topic_id:source.topicId,source_url:source.url,source_title:source.title,source_type:'official-docs',source_published:source.publishedAt,
   retrieved_at:source.retrievedAt,claim:quote,evidence_summary:quote,confidence:'medium',
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
  const sources=readCreationSources(job,options).map(source=>({...source,text:state.sources.find(item=>item.id===source.id).text}));
  const input=validateResearchSelection(value,sources,research.topics,job.researchSelectionVersion||1);
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
