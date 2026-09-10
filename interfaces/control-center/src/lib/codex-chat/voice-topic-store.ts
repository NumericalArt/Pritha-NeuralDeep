import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { appendPrivateAuditEvent, atomicWritePrivateJson } from "@/lib/private-json";
import { withPrivateRegistryLock } from "./private-registry-lock";
import { neuralDeepStateIdentityHash } from "./private-store";

export type VoiceTopicScope = {
  kind: "agent" | "pritha" | "task" | "control";
  id: string;
  label: string;
  generation: number;
};

export type VoiceTopicOperationalStatus =
  | "idle"
  | "queued"
  | "active"
  | "waiting_for_operator"
  | "waiting_for_approval"
  | "predecessor_confirmation_required"
  | "resume_confirmation_required"
  | "failed"
  | "read_only";

export type VoiceTopicRecord = {
  topicId: string;
  scope: VoiceTopicScope;
  chatId: string;
  sessionId: string | null;
  modelId: string;
  effortId: string | null;
  stateIdentityHash: string;
  createdAt: string;
  updatedAt: string;
  operationalStatus: VoiceTopicOperationalStatus;
  activeTaskId: string | null;
  queuedTaskIds: string[];
  lastTaskId: string | null;
  lastErrorCode: string | null;
};

type VoiceTopicRegistry = {
  version: 1;
  topics: Record<string, VoiceTopicRecord>;
};

type RegistrySnapshot = {
  registry: VoiceTopicRegistry;
  primaryValid: boolean;
  backupValid: boolean;
  repairReason: "primary_missing" | "primary_corrupt" | null;
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const SAFE_TOPIC_ID = /^topic_[a-f0-9]{24,64}$/;
const OPERATIONAL_STATUSES = new Set<VoiceTopicOperationalStatus>([
  "idle",
  "queued",
  "active",
  "waiting_for_operator",
  "waiting_for_approval",
  "predecessor_confirmation_required",
  "resume_confirmation_required",
  "failed",
  "read_only",
]);

function privateLocations() {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  return {
    stateRoot,
    chatRoot: stateRoot === root ? path.join(root, ".private", "codex-chat") : path.join(stateRoot, "codex-chat"),
  };
}

function emptyRegistry(): VoiceTopicRegistry {
  return { version: 1, topics: {} };
}

function cloneRegistry(registry: VoiceTopicRegistry): VoiceTopicRegistry {
  return JSON.parse(JSON.stringify(registry)) as VoiceTopicRegistry;
}

function safeTimestamp(value: unknown, fallback: string) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeScope(value: unknown): VoiceTopicScope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<VoiceTopicScope>;
  const kind = ["agent", "pritha", "task", "control"].includes(String(row.kind))
    ? row.kind as VoiceTopicScope["kind"]
    : null;
  const id = String(row.id || "").trim();
  const generation = Number(row.generation);
  if (!kind || !SAFE_ID.test(id) || !Number.isSafeInteger(generation) || generation < 1 || generation > 999) return null;
  return {
    kind,
    id,
    label: String(row.label || id).replace(/\s+/g, " ").trim().slice(0, 120) || id,
    generation,
  };
}

export function voiceTopicIdFor(stateIdentityHash: string, scope: VoiceTopicScope) {
  const normalized = normalizeScope(scope);
  if (!/^[a-f0-9]{24,64}$/.test(stateIdentityHash) || !normalized) throw new Error("voice_topic_identity_invalid");
  const digest = createHash("sha256")
    .update(`${stateIdentityHash}:${normalized.kind}:${normalized.id}:${normalized.generation}`)
    .digest("hex");
  return `topic_${digest.slice(0, 40)}`;
}

function safeTaskIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((id) => SAFE_ID.test(id)))].slice(-200);
}

