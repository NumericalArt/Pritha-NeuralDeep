import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import * as metadata from '../scripts/agents-mother/project-metadata-async.mjs';

function fixture(t, workerSource) {
  const root=mkdtempSync(path.join(os.tmpdir(),'pritha-metadata-'));
  const project=path.join(root,'child'),codeRoot=path.join(root,'code');
  mkdirSync(path.join(project,'operations'),{recursive:true});
  mkdirSync(path.join(codeRoot,'scripts/agents-mother'),{recursive:true});
  writeFileSync(path.join(project,'operations/manifest.json'),JSON.stringify({version:'1.0.0',health_url:'http://127.0.0.1:4999/health'}));
  const realWorker=pathToFileURL(path.resolve('scripts/agents-mother/project-metadata-worker.mjs')).href;
  writeFileSync(path.join(codeRoot,'scripts/agents-mother/project-metadata-worker.mjs'),workerSource || `await import(${JSON.stringify(realWorker)});`);
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return {root,project,codeRoot,realWorker};
}

test('delayed metadata worker still reads an installed manifest under the default host policy',async t=>{
  const f=fixture(t);
  writeFileSync(path.join(f.codeRoot,'scripts/agents-mother/project-metadata-worker.mjs'),
    `await new Promise(resolve=>setTimeout(resolve,4500)); await import(${JSON.stringify(f.realWorker)});`);
  const result=await metadata.readProjectMetadataAsync(f.project,{codeRoot:f.codeRoot});
  assert.equal(result.manifest.issue,null);
  assert.equal(result.manifest.present,true);
  assert.equal(result.manifest.manifest.health_url,'http://127.0.0.1:4999/health');
});

test('timed-out metadata is unknown while a missing manifest and unsafe manifest remain distinct',async t=>{
  const f=fixture(t,'setInterval(()=>{},1000);');
  const unknown=await metadata.readProjectMetadataAsync(f.project,{codeRoot:f.codeRoot,timeoutMs:200});
  assert.equal(unknown.manifest.present,null);
  assert.equal(unknown.manifest.issue,'project-metadata-timeout');
  assert.match(metadata.projectMetadataIssueMessage(unknown.manifest.issue),/temporarily unavailable/i);
  assert.doesNotMatch(metadata.projectMetadataIssueMessage(unknown.manifest.issue),/not installed|missing|invalid|unsafe/i);
  rmSync(path.join(f.project,'operations/manifest.json'));
  const missing=await metadata.readProjectMetadataAsync(f.project,{codeRoot:process.cwd(),timeoutMs:15000});
  assert.equal(missing.manifest.present,false);
  assert.equal(missing.manifest.issue,null);
  const outside=path.join(f.root,'outside.json');writeFileSync(outside,'{}');
  symlinkSync(outside,path.join(f.project,'operations/manifest.json'));
  const unsafe=await metadata.readProjectMetadataAsync(f.project,{codeRoot:process.cwd(),timeoutMs:15000});
  assert.equal(unsafe.manifest.present,true);
  assert.equal(unsafe.manifest.manifest,null);
  assert.match(metadata.projectMetadataIssueMessage(unsafe.manifest.issue),/invalid or unsafe/i);
});
