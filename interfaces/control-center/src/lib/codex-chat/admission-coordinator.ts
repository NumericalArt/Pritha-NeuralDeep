import { randomUUID } from "node:crypto";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { atomicWritePrivateJson } from "@/lib/private-json";
import { getNeuralDeepAccountSnapshot } from "@/lib/settings/neuraldeep-account-server";
import { NeuralDeepCoordinationStore, coordinationHash } from "../../../../../scripts/neuraldeep/coordination-store.mjs";
import { NeuralDeepExecutionWorkspaces } from "../../../../../scripts/neuraldeep/execution-workspaces.mjs";
import { NeuralDeepOperatorRequests } from "../../../../../scripts/neuraldeep/operator-requests.mjs";
import type { ExecutionResourceClaim } from "../../../../../scripts/neuraldeep/execution-resources.mjs";

export type NeuralDeepSurface = "task_chat" | "voice" | "voice_dialogue";
export type AdmissionOutcome = "completed" | "failed" | "cancelled" | "waiting_for_provider" | "waiting_for_operator";
export type AdmissionLease = {
  attemptId: string; surface: NeuralDeepSurface; workloadId: string; coordinationKeyHash: string; admittedAt: string;
  release: (outcome?: AdmissionOutcome) => Promise<void>;
  bindSession: (sessionIdentity: string) => void;
  isCurrent: () => boolean;
  confirmRuntimeExit: () => void;
  launcherReceipt: { attemptId: string; ownerToken: string };
};
type WaitingAdmission = {
  attemptId: string; surface: NeuralDeepSurface; workloadId: string; coordinationKeyHash: string; queuedAt: string;
  resolve: (lease: AdmissionLease) => void; reject: (error: Error) => void;
  signal: AbortSignal | null; abortListener: (() => void) | null;
};
type CoordinatorOptions = {
  stateRoot?: string; ledgerPath?: string | null; databasePath?: string; limitProvider?: () => Promise<number | null | undefined>;
  limitCacheMs?: number; localLimit?: number; pollMs?: number;
};
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
function normalizedLimit(value: unknown) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= 64 ? limit : 1;
}
function safeWorkloadId(value: string) {
  const text = String(value || "").trim();
  return SAFE_ID.test(text) ? text : `workload_${coordinationHash(text)}`;
}
export class AdmissionCancelledError extends Error {
  readonly code = "admission_cancelled";
  constructor() { super("The queued NeuralDeep launch was cancelled before admission."); }
}
export class AdmissionBlockedError extends Error {
  readonly code: string;
  constructor(code: string) { super("The queued NeuralDeep launch requires reconciliation of its saved state."); this.code = code; }
}

export class NeuralDeepAdmissionCoordinator {
  private readonly stateRoot: string;
  private readonly ledgerPath: string | null;
  private readonly databasePath: string;
  private readonly limitProvider: () => Promise<number | null | undefined>;
  private readonly localLimit: number;
  private readonly limitCacheMs: number;
  private readonly pollMs: number;
  private readonly waiting = new Map<string, WaitingAdmission>();
  private store: NeuralDeepCoordinationStore | null = null;
  private initialized: Promise<void> | null = null;
  private draining: Promise<void> | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private projectionError: string | null = null;
  private limitCache: { value: number; expiresAt: number } | null = null;
  private operatorStore: NeuralDeepOperatorRequests | null = null;
  private nextStoppedChatCheck = 0;

  constructor(options: CoordinatorOptions = {}) {
    const root = resolveTechscopeRoot();
    this.stateRoot = path.resolve(/* turbopackIgnore: true */ options.stateRoot || resolvePrithaStateRoot(root));
    const chatRoot = this.stateRoot === root ? path.join(root, ".private", "codex-chat") : path.join(this.stateRoot, "codex-chat");
    this.ledgerPath = options.ledgerPath === null ? null : path.resolve(/* turbopackIgnore: true */ options.ledgerPath || path.join(chatRoot, "admission-registry.json"));
    this.databasePath = options.databasePath || (this.ledgerPath ? path.join(path.dirname(this.ledgerPath), "admission.sqlite") : ":memory:");
    this.limitProvider = options.limitProvider || (async () => {
      const account = await getNeuralDeepAccountSnapshot();
      return account.sections?.limits?.available === true && account.sections.limits.stale === false ? account.limits?.parallelLimit : null;
    });
    this.localLimit = normalizedLimit(options.localLimit ?? process.env.PRITHA_NEURALDEEP_LOCAL_PARALLEL_LIMIT ?? 64);
    this.limitCacheMs = Math.max(100, Math.min(Number(options.limitCacheMs) || 5_000, 60_000));
    this.pollMs = Math.max(25, Math.min(Number(options.pollMs) || 100, 1_000));
  }

  private getStore() {
    if (this.closed) throw new AdmissionBlockedError("admission_closed");
    if (!this.store) {
      this.store = new NeuralDeepCoordinationStore({ databasePath: this.databasePath, legacyPath: this.ledgerPath });
      this.store.reconcileDeadWorkers();
      this.store.reconcileStoppedTaskChats();
    }
    return this.store;
  }

