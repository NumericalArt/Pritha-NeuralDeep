import assert from 'node:assert/strict';import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {NeuralDeepCoordinationStore,coordinationHash} from '../scripts/neuraldeep/coordination-store.mjs';
import {NeuralDeepOperatorRequests} from '../scripts/neuraldeep/operator-requests.mjs';
const execute=promisify(execFile),sourceUrl=pathToFileURL(path.resolve(import.meta.dirname,'../scripts/neuraldeep/coordination-store.mjs')).href;
function fixture(t){const root=mkdtempSync(path.join(os.tmpdir(),'nd-operator-request-'));const file=path.join(root,'admission.sqlite'),store=new NeuralDeepCoordinationStore({databasePath:file}),requests=new NeuralDeepOperatorRequests(store);t.after(()=>{store.close();rmSync(root,{recursive:true,force:true});});return{store,requests,file};}
const registration={requestId:'question_a',taskId:'task_a',topicId:'topic_a',scope:coordinationHash('topic_a'),generation:1,ownerGeneration:0,kind:'answer',context:{question:'Synthetic choice?',permissions:'read-only'}};
const acceptance={requestId:'question_a',taskId:'task_a',topicId:'topic_a',generation:1,expectedRevision:1,answer:{text:'synthetic answer'}};
test('duplicate answers replay one immutable intent and conflicting or cross-generation answers cannot dispatch',t=>{
 const f=fixture(t);f.requests.register(registration);const a=f.requests.accept(acceptance);assert.equal(a.dispatch,true);const b=f.requests.accept(acceptance);assert.equal(b.dispatch,false);assert.equal(a.intentId,b.intentId);
 f.requests.finish(a.requestId,a.intentId,{ok:true,taskId:'task_a',accepted:true});assert.equal(f.requests.accept(acceptance).result.accepted,true);
 assert.throws(()=>f.requests.accept({...acceptance,answer:{text:'different'}}),/answer_conflict/);assert.throws(()=>f.requests.accept({...acceptance,generation:2}),/identity_conflict/);
 assert.throws(()=>f.requests.register({...registration,context:{question:'changed'}}),/identity_conflict/);
});
test('two Node processes share one operator response receipt before any side effect',async t=>{
 const f=fixture(t);f.requests.register(registration);
 const code=`import {NeuralDeepCoordinationStore} from ${JSON.stringify(sourceUrl)};import {NeuralDeepOperatorRequests} from ${JSON.stringify(new URL('../scripts/neuraldeep/operator-requests.mjs',import.meta.url).href)};const store=new NeuralDeepCoordinationStore({databasePath:process.argv[1]});const result=new NeuralDeepOperatorRequests(store).accept(${JSON.stringify(acceptance)});console.log(JSON.stringify({dispatch:result.dispatch,intentId:result.intentId}));store.close();`;
 const values=await Promise.all([0,1].map(()=>execute(process.execPath,['--input-type=module','-e',code,f.file],{timeout:10000}).then(r=>JSON.parse(r.stdout))));assert.equal(values.filter(r=>r.dispatch).length,1);assert.equal(values[0].intentId,values[1].intentId);
});
test('a changed logical owner rejects an old question and a lost acknowledgement does not restart work',t=>{
 const f=fixture(t);const owner=f.store.holdLogicalOwner(registration.scope,registration.taskId);f.requests.register({...registration,ownerGeneration:owner.generation});
 f.store.releaseLogicalOwner(registration.scope,registration.taskId,owner.generation);f.store.holdLogicalOwner(registration.scope,registration.taskId);
 assert.throws(()=>f.requests.accept(acceptance),/owner_changed/);
 f.requests.register({...registration,requestId:'question_b',ownerGeneration:2});const next={...acceptance,requestId:'question_b'},r=f.requests.accept(next);
 f.requests.finish(r.requestId,r.intentId,{ok:false,error:'response_dispatch_unknown'});const replay=f.requests.accept(next);assert.equal(replay.dispatch,false);assert.equal(replay.status,'recovery_required');
});
