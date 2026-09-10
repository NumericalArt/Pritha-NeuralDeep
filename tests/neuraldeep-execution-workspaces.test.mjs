import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';
import {NeuralDeepCoordinationStore,coordinationHash} from '../scripts/neuraldeep/coordination-store.mjs';
import {NeuralDeepExecutionWorkspaces} from '../scripts/neuraldeep/execution-workspaces.mjs';
import {executionResourceClaims} from '../scripts/neuraldeep/execution-resources.mjs';
import {prepareVoiceWorkspace} from '../scripts/neuraldeep/voice-workspace.mjs';
function git(cwd,...args){return execFileSync('git',['-c','core.hooksPath=/dev/null','-C',cwd,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:5000,killSignal:'SIGKILL'}).trim();}
function fixture(t,{repository=true}={}){
 const root=realpathSync(mkdtempSync(path.join(os.tmpdir(),'nd-workspaces-'))),source=path.join(root,'source'),stateRoot=path.join(root,'state');
 mkdirSync(source);mkdirSync(stateRoot);writeFileSync(path.join(source,'original.txt'),'Tracked original\n');
 if(repository){git(source,'init');git(source,'config','user.email','synthetic@example.invalid');git(source,'config','user.name','Synthetic Fixture');git(source,'add','.');git(source,'commit','-m','fixture');}
 const databasePath=path.join(stateRoot,'admission.sqlite'),store=new NeuralDeepCoordinationStore({databasePath});
 const workspaces=new NeuralDeepExecutionWorkspaces(store,{stateRoot});
 t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return{root,source,stateRoot,databasePath,store,workspaces};
}
function enqueue(f,id,resources,{workload=id,surface='task_chat'}={}){
 f.store.enqueue({attemptId:id,workloadId:workload,surface,coordinationKeyHash:coordinationHash(workload),queuedAt:new Date().toISOString(),resources});
 return()=>f.store.claim(id,8);
}

test('independent mutating chats receive verified worktrees without copying source edits, secrets, homes or state',async t=>{
 const f=fixture(t);writeFileSync(path.join(f.source,'original.txt'),'User edit stays here\n');
 mkdirSync(path.join(f.source,'.private'));writeFileSync(path.join(f.source,'.private','secret'),'synthetic-private');
 const a=await f.workspaces.prepare({ownerId:'chat_a',sourcePath:f.source,mutating:true});
 const b=await f.workspaces.prepare({ownerId:'chat_b',sourcePath:f.source,mutating:true});
 assert.notEqual(a.cwd,b.cwd);assert.equal(a.mode,'worktree');assert.equal(a.sourceDirty,true);
 assert.equal(readFileSync(path.join(a.cwd,'original.txt'),'utf8'),'Tracked original\n');
 assert.equal(existsSync(path.join(a.cwd,'.private')),false);assert.equal(existsSync(path.join(a.cwd,'codex-home')),false);
 writeFileSync(path.join(a.cwd,'original.txt'),'Only A changed\n');
 assert.equal(readFileSync(path.join(b.cwd,'original.txt'),'utf8'),'Tracked original\n');assert.equal(readFileSync(path.join(f.source,'original.txt'),'utf8'),'User edit stays here\n');
 assert.equal((await f.workspaces.prepare({ownerId:'chat_a',sourcePath:f.source,mutating:true,existingCwd:a.cwd,nativeSession:true})).cwd,a.cwd);
 const claimA=enqueue(f,'a',executionResourceClaims({cwd:a.cwd,sandbox:'workspace-write'}))();
 const claimB=enqueue(f,'b',executionResourceClaims({cwd:b.cwd,sandbox:'workspace-write'}))();assert.ok(claimA);assert.ok(claimB);
});

test('worktree checkout disables local hooks, fsmonitor and external filters',async t=>{
 const f=fixture(t),marker=path.join(f.root,'must-not-execute');
 writeFileSync(path.join(f.source,'.gitattributes'),'original.txt filter=fixture\n');git(f.source,'add','.gitattributes');git(f.source,'commit','-m','filter fixture');
 git(f.source,'config','filter.fixture.smudge',`touch '${marker}'; cat`);git(f.source,'config','filter.fixture.clean',`touch '${marker}'; cat`);git(f.source,'config','filter.fixture.required','true');
 git(f.source,'config','core.fsmonitor',`touch '${marker}'`);
 writeFileSync(path.join(f.source,'.git','hooks','post-checkout'),`#!/bin/sh\ntouch '${marker}'\n`,{mode:0o700});
 const result=await f.workspaces.prepare({ownerId:'safe_checkout',sourcePath:f.source,mutating:true});
 assert.equal(readFileSync(path.join(result.cwd,'original.txt'),'utf8'),'Tracked original\n');assert.equal(existsSync(marker),false);
});

