import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const sourceRoot = "interfaces/control-center/src/lib";

function transpile(source, replacements = []) {
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  return output;
}

async function loadRunner() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-neuraldeep-runner-"));
  writeFileSync(path.join(tmp, "private-json.mjs"), transpile(readFileSync(`${sourceRoot}/private-json.ts`, "utf8")));
  writeFileSync(path.join(tmp, "cli-runtime.mjs"), "export class NeuralDeepCliRuntime {}\n");
  writeFileSync(path.join(tmp, "runner.mjs"), transpile(
    readFileSync(`${sourceRoot}/codex-chat/neuraldeep-cli-runner.ts`, "utf8"),
    [
      ['"@/lib/private-json"', '"./private-json.mjs"'],
      ['"./cli-runtime"', '"./cli-runtime.mjs"'],
      ['"../../../../../scripts/neuraldeep/jsonl-reader.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/jsonl-reader.mjs")).href)],
    ],
  ));
  return {
    tmp,
    module: await import(`${pathToFileURL(path.join(tmp, "runner.mjs")).href}?${Math.random()}`),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

function fakeRuntime(stateRoot, script, interruption = { called: false }) {
  return {
    stateRoot,
    startTurn(options) {
      const child = spawn(process.execPath, ["-e", script], { stdio: ["pipe", "pipe", "pipe"] });
      child.stdin.end(options.prompt);
      return child;
    },
    interrupt(child) {
      interruption.called = true;
      if (child.exitCode === null) child.kill("SIGTERM");
    },
  };
}

const baseOptions = {
  model: "qwen3.6-35b-a3b",
  effort: "medium",
  sandbox: "workspace-write",
  cwd: ".",
  prompt: "test",
  resume: null,
  network: false,
};

test("shared runner parses ordered JSONL, retains private logs and classifies provider failures", async () => {
  const loaded = await loadRunner();
  const stateRoot = path.join(loaded.tmp, "state");
  const stdoutLogPath = path.join(stateRoot, "tasks", "stdout.log");
  const stderrLogPath = path.join(stateRoot, "tasks", "stderr.log");
  mkdirSync(stateRoot, { recursive: true });
  const events = [];
  const script = `
process.stdout.write(JSON.stringify({type:"thread.started",thread_id:"session-one"})+"\\n");
process.stdout.write("not-json\\n");
process.stdout.write(JSON.stringify({type:"item.started",item:{id:"cmd",type:"command_execution",status:"in_progress"}})+"\\n");
process.stdout.write(JSON.stringify({type:"pritha.provider_error",error:{class:"rate_limit",code:"rate_limited",status:429,retryAfter:"2"}})+"\\n");
process.stderr.write("provider returned 429\\n");
process.exitCode=1;
`;
  try {
    const runner = new loaded.module.NeuralDeepCliRunner(fakeRuntime(stateRoot, script));
    const handle = await runner.start({
      ...baseOptions,
      stdoutLogPath,
      stderrLogPath,
      onEvent(event) { events.push(event.type); },
    });
    const result = await handle.completion;
    assert.equal(result.threadId, "session-one");
    assert.equal(result.toolActivity, true);
    assert.equal(result.providerError.class, "rate_limit");
    assert.equal(result.malformedEventCount, 1);
    assert.deepEqual(events, ["thread.started", "item.started", "pritha.provider_error"]);
    assert.match(readFileSync(stdoutLogPath, "utf8"), /not-json/);
    assert.match(readFileSync(stderrLogPath, "utf8"), /429/);
    assert.deepEqual(loaded.module.classifyNeuralDeepRunnerFailure(result), {
      kind: "rate_limited",
      code: "neuraldeep_rate_limited",
      retryableBeforeToolActivity: false,
    });
  } finally {
    loaded.cleanup();
  }
});

test("event handler identity mismatch interrupts instead of rebinding a session", async () => {
  const loaded = await loadRunner();
  const stateRoot = path.join(loaded.tmp, "state");
  mkdirSync(stateRoot, { recursive: true });
  const interruption = { called: false };
  const script = `
process.stdout.write(JSON.stringify({type:"thread.started",thread_id:"wrong-session"})+"\\n");
setInterval(()=>{},1000);
`;
  try {
    const runner = new loaded.module.NeuralDeepCliRunner(fakeRuntime(stateRoot, script, interruption));
    const handle = await runner.start({
      ...baseOptions,
      onEvent() {
        const error = new Error("mismatch");
        error.code = "runtime_identity_mismatch";
        throw error;
      },
    });
    const result = await handle.completion;
    assert.equal(interruption.called, true);
    assert.equal(result.handlerErrorCode, "runtime_identity_mismatch");
    assert.equal(loaded.module.classifyNeuralDeepRunnerFailure(result).kind, "runtime_identity_mismatch");
  } finally {
    loaded.cleanup();
  }
});

test("structured model access denial overrides a misleading HTTP 401 in CLI stderr", async () => {
  const loaded = await loadRunner();
  try {
    const script = `process.stdout.write(JSON.stringify({type:'pritha.provider_error',error:{class:'access_denied',code:'key_model_access_denied',status:401}})+'\\n');process.stderr.write('unexpected status 401 Unauthorized');process.exitCode=1;`;
    const result = await (await new loaded.module.NeuralDeepCliRunner(fakeRuntime(loaded.tmp,script)).start(baseOptions)).completion;
    assert.deepEqual(loaded.module.classifyNeuralDeepRunnerFailure(result), {
      kind: "access_denied", code: "neuraldeep_access_denied", retryableBeforeToolActivity: false,
    });
    assert.equal(loaded.module.classifyNeuralDeepRunnerFailure({ ...result, providerError: null }).kind, "auth_required");
  } finally { loaded.cleanup(); }
});

test("a handler failure is not misreported as an operator interrupt", async () => {
  const loaded = await loadRunner();
  try {
    assert.deepEqual(loaded.module.classifyNeuralDeepRunnerFailure({
      threadId: "session-one",
      usage: null,
      providerError: null,
      toolActivity: false,
      completedEvent: false,
      failedEvent: false,
      code: null,
      signal: "SIGINT",
      stderrTail: "",
      timedOut: false,
      interrupted: false,
      malformedEventCount: 0,
      handlerErrorCode: "event_handler_failed",
    }), {
      kind: "runtime_failed",
      code: "event_handler_failed",
      retryableBeforeToolActivity: false,
    });
  } finally {
    loaded.cleanup();
  }
});

test("shared runner enforces timeout and bounded stderr", async () => {
  const loaded = await loadRunner();
  const stateRoot = path.join(loaded.tmp, "state");
  mkdirSync(stateRoot, { recursive: true });
  const script = `process.stderr.write("x".repeat(12000)); setInterval(()=>{},1000);`;
  try {
    const runner = new loaded.module.NeuralDeepCliRunner(fakeRuntime(stateRoot, script));
    const handle = await runner.start({ ...baseOptions, timeoutMs: 80 });
    const result = await handle.completion;
    assert.equal(result.timedOut, true);
    assert.ok(result.stderrTail.length <= 8000);
    assert.equal(loaded.module.classifyNeuralDeepRunnerFailure(result).kind, "timeout");
  } finally {
    loaded.cleanup();
  }
});

test("a zero exit without thread identity and turn completion is not accepted", async () => {
  const loaded = await loadRunner();
  const stateRoot = path.join(loaded.tmp, "state");
  mkdirSync(stateRoot, { recursive: true });
  try {
    const runner = new loaded.module.NeuralDeepCliRunner(fakeRuntime(stateRoot, "process.stdout.write('{}\\n');\n"));
    const result = await (await runner.start(baseOptions)).completion;
    assert.equal(result.code, 0);
    assert.equal(result.threadId, null);
    assert.equal(result.completedEvent, false);
    assert.equal(loaded.module.classifyNeuralDeepRunnerFailure(result).kind, "runtime_failed");
  } finally {
    loaded.cleanup();
  }
});

test("a provider error before observed tools cannot authorize another paid attempt", async () => {
  const loaded = await loadRunner();
  try {
    for (const [errorClass, status, kind] of [["rate_limit", 429, "rate_limited"], ["outage", 503, "outage"]]) {
      const result = await (await new loaded.module.NeuralDeepCliRunner(fakeRuntime(loaded.tmp,
        `process.stdout.write(JSON.stringify({type:'pritha.provider_error',error:{class:${JSON.stringify(errorClass)},code:'synthetic',status:${status}}})+'\\n');process.exitCode=1;`)).start(baseOptions)).completion;
      assert.equal(result.toolActivity, false);
      const failure = loaded.module.classifyNeuralDeepRunnerFailure(result);
      assert.equal(failure.kind, kind);
      assert.equal(failure.retryableBeforeToolActivity, false);
    }
  } finally { loaded.cleanup(); }
});

test("the shared runner preserves an attachment failure and never permits an automatic paid retry", async () => {
  const loaded = await loadRunner();
  const stateRoot = path.join(loaded.tmp, "state"); mkdirSync(stateRoot, { recursive: true });
  const script = `process.stdout.write(JSON.stringify({type:"pritha.provider_error",error:{class:"input",code:"attachment_original_not_preserved",status:409,retryAfter:null}})+'\\n');process.exitCode=1;`;
  try {
    const runner = new loaded.module.NeuralDeepCliRunner(fakeRuntime(stateRoot,script));
    const result = await (await runner.start(baseOptions)).completion;
    assert.deepEqual(loaded.module.classifyNeuralDeepRunnerFailure(result), { kind: "input_rejected", code: "attachment_original_not_preserved", retryableBeforeToolActivity: false });
  } finally { loaded.cleanup(); }
});
