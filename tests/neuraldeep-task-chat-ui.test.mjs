import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const sourceRoot = "interfaces/control-center/src";
const taskChatPage = readFileSync(`${sourceRoot}/components/codex/CodexChatPage.tsx`, "utf8");
const voicePage = readFileSync(`${sourceRoot}/components/voice/VoiceControlPage.tsx`, "utf8");
const redirectPage = readFileSync(`${sourceRoot}/app/codex/page.tsx`, "utf8");
const telemetrySource = readFileSync(`${sourceRoot}/lib/codex-chat/ui-activity.ts`, "utf8");
const telemetryClientSource = readFileSync(`${sourceRoot}/lib/codex-chat/ui-activity-client.ts`, "utf8");
const cliRuntimeSource = readFileSync(`${sourceRoot}/lib/codex-chat/cli-runtime.ts`, "utf8");
const voiceRuntimeSource = readFileSync(`${sourceRoot}/lib/realtime/pritha-runtime.ts`, "utf8");

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
}

test("Task Chat UI keeps group, draft, first-delivery and explicit Voice continuation boundaries", () => {
  assert.match(taskChatPage, />Direct Chats[<{]/);
  assert.match(taskChatPage, />Voice Tasks[<{]/);
  assert.match(taskChatPage, /nextCursorByGroup/);
  assert.match(taskChatPage, /"Load more"/);
  assert.match(taskChatPage, /draftsByChatRef/);
  assert.match(taskChatPage, /pendingDeliveriesRef/);
  assert.match(taskChatPage, /initialTurn:/);
  assert.match(taskChatPage, /newChatDraftActiveRef/);
  assert.match(taskChatPage, /Continue in Task Chat/);
  assert.match(taskChatPage, /continuationState !== "continuation_enabled"/);
  assert.match(taskChatPage, /waiting_for_provider/);
  assert.doesNotMatch(taskChatPage, /Legacy(?: chats?| threads?| accordion)/i);
  assert.doesNotMatch(taskChatPage, /app_server|desktop_bundled|standalone_cli/);

  assert.match(voicePage, /detail\.task_chat/);
  assert.match(voicePage, /Open in Task Chat/);
  assert.match(voicePage, /\/recovery/);
  assert.match(voicePage, /detail\?\.recovery\?\.resume/);
});

test("the legacy Codex route preserves query parameters in a server redirect", () => {
  assert.match(redirectPage, /new URLSearchParams\(\)/);
  assert.match(redirectPage, /query\.append\(key, item\)/);
  assert.match(redirectPage, /redirect\(`\/task-chat\$\{query\.size \? `\?\$\{query\.toString\(\)\}` : ""\}`\)/);
});

test("Task Chat telemetry rejects content fields and persists only an allowlisted activity envelope", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-task-chat-ui-"));
  try {
    writeFileSync(path.join(tmp, "gateway.mjs"), `
export class CodexChatGatewayError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
`);
    writeFileSync(path.join(tmp, "private-store.mjs"), `
export class CodexChatPrivateStore {
  async get(chatId) { return chatId === "chat_safe_123" ? { group: "my_chats", origin: "chat" } : null; }
}
`);
    writeFileSync(path.join(tmp, "private-json.mjs"), `
export async function appendPrivateAuditEvent(input) { globalThis.__taskChatUiAudit = input; }
`);
    writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
export const resolveTechscopeRoot = () => ${JSON.stringify(tmp)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(tmp)};
export const resolvePrithaStatePath = (...parts) => [${JSON.stringify(tmp)}, ...parts].join("/");
`);
    const compiled = transpile(telemetrySource)
      .replace('"@/lib/private-json"', '"./private-json.mjs"')
      .replace('"@/lib/pritha-paths"', '"./pritha-paths.mjs"')
      .replace('"./gateway"', '"./gateway.mjs"')
      .replace('"./private-store"', '"./private-store.mjs"');
    const modulePath = path.join(tmp, "ui-activity.mjs");
    writeFileSync(modulePath, compiled);
    const activity = await import(`${pathToFileURL(modulePath).href}?${Math.random()}`);
    const base = {
      event: "history_loaded",
      chatId: "chat_safe_123",
      interactionId: "interaction_safe_123",
      source: "history_row",
      stage: "history",
      durationMs: 25,
      clientClass: "desktop",
    };
    for (const forbidden of [
      { message: "private prompt" },
      { url: "https://private.invalid/thread" },
      { sessionId: "session-private" },
      { path: "/Users/private/project" },
    ]) {
      await assert.rejects(activity.recordTaskChatUiActivity({ ...base, ...forbidden }), (error) => error.code === "invalid_request");
    }
    assert.deepEqual(await activity.recordTaskChatUiActivity(base), { recorded: true });
    const event = globalThis.__taskChatUiAudit.event;
    assert.equal(event.chat_ref.length, 24);
    assert.notEqual(event.chat_ref, base.chatId);
    assert.deepEqual(Object.keys(event).sort(), [
      "chat_ref", "client_class", "duration_ms", "error_code", "event", "from_route", "group", "interaction_id", "item_count", "origin", "schema", "source", "stage", "timestamp", "to_route",
    ].sort());
    assert.doesNotMatch(JSON.stringify(event), /private prompt|private\.invalid|session-private|\/Users\/private/);
  } finally {
    delete globalThis.__taskChatUiAudit;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Task Chat and Voice clients expose no ephemeral or private identity controls", () => {
  assert.doesNotMatch(cliRuntimeSource, /--ephemeral|ephemeral\?:/);
  assert.match(voiceRuntimeSource, /neuraldeep_topic_hash/);
  assert.match(voiceRuntimeSource, /publicCodexTaskRecord/);
  assert.match(voiceRuntimeSource, /delete publicValue\[key\]/);
  assert.doesNotMatch(telemetryClientSource, /messageText|sessionId|window\.location\.href/);
});
