import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from "../scripts/neuraldeep/coordination-store.mjs";
import { processSnapshot } from "../scripts/neuraldeep/process-snapshot.mjs";
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
  for (const [index, args] of [["exec"], ["exec", "resume", "synthetic-session"]].entries()) {
    const result = await runCodexWithNeuralDeep(runtime, args, { input: "synthetic", runId: `timing-${index}`, model: "fixture" });
    assert.equal(result.code, 0);
    const actual = JSON.parse(readFileSync(capturedArgs, "utf8"));
    assert.ok(actual.includes("model_providers.neuraldeep.stream_idle_timeout_ms=960000"));
    assert.ok(actual.includes("model_providers.neuraldeep.request_max_retries=0"));
    assert.ok(actual.includes("model_providers.neuraldeep.stream_max_retries=0"));
  }
  const events = readFileSync(runtime.provenancePath, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const timings = events.filter(event => event.event === "provider_request_finished");
  assert.equal(timings.length, 2);
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
  writeFileSync(binary,`#!${process.execPath}\nconst {spawn}=require('node:child_process');const grand=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});process.on('SIGTERM',()=>{});console.log(JSON.stringify({type:'fixture.ready',worker:process.pid,grand:grand.pid}));setInterval(()=>{},1000);\n`,{mode:0o700});
  writeFileSync(parentFile,`import {runCodexWithNeuralDeep,neuralDeepRuntimeConfig} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/neuraldeep-codex.mjs')).href)};await runCodexWithNeuralDeep(neuralDeepRuntimeConfig(),['exec'],{input:'synthetic',runId:'crashed-fixture',model:'fixture'});`);
  const parent=spawn(process.execPath,[parentFile],{stdio:['ignore','pipe','pipe'],env:{...process.env,
    PRITHA_STATE_ROOT:stateRoot,PRITHA_CODEX_BIN:binary,PRITHA_NEURALDEEP_CODEX_HOME:path.join(stateRoot,'home'),
    PRITHA_NEURALDEEP_KEYCHAIN_SERVICE:'unused-nd-unit-fixture',PRITHA_NEURALDEEP_UPSTREAM_ORIGIN:'https://neuraldeep.invalid',PRITHA_NEURALDEEP_ADMISSION_RECEIPT:''}});
  parent.stderr.resume();let output='';parent.stdout.setEncoding('utf8');parent.stdout.on('data',chunk=>output+=chunk);
  t.after(()=>{if(parent.exitCode===null&&!parent.signalCode)parent.kill('SIGTERM');});
  for(let n=0;n<80&&!output.includes('fixture.ready');n++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(output.includes('fixture.ready'));
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
