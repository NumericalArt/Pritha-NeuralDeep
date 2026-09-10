import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const limitsSource = readFileSync("interfaces/control-center/src/lib/settings/limits.ts", "utf8");
const limitsUi = readFileSync("interfaces/control-center/src/components/settings/LimitsSettingsSection.tsx", "utf8");
const settingsUi = readFileSync("interfaces/control-center/src/components/settings/CodexSettingsSection.tsx", "utf8");
const settingsRoute = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
const usageRoute = readFileSync("interfaces/control-center/src/app/api/settings/neuraldeep-usage/route.ts", "utf8");
const gateway = readFileSync("interfaces/control-center/src/lib/codex-chat/gateway.ts", "utf8");
const cliRunner = readFileSync("interfaces/control-center/src/lib/codex-chat/neuraldeep-cli-runner.ts", "utf8");
const runner = readFileSync("scripts/neuraldeep-codex.mjs", "utf8");
const embeddings = readFileSync("scripts/embed-memory-neuraldeep.mjs", "utf8");

test("Usage & Billing exposes safe account data, provider links, limits and local ranges", () => {
  assert.match(limitsSource, /getNeuralDeepAccountSnapshot/);
  assert.match(limitsUi, /Usage &amp; Billing/);
  assert.match(limitsSource, /https:\/\/neuraldeep\.ru\/app\/spend/);
  assert.match(limitsSource, /https:\/\/neuraldeep\.ru\/app\/billing/);
  assert.match(limitsUi, /Included in subscription/);
  assert.match(limitsUi, /No per-token charge/);
  assert.match(limitsUi, /NeuralDeep is authoritative for access and wallet balance/);
  assert.match(limitsUi, /\["24h", "7d", "30d"\]/);
  assert.match(limitsUi, /By source/);
  assert.match(limitsUi, /By model/);
});

test("paid, special and unknown model choices use a soft acknowledgement without disabling models", () => {
  assert.match(settingsUi, /needsBillingConfirmation/);
  assert.match(settingsUi, /Continue and save/);
  assert.match(settingsUi, /existing chats stay pinned to their model/);
  assert.match(settingsUi, /Pritha will not substitute another model/);
  assert.doesNotMatch(settingsUi, /disabled=\{[^}]*currentAccess/);
  assert.match(settingsRoute, /neuraldeepBillingAcknowledged/);
  assert.match(settingsRoute, /neuraldeep_billing_confirmation_required/);
  assert.match(settingsRoute, /status: 409/);
});

test("usage API is range-bounded and every inference path supplies a ledger source", () => {
  assert.match(usageRoute, /"24h", "7d", "30d"/);
  assert.match(usageRoute, /invalid_usage_range/);
  assert.match(runner, /recordNeuralDeepRun/);
  assert.match(runner, /--usage-source/);
  assert.match(gateway, /usageSource: "codex-chat"/);
  assert.match(embeddings, /source: "embeddings"/);
  const agentMother = readFileSync("scripts/agents-mother/build-executors.mjs", "utf8");
  assert.match(agentMother, /usageSource: "agent-mother"/);
  assert.match(agentMother, /usageSource: "child-agent"/);
});

test("billing and generic 403 errors never enter outage auto-retry or credentials handling", () => {
  assert.match(cliRunner, /billing: \["billing_required", "neuraldeep_billing_required"\]/);
  assert.match(cliRunner, /access_denied: \["access_denied", "neuraldeep_access_denied"\]/);
  assert.ok(cliRunner.indexOf('failures[result.providerError.class]') < cliRunner.indexOf('if (/neuraldeep_http_401'));
  assert.match(cliRunner, /credentials: \["auth_required", "neuraldeep_auth_required"\]/);
  assert.doesNotMatch(cliRunner, /if \(\/neuraldeep_http_401[^\n]*403/);
  assert.match(gateway, /failure\.kind === "billing_required"/);
  assert.match(gateway, /failure\.kind === "access_denied"/);
  assert.match(gateway, /neuraldeep_billing_required/);
  assert.match(gateway, /neuraldeep_access_denied/);
});
