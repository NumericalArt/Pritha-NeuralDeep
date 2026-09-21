import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';

// Opt-in acceptance: stock CLI executes real tools against a local Responses fixture.
// No provider credentials, user state, real child agents or paid endpoints are used.
if(!process.argv.includes('--synthetic'))throw Error('synthetic_required');
const reportIndex=process.argv.indexOf('--report');
if(reportIndex>=0 && (!process.argv[reportIndex+1] || process.argv[reportIndex+1].startsWith('--')))throw Error('report_path_required');
const reportPath=reportIndex>=0?path.resolve(process.argv[reportIndex+1]):null;
const briefToolViolation=process.argv.includes('--brief-tool-violation');
const signalDeskPreparation=process.argv.includes('--signal-desk-preparation');
const root=realpathSync(fileURLToPath(new URL('../..',import.meta.url))),load=relative=>import(pathToFileURL(path.join(root,relative)));
process.chdir(root);
const {NeuralDeepCoordinationStore,neuralDeepCoordinationPaths}=await load('scripts/neuraldeep/coordination-store.mjs');
const {AgentCreationStore}=await load('scripts/neuraldeep/agent-creation-store.mjs');
const {NeuralDeepExecutionWorkspaces}=await load('scripts/neuraldeep/execution-workspaces.mjs');
const {executionResourceClaims}=await load('scripts/neuraldeep/execution-resources.mjs');
const {creationDraftRoot,reconcileCreationArtifacts,approveCreationDocument,creationPrompt,creationHostStep}=await load('scripts/neuraldeep/agent-creation.mjs');
const {completeCreationBrief,prepareCreationOutcome}=await load('scripts/neuraldeep/creation-preparation.mjs');
const {reviseCreationProposal}=await load('scripts/neuraldeep/creation-revision.mjs');
const {prepareCreationContextPacket,readCreationContextPacket}=await load('scripts/neuraldeep/creation-context-packet.mjs');
const {prepareCreationResearch,readCreationResearch}=await load('scripts/neuraldeep/creation-research-context.mjs');
const {settleCreationPreparation}=await load('scripts/neuraldeep/creation-preparation-control.mjs');
const {creationRuntimeReceipt}=await load('scripts/neuraldeep/creation-runtime-receipt.mjs');
const {creationPreparationUsage}=await load('scripts/neuraldeep/creation-preparation-policy.mjs');
const {runCreationDelivery}=await load('scripts/neuraldeep/creation-delivery.mjs');
const {FunctionBuildExecutor}=await load('scripts/agents-mother/build-executors.mjs');
const {markdownDocumentLock}=await load('scripts/lib/markdown-content-lock.mjs');
const {neuralDeepRuntimeConfig,runCodexWithNeuralDeep,buildCodexExecArgs}=await load('scripts/neuraldeep-codex.mjs');
const {NeuralDeepChatHistoryStore}=await load('scripts/neuraldeep/chat-history-store.mjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const base=realpathSync(mkdtempSync(path.join(os.tmpdir(),'pritha-stock-creation-'))),stateRoot=path.join(base,'state'),home=path.join(base,'native'),agentParent=path.join(base,'children');
for(const directory of [stateRoot,home,agentParent])mkdirSync(directory,{recursive:true});
Object.assign(process.env,{TECHSCOPE_ROOT:root,PRITHA_STATE_ROOT:stateRoot,PRITHA_AGENT_PARENT:agentParent,
  PRITHA_NEURALDEEP_CODEX_HOME:home,PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'pritha-creation-fixture-unused',
  PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:'https://neuraldeep.invalid',ND_CREATION_FIXTURE_TOKEN:'synthetic-unused-key'});
delete process.env.PRITHA_AGENT_AUTHORING_ROOT;delete process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT;
writeFileSync(path.join(home,'config.toml'),`model = "fixture-model"\nmodel_provider = "neuraldeep"\napproval_policy = "never"\ncheck_for_update_on_startup = false\n[model_providers.neuraldeep]\nname = "Local creation acceptance"\nbase_url = "http://127.0.0.1:1/v1"\nwire_api = "responses"\nenv_key = "ND_CREATION_FIXTURE_TOKEN"\nrequest_max_retries = 0\nstream_max_retries = 0\n`);
const runtime=neuralDeepRuntimeConfig(process.env),store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(stateRoot,root)),jobs=new AgentCreationStore(store);
const chatId='chat_stockcreation',instanceId='stock-creation-fixture',draftRoot=creationDraftRoot(stateRoot,instanceId,chatId),target=path.join(agentParent,'stock-fixture');
mkdirSync(draftRoot,{recursive:true});mkdirSync(target);
let job=jobs.create({chatId,instanceId,agentId:'stock-fixture',target,draftRoot,releaseSha:sha,preparationPolicyVersion:2,briefProtocolVersion:1,researchProtocolVersion:1});
const workspace=await new NeuralDeepExecutionWorkspaces(store,{stateRoot}).prepare({ownerId:chatId,sourcePath:root,mutating:true,expectedCommit:sha,requireClean:true});
const options={root,stateRoot,sourceRoot:workspace.cwd,sourceRevision:sha,agentParent,model:'fixture-model',effort:null};
const history=new NeuralDeepChatHistoryStore({databasePath:path.join(stateRoot,'history.sqlite'),instanceScope:instanceId});
history.put({chatId,clientThreadId:'client_stock_creation',creationWorkflowVersion:1,origin:'chat',providerId:'neuraldeep_cli',modelId:'fixture-model',
  effortId:null,nativeThreadId:null,stateIdentityHash:instanceId,workspacePath:root,messageReceipts:{},turns:[],taskLinks:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),archived:false});
