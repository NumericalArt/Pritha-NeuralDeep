import assert from 'node:assert/strict';import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readNeuralDeepMemorySummary} from '../scripts/neuraldeep/memory-summary.mjs';
test('a locked, missing or damaged memory index is explicit and never crashes status or reports measured zero',t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'nd-memory-status-')),file=path.join(root,'memory.sqlite'),db=new DatabaseSync(file);
 t.after(()=>{db.close();rmSync(root,{recursive:true,force:true});});
 for(const name of ['documents','chunks','entities','relations','embeddings'])db.exec(`CREATE TABLE ${name}(id INTEGER); INSERT INTO ${name} VALUES(1)`);
 assert.equal(readNeuralDeepMemorySummary(file).stats[0].count,1);
 db.exec('BEGIN EXCLUSIVE');const start=Date.now(),busy=readNeuralDeepMemorySummary(file);assert.equal(busy.available,false);assert.equal(busy.state,'busy');assert.deepEqual(busy.stats,[]);assert.ok(Date.now()-start<2000);db.exec('ROLLBACK');
 assert.equal(readNeuralDeepMemorySummary(file).state,'ready');assert.equal(readNeuralDeepMemorySummary(path.join(root,'missing')).state,'missing');
 const corrupt=path.join(root,'corrupt');writeFileSync(corrupt,'synthetic corrupt');assert.equal(readNeuralDeepMemorySummary(corrupt).state,'unavailable');
});
