import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  output = output.replace(/"(?:\.\.\/){5}scripts\/([^"\n]+)"/g, (_match, relative) => JSON.stringify(pathToFileURL(path.resolve("scripts", relative)).href));
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  return output;
}

async function loadVoiceLinks() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-voice-links-"));
  const checkout = path.join(tmp, "checkout");
  const stateRoot = path.join(tmp, "state");
  const privateRoot = path.join(stateRoot, "private", "interface-lab", "pritha-control-center", "realtime");
  const taskRoot = path.join(privateRoot, "codex-tasks");
  mkdirSync(checkout, { recursive: true });
  mkdirSync(taskRoot, { recursive: true });
  writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
import path from "node:path";
export const resolveTechscopeRoot = () => ${JSON.stringify(checkout)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(stateRoot)};
export const resolvePrithaStatePath = (...parts) => path.join(${JSON.stringify(stateRoot)}, ...parts);
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
  writeFileSync(path.join(tmp, "voice-topic-routing.mjs"), transpile(readFileSync(`${sourceRoot}/codex-chat/voice-topic-routing.ts`, "utf8")));
  writeFileSync(path.join(tmp, "normalize.mjs"), transpile(readFileSync(`${sourceRoot}/codex-chat/normalize.ts`, "utf8")));
  writeFileSync(path.join(tmp, "voice-task-links.mjs"), transpile(
    readFileSync(`${sourceRoot}/codex-chat/voice-task-links.ts`, "utf8"),
    [
      ['"@/lib/pritha-paths"', '"./pritha-paths.mjs"'],
      ['"@/lib/private-json"', '"./private-json.mjs"'],
      ['"./normalize"', '"./normalize.mjs"'],
      ['"./private-store"', '"./private-store.mjs"'],
      ['"./voice-topic-routing"', '"./voice-topic-routing.mjs"'],
      ['"./voice-topic-store"', '"./voice-topic-store.mjs"'],
    ],
  ));
  return {
    tmp,
    stateRoot,
    taskRoot,
    chatRoot: path.join(stateRoot, "codex-chat"),
    module: await import(`${pathToFileURL(path.join(tmp, "voice-task-links.mjs")).href}?${Math.random()}`),
    stores: await import(`${pathToFileURL(path.join(tmp, "private-store.mjs")).href}?${Math.random()}`),
    topics: await import(`${pathToFileURL(path.join(tmp, "voice-topic-store.mjs")).href}?${Math.random()}`),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

function scope(generation = 1) {
  return { kind: "agent", id: "pictureboom", label: "PictureBoom", generation };
}

test("Voice cards in one scope share a pinned persistent session and FIFO topic", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const first = await service.resolve({
      taskId: "task-one",
      shortId: "A01",
      taskText: "Create the first image draft",
      scope: scope(),
      threadReset: false,
      exactGeneration: false,
      modelId: "qwen3.6-35b-a3b",
      effortId: "medium",
      createdAt: "2026-09-03T01:00:00.000Z",
    });
    const second = await service.resolve({
      taskId: "task-two",
      shortId: "A02",
      taskText: "Refine the same image topic",
      scope: scope(),
      threadReset: false,
      exactGeneration: false,
      modelId: "a-new-global-model",
      effortId: "high",
      createdAt: "2026-09-03T01:00:01.000Z",
    });
    assert.equal(second.topic.topicId, first.topic.topicId);
    assert.equal(second.binding.chatId, first.binding.chatId);
    assert.equal(second.topic.modelId, "qwen3.6-35b-a3b");
    assert.equal(second.topic.effortId, "medium");
    assert.deepEqual((await service.topicStore.get(first.topic.topicId)).queuedTaskIds, ["task-one", "task-two"]);
    assert.equal((await service.taskChatLinkForTask("task-one")).href, `/task-chat?group=voice_work&chat=${first.binding.chatId}`);

    await service.markStarted(first.topic.topicId, "task-one");
    await service.bindSession(first.topic.topicId, "task-one", "session-persistent");
    await service.applyCliEvent(first.topic.topicId, "task-one", {
      type: "item.completed",
      item: { id: "message-1", type: "agent_message", status: "completed", text: "First result" },
    });
    await service.applyCliEvent(first.topic.topicId, "task-one", {
      type: "turn.completed",
      usage: { input_tokens: 10, output_tokens: 4 },
    });
    await assert.rejects(
      service.bindSession(first.topic.topicId, "task-one", "different-session"),
      (error) => error.code === "runtime_identity_mismatch",
    );
    await service.finish({
      topicId: first.topic.topicId,
      taskId: "task-one",
      turnStatus: "completed",
      taskStatus: "complete",
      error: null,
      preview: "First result",
    });
    assert.deepEqual((await service.topicStore.get(first.topic.topicId)).queuedTaskIds, ["task-two"]);
    await service.markStarted(first.topic.topicId, "task-two");
    assert.equal((await service.topicStore.get(first.topic.topicId)).sessionId, "session-persistent");
    await service.finish({ topicId: first.topic.topicId, taskId: "task-two", turnStatus: "completed", taskStatus: "complete", error: null });
    const handoff = {taskId:"task-two",expectedRevision:(await service.chatStore.get(first.binding.chatId)).revision,topicGeneration:first.topic.scope.generation};
    await assert.rejects(service.enableContinuation(first.binding.chatId,{...handoff,expectedRevision:handoff.expectedRevision-1}),error=>error.code==='history_revision_conflict');
    await assert.rejects(service.enableContinuation(first.binding.chatId,{...handoff,topicGeneration:handoff.topicGeneration+1}),/voice_topic_generation_conflict/);
    await assert.rejects(service.enableContinuation(first.binding.chatId,{...handoff,taskId:"task-one"}),error=>error.code==='voice_handoff_revision_conflict');
    const continued = await service.enableContinuation(first.binding.chatId,handoff);
    assert.equal((await service.enableContinuation(first.binding.chatId,handoff)).revision,continued.revision);
    assert.equal(continued.continuationEnabled, true);
    assert.ok(continued.taskLinks.every((link) => link.mode === "shared_thread"));
    const sidecar = JSON.parse(readFileSync(path.join(loaded.taskRoot, "task-one", "thread-links.json"), "utf8"));
    assert.equal(sidecar.schema, loaded.module.NEURALDEEP_VOICE_TASK_LINK_SCHEMA);
    assert.equal(sidecar.sessionId, "session-persistent");
  } finally {
    loaded.cleanup();
  }
});

