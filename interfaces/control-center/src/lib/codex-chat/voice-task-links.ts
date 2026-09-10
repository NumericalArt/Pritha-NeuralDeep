import { NeuralDeepCoordinationStore, coordinationHash, neuralDeepCoordinationPaths } from "../../../../../scripts/neuraldeep/coordination-store.mjs";
import { neuralDeepSessionKey } from "../../../../../scripts/neuraldeep/runtime-identity.mjs";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { atomicWritePrivateJson } from "@/lib/private-json";
import { cliItemOriginalText, normalizeCliItem } from "./normalize";
import { CodexChatPrivateStore, type ChatBinding } from "./private-store";
import type { ChatItemView, TaskLinkView, TurnStatus, TurnView } from "./types";
import { resolveVoiceTopicScope } from "./voice-topic-routing";
import {
  VoiceTopicSessionMismatchError,
  VoiceTopicStore,
  voiceTopicIdFor,
  type VoiceTopicOperationalStatus,
  type VoiceTopicRecord,
  type VoiceTopicScope,
} from "./voice-topic-store";

export const NEURALDEEP_VOICE_TASK_LINK_SCHEMA = "pritha-neuraldeep-voice-task-link-v1";

export type PersistentVoiceTaskLink = {
  schema: typeof NEURALDEEP_VOICE_TASK_LINK_SCHEMA;
  version: 1;
  persistent: true;
  stateIdentityHash: string;
  taskId: string;
  chatId: string;
  topicId: string;
  turnId: string;
  clientMessageId: string;
  sessionId: string | null;
  scope: VoiceTopicScope;
  modelId: string;
  effortId: string | null;
  taskLink: TaskLinkView;
  turn: TurnView;
  createdAt: string;
  updatedAt: string;
};

type VoiceTaskLinkIndex = {
  schema: "pritha-neuraldeep-voice-task-link-index-v1";
  completedAt: string;
  signatures: Record<string, string>;
};

export type ResolvedVoiceTaskLink = {
  topic: VoiceTopicRecord;
  binding: ChatBinding;
  taskLink: TaskLinkView;
  turn: TurnView;
  link: PersistentVoiceTaskLink;
};

type VoiceTaskLinkServiceOptions = {
  stateRoot?: string;
  taskRoot?: string;
  chatStore?: CodexChatPrivateStore;
  topicStore?: VoiceTopicStore;
};