test('native sessions and non-Git tasks keep exact cwd, and invalid or sensitive allocations never fall back to another project',async t=>{
 const f=fixture(t,{repository:false});const existing=await f.workspaces.prepare({ownerId:'legacy',sourcePath:f.source,existingCwd:f.source,nativeSession:true,mutating:true});
 assert.equal(existing.cwd,f.source);assert.equal(existing.mode,'existing');
 const next=await f.workspaces.prepare({ownerId:'non_git',sourcePath:f.source,mutating:true});assert.equal(next.mode,'shared-write');
 await assert.rejects(f.workspaces.prepare({ownerId:'legacy',sourcePath:f.stateRoot,mutating:true}),{code:'workspace_binding_conflict'});
 const alias=path.join(f.root,'alias');symlinkSync(f.source,alias);await assert.rejects(f.workspaces.prepare({ownerId:'alias',sourcePath:alias,mutating:true}),{code:'workspace_directory_unverified'});
 const g=fixture(t);writeFileSync(path.join(g.source,'.env'),'SYNTHETIC_SECRET=fixture\n');git(g.source,'add','.env');git(g.source,'commit','-m','sensitive fixture');
 await assert.rejects(g.workspaces.prepare({ownerId:'unsafe',sourcePath:g.source,mutating:true}),{code:'workspace_sensitive_tracked_files'});
});

test('public environment scaffold templates can be checked out for a new chat',async t=>{
 const f=fixture(t),templates=path.join(f.source,'scripts','agents-mother','scaffold','templates');
 mkdirSync(templates,{recursive:true});
 const names=['.env.example','.env.sample','.env.template','.env.example.tmpl','.env.sample.tmpl','.env.template.tmpl'];
 for(const name of names)writeFileSync(path.join(templates,name),'AGENT_NAME={{pritha:value1}}\nLOG_LEVEL=info\n');
 git(f.source,'add','.');git(f.source,'commit','-m','public environment templates');
 const result=await f.workspaces.prepare({ownerId:'template_chat',sourcePath:f.source,mutating:true});
 assert.equal(result.mode,'worktree');assert.equal(result.state,'ready');
 for(const name of names)assert.equal(readFileSync(path.join(result.cwd,'scripts','agents-mother','scaffold','templates',name),'utf8'),'AGENT_NAME={{pritha:value1}}\nLOG_LEVEL=info\n');
});

test('environment template exceptions do not allow secrets, backups or private directories',async t=>{
 for(const name of ['.env.local','.env.production.tmpl','.env.example.tmpl.bak','.env.sample.secret','.private/.env.example.tmpl','codex-home/.env.example.tmpl']) {
  await t.test(name,async t=>{
   const f=fixture(t),file=path.join(f.source,name);mkdirSync(path.dirname(file),{recursive:true});
   writeFileSync(file,'SYNTHETIC_SECRET=fixture\n');git(f.source,'add','.');git(f.source,'commit','-m','sensitive fixture');
   await assert.rejects(f.workspaces.prepare({ownerId:'unsafe_template',sourcePath:f.source,mutating:true}),{code:'workspace_sensitive_tracked_files'});
  });
 }
});

test('shared and overlapping paths have one writer; waiting questions and unknown exit retain reservations until explicit reconciliation',async t=>{
 const f=fixture(t,{repository:false}),nested=path.join(f.source,'nested');mkdirSync(nested);
 const a=enqueue(f,'voice_a',executionResourceClaims({cwd:f.source,sandbox:'workspace-write'}),{workload:'workflow',surface:'voice'})();assert.ok(a);
 const b=enqueue(f,'direct_b',executionResourceClaims({cwd:nested,sandbox:'workspace-write'}));assert.equal(b(),null);assert.equal(f.store.resourceWaitReason('direct_b'),'workspace_conflict');
 assert.equal(f.store.finish(a.attemptId,a.ownerToken,'waiting_for_operator'),true);assert.equal(b(),null);
 f.store.enqueue({attemptId:'voice_resume',workloadId:'workflow',surface:'voice',coordinationKeyHash:coordinationHash('workflow'),queuedAt:new Date().toISOString(),resumePausedKey:true,
   resources:executionResourceClaims({cwd:f.source,sandbox:'workspace-write'})});
 const resumed=f.store.claim('voice_resume',8);assert.ok(resumed);assert.equal(b(),null);
 assert.equal(f.store.finish(a.attemptId,a.ownerToken,'completed'),false);assert.equal(b(),null);
 f.store.finish(resumed.attemptId,resumed.ownerToken,'failed');assert.equal(b(),null);
 f.store.reconcileWorkload('workflow','cancelled');assert.ok(b());
});

