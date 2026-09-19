import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const base = "interfaces/control-center/src/components/codex/";

test("uncertain creation requests survive browser reload with the original revision, action and actor", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-creation-ui-"));
  try {
    const compiled = ts.transpileModule(readFileSync(`${base}creation-client-state.ts`, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    const file = path.join(temp, "state.mjs");
    writeFileSync(file, compiled);
    const { creationRequestForAction, readCreationPending, creationPendingKey } = await import(pathToFileURL(file).href);
    const first = creationRequestForAction(null, "approve_contract", 7, "codex-operator", "  User requested the controlled UI test  ", "request_original_123");
    const restored = readCreationPending(JSON.stringify(first));
    assert.deepEqual(restored, first);
    const retried = creationRequestForAction(restored, "approve_outcome", 12, "user", "", "request_different_456");
    assert.deepEqual(retried, first, "a different view revision or actor must not replace an uncertain request");
    const next = creationRequestForAction(null, "approve_outcome", 12, "user", "", "request_different_456");
    assert.equal(next.action, "approve_outcome");
    assert.notEqual(next.requestId, first.requestId);
    assert.equal(next.authorizationBasis, undefined);
    assert.notEqual(creationPendingKey("chat_one"), creationPendingKey("chat_two"));
    const revision = creationRequestForAction(null, "revise_proposal", 13, "codex-operator", "Approved UI trial", "request_revision_789", "  Add source filtering  ");
    assert.equal(revision.reason, "Add source filtering");
    assert.deepEqual(readCreationPending(JSON.stringify(revision)), revision);
    assert.deepEqual(creationRequestForAction(revision, "revise_proposal", 20, "user", "", "request_new_000", "Different correction"), revision);
    assert.equal(readCreationPending(JSON.stringify({...revision,reason:""})), null);
    assert.equal(readCreationPending(JSON.stringify({...revision,reason:"x".repeat(2001)})), null);
    for (const value of [null, "{", "null", JSON.stringify({ ...first, expectedRevision: -1 }), JSON.stringify({ ...first, action: "deploy" }), JSON.stringify({ ...first, authorizationBasis: "" }), JSON.stringify({ ...first, actor: "system" })]) {
      assert.equal(readCreationPending(value), null);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("creation panel separates reviewed revisions, actor attribution and independent document approvals", () => {
  const source = readFileSync(`${base}AgentCreationProgress.tsx`, "utf8");
  assert.match(source, /approve_contract/);
  assert.match(source, /approve_outcome/);
  assert.match(source, /reviewed\[kind\] !== document\.hash/);
  assert.match(source, /CodexMarkdown markdown=\{document\.text\}/);
  assert.match(source, /codex-operator/);
  assert.match(source, /Основание поручения/);
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /deliveryMayBeUnknown/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /polls >= 360/);
  assert.match(source, /unknownAttempts\.length/);
  assert.match(source, /approval\?\.hash === document\.hash/);
  assert.match(source, /Историческая задача; автоматическое подключение отсутствует/);
  assert.match(source, /setLegacy\(data\.legacy === true\)/);
  assert.match(source, /function refreshManually\(\)\s*\{[\s\S]*?setPollEpoch\(previous => previous \+ 1\)/);
  assert.match(source, /onClick=\{refreshManually\}/);
  assert.doesNotMatch(source, /fetch\([^)]*scaffold|scripts\/pritha\.mjs|--approved-by/);
  assert.match(readFileSync(`${base}CodexChatPage.tsx`, "utf8"), /AgentCreationProgress key=\{selectedChatId\}/);
  const bridge = readFileSync("interfaces/control-center/src/lib/codex-chat/creation-types.ts", "utf8");
  assert.match(bridge, /export type/);
  assert.doesNotMatch(bridge, /import \{/);
});

test("creation result presentation stops polling and claims verification only for an adopted result", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-creation-presentation-"));
  try {
    const file = path.join(temp, "presentation.mjs");
    writeFileSync(file, ts.transpileModule(readFileSync(`${base}creation-client-state.ts`, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
    const { creationResultPresentation, creationShouldPoll, creationStatusLabel, creationPhaseLabel } = await import(pathToFileURL(file).href);
    for (const status of ["ready", "paused", "cancelled", "blocked", "awaiting_contract_approval", "awaiting_outcome_approval"]) assert.equal(creationShouldPoll(status), false);
    for (const status of ["running", "pending"]) assert.equal(creationShouldPoll(status), true);
    assert.equal(creationPhaseLabel("finish"), "Результат");
    assert.equal(creationStatusLabel("awaiting_outcome_approval"), "Ожидает подтверждения Outcome Spec");
    const card = "/agents/agent-0123456789abcdef";
    for (const job of [
      { status: "ready", agentCardUrl: card },
      { status: "ready", agentCardUrl: card, delivery: { adopted: false } },
      { status: "blocked", agentCardUrl: card, delivery: { adopted: true } },
    ]) assert.deepEqual(creationResultPresentation(job), { verified: false, message: null, href: null });
    const ready = { status: "ready", agentCardUrl: card, delivery: { adopted: true, acceptance: "not_accepted" } };
    assert.deepEqual(creationResultPresentation(ready), { verified: true, message: "Результат проверен; приёмка пользователя ожидается.", href: card });
    for (const invalid of [null, "https://external.example/agents/agent-alpha", "javascript:alert(1)", "/agents/../settings", "/agents/%2fsettings", "/agents/agent-alpha?accept=1"]) {
      assert.equal(creationResultPresentation({ ...ready, agentCardUrl: invalid }).href, null);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("agent filters distinguish running health from present folders and retain missing projects in history", async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-agent-view-"));
  try {
    const file = path.join(temp, "view.mjs");
    writeFileSync(file, ts.transpileModule(readFileSync("interfaces/control-center/src/components/agents/agent-view.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
    const { partitionAgentCards } = await import(pathToFileURL(file).href);
    const cards = [
      { id: "running", state: "alive", healthStatus: "ok" },
      { id: "stopped", state: "alive", healthStatus: "failed" },
      { id: "historical", state: "missing", healthStatus: "unknown", control: { runtimeKind: "scaffold" } },
      { id: "draft", state: "alive", healthStatus: "unknown", control: { runtimeKind: "scaffold" } },
    ];
    const views = partitionAgentCards(cards);
    assert.deepEqual(views.active.map(card => card.id), ["running"]);
    assert.deepEqual(views.history.map(card => card.id), ["historical"]);
    assert.deepEqual(views.drafts.map(card => card.id), ["draft"]);
    assert.equal(views.all.length, 4);
    assert.ok(views.all.some(card => card.id === "stopped"));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
