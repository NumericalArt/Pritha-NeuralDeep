import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sourceRoot = "interfaces/control-center/src";
const cliRuntime = readFileSync(`${sourceRoot}/lib/codex-chat/cli-runtime.ts`, "utf8");
const cliProcessRunner = readFileSync(`${sourceRoot}/lib/codex-chat/neuraldeep-cli-runner.ts`, "utf8");
const gateway = readFileSync(`${sourceRoot}/lib/codex-chat/gateway.ts`, "utf8");
const voiceRuntime = readFileSync(`${sourceRoot}/lib/realtime/pritha-runtime.ts`, "utf8");
const agentMother = readFileSync("scripts/agents-mother/build-executors.mjs", "utf8");
const neuralDeepRunner = readFileSync("scripts/neuraldeep-codex.mjs", "utf8");

test("Task Chat publishes one NeuralDeep exec/resume runtime with fallback disabled", () => {
  assert.match(cliRuntime, /providerId: "neuraldeep_cli" as const/);
  assert.match(cliRuntime, /protocol: "exec_resume" as const/);
  assert.match(cliRuntime, /fallbackEnabled: false/);
  assert.match(cliRuntime, /providers: \[providerView\]/);
  assert.match(cliRuntime, /effectiveProvider: localReady \? "neuraldeep_cli" : null/);
  assert.doesNotMatch(cliRuntime, /from\s+["'][^"']*(?:app-server|codex-binaries)[^"']*["']/i);
  assert.doesNotMatch(gateway, /from\s+["'][^"']*(?:app-server|codex-binaries)[^"']*["']/i);
  assert.doesNotMatch(cliRuntime, /--ephemeral|\bephemeral\s*:/);
});

test("Task Chat, Voice and Agent Mother launch only the isolated NeuralDeep runner", () => {
  for (const source of [cliRuntime, agentMother]) {
    assert.match(source, /scripts["'],\s*["']neuraldeep-codex\.mjs["']/);
  }
  assert.match(cliRuntime, /"exec-json"/);
  assert.match(voiceRuntime, /new NeuralDeepCliRunner\(voiceCodexRuntime\)/);
  assert.match(voiceRuntime, /voiceCodexRunner\.start\(/);
  assert.match(voiceRuntime, /\[runner, "status", "--json"\]/);
  assert.match(agentMother, /"exec-json"/);
  assert.doesNotMatch(cliRuntime, /(?:Codex|ChatGPT)\.app|standalone_cli|desktop_bundled/);
  assert.doesNotMatch(gateway, /(?:Codex|ChatGPT)\.app|standalone_cli|desktop_bundled/);
  assert.doesNotMatch(voiceRuntime, /PRITHA_CODEX_BIN|TECHSCOPE_CODEX_BIN|CODEX_BIN/);
});

test("every Control Center inference child strips OpenAI-family credentials", () => {
  const credentialPrefix = /\^\(\?:OPENAI\|AZURE_OPENAI\|CHATGPT\)_/;
  assert.match(cliRuntime, credentialPrefix);
  assert.match(voiceRuntime, /new NeuralDeepCliRuntime\(\)/);
  assert.match(agentMother, credentialPrefix);
  assert.match(neuralDeepRunner, /delete childEnvironment\[key\]/);
});

test("Task Chat and Voice preserve NeuralDeep model identity, usage source and workload id", () => {
  assert.match(gateway, /model_bound_to_chat/);
  assert.match(gateway, /resume: binding\.nativeThreadId/);
  assert.match(gateway, /usageSource: "codex-chat"/);
  assert.match(gateway, /workloadId: active\.turnId/);
  assert.match(gateway, /coordinationKey: binding\.voiceTopicId \|\|/);
  assert.match(voiceRuntime, /usageSource: "agent-mother"/);
  assert.match(voiceRuntime, /workloadId: attempt\.taskId/);
  assert.match(agentMother, /usageSource: "agent-mother"/);
  assert.match(agentMother, /usageSource: "child-agent"/);
  assert.doesNotMatch(gateway, /fallbackModel|fallback_model|substituteModel|substitute_model/i);
});

test("provider failures remain classified without provider or model substitution", () => {
  for (const state of ["billing_required", "access_denied", "auth_required", "rate_limited", "waiting_for_provider"]) {
    assert.match(gateway, new RegExp(state));
  }
  assert.match(gateway, /failure\.retryableBeforeToolActivity/);
  assert.doesNotMatch(cliProcessRunner, /retryableBeforeToolActivity: !result\.toolActivity/);
  assert.match(cliProcessRunner, /kind: "rate_limited"[^\n]*retryableBeforeToolActivity: false/);
  assert.match(cliProcessRunner, /kind: "outage"[^\n]*retryableBeforeToolActivity: false/);
  assert.match(gateway, /"resume_confirmation_required"/);
  assert.match(gateway, /code: "neuraldeep_model_unavailable"/);
  assert.doesNotMatch(gateway, /effectiveProvider\s*=|providerId\s*=\s*["'](?:desktop|standalone)/i);
});

test("Voice operator pauses and private topic identity stay inside the Control Center", () => {
  assert.match(voiceRuntime, /PRITHA_OPERATOR_INPUT_REQUIRED:/);
  assert.match(voiceRuntime, /waiting_for_operator/);
  assert.match(voiceRuntime, /delete promptTask\.neuraldeep_topic_id/);
  assert.match(voiceRuntime, /delete promptTask\.task_chat_id/);
  assert.match(voiceRuntime, /neuraldeep_topic_hash: voiceTopicAuditHash/);
});
