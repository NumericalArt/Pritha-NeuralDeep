import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";
import { installOutcomeVerifierPreset, outcomeVerifierPresetFiles, renderOutcomeVerifierPreset } from "../scripts/agents-mother/outcome-verifier-presets.mjs";
import { inspectProtectedTrialInputs } from "../scripts/agents-mother/delivery-worktree.mjs";
import { apiProcessFiles } from "../scripts/agents-mother/scaffold/api-process.mjs";

function project(t, preset) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-host-verifier-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  installOutcomeVerifierPreset(root, preset);
  return root;
}
function run(root, preset) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tests/trials/pritha-outcome-verifier.mjs", preset], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => output += data);
    child.stderr.on("data", data => output += data);
    child.on("error", reject);
    child.on("exit", code => resolve({ code, output }));
  });
}
const feedImplementation = `import {writeFileSync} from 'node:fs'; import path from 'node:path';
try { const response = await fetch(process.env.PRITHA_SOURCE_URL); if (!response.ok) throw new Error('source unavailable');
const value = await response.json(); if (!Array.isArray(value.items)) throw new Error('invalid source');
writeFileSync(path.join(process.env.PRITHA_DATA_DIR,'latest.json'), JSON.stringify(value));
} catch { process.exitCode = 1; }`;

test("host JSON verifier exercises real upstream, stored shape, deduplication and recovery", async t => {
  const root = project(t, "public-json-feed-v1");
  writeFileSync(path.join(root, "scripts/refresh.mjs"), feedImplementation);
  const result = await run(root, "public-json-feed-v1");
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /"sourceRequests":5/);
});

test("a stdout-only smoke stub cannot pass a substantive host trial", async t => {
  for (const preset of ["public-json-feed-v1", "llm-http-app-v1"]) {
    const root = project(t, preset);
    for (const script of ["refresh", "server", "smoke-test"]) writeFileSync(path.join(root, `scripts/${script}.mjs`), "console.log('Smoke test passed.');\n");
    const result = await run(root, preset);
    assert.notEqual(result.code, 0, result.output);
    assert.doesNotMatch(result.output, /"verified":/);
  }
});

test("malformed-source success and last-good data loss fail the independent verifier", async t => {
  const root = project(t, "public-json-feed-v1");
  writeFileSync(path.join(root, "scripts/refresh.mjs"), feedImplementation.replace("process.exitCode = 1;", "writeFileSync(path.join(process.env.PRITHA_DATA_DIR,'latest.json'), '{}'); process.exitCode = 1;"));
  const result = await run(root, "public-json-feed-v1");
  assert.notEqual(result.code, 0);
  assert.match(result.output, /preserve the last successful data/);
});

test("host verifier source has an exact protected hash and is never silently overwritten", t => {
  const preset = "llm-http-app-v1", root = project(t, preset), [file] = outcomeVerifierPresetFiles(preset);
  const trial = { id: "preset-behavior", kind: "automated", argv: ["node", file.path, preset], cwd: ".", verifierInputs: [{ path: file.path, hash: file.hash, provenance: `host-template:${preset}` }], productTargets: ["scripts/server.mjs"] };
  assert.ok(inspectProtectedTrialInputs({ trials: [trial] }, root).some(input => input.hash === file.hash));
  writeFileSync(path.join(root, file.path), "console.log('forged');\n");
  assert.throws(() => inspectProtectedTrialInputs({ trials: [trial] }, root), /reviewed hash/);
  assert.throws(() => installOutcomeVerifierPreset(root, preset), /explicit Outcome revision/);
  rmSync(path.join(root, file.path));
  assert.throws(() => inspectProtectedTrialInputs({ trials: [trial] }, root), /missing/);
  assert.throws(() => renderOutcomeVerifierPreset("invented-api-v7", "core:01-flow"), /Unsupported/);
});

