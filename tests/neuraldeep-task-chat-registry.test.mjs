import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const sourceRoot = "interfaces/control-center/src/lib";

function transpile(source, replacements = []) {
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  output = output.replace(/"(?:\.\.\/){5}scripts\/([^"\n]+)"/g, (_match, relative) => JSON.stringify(pathToFileURL(path.resolve("scripts", relative)).href));
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  return output;
}

async function loadRegistryModules() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-task-chat-registry-"));
  const checkout = path.join(tmp, "checkout");
  const stateRoot = path.join(tmp, "state");
  mkdirSync(checkout, { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
export const resolveTechscopeRoot = () => ${JSON.stringify(checkout)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(stateRoot)};
`);
  writeFileSync(path.join(tmp, "private-json.mjs"), transpile(readFileSync(`${sourceRoot}/private-json.ts`, "utf8")));
  writeFileSync(path.join(tmp, "private-registry-lock.mjs"), transpile(readFileSync(`${sourceRoot}/codex-chat/private-registry-lock.ts`, "utf8")));
  writeFileSync(path.join(tmp, "private-store.mjs"), transpile(
    readFileSync(`${sourceRoot}/codex-chat/private-store.ts`, "utf8"),
    [
      ['"@/lib/pritha-paths"', '"./pritha-paths.mjs"'],
      ['"@/lib/private-json"', '"./private-json.mjs"'],
      ['"./private-registry-lock"', '"./private-registry-lock.mjs"'],
    ],
  ));
  writeFileSync(path.join(tmp, "voice-topic-store.mjs"), transpile(
    readFileSync(`${sourceRoot}/codex-chat/voice-topic-store.ts`, "utf8"),
    [
      ['"@/lib/pritha-paths"', '"./pritha-paths.mjs"'],
      ['"@/lib/private-json"', '"./private-json.mjs"'],
      ['"./private-registry-lock"', '"./private-registry-lock.mjs"'],
      ['"./private-store"', '"./private-store.mjs"'],
    ],
  ));
  writeFileSync(path.join(tmp, "voice-topic-routing.mjs"), transpile(
    readFileSync(`${sourceRoot}/codex-chat/voice-topic-routing.ts`, "utf8"),
  ));
  return {
    tmp,
    stateRoot,
    chatRoot: path.join(stateRoot, "codex-chat"),
    store: await import(`${pathToFileURL(path.join(tmp, "private-store.mjs")).href}?${Math.random()}`),
    topics: await import(`${pathToFileURL(path.join(tmp, "voice-topic-store.mjs")).href}?${Math.random()}`),
    routing: await import(`${pathToFileURL(path.join(tmp, "voice-topic-routing.mjs")).href}?${Math.random()}`),
    locks: await import(`${pathToFileURL(path.join(tmp, "private-registry-lock.mjs")).href}?${Math.random()}`),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

function turn(index, overrides = {}) {
  const timestamp = `2026-09-03T00:00:${String(index).padStart(2, "0")}.000Z`;
  return {
    turnId: `turn_${String(index).padStart(8, "0")}`,
    clientMessageId: `message_${String(index).padStart(8, "0")}`,
    status: "completed",
    userMessage: {
      id: `item_${String(index).padStart(8, "0")}`,
      role: "user",
      markdown: `request ${index}`,
      status: "completed",
      createdAt: timestamp,
    },
    items: [],
    pendingRequestIds: [],
    startedAt: timestamp,
    completedAt: timestamp,
    error: null,
    usage: { inputTokens: index, cachedInputTokens: 0, outputTokens: index + 1, reasoningOutputTokens: 0 },
    ...overrides,
  };
}

function binding(index, identity, overrides = {}) {
  const timestamp = `2026-09-03T00:00:${String(index).padStart(2, "0")}.000Z`;
  return {
    chatId: `chat_${String(index).padStart(8, "0")}`,
    clientThreadId: `client_thread_${String(index).padStart(8, "0")}`,
    createHash: `hash-${index}`,
    nativeThreadId: `session-${index}`,
    providerId: "neuraldeep_cli",
    providerState: "available",
    modelId: "qwen3.6-35b-a3b",
    effortId: "medium",
    stateIdentityHash: identity,
    group: "my_chats",
    origin: "chat",
    continuationEnabled: true,
    continuationEnabledAt: timestamp,
    voiceTopicId: null,
    title: `Chat ${index}`,
    preview: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    pinned: false,
    archived: false,
    lastStatus: "idle",
    messageReceipts: {},
    taskLinks: [],
    turns: [],
    ...overrides,
  };
}

test("v1 and v2 chat registries remain readable and preserve NeuralDeep history fields", async () => {
  for (const version of [1, 2]) {
    const loaded = await loadRegistryModules();
    try {
      mkdirSync(loaded.chatRoot, { recursive: true });
      const identity = new loaded.store.CodexChatPrivateStore().stateIdentityHash;
      const legacyTurn = turn(version);
      const legacy = binding(version, identity, {
        group: undefined,
        origin: undefined,
        continuationEnabled: undefined,
        continuationEnabledAt: undefined,
        stateIdentityHash: undefined,
        turns: [legacyTurn],
        messageReceipts: {
          [legacyTurn.clientMessageId]: {
            clientMessageId: legacyTurn.clientMessageId,
            requestHash: "receipt-hash",
            turnId: legacyTurn.turnId,
            nativeTurnId: `session-${version}`,
            startedAt: legacyTurn.startedAt,
          },
        },
        taskLinks: [{
          taskId: `task-${version}`,
          shortId: "ABC",
          label: "Legacy task",
          origin: "voice",
          mode: "result_reference",
          subjectScope: null,
          status: "complete",
          linkedAt: legacyTurn.startedAt,
        }],
      });
      writeFileSync(path.join(loaded.chatRoot, "registry.json"), `${JSON.stringify({ version, chats: { [legacy.chatId]: legacy } })}\n`);
      const store = new loaded.store.CodexChatPrivateStore();
      const restored = await store.get(legacy.chatId);
      assert.equal(restored.group, "my_chats");
      assert.equal(restored.origin, "chat");
      assert.equal(restored.continuationEnabled, true);
      assert.equal(restored.stateIdentityHash, "");
      assert.equal(restored.identityStatus, "unverified");
      assert.equal(restored.nativeThreadId, `session-${version}`);
      assert.equal(restored.modelId, "qwen3.6-35b-a3b");
      assert.equal(restored.turns[0].usage.inputTokens, version);
      assert.equal(restored.messageReceipts[legacyTurn.clientMessageId].turnId, legacyTurn.turnId);
      assert.equal(restored.taskLinks[0].taskId, `task-${version}`);
    } finally {
      loaded.cleanup();
    }
  }
});

test("multiple store instances do not lose chats, turns, receipts or task links", async () => {
  const loaded = await loadRegistryModules();
  try {
    const identity = new loaded.store.CodexChatPrivateStore().stateIdentityHash;
    const count = 24;
    await Promise.all(Array.from({ length: count }, (_, index) => {
      const store = new loaded.store.CodexChatPrivateStore();
      return store.put(binding(index + 1, identity));
    }));
    await Promise.all(Array.from({ length: count }, (_, index) => {
      const row = turn(index + 1);
      const taskId = `task-${String(index + 1).padStart(8, "0")}`;
      const store = new loaded.store.CodexChatPrivateStore();
      return store.mutate(`chat_${String(index + 1).padStart(8, "0")}`, (current) => ({
        ...current,
        turns: [...current.turns, row],
        messageReceipts: {
          ...current.messageReceipts,
          [row.clientMessageId]: {
            clientMessageId: row.clientMessageId,
            requestHash: `receipt-${index}`,
            turnId: row.turnId,
            nativeTurnId: current.nativeThreadId,
            startedAt: row.startedAt,
          },
        },
        taskLinks: [...current.taskLinks, {
          taskId,
          shortId: null,
          label: `Task ${index + 1}`,
          origin: "voice",
          mode: "result_reference",
          subjectScope: null,
          status: "complete",
          linkedAt: row.startedAt,
        }],
      }));
    }));
    const saved = JSON.parse(readFileSync(path.join(loaded.chatRoot, "registry.json"), "utf8"));
    assert.equal(saved.version, 3);
    const rows = await new loaded.store.CodexChatPrivateStore().all();
    assert.equal(rows.length, count);
    for (const row of rows) {
      const chat = await new loaded.store.CodexChatPrivateStore().get(row.chatId);
      assert.equal(chat.turns.length, 1);
      assert.equal(Object.keys(chat.messageReceipts).length, 1);
      assert.equal(chat.taskLinks.length, 1);
    }
    assert.ok(readdirSync(loaded.chatRoot).some((name) => name.startsWith("registry.pre-neuraldeep-sqlite.")));
  } finally {
    loaded.cleanup();
  }
});

test("registry lock preserves live owners and moves dead owners to stale evidence", async () => {
  const loaded = await loadRegistryModules();
  try {
    const lockDirectory = path.join(loaded.chatRoot, "locks");
    mkdirSync(lockDirectory, { recursive: true });
    const lockPath = path.join(lockDirectory, "task-chat-voice-registry.lock");
    writeFileSync(lockPath, `${JSON.stringify({
      version: 1,
      token: "live-owner",
      pid: process.pid,
      hostname: hostname(),
      createdAt: new Date().toISOString(),
      resource: "task-chat-voice-registry",
    })}\n`);
    await assert.rejects(
      loaded.locks.withPrivateRegistryLock({
        stateRoot: loaded.stateRoot,
        lockDirectory,
        resource: "task-chat-voice-registry",
        timeoutMs: 120,
      }, async () => undefined),
      (error) => error.code === "private_registry_lock_timeout",
    );
    assert.equal(JSON.parse(readFileSync(lockPath, "utf8")).token, "live-owner");

    writeFileSync(lockPath, `${JSON.stringify({
      version: 1,
      token: "dead-owner",
      pid: 999_999_999,
      hostname: hostname(),
      createdAt: new Date().toISOString(),
      resource: "task-chat-voice-registry",
    })}\n`);
    let ran = false;
    await loaded.locks.withPrivateRegistryLock({
      stateRoot: loaded.stateRoot,
      lockDirectory,
      resource: "task-chat-voice-registry",
      timeoutMs: 500,
    }, async () => { ran = true; });
    assert.equal(ran, true);
    assert.equal(existsSync(lockPath), false);
    const evidenceRoot = path.join(lockDirectory, "stale-evidence");
    assert.ok(readdirSync(evidenceRoot).some((name) => name.includes("task-chat-voice-registry.lock")));
  } finally {
    loaded.cleanup();
  }
});

test("Voice topic routing pins generation, model and session identity", async () => {
  const loaded = await loadRegistryModules();
  try {
    const store = new loaded.topics.VoiceTopicStore();
    const baseScope = { kind: "agent", id: "pictureboom", label: "PictureBoom", generation: 1 };
    const topicId = loaded.topics.voiceTopicIdFor(store.stateIdentityHash, baseScope);
    const now = "2026-09-03T00:00:00.000Z";
    const first = await store.putIfAbsent({
      topicId,
      scope: baseScope,
      chatId: "chat_voice0001",
      sessionId: null,
      modelId: "qwen3.6-35b-a3b",
      effortId: "medium",
      stateIdentityHash: store.stateIdentityHash,
      createdAt: now,
      updatedAt: now,
      operationalStatus: "idle",
      activeTaskId: null,
      queuedTaskIds: [],
      lastTaskId: null,
      lastErrorCode: null,
    });
    assert.equal(first.created, true);
    const replay = await store.putIfAbsent({ ...first.topic, modelId: "different-model" });
    assert.equal(replay.created, false);
    assert.equal(replay.topic.modelId, "qwen3.6-35b-a3b");
    await store.bindSession(topicId, "session-pinned");
    await store.bindSession(topicId, "session-pinned");
    await assert.rejects(store.bindSession(topicId, "session-other"), (error) => error.code === "runtime_identity_mismatch");

    const topics = await store.all();
    assert.equal(loaded.routing.resolveVoiceTopicScope({
      scope: baseScope,
      topics,
      stateIdentityHash: store.stateIdentityHash,
      threadReset: false,
      exactGeneration: false,
    }).generation, 1);
    assert.equal(loaded.routing.resolveVoiceTopicScope({
      scope: baseScope,
      topics,
      stateIdentityHash: store.stateIdentityHash,
      threadReset: true,
      exactGeneration: false,
    }).generation, 2);
    assert.equal(loaded.routing.resolveVoiceTopicScope({
      scope: baseScope,
      topics,
      stateIdentityHash: store.stateIdentityHash,
      threadReset: true,
      exactGeneration: true,
    }).generation, 1);
    assert.ok(readdirSync(loaded.chatRoot).some((name) => name.startsWith("voice-topic-registry.pre-task-chat-voice.")));
  } finally {
    loaded.cleanup();
  }
});

test("corrupt Voice topic primary restores backup and two corrupt copies fail read-only", async () => {
  const loaded = await loadRegistryModules();
  try {
    const store = new loaded.topics.VoiceTopicStore();
    mkdirSync(loaded.chatRoot, { recursive: true });
    const scope = { kind: "control", id: "voice", label: "Voice", generation: 1 };
    const record = {
      topicId: loaded.topics.voiceTopicIdFor(store.stateIdentityHash, scope),
      scope,
      chatId: "chat_voice0002",
      sessionId: null,
      modelId: "qwen3.6-35b-a3b",
      effortId: "medium",
      stateIdentityHash: store.stateIdentityHash,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
      operationalStatus: "idle",
      activeTaskId: null,
      queuedTaskIds: [],
      lastTaskId: null,
      lastErrorCode: null,
    };
    const valid = { version: 1, topics: { [record.topicId]: record } };
    writeFileSync(store.registryPath, "{broken-primary");
    writeFileSync(store.backupPath, `${JSON.stringify(valid)}\n`);
    assert.equal((await store.all())[0].topicId, record.topicId);
    assert.deepEqual(JSON.parse(readFileSync(store.registryPath, "utf8")), valid);

    writeFileSync(store.registryPath, "{broken-primary");
    writeFileSync(store.backupPath, "{broken-backup");
    const failed = new loaded.topics.VoiceTopicStore();
    await assert.rejects(failed.all(), (error) => error.code === "voice_topic_registry_corrupt");
  } finally {
    loaded.cleanup();
  }
});