const brief={identity:{name:'Stock CLI creation fixture',slug:'stock-fixture'},goal:'Refresh a public JSON feed and retain valid local records',user:'Local operator',
  successCriteria:['Actual source records persist exactly once, failed refresh preserves the last successful result'],coreFunctions:['Refresh the selected feed'],
  workflows:['Open the local app, refresh manually and inspect records'],sources:['https://example.test/feed'],constraints:['No schedules and no copied credentials'],nonGoals:['External deployment'],
  permissions:{network:['Declared public feed'],filesystem:['Own target only'],authorization:'Manual local operator actions'},
  technical:{preset:'local-feed',sourceFormat:'json'}};
let product='Create a local feed reader. Refresh manually, preserve source records without duplicates, retain the last successful data on errors. No schedules, no copied credentials.';
if(signalDeskPreparation){
  Object.assign(brief,structuredClone((await load('tests/fixtures/signal-desk-brief.mjs')).signalDeskBrief));brief.identity.slug='stock-fixture';
  product=[brief.goal,brief.user,...brief.successCriteria,...brief.coreFunctions,...brief.workflows,...brief.sources,...brief.constraints,...brief.nonGoals,...brief.permissions.network,...brief.permissions.filesystem,brief.permissions.authorization].join('\n');
}
let mode='brief',modeRequests=0,requests=[],turnNumber=0,lastSession=null,builds=0,currentResearch=null;
const sessions=[];
function evidence(topics){const now=new Date().toISOString();return {backend:'manual',items:topics.map(topic=>({topic_id:topic.id,source_url:`https://example.test/official/${topic.id}`,source_type:'official-docs',source_updated:now,retrieved_at:now,
  claim:'Controlled primary fixture confirms the declared local runtime and bounded feed request contract.',confidence:'high'})),
  synthesis:{relationship:'confirms',memory_comparison:'The controlled source confirms bounded local execution and preservation of prior records.',summary:'Keep the local deterministic feed design.',architecture_decision:'Use explicit manual refresh and atomic local persistence.',alternatives:['Defer implementation'],tradeoffs:['Verification effort']}};}
