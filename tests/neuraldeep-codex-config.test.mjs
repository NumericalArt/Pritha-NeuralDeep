import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from "../scripts/neuraldeep/coordination-store.mjs";
import { processSnapshot } from "../scripts/neuraldeep/process-snapshot.mjs";
import { creationRuntimeReceipt } from '../scripts/neuraldeep/creation-runtime-receipt.mjs';
import path from "node:path";
import test from "node:test";
import {
  buildCodexExecArgs,
  neuralDeepApiRequest,
  neuralDeepRuntimeConfig,
  renderCodexConfig,
  resolveNeuralDeepPaths,
  runCodexWithNeuralDeep,
  sanitizedCodexEnvironment,
} from "../scripts/neuraldeep-codex.mjs";

test("derives isolated state beside the project", () => {
  const paths = resolveNeuralDeepPaths({});
  assert.equal(paths.stateRoot, path.join(path.dirname(paths.projectRoot), `${path.basename(paths.projectRoot)}-state`, "main"));
  assert.equal(paths.codexHome, `${paths.stateRoot}/codex-home`);
});

test("renders a local provider with Keychain command authentication", () => {
  const runtime = neuralDeepRuntimeConfig({
    PRITHA_STATE_ROOT: "/tmp/pritha-neuraldeep-test-state",
    PRITHA_NEURALDEEP_ADAPTER_PORT: "18888",
    PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: "test-neuraldeep-service",
  });
  const config = renderCodexConfig(runtime);
  assert.match(config, /base_url = "http:\/\/127\.0\.0\.1:18888\/v1"/);
  assert.match(config, /neuraldeep-credential\.mjs/);
  assert.match(config, /project_doc_max_bytes = 65536/);
  assert.match(config, /stream_idle_timeout_ms = 960000/);
  assert.match(config, /check_for_update_on_startup = false/);
  assert.match(config, /\[analytics\][\s\S]*enabled = false/);
  assert.match(config, /remote_plugin = false/);
  assert.match(config, /\[otel\][\s\S]*exporter = "none"/);
  assert.match(config, /log_user_prompt = false/);
  assert.doesNotMatch(config, /\[agents\]|max_concurrent_threads_per_session/);
  assert.match(config, /"test-neuraldeep-service"/);
  assert.doesNotMatch(config, /(?:^|["'\s:=])sk-[A-Za-z0-9_-]{16,}/m);
  assert.doesNotMatch(config, /^\s*(?:PRITHA_)?NEURALDEEP_API_KEY\s*=/m);
  assert.doesNotMatch(config, /model_catalog_json/);
});

test("rejects an invalid adapter port", () => {
  assert.throws(() => neuralDeepRuntimeConfig({ PRITHA_NEURALDEEP_ADAPTER_PORT: "70000" }), /Invalid adapter port/);
});

test("non-voice Codex environment strips every OpenAI credential", () => {
  const runtime = neuralDeepRuntimeConfig({ PRITHA_STATE_ROOT: "/tmp/pritha-neuraldeep-state" });
  const environment = sanitizedCodexEnvironment(runtime, {
    OPENAI_API_KEY: "must-not-leak",
    OPENAI_ADMIN_API_KEY: "must-not-leak",
    AZURE_OPENAI_API_KEY: "must-not-leak",
    SAFE_VALUE: "kept",
  });
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.OPENAI_ADMIN_API_KEY, undefined);
  assert.equal(environment.AZURE_OPENAI_API_KEY, undefined);
  assert.equal(environment.SAFE_VALUE, "kept");
  assert.equal(environment.CODEX_HOME, runtime.codexHome);
});

test("builds persistent first turns and resumable CLI turns without exposing prompts", () => {
  const first = buildCodexExecArgs({ model: "gpt-oss-120b", effort: "high", cwd: "/tmp/project", sandbox: "workspace-write" });
  assert.deepEqual(first.slice(0, 2), ["exec", "--json"]);
  assert.equal(first.includes("--ephemeral"), false);
  assert.equal(first.at(-1), "-");
  assert.equal(first.includes("gpt-oss-120b"), true);
  assert.equal(first.includes('model_reasoning_effort="high"'), true);

  const resumed = buildCodexExecArgs({ model: "qwen3", resume: "session-123", sandbox: "read-only" });
  assert.deepEqual(resumed.slice(0, 3), ["exec", "resume", "--json"]);
  assert.equal(resumed.includes("session-123"), true);
  assert.equal(resumed.at(-1), "-");
  assert.doesNotMatch(resumed.join(" "), /model_reasoning_effort/);
  assert.throws(
    () => buildCodexExecArgs({ model: "qwen3", sandbox: "read-only", network: "enabled" }),
    /network_requires_workspace_write_sandbox/,
  );
  assert.throws(
    () => buildCodexExecArgs({ model: "qwen3", sandbox: "danger-full-access", network: "disabled" }),
    /network_cannot_be_disabled_in_danger_full_access/,
  );
});

test("NeuralDeep API requests preserve status and Retry-After for outage policy", async () => {
  const runtime = neuralDeepRuntimeConfig({ PRITHA_STATE_ROOT: "/tmp/pritha-neuraldeep-state" });
  for (const status of [401, 403, 429, 500, 502, 503, 504]) {
    await assert.rejects(
      neuralDeepApiRequest("limits", runtime, {
        token: "test-token",
        fetchImpl: async (_url, init) => {
          assert.equal(init.headers.authorization, "Bearer test-token");
          return new Response(JSON.stringify({ error: "fixture" }), {
            status,
            headers: status === 429 ? { "retry-after": "41" } : {},
          });
        },
      }),
      (error) => {
        assert.equal(error.statusCode, status);
        assert.equal(error.retryAfter, status === 429 ? "41" : null);
        return true;
      },
    );
  }
});

test("NeuralDeep API request timeout aborts the in-flight request", async () => {
  const runtime = neuralDeepRuntimeConfig({ PRITHA_STATE_ROOT: "/tmp/pritha-neuraldeep-state" });
  await assert.rejects(
    neuralDeepApiRequest("limits", runtime, {
      token: "test-token",
      timeoutMs: 5,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
    }),
    (error) => error?.name === "AbortError" || /abort/i.test(String(error)),
  );
});

test('a failed ownership probe records authoritative no-dispatch before any network or stock CLI', async () => {
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'pritha-preflight-receipt-'));
  const bin=path.join(stateRoot,'bin');mkdirSync(bin);
  writeFileSync(path.join(bin,'python3'),`#!${process.execPath}\nprocess.stdout.write('[]');\n`,{mode:0o700});
  const previousPath=process.env.PATH,previousFetch=globalThis.fetch;
  const runtime=neuralDeepRuntimeConfig({PRITHA_STATE_ROOT:stateRoot,PRITHA_CODEX_BIN:path.join(stateRoot,'must-not-launch'),PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'pritha-test-none'});
  let store;
  try {
    process.env.PATH=bin+path.delimiter+previousPath;
    globalThis.fetch=async()=>{throw Error('preflight must stop before network');};
    await assert.rejects(runCodexWithNeuralDeep(runtime,['exec'],{input:'fixture',runId:'failed-probe',workloadId:'fixture_probe_turn'}),/process_snapshot_invalid/);
    store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(stateRoot,runtime.projectRoot));
    const receipt=store.runtimeRun('failed-probe');
    assert.equal(receipt.worker_started,null);
    assert.equal(receipt.dispatch_authorized,false);assert.equal(receipt.exit_evidence,'no_stock_dispatch');
    const usage=creationRuntimeReceipt(store,'fixture_probe_turn');
    assert.equal(usage.tokens,0);assert.equal(usage.processExited,true);assert.equal(usage.coverage,'complete');
    assert.equal(usage.blocker.code,'process_snapshot_invalid');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM provider_dispatches').get().count,0);
  } finally {
    globalThis.fetch=previousFetch;if(previousPath===undefined)delete process.env.PATH;else process.env.PATH=previousPath;
    store?.close();rmSync(stateRoot,{recursive:true,force:true});
  }
});

