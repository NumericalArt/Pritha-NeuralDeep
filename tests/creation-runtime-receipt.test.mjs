import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuralDeepCoordinationStore} from '../scripts/neuraldeep/coordination-store.mjs';
import {creationRuntimeReceipt} from '../scripts/neuraldeep/creation-runtime-receipt.mjs';
test('creation accounting uses bound per-run delta and rejects missing coverage or live descendants',()=>{
  const store=new NeuralDeepCoordinationStore();
  const write=(id,value)=>{store.beginRuntimeRun({runId:id,requestHash:'a'.repeat(64),receipt:{workload_id:'turn_test'}});store.updateRuntimeRun(id,value);};
  try {
    assert.equal(creationRuntimeReceipt(store,'turn_test').tokens,null);
    assert.equal(creationRuntimeReceipt(store,'turn_test',{dispatched:false}).tokens,0);
    write('run_one',{process_exited:true,process_tree_exited:true,adapter_closed:true,
      usage_event:{usage:{totalTokens:12000}},usage_record:{usageKnown:true,usage:{totalTokens:120}}});
    const one=creationRuntimeReceipt(store,'turn_test');
    assert.equal(one.tokens,120);assert.equal(one.processExited,true);
    assert.deepEqual(creationRuntimeReceipt(store,'turn_test'),one);
    write('run_two',{process_exited:false,process_tree_exited:false,adapter_closed:false,usage_record:{usageKnown:false,usage:{totalTokens:0}}});
    assert.equal(creationRuntimeReceipt(store,'turn_test').tokens,null);
    assert.equal(creationRuntimeReceipt(store,'turn_test').processExited,false);
    store.updateRuntimeRun('run_two',{process_exited:true,process_tree_exited:true,adapter_closed:true,usage_record:{usageKnown:true,usage:{totalTokens:80}}});
    assert.equal(creationRuntimeReceipt(store,'turn_test').tokens,200);
    assert.equal(creationRuntimeReceipt(store,'other').tokens,null);
  } finally {store.close();}
});
