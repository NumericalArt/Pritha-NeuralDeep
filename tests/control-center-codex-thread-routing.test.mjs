import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const typesSource = readFileSync("interfaces/control-center/src/lib/realtime/codex-task/types.ts", "utf8");
const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const settingsRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
const codexSettingsSource = readFileSync("interfaces/control-center/src/components/settings/CodexSettingsSection.tsx", "utf8");
const gatewaySource = readFileSync("interfaces/control-center/src/lib/codex-chat/gateway.ts", "utf8");
const privateStoreSource = readFileSync("interfaces/control-center/src/lib/codex-chat/private-store.ts", "utf8");
const realtimeHookSource = readFileSync("interfaces/control-center/src/components/voice/usePrithaRealtime.ts", "utf8");

test("Codex task payloads retain a stable subject scope independently of transport", () => {
  assert.match(typesSource, /export type PrithaCodexThreadScopeKind = "agent" \| "pritha" \| "task" \| "control"/);
  assert.match(typesSource, /export type PrithaCodexThreadScope =/);
  assert.match(typesSource, /threadScope\?: PrithaCodexThreadScope/);
  assert.match(runtimeSource, /function deriveCodexThreadScope\(args: CodexTaskArgs, task: Record<string, unknown>\): PrithaCodexThreadScope/);
  assert.match(runtimeSource, /subject_kind\?: unknown/);
  assert.match(runtimeSource, /subject_id\?: unknown/);
  assert.match(runtimeSource, /thread_reset\?: unknown/);
});

test("new deep tasks select Codex CLI and never select App Server as an inference route", () => {
  assert.match(runtimeSource, /const requestedTransport = "codex-cli" as const/);
  assert.match(runtimeSource, /cli\.available\s*\? "codex-cli"\s*: "queue"/);
  assert.match(runtimeSource, /else if \(effectiveTransport === "codex-cli"\) \{\s+exec = await startCodexExec/);
  assert.match(runtimeSource, /fallback_transport: null/);
  assert.match(runtimeSource, /type DeepTaskPrimaryTransport = "codex-cli"/);
  assert.doesNotMatch(runtimeSource, /startCodexAppTask|PrithaCodexAppServerClient|checkCodexAppServerAvailable/);
});

test("Codex deep-task network is explicit and read-only sources use a persistent session scratch", () => {
  assert.match(runtimeSource, /settings\.codexNetworkAccess && taskRequiresInternet/);
  assert.match(runtimeSource, /prepareVoiceWorkspace/);
  assert.doesNotMatch(runtimeSource, /function codexAdditionalWritableDirs|function codexExistingChildAgentWritableDirs/);
  // Exact source, scratch retention, target permissions and native resume are behavioral fixtures in neuraldeep-execution-workspaces.test.mjs.
  assert.match(runtimeSource, /network_access: networkAccess/);
  assert.match(runtimeSource, /danger_full_access_requires_network_setting/);
  assert.match(settingsRouteSource, /danger_full_access_requires_network_access/);
});

test("Control Center chats bind a model and resume the native CLI session", () => {
  assert.match(privateStoreSource, /version: 2/);
  assert.match(privateStoreSource, /nativeThreadId: string \| null/);
  assert.match(privateStoreSource, /providerId: RuntimeProviderId/);
  assert.match(privateStoreSource, /modelId: string/);
  assert.match(gatewaySource, /model_bound_to_chat/);
  assert.match(gatewaySource, /resume: binding\.nativeThreadId/);
  assert.match(gatewaySource, /if \(type === "thread\.started"\)/);
  assert.match(gatewaySource, /nativeThreadId: sessionId/);
});

test("CLI chat continuation is persisted privately and survives Control Center restart", () => {
  assert.match(privateStoreSource, /turns: TurnView\[\]/);
  assert.match(privateStoreSource, /messageReceipts/);
  assert.match(privateStoreSource, /registry\.last-known-good\.json/);
  assert.match(privateStoreSource, /raw\.version !== 1 && raw\.version !== 2/);
  assert.match(privateStoreSource, /turns: safeTurns\(row\.turns\)/);
  assert.match(gatewaySource, /binding\.turns/);
  assert.match(gatewaySource, /this\.store\.mutate/);
});

test("operator answers and approval decisions resume only through Codex CLI", () => {
  assert.match(runtimeSource, /export async function answerPrithaCodexTask/);
  assert.match(runtimeSource, /const effectiveTransport = "codex-cli"/);
  assert.match(runtimeSource, /exec = await startCodexExec\(\s*nextRequest/);
  assert.match(runtimeSource, /effectiveTransport = codexAvailable\(\)\.available \? "codex-cli" : "queue"/);
  assert.match(runtimeSource, /message: "Operator answered the Codex clarification; resuming the same task\."/);
  assert.match(realtimeHookSource, /threadScope: snapshot\.thread_scope \|\| snapshot\.request\?\.thread_scope \|\| null/);
});

test("runtime Settings exposes CLI-only transport and rejects legacy App settings", () => {
  assert.match(settingsRouteSource, /payload\.deepTaskPrimaryTransport !== "codex-cli"/);
  assert.match(settingsRouteSource, /neuraldeep_codex_cli_required/);
  assert.match(settingsRouteSource, /legacy_codex_app_setting_unsupported/);
  assert.match(codexSettingsSource, /NeuralDeep · Codex CLI/);
  assert.match(codexSettingsSource, /OpenAI excluded from this process/);
  assert.doesNotMatch(codexSettingsSource, /Thread Routing|Subject scoped|Codex App/);
});
