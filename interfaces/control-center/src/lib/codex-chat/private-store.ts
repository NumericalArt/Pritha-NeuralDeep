import type { DeliveryBudgetReceipt } from "./delivery-types";
import type { ExecutionWorkspace } from "../../../../../scripts/neuraldeep/execution-workspaces.mjs";
import { neuralDeepRuntimeIdentity } from "../../../../../scripts/neuraldeep/runtime-identity.mjs";
import { NeuralDeepCoordinationStore, neuralDeepCoordinationPaths } from "../../../../../scripts/neuraldeep/coordination-store.mjs";
import { createHash } from "node:crypto";
import { NeuralDeepChatHistoryStore, readHistoryMigrationInput } from "../../../../../scripts/neuraldeep/chat-history-store.mjs";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { appendPrivateAuditEvent, atomicWritePrivateJson } from "@/lib/private-json";
import { withPrivateRegistryLock } from "./private-registry-lock";
import type {
  RuntimeProviderId,
  TaskLinkView,
  ThreadGroup,
  ThreadOrigin,
  ThreadStatus,
  TurnView,
} from "./types";

export type MessageReceipt = {
  clientMessageId: string;
  requestHash: string;
  inputHash?: string;
  turnId: string;
  nativeTurnId: string;
  startedAt: string;
};

export type ChatBinding = {
  revision?: number;
  identityStatus?: "recorded" | "unverified" | "restored";
  historyCompleteness?: "captured-from-creation" | "legacy-gaps-possible";
  workspacePath?: string;
  executionWorkspace?: ExecutionWorkspace;
  profileIdentity?: string;
  chatId: string;
  clientThreadId: string;
  createHash: string;
  nativeThreadId: string | null;
  providerId: RuntimeProviderId;
  providerState: "available" | "rate_limited" | "unavailable" | "auth_required" | "billing_required" | "access_denied";
  modelId: string;
  effortId: string | null;
  stateIdentityHash: string;
  group: ThreadGroup;
  origin: ThreadOrigin;
  continuationEnabled: boolean;
  continuationEnabledAt: string | null;
  voiceTopicId: string | null;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  lastStatus: ThreadStatus;
  messageReceipts: Record<string, MessageReceipt>;
  taskLinks: TaskLinkView[];
  turns: TurnView[];
  deliveryBudgetRequests?: Record<string, DeliveryBudgetReceipt>;
  hasDeliveryBinding?: boolean;
};

type RegistryFile = {
  version: 2;
  chats: Record<string, ChatBinding>;
};

const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const SAFE_SESSION_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_TOPIC_ID = /^topic_[a-f0-9]{24,64}$/;
const PERSISTED_ACTIVE_TURN_STATUSES = new Set([
  "queued",
  "waiting_for_provider",
  "in_progress",
  "waiting_for_approval",
  "waiting_for_input",
]);

function turnHasToolActivity(turn: TurnView) {
  return turn.items.some((item) => ["command", "file_change", "tool", "web_search"].includes(item.kind));
}

function privateChatLocations() {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  return {
    stateRoot,
    chatRoot: stateRoot === root ? path.join(root, ".private", "codex-chat") : path.join(stateRoot, "codex-chat"),
  };
}

export function neuralDeepStateIdentityHash(stateRoot = privateChatLocations().stateRoot) {
  return neuralDeepRuntimeIdentity(stateRoot).stateIdentityHash;
}

function emptyRegistry(): RegistryFile {
  return { version: 2, chats: {} };
}

function safeTimestamp(value: unknown, fallback: string) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function safeProviderState(value: unknown): ChatBinding["providerState"] {
  return ["available", "rate_limited", "unavailable", "auth_required", "billing_required", "access_denied"].includes(String(value))
    ? value as ChatBinding["providerState"]
    : "unavailable";
}

function safeThreadStatus(value: unknown): ThreadStatus {
  return ["not_loaded", "idle", "active", "system_error", "archived"].includes(String(value))
    ? value as ThreadStatus
    : "not_loaded";
}

