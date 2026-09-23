import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sourceExcerpt,sourcePassages,collectCreationSources,validateResearchSelection} from '../scripts/neuraldeep/creation-source-research.mjs';
import {deriveExternalResearchTopics} from '../scripts/agents-mother/external-research-topics.mjs';

const text='The HTTP server receives explicit requests and preserves successful local records. External content must be encoded before inserting it into HTML. Errors must leave the previous successful result intact.';
function fixture(t,version=3) {
 const stateRoot=mkdtempSync(path.join(os.tmpdir(),'creation-source-policy-'));
 t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
 const job={jobId:'creation_source_fixture',instanceId:'test',generation:1,researchProtocolVersion:2,
  researchTopicPolicyVersion:version,releaseSha:'a'.repeat(40),contract:{hash:'contract'},outcome:{hash:'outcome'}};
 const topic={id:'interface-runtime-security',topic:'HTML output encoding',query:'HTML external content output encoding scripting prevention',required:true,
  primaryDomains:['owasp.org','developer.mozilla.org'],primaryUrls:['https://owasp.org/encoding','https://owasp.org/prevention']};
 const research={topics:[topic],checked:[]};
 const options={root:process.cwd(),stateRoot};
 const file=path.join(stateRoot,'audit/creation-preparation',job.jobId,'generation-1/sources.json');
 return {job,research,topic,options,file,state:()=>JSON.parse(readFileSync(file,'utf8'))};
}
const page=(url,value=text)=>({ok:true,status:'ok',sources:[{url,read:true,text:value,title:'Primary page',retrieved_at:new Date().toISOString()}]});

test('one-line pages retain relevant bounded passages and exact Unicode substrings',()=>{
 const raw='Нерелевантное вступление 🌍 '.repeat(300)+text.repeat(20);
 const excerpt=sourceExcerpt(raw,'HTTP HTML output encoding');
 assert.ok(Buffer.byteLength(excerpt)<=2400);
 assert.ok(excerpt.includes('HTTP'));
 assert.ok(!excerpt.includes('\uFFFD'));
 for(const part of excerpt.split('\n'))assert.ok(raw.includes(part));
 assert.equal(sourceExcerpt(' '.repeat(16000),'HTML'),'');
 assert.equal(sourceExcerpt(raw,'HTTP',0),'');
 const unicode=sourceExcerpt('Данные 🌍 без потери символов. '.repeat(200),'Данные',199);
 assert.ok(Buffer.byteLength(unicode)<=199);assert.ok(!unicode.includes('\uFFFD'));
});

test('v3 reads a curated primary page without search and replay makes no network calls',async t=>{
 const f=fixture(t),urls=[];
 const search={search:async()=>assert.fail('curated source should not search'),readPage:async ({url})=>{urls.push(url);return page(url,text.repeat(100));}};
 const sources=await collectCreationSources(f.job,f.research,{...f.options,search});
 assert.equal(sources.length,1);assert.ok(sources[0].excerpt.includes('HTTP'));
 await collectCreationSources(f.job,f.research,{...f.options,search});
 assert.deepEqual(urls,[f.topic.primaryUrls[0]]);
 const state=f.state().topics[f.topic.id];assert.equal(state.attempts,1);
 assert.deepEqual([state.history[0].searchCalls,state.history[0].readCalls],[0,1]);
});

test('a confirmed empty page advances once to another primary URL in the same operation',async t=>{
 const f=fixture(t),urls=[];
 const search={search:async()=>assert.fail(),readPage:async ({url})=>{urls.push(url);return page(url,urls.length===1?'':text);}};
 const sources=await collectCreationSources(f.job,f.research,{...f.options,search});
 assert.equal(sources[0].url,f.topic.primaryUrls[1]);assert.deepEqual(urls,f.topic.primaryUrls);
 const item=f.state().topics[f.topic.id];assert.equal(item.attempts,2);
 assert.deepEqual(item.history.map(x=>x.status),['failed','completed']);
});

test('two unusable pages exhaust the original quota across reload without offering another retry',async t=>{
 const f=fixture(t);let reads=0;
 const search={search:async()=>assert.fail(),readPage:async ({url})=>{reads++;return page(url,'');}};
 await assert.rejects(collectCreationSources(f.job,f.research,{...f.options,search}),error=>{
  assert.equal(error.code,'creation_research_source_limit');assert.match(error.message,/обе попытки исчерпаны/);
  assert.doesNotMatch(error.message,/доступна одна/);return true;
 });
 await assert.rejects(collectCreationSources(f.job,f.research,{...f.options,search}),{code:'creation_research_source_limit'});
 assert.equal(reads,2);assert.equal(f.state().topics[f.topic.id].attempts,2);
});