test('full access excludes all other effects and a second process cannot bypass a live path reservation',async t=>{
 const f=fixture(t,{repository:false});const a=enqueue(f,'a',executionResourceClaims({cwd:f.source,sandbox:'workspace-write'}))();assert.ok(a);
 const full=enqueue(f,'full',executionResourceClaims({cwd:f.stateRoot,sandbox:'danger-full-access'}));assert.equal(full(),null);
 const script=`import {NeuralDeepCoordinationStore,coordinationHash} from ${JSON.stringify(new URL('../scripts/neuraldeep/coordination-store.mjs',import.meta.url).href)};\nimport {executionResourceClaims} from ${JSON.stringify(new URL('../scripts/neuraldeep/execution-resources.mjs',import.meta.url).href)};\nconst store=new NeuralDeepCoordinationStore({databasePath:${JSON.stringify(f.databasePath)}});store.enqueue({attemptId:'other_process',workloadId:'other_process',surface:'task_chat',coordinationKeyHash:coordinationHash('other_process'),queuedAt:new Date().toISOString(),resources:executionResourceClaims({cwd:${JSON.stringify(f.source)},sandbox:'workspace-write'})});process.stdout.write(JSON.stringify({claimed:Boolean(store.claim('other_process',8))}));store.close();`;
 assert.deepEqual(JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:10000,killSignal:'SIGKILL'})),{claimed:false});
 f.store.finish(a.attemptId,a.ownerToken,'completed');assert.ok(full());
 const read=enqueue(f,'reader',executionResourceClaims({cwd:f.source,sandbox:'read-only'}));assert.equal(read(),null);
});

test('host operations share resource admission with CLI executions and stale releases cannot free another action',t=>{
 const f=fixture(t,{repository:false}),scope=coordinationHash('host_session'),claims=[{kind:'host',key:'execution-effects',mode:'write'}];
 const first=enqueue(f,'reader',executionResourceClaims({cwd:f.source,sandbox:'read-only'}))();assert.ok(first);
 assert.equal(f.store.acquireSessionControl(scope,'host_action',claims),false);
 f.store.finish(first.attemptId,first.ownerToken,'completed');assert.equal(f.store.acquireSessionControl(scope,'host_action',claims),true);
 const second=enqueue(f,'another_writer',executionResourceClaims({cwd:f.source,sandbox:'workspace-write'}));assert.equal(second(),null);
 assert.equal(f.store.resourceWaitReason('another_writer'),'workspace_conflict');
 assert.equal(f.store.releaseSessionControl(scope,'stale_action'),false);assert.equal(second(),null);
 assert.equal(f.store.acquireSessionControl(coordinationHash('alias'),'host_action',claims),false);
 assert.equal(f.store.releaseSessionControl(scope,'host_action'),true);assert.ok(second());assert.deepEqual(f.store.heldHostControls(),[]);
});

test('a dead host writer retains unconfirmed effects and a budget-only session control permits separately admitted work',t=>{
 const f=fixture(t,{repository:false}),scope=coordinationHash('host_session'),claims=[{kind:'host',key:'execution-effects',mode:'write'}];
 assert.equal(f.store.acquireSessionControl(scope,'lost_host_action',claims),true);
 f.store.db.prepare('UPDATE session_controls SET worker_pid=2147483647 WHERE scope=?').run(scope);
 assert.equal(f.store.acquireSessionControl(scope,'new_action',claims),false);assert.equal(f.store.heldHostControls().length,1);
 const attempt=enqueue(f,'delivery_work',executionResourceClaims({cwd:f.source,sandbox:'workspace-write'}),{surface:'delivery'});
 assert.equal(attempt(),null);assert.equal(f.store.releaseSessionControl(scope,'lost_host_action'),true);
 assert.equal(f.store.acquireSessionControl(scope,'budget_metadata'),true);assert.ok(attempt());
});

test('duplicate resource identities cannot expand a saved attempt and shared readers can run concurrently',t=>{
 const f=fixture(t,{repository:false}),resources=executionResourceClaims({cwd:f.source,sandbox:'read-only'});
 const first=enqueue(f,'reader_a',resources)();assert.ok(first);assert.ok(enqueue(f,'reader_b',resources)());
 f.store.assertRuntimeResources('reader_a',resources);
 assert.throws(()=>f.store.assertRuntimeResources('reader_a',executionResourceClaims({cwd:f.source,sandbox:'workspace-write'})),/runtime_resource_identity_conflict/);
 assert.throws(()=>enqueue(f,'reader_a',executionResourceClaims({cwd:f.source,sandbox:'workspace-write'})),/admission_attempt_conflict/);
});