  async acquire(input: { attemptId?: string; surface: NeuralDeepSurface; workloadId: string; coordinationKey: string;
    signal?: AbortSignal; predecessorPriority?: boolean; resumePausedKey?: boolean; payload?: unknown; resources?: ExecutionResourceClaim[]; unstartedOwnerToken?: string; sessionKeyHash?: string | null }) {
    await this.ensureInitialized();
    const attemptId = input.attemptId || `attempt_${randomUUID().replace(/-/g, "")}`;
    if (!SAFE_ID.test(attemptId)) throw new Error("admission_attempt_id_invalid");
    if (!["task_chat", "voice", "voice_dialogue"].includes(input.surface)) throw new Error("admission_surface_invalid");
    if (input.signal?.aborted) throw new AdmissionCancelledError();
    const coordinationKeyHash = coordinationHash(input.coordinationKey);
    const workloadId = safeWorkloadId(input.workloadId);
    const queuedAt = new Date().toISOString();
    const saved = this.getStore().enqueue({ ...input, attemptId, workloadId, coordinationKeyHash, queuedAt });
    if (saved.duplicate) {
      if (!input.unstartedOwnerToken) throw new AdmissionBlockedError("admission_attempt_duplicate");
      try { this.getStore().requeueUnstarted(attemptId,input.unstartedOwnerToken); }
      catch { throw new AdmissionBlockedError("admission_unstarted_resume_conflict"); }
    }
    const promise = new Promise<AdmissionLease>((resolve, reject) => {
      const pending: WaitingAdmission = { attemptId, surface: input.surface, workloadId, coordinationKeyHash, queuedAt,
        resolve, reject, signal: input.signal || null, abortListener: null };
      if (pending.signal) {
        pending.abortListener = () => { void this.cancelWaiting(attemptId).catch(error => this.rejectPending(pending, error)); };
        pending.signal.addEventListener("abort", pending.abortListener, { once: true });
      }
      this.waiting.set(attemptId, pending);
    });
    await this.persistProjection();
    this.scheduleDrain();
    return promise;
  }

  private detach(entry: WaitingAdmission) {
    this.waiting.delete(entry.attemptId);
    if (entry.signal && entry.abortListener) entry.signal.removeEventListener("abort", entry.abortListener);
  }
  private rejectPending(entry: WaitingAdmission, error: Error) { this.detach(entry); entry.reject(error); }

  async cancelWaiting(attemptId: string) {
    const cancelled = this.getStore().cancelQueued(attemptId);
    const pending = this.waiting.get(attemptId);
    if (cancelled && pending) this.rejectPending(pending, new AdmissionCancelledError());
    if (cancelled) await this.persistProjection();
    this.scheduleDrain();
    return cancelled;
  }

  async cancelUnstarted(attemptId: string, token: string) {
    const cancelled = this.getStore().cancelUnstarted(attemptId,token);
    if (cancelled) await this.persistProjection();
    this.scheduleDrain(); return cancelled;
  }

  async cancelWaitingForWorkload(workloadId: string) {
    const ids = this.getStore().snapshot().queued.filter(entry => entry.workloadId === safeWorkloadId(workloadId)).map(entry => entry.attemptId);
    for (const id of ids) await this.cancelWaiting(id);
    return ids.length;
  }

  reconcileWorkload(workloadId: string, outcome: "failed" | "cancelled" = "failed") {
    try { return this.getStore().reconcileWorkload(safeWorkloadId(workloadId),outcome); }
    catch { throw new AdmissionBlockedError("admission_runtime_exit_unconfirmed"); }
  }

  voiceJournal() { return this.getStore().voiceJournal; }
  operatorRequests() { return this.operatorStore ||= new NeuralDeepOperatorRequests(this.getStore()); }
  executionWorkspaces() { return new NeuralDeepExecutionWorkspaces(this.getStore(),{stateRoot:this.stateRoot}); }
  waitReason(attemptId:string) {
    const state=this.getStore().get(attemptId);
    if(state?.status==='resume_confirmation_required')return 'resume_confirmation_required';
    if(state?.status!=='queued')return null;
    return this.getStore().resourceWaitReason(attemptId)||'capacity_or_predecessor';
  }
  logicalOwnerForKey(key: string) { return this.getStore().logicalOwner(coordinationHash(key)); }
  acquireTaskControl(taskId: string, owner: string) { return this.getStore().acquireSessionControl(coordinationHash(`voice-operation:${safeWorkloadId(taskId)}`),owner); }
  releaseTaskControl(taskId: string, owner: string) { return this.getStore().releaseSessionControl(coordinationHash(`voice-operation:${safeWorkloadId(taskId)}`),owner); }

  pauseCoordinationKey(key: string, reason: "waiting_for_operator" | "waiting_for_approval") { this.getStore().pause(coordinationHash(key), reason); }
  resumeCoordinationKey(key: string) { this.getStore().resume(coordinationHash(key)); this.scheduleDrain(); }
  holdLogicalOwner(key: string, owner: string) { return this.getStore().holdLogicalOwner(coordinationHash(key), safeWorkloadId(owner)); }
  releaseLogicalOwner(key: string, owner: string, generation: number) {
    const released = this.getStore().releaseLogicalOwner(coordinationHash(key), safeWorkloadId(owner), generation);
    this.scheduleDrain();
    return released;
  }