test('source acquisition interrupted after dispatch stays unconfirmed and never repeats',async t=>{
 const f=fixture(t);let reads=0;
 const search={search:async()=>assert.fail(),readPage:async ({url})=>{reads++;return page(url);}};
 await collectCreationSources(f.job,f.research,{...f.options,search});
 const state=f.state();state.sources=[];state.topics[f.topic.id].status='started';
 writeFileSync(f.file,JSON.stringify(state));
 await assert.rejects(collectCreationSources(f.job,f.research,{...f.options,search}),{code:'creation_research_source_unconfirmed'});
 assert.equal(reads,1);
});

test('provider or credential failure does not trigger a hidden retry; explicit recovery chooses the next URL',async t=>{
 const f=fixture(t),urls=[];
 const search={search:async()=>assert.fail(),readPage:async ({url})=>{
  urls.push(url);return urls.length===1?{ok:false,status:'failed',error:{code:'credentials_missing'}}:page(url);
 }};
 await assert.rejects(collectCreationSources(f.job,f.research,{...f.options,search}),{code:'creation_research_source_unavailable'});
 assert.equal(urls.length,1);
 await collectCreationSources(f.job,f.research,{...f.options,search});assert.deepEqual(urls,f.topic.primaryUrls);
});

test('cancellation preserves one attempted page and does not start the alternative',async t=>{
 const f=fixture(t),controller=new AbortController();let reads=0;
 const search={search:async()=>assert.fail(),readPage:async ({url})=>{reads++;controller.abort();return page(url,'');}};
 await assert.rejects(collectCreationSources(f.job,f.research,{...f.options,search,signal:controller.signal}),{code:'creation_paused'});
 assert.equal(reads,1);assert.equal(f.state().topics[f.topic.id].attempts,1);
});

test('fallback search rejects irrelevant first-domain results and disallowed authorities',async t=>{
 const f=fixture(t);f.topic.primaryUrls=[];const urls=[];let searches=0;
 const search={search:async()=>{searches++;return {ok:true,sources:[
  {url:'https://developer.mozilla.org/docs/Web/API/User-Agent_Client_Hints_API',title:'User Agent Client Hints'},
  {url:'https://owasp.org.attacker.test/HTML-output-encoding',title:'HTML output encoding'},
  {url:'https://owasp.org/encoding',title:'HTML output encoding prevention'}]};},
  readPage:async ({url})=>{urls.push(url);return page(url);}};
 await collectCreationSources(f.job,f.research,{...f.options,search});
 assert.equal(searches,1);assert.deepEqual(urls,['https://owasp.org/encoding']);
});

test('fallback after an unusable curated page skips the already attempted URL',async t=>{
 const f=fixture(t);f.topic.primaryUrls=f.topic.primaryUrls.slice(0,1);const urls=[];let searches=0;
 const search={search:async()=>{searches++;return {ok:true,sources:[
  {url:f.topic.primaryUrls[0],title:'HTML output encoding'}, {url:'https://owasp.org/alternative',title:'HTML output encoding'}]};},
  readPage:async ({url})=>{urls.push(url);return page(url,urls.length===1?'':text);}};
 await collectCreationSources(f.job,f.research,{...f.options,search});
 assert.equal(searches,1);assert.deepEqual(urls,[f.topic.primaryUrls[0],'https://owasp.org/alternative']);
});

test('saved v2 topic policy retains Search then Read and the original excerpt semantics',async t=>{
 const f=fixture(t,2);let searches=0,reads=0;
 const search={search:async()=>{searches++;return {ok:true,sources:[{url:'https://owasp.org/original'}]};},
  readPage:async ({url})=>{reads++;return page(url,text.repeat(100));}};
 for(let i=0;i<2;i++)await assert.rejects(collectCreationSources(f.job,f.research,{...f.options,search}),{code:'creation_research_source_unavailable'});
 assert.equal(searches,2);assert.equal(reads,2);assert.equal(f.state().sources.length,0);
});

