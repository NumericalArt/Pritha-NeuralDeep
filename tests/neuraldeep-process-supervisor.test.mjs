import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';import test from 'node:test';
import {spawnSupervisedCli} from '../scripts/neuraldeep/process-supervisor.mjs';
import {processSnapshot,processTreeExited} from '../scripts/neuraldeep/process-snapshot.mjs';
import {NeuralDeepCoordinationStore,coordinationHash} from '../scripts/neuraldeep/coordination-store.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<60;i++){if(await predicate())return;await sleep(100);}assert.fail('owned fixture did not reach its expected state');}
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'nd-process-supervisor-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function capture(stream){let text='';stream.setEncoding('utf8');stream.on('data',chunk=>text+=chunk);return()=>text;}
async function start(t,args,options={}){
  const run=await spawnSupervisedCli(process.execPath,args,{cwd:process.cwd(),env:process.env,...options});
  run.child.stderr.resume();
  t.after(async()=>{run.stop();await run.completion;});return run;
}
const stubborn="process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
const tree=`const {spawn}=require('node:child_process');const grand=spawn(process.execPath,['-e',${JSON.stringify(stubborn)}],{stdio:'ignore'});process.on('SIGTERM',()=>{});console.log(JSON.stringify({worker:process.pid,grand:grand.pid}));setInterval(()=>{},1000);`;
const orphanHelper=`const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(stubborn+';setTimeout(()=>process.exit(),20000)')}],{detached:true,stdio:'ignore'});child.unref();console.log(child.pid);setTimeout(()=>{},1800);`;
const orphanTree=`const {spawn}=require('node:child_process');const helper=spawn(process.execPath,['-e',${JSON.stringify(orphanHelper)}],{stdio:['ignore','pipe','ignore']});helper.stdout.pipe(process.stdout);setInterval(()=>{},1000);`;

test('supervisor preserves exact stdin and large backpressured stdout through normal exit',{timeout:15000},async t=>{
  const run=await start(t,['-e',"process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write('雪 original bytes\\n'.repeat(140000));})"]);
  run.child.stdin.end('one prompt only');const chunks=[];
  for await(const chunk of run.child.stdout){chunks.push(chunk);await sleep(1);}
  const result=await run.completion,expected=Buffer.from('雪 original bytes\n'.repeat(140000));
  assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'),createHash('sha256').update(expected).digest('hex'));
  assert.equal(result.code,0);assert.equal(result.signal,null);assert.equal(result.processTreeExited,true);assert.equal(run.stop(),false);
});

test('checkpoint failure before Start never invokes the stock executable',{timeout:10000},async t=>{
  const root=fixture(t),marker=path.join(root,'not-started');
  await assert.rejects(spawnSupervisedCli(process.execPath,['-e',`require('fs').writeFileSync(${JSON.stringify(marker)},'unexpected')`],{
    cwd:root,env:process.env,beforeStart:()=>{throw new Error('fixture_checkpoint_failed');},
  }),/fixture_checkpoint_failed/);
  assert.equal(existsSync(marker),false);
});

test('a running CLI survives one failed ownership probe; persistent failure keeps a diagnostic and blocks reconciliation',{timeout:20000},async t=>{
  const root=fixture(t),realPython=spawnSync('python3',['-I','-S','-c','import sys; print(sys.executable)'],{encoding:'utf8',timeout:4000}).stdout.trim();
  assert.ok(path.isAbsolute(realPython));
  for (const persistent of [false,true]) {
    const bin=path.join(root,String(persistent));mkdirSync(bin);
    const armed=path.join(bin,'armed'),failed=path.join(bin,'failed');
    writeFileSync(path.join(bin,'python3'),`#!${process.execPath}
const fs=require('node:fs');
if(fs.existsSync(${JSON.stringify(armed)}) && (${persistent} || !fs.existsSync(${JSON.stringify(failed)}))){fs.writeFileSync(${JSON.stringify(failed)},'');process.exit(70);}
const r=require('node:child_process').spawnSync(${JSON.stringify(realPython)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status ?? 1);
`,{mode:0o700});
    const script=persistent ? `console.log('ready');${stubborn}` : "console.log('ready');setTimeout(()=>console.log('completed'),1800)";
    const run=await start(t,['-e',script],{env:{...process.env,PATH:`${bin}${path.delimiter}${process.env.PATH}`}});
    const output=capture(run.child.stdout);run.child.stdin.end();await until(()=>output().includes('ready'));
    writeFileSync(armed,'');
    const result=await run.completion;
    assert.equal(existsSync(failed),true,'the fixture must exercise a probe failure after Start');
    if (persistent) {
      assert.equal(result.processTreeExited,false);
      assert.equal(result.error,'process_snapshot_timeout');
      assert.equal(result.evidence.coverage,'unknown');
      assert.equal(result.evidence.snapshotFailure.code,'process_snapshot_timeout');
      assert.equal(result.evidence.snapshotFailure.phase,'poll');
      assert.equal(processSnapshot().some(row=>row.session===run.child.pid&&!row.state.startsWith('Z')),false);
    } else {
      assert.equal(result.code,0);assert.equal(result.error,null);assert.equal(result.processTreeExited,true);
      assert.match(output(),/completed/);assert.equal(result.evidence.coverage,'observed');
    }
  }
});