function normalizeRecord(value: unknown, defaultIdentityHash: string): VoiceTopicRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<VoiceTopicRecord>;
  const scope = normalizeScope(row.scope);
  const identity = /^[a-f0-9]{24,64}$/.test(String(row.stateIdentityHash || ""))
    ? String(row.stateIdentityHash)
    : defaultIdentityHash;
  if (!scope) return null;
  const expectedTopicId = voiceTopicIdFor(identity, scope);
  if (row.topicId && row.topicId !== expectedTopicId) return null;
  const chatId = String(row.chatId || "");
  if (!/^chat_[A-Za-z0-9]+$/.test(chatId)) return null;
  const createdAt = safeTimestamp(row.createdAt, new Date(0).toISOString());
  const status = OPERATIONAL_STATUSES.has(row.operationalStatus as VoiceTopicOperationalStatus)
    ? row.operationalStatus as VoiceTopicOperationalStatus
    : "idle";
  return {
    topicId: expectedTopicId,
    scope,
    chatId,
    sessionId: SAFE_ID.test(String(row.sessionId || "")) ? String(row.sessionId) : null,
    modelId: SAFE_MODEL_ID.test(String(row.modelId || "")) ? String(row.modelId) : "qwen3.6-35b-a3b",
    effortId: /^[a-z][a-z0-9_-]{0,31}$/.test(String(row.effortId || "")) ? String(row.effortId) : null,
    stateIdentityHash: identity,
    createdAt,
    updatedAt: safeTimestamp(row.updatedAt, createdAt),
    operationalStatus: status,
    activeTaskId: SAFE_ID.test(String(row.activeTaskId || "")) ? String(row.activeTaskId) : null,
    queuedTaskIds: safeTaskIds(row.queuedTaskIds),
    lastTaskId: SAFE_ID.test(String(row.lastTaskId || "")) ? String(row.lastTaskId) : null,
    lastErrorCode: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(String(row.lastErrorCode || "")) ? String(row.lastErrorCode) : null,
  };
}

function parseRegistry(text: string, defaultIdentityHash: string): VoiceTopicRegistry {
  const raw = JSON.parse(text) as { version?: unknown; topics?: unknown };
  if (raw.version !== 1 || !raw.topics || typeof raw.topics !== "object" || Array.isArray(raw.topics)) {
    throw new Error("voice_topic_registry_schema_invalid");
  }
  const topics: Record<string, VoiceTopicRecord> = {};
  for (const value of Object.values(raw.topics as Record<string, unknown>)) {
    const record = normalizeRecord(value, defaultIdentityHash);
    if (!record) throw new Error("voice_topic_registry_record_invalid");
    topics[record.topicId] = record;
  }
  return { version: 1, topics };
}