test("records a finished provenance event when the Codex binary cannot launch", async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-neuraldeep-launch-"));
  const runtime = neuralDeepRuntimeConfig({
    PRITHA_STATE_ROOT: stateRoot,
    PRITHA_CODEX_BIN: path.join(stateRoot, "missing-codex-binary"),
  });
  try {
    await assert.rejects(
      runCodexWithNeuralDeep(runtime, ["exec"], { input: "test" }),
      (error) => error?.code === "ENOENT",
    );
    const events = readFileSync(runtime.provenancePath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.event), ["run_started", "run_finished"]);
    assert.equal(events[1].provider, "neuraldeep");
    assert.equal(events[1].error_class, "runtime_launch_failed");
    assert.equal(events[1].launch_error_code, "ENOENT");
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});


test("launcher commits exit and adapter proof, and duplicate dispatch cannot overwrite its receipt", {timeout:15000}, async t => {
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),"nd-launch-receipt-"));t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const binary=path.join(stateRoot,"fake-codex");
  writeFileSync(binary,`#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'thread.started',thread_id:'synthetic-session'}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));});\n`,{mode:0o700});
  const runtime=neuralDeepRuntimeConfig({PRITHA_STATE_ROOT:stateRoot,PRITHA_CODEX_BIN:binary,
    PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'unused-nd-unit-fixture',PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:'https://neuraldeep.invalid'});
  const result=await runCodexWithNeuralDeep(runtime,['exec'],{input:'synthetic',runId:'fixture-receipt',model:'fixture'});
  assert.equal(result.code,0);assert.equal(result.processTreeExited,true);
  const store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(stateRoot,runtime.projectRoot));t.after(()=>store.close());
  const before=store.runtimeRun(result.runId);
  assert.equal(before.process_exited,true);assert.equal(before.adapter_closed,true);assert.equal(before.process_tree_exited,true);
  await assert.rejects(runCodexWithNeuralDeep(runtime,['exec'],{input:'synthetic',runId:'fixture-receipt',model:'fixture'}),/already_dispatched/);
  assert.deepEqual(store.runtimeRun(result.runId),before);
});