test('owned stop terminates a stubborn worker and grandchild while a neighbor continues',{timeout:15000},async t=>{
  const a=await start(t,['-e',tree]),b=await start(t,['-e','setInterval(()=>{},1000)']);const output=capture(a.child.stdout);b.child.stdout.resume();
  a.child.stdin.end();b.child.stdin.end();await until(()=>output().includes('\n'));const ids=JSON.parse(output().split('\n')[0]);
  assert.ok(processSnapshot().some(row=>row.pid===ids.grand && row.session===a.child.pid));
  assert.equal(a.stop(),true);const result=await a.completion;assert.equal(result.processTreeExited,true);assert.equal(result.signal,'SIGTERM');
  assert.ok(processSnapshot().some(row=>row.pid===b.child.pid));assert.equal(a.stop(),false);
  assert.ok(processSnapshot().some(row=>row.pid===b.child.pid),'an old control handle cannot stop the neighbor');
});

test('abrupt launcher death closes the lifeline and ends its CLI session',{timeout:15000},async t=>{
  const root=fixture(t),parentFile=path.join(root,'parent.mjs');
  writeFileSync(parentFile,`import {spawnSupervisedCli} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/neuraldeep/process-supervisor.mjs')).href)};
    const run=await spawnSupervisedCli(process.execPath,['-e',${JSON.stringify(tree)}],{cwd:process.cwd(),env:process.env});
    run.child.stderr.resume();run.child.stdout.on('data',chunk=>process.stdout.write(JSON.stringify({session:run.child.pid,data:String(chunk)})+'\\n'));run.child.stdin.end();await run.completion;`);
  const parent=spawn(process.execPath,[parentFile],{stdio:['ignore','pipe','pipe']});parent.stderr.resume();const output=capture(parent.stdout);
  t.after(()=>{if(parent.exitCode===null&&!parent.signalCode)parent.kill('SIGTERM');});
  await until(()=>output().includes('\n'));const message=JSON.parse(output().split('\n')[0]),ids=JSON.parse(message.data);
  assert.ok(processSnapshot().some(row=>row.pid===ids.grand && row.session===message.session));
  parent.kill('SIGKILL');await until(()=>processTreeExited({version:1,session:message.session,escaped:[]}));
});

test('reconciliation never claims unknown coverage or a surviving detached child has exited',()=>{
  const row={pid:40,parent:1,group:40,session:40,state:'S',started:'exact fixture start'};
  assert.equal(processTreeExited({version:1,session:20,coverage:'unknown',escaped:[]},[]),false);
  assert.equal(processTreeExited({version:1,session:20,escaped:[{pid:40,started:row.started}]},[row]),false);
  assert.equal(processTreeExited({version:1,session:20,escaped:[{pid:40,started:'previous start'}]},[row]),true,'a reused PID is inspected, never signalled');
});

test('normal CLI completion cleans an observed detached child without changing the CLI outcome',{timeout:12000},async t=>{
  const script="const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{detached:true,stdio:'ignore'});child.unref();console.log(child.pid);setTimeout(()=>{},1800);";
  const run=await start(t,['-e',script]);const output=capture(run.child.stdout);run.child.stdin.end();
  const result=await run.completion,pid=Number(output().trim());
  assert.equal(result.code,0);assert.equal(result.signal,null);assert.equal(result.processTreeExited,true);
  assert.ok(result.evidence.escaped.some(row=>row.pid===pid));
  assert.equal(processSnapshot().some(row=>row.pid===pid && !row.state.startsWith('Z')),false);
});