const SAFE_TASK_ID = /^[0-9A-Za-z][0-9A-Za-z._:-]{0,119}$/;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const ACTIVE_TURN_STATUSES = new Set<TurnStatus>(["queued", "waiting_for_provider", "in_progress", "waiting_for_approval", "waiting_for_input"]);

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedText(value: unknown, max: number) {
  return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

function deterministicId(prefix: "chat_voice" | "turn_voice" | "item_voice" | "voice_message", value: string) {
  return `${prefix}${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function safeTimestamp(value: unknown, fallback = new Date().toISOString()) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function turnModifiedAt(turn: TurnView) {
  const timestamps = [
    turn.startedAt,
    turn.completedAt,
    ...turn.items.flatMap((item) => [item.startedAt, item.completedAt]),
  ]
    .map((value) => Date.parse(String(value || "")))
    .filter(Number.isFinite);
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function terminalTurn(status: TurnStatus) {
  return status === "completed" || status === "interrupted" || status === "failed";
}

function visibleAssistantMarkdown(value: string) {
  return value.replace(/^\s*PRITHA_OPERATOR_INPUT_REQUIRED:\s*/i, "").trim();
}

function taskRootDefault() {
  return path.join(resolvePrithaStatePath("private", "interface-lab", "pritha-control-center", "realtime"), "codex-tasks");
}

function taskStatusToTopicStatus(status: TurnStatus): VoiceTopicOperationalStatus {
  if (status === "waiting_for_approval") return "waiting_for_approval";
  if (status === "waiting_for_input" || status === "waiting_for_provider") return "waiting_for_operator";
  if (status === "queued") return "queued";
  if (status === "in_progress") return "active";
  if (status === "failed") return "failed";
  return "idle";
}

function usageFromEvent(value: unknown): TurnView["usage"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = value as Record<string, unknown>;
  return {
    inputTokens: Math.max(0, Number(usage.input_tokens) || 0),
    cachedInputTokens: Math.max(0, Number(usage.cached_input_tokens) || 0),
    outputTokens: Math.max(0, Number(usage.output_tokens) || 0),
    reasoningOutputTokens: Math.max(0, Number(usage.reasoning_output_tokens) || 0),
  };
}

function parsePersistentLink(value: unknown, stateIdentityHash: string): PersistentVoiceTaskLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<PersistentVoiceTaskLink>;
  if (row.schema !== NEURALDEEP_VOICE_TASK_LINK_SCHEMA || row.version !== 1 || row.persistent !== true) return null;
  if (row.stateIdentityHash !== stateIdentityHash || !SAFE_TASK_ID.test(String(row.taskId || ""))) return null;
  if (!/^chat_[A-Za-z0-9]+$/.test(String(row.chatId || "")) || !/^topic_[a-f0-9]{24,64}$/.test(String(row.topicId || ""))) return null;
  if (!/^turn_[A-Za-z0-9]+$/.test(String(row.turnId || "")) || !/^[A-Za-z0-9_-]{8,128}$/.test(String(row.clientMessageId || ""))) return null;
  if (!row.scope || voiceTopicIdFor(stateIdentityHash, row.scope) !== row.topicId) return null;
  if (!row.turn || row.turn.turnId !== row.turnId || !row.taskLink || row.taskLink.taskId !== row.taskId) return null;
  return row as PersistentVoiceTaskLink;
}

export class VoiceTaskLinkError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export class VoiceTaskLinkService {
  readonly stateRoot: string;
  readonly taskRoot: string;
  readonly chatStore: CodexChatPrivateStore;
  readonly topicStore: VoiceTopicStore;

  constructor(options: VoiceTaskLinkServiceOptions = {}) {
    const root = resolveTechscopeRoot();
    this.stateRoot = path.resolve(/* turbopackIgnore: true */ options.stateRoot || resolvePrithaStateRoot(root));
    this.taskRoot = path.resolve(/* turbopackIgnore: true */ options.taskRoot || taskRootDefault());
    this.chatStore = options.chatStore || new CodexChatPrivateStore();
    this.topicStore = options.topicStore || new VoiceTopicStore();
    if (this.chatStore.stateIdentityHash !== this.topicStore.stateIdentityHash) {
      throw new VoiceTaskLinkError("state_identity_mismatch", "Task Chat and Voice topic stores do not share one NeuralDeep state identity.");
    }
  }

  async resolve(input: {
    taskId: string;
    shortId?: string | null;
    taskText: string;
    scope: VoiceTopicScope;
    threadReset: boolean;
    exactGeneration: boolean;
    modelId: string;
    effortId: string | null;
    initialStatus?: Extract<TurnStatus, "queued" | "waiting_for_provider" | "waiting_for_approval" | "waiting_for_input">;
    createdAt?: string;
  }): Promise<ResolvedVoiceTaskLink> {
    if (!SAFE_TASK_ID.test(input.taskId)) throw new VoiceTaskLinkError("voice_task_id_invalid", "Voice task id is invalid.");
    if (!SAFE_MODEL_ID.test(input.modelId)) throw new VoiceTaskLinkError("voice_task_model_invalid", "Voice task model id is invalid.");
    const createdAt = safeTimestamp(input.createdAt);
    const topics = await this.topicStore.all();
    const scope = resolveVoiceTopicScope({
      scope: input.scope,
      topics,
      stateIdentityHash: this.topicStore.stateIdentityHash,
      threadReset: input.threadReset,
      exactGeneration: input.exactGeneration,
    });
    const topicId = voiceTopicIdFor(this.topicStore.stateIdentityHash, scope);
    const proposedChatId = deterministicId("chat_voice", topicId);
    const topicResult = await this.topicStore.putIfAbsent({
      topicId,
      scope,
      chatId: proposedChatId,
      sessionId: null,
      modelId: input.modelId,
      effortId: input.effortId,
      stateIdentityHash: this.topicStore.stateIdentityHash,
      createdAt,
      updatedAt: createdAt,
      operationalStatus: "idle",
      activeTaskId: null,
      queuedTaskIds: [],
      lastTaskId: null,
      lastErrorCode: null,
    });
    const topic = topicResult.topic;
    const chatId = topic.chatId;
    const turnId = deterministicId("turn_voice", `${topicId}:${input.taskId}`);
    const clientMessageId = deterministicId("voice_message", `${topicId}:${input.taskId}`);
    const itemId = deterministicId("item_voice", `${topicId}:${input.taskId}:user`);
    const taskText = String(input.taskText || "").trim().slice(0, 64_000);
    if (!taskText) throw new VoiceTaskLinkError("voice_task_text_missing", "Voice task text is required.");
    const initialStatus = input.initialStatus || "queued";
    const taskLink: TaskLinkView = {
      taskId: input.taskId,
      shortId: input.shortId ? boundedText(input.shortId, 12) : null,
      label: boundedText(taskText, 120) || "Voice task",
      origin: "voice",
      mode: "result_reference",
      subjectScope: scope,
      status: initialStatus,
      linkedAt: createdAt,
    };
    const turn: TurnView = {
      turnId,
      clientMessageId,
      taskId: input.taskId,
      status: initialStatus,
      userMessage: {
        id: itemId,
        role: "user",
        markdown: taskText,
        status: "completed",
        createdAt,
      },
      items: [{
        id: deterministicId("item_voice", `${topicId}:${input.taskId}:link`),
        kind: "task_link",
        task: taskLink,
        status: "completed",
        startedAt: createdAt,
        completedAt: createdAt,
      }],
      pendingRequestIds: [],
      startedAt: createdAt,
      completedAt: null,
      error: null,
      usage: null,
    };
    const requestHash = digest({ taskId: input.taskId, topicId, taskText });
    const bindingResult = await this.chatStore.mutateOrCreate(chatId, () => ({
      chatId,
      clientThreadId: `voice_${topicId.slice("topic_".length)}`,
      createHash: digest({ topicId, scope }),
      nativeThreadId: topic.sessionId,
      providerId: "neuraldeep_cli",
      providerState: "available",
      modelId: topic.modelId,
      effortId: topic.effortId,
      stateIdentityHash: topic.stateIdentityHash,
      group: "voice_work",
      origin: "voice",
      continuationEnabled: false,
      continuationEnabledAt: null,
      voiceTopicId: topic.topicId,
      title: `Voice · ${boundedText(scope.label, 90) || scope.id}`,
      preview: boundedText(taskText, 500),
      createdAt,
      updatedAt: createdAt,
      pinned: false,
      archived: false,
      lastStatus: "active",
      messageReceipts: {},
      taskLinks: [],
      turns: [],
    }), (current) => {
      if (current.origin !== "voice" || current.voiceTopicId !== topic.topicId || current.stateIdentityHash !== topic.stateIdentityHash) {
        throw new VoiceTaskLinkError("voice_chat_binding_conflict", "The Voice topic points to an incompatible Task Chat binding.");
      }
      if (current.modelId !== topic.modelId || current.effortId !== topic.effortId) {
        throw new VoiceTaskLinkError("voice_topic_model_mismatch", "An existing Voice topic keeps its pinned model and effort until thread reset.");
      }
      const priorReceipt = current.messageReceipts[clientMessageId];
      if (priorReceipt && priorReceipt.requestHash !== requestHash) {
        throw new VoiceTaskLinkError("idempotency_conflict", "This Voice task id was already linked with different content.");
      }
      const existingTurn = current.turns.find((candidate) => candidate.turnId === turnId);
      if (existingTurn && !priorReceipt && existingTurn.userMessage.markdown !== taskText) {
        throw new VoiceTaskLinkError("idempotency_conflict", "This Voice task id was already linked with different content.");
      }
      const turns = existingTurn ? current.turns : [...current.turns, turn];
      const existingLink = current.taskLinks.find((candidate) => candidate.taskId === input.taskId);
      const taskLinks = existingLink ? current.taskLinks : [...current.taskLinks, taskLink];
      return {
        ...current,
        nativeThreadId: current.nativeThreadId || topic.sessionId,
        preview: boundedText(taskText, 500),
        updatedAt: createdAt,
        lastStatus: "active",
        messageReceipts: {
          ...current.messageReceipts,
          [clientMessageId]: priorReceipt || {
            clientMessageId,
            requestHash,
            turnId,
            nativeTurnId: current.nativeThreadId || topic.sessionId || "",
            startedAt: createdAt,
          },
        },
        taskLinks,
        turns,
      };
    }, turnId);
    const binding = (await this.chatStore.historyStore()).get(chatId, { includeTurnId: turnId }) || bindingResult.binding;
    const savedTurn = binding.turns.find((candidate) => candidate.turnId === turnId) || turn;
    const savedTaskLink = binding.taskLinks.find((candidate) => candidate.taskId === input.taskId) || taskLink;
    const link = await this.writeLink({
      schema: NEURALDEEP_VOICE_TASK_LINK_SCHEMA,
      version: 1,
      persistent: true,
      stateIdentityHash: topic.stateIdentityHash,
      taskId: input.taskId,
      chatId,
      topicId,
      turnId,
      clientMessageId,
      sessionId: topic.sessionId,
      scope,
      modelId: topic.modelId,
      effortId: topic.effortId,
      taskLink: savedTaskLink,
      turn: savedTurn,
      createdAt,
      updatedAt: createdAt,
    });
    // Publish the recoverable sidecar before making the card runnable. If the
    // following topic mutation fails, recovery can still mark this turn as
    // requiring confirmation, but no unlinked session can be launched.
    await this.topicStore.queueTask(topicId, input.taskId);
    if (initialStatus !== "queued") await this.topicStore.setOperationalStatus(topicId, taskStatusToTopicStatus(initialStatus));
    return { topic: (await this.topicStore.get(topicId)) || topic, binding, taskLink: savedTaskLink, turn: savedTurn, link };
  }

  async markStarted(topicId: string, taskId: string) {
    const topic = await this.requireTopic(topicId);
    await this.topicStore.startTask(topicId, taskId);
    const binding = await this.updateTaskInBinding(topic, taskId, (turn) => ({ ...turn, status: "in_progress", error: null }), "running", "active");
    await this.refreshLink(taskId, topicId, binding);
    return { topic: await this.requireTopic(topicId), binding };
  }

  async markQueued(topicId: string, taskId: string) {
    const topic = await this.requireTopic(topicId);
    const binding = await this.updateTaskInBinding(topic, taskId, (turn) => ({
      ...turn,
      status: "queued",
      completedAt: null,
      error: null,
    }), "queued", "active");
    await this.topicStore.setOperationalStatus(topicId, "queued");
    await this.refreshLink(taskId, topicId, binding);
    return { topic: await this.requireTopic(topicId), binding };
  }

  async bindSession(topicId: string, taskId: string, sessionId: string) {
    const topic = await this.requireTopic(topicId);
    if (topic.sessionId && topic.sessionId !== sessionId) throw new VoiceTopicSessionMismatchError();
    const binding = await this.chatStore.get(topic.chatId);
    if (!binding || (binding.nativeThreadId && binding.nativeThreadId !== sessionId)) throw new VoiceTopicSessionMismatchError();
    await this.topicStore.bindSession(topicId, sessionId);
    const targetTurnId = (await this.chatStore.historyStore()).turnIdForTask(topic.chatId, taskId);
    const updated = await this.chatStore.mutate(topic.chatId, (current) => {
      if (current.nativeThreadId && current.nativeThreadId !== sessionId) throw new VoiceTopicSessionMismatchError();
      const turn = current.turns.find((candidate) => candidate.taskId === taskId);
      if (!turn?.clientMessageId) throw new VoiceTaskLinkError("voice_task_turn_missing", "The Voice task turn is missing from Task Chat.");
      return {
        ...current,
        nativeThreadId: sessionId,
        updatedAt: new Date().toISOString(),
        messageReceipts: {
          ...current.messageReceipts,
          [turn.clientMessageId]: {
            ...current.messageReceipts[turn.clientMessageId],
            nativeTurnId: sessionId,
          },
        },
      };
    }, targetTurnId || undefined);
    if (!updated) throw new VoiceTaskLinkError("voice_chat_binding_missing", "The Voice Task Chat binding is missing.");
    await this.refreshLink(taskId, topicId, updated);
    return { topic: await this.requireTopic(topicId), binding: updated };
  }

  async captureRawLine(topicId: string, taskId: string, line: string) {
    const topic = await this.requireTopic(topicId), database = await this.chatStore.historyStore();
    const turnId = database.turnIdForTask(topic.chatId, taskId);
    if (!turnId) throw new VoiceTaskLinkError("voice_task_turn_missing", "The Voice task turn is missing from Task Chat.");
    database.sourceRaw(topic.chatId, turnId, line);
  }

  async applyCliEvent(topicId: string, taskId: string, event: Record<string, unknown>, displayRoot = resolveTechscopeRoot()) {
    const type = String(event.type || "");
    if (type === "thread.started") {
      const sessionId = String(event.thread_id || "");
      if (/^[A-Za-z0-9._:-]{1,160}$/.test(sessionId)) return this.bindSession(topicId, taskId, sessionId);
      return null;
    }
    const topic = await this.requireTopic(topicId);
    if (type === "item.started" || type === "item.completed") {
      const database = await this.chatStore.historyStore(), turnId = database.turnIdForTask(topic.chatId, taskId);
      if (!turnId) throw new VoiceTaskLinkError("voice_task_turn_missing", "The Voice task turn is missing from Task Chat.");
      const normalizedItem = normalizeCliItem(`${topic.chatId}:${turnId}`, event.item, displayRoot, new Date().toISOString());
      if (!normalizedItem) return null;
      const visibleItem = normalizedItem.kind === "assistant_message"
        ? { ...normalizedItem, message: { ...normalizedItem.message, markdown: visibleAssistantMarkdown(normalizedItem.message.markdown) } }
        : normalizedItem;
      const original = cliItemOriginalText(event.item, normalizedItem);
      const item = database.putItem(topic.chatId, turnId, visibleItem, normalizedItem.kind === "assistant_message" && original != null ? visibleAssistantMarkdown(original) : original);
      const binding = await this.updateTaskInBinding(topic, taskId, turn => ({ ...turn, status: "in_progress" }), "running", "active");
      await this.refreshLink(taskId, topicId, binding);
      return { topic, binding, item };
    }
    if (type === "turn.completed") {
      const binding = await this.updateTaskInBinding(topic, taskId, (turn) => ({ ...turn, usage: usageFromEvent(event.usage) }), "running", "active");
      await this.refreshLink(taskId, topicId, binding);
      return { topic, binding };
    }
    return null;
  }

  async finish(input: {
    topicId: string;
    taskId: string;
    turnStatus: Extract<TurnStatus, "completed" | "interrupted" | "failed" | "waiting_for_input" | "waiting_for_provider">;
    taskStatus: string;
    error: TurnView["error"];
    preview?: string;
    topicStatus?: VoiceTopicOperationalStatus;
  }) {
    const topic = await this.requireTopic(input.topicId);
    const completedAt = ["completed", "interrupted", "failed"].includes(input.turnStatus) ? new Date().toISOString() : null;
    const existingLink = await this.readLink(input.taskId);
    if (!existingLink || existingLink.topicId !== input.topicId) {
      throw new VoiceTaskLinkError("voice_task_link_incomplete", "The Voice task link is incomplete.");
    }
    const preparedTurn: TurnView = {
      ...existingLink.turn,
      status: input.turnStatus,
      completedAt,
      error: input.error,
      items: existingLink.turn.items.map((item) => item.status === "in_progress"
        ? { ...item, status: input.turnStatus === "completed" ? "completed" as const : "failed" as const, completedAt: completedAt || item.completedAt }
        : item),
    };
    const preparedTaskLink = { ...existingLink.taskLink, status: input.taskStatus };
    // The sidecar is the write-ahead record for the cross-registry update. If
    // the process stops between files, startup reconciliation can finish the
    // same logical transaction without starting or rebinding a session.
    await this.writeLink({
      ...existingLink,
      sessionId: topic.sessionId,
      taskLink: preparedTaskLink,
      turn: preparedTurn,
      updatedAt: new Date().toISOString(),
    });
    const binding = await this.updateTaskInBinding(topic, input.taskId, (turn) => ({
      ...turn,
      status: input.turnStatus,
      completedAt,
      error: input.error,
      items: turn.items.map((item) => item.status === "in_progress"
        ? { ...item, status: input.turnStatus === "completed" ? "completed" as const : "failed" as const, completedAt: completedAt || item.completedAt }
        : item),
    }), input.taskStatus, input.turnStatus === "failed" ? "system_error" : ACTIVE_TURN_STATUSES.has(input.turnStatus) ? "active" : "idle", input.preview);
    const topicStatus = input.topicStatus || taskStatusToTopicStatus(input.turnStatus);
    if (input.turnStatus === "waiting_for_input" || input.turnStatus === "waiting_for_provider") {
      await this.topicStore.setOperationalStatus(input.topicId, topicStatus, input.error?.code || null);
    } else {
      await this.topicStore.finishTask(input.topicId, input.taskId, { status: topicStatus, errorCode: input.error?.code || null });
    }
    await this.refreshLink(input.taskId, input.topicId, binding);
    return { topic: await this.requireTopic(input.topicId), binding };
  }

  async blockQueuedAfterFailure(topicId: string, code = "predecessor_confirmation_required") {
    const topic = await this.requireTopic(topicId);
    const taskIds = await this.topicStore.blockQueuedTasks(topicId, code);
    const now = new Date().toISOString();
    const binding = await this.chatStore.mutate(topic.chatId, (current) => ({
      ...current,
      lastStatus: "system_error",
      updatedAt: now,
      taskLinks: current.taskLinks.map((link) => taskIds.includes(link.taskId) ? { ...link, status: code } : link),
      turns: current.turns.map((turn) => taskIds.includes(String(turn.taskId || "")) ? {
        ...turn,
        status: "failed",
        completedAt: now,
        error: { code, message: "The preceding Voice task needs an explicit operator decision before this task can run." },
      } : turn),
    }));
    if (binding) await Promise.all(taskIds.map((taskId) => this.refreshLink(taskId, topicId, binding)));
    return taskIds;
  }

  async cancelQueued(topicId: string, taskId: string) {
    const topic = await this.requireTopic(topicId);
    await this.topicStore.cancelQueuedTask(topicId, taskId);
    const now = new Date().toISOString();
    const binding = await this.updateTaskInBinding(topic, taskId, (turn) => ({
      ...turn,
      status: "interrupted",
      completedAt: now,
      error: { code: "cancelled", message: "The queued Voice task was cancelled before it started." },
    }), "aborted", "idle");
    await this.refreshLink(taskId, topicId, binding);
    return { topic: await this.requireTopic(topicId), binding };
  }

  async cancelTask(topicId: string, taskId: string) {
    const topic = await this.requireTopic(topicId);
    await this.topicStore.cancelTask(topicId, taskId);
    const now = new Date().toISOString();
    const binding = await this.updateTaskInBinding(topic, taskId, (turn) => ({
      ...turn,
      status: "interrupted",
      completedAt: now,
      error: { code: "cancelled", message: "The Voice task was cancelled by the operator." },
    }), "aborted", "idle");
    await this.refreshLink(taskId, topicId, binding);
    return { topic: await this.requireTopic(topicId), binding };
  }

  async enableContinuation(chatId: string, input: {taskId:string;expectedRevision?:number;topicGeneration?:number}) {
    if (!SAFE_TASK_ID.test(input?.taskId || "") || !Number.isSafeInteger(input.expectedRevision) || !Number.isSafeInteger(input.topicGeneration)) {
      throw new VoiceTaskLinkError("voice_handoff_context_required", "Refresh the exact task before handing it over.");
    }
    const database = await this.chatStore.historyStore();
    const operationId = `handoff_${digest([chatId,input]).slice(0,40)}`;
    const operation = {action:"voice-handoff",...input};
    const replay = database.replayedOperation(chatId,operationId,operation);
    if (replay) return replay;
    const binding = await this.chatStore.get(chatId);
    if (!binding || binding.origin !== "voice" || !binding.voiceTopicId) throw new VoiceTaskLinkError("voice_thread_not_found", "Voice Task Chat thread was not found.");
    if (binding.stateIdentityHash !== this.chatStore.stateIdentityHash) throw new VoiceTaskLinkError("runtime_identity_mismatch", "This Voice thread belongs to another NeuralDeep state identity.");
    const continued = await this.topicStore.withIdleTopic(binding.voiceTopicId,input.topicGeneration!,async topic=>{
      if (topic.chatId !== chatId || topic.stateIdentityHash !== binding.stateIdentityHash || !topic.sessionId || topic.sessionId !== binding.nativeThreadId) {
        throw new VoiceTaskLinkError("resume_session_unavailable", "The persistent NeuralDeep session is not available for continuation.");
      }
      const coordination = new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(this.stateRoot,resolveTechscopeRoot()));
      const scopes = [coordinationHash(topic.topicId),neuralDeepSessionKey(this.stateRoot,topic.sessionId)].sort();
      const owner = `handoff_${randomUUID()}`, held:string[]=[];
      try {
        for (const scope of scopes) {
          if (!coordination.acquireSessionControl(scope,owner)) throw new VoiceTaskLinkError("voice_thread_active","The task still owns this session. Wait for its workflow to finish.");
          held.push(scope);
        }
        const result = database.operation(chatId,operationId,operation,input.expectedRevision!,current=>{
          if (current.taskLinks.at(-1)?.taskId !== input.taskId || current.turns.some(turn=>ACTIVE_TURN_STATUSES.has(turn.status))) {
            throw new VoiceTaskLinkError("voice_handoff_revision_conflict","This Voice workflow changed. Refresh the task card.");
          }
          for (const scope of scopes) coordination.invalidateIdleOwner(scope,operationId);
          const now = new Date().toISOString();
          database.mutate(chatId,current=>({...current,continuationEnabled:true,continuationEnabledAt:now,updatedAt:now,
            taskLinks:current.taskLinks.map(link=>({...link,mode:"shared_thread"})),
            turns:current.turns.map(turn=>({...turn,items:turn.items.map(item=>item.kind==="task_link"?{...item,task:{...item.task,mode:"shared_thread"}}:item)}))}));
        });
        return result.binding!;
      } finally {for (const scope of held.reverse()) coordination.releaseSessionControl(scope,owner);coordination.close();}
    });
    await Promise.all(continued.taskLinks.map(link=>this.refreshLink(link.taskId,binding.voiceTopicId!,continued)));
    return continued;
  }

  async taskChatLinkForTask(taskId: string) {
    const link = await this.readLink(taskId);
    if (!link) return null;
    return {
      chat_id: link.chatId,
      group: "voice_work" as const,
      continuation_state: (await this.chatStore.get(link.chatId))?.continuationEnabled ? "continuation_enabled" as const : "read_only" as const,
      href: `/task-chat?group=voice_work&chat=${encodeURIComponent(link.chatId)}`,
    };
  }

  async recoveryCapabilitiesForTask(taskId: string) {
    const link = await this.readLink(taskId);
    if (!link || !["waiting_for_provider", "failed"].includes(link.turn.status)) return null;
    const topic = await this.topicStore.get(link.topicId);
    if (!topic || topic.chatId !== link.chatId || topic.stateIdentityHash !== link.stateIdentityHash) return null;
    const resumeRequired = link.turn.error?.code === "resume_confirmation_required";
    return {
      retry: !resumeRequired,
      resume: Boolean(topic.sessionId),
      cancel: true,
    };
  }

  async readLink(taskId: string) {
    if (!SAFE_TASK_ID.test(taskId)) return null;
    try {
      const value = JSON.parse(await readFile(this.linkPath(taskId), "utf8")) as unknown;
      return parsePersistentLink(value, this.chatStore.stateIdentityHash);
    } catch {
      return null;
    }
  }

  async reconcileRecent(limit = 200) {
    let entries: string[] = [];
    try { entries = await readdir(this.taskRoot); } catch { return { processed: 0, repaired: 0 }; }
    const rows = await Promise.all(entries.filter((entry) => SAFE_TASK_ID.test(entry)).map(async (taskId) => {
      try {
        const info = await stat(this.linkPath(taskId));
        return { taskId, modifiedAt: info.mtimeMs };
      } catch { return null; }
    }));
    const selected = rows.filter((row): row is { taskId: string; modifiedAt: number } => Boolean(row))
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
      .slice(0, Math.max(1, Math.min(Number(limit) || 200, 200)));
    const previous = await this.readIndex();
    const signatures: Record<string, string> = {};
    let processed = 0;
    let repaired = 0;
    for (const row of selected) {
      const signature = await this.linkSignature(row.taskId);
      if (!signature) continue;
      signatures[row.taskId] = signature;
      if (previous?.signatures[row.taskId] === signature) continue;
      processed += 1;
      const link = await this.readLink(row.taskId);
      if (!link) continue;
      const topic = await this.topicStore.get(link.topicId);
      if (!topic) continue;
      const before = await this.chatStore.get(link.chatId);
      const priorTurn = before?.turns.find((turn) => turn.turnId === link.turnId);
      const shouldReplaceTurn = !priorTurn
        || (terminalTurn(link.turn.status) && !terminalTurn(priorTurn.status))
        || Date.parse(link.updatedAt) >= turnModifiedAt(priorTurn);
      const result = await this.chatStore.mutateOrCreate(link.chatId, () => this.bindingFromLink(link), (current) => {
        if (current.voiceTopicId !== link.topicId || current.stateIdentityHash !== link.stateIdentityHash) {
          throw new VoiceTaskLinkError("voice_chat_binding_conflict", "A reconciled Voice link conflicts with the existing Task Chat binding.");
        }
        const turns = current.turns.some((turn) => turn.turnId === link.turnId)
          ? current.turns.map((turn) => turn.turnId === link.turnId && shouldReplaceTurn ? link.turn : turn)
          : [...current.turns, link.turn];
        const taskLinks = current.taskLinks.some((taskLink) => taskLink.taskId === link.taskId)
          ? current.taskLinks.map((taskLink) => taskLink.taskId === link.taskId && shouldReplaceTurn ? link.taskLink : taskLink)
          : [...current.taskLinks, link.taskLink];
        return { ...current, turns, taskLinks, updatedAt: current.updatedAt > link.updatedAt ? current.updatedAt : link.updatedAt };
      });
      if (result.created || !priorTurn || (shouldReplaceTurn && JSON.stringify(priorTurn) !== JSON.stringify(link.turn))) repaired += 1;
    }
    await atomicWritePrivateJson({
      stateRoot: this.stateRoot,
      filePath: this.indexPath(),
      resourceKey: "neuraldeep-voice-task-link-index",
      value: {
        schema: "pritha-neuraldeep-voice-task-link-index-v1",
        completedAt: new Date().toISOString(),
        signatures,
      } satisfies VoiceTaskLinkIndex,
    });
    return { processed, repaired };
  }

  async recoverAfterRestart() {
    await this.reconcileRecent();
    const turns = await this.chatStore.recoverActiveTurnsAfterRestart();
    const topics = await this.topicStore.recoverActiveTopicsAfterRestart(this.chatStore.liveAdmissionWorkloads());
    for (const affected of topics) {
      const topic = await this.topicStore.get(affected.topicId);
      const binding = await this.chatStore.get(topic?.chatId || "");
      if (!binding) continue;
      let recoveredStatus: VoiceTopicOperationalStatus = "idle";
      for (const taskId of affected.taskIds) {
        const turn = binding.turns.find((candidate) => candidate.taskId === taskId);
        if (turn?.status !== "failed") continue;
        recoveredStatus = ["resume_confirmation_required", "control_center_restarted"].includes(String(turn.error?.code || ""))
          ? "resume_confirmation_required"
          : "predecessor_confirmation_required";
        if (recoveredStatus === "predecessor_confirmation_required") break;
      }
      await this.topicStore.setOperationalStatus(affected.topicId, recoveredStatus, recoveredStatus === "idle" ? null : recoveredStatus);
      await Promise.all(affected.taskIds.map((taskId) => this.refreshLink(taskId, affected.topicId, binding)));
    }
    const recoveredTaskIds = [...new Set(topics.flatMap((affected) => affected.taskIds))];
    for (const taskId of recoveredTaskIds) {
      const link = await this.readLink(taskId);
      if (!link) continue;
      const statusPath = path.join(this.taskRoot, taskId, "status.json");
      let current: Record<string, unknown> = {};
      try { current = JSON.parse(await readFile(statusPath, "utf8")) as Record<string, unknown>; } catch { /* recover with bounded state below */ }
      const currentStatus = String(current.status || "");
      if (["complete", "failed", "failed_timeout", "failed_empty_result", "rejected", "aborted"].includes(currentStatus)) continue;
      const recoveredAt = new Date().toISOString();
      const completed = link.turn.status === "completed";
      const interrupted = link.turn.status === "interrupted";
      const errorCode = completed ? null : interrupted ? "control_center_restarted" : link.turn.error?.code || "control_center_restarted";
      await atomicWritePrivateJson({
        stateRoot: this.stateRoot,
        filePath: statusPath,
        resourceKey: `voice-codex-status:${taskId}`,
        value: {
          ...current,
          status: completed ? "complete" : interrupted ? "aborted" : "failed",
          phase: completed ? "neuraldeep_turn_completed" : interrupted ? "control_center_restarted" : errorCode,
          previous_status: current.status || "unknown",
          error_code: errorCode,
          completed_at: recoveredAt,
          updated_at: recoveredAt,
        },
      });
    }
    return { turns, topics };
  }

  private bindingFromLink(link: PersistentVoiceTaskLink): ChatBinding {
    return {
      chatId: link.chatId,
      clientThreadId: `voice_${link.topicId.slice("topic_".length)}`,
      createHash: digest({ topicId: link.topicId, scope: link.scope }),
      nativeThreadId: link.sessionId,
      providerId: "neuraldeep_cli",
      providerState: "available",
      modelId: link.modelId,
      effortId: link.effortId,
      stateIdentityHash: link.stateIdentityHash,
      group: "voice_work",
      origin: "voice",
      continuationEnabled: link.taskLink.mode === "shared_thread",
      continuationEnabledAt: link.taskLink.mode === "shared_thread" ? link.updatedAt : null,
      voiceTopicId: link.topicId,
      title: `Voice · ${boundedText(link.scope.label, 90) || link.scope.id}`,
      preview: boundedText(link.turn.userMessage.markdown, 500),
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      pinned: false,
      archived: false,
      lastStatus: ACTIVE_TURN_STATUSES.has(link.turn.status) ? "active" : link.turn.status === "failed" ? "system_error" : "idle",
      messageReceipts: {
        [link.clientMessageId]: {
          clientMessageId: link.clientMessageId,
          requestHash: digest({ taskId: link.taskId, topicId: link.topicId, taskText: link.turn.userMessage.markdown }),
          turnId: link.turnId,
          nativeTurnId: link.sessionId || "",
          startedAt: link.createdAt,
        },
      },
      taskLinks: [link.taskLink],
      turns: [link.turn],
    };
  }

  private async updateTaskInBinding(
    topic: VoiceTopicRecord,
    taskId: string,
    updateTurn: (turn: TurnView) => TurnView,
    taskStatus: string,
    lastStatus: ChatBinding["lastStatus"],
    preview?: string,
  ) {
    const updatedAt = new Date().toISOString();
    const targetTurnId = (await this.chatStore.historyStore()).turnIdForTask(topic.chatId, taskId);
    const binding = await this.chatStore.mutate(topic.chatId, (current) => {
      if (current.voiceTopicId !== topic.topicId || current.stateIdentityHash !== topic.stateIdentityHash) {
        throw new VoiceTaskLinkError("voice_chat_binding_conflict", "The Voice topic points to an incompatible Task Chat binding.");
      }
      if (!current.turns.some((turn) => turn.taskId === taskId)) throw new VoiceTaskLinkError("voice_task_turn_missing", "The Voice task turn is missing from Task Chat.");
      return {
        ...current,
        preview: preview == null ? current.preview : boundedText(preview, 500),
        updatedAt,
        lastStatus,
        taskLinks: current.taskLinks.map((link) => link.taskId === taskId ? { ...link, status: taskStatus } : link),
        turns: current.turns.map((turn) => turn.taskId === taskId ? updateTurn(turn) : turn),
      };
    }, targetTurnId || undefined);
    if (!binding) throw new VoiceTaskLinkError("voice_chat_binding_missing", "The Voice Task Chat binding is missing.");
    return binding;
  }

  private async requireTopic(topicId: string) {
    const topic = await this.topicStore.get(topicId);
    if (!topic) throw new VoiceTaskLinkError("voice_topic_missing", "The persistent Voice topic is missing.");
    return topic;
  }

  private linkPath(taskId: string) {
    if (!SAFE_TASK_ID.test(taskId)) throw new VoiceTaskLinkError("voice_task_id_invalid", "Voice task id is invalid.");
    const target = path.join(this.taskRoot, taskId, "thread-links.json");
    if (target !== this.taskRoot && !target.startsWith(`${this.taskRoot}${path.sep}`)) {
      throw new VoiceTaskLinkError("voice_task_path_invalid", "Voice task link path is invalid.");
    }
    return target;
  }

  private indexPath() {
    return path.join(this.chatStore.root, "voice-task-link-index.json");
  }

  private async readIndex(): Promise<VoiceTaskLinkIndex | null> {
    try {
      const value = JSON.parse(await readFile(this.indexPath(), "utf8")) as Partial<VoiceTaskLinkIndex>;
      if (value.schema !== "pritha-neuraldeep-voice-task-link-index-v1" || !value.signatures || typeof value.signatures !== "object") return null;
      return {
        schema: "pritha-neuraldeep-voice-task-link-index-v1",
        completedAt: safeTimestamp(value.completedAt),
        signatures: Object.fromEntries(Object.entries(value.signatures).filter(([taskId, signature]) => SAFE_TASK_ID.test(taskId) && /^[a-f0-9]{64}$/.test(String(signature)))),
      };
    } catch {
      return null;
    }
  }

  private async linkSignature(taskId: string) {
    try {
      const info = await stat(this.linkPath(taskId));
      return createHash("sha256").update(`${taskId}:${info.size}:${info.mtimeMs}`).digest("hex");
    } catch {
      return null;
    }
  }

  private writeLink(link: PersistentVoiceTaskLink) {
    return atomicWritePrivateJson({
      stateRoot: this.stateRoot,
      filePath: this.linkPath(link.taskId),
      resourceKey: `neuraldeep-voice-task-link:${link.taskId}`,
      value: link,
    }).then(() => link);
  }

  private async refreshLink(taskId: string, topicId: string, binding: ChatBinding) {
    const existing = await this.readLink(taskId);
    if (!existing) return null;
    const topic = await this.requireTopic(topicId);
    const turn = binding.turns.find((candidate) => candidate.taskId === taskId);
    const taskLink = binding.taskLinks.find((candidate) => candidate.taskId === taskId);
    if (!turn || !taskLink) throw new VoiceTaskLinkError("voice_task_link_incomplete", "The Voice task link is incomplete.");
    return this.writeLink({
      ...existing,
      sessionId: topic.sessionId,
      modelId: topic.modelId,
      effortId: topic.effortId,
      taskLink,
      turn,
      updatedAt: new Date().toISOString(),
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __prithaVoiceTaskLinkService: VoiceTaskLinkService | undefined;
  // eslint-disable-next-line no-var
  var __prithaVoiceTaskLinkRecovery: Promise<unknown> | undefined;
}

export function getVoiceTaskLinkService() {
  if (!globalThis.__prithaVoiceTaskLinkService) globalThis.__prithaVoiceTaskLinkService = new VoiceTaskLinkService();
  return globalThis.__prithaVoiceTaskLinkService;
}

export function ensureVoiceTaskLinkRecovery(service = getVoiceTaskLinkService()) {
  if (!globalThis.__prithaVoiceTaskLinkRecovery) {
    globalThis.__prithaVoiceTaskLinkRecovery = service.recoverAfterRestart().catch((error) => {
      globalThis.__prithaVoiceTaskLinkRecovery = undefined;
      throw error;
    });
  }
  return globalThis.__prithaVoiceTaskLinkRecovery;
}