test("initial and resumed launches override stale CLI timeouts and persist only response timing metadata", { timeout: 20000 }, async t => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "nd-timing-launch-"));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const binary = path.join(stateRoot, "fake-codex");
  const capturedArgs = path.join(stateRoot, "args.json");
  writeFileSync(binary, `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('fixture-cli'); process.exit(0); }
require('node:fs').writeFileSync(${JSON.stringify(capturedArgs)}, JSON.stringify(process.argv.slice(2)));
const base = JSON.parse(process.argv.find(x => x.startsWith('model_providers.neuraldeep.base_url=')).split('=').slice(1).join('='));
process.stdin.resume();
process.stdin.on('end', async () => {
  const result = await fetch(base + '/responses', {method:'POST', body:JSON.stringify({model:'fixture', input:'fixture-private-prompt'})});
  await result.text();
  process.exitCode = result.ok ? 0 : 1;
  console.log(JSON.stringify({type:'turn.completed', usage:{input_tokens:1, output_tokens:1}}));
});
`, { mode: 0o700 });
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, message: "fixture-private-answer" }));
  const runtime = neuralDeepRuntimeConfig({ PRITHA_STATE_ROOT: stateRoot, PRITHA_CODEX_BIN: binary,
    PRITHA_NEURALDEEP_KEYCHAIN_SERVICE: "unused-nd-unit-fixture", PRITHA_NEURALDEEP_UPSTREAM_ORIGIN: "https://neuraldeep.invalid" });
  for (const [index, args] of [["exec"], ["exec", "resume", "synthetic-session"], ["exec"]].entries()) {
    const now=Date.now(),deadline=index===2 ? {version:2,hardDeadlineAt:now+1_800_000,softDeadlineAt:now+1_710_000,requestTimeoutMs:1_770_000,settlementGraceMs:30_000} : undefined;
    const result = await runCodexWithNeuralDeep(runtime, args, { input: "synthetic", runId: `timing-${index}`, model: "fixture", deadline });
    assert.equal(result.code, 0);
    const actual = JSON.parse(readFileSync(capturedArgs, "utf8"));
    assert.ok(actual.includes(`model_providers.neuraldeep.stream_idle_timeout_ms=${deadline?1_800_000:960_000}`));
    assert.ok(actual.includes("model_providers.neuraldeep.request_max_retries=0"));
    assert.ok(actual.includes("model_providers.neuraldeep.stream_max_retries=0"));
  }
  const events = readFileSync(runtime.provenancePath, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const timings = events.filter(event => event.event === "provider_request_finished");
  assert.equal(timings.length, 3);
  for (const event of timings) {
    assert.equal(event.status, 200);
    assert.match(event.request_hash, /^[a-f0-9]{64}$/);
    assert.equal(event.error_code, null);
    assert.ok(event.timings.firstByteMs >= 0);
    assert.ok(event.timings.responseCompletedMs >= event.timings.firstByteMs);
    assert.ok(event.timings.responseBytes > 0);
    assert.equal(event.timings.timedOut, false);
  }
  assert.doesNotMatch(JSON.stringify(events), /fixture-private-(?:prompt|answer)/);
});