test('an invented quotation joining nonadjacent source passages is not accepted',()=>{
 const one='External content must be encoded before inserting it into HTML.';
 const two='Errors must preserve previous successful records for the operator.';
 const source={id:'s',topicId:'security',url:'https://owasp.org/docs',text:one+' omitted material '+two,excerpt:one+'\n'+two};
 assert.throws(()=>validateResearchSelection({facts:[{sourceId:'s',topicId:'security',quote:source.excerpt}]},[source],[{id:'security'}]),{code:'creation_research_quote_unbound'});
});

test('passage selection restores exact source text without copying a stitched excerpt',()=>{
 const one='External content must be encoded before inserting it into HTML.';
 const two='Errors must preserve previous successful records for the operator.';
 const source={id:'s',topicId:'security',contentHash:'a'.repeat(64),url:'https://owasp.org/docs',text:one+' omitted material '+two,excerpt:one+'\n'+two};
 source.passages=sourcePassages(source);
 assert.equal(source.passages.length,2);assert.deepEqual(sourcePassages(source),source.passages);
 const fact={sourceId:'s',topicId:'security',passageId:source.passages[1].id};
 const result=validateResearchSelection({facts:[fact]},[source],[{id:'security'}],2);
 assert.equal(result.items[0].claim,two);assert.ok(source.text.includes(result.items[0].claim));
 for(const invalid of [{...fact,passageId:'invented'},{...fact,sourceId:'other'},{...fact,topicId:'other'},{...fact,quote:source.excerpt}])
  assert.throws(()=>validateResearchSelection({facts:[invalid]},[source],[{id:'security'}],2),{code:'creation_research_quote_unbound'});
 const other={...source,id:'other'};assert.notEqual(sourcePassages(other)[1].id,fact.passageId);
 assert.throws(()=>validateResearchSelection({facts:[{...fact,sourceId:'other'}]},[{...other,passages:sourcePassages(other)}],[{id:'security'}],2),{code:'creation_research_quote_unbound'});
});

test('new source packets contain bounded separate passages and old packets retain their excerpt',async t=>{
 const f=fixture(t),raw=(text+'\n').repeat(30);
 const options={...f.options,search:{readPage:async ({url})=>page(url,raw),search:async()=>assert.fail()}};
 const legacy=await collectCreationSources(f.job,f.research,options);assert.ok(legacy[0].excerpt);
 const modern=await collectCreationSources({...f.job,researchSelectionVersion:2},f.research,options);
 assert.equal(modern[0].excerpt,undefined);assert.equal(modern[0].text,undefined);
 assert.ok(modern[0].passages.length>0 && modern[0].passages.length<=8);
 for(const passage of modern[0].passages)assert.ok(raw.includes(passage.quote));
 assert.ok(Buffer.byteLength(JSON.stringify(modern))<4000);
});

test('v3 ignores dependency placeholders and Russian negations while v2 remains reproducible',()=>{
 const data={runtimeFamily:'codex-native',primaryInterface:'web UI',dependencies:'minimal until scaffold profile is selected',
  secondaryInterfaces:'без Voice; нет Telegram; no OpenAI; no RAG',coreFunctions:['Use Node.js HTTP and Wikipedia search.']};
 const v3=deriveExternalResearchTopics({...data,fm:{research_topic_policy:3}});
 const ids=v3.filter(t=>t.required).map(t=>t.id);
 for(const id of ['node-http-runtime','wikipedia-api','interface-runtime-security'])assert.ok(ids.includes(id));
 assert.doesNotMatch(ids.join(','),/declared-dependencies|voice|telegram|realtime|memory-rag/);
 assert.ok(v3.find(t=>t.id==='wikipedia-api').primaryUrls[0].endsWith('API:Search'));
 const v2=deriveExternalResearchTopics({...data,fm:{research_topic_policy:2}});
 assert.ok(v2.some(t=>t.id==='declared-dependencies'));
 assert.ok(v2.every(t=>!Object.hasOwn(t,'primaryUrls')));
});

test('new manual process evidence does not invent launchd; real voice and dependencies stay required',()=>{
 const topics=deriveExternalResearchTopics({fm:{research_topic_policy:3},runtimeFamily:'api',primaryInterface:'web realtime voice',
  serviceMode:'process',autostart:'disabled',proactiveMode:'manual',dependencies:'SQLite; OpenAI gpt-realtime'});
 for(const id of ['declared-dependencies','sqlite-storage','openai-realtime'])assert.ok(topics.some(t=>t.id===id));
 const operations=topics.find(t=>t.id==='operations-deployment');assert.doesNotMatch(operations.query,/launchd|cron/);
 assert.ok(operations.primaryUrls[0].endsWith('/api/process.md'));
});