test('stop cleans a stubborn observed orphan in another session and leaves a neighboring runtime alive',{timeout:18000},async t=>{
  let observed;
  const run=await start(t,['-e',orphanTree],{onEvidence:value=>{observed=value;}}),neighbor=await start(t,['-e','setInterval(()=>{},1000)']);
  const output=capture(run.child.stdout);run.child.stdin.end();neighbor.child.stdout.resume();neighbor.child.stdin.end();
  await until(()=>output().includes('\n'));const pid=Number(output().trim());
  await until(()=>observed?.escaped.some(row=>row.pid===pid) && processSnapshot().some(row=>row.pid===pid && row.parent===1));
  const identity=observed.escaped.find(row=>row.pid===pid);
  t.after(()=>{if(processSnapshot().some(row=>row.pid===pid && row.started===identity.started))try{process.kill(pid,'SIGKILL');}catch{}});
  run.stop();const result=await run.completion;
  assert.equal(result.processTreeExited,true);assert.equal(result.signal,'SIGTERM');assert.equal(result.error,null);
  assert.equal(processSnapshot().some(row=>row.pid===pid && row.started===identity.started && !row.state.startsWith('Z')),false);
  assert.ok(processSnapshot().some(row=>row.pid===neighbor.child.pid),'cleanup is scoped to the original supervisor');
});

test('a changed birth identity cannot authorize an escaped-process signal',{timeout:15000},async t=>{
  const root=fixture(t),armed=path.join(root,'reused-pid');
  const python=spawnSync('python3',['-I','-S','-c','import sys; print(sys.executable)'],{encoding:'utf8',timeout:4000}).stdout.trim();
  assert.ok(path.isAbsolute(python));
  writeFileSync(path.join(root,'python3'),`#!${process.execPath}
const fs=require('node:fs');const r=require('node:child_process').spawnSync(${JSON.stringify(python)},process.argv.slice(2),{encoding:'utf8'});
if(r.status===0 && fs.existsSync(${JSON.stringify(armed)})){
  const pid=Number(fs.readFileSync(${JSON.stringify(armed)},'utf8')),rows=JSON.parse(r.stdout);
  for(const row of rows)if(row.pid===pid)row.started='different process birth';
  process.stdout.write(JSON.stringify(rows),()=>process.exit(r.status??1));
}else process.stdout.write(r.stdout||'',()=>process.exit(r.status??1));
`,{mode:0o700});
  let observed;
  const run=await start(t,['-e',orphanTree],{env:{...process.env,PATH:`${root}${path.delimiter}${process.env.PATH}`},onEvidence:value=>{observed=value;}});
  const output=capture(run.child.stdout);run.child.stdin.end();await until(()=>output().includes('\n'));const pid=Number(output().trim());
  await until(()=>observed?.escaped.some(row=>row.pid===pid) && processSnapshot().some(row=>row.pid===pid && row.parent===1));
  const identity=observed.escaped.find(row=>row.pid===pid);
  t.after(()=>{if(processSnapshot().some(row=>row.pid===pid && row.started===identity.started))try{process.kill(pid,'SIGKILL');}catch{}});
  writeFileSync(armed,String(pid));run.stop();const result=await run.completion;
  assert.ok(processSnapshot().some(row=>row.pid===pid && row.started===identity.started && !row.state.startsWith('Z')),'a PID with a different observed birth was not signalled');
  assert.equal(result.processTreeExited,false,'the parent independently verifies real exit evidence');
});

test('a durable attempt retains its slot until the owned tree exits, then reconciles without replay',{timeout:15000},async t=>{
  const root=fixture(t),store=new NeuralDeepCoordinationStore({databasePath:path.join(root,'coordination.sqlite')});t.after(()=>store.close());
  const run=await start(t,['-e',tree]);const output=capture(run.child.stdout);run.child.stdin.end();await until(()=>output().includes('\n'));
  store.enqueue({attemptId:'attempt',workloadId:'task',surface:'task_chat',coordinationKeyHash:coordinationHash('scope'),queuedAt:new Date().toISOString()});
  const lease=store.claim('attempt',1);
  store.beginRuntimeRun({runId:'runtime',requestHash:'d'.repeat(64),receipt:{process_protocol:1,worker_pid:2147483647,
    worker_started:'absent fixture worker',dispatch_authorized:true,process_evidence:run.evidence,usage_ledger_recorded:false}});
  store.attachRuntime('attempt',lease.ownerToken,'runtime');
  assert.throws(()=>store.finish('attempt',lease.ownerToken,'completed'),/exit_unconfirmed/);
  assert.equal(store.get('attempt').status,'resume_confirmation_required');
  assert.throws(()=>store.reconcileWorkload('task'),/exit_unconfirmed/);
  run.stop();await run.completion;
  assert.equal(store.reconcileWorkload('task','cancelled'),1);
  assert.equal(store.runtimeRun('runtime').process_exited,true);
  assert.equal(store.runtimeRun('runtime').adapter_closed,true);
  assert.equal(store.runtimeRun('runtime').usage_status,'unknown');
  assert.equal(store.runtimeRun('runtime').usage_ledger_recorded,false);
  assert.equal(store.get('attempt').status,'cancelled');
});
