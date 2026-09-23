import {deriveExternalResearchTopics as legacyTopics} from './external-research-topics-v1.mjs';
export {GENERIC_PROCESS_RESEARCH_TOPIC_IDS} from './external-research-topics-v1.mjs';

// Version 1 remains available for already approved contracts and locked reports.
// Only selected fields participate; examples, host capabilities and non-goals do not.
const fields=['runtimeFamily','primaryInterface','secondaryInterfaces','telegramMode','serviceMode','autostart','proactiveMode','memoryModel','indexingSearchNeeds','toolSystem','inputDataTypes','dependencies','allowedNetworkAccess','providerBinding','productDataSources','coreFunctions','criticalWorkflows'];
export function positiveCapabilityText(value) {
  return (Array.isArray(value)?value:[value]).flatMap(item=>String(item||'').split(/[;\n]+|,(?![^()]*\))/))
    .map(clause=>clause.trim()).filter(clause=>clause && !/^(?:none|no\b|without\b|not[- ]applicable|disabled|нет\b|без\b|не\s|отсутствует)/i.test(clause)
      && !/(?:\b(?:not required|not needed|out of scope|disabled|deferred)|не (?:нуж|требу|использ|предусмотр)|отключен)/i.test(clause)).join('\n');
}
const authority={
 'node-http-runtime':['nodejs.org'], 'neuraldeep-model-api':['neuraldeep.ru','docs.neuraldeep.ru'],
 'openai-agents-sdk':['openai.github.io','platform.openai.com','developers.openai.com'],
 'openai-realtime':['platform.openai.com','developers.openai.com'], 'voice-transport':['developer.mozilla.org','w3.org'],
 'telegram-bot-api':['core.telegram.org'], 'mcp-connectors':['modelcontextprotocol.io'],
 'interface-runtime-security':['developer.mozilla.org','owasp.org'], 'untrusted-input-security':['owasp.org'],
 'operations-deployment':['nodejs.org','developer.apple.com','freedesktop.org'],
 'wikipedia-api':['mediawiki.org','www.mediawiki.org','api.wikimedia.org','doc.wikimedia.org'],
 'sqlite-storage':['sqlite.org','www.sqlite.org','nodejs.org'],
 'declared-dependencies':['nodejs.org','npmjs.com','docs.npmjs.com','nextjs.org','react.dev','sqlite.org'],
 'github-repository-review':['github.com'], 'local-inference-runtime':['docs.ollama.com','docs.vllm.ai','lmstudio.ai'],
 'memory-rag-storage':['qdrant.tech','docs.lancedb.com','neo4j.com'],
};
export function deriveExternalResearchTopics(data={},options={}) {
 if(Number(data.fm?.research_topic_policy || options.topicPolicyVersion)!==2)return legacyTopics(data,options);
 const selected=Object.fromEntries(fields.map(key=>[key,positiveCapabilityText(data[key])]));
 // Legacy extractor expects arrays for these two fields.
 selected.coreFunctions=[selected.coreFunctions];selected.criticalWorkflows=[selected.criticalWorkflows];
 for(const [key,value] of Object.entries({telegramMode:'none',serviceMode:'none',autostart:'disabled',proactiveMode:'none'}))selected[key] ||=value;
 const text=fields.map(key=>positiveCapabilityText(data[key])).join('\n');
 const topics=legacyTopics({...selected,fm:data.fm,repositoryAdoptionMode:data.repositoryAdoptionMode,selectedGitHubRepositories:data.selectedGitHubRepositories},{})
  .filter(topic=>topic.id!=='openai-agents-sdk' || /\b(?:openai agents sdk|agents sdk)\b/i.test(text));
 const add=(id,topic,query,reason)=>{if(!topics.some(item=>item.id===id))topics.push({id,topic,query,reason,required:true,preferredSources:['official-docs'],freshnessWindowDays:30});};
 if(/wikipedia|wikimedia|mediawiki|википеди/i.test(text))add('wikipedia-api','Wikipedia API, source URLs and usage limits','MediaWiki REST API Wikipedia search page content rate limits documentation','Product data sources explicitly select Wikipedia.');
 if(/\bsqlite\b/i.test(text))add('sqlite-storage','Selected SQLite storage and persistence','SQLite transactions persistence Node.js sqlite documentation','The selected storage or dependency requires SQLite.');
 for(const topic of topics)if(topic.id==='openai-realtime' && !/\b(?:openai|gpt-realtime)\b/i.test(text)) {
  topic.id='voice-transport';topic.topic='Selected browser audio and WebRTC transport';topic.query='WebRTC microphone permission audio browser official documentation';
 }
 const required=topics.map(topic=>({...topic,topic_id:topic.id,status:'required',required_by:{kind:'selected_capability',fields:fields.filter(key=>positiveCapabilityText(data[key]))},
   applicability_reason:topic.reason,evidence_needed:topic.topic,source_preference:'primary page read; search snippet alone is insufficient',freshness_rule:'retrieved within 30 days plus source date or explicit version compatibility',primaryDomains:authority[topic.id]||[]}));
 // Memory seeds never become requirements without a selected child capability.
 const seeds=legacyTopics({},options).filter(topic=>topic.id.startsWith('pattern-'));
 return [...required,...seeds.map(topic=>({...topic,required:false,status:'advisory',topic_id:topic.id,required_by:null,
  applicability_reason:'Memory suggestion only; no independently selected child capability requires this topic.',evidence_needed:null,source_preference:'official-docs',freshness_rule:'check only if adopted'}))];
}
export function externalResearchRequired(data={},options={}) {return deriveExternalResearchTopics(data,options).some(topic=>topic.required);}