test('Voice uses exact subjects, isolates a child project and never grants projects merely mentioned in text',async t=>{
 const f=fixture(t),child=fixture(t),other=fixture(t);
 const input={allocator:f.workspaces,ownerId:'topic_child',root:f.source,task:{task_type:'implementation',subject_kind:'agent',subject_id:'selected-agent',task:'Compare also Other'},
  binding:{nativeThreadId:null},projects:[{name:'SelectedAgent',directory:child.source,aliases:['selected agent']},{name:'Other',directory:other.source,aliases:['other']}],
  agentParent:f.root,agentMemoryRoot:path.join(f.stateRoot,'agents'),permissions:{sandbox:'workspace-write',network:false}};
 const result=await prepareVoiceWorkspace(input);
 assert.equal(result.workspace.source,child.source);assert.notEqual(result.workspace.cwd,child.source);assert.equal(result.executionCodeRoot,f.source);
 assert.deepEqual(result.additionalWritableDirs,[path.join(f.stateRoot,'agents')]);
 await assert.rejects(prepareVoiceWorkspace({...input,ownerId:'missing',task:{...input.task,subject_id:'selected'}}),{code:'voice_agent_subject_unverified'});
 await assert.rejects(prepareVoiceWorkspace({...input,task:{...input.task,execution_writable_dirs:[other.source]}}),{code:'voice_writable_permissions_conflict'});
 await assert.rejects(prepareVoiceWorkspace({...input,binding:{nativeThreadId:'session_1'},nativeProof:{available:false,code:'native_workspace_mismatch'}}),{code:'native_workspace_mismatch'});
});

test('new agent reservations are durable before filesystem effects and grant only one target plus instance metadata',async t=>{
 const f=fixture(t),parent=path.join(f.root,'children');mkdirSync(parent);
 const input={allocator:f.workspaces,ownerId:'topic_new',root:f.source,task:{task_type:'agent_creation',subject_kind:'agent',subject_id:'new-agent'},
  binding:{nativeThreadId:null},projects:[],agentParent:parent,agentMemoryRoot:path.join(f.stateRoot,'agents'),permissions:{sandbox:'workspace-write',network:false}};
 const prepared=await prepareVoiceWorkspace(input),target=path.join(parent,'new-agent');
 assert.equal(prepared.agentTarget,target);assert.deepEqual(prepared.additionalWritableDirs,[target,path.join(f.stateRoot,'agents')]);
 assert.equal(prepared.additionalWritableDirs.includes(parent),false);
 assert.equal(f.workspaces.allocateAgentTarget('topic_new',parent,'new-agent'),target);
 assert.throws(()=>f.workspaces.allocateAgentTarget('topic_other',parent,'new-agent'),{code:'agent_target_exists'});
 const interrupted=path.join(parent,'interrupted');f.store.transaction(()=>f.store.db.prepare('INSERT INTO execution_agent_targets VALUES(?,?,?)').run('crashed',interrupted,'planned'));
 mkdirSync(interrupted);writeFileSync(path.join(interrupted,'result.txt'),'Preserved');
 assert.throws(()=>f.workspaces.allocateAgentTarget('crashed',parent,'interrupted'),{code:'agent_target_identity_unconfirmed'});
 assert.equal(readFileSync(path.join(interrupted,'result.txt'),'utf8'),'Preserved');
});

test('network research scratch remains bound across native resume without granting the source writes',async t=>{
 const f=fixture(t),input={allocator:f.workspaces,ownerId:'topic_research',root:f.source,task:{task_type:'analysis'},binding:{nativeThreadId:null},projects:[],
  agentParent:f.root,agentMemoryRoot:path.join(f.stateRoot,'agents'),permissions:{sandbox:'read-only',network:true}};
 const first=await prepareVoiceWorkspace(input);writeFileSync(path.join(first.workspace.cwd,'checkpoint'),'preserved');
 const resumed=await prepareVoiceWorkspace({...input,binding:{nativeThreadId:'session_1',workspacePath:first.workspace.cwd,executionWorkspace:first.workspace},
  nativeProof:{available:true,code:'native_source_verified',workspacePath:first.workspace.cwd}});
 assert.equal(resumed.workspace.cwd,first.workspace.cwd);assert.equal(resumed.sourceReadOnly,true);assert.deepEqual(resumed.additionalWritableDirs,[]);
 assert.equal(readFileSync(path.join(resumed.workspace.cwd,'checkpoint'),'utf8'),'preserved');
});