function safeTurns(value: unknown): TurnView[] {
  if (!Array.isArray(value)) return [];
  return value.filter((turn): turn is TurnView => {
    if (!turn || typeof turn !== "object") return false;
    const row = turn as Partial<TurnView>;
    return /^turn_[A-Za-z0-9]+$/.test(String(row.turnId || ""))
      && typeof row.userMessage?.markdown === "string"
      && Array.isArray(row.items);
  });
}

function safeReceipts(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, MessageReceipt> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) continue;
    const row = raw as Partial<MessageReceipt>;
    if (!/^turn_[A-Za-z0-9]+$/.test(String(row.turnId || ""))) continue;
    result[key] = {
      clientMessageId: key,
      requestHash: String(row.requestHash || "").slice(0, 128),
      ...(typeof row.inputHash === "string" ? { inputHash: row.inputHash.slice(0, 128) } : {}),
      turnId: String(row.turnId),
      nativeTurnId: String(row.nativeTurnId || "").slice(0, 160),
      startedAt: safeTimestamp(row.startedAt, new Date(0).toISOString()),
    };
  }
  return result;
}

function safeTaskLinks(value: unknown): TaskLinkView[] {
  if (!Array.isArray(value)) return [];
  return value.filter((link): link is TaskLinkView => {
    if (!link || typeof link !== "object") return false;
    const row = link as Partial<TaskLinkView>;
    return /^[0-9A-Za-z._:-]{1,120}$/.test(String(row.taskId || ""))
      && ["voice", "chat"].includes(String(row.origin || ""))
      && ["shared_thread", "result_reference", "degraded_no_thread"].includes(String(row.mode || ""));
  });
}

export function normalizeChatBinding(value: unknown, defaultIdentityHash: string): ChatBinding | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ChatBinding>;
  if (!String(row.chatId || "").startsWith("chat_")) return null;
  const createdAt = safeTimestamp(row.createdAt, new Date(0).toISOString());
  const modelId = SAFE_MODEL_ID.test(String(row.modelId || "")) ? String(row.modelId) : "qwen3.6-35b-a3b";
  const nativeThreadId = SAFE_SESSION_ID.test(String(row.nativeThreadId || "")) ? String(row.nativeThreadId) : null;
  const group: ThreadGroup = row.group === "voice_work" || row.group === "other_sessions" ? row.group : "my_chats";
  const origin: ThreadOrigin = row.origin === "voice" || row.origin === "external" || row.origin === "exec_fallback" ? row.origin : "chat";
  const identity = /^[a-f0-9]{24,64}$/.test(String(row.stateIdentityHash || ""))
    ? String(row.stateIdentityHash)
    : "";
  const continuationEnabled = typeof row.continuationEnabled === "boolean"
    ? row.continuationEnabled
    : origin === "chat" && group === "my_chats";
  return {
    chatId: String(row.chatId),
    clientThreadId: String(row.clientThreadId || "").slice(0, 128),
    createHash: String(row.createHash || "").slice(0, 128),
    nativeThreadId,
    providerId: row.providerId === "desktop_bundled" || row.providerId === "standalone_cli" ? row.providerId : "neuraldeep_cli",
    identityStatus: row.identityStatus === "restored" ? "restored" : row.identityStatus !== "unverified" && row.providerId === "neuraldeep_cli" && identity ? "recorded" : "unverified",
    revision: row.revision,
    historyCompleteness: row.historyCompleteness,
    workspacePath: typeof row.workspacePath === "string" ? row.workspacePath : undefined,
    executionWorkspace: row.executionWorkspace?.version===1 ? row.executionWorkspace : undefined,
    profileIdentity: typeof row.profileIdentity === "string" ? row.profileIdentity : undefined,
    providerState: safeProviderState(row.providerState),
    modelId,
    effortId: /^[a-z][a-z0-9_-]{0,31}$/.test(String(row.effortId || "")) ? String(row.effortId) : null,
    stateIdentityHash: identity,
    deliveryBudgetRequests: row.deliveryBudgetRequests as Record<string, DeliveryBudgetReceipt> || {},
    hasDeliveryBinding: row.hasDeliveryBinding === true,
    group,
    origin,
    continuationEnabled,
    continuationEnabledAt: continuationEnabled ? safeTimestamp(row.continuationEnabledAt, createdAt) : null,
    voiceTopicId: SAFE_TOPIC_ID.test(String(row.voiceTopicId || "")) ? String(row.voiceTopicId) : null,
    title: String(row.title || "New Task Chat").slice(0, 120),
    preview: String(row.preview || "").slice(0, 500),
    createdAt,
    updatedAt: safeTimestamp(row.updatedAt, createdAt),
    pinned: row.pinned === true,
    archived: row.archived === true,
    lastStatus: safeThreadStatus(row.lastStatus),
    messageReceipts: safeReceipts(row.messageReceipts),
    taskLinks: safeTaskLinks(row.taskLinks),
    turns: safeTurns(row.turns),
  };
}

