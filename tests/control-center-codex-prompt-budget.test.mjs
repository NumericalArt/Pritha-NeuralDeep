import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
const settingsRouteSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
const codexSettingsSource = readFileSync("interfaces/control-center/src/components/settings/CodexSettingsSection.tsx", "utf8");

test("Codex outbound prompt guard estimates tokens before the NeuralDeep CLI transport", () => {
  assert.match(runtimeSource, /function estimatePromptTokens\(value: unknown\)/);
  assert.match(runtimeSource, /function codexOutboundPromptTokenBudget\(\)/);
  assert.match(runtimeSource, /codexPromptTokenBudget: codexPromptTokenBudgetFromEnv\(\)/);
  assert.match(runtimeSource, /normalizeCodexPromptTokenBudget/);
  assert.match(runtimeSource, /function estimateCodexOutboundPromptTokens\(task: Record<string, unknown>, transports:/);
  assert.match(runtimeSource, /"codex-cli": estimatePromptTokens\(buildCodexPrompt\(task\)\)/);
  assert.doesNotMatch(runtimeSource, /estimates\["codex-app"\]/);
});

test("Codex prompt budget is configurable from Pritha settings", () => {
  assert.match(settingsRouteSource, /codexPromptTokenBudget\?: number/);
  assert.match(settingsRouteSource, /patch\.codexPromptTokenBudget = payload\.codexPromptTokenBudget/);
  assert.match(codexSettingsSource, /codexPromptTokenBudget: 24_000/);
  assert.match(codexSettingsSource, /aria-label="Codex prompt token budget"/);
  assert.match(codexSettingsSource, /value=\{numberDrafts\.codexPromptTokenBudget\}/);
  assert.match(codexSettingsSource, /codexPromptTokenBudget: settingsToSave\.codexPromptTokenBudget/);
});

test("Codex outbound prompt guard compacts old session context only over budget", () => {
  assert.match(runtimeSource, /if \(before\.max <= budget\) return \{ applied: false, budget, before \}/);
  assert.match(runtimeSource, /Sticky Context Update:/);
  assert.match(runtimeSource, /Recent voice session events:/);
  assert.match(runtimeSource, /older context omitted:/);
  assert.match(runtimeSource, /prompt_budget_compacted/);
  assert.match(runtimeSource, /strategy: "estimate_tokens_then_deterministic_compact_drop"/);
});

test("Codex task creation and approval both apply prompt budget guard before writing prompt files", () => {
  assert.match(runtimeSource, /await applyCodexOutboundPromptBudget\(task, codexOutboundTransports\(effectiveTransport\), progress\);\s+await writeFile\(requestPath/);
  assert.match(runtimeSource, /await applyCodexOutboundPromptBudget\(nextRequest, codexOutboundTransports\(effectiveTransport\), progress\);\s+await writeFile\(requestPath/);
});