test("launcher crash preserves its paid-attempt receipt and recovers only after its CLI tree is gone", {timeout:20000}, async t => {
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),"nd-launch-crash-"));t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const binary=path.join(stateRoot,"fake-codex"),parentFile=path.join(stateRoot,"parent.mjs");
  writeFileSync(binary,`#!${process.execPath}\nif(process.argv.includes('--version')){console.log('fixture-cli');process.exit(0);}\nconst {spawn}=require('node:child_process');const grand=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});process.on('SIGTERM',()=>{});console.log(JSON.stringify({type:'fixture.ready',worker:process.pid,grand:grand.pid}));setInterval(()=>{},1000);\n`,{mode:0o700});
  writeFileSync(parentFile,`import {runCodexWithNeuralDeep,neuralDeepRuntimeConfig} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/neuraldeep-codex.mjs')).href)};await runCodexWithNeuralDeep(neuralDeepRuntimeConfig(),['exec'],{input:'synthetic',runId:'crashed-fixture',model:'fixture'});`);
  const parent=spawn(process.execPath,[parentFile],{stdio:['ignore','pipe','pipe'],env:{...process.env,
    PRITHA_STATE_ROOT:stateRoot,PRITHA_CODEX_BIN:binary,PRITHA_NEURALDEEP_CODEX_HOME:path.join(stateRoot,'home'),
    PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'unused-nd-unit-fixture',PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:'https://neuraldeep.invalid',PRITHA_NEURALDEEP_ADMISSION_RECEIPT:''}});
  let diagnostic='';parent.stderr.setEncoding('utf8');parent.stderr.on('data',chunk=>diagnostic+=chunk);let output='';parent.stdout.setEncoding('utf8');parent.stdout.on('data',chunk=>output+=chunk);
  t.after(()=>{if(parent.exitCode===null&&!parent.signalCode)parent.kill('SIGTERM');});
  for(let n=0;n<80&&!output.includes('fixture.ready');n++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(output.includes('fixture.ready'),diagnostic || 'Fixture did not signal readiness');
  const store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(stateRoot,path.resolve('.')));t.after(()=>store.close());
  const before=store.runtimeRun('crashed-fixture');assert.equal(before.dispatch_authorized,true);
  assert.equal(before.worker_pid,parent.pid);assert.ok(processSnapshot().some(row=>row.session===before.process_evidence.session));
  assert.equal(store.reconcileRuntimeRunExit('crashed-fixture'),false);
  parent.kill('SIGKILL');
  for(let n=0;n<60&&!store.reconcileRuntimeRunExit('crashed-fixture');n++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(store.runtimeRun('crashed-fixture').process_exited,true);
  assert.equal(store.runtimeRun('crashed-fixture').usage_status,'unknown');
  assert.equal(store.runtimeRun('crashed-fixture').usage_ledger_recorded,false);
  store.reconcileDeadWorkers();assert.equal(store.get('runtime_crashed-fixture').status,'resume_confirmation_required');
  store.reconcileWorkload('crashed-fixture','cancelled');assert.equal(store.get('runtime_crashed-fixture').status,'cancelled');
});

