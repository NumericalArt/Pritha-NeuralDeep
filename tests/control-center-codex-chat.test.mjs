import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const root = "interfaces/control-center/src";
const cliRuntimeSource = readFileSync(`${root}/lib/codex-chat/cli-runtime.ts`, "utf8");
const gatewaySource = readFileSync(`${root}/lib/codex-chat/gateway.ts`, "utf8");
const cliRunnerSource = readFileSync(`${root}/lib/codex-chat/neuraldeep-cli-runner.ts`, "utf8");
const voiceTaskLinksSource = readFileSync(`${root}/lib/codex-chat/voice-task-links.ts`, "utf8");
const neuralDeepRunnerSource = readFileSync("scripts/neuraldeep-codex.mjs", "utf8");
const privateStoreSource = readFileSync(`${root}/lib/codex-chat/private-store.ts`, "utf8");
const privateRegistryLockSource = readFileSync(`${root}/lib/codex-chat/private-registry-lock.ts`, "utf8");
const privateJsonSource = readFileSync(`${root}/lib/private-json.ts`, "utf8");
const requestClientSource = readFileSync(`${root}/lib/control-center-request.ts`, "utf8");
const eventsRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/events/route.ts`, "utf8");
const threadRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/route.ts`, "utf8");
const turnsRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/turns/route.ts`, "utf8");
const recoveryRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/turns/[turnId]/recovery/route.ts`, "utf8");
const chatPageSource = readFileSync(`${root}/components/codex/CodexChatPage.tsx`, "utf8");
const dictationPreferencesSource = readFileSync(`${root}/lib/codex-chat/dictation-preferences.ts`, "utf8");
const routesSource = readFileSync(`${root}/lib/routes.ts`, "utf8");
const taskChatRouteSource = readFileSync(`${root}/app/task-chat/page.tsx`, "utf8");
const legacyCodexRouteSource = readFileSync(`${root}/app/codex/page.tsx`, "utf8");
const stylesSource = readFileSync(`${root}/styles/globals.css`, "utf8");