// Purpose-built test product with a real server and durable JSON state. This
// exercises the verifier protocol; it does not claim the operator SQLite/UI
// acceptance criteria of an eventual child application.
const appImplementation = `import http from 'node:http'; import {readFileSync,writeFileSync} from 'node:fs'; import path from 'node:path';
const file=path.join(process.env.PRITHA_DATA_DIR,'fixture-state.json'); let state={sources:[],items:[],digests:[]};
try { state=JSON.parse(readFileSync(file,'utf8')); } catch {}
const save=()=>writeFileSync(file,JSON.stringify(state));
http.createServer(async(req,res)=>{
let raw='';for await(const c of req)raw+=c; const body=raw?JSON.parse(raw):{};
const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
try {
if(req.url==='/health')return send({status:'ok'});
if(req.url==='/'){res.end('<!doctype html><html><body>Fixture UI</body></html>');return;}
if(req.url==='/api/sources'&&req.method==='POST'){const item={id:String(state.sources.length+1),...body};state.sources.push(item);save();return send(item);}
if(req.url==='/api/refresh'){const errors=[];for(const source of state.sources){try{const r=await fetch(source.url);if(!r.ok)throw Error('Unavailable');const xml=await r.text();
const entries=[...xml.matchAll(/<item>([\\s\\S]*?)<\\/item>/g)];if(!entries.length)throw Error('Malformed feed');
for(const [,entry]of entries){const tag=name=>entry.match(new RegExp('<'+name+'>(.*?)</'+name+'>'))?.[1];const url=tag('link');if(!state.items.some(i=>i.url===url))state.items.push({id:tag('guid'),title:tag('title'),url,read:false,favorite:false});}
}catch(e){errors.push(e.message);}}save();return send({errors});}
if(req.url==='/api/items')return send({items:state.items});
if(req.url.startsWith('/api/items/')&&req.method==='PATCH'){const id=decodeURIComponent(req.url.split('/').pop());const item=state.items.find(i=>i.id===id);Object.assign(item,body);save();return send(item);}
if(req.url==='/api/digests'&&req.method==='GET')return send({digests:state.digests});
if(req.url==='/api/digests'&&req.method==='POST'){
 const selected=state.items.filter(i=>body.itemIds.includes(i.id));
 const response=await fetch(process.env.PRITHA_LLM_BASE_URL+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.PRITHA_LLM_TOKEN},body:JSON.stringify({model:process.env.PRITHA_LLM_MODEL,messages:[{role:'user',content:JSON.stringify(selected)}],stream:false,max_tokens:4096})});
 if(!response.ok)throw Error('Provider temporarily unavailable; retry');const answer=await response.json();const markdown=answer.choices?.[0]?.message?.content;if(!markdown)throw Error('Invalid provider response; retry');
 const item={id:String(state.digests.length+1),markdown};state.digests.push(item);save();return send(item);
}
if(req.url.endsWith('/export')){const id=decodeURIComponent(req.url.split('/')[3]);res.end(state.digests.find(d=>d.id===id).markdown);return;}
return send({error:'missing'},404);
}catch(e){return send({error:e.message},502);}
}).listen(Number(process.env.PORT),'127.0.0.1');`;

test("LLM HTTP preset checks provider result, 429, malformed response, source recovery and persistence", async t => {
  const root = project(t, "llm-http-app-v1");
  writeFileSync(path.join(root, "scripts/server.mjs"), appImplementation);
  const result = await run(root, "llm-http-app-v1");
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /"providerRequests":6/);
});

test("LLM HTTP preset rejects a product that ignores the instance-scoped bearer", async t => {
  const root = project(t, "llm-http-app-v1");
  writeFileSync(path.join(root, "scripts/server.mjs"), appImplementation.replace("'Authorization':'Bearer '+process.env.PRITHA_LLM_TOKEN", "'Authorization':'Bearer hardcoded-provider-key'"));
  const result = await run(root, "llm-http-app-v1");
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Successful digest must have a stored identity/);
});

test("LLM HTTP verifier rejects loss of user state after restart", async t => {
  const root = project(t, "llm-http-app-v1");
  writeFileSync(path.join(root, "scripts/server.mjs"), appImplementation.replace("state=JSON.parse(readFileSync(file,'utf8'));", "state=JSON.parse(readFileSync(file,'utf8'));state.items=state.items.map(i=>({...i,read:false,favorite:false}));"));
  const result = await run(root, "llm-http-app-v1");
  assert.notEqual(result.code, 0, result.output);
  assert.match(result.output, /Read\/favorite state must survive restart/);
});

test("process healthcheck reads live /health without refreshing or running smoke", async t => {
  const root = project(t, "public-json-feed-v1");
  const files = apiProcessFiles([], { agentName: "Fixture", envExampleVariables: "FIXTURE_PORT=3000" }, { interfaces: [], adapter: "api-process-v1" }, {});
  const health = files.find(file => file.path === "scripts/healthcheck.mjs");
  writeFileSync(path.join(root, health.path), health.content);
  writeFileSync(path.join(root, "scripts/smoke-test.mjs"), "throw new Error('Health must not execute smoke');");
  const requests = [], server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ status: "ok" }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => server.close());
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [health.path], { cwd: root, env: { ...process.env, FIXTURE_PORT: String(server.address().port) }, stdio: "ignore" });
    child.on("error", reject); child.on("exit", resolve);
  });
  assert.equal(code, 0);
  assert.deepEqual(requests, ["/health"]);
});