test('launcher accounts request receipts without turn.completed and blocks dispatch after an accounting gap', {timeout:20000}, async t=>{
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'nd-partial-usage-'));
  t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const binary=path.join(stateRoot,'fake-codex'),statuses=path.join(stateRoot,'statuses.json');
  writeFileSync(binary,`#!${process.execPath}
if(process.argv.includes('--version')){console.log('fixture-cli');process.exit(0);}
const base=JSON.parse(process.argv.find(x=>x.startsWith('model_providers.neuraldeep.base_url=')).split('=').slice(1).join('='));
process.stdin.resume();process.stdin.on('end',async()=>{
 console.log(JSON.stringify({type:'thread.started',thread_id:'request-usage-session'}));
 const results=[];
 for(let i=0;i<(process.argv.includes('gap')?3:1);i++){
  const response=await fetch(base+'/responses',{method:'POST',body:JSON.stringify({model:'fixture',input:String(i)})});
  await response.text();results.push(response.status);
 }
 require('node:fs').writeFileSync(${JSON.stringify(statuses)},JSON.stringify(results));
});
`,{mode:0o700});
  let upstreamCalls=0,failSecond=false;
  t.mock.method(globalThis,'fetch',async(url)=>{
    if(new URL(url).pathname==='/v1/responses') {
      upstreamCalls++;
      if(failSecond && upstreamCalls===2)throw new Error('incomplete provider response');
      return Response.json({usage:{input_tokens:120,output_tokens:20,total_tokens:140}});
    }
    return Response.json({});
  });
  const runtime=neuralDeepRuntimeConfig({PRITHA_STATE_ROOT:stateRoot,PRITHA_CODEX_BIN:binary,
    PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'unused-nd-unit-fixture',PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:'https://neuraldeep.invalid'});
  for(const runId of ['measured-one','measured-two']) {
    const result=await runCodexWithNeuralDeep(runtime,['exec'],{input:'fixture',runId,model:'fixture'});
    assert.equal(result.usageRecord.usageKnown,true);assert.equal(result.usageRecord.usage.totalTokens,140);
  }
  failSecond=true;upstreamCalls=0;
  const interrupted=await runCodexWithNeuralDeep(runtime,['exec','gap'],{input:'fixture',runId:'interrupted-receipt',model:'fixture'});
  assert.equal(interrupted.usageRecord.usageKnown,false);assert.equal(interrupted.usageRecord.usage.totalTokens,140);
  assert.deepEqual(JSON.parse(readFileSync(statuses,'utf8')),[200,502,409]);assert.equal(upstreamCalls,2);
  const store=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(stateRoot,runtime.projectRoot));
  try {
    const run=store.runtimeRun('interrupted-receipt');
    assert.equal(run.process_tree_exited,true);assert.equal(run.adapter_closed,true);
    assert.equal(run.provider_usage.unknownRequests,1);assert.equal(run.usage_status,'unknown');
  } finally {store.close();}
});