async function loadNormalizeModule() {
  const source = readFileSync(`${root}/lib/codex-chat/normalize.ts`, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-chat-normalize-"));
  const modulePath = path.join(tmp, "normalize.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

async function transpileModule(source, prefix) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), prefix));
  const modulePath = path.join(tmp, "module.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(`${pathToFileURL(modulePath).href}?cache=${Date.now()}-${Math.random()}`),
    directory: tmp,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("Codex Chat runtime uses only isolated Codex CLI through NeuralDeep", () => {
  assert.match(cliRuntimeSource, /scripts", "neuraldeep-codex\.mjs"/);
  assert.match(cliRuntimeSource, /"exec-json"/);
  assert.match(cliRuntimeSource, /if \(options\.resume\) args\.push\("--resume", options\.resume\)/);
  assert.match(cliRuntimeSource, /"--network", options\.network \? "enabled" : "disabled"/);
  assert.match(cliRuntimeSource, /\^\(\?:OPENAI\|AZURE_OPENAI\|CHATGPT\)_/);
  assert.match(neuralDeepRunnerSource, /model_provider = "neuraldeep"/);
  assert.match(neuralDeepRunnerSource, /wire_api = "responses"/);
  assert.match(neuralDeepRunnerSource, /listenNeuralDeepAdapter\(\{ host: runtime\.host, port: 0/);
  assert.match(neuralDeepRunnerSource, /childEnvironment\.CODEX_HOME = runtime\.codexHome/);
  assert.doesNotMatch(cliRuntimeSource, /app-server|Codex\.app|ChatGPT\.app/);
});

test("Codex Chat core keeps native history, stable browser ids and safe turn replay boundaries", () => {
  assert.match(gatewaySource, /this\.runner\.start\(\{/);
  assert.match(gatewaySource, /sandbox: intent\.sandbox/);
  assert.match(gatewaySource, /network: intent\.network/);
  assert.match(gatewaySource, /execution_permissions_changed/);
  assert.match(gatewaySource, /resume: binding\.nativeThreadId/);
  assert.match(gatewaySource, /if \(type === "thread\.started"\)/);
  assert.match(gatewaySource, /nativeThreadId: sessionId/);
  assert.doesNotMatch(gatewaySource, /--ephemeral/);
  assert.match(gatewaySource, /if \(this\.activeTurns\.has\(chatId\)\)/);
  assert.match(gatewaySource, /model_bound_to_chat/);
  assert.match(gatewaySource, /messageReceipts/);
  assert.match(gatewaySource, /idempotency_conflict/);
  assert.match(gatewaySource, /failure\.retryableBeforeToolActivity/);
  assert.match(gatewaySource, /status: "waiting_for_provider"/);
  assert.match(gatewaySource, /active\.toolStarted/);
  assert.match(gatewaySource, /"codex_cli_launch_failed"/);
  assert.match(gatewaySource, /MAX_EVENTS_PER_CHAT = 10_000/);
  assert.match(gatewaySource, /this\.activeTurns\.delete\(chatId\)/);
});

test("catalog models that return provider 404 fail explicitly instead of entering an outage loop", () => {
  assert.match(cliRunnerSource, /unexpected status 404/);
  assert.match(cliRunnerSource, /kind: "model_unavailable"/);
  assert.match(gatewaySource, /code: "neuraldeep_model_unavailable"/);
  assert.match(gatewaySource, /Create a new chat with another model or retry it later/);
  assert.ok(cliRunnerSource.indexOf('kind: "model_unavailable"') < cliRunnerSource.indexOf('kind: "rate_limited"'));
});

test("Codex Chat private linkage remains outside tracked knowledge and uses atomic private writes", () => {
  assert.match(privateStoreSource, /path\.join\(stateRoot, "codex-chat"\)/);
  assert.match(privateStoreSource, /path\.join\(root, "\.private", "codex-chat"\)/);
  assert.match(privateJsonSource, /mode: 0o700/);
  assert.match(privateJsonSource, /0o600/);
  assert.match(privateStoreSource, /registry\.last-known-good\.json/);
  assert.match(privateStoreSource, /registry-read-only/);
  assert.match(privateStoreSource, /registry-restored/);
  assert.match(privateJsonSource, /randomUUID\(\)/);
  assert.match(privateJsonSource, /await handle\.sync\(\)/);
  assert.match(privateJsonSource, /await rename\(temporary, target\)/);
});

test("Codex Chat HTTP client normalizes gateways, malformed JSON and API envelopes", async () => {
  const loaded = await transpileModule(requestClientSource, "pritha-control-request-");
  const request = loaded.module.controlCenterRequest;
  try {
    const invoke = (response) => request("/api/test", {}, { fetchImpl: async () => response, timeoutMs: 500 });
    for (const status of [502, 503, 504]) {
      await assert.rejects(
        invoke(new Response("", { status, headers: { "content-type": "application/json" } })),
        (error) => error.code === "control_center_unavailable" && error.kind === "gateway" && !/JSON|Unexpected/i.test(error.message),
      );
    }
    await assert.rejects(
      invoke(new Response("<html>proxy error</html>", { status: 502, headers: { "content-type": "text/html" } })),
      (error) => error.code === "control_center_unavailable" && !error.message.includes("proxy error"),
    );
    await assert.rejects(
      invoke(new Response('{"apiVersion":"1"', { status: 200, headers: { "content-type": "application/json" } })),
      (error) => error.code === "invalid_server_response" && !/Unexpected end|JSON/i.test(error.message),
    );
    const success = await invoke(new Response(JSON.stringify({ apiVersion: "1", requestId: "request-1", data: { ok: true } }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }));
    assert.deepEqual(success.data, { ok: true });
    await assert.rejects(
      invoke(new Response(JSON.stringify({ apiVersion: "1", error: { code: "runtime_unavailable", message: "Runtime unavailable.", retryable: true, requestId: "request-2" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })),
      (error) => error.kind === "api" && error.code === "runtime_unavailable" && error.requestId === "request-2",
    );
    assert.equal(loaded.module.deliveryMayBeUnknown(new loaded.module.ControlCenterRequestError(
      "api",
      "turn_active",
      "Turn already active.",
      false,
      409,
      "request-3",
    )), true);
  } finally {
    loaded.cleanup();
  }
});

test("atomic private JSON serializes one hundred concurrent writes without temp collisions", async () => {
  const loaded = await transpileModule(privateJsonSource, "pritha-private-json-");
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-private-state-"));
  const target = path.join(stateRoot, "private", "rolling-summary", "current.json");
  try {
    await Promise.all(Array.from({ length: 100 }, (_, index) => loaded.module.atomicWritePrivateJson({
      stateRoot,
      filePath: target,
      resourceKey: "rolling-summary:current",
      value: { index, valid: true },
    })));
    const saved = JSON.parse(readFileSync(target, "utf8"));
    assert.equal(saved.valid, true);
    assert.ok(Number.isInteger(saved.index));
    assert.equal(loaded.module.pendingPrivateJsonWrites(), 0);
    await assert.rejects(loaded.module.atomicWritePrivateJson({
      stateRoot,
      filePath: path.join(stateRoot, "..", "escape.json"),
      value: {},
    }), /outside_state_root/);
  } finally {
    loaded.cleanup();
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("corrupt Codex Chat registry restores a valid backup and otherwise stays read-only", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-registry-recovery-"));
  const checkout = path.join(tmp, "checkout");
  const stateRoot = path.join(tmp, "state");
  const chatRoot = path.join(stateRoot, "codex-chat");
  mkdirSync(chatRoot, { recursive: true });
  const compilerOptions = { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true };
  const helperOutput = ts.transpileModule(privateJsonSource, { compilerOptions }).outputText;
  const storeOutput = ts.transpileModule(privateStoreSource, { compilerOptions }).outputText
    .replace('"@/lib/pritha-paths"', '"./pritha-paths.mjs"')
    .replace('"@/lib/private-json"', '"./private-json.mjs"')
    .replace('"./private-registry-lock"', '"./private-registry-lock.mjs"');
  writeFileSync(path.join(tmp, "private-json.mjs"), helperOutput);
  writeFileSync(path.join(tmp, "private-registry-lock.mjs"), ts.transpileModule(privateRegistryLockSource, { compilerOptions }).outputText);
  writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
export const resolveTechscopeRoot = () => ${JSON.stringify(checkout)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(stateRoot)};
`);
  writeFileSync(path.join(tmp, "private-store.mjs"), storeOutput.replace(/"(?:\.\.\/){5}scripts\/([^"\n]+)"/g, (_match, relative) => JSON.stringify(pathToFileURL(path.resolve("scripts", relative)).href)));
  const binding = {
    chatId: "chat_recovered",
    clientThreadId: "client-thread-recovered",
    createHash: "hash",
    nativeThreadId: "native-thread-recovered",
    providerId: "neuraldeep_cli",
    providerState: "available",
    modelId: "qwen3.6-35b-a3b",
    effortId: "medium",
    title: "Recovered",
    preview: "History survives",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    pinned: false,
    archived: false,
    lastStatus: "idle",
    messageReceipts: {},
    taskLinks: [],
    turns: [],
  };
  const valid = { version: 2, chats: { [binding.chatId]: binding } };
  try {
    writeFileSync(path.join(chatRoot, "registry.json"), "{broken-primary", "utf8");
    writeFileSync(path.join(chatRoot, "registry.last-known-good.json"), `${JSON.stringify(valid)}\n`, "utf8");
    const recoveredModule = await import(`${pathToFileURL(path.join(tmp, "private-store.mjs")).href}?recovered`);
    const recovered = new recoveredModule.CodexChatPrivateStore();
    assert.deepEqual((await recovered.all()).map((row) => row.chatId), ["chat_recovered"]);
    const restoredPrimary = JSON.parse(readFileSync(path.join(chatRoot, "registry.json"), "utf8"));
    assert.equal(restoredPrimary.version, 3);
    const restoredBinding = await recovered.get("chat_recovered");
    assert.equal(restoredBinding.nativeThreadId, binding.nativeThreadId);
    assert.equal(restoredBinding.group, "my_chats");
    assert.equal(restoredBinding.origin, "chat");
    assert.equal(restoredBinding.continuationEnabled, true);
    assert.match(readFileSync(path.join(chatRoot, "registry.audit.jsonl"), "utf8"), /registry-restored/);

    writeFileSync(path.join(chatRoot, "registry.json"), "{broken-primary", "utf8");
    writeFileSync(path.join(chatRoot, "registry.last-known-good.json"), "{broken-backup", "utf8");
    const failedModule = await import(`${pathToFileURL(path.join(tmp, "private-store.mjs")).href}?failed`);
    const failed = new failedModule.CodexChatPrivateStore();
    await assert.rejects(failed.all(), (error) => error.code === "codex_chat_registry_corrupt");
    assert.equal(readFileSync(path.join(chatRoot, "registry.json"), "utf8"), "{broken-primary");
    assert.equal(readFileSync(path.join(chatRoot, "registry.last-known-good.json"), "utf8"), "{broken-backup");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("persisted active tool turns become explicit recovery decisions after restart", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-registry-active-recovery-"));
  const checkout = path.join(tmp, "checkout");
  const stateRoot = path.join(tmp, "state");
  const chatRoot = path.join(stateRoot, "codex-chat");
  mkdirSync(chatRoot, { recursive: true });
  const compilerOptions = { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true };
  writeFileSync(path.join(tmp, "private-json.mjs"), ts.transpileModule(privateJsonSource, { compilerOptions }).outputText);
  writeFileSync(path.join(tmp, "private-registry-lock.mjs"), ts.transpileModule(privateRegistryLockSource, { compilerOptions }).outputText);
  writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
export const resolveTechscopeRoot = () => ${JSON.stringify(checkout)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(stateRoot)};
`);
  const storeOutput = ts.transpileModule(privateStoreSource, { compilerOptions }).outputText
    .replace('"@/lib/pritha-paths"', '"./pritha-paths.mjs"')
    .replace('"@/lib/private-json"', '"./private-json.mjs"')
    .replace('"./private-registry-lock"', '"./private-registry-lock.mjs"');
  writeFileSync(path.join(tmp, "private-store.mjs"), storeOutput.replace(/"(?:\.\.\/){5}scripts\/([^"\n]+)"/g, (_match, relative) => JSON.stringify(pathToFileURL(path.resolve("scripts", relative)).href)));
  const now = "2026-08-31T12:00:00.000Z";
  const binding = {
    chatId: "chat_active",
    clientThreadId: "client-thread-active",
    createHash: "hash",
    nativeThreadId: "native-thread-active",
    providerId: "neuraldeep_cli",
    providerState: "available",
    modelId: "qwen3.6-35b-a3b",
    effortId: "medium",
    title: "Active",
    preview: "Do work",
    createdAt: now,
    updatedAt: now,
    pinned: false,
    archived: false,
    lastStatus: "active",
    messageReceipts: {},
    taskLinks: [],
    turns: [{
      turnId: "turn_active123",
      clientMessageId: "client-message-active",
      status: "in_progress",
      userMessage: { id: "item_user123", role: "user", markdown: "Do work", status: "completed", createdAt: now },
      items: [{
        id: "item_command123",
        kind: "command",
        status: "in_progress",
        startedAt: now,
        completedAt: null,
        commandPreview: "npm test",
        cwdLabel: ".",
        outputPreview: null,
        exitCode: null,
      }],
      pendingRequestIds: [],
      startedAt: now,
      completedAt: null,
      error: null,
    }],
  };
  writeFileSync(path.join(chatRoot, "registry.json"), `${JSON.stringify({ version: 2, chats: { [binding.chatId]: binding } })}\n`, "utf8");
  try {
    const loaded = await import(`${pathToFileURL(path.join(tmp, "private-store.mjs")).href}?active`);
    const store = new loaded.CodexChatPrivateStore();
    assert.deepEqual(await store.recoverActiveTurnsAfterRestart(), { chatCount: 1, turnCount: 1 });
    const recovered = await store.get("chat_active");
    assert.equal(recovered.lastStatus, "system_error");
    assert.equal(recovered.turns[0].status, "failed");
    assert.equal(recovered.turns[0].error.code, "resume_confirmation_required");
    assert.equal(recovered.turns[0].items[0].status, "failed");
    assert.deepEqual(await store.recoverActiveTurnsAfterRestart(), { chatCount: 0, turnCount: 0 });
    assert.match(readFileSync(path.join(chatRoot, "registry.audit.jsonl"), "utf8"), /active-turns-recovered-after-restart/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Codex Chat routes enforce bounded input, idempotent mutations and resumable SSE", () => {
  assert.match(threadRouteSource, /requireIdempotencyKey\(request\)/);
  assert.match(threadRouteSource, /Thread title exceeds 120 characters/);
  assert.match(threadRouteSource, /initialTurn/);
  assert.match(threadRouteSource, /createThreadWithFirstTurn/);
  assert.match(gatewaySource, /putIfAbsentByClientThreadId\(proposed\.binding\)/);
  assert.match(gatewaySource, /receipt\.requestHash !== proposed\.turnRequestHash/);
  assert.match(gatewaySource, /This clientThreadId already has a different first message/);
  assert.match(turnsRouteSource, /requireIdempotencyKey\(request\)/);
  assert.match(turnsRouteSource, /status: 202/);
  assert.match(recoveryRouteSource, /requireIdempotencyKey\(request\)/);
  assert.match(recoveryRouteSource, /\["resume", "retry", "cancel", "reconcile"\]/);
  assert.match(recoveryRouteSource, /getCodexChatGateway\(\)\.recoverTurn/);
  assert.match(eventsRouteSource, /request\.headers\.get\("last-event-id"\)/);
  assert.match(eventsRouteSource, /url\.searchParams\.get\("afterEventId"\)/);
  assert.match(eventsRouteSource, /"Content-Type": "text\/event-stream; charset=utf-8"/);
  assert.match(eventsRouteSource, /"X-Accel-Buffering": "no"/);
  assert.match(eventsRouteSource, /15_000/);
});

test("Codex Chat navigation, editable dictation and 320px-safe layout are present", () => {
  assert.match(routesSource, /href: "\/task-chat"/);
  assert.match(routesSource, /label: "Task Chat"/);
  assert.match(taskChatRouteSource, /<CodexChatPage \/>/);
  assert.match(legacyCodexRouteSource, /redirect\(`\/task-chat/);
  assert.match(legacyCodexRouteSource, /query\.append\(key, item\)/);
  assert.match(chatPageSource, /SpeechRecognition/);
  assert.match(chatPageSource, /updateDraftForChat\(dictationDraftKey, \(current\) =>/);
  assert.doesNotMatch(chatPageSource, /recognition\.onresult[\s\S]{0,700}sendMessage\(/);
  assert.doesNotMatch(chatPageSource, /navigator\.language/);
  assert.match(chatPageSource, /if \(languageTag\) recognition\.lang = languageTag/);
  assert.match(chatPageSource, /aria-label="Dictation language"/);
  assert.match(chatPageSource, /new EventSource\(`[\s\S]{0,100}history=compact/);
  assert.match(stylesSource, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(stylesSource, /\.codex-conversation \{[\s\S]{0,180}display: flex;[\s\S]{0,80}flex-direction: column;/);
  assert.match(stylesSource, /\.codex-transcript \{[\s\S]{0,80}flex: 1 1 auto;[\s\S]{0,120}overflow-y: auto;/);
  // Operator cards may make the auto-sized composer shrink into a scrollable
  // region. Browser coverage checks actual header and button reachability.
  assert.match(stylesSource, /\.codex-composer-wrap \{[\s\S]{0,80}flex: 0 [01] auto;/);
  assert.match(stylesSource, /\.content-shell:has\(\.codex-page\) \{[\s\S]{0,100}height: 100dvh;[\s\S]{0,100}overflow: hidden;/);
  assert.match(stylesSource, /@media \(max-width: 390px\)/);
  assert.match(stylesSource, /\.codex-history-overlay/);
});

test("Codex Chat dictation keeps browser auto mode and explicit language choices separate from transcripts", async () => {
  const loaded = await transpileModule(dictationPreferencesSource, "pritha-codex-chat-dictation-");
  try {
    assert.equal(loaded.module.recognitionLanguageTag("browser"), null);
    for (const language of ["en-US", "de-DE", "ru-RU", "fr-FR", "it-IT", "es-ES"]) {
      assert.equal(loaded.module.isDictationLanguage(language), true);
      assert.equal(loaded.module.recognitionLanguageTag(language), language);
    }
    assert.equal(loaded.module.isDictationLanguage("all"), false);
    assert.match(dictationPreferencesSource, /pritha\.codexDictationLanguage/);
    assert.doesNotMatch(dictationPreferencesSource, /transcript|draft|message/i);
  } finally {
    loaded.cleanup();
  }
});

test("Codex Chat reconciles missed completion events and exposes explicit recovery", () => {
  assert.match(chatPageSource, /\[1_000, 2_000, 5_000, 10_000, 30_000\]/);
  assert.doesNotMatch(chatPageSource, /window\.setInterval/);
  assert.match(chatPageSource, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(chatPageSource, /window\.addEventListener\("online", onOnline\)/);
  assert.match(chatPageSource, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(chatPageSource, /await checkControlCenterHealth\(\)/);
  assert.match(chatPageSource, /Promise\.allSettled\(\[refreshRuntime\(\), refreshThreads\(\)\]\)/);
  assert.match(chatPageSource, /await loadThreadDetail\(chatId\)/);
  assert.match(chatPageSource, /await loadThreadHistory\(chatId, nextDetail\)/);
  assert.match(chatPageSource, /recovering \? "Retrying…" : "Retry"/);
  assert.match(chatPageSource, /delivery_unknown/);
  assert.match(chatPageSource, /consecutiveConnectivityFailures >= 2/);
  assert.match(chatPageSource, /filter\(shouldRenderActivityItem\)/);
  assert.match(chatPageSource, /turnNeedsRecovery/);
  assert.match(chatPageSource, /recoverFailedTurn\(turn, "resume"\)/);
  assert.match(chatPageSource, /recoverFailedTurn\(turn, "retry"\)/);
  assert.match(chatPageSource, /recoverFailedTurn\(turn, "cancel"\)/);
  assert.match(gatewaySource, /ensureVoiceTaskLinkRecovery/);
  assert.match(voiceTaskLinksSource, /recoverActiveTurnsAfterRestart/);
  assert.match(gatewaySource, /Nothing was replayed/);
  assert.match(chatPageSource, /clientMessageId: delivery\.clientMessageId/);
  assert.doesNotMatch(chatPageSource, /localStorage|indexedDB/i);
});

test("Codex Chat item normalization bounds output and hides private absolute paths and raw reasoning", async () => {
  const loaded = await loadNormalizeModule();
  try {
    const projectRoot = path.resolve("/workspace/pritha");
    const timestamp = "2026-08-26T12:00:00.000Z";
    const inside = loaded.module.normalizeNativeItem("chat_test", {
      id: "command-inside",
      type: "commandExecution",
      status: "completed",
      command: "npm test",
      cwd: path.join(projectRoot, "interfaces/control-center"),
      aggregatedOutput: "x".repeat(20_000),
      exitCode: 0,
    }, projectRoot, timestamp);
    assert.equal(inside.cwdLabel, "interfaces/control-center");
    assert.equal(inside.outputPreview.length, 16_384);

    const outside = loaded.module.normalizeNativeItem("chat_test", {
      id: "command-outside",
      type: "commandExecution",
      status: "completed",
      command: "pwd",
      cwd: "/private/operator/secrets",
    }, projectRoot, timestamp);
    assert.equal(outside.cwdLabel, "secrets");
    assert.doesNotMatch(JSON.stringify(outside), /private\/operator/);

    const reasoning = loaded.module.normalizeNativeItem("chat_test", {
      id: "reasoning",
      type: "reasoning",
      summary: ["Safe progress summary"],
      text: "raw hidden reasoning must not escape",
    }, projectRoot, timestamp);
    assert.equal(reasoning.markdown, "Safe progress summary");
    assert.doesNotMatch(JSON.stringify(reasoning), /raw hidden reasoning/);

    const unsupported = loaded.module.normalizeNativeItem("chat_test", {
      id: "future-item",
      type: "futureExperimentalThing",
    }, projectRoot, timestamp);
    assert.equal(unsupported.kind, "unsupported");
    assert.equal(loaded.module.normalizeNativeItem("chat_test", { id: "empty-error-marker", type: "error" }, projectRoot, timestamp), null);
    assert.equal(loaded.module.normalizeCliItem("chat_test", {
      id: "model-metadata-warning",
      type: "error",
      message: "Model metadata for `qwen3.6-35b-a3b` not found. Defaulting to fallback metadata; this can degrade performance and cause issues.",
    }, projectRoot, timestamp), null);
    const diagnostic = loaded.module.normalizeCliItem("chat_test", {
      id: "runtime-diagnostic",
      type: "error",
      message: "A configured tool could not start.",
    }, projectRoot, timestamp);
    assert.equal(diagnostic.kind, "notice");
    assert.equal(diagnostic.tone, "warning");
    assert.equal(diagnostic.text, "A configured tool could not start.");
    assert.equal(loaded.module.normalizeNativeItem("chat_test", { id: "user", type: "userMessage" }, projectRoot, timestamp), null);

    const nativeTurn = loaded.module.normalizeNativeTurn({
      chatId: "chat_test",
      nativeThreadId: "native-thread",
      providerId: "desktop_bundled",
      title: "Test",
      preview: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      pinned: false,
      archived: false,
      lastStatus: "idle",
      messageReceipts: {},
      taskLinks: [],
    }, {
      id: "native-turn",
      status: "completed",
      startedAt: timestamp,
      items: [{
        id: "native-user",
        type: "userMessage",
        clientId: "client_message_recovered_123",
        content: [{ type: "text", text: "Accepted once" }],
      }],
    }, projectRoot, null);
    assert.equal(nativeTurn.clientMessageId, "client_message_recovered_123");
    assert.equal(nativeTurn.userMessage.markdown, "Accepted once");
  } finally {
    loaded.cleanup();
  }
});

test("CLI file changes retain structured update, move and unknown operations", async () => {
  const loaded = await loadNormalizeModule();
  try {
    const row = loaded.module.normalizeCliItem("chat_changes", { id: "files", type: "file_change", status: "completed", changes: [
      { path: "added.mjs", kind: { type: "add" } },
      { path: "updated.mjs", kind: { type: "update" } },
      { path: "removed.mjs", kind: "delete" },
      { path: "old.mjs", kind: { type: "update", move_path: "new.mjs" } },
      { path: "future.mjs", kind: { type: "future" } },
    ] }, process.cwd(), "2026-09-08T00:00:00.000Z");
    assert.equal(row.kind, "file_change");
    assert.deepEqual(row.changes.map(file => file.operation), ["add", "modify", "delete", "rename", "unknown"]);
  } finally { loaded.cleanup(); }
});