  async rejectWaitingForCoordinationKey(key: string, code = "predecessor_confirmation_required") {
    const scope = coordinationHash(key);
    const rejected = this.getStore().snapshot().queued.filter(entry => entry.coordinationKeyHash === scope).map(entry => entry.attemptId);
    for (const id of rejected) {
      this.getStore().cancelQueued(id);
      const pending = this.waiting.get(id);
      if (pending) this.rejectPending(pending, new AdmissionBlockedError(code));
    }
    await this.persistProjection();
    this.scheduleDrain();
    return rejected;
  }

  snapshot() {
    return { ...(this.store?.snapshot() || { active: [], queued: [], unresolved: [], pausedCoordinationKeyHashes: [] }),
      effectiveLimit: this.limitCache?.value || 1, projectionError: this.projectionError };
  }
  invalidateLimit() { this.limitCache = null; this.scheduleDrain(); }

  private scheduleDrain() {
    if (this.closed || this.draining) return;
    if (this.poll) { clearTimeout(this.poll); this.poll = null; }
    this.draining = Promise.resolve().then(() => this.drain()).catch(() => {
      for (const pending of this.waiting.values()) this.rejectPending(pending, new AdmissionBlockedError("admission_storage_unavailable"));
    }).finally(() => {
      this.draining = null;
      if (!this.closed && this.waiting.size) this.poll = setTimeout(() => this.scheduleDrain(), this.pollMs);
    });
  }

  private async drain() {
    const limit = await this.currentLimit();
    if (this.closed) return;
    if (Date.now() >= this.nextStoppedChatCheck) {
      this.nextStoppedChatCheck = Date.now() + 1_000;
      this.getStore().reconcileDeadWorkers();
      this.getStore().reconcileStoppedTaskChats();
    }
    for (const pending of this.waiting.values()) {
      if (pending.signal?.aborted) { await this.cancelWaiting(pending.attemptId); continue; }
      const state = this.getStore().get(pending.attemptId);
      if (state?.status === "cancelled") { this.rejectPending(pending, new AdmissionCancelledError()); continue; }
      const claimed = this.getStore().claim(pending.attemptId, limit);
      if (!claimed?.ownerToken || !claimed.admittedAt) continue;
      this.detach(pending);
      const token = claimed.ownerToken;
      let released = false;
      pending.resolve({ attemptId: pending.attemptId, surface: pending.surface, workloadId: pending.workloadId,
        coordinationKeyHash: pending.coordinationKeyHash, admittedAt: claimed.admittedAt,
        launcherReceipt: { attemptId: pending.attemptId, ownerToken: token },
        bindSession: identity => this.getStore().bindSession(pending.attemptId, token, coordinationHash(identity)),
        isCurrent: () => { const state = this.getStore().get(pending.attemptId); return state?.status === "active" && state.ownerToken === token; },
        confirmRuntimeExit: () => this.getStore().assertAttemptRuntimeExited(pending.attemptId,token),
        release: async (outcome = "completed") => {
          if (released) return;
          try { this.getStore().finish(pending.attemptId, token, outcome); }
          finally {
            released = true;
            await this.persistProjection();
            this.scheduleDrain();
          }
        },
      });
      await this.persistProjection();
    }
  }

  private async currentLimit() {
    if (this.limitCache && Date.now() < this.limitCache.expiresAt) return this.limitCache.value;
    const value = Math.min(this.localLimit, normalizedLimit(await this.limitProvider().catch(() => null)));
    this.limitCache = { value, expiresAt: Date.now() + this.limitCacheMs };
    return value;
  }
  private ensureInitialized() {
    if (!this.initialized) this.initialized = Promise.resolve().then(() => { this.getStore(); return this.persistProjection(); });
    return this.initialized;
  }
  private async persistProjection() {
    if (!this.ledgerPath) return;
    try {
      await atomicWritePrivateJson({ stateRoot: this.stateRoot, filePath: this.ledgerPath,
        resourceKey: "neuraldeep-admission-projection", value: this.getStore().journal() });
      this.projectionError = null;
    } catch { this.projectionError = "admission_projection_write_failed"; }
  }
  close() {
    this.closed = true;
    if (this.poll) clearTimeout(this.poll);
    for (const pending of this.waiting.values()) this.rejectPending(pending, new AdmissionBlockedError("admission_closed"));
    this.store?.close();
    this.store = null;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __prithaNeuralDeepAdmissionCoordinator: NeuralDeepAdmissionCoordinator | undefined;
}
export function getNeuralDeepAdmissionCoordinator() {
  if (!globalThis.__prithaNeuralDeepAdmissionCoordinator) globalThis.__prithaNeuralDeepAdmissionCoordinator = new NeuralDeepAdmissionCoordinator();
  return globalThis.__prithaNeuralDeepAdmissionCoordinator;
}