test("thread reset creates a new generation while ordinary cards keep the latest topic", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const first = await service.resolve({ taskId: "task-base", taskText: "Base", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-one", effortId: "low" });
    const reset = await service.resolve({ taskId: "task-reset", taskText: "Reset", scope: scope(), threadReset: true, exactGeneration: false, modelId: "model-two", effortId: "high" });
    const latest = await service.resolve({ taskId: "task-latest", taskText: "Latest", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-three", effortId: null });
    assert.equal(first.topic.scope.generation, 1);
    assert.equal(reset.topic.scope.generation, 2);
    assert.notEqual(reset.topic.topicId, first.topic.topicId);
    assert.equal(latest.topic.topicId, reset.topic.topicId);
    assert.equal(latest.topic.modelId, "model-two");
  } finally {
    loaded.cleanup();
  }
});

test("predecessor failure blocks later Voice cards and old ephemeral tasks stay unlinked", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const first = await service.resolve({ taskId: "task-fail", taskText: "Failing task", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-one", effortId: null });
    await service.resolve({ taskId: "task-after", taskText: "Later task", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-one", effortId: null });
    await service.markStarted(first.topic.topicId, "task-fail");
    await service.finish({ topicId: first.topic.topicId, taskId: "task-fail", turnStatus: "failed", taskStatus: "failed", error: { code: "codex_cli_failed", message: "Failed" }, topicStatus: "predecessor_confirmation_required" });
    assert.deepEqual(await service.blockQueuedAfterFailure(first.topic.topicId), ["task-after"]);
    const binding = await service.chatStore.get(first.binding.chatId);
    assert.equal(binding.turns.find((turn) => turn.taskId === "task-after").error.code, "predecessor_confirmation_required");

    mkdirSync(path.join(loaded.taskRoot, "legacy-ephemeral"), { recursive: true });
    writeFileSync(path.join(loaded.taskRoot, "legacy-ephemeral", "request.json"), "{}\n");
    assert.equal(await service.taskChatLinkForTask("legacy-ephemeral"), null);
    const reconciled = await service.reconcileRecent();
    assert.ok(reconciled.processed >= 2);
    assert.equal(await service.taskChatLinkForTask("legacy-ephemeral"), null);
  } finally {
    loaded.cleanup();
  }
});

test("incremental reconciler restores only the explicit persistent NeuralDeep link schema", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const linked = await service.resolve({ taskId: "task-reconcile", taskText: "Restore me", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-one", effortId: null });
    // Damage only the synthetic projection; the immutable source remains intact.
    (await service.chatStore.historyStore()).db.exec("DELETE FROM chats");
    const fresh = new loaded.module.VoiceTaskLinkService({
      chatStore: new loaded.stores.CodexChatPrivateStore(),
      topicStore: new loaded.topics.VoiceTopicStore(),
    });
    assert.equal(await fresh.chatStore.get(linked.binding.chatId), null);
    const firstPass = await fresh.reconcileRecent();
    assert.equal(firstPass.processed, 1);
    const repaired = await fresh.chatStore.get(linked.binding.chatId);
    assert.equal(repaired.origin, "voice");
    assert.equal(repaired.turns[0].taskId, "task-reconcile");
    assert.equal((await fresh.reconcileRecent()).processed, 0);

    const sidecarPath = path.join(loaded.taskRoot, "task-reconcile", "thread-links.json");
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
    writeFileSync(sidecarPath, `${JSON.stringify({ ...sidecar, updatedAt: new Date().toISOString(), signatureEvidence: "changed" })}\n`);
    assert.equal((await fresh.reconcileRecent()).processed, 1);
  } finally {
    loaded.cleanup();
  }
});

test("a prepared terminal sidecar completes a cross-registry transaction after restart", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const linked = await service.resolve({ taskId: "task-prepared", taskText: "Finish safely", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-one", effortId: null });
    await service.markStarted(linked.topic.topicId, "task-prepared");
    await service.bindSession(linked.topic.topicId, "task-prepared", "session-prepared");
    const sidecarPath = path.join(loaded.taskRoot, "task-prepared", "thread-links.json");
    const prepared = JSON.parse(readFileSync(sidecarPath, "utf8"));
    const completedAt = new Date(Date.now() + 1_000).toISOString();
    prepared.turn = { ...prepared.turn, status: "completed", completedAt, error: null };
    prepared.taskLink = { ...prepared.taskLink, status: "complete" };
    prepared.updatedAt = completedAt;
    writeFileSync(sidecarPath, `${JSON.stringify(prepared)}\n`);
    writeFileSync(path.join(loaded.taskRoot, "task-prepared", "status.json"), `${JSON.stringify({ status: "running" })}\n`);

    await service.recoverAfterRestart();

    const binding = await service.chatStore.get(linked.binding.chatId);
    const topic = await service.topicStore.get(linked.topic.topicId);
    const status = JSON.parse(readFileSync(path.join(loaded.taskRoot, "task-prepared", "status.json"), "utf8"));
    assert.equal(binding.turns.find((turn) => turn.taskId === "task-prepared").status, "completed");
    assert.equal(topic.operationalStatus, "idle");
    assert.equal(status.status, "complete");
  } finally {
    loaded.cleanup();
  }
});

test("operator input pauses a Voice topic and resumes the same pinned session first", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const first = await service.resolve({ taskId: "task-question", taskText: "Ask if blocked", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-one", effortId: null });
    await service.resolve({ taskId: "task-after-question", taskText: "Wait behind question", scope: scope(), threadReset: false, exactGeneration: false, modelId: "model-one", effortId: null });
    await service.markStarted(first.topic.topicId, "task-question");
    await service.bindSession(first.topic.topicId, "task-question", "session-question");
    await service.applyCliEvent(first.topic.topicId, "task-question", {
      type: "item.completed",
      item: { id: "question-message", type: "agent_message", status: "completed", text: "PRITHA_OPERATOR_INPUT_REQUIRED: Which branch should I use?" },
    });
    await service.finish({
      topicId: first.topic.topicId,
      taskId: "task-question",
      turnStatus: "waiting_for_input",
      taskStatus: "waiting_for_operator",
      error: { code: "operator_input_required", message: "Which branch should I use?" },
      topicStatus: "waiting_for_operator",
    });

    let topic = await service.topicStore.get(first.topic.topicId);
    let binding = await service.chatStore.get(first.binding.chatId);
    assert.equal(topic.activeTaskId, "task-question");
    assert.deepEqual(topic.queuedTaskIds, ["task-after-question"]);
    assert.equal(topic.operationalStatus, "waiting_for_operator");
    assert.equal(binding.turns.find((turn) => turn.taskId === "task-question").items.at(-1).message.markdown, "Which branch should I use?");

    await service.markQueued(first.topic.topicId, "task-question");
    await service.markStarted(first.topic.topicId, "task-question");
    topic = await service.topicStore.get(first.topic.topicId);
    assert.equal(topic.sessionId, "session-question");
    assert.equal(topic.activeTaskId, "task-question");
  } finally {
    loaded.cleanup();
  }
});

test("restart marks an in-flight persistent Voice card for explicit recovery", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const linked = await service.resolve({
      taskId: "task-restart",
      taskText: "Make a safe change",
      scope: scope(),
      threadReset: false,
      exactGeneration: false,
      modelId: "model-one",
      effortId: null,
    });
    await service.markStarted(linked.topic.topicId, "task-restart");
    await service.applyCliEvent(linked.topic.topicId, "task-restart", {
      type: "item.started",
      item: { id: "command-restart", type: "command_execution", status: "in_progress", command: "npm test" },
    });
    writeFileSync(path.join(loaded.taskRoot, "task-restart", "status.json"), `${JSON.stringify({ status: "running" })}\n`);

    await service.recoverAfterRestart();

    const status = JSON.parse(readFileSync(path.join(loaded.taskRoot, "task-restart", "status.json"), "utf8"));
    const recoveredLink = await service.readLink("task-restart");
    assert.equal(status.status, "failed");
    assert.equal(status.error_code, "resume_confirmation_required");
    assert.equal(recoveredLink.turn.status, "failed");
    assert.equal(recoveredLink.turn.error.code, "resume_confirmation_required");
    assert.equal((await service.topicStore.get(linked.topic.topicId)).operationalStatus, "resume_confirmation_required");
  } finally {
    loaded.cleanup();
  }
});

test("a waiting approval keeps later cards behind the same topic gate", async () => {
  const loaded = await loadVoiceLinks();
  try {
    const service = new loaded.module.VoiceTaskLinkService();
    const first = await service.resolve({
      taskId: "task-approval",
      taskText: "Approval first",
      scope: scope(),
      threadReset: false,
      exactGeneration: false,
      modelId: "model-one",
      effortId: null,
      initialStatus: "waiting_for_approval",
    });
    await service.resolve({
      taskId: "task-behind-approval",
      taskText: "Run later",
      scope: scope(),
      threadReset: false,
      exactGeneration: false,
      modelId: "model-one",
      effortId: null,
    });
    const topic = await service.topicStore.get(first.topic.topicId);
    assert.equal(topic.operationalStatus, "waiting_for_approval");
    assert.deepEqual(topic.queuedTaskIds, ["task-approval", "task-behind-approval"]);
  } finally {
    loaded.cleanup();
  }
});

test("another live admission worker keeps its Voice topic and queued successor during recovery", async () => {
  const loaded=await loadVoiceLinks();
  const {NeuralDeepCoordinationStore,neuralDeepCoordinationPaths,coordinationHash}=await import('../scripts/neuraldeep/coordination-store.mjs');
  const coordination=new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(loaded.stateRoot,path.join(loaded.tmp,'checkout')));
  try {
    const service=new loaded.module.VoiceTaskLinkService();
    const linked=await service.resolve({taskId:'live-task',taskText:'Synthetic live work',scope:scope(),threadReset:false,exactGeneration:false,modelId:'model-one',effortId:null});
    await service.resolve({taskId:'queued-task',taskText:'Synthetic next work',scope:scope(),threadReset:false,exactGeneration:false,modelId:'model-one',effortId:null});
    await service.markStarted(linked.topic.topicId,'live-task');
    coordination.enqueue({attemptId:'live-attempt',workloadId:'live-task',surface:'voice',coordinationKeyHash:coordinationHash(linked.topic.topicId),queuedAt:new Date().toISOString()});
    coordination.claim('live-attempt',2);
    coordination.enqueue({attemptId:'queued-attempt',workloadId:'queued-task',surface:'voice',coordinationKeyHash:coordinationHash(linked.topic.topicId),queuedAt:new Date().toISOString()});
    const before=await service.topicStore.get(linked.topic.topicId);
    const result=await service.recoverAfterRestart();
    assert.deepEqual(result.topics,[]);assert.deepEqual(await service.topicStore.get(linked.topic.topicId),before);
    const binding=await service.chatStore.get(linked.binding.chatId);
    assert.equal(binding.turns.find(turn=>turn.taskId==='live-task').status,'in_progress');
    assert.equal(binding.turns.find(turn=>turn.taskId==='queued-task').status,'queued');
  } finally {coordination.close();loaded.cleanup();}
});