test('launcher enforces a token remainder inside a tool turn without dispatching blocked requests', {timeout:20000}, async t=>{
  const stateRoot=mkdtempSync(path.join(os.tmpdir(),'nd-request-budget-'));
  t.after(()=>rmSync(stateRoot,{recursive:true,force:true}));
  const binary=path.join(stateRoot,'fake-codex'),statuses=path.join(stateRoot,'statuses.json');
  writeFileSync(binary,`#!${process.execPath}
if(process.argv.includes('--version')){console.log('fixture-cli');process.exit(0);}
if(!process.argv.includes('web_search="disabled"') || !process.argv.includes('features.multi_agent=false'))throw Error('Unbounded CLI tools remained enabled');
const base=JSON.parse(process.argv.find(x=>x.startsWith('model_providers.neuraldeep.base_url=')).split('=').slice(1).join('='));
process.stdin.resume();process.stdin.on('end',async()=>{
 const results=[];
 for(let i=0;i<3;i++){
  const response=await fetch(base+'/responses',{method:'POST',body:JSON.stringify({model:'fixture',input:'x'.repeat(20000)+i})});
  await response.text();results.push(response.status);
 }
 require('node:fs').writeFileSync(${JSON.stringify(statuses)},JSON.stringify(results));
});
`,{mode:0o700});
  let calls=0;
  t.mock.method(globalThis,'fetch',async url=>{
    if(new URL(url).pathname==='/v1/responses'){calls++;return Response.json({usage:{input_tokens:21800,output_tokens:200,total_tokens:22000}});}
    return Response.json({});
  });
  const runtime=neuralDeepRuntimeConfig({PRITHA_STATE_ROOT:stateRoot,PRITHA_CODEX_BIN:binary,
    PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'unused-nd-unit-fixture',PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:'https://neuraldeep.invalid'});
  const result=await runCodexWithNeuralDeep(runtime,['exec'],{input:'fixture',runId:'bounded-turn',model:'fixture',tokenBudget:50000});
  assert.equal(calls,1);assert.deepEqual(JSON.parse(readFileSync(statuses,'utf8')),[200,409,409]);
  assert.equal(result.code,1);assert.equal(result.usageRecord.usageKnown,true);assert.equal(result.usageRecord.usage.totalTokens,22000);
  // A failed workload intentionally retains its resource claim. A separate
  // fixture tests zero dispatch without bypassing that recovery boundary.
  const emptyRoot=mkdtempSync(path.join(os.tmpdir(),'nd-empty-budget-'));
  t.after(()=>rmSync(emptyRoot,{recursive:true,force:true}));
  const emptyRuntime={...runtime,...resolveNeuralDeepPaths({PRITHA_STATE_ROOT:emptyRoot})};
  const empty=await runCodexWithNeuralDeep(emptyRuntime,['exec'],{input:'fixture',runId:'no-dispatch',model:'fixture',tokenBudget:1000});
  assert.equal(calls,1);assert.equal(empty.usageRecord.usageKnown,true);assert.equal(empty.usageRecord.usage.totalTokens,0);
});

test('Qwen uses an explicit context declaration and never promises effort control or silently falls back',async()=>{
 const {normalizeModelExecutionRequest,neuralDeepExecutionProfile}=await import('../scripts/neuraldeep/model-execution-profile.mjs');
 const args=buildCodexExecArgs({model:'qwen3.8-27b',effort:'high',cwd:'/tmp/project',sandbox:'read-only'});
 assert.ok(args.includes('model_context_window=262144'));assert.ok(!args.some(a=>a.startsWith('model_reasoning_effort=')));
 assert.throws(()=>buildCodexExecArgs({model:'not a model'}),/invalid_neuraldeep_model/);
 assert.deepEqual(normalizeModelExecutionRequest({model:'qwen3.8-27b',reasoning:{effort:'high',summary:'auto'}}),{model:'qwen3.8-27b',reasoning:{summary:'auto'}});
 assert.equal(neuralDeepExecutionProfile('qwen3.8-27b-noreason').thinking,'disabled-by-selected-alias');
});
