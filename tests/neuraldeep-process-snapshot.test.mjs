import assert from 'node:assert/strict';
import test from 'node:test';
import {processSnapshot,processTreeExited} from '../scripts/neuraldeep/process-snapshot.mjs';

const rows=[{pid:40,parent:1,group:40,session:40,state:'S',started:'exact fixture start'}];

test('a transient snapshot timeout is retried with a fresh bounded probe',()=>{
  let calls=0;
  const snapshot=processSnapshot({runProbe(_command,_args,options){
    assert.equal(options.timeout,4000);
    return ++calls===1 ? {status:null,error:{code:'ETIMEDOUT'}} : {status:0,stdout:JSON.stringify(rows)};
  }});
  assert.equal(calls,2);
  assert.deepEqual(snapshot,rows);
  assert.equal(processTreeExited({version:1,session:40,escaped:[]},snapshot),false);
});

test('persistent timeouts remain failures and never return stale exit evidence',()=>{
  let calls=0;
  assert.throws(()=>processSnapshot({runProbe(){calls++;return {status:70};}}),/process_snapshot_timeout/);
  assert.equal(calls,2);
  assert.equal(processTreeExited({version:1,session:40,coverage:'unknown',escaped:[]},[]),false);
});

test('malformed ownership data fails closed without accepting another snapshot',()=>{
  let calls=0;
  assert.throws(()=>processSnapshot({runProbe(){calls++;return {status:0,stdout:'[]'};}}),/process_snapshot_invalid/);
  assert.equal(calls,1);
});
