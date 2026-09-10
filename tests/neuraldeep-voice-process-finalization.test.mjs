import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';

const source=ts.createSourceFile('runtime.ts',readFileSync('interfaces/control-center/src/lib/realtime/pritha-runtime.ts','utf8'),ts.ScriptTarget.Latest,true);
const declaration=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='releaseVoiceCodexAttempt');
assert.ok(declaration);
const executable=ts.transpileModule(declaration.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;

function fixture(failure=false) {
  const calls=[],attempts=new Map(),attempt={taskId:'fixture-task',topicId:'fixture-topic',paths:{progressPath:'fixture-log'},networkScratchDir:'fixture-scratch',
    lease:{release:async outcome=>{calls.push(['release',outcome]);if(failure)throw new Error('admission_runtime_exit_unconfirmed');}}};
  attempts.set(attempt.taskId,attempt);
  const dependencies={rm:async(...args)=>calls.push(['rm',...args]),voiceCodexAttempts:()=>attempts,
    getVoiceTaskLinkService:()=>({finish:async value=>calls.push(['finish',value])}),
    writeVoiceCodexStatus:async(_attempt,status)=>calls.push(['status',status]),
    appendCodexTaskProgress:async(_id,_file,event)=>calls.push(['progress',event])};
  const run=new Function('dependencies',`const {rm,voiceCodexAttempts,getVoiceTaskLinkService,writeVoiceCodexStatus,appendCodexTaskProgress}=dependencies;${executable};return releaseVoiceCodexAttempt;`)(dependencies);
  return {run,attempt,attempts,calls};
}

test('Voice cleanup follows confirmed release and cannot remove a successor from the active map',async()=>{
  const f=fixture(),successor={taskId:f.attempt.taskId};f.attempts.set(f.attempt.taskId,successor);
  assert.equal(await f.run(f.attempt,'completed'),true);
  assert.deepEqual(f.calls,[['release','completed'],['rm','fixture-scratch',{recursive:true,force:true}]]);
  assert.equal(f.attempt.networkScratchDir,null);assert.equal(f.attempts.get(f.attempt.taskId),successor);
});

test('Voice preserves working files and reports unresolved exit instead of swallowing release failure',async()=>{
  const f=fixture(true);assert.equal(await f.run(f.attempt,'completed'),false);
  assert.equal(f.calls.some(([kind])=>kind==='rm'),false);assert.equal(f.attempt.networkScratchDir,'fixture-scratch');
  assert.equal(f.calls.find(([kind])=>kind==='finish')[1].topicStatus,'predecessor_confirmation_required');
  assert.equal(f.calls.find(([kind])=>kind==='status')[1].error_code,'admission_runtime_exit_unconfirmed');
  assert.equal(f.attempts.has(f.attempt.taskId),false);
});

function isolatedFunction(name,dependencies) {
  const node=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node);
  const js=ts.transpileModule(node.getText(source).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return new Function('dependencies',`const {${Object.keys(dependencies).join(',')}}=dependencies;${js};return ${name};`)(dependencies);
}

test('Voice readback never promotes a partial legacy result or elapsed timeout into completion',async()=>{
  const status={status:'running',started_at:new Date(0).toISOString(),pid:2147483647};let reconciled=0;
  const run=isolatedFunction('repairStaleCodexTaskStatus',{voiceCodexAttempts:()=>new Map(),
    getVoiceTaskLinkService:()=>({readLink:async()=>null}),ensureVoiceTaskLinkRecovery:async()=>reconciled++,readJsonFile:async()=>{throw new Error('unexpected write/readback');}});
  const result=await run('legacy',{},status,{statusPath:'fixture'},'partial file output');
  assert.equal(result.status,status);assert.equal(result.resultText,'partial file output');assert.equal(result.repaired,false);assert.equal(reconciled,0);
});

test('Voice abort refuses a stale execution card and never signals an unbound legacy PID',async()=>{
  let interrupted=0;const controller=new AbortController();let managed={attemptId:'new_attempt',controller,run:{interrupt:()=>interrupted++}};
  let status={status:'running',admission_attempt_id:'new_attempt',pid:2147483647};let link={topicId:'topic'};
  const run=isolatedFunction('applyPrithaCodexTaskAbort',{resolveCodexTaskIdRef:async()=> 'fixture-task',logPrivateEvent:async()=>{},
    resolveTechscopeRoot:()=>'/fixture',privateRoot:()=>'/fixture/private',path:{join:(...parts)=>parts.join('/')},
    isPathInsideOrSame:()=>true,existsSync:()=>true,codexTaskProgressPath:()=>'/fixture/progress',codexTaskVoiceFeedbackPath:()=>'/fixture/voice',
    readJsonFile:async file=>file.endsWith('status.json')?status:{id:'fixture-task'},ensureCodexTaskShortId:async()=> 'fixture',
    compactText:value=>String(value),TERMINAL_CODEX_TASK_STATUSES:new Set(['complete','failed','aborted']),
    getVoiceTaskLinkService:()=>({readLink:async()=>link}),voiceCodexAttempts:()=>new Map(managed?[['fixture-task',managed]]:[])});
  for(const expected of ['old_attempt',undefined])assert.equal((await run('fixture-task','synthetic stop',expected)).error,'voice_attempt_revision_conflict');
  assert.equal(controller.signal.aborted,false);assert.equal(interrupted,0);
  managed=null;link=null;status={status:'running',pid:2147483647};
  assert.equal((await run('fixture-task','synthetic stop')).error,'legacy_runtime_identity_unverified');
});

test('Voice answer receipt preserves the original bytes and rejects truncation before dispatch',async()=>{
 let calls=0,received;
 const run=isolatedFunction('answerPrithaCodexTask',{resolveCodexTaskIdRef:async()=> 'fixture-task',
  dispatchVoiceOperatorResponse:async input=>{calls++;received=input;return{ok:true};},getNeuralDeepAdmissionCoordinator:()=>({})});
 const answer='  Exact answer.\nKeep two spaces:  here.  ';
 assert.equal((await run({task_id:'fixture-task',answer,operator_confirmation:' Exact phrase. '})).ok,true);
 assert.deepEqual(received.answer,{text:answer,operatorConfirmation:' Exact phrase. '});
 assert.equal((await run({task_id:'fixture-task',answer:'x'.repeat(4001)})).error,'operator_answer_invalid');
 assert.equal((await run({task_id:'fixture-task',answer:{text:'not a string'}})).error,'missing_answer');assert.equal(calls,1);
});