async function readOptional(filePath: string) {
  try { return await readFile(filePath, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export class VoiceTopicRegistryError extends Error {
  readonly code = "voice_topic_registry_corrupt";
  constructor() {
    super("Voice topic bindings are read-only because both private registry copies are damaged.");
  }
}

export class VoiceTopicSessionMismatchError extends Error {
  readonly code = "runtime_identity_mismatch";
  constructor() {
    super("The NeuralDeep session returned for this Voice topic does not match its pinned session.");
  }
}

export class VoiceTopicStore {
  private readonly locations = privateLocations();
  readonly stateRoot = this.locations.stateRoot;
  readonly root = this.locations.chatRoot;
  readonly registryPath = path.join(this.root, "voice-topic-registry.json");
  readonly backupPath = path.join(this.root, "voice-topic-registry.last-known-good.json");
  readonly auditPath = path.join(this.root, "voice-topic-registry.audit.jsonl");
  readonly stateIdentityHash = neuralDeepStateIdentityHash(this.stateRoot);
  private readOnlyError: VoiceTopicRegistryError | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  async all() {
    return Object.values((await this.load()).topics);
  }

  async get(topicId: string) {
    return (await this.load()).topics[topicId] || null;
  }

  async findByChatId(chatId: string) {
    return (await this.all()).find((topic) => topic.chatId === chatId) || null;
  }

  async withIdleTopic<T>(topicId: string, generation: number, operation: (topic: VoiceTopicRecord) => Promise<T>) {
    return this.withTopic(topicId,generation,async topic=>{
      if(topic.activeTaskId || topic.queuedTaskIds.length || topic.operationalStatus!=="idle") throw new Error("voice_thread_active");
      return operation(topic);
    });
  }

  async withTopic<T>(topicId: string, generation: number, operation: (topic: VoiceTopicRecord) => Promise<T>) {
    return this.transaction(async registry=>{
      const topic=registry.topics[topicId];
      if(!topic || topic.scope.generation!==generation) throw new Error("voice_topic_generation_conflict");
      return {value:await operation(JSON.parse(JSON.stringify(topic))),changed:false};
    });
  }

  async latestForScope(scope: Pick<VoiceTopicScope, "kind" | "id">) {
    return (await this.all())
      .filter((topic) => topic.stateIdentityHash === this.stateIdentityHash && topic.scope.kind === scope.kind && topic.scope.id === scope.id)
      .sort((left, right) => right.scope.generation - left.scope.generation)[0] || null;
  }

  async putIfAbsent(record: VoiceTopicRecord) {
    return this.transaction((registry) => {
      const normalized = normalizeRecord(record, this.stateIdentityHash);
      if (!normalized) throw new Error("voice_topic_registry_record_invalid");
      const existing = registry.topics[normalized.topicId];
      if (existing) return { value: { topic: existing, created: false }, changed: false };
      registry.topics[normalized.topicId] = normalized;
      return { value: { topic: normalized, created: true }, changed: true };
    });
  }

  async mutate(topicId: string, update: (current: VoiceTopicRecord) => VoiceTopicRecord) {
    return this.transaction((registry) => {
      const current = registry.topics[topicId];
      if (!current) return { value: null, changed: false };
      const copy = JSON.parse(JSON.stringify(current)) as VoiceTopicRecord;
      const next = normalizeRecord(update(copy), this.stateIdentityHash);
      if (!next || next.topicId !== topicId) throw new Error("voice_topic_registry_record_invalid");
      registry.topics[topicId] = next;
      return { value: next, changed: true };
    });
  }

  async bindSession(topicId: string, sessionId: string) {
    if (!SAFE_ID.test(sessionId)) throw new VoiceTopicSessionMismatchError();
    return this.mutate(topicId, (current) => {
      if (current.sessionId && current.sessionId !== sessionId) throw new VoiceTopicSessionMismatchError();
      return { ...current, sessionId, updatedAt: new Date().toISOString() };
    });
  }

  async queueTask(topicId: string, taskId: string) {
    if (!SAFE_ID.test(taskId)) throw new Error("voice_topic_task_id_invalid");
    return this.mutate(topicId, (current) => ({
      ...current,
      operationalStatus: current.activeTaskId
        || ["waiting_for_operator", "waiting_for_approval", "predecessor_confirmation_required", "resume_confirmation_required"].includes(current.operationalStatus)
        ? current.operationalStatus
        : "queued",
      queuedTaskIds: current.queuedTaskIds.includes(taskId) ? current.queuedTaskIds : [...current.queuedTaskIds, taskId].slice(-200),
      updatedAt: new Date().toISOString(),
    }));
  }

  async startTask(topicId: string, taskId: string) {
    return this.mutate(topicId, (current) => {
      if (current.activeTaskId && current.activeTaskId !== taskId) throw new Error("voice_topic_turn_active");
      if (!current.activeTaskId && current.queuedTaskIds.length > 0 && current.queuedTaskIds[0] !== taskId) throw new Error("voice_topic_fifo_violation");
      return {
        ...current,
        operationalStatus: "active",
        activeTaskId: taskId,
        queuedTaskIds: current.queuedTaskIds.filter((id) => id !== taskId),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async finishTask(topicId: string, taskId: string, input: { status: VoiceTopicOperationalStatus; errorCode?: string | null }) {
    return this.mutate(topicId, (current) => {
      const queuedTaskIds = current.queuedTaskIds.filter((id) => id !== taskId);
      return {
        ...current,
        operationalStatus: input.status === "idle" && queuedTaskIds.length > 0 ? "queued" : input.status,
        activeTaskId: current.activeTaskId === taskId ? null : current.activeTaskId,
        queuedTaskIds,
        lastTaskId: taskId,
        lastErrorCode: input.errorCode && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(input.errorCode) ? input.errorCode : null,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async setOperationalStatus(topicId: string, status: VoiceTopicOperationalStatus, errorCode: string | null = null) {
    return this.mutate(topicId, (current) => ({
      ...current,
      operationalStatus: status,
      lastErrorCode: errorCode && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(errorCode) ? errorCode : null,
      updatedAt: new Date().toISOString(),
    }));
  }

  async cancelQueuedTask(topicId: string, taskId: string) {
    return this.mutate(topicId, (current) => {
      const queuedTaskIds = current.queuedTaskIds.filter((id) => id !== taskId);
      return {
        ...current,
        queuedTaskIds,
        operationalStatus: current.activeTaskId ? current.operationalStatus : queuedTaskIds.length > 0 ? "queued" : "idle",
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async cancelTask(topicId: string, taskId: string) {
    return this.mutate(topicId, (current) => {
      const queuedTaskIds = current.queuedTaskIds.filter((id) => id !== taskId);
      const activeTaskId = current.activeTaskId === taskId ? null : current.activeTaskId;
      return {
        ...current,
        activeTaskId,
        queuedTaskIds,
        operationalStatus: activeTaskId ? current.operationalStatus : queuedTaskIds.length > 0 ? "queued" : "idle",
        lastTaskId: taskId,
        lastErrorCode: "cancelled",
        updatedAt: new Date().toISOString(),
      };
    });
  }

  async blockQueuedTasks(topicId: string, code = "predecessor_confirmation_required") {
    return this.transaction((registry) => {
      const current = registry.topics[topicId];
      if (!current) return { value: [] as string[], changed: false };
      const taskIds = [...current.queuedTaskIds];
      current.queuedTaskIds = [];
      current.operationalStatus = "predecessor_confirmation_required";
      current.lastErrorCode = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(code) ? code : "predecessor_confirmation_required";
      current.updatedAt = new Date().toISOString();
      return { value: taskIds, changed: true };
    });
  }

  async recoverActiveTopicsAfterRestart(preserveTaskIds: ReadonlySet<string> = new Set()) {
    return this.transaction((registry) => {
      const affected: Array<{ topicId: string; taskIds: string[] }> = [];
      const recoveredAt = new Date().toISOString();
      for (const topic of Object.values(registry.topics)) {
        const taskIds = [topic.activeTaskId, ...topic.queuedTaskIds].filter((id): id is string => Boolean(id));
        if (taskIds.some(id => preserveTaskIds.has(id))) continue;
        if (taskIds.length === 0 && !["active", "queued"].includes(topic.operationalStatus)) continue;
        affected.push({ topicId: topic.topicId, taskIds });
        topic.operationalStatus = "resume_confirmation_required";
        topic.activeTaskId = null;
        topic.queuedTaskIds = [];
        topic.lastErrorCode = "control_center_restarted";
        topic.updatedAt = recoveredAt;
      }
      return { value: affected, changed: affected.length > 0 };
    }).then(async (affected) => {
      if (affected.length > 0) await this.audit("voice-topics-recovered-after-restart", { topicCount: affected.length });
      return affected;
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>) {
    const result = this.mutationQueue.catch(() => undefined).then(operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private withLock<T>(operation: () => Promise<T>) {
    return withPrivateRegistryLock({
      stateRoot: this.stateRoot,
      lockDirectory: path.join(this.root, "locks"),
      resource: "task-chat-voice-registry",
    }, operation);
  }

  private transaction<T>(operation: (registry: VoiceTopicRegistry) => { value: T; changed: boolean } | Promise<{ value: T; changed: boolean }>) {
    return this.enqueueMutation(() => this.withLock(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const snapshot = await this.readSnapshot();
      const before = cloneRegistry(snapshot.registry);
      const outcome = await operation(snapshot.registry);
      if (!outcome.changed) {
        if (snapshot.repairReason) await this.restorePrimary(snapshot);
        return outcome.value;
      }
      await this.persist(snapshot.registry, snapshot.primaryValid ? before : null, before, snapshot.backupValid);
      if (snapshot.repairReason) await this.audit("voice-topic-registry-restored", { reason: snapshot.repairReason });
      return outcome.value;
    }));
  }

  private async load() {
    if (this.readOnlyError) throw this.readOnlyError;
    const snapshot = await this.readSnapshot();
    if (!snapshot.repairReason) return snapshot.registry;
    return this.enqueueMutation(() => this.withLock(async () => {
      const current = await this.readSnapshot();
      if (current.repairReason) await this.restorePrimary(current);
      return current.registry;
    }));
  }

  private async readSnapshot(): Promise<RegistrySnapshot> {
    const primaryText = await readOptional(this.registryPath);
    if (primaryText != null) {
      try {
        return {
          registry: parseRegistry(primaryText, this.stateIdentityHash),
          primaryValid: true,
          backupValid: true,
          repairReason: null,
        };
      } catch {
        // The last-known-good copy is evaluated below.
      }
    }
    const backupText = await readOptional(this.backupPath);
    if (backupText != null) {
      try {
        return {
          registry: parseRegistry(backupText, this.stateIdentityHash),
          primaryValid: false,
          backupValid: true,
          repairReason: primaryText == null ? "primary_missing" : "primary_corrupt",
        };
      } catch {
        // Both copies are invalid below.
      }
    }
    if (primaryText == null && backupText == null) {
      return { registry: emptyRegistry(), primaryValid: false, backupValid: false, repairReason: null };
    }
    this.readOnlyError = new VoiceTopicRegistryError();
    await this.audit("voice-topic-registry-read-only", { reason: "primary_and_backup_invalid" });
    throw this.readOnlyError;
  }

  private async restorePrimary(snapshot: RegistrySnapshot) {
    await this.ensureTimestampedBackup(snapshot.registry);
    await this.writeRegistry(this.registryPath, snapshot.registry);
    await this.audit("voice-topic-registry-restored", { reason: snapshot.repairReason });
  }

  private async audit(event: string, detail: Record<string, unknown>) {
    await appendPrivateAuditEvent({
      stateRoot: this.stateRoot,
      filePath: this.auditPath,
      event: {
        schema: "pritha-neuraldeep-voice-topic-registry-audit-v1",
        timestamp: new Date().toISOString(),
        event,
        ...detail,
      },
    });
  }

  private writeRegistry(filePath: string, registry: VoiceTopicRegistry) {
    return atomicWritePrivateJson({
      stateRoot: this.stateRoot,
      filePath,
      resourceKey: "voice-topic-registry",
      value: registry,
    });
  }

  private async ensureTimestampedBackup(registry: VoiceTopicRegistry) {
    let entries: string[] = [];
    try { entries = await readdir(this.root); } catch { /* created by the private writer */ }
    if (entries.some((entry) => /^voice-topic-registry\.pre-task-chat-voice\.\d{4}-\d{2}-\d{2}T/.test(entry))) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await this.writeRegistry(path.join(this.root, `voice-topic-registry.pre-task-chat-voice.${timestamp}.json`), registry);
  }

  private async persist(
    registry: VoiceTopicRegistry,
    previousPrimary: VoiceTopicRegistry | null,
    before: VoiceTopicRegistry,
    backupValid: boolean,
  ) {
    if (this.readOnlyError) throw this.readOnlyError;
    await this.ensureTimestampedBackup(before);
    if (previousPrimary) await this.writeRegistry(this.backupPath, previousPrimary);
    await this.writeRegistry(this.registryPath, registry);
    if (!previousPrimary && !backupValid) await this.writeRegistry(this.backupPath, registry);
  }
}