function importCommand(topics,outputBytes=0) {
  const file=path.join(draftRoot,'evidence.json'),script=`require('node:fs').writeFileSync(${JSON.stringify(file)},${JSON.stringify(JSON.stringify(evidence(topics)))})`;
  let command=`${quote(process.execPath)} -e ${quote(script)} && ${quote(process.execPath)} ${quote(path.join(workspace.cwd,'scripts/pritha.mjs'))} external-research ${quote(job.contract.path)} --backend manual --input ${quote(file)}`;
  if(outputBytes)command+=` && ${quote(process.execPath)} -e ${quote(`process.stdout.write('OLD_LARGE_OUTPUT_'.repeat(${Math.ceil(outputBytes/17)}))`)}`;
  return command;
}
const implementation=`import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import path from 'node:path';
try {
 const response=await fetch(process.env.PRITHA_SOURCE_URL,{signal:AbortSignal.timeout(3000)});
 if(!response.ok)throw Error('Source unavailable');
 const data=await response.json();
 if(!Array.isArray(data.items)||data.items.some(x=>typeof x.id!=='string'||typeof x.title!=='string'||typeof x.url!=='string'))throw Error('Invalid source');
 const items=[...new Map(data.items.map(x=>[x.id,x])).values()];
 const directory=process.env.PRITHA_DATA_DIR;mkdirSync(directory,{recursive:true});
 const temporary=path.join(directory,'latest.tmp');writeFileSync(temporary,JSON.stringify({items}));renameSync(temporary,path.join(directory,'latest.json'));
} catch(error){console.error(error.message);process.exitCode=1;}
`;
globalThis.fetch=async(url,init)=>{
  assert.equal(new URL(url).hostname,'neuraldeep.invalid','Only the local provider imitation is allowed');
  if(new URL(url).pathname!=='/v1/responses')return Response.json({});
  const payload=JSON.parse(Buffer.from(init.body||'{}').toString()),bytes=Buffer.byteLength(JSON.stringify(payload));modeRequests++;
  const input=JSON.stringify(payload.input);requests.push({mode,bytes,outputLimit:payload.max_output_tokens});
  if(mode.startsWith('research'))assert.ok(bytes<96*1024);
  if(mode==='research-resumed'&&modeRequests===1){assert.ok(!input.includes('OLD_LARGE_OUTPUT_'));assert.ok(input.includes('Controlled primary fixture'));}
  let answer='Completed the controlled work.',command;
  if(mode==='brief'||mode==='brief-revised') {
    const proposed=structuredClone(brief);
    if(mode==='brief-revised') {
      const packet=JSON.parse(payload.input[0].content[0].text);
      assert.equal(packet.proposalRevision?.instruction,job.revisionInstruction,'the actual provider request contains the exact operator revision');
      assert.equal(packet.proposalRevision?.requestId,job.revisionRequestId);
      proposed.constraints.push(packet.proposalRevision.instruction);
    }
    answer='```pritha-brief-json\n'+JSON.stringify(proposed)+'\n```';
  }
  if(mode.startsWith('brief')) {
    assert.equal(payload.tool_choice,'none');assert.deepEqual(payload.tools,[]);
    assert.ok(bytes<16*1024,'brief contains exact product context, not the coding executor');
    const packet=JSON.parse(payload.input[0].content[0].text);
    const strings=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
    assert.ok(strings(packet.dialogue).includes(product),'exact original multiline product request is preserved');
    if(mode==='brief-invalid')answer='Preparing the brief now.';
    if(briefToolViolation)command=`${quote(process.execPath)} -e ${quote("require('node:fs').writeFileSync('tool-must-not-run','unexpected')")}`;
  }
  if(mode==='research' && modeRequests===1) {
    const artifact=readCreationContextPacket(job,{stateRoot}).packet.artifacts.find(item=>item.id==='patterns');
    command=`${quote(process.execPath)} ${quote(path.join(workspace.cwd,'scripts/creation-context-reader.mjs'))} --packet ${job.contextPacket.hash} --artifact patterns --hash ${artifact.contentHash} --cursor 0`;
  }
  if(mode==='research' && modeRequests===2)command=importCommand(currentResearch.topics.slice(0,1),Math.max(48000,110*1024-bytes-10000));
  if(mode==='research' && modeRequests>=3 && modeRequests<=6)command=`${quote(process.execPath)} -e ${quote(`process.stdout.write('iteration-${modeRequests}:OLD_LARGE_OUTPUT_'.repeat(4000))`)}`;
  if(mode==='research-resumed' && modeRequests===1)command=importCommand(currentResearch.topics);
  if(mode==='build' && modeRequests===1) {
    const content=builds===1?"console.log('Smoke test passed.');\n":implementation;
    command=`${quote(process.execPath)} -e ${quote(`require('node:fs').writeFileSync('scripts/refresh.mjs',${JSON.stringify(content)})`)}`;
  }
  const n=requests.length;
  const output=command?{id:`tool_${n}`,type:'function_call',call_id:`call_${n}`,name:'exec_command',arguments:JSON.stringify({cmd:command,yield_time_ms:1000,max_output_tokens:24000}),status:'completed'}:
    {id:`message_${n}`,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:answer,annotations:[]}]};
  const inputTokens=Math.ceil(bytes/4),outputTokens=Math.ceil(Buffer.byteLength(JSON.stringify(output))/4);
  const response={id:`response_${n}`,object:'response',status:'completed',created_at:Math.floor(Date.now()/1000),model:payload.model,output:[output],
    usage:{input_tokens:inputTokens,output_tokens:outputTokens,total_tokens:inputTokens+outputTokens}};
  let middle='';
  if(command)middle=[{type:'response.output_item.added',output_index:0,item:{...output,status:'in_progress',arguments:''}},
    {type:'response.function_call_arguments.delta',item_id:output.id,output_index:0,delta:output.arguments},
    {type:'response.output_item.done',output_index:0,item:output}].map(event=>`data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(`data: ${JSON.stringify({type:'response.created',response:{...response,status:'in_progress',output:[]}})}\n\n${middle}data: ${JSON.stringify({type:'response.completed',response})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
};
async function prepRun(nextMode) {
  mode=nextMode;modeRequests=0;const turnId=`turn_${++turnNumber}`,attemptId=`attempt_${turnId}`;
  const isBrief=nextMode.startsWith('brief');
  const turn={turnId,clientMessageId:turnId,status:'queued',items:[],pendingRequestIds:[],startedAt:new Date().toISOString(),completedAt:null,error:null,
    userMessage:{id:`user_${turnId}`,role:'user',markdown:turnNumber===1?product:'Continue the host checkpoint.',status:'completed',createdAt:new Date().toISOString()}};
  turn.executionIntent={creationOrigin:turnNumber===1?undefined:'host-continuation'};history.putTurn(chatId,turn);
  const dialogue=history.creationContext(chatId,turnId,64000,{preparationVersion:2});
  job=jobs.update(chatId,j=>({...j,status:'running',phase:isBrief?'interview':'research',activeTurnId:turnId,blocker:null}));
  const packet=prepareCreationContextPacket(job,dialogue,{root:workspace.cwd,stateRoot,turnId});job=jobs.update(chatId,j=>({...j,contextPacket:packet}));
  const intent={attemptId,agentCreationRequested:true,executionAgentTarget:target,sandbox:'workspace-write',modelId:'fixture-model',effortId:null,
    creationGeneration:job.generation,creationSession:{mode:'checkpoint',previousSessionId:lastSession,contextHash:dialogue.hash},
    creationPreparation:{policyVersion:2,phase:packet.phase,workUnitId:turnId,packetHash:packet.hash},cwd:draftRoot,executionCodeRoot:workspace.cwd,additionalWritableDirs:[]};
  store.enqueue({attemptId,workloadId:turnId,surface:'task_chat',coordinationKeyHash:hash(chatId),queuedAt:new Date().toISOString(),
    payload:{chatId,turnId,execution:intent},resources:executionResourceClaims({cwd:draftRoot,sandbox:'workspace-write',additionalWritableDirs:[]})});
  store.reconcileStoppedTaskChats();
  const claim=store.claim(attemptId,1);assert.ok(claim);
  process.env.PRITHA_AGENT_AUTHORING_ROOT=draftRoot;process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT=JSON.stringify({attemptId,ownerToken:claim.ownerToken});
  const runOptions={cwd:draftRoot,executionCodeRoot:workspace.cwd,model:'fixture-model',sandbox:'workspace-write',network:false,workloadId:turnId,usageSource:'codex-chat',
    input:readCreationContextPacket(job,{stateRoot}).text+'\n'+creationPrompt({...job,executionCodeRoot:workspace.cwd}),emitProviderEvents:true,
    onEvent:event=>{history.sourceRaw(chatId,turnId,JSON.stringify(event));const item=event.item?{...event.item,id:turnId+'_'+event.item.id}:null;if(event.type!=='item.completed'||!item)return;
      if(item.type==='agent_message')history.putItem(chatId,turnId,{id:item.id,kind:'assistant_message',message:{id:item.id,role:'assistant',markdown:item.text,status:'completed',phase:'final_answer',createdAt:new Date().toISOString()}},item.text);
      if(item.type==='command_execution')history.putItem(chatId,turnId,{id:item.id,kind:'command',status:'completed',commandPreview:item.command,outputPreview:item.aggregated_output||'',exitCode:item.exit_code},item.aggregated_output||'');}};
  const result=await runCodexWithNeuralDeep(runtime,buildCodexExecArgs(runOptions),runOptions);
  delete process.env.PRITHA_AGENT_AUTHORING_ROOT;delete process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT;
  assert.ok(result.processTreeExited);lastSession=result.sessionId;sessions.push(lastSession);
  const receipt=creationRuntimeReceipt(store,turnId);assert.ok(receipt.processExited);assert.notEqual(receipt.tokens,null);
  store.finish(attemptId,claim.ownerToken,result.code===0?'completed':'failed');
  history.mutateTurn(chatId,turnId,t=>({...t,status:result.code===0?'completed':'failed',completedAt:new Date().toISOString()}));
  job=jobs.recordTurn(chatId,{turnId,tokens:receipt.tokens,activeMs:1,dispatched:true,ok:result.code===0,code:receipt.blocker?.code,checkpoint:{turnId,phase:job.phase}});
  if(isBrief && result.code===0)job=jobs.update(chatId,j=>reconcileCreationArtifacts(completeCreationBrief(j,history.originalAssistantText(chatId,turnId),{root,stateRoot,turnId}),options));
  else job=jobs.update(chatId,j=>settleCreationPreparation(j,receipt,{root:workspace.cwd,stateRoot,phase:isBrief?'interview':'research'}));
  console.error(JSON.stringify({step:nextMode,code:result.code,status:job.status,blocker:job.blocker,usage:job.budget.tokensUsed,requests:modeRequests}));
  return result;
}
function approve(kind){job=jobs.update(chatId,j=>approveCreationDocument(reconcileCreationArtifacts(j,options),kind,
  {action:`approve_${kind}`,requestId:`approve_${kind}`,expectedRevision:j.revision,actor:'codex-operator',authorizationBasis:'Synthetic local stock CLI acceptance'},options));}
let passed=false;
try {
  if(briefToolViolation) {
    const result=await prepRun('brief');assert.notEqual(result.code,0);
    assert.equal(requests.length,1);assert.equal(job.blocker.code,'provider_budget_brief_tool_call');
    assert.equal(history.turn(chatId,'turn_1').items.filter(item=>item.kind==='command').length,0);
    assert.equal((await import('node:fs')).existsSync(path.join(draftRoot,'tool-must-not-run')),false);
    const usage=creationPreparationUsage(store,job);assert.ok(usage.total>0);assert.equal(usage.unknownRequests,0);assert.equal(usage.pendingRequests,0);
    const report={status:'pass',sha,paidCalls:0,negativeControl:'unsolicited brief tool call',requests,preparation:usage,commandExecuted:false};
    if(reportPath){mkdirSync(path.dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});}
    console.error(JSON.stringify(report));passed=true;
  } else {
  await prepRun('brief-invalid');assert.equal(job.status,'pending');assert.equal(job.preparation.briefRepairCount,1);
  await prepRun('brief');assert.equal(job.status,'awaiting_contract_approval');approve('contract');
  const count=requests.length;job=jobs.update(chatId,j=>reconcileCreationArtifacts({...j,...prepareCreationOutcome(j,options)},options));
  assert.equal(requests.length,count);assert.equal(job.status,'awaiting_outcome_approval');approve('outcome');
  const oldDocuments=[job.contract.path,job.outcome.path].map(file=>[file,readFileSync(file,'utf8')]),priorTokens=job.budget.tokensUsed;
  const revision={action:'revise_proposal',requestId:'operator-revision',expectedRevision:job.revision,reason:'Display the record count after every manual refresh.',actor:'codex-operator',authorizationBasis:'Synthetic delegated revision'};
  jobs.beginAction(chatId,revision);
  const revised=reviseCreationProposal(job,revision,{...options,coordination:store});
  job=jobs.update(chatId,()=>revised);jobs.finishAction(chatId,revision.requestId,job);
  await prepRun('brief-revised');assert.equal(job.status,'awaiting_contract_approval');assert.equal(job.proposalRevisionPending,false);
  assert.ok(job.contract.text.includes(revision.reason));assert.ok(job.budget.tokensUsed>priorTokens);approve('contract');
  const afterRevision=requests.length;job=jobs.update(chatId,j=>reconcileCreationArtifacts({...j,...prepareCreationOutcome(j,options)},options));
  assert.equal(requests.length,afterRevision);assert.equal(job.status,'awaiting_outcome_approval');approve('outcome');
  for(const [file,text] of oldDocuments)assert.equal(readFileSync(file,'utf8'),text);
  execFileSync(process.execPath,[path.join(root,'scripts/rebuild-memory.mjs')],{env:process.env,stdio:'pipe',timeout:60000});
  currentResearch=await prepareCreationResearch(job,{root:workspace.cwd,stateRoot,model:'fixture-model'});
  const reportFile=currentResearch.artifacts.find(item=>item.id==='research').path;
  let text=readFileSync(reportFile,'utf8');while(Buffer.byteLength(text)+currentResearch.artifacts.find(item=>item.id==='patterns').bytes<90*1024)text+='\nSynthetic non-private evidence volume for bounded context acceptance.';
  text=text.replace(/^research_content_lock:.*$/m,`research_content_lock: ${markdownDocumentLock(text)}`);writeFileSync(reportFile,text);
  await prepRun('research');assert.equal(job.status,'pending');assert.equal(job.preparationRotations.research,1);
  await prepRun('research-resumed');assert.equal(job.researchAttemptCompleted,true,JSON.stringify(readCreationResearch(job,{root:workspace.cwd,stateRoot}).gate));
  job=jobs.update(chatId,j=>reconcileCreationArtifacts(j,options));
  if(signalDeskPreparation){
    const usage=creationPreparationUsage(store,job);assert.equal(readCreationResearch(job,{root:workspace.cwd,stateRoot}).gate.ok,true);assert.ok(usage.total<=300000);assert.ok(usage.requests<=12);
    const report={status:'pass',sha,scenario:'full Signal Desk preparation with operator revision',paidCalls:0,requests,preparation:usage,zeroOutcomeRequests:true};
    if(reportPath)writeFileSync(reportPath,JSON.stringify(report,null,2));console.error(JSON.stringify(report));passed=true;
  } else {
  const scaffold=await creationHostStep(job,options);job=jobs.update(chatId,()=>scaffold);
  assert.ok(job.scaffoldReady);
  const result=await runCreationDelivery(job,{...options,trialBackend:'local',reportDir:false,task:{chatId,nativeThreadId:lastSession,providerId:'neuraldeep_cli',stateIdentityHash:instanceId},
    buildExecutor:new FunctionBuildExecutor(async request=>{
      builds++;mode='build';modeRequests=0;
      const input={model:'fixture-model',cwd:request.worktree,sandbox:'workspace-write',network:false,input:'Implement the agreed local feed behavior. Preserve protected host verifiers.',
        usageSource:'delivery',workloadId:`fixture_build_${builds}`,tokenBudget:job.budget.maxTokens-job.budget.tokensUsed};
      const run=await runCodexWithNeuralDeep(runtime,buildCodexExecArgs(input),input);assert.equal(run.code,0);assert.ok(run.processTreeExited);
      return {status:'completed',thread_id:run.sessionId,turn_id:run.runId,tokens_used:run.usageRecord.usage.totalTokens};
    },{name:'stock-codex-cli-local-provider'})});
  assert.equal(builds,2,'stdout-only project must fail before actual source behavior passes');assert.equal(result.adopted,true,JSON.stringify(result.blocker));
  assert.equal(new Set(sessions).size,5);
  const usage=creationPreparationUsage(store,job);assert.ok(usage.requests<=12);assert.ok(usage.total<=300000);assert.ok(usage.phase.brief<=100000);assert.ok(usage.phase.research<=200000);
  assert.ok([...history.audit({chatId})].some(row=>JSON.stringify(row).includes('OLD_LARGE_OUTPUT_')),'full tool history is retained');
  const report={status:'pass',sha,cli:execFileSync(process.env.PRITHA_CODEX_BIN||'codex',['--version'],{encoding:'utf8'}).trim(),paidCalls:0,
    nativeSessions:sessions.length,preparation:usage,requests,builds,zeroOutcomeRequests:true,reviewedRevision:true,checkpointRotation:true,independentNegativeControl:true,adopted:true,acceptance:'not_accepted'};
  if(reportPath){mkdirSync(path.dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});}
  console.error(JSON.stringify(report));passed=true;
  }
  }
} finally {
  delete process.env.PRITHA_AGENT_AUTHORING_ROOT;delete process.env.PRITHA_NEURALDEEP_ADMISSION_RECEIPT;
  history.close();store.close();
  if(passed){execFileSync('git',['worktree','remove','--force',workspace.cwd],{cwd:root,stdio:'pipe'});rmSync(base,{recursive:true,force:true});}
  else console.error(JSON.stringify({failed:true,base,workspace:workspace.cwd}));
}