function parseRegistry(text: string, defaultIdentityHash: string): RegistryFile {
  const raw = JSON.parse(text) as { version?: unknown; chats?: unknown };
  if ((raw.version !== 1 && raw.version !== 2) || !raw.chats || typeof raw.chats !== "object" || Array.isArray(raw.chats)) {
    throw new Error("registry_schema_invalid");
  }
  const chats: Record<string, ChatBinding> = {};
  for (const value of Object.values(raw.chats as Record<string, unknown>)) {
    const binding = normalizeChatBinding(value, defaultIdentityHash);
    if (!binding) throw new Error("registry_binding_invalid");
    chats[binding.chatId] = binding;
  }
  return { version: 2, chats };
}

async function readOptional(filePath: string) {
  try { return readHistoryMigrationInput(filePath, privateChatLocations().stateRoot); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export class CodexChatRegistryError extends Error {
  readonly code = "codex_chat_registry_corrupt";
  constructor() {
    super("Task Chat history bindings are temporarily read-only because the private registry is damaged.");
  }
}

export class CodexChatPrivateStore {
  private readonly locations = privateChatLocations();
  readonly stateRoot = this.locations.stateRoot;
  readonly root = this.locations.chatRoot;
  readonly registryPath = path.join(this.root, "registry.json");
  readonly backupPath = path.join(this.root, "registry.last-known-good.json");
  readonly databasePath = path.join(this.root, "history.sqlite");
  readonly auditPath = path.join(this.root, "registry.audit.jsonl");
  readonly capabilitiesRoot = path.join(this.root, "runtime-capabilities");
  readonly stateIdentityHash = neuralDeepStateIdentityHash(this.stateRoot);
  private opening: Promise<NeuralDeepChatHistoryStore> | null = null;

  async historyStore() {
    this.opening ||= withPrivateRegistryLock({ stateRoot: this.stateRoot,
      lockDirectory: path.join(this.root, "locks"), resource: "task-chat-voice-registry" }, async () => {
      let database: NeuralDeepChatHistoryStore | null = null;
      try {
        database = new NeuralDeepChatHistoryStore({ databasePath: this.databasePath,
          instanceScope: createHash("sha256").update(`${path.resolve(this.stateRoot)}:neuraldeep-chat-v1`).digest("hex") });
        const alreadyMigrated = database.meta("legacy_import_complete");
        if (alreadyMigrated) {
          for (const file of [this.registryPath, this.backupPath]) {
            const text = await readOptional(file);
            if (text == null) continue;
            let marker: { version?: number; generation?: string; sourceHash?: string } | null = null;
            try { marker = JSON.parse(text); } catch { /* Preserve unknown sidecar edits. */ }
            if (marker?.version !== 3 || marker.generation !== database.generation || marker.sourceHash !== alreadyMigrated) {
              throw new CodexChatRegistryError();
            }
          }
        }
        if (!alreadyMigrated) {
          const primary = await readOptional(this.registryPath), backup = await readOptional(this.backupPath);
          let registry: RegistryFile | null = null, recovered = false;
          if (primary != null) { try { registry = parseRegistry(primary, this.stateIdentityHash); } catch { /* Try the preserved LKG copy. */ } }
          if (!registry && backup != null) { try { registry = parseRegistry(backup, this.stateIdentityHash); recovered = true; } catch { /* Preserve both invalid copies. */ } }
          if (!registry && (primary != null || backup != null)) throw new CodexChatRegistryError();
          const sourceHash = createHash("sha256").update(JSON.stringify([primary, backup])).digest("hex");
          // Preserve the original bytes, including fields the legacy parser did not understand.
          await atomicWritePrivateJson({ stateRoot: this.stateRoot,
            filePath: path.join(this.root, `registry.pre-neuraldeep-sqlite.${sourceHash}.json`),
            value: { schema: "neuraldeep-chat-migration-input-v1", sha256: sourceHash, primary, backup } });
          const input = registry || emptyRegistry();
          const store = database;
          store.transaction(() => {
            // Another opener may have completed migration before this lock was acquired.
            if (store.meta("legacy_import_complete")) return;
            for (const binding of Object.values(input.chats)) store.put(binding, { legacy: true });
            store.event("migration", "migration", { sourceHash, primary: store.body(primary || ""), backup: store.body(backup || ""), recovered });
            store.setMeta("legacy_import_complete", sourceHash);
          });
          if (recovered) await this.recordRuntimeEvent("registry-restored", { reason: "legacy_primary_unavailable", sourceHash });
        }
        // Both legacy entrypoints must reject old writers after schema migration.
        // Original v1/v2 bytes remain in the immutable migration input above.
        const marker = { version: 3, storage: "neuraldeep-sqlite-v1", generation: database.generation,
          sourceHash: database.meta("legacy_import_complete") };
        await atomicWritePrivateJson({ stateRoot: this.stateRoot, filePath: this.registryPath, value: marker });
        await atomicWritePrivateJson({ stateRoot: this.stateRoot, filePath: this.backupPath, value: marker });
        return database;
      } catch (error) {
        database?.close();
        await this.recordRuntimeEvent("registry-read-only", { reason: "history_storage_unavailable" });
        throw error;
      }
    });
    return this.opening;
  }

  async all() { return (await this.historyStore()).all(); }
  async get(chatId: string) { return (await this.historyStore()).get(chatId); }
  async getTurn(chatId: string, turnId: string) { return (await this.historyStore()).turn(chatId, turnId); }
  async receipt(chatId: string, id: string) { return (await this.historyStore()).receipt(chatId, id); }
  async findByNative(providerId: RuntimeProviderId, nativeThreadId: string) {
    const row = (await this.all()).find(row => row.providerId === providerId && row.nativeThreadId === nativeThreadId);
    return row ? this.get(row.chatId) : null;
  }
  async findByClientThreadId(clientThreadId: string) { return (await this.historyStore()).findByClient(clientThreadId); }
  async findByTaskId(taskId: string) {
    const database = await this.historyStore();
    const chatId = database.chatForTask(taskId);
    if (!chatId) return null;
    const turnId = database.turnIdForTask(chatId, taskId);
    return database.get(chatId, { includeTurnId: turnId || undefined });
  }
  async recordRuntimeEvent(event: string, detail: Record<string, unknown>) {
    await appendPrivateAuditEvent({ stateRoot: this.stateRoot, filePath: this.auditPath,
      event: { schema: "pritha-task-chat-registry-audit-v4", timestamp: new Date().toISOString(), event, ...detail } });
  }
  async put(binding: ChatBinding) {
    const normalized = normalizeChatBinding(binding, this.stateIdentityHash);
    if (!normalized) throw new Error("registry_binding_invalid");
    return (await this.historyStore()).put(normalized);
  }
  async putIfAbsentByClientThreadId(binding: ChatBinding) {
    const normalized = normalizeChatBinding(binding, this.stateIdentityHash);
    if (!normalized) throw new Error("registry_binding_invalid");
    return (await this.historyStore()).putIfAbsent(normalized);
  }
  async mutateOrCreate(chatId: string, create: () => ChatBinding, update: (current: ChatBinding, created: boolean) => ChatBinding, includeTurnId?: string) {
    return (await this.historyStore()).mutate(chatId, (current, created) => {
      const next = normalizeChatBinding(update(current, created), this.stateIdentityHash);
      if (!next) throw new Error("registry_binding_invalid");
      return next;
    }, create, includeTurnId)!;
  }
  async patch(chatId: string, patch: Partial<ChatBinding>) { return this.mutate(chatId, current => ({ ...current, ...patch, chatId })); }
  async mutate(chatId: string, update: (current: ChatBinding) => ChatBinding, includeTurnId?: string) {
    const result = (await this.historyStore()).mutate(chatId, current => {
      const next = normalizeChatBinding(update(current), this.stateIdentityHash);
      if (!next) throw new Error("registry_binding_invalid");
      return next;
    }, undefined, includeTurnId);
    return result?.binding || null;
  }
  async upsertTurn(chatId: string, turn: TurnView) {
    const database = await this.historyStore();
    if (!database.get(chatId, { turnLimit: 0 })) return null;
    database.putTurn(chatId, turn); return database.get(chatId, { includeTurnId: turn.turnId });
  }
  async mutateTurn(chatId: string, turnId: string, update: (turn: TurnView) => TurnView) {
    return (await this.historyStore()).mutateTurn(chatId, turnId, update);
  }
  async putItem(chatId: string, turnId: string, item: TurnView["items"][number], originalText?: string) {
    return (await this.historyStore()).putItem(chatId, turnId, item, originalText);
  }
  liveAdmissionWorkloads() {
    const coordination = new NeuralDeepCoordinationStore(neuralDeepCoordinationPaths(this.stateRoot, resolveTechscopeRoot()));
    try {
      coordination.reconcileDeadWorkers();
      const snapshot = coordination.snapshot();
      return new Set([...snapshot.active, ...snapshot.queued].map(attempt => attempt.workloadId));
    } finally { coordination.close(); }
  }

  async recoverActiveTurnsAfterRestart() {
    const database = await this.historyStore(), chats = new Set<string>(); let turnCount = 0;
    const liveWorkloads = this.liveAdmissionWorkloads();
    database.transaction(() => {
      for (const { chatId, turn } of database.activeTurns()) {
        if (!PERSISTED_ACTIVE_TURN_STATUSES.has(turn.status)) continue;
        if (liveWorkloads.has(turn.taskId || turn.turnId)) continue;
        const now = new Date().toISOString(); chats.add(chatId); turnCount++;
        database.mutateTurn(chatId, turn.turnId, current => ({ ...current, status: "failed", completedAt: now,
          error: { code: "resume_confirmation_required", message: turnHasToolActivity(current)
            ? "Control Center restarted after tool activity. Reconcile the previous process before continuing."
            : "Control Center restarted before a trustworthy result. Nothing was replayed; reconcile before continuing." },
          items: current.items.map(item => item.status === "in_progress" ? { ...item, status: "failed", completedAt: now } : item) }));
        database.mutate(chatId, current => ({ ...current, lastStatus: "system_error", updatedAt: now }));
      }
      database.reconcileInactiveDirectChats();
    });
    if (turnCount) await this.recordRuntimeEvent("active-turns-recovered-after-restart", { chatCount: chats.size, turnCount });
    return { chatCount: chats.size, turnCount };
  }
}
