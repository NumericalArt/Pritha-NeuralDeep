"use client";

import {
  AlertTriangle,
  Bot,
  Globe2,
  LoaderCircle,
  Menu,
  Mic,
  Plus,
  Search,
  Send,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { CodexMarkdown } from "./CodexMarkdown";
import { CopyResponse } from "./CopyResponse";
import { ActivityFeed } from "./ActivityFeed";
import { ActivityAction } from "./ActivityAction";
import { HistoryTurn } from "./HistoryTurn";
import { useTranscriptScroll } from "./useTranscriptScroll";
import { WorkingIndicator } from "./WorkingIndicator";
import { VoiceOperatorCard, operatorTaskForLinks } from "./VoiceOperatorCard";
import { ChatAttachments } from "./ChatAttachments";
import { AttachmentCapabilityNotice } from "./AttachmentCapabilityNotice";
import { useDraftAttachments } from "./useDraftAttachments";
import { browserDraftTab, readBrowserDraft, writeBrowserDraft } from "@/lib/codex-chat/browser-drafts";
import { parseBudgetIntent } from "@/lib/codex-chat/budget-intent";
import type { TaskDeliveryView } from "@/lib/codex-chat/delivery-types";
import {
  checkControlCenterHealth,
  ControlCenterRequestError,
  controlCenterRequest as api,
  deliveryMayBeUnknown,
} from "@/lib/control-center-request";
import {
  DICTATION_LANGUAGE_CHANGED_EVENT,
  DICTATION_LANGUAGE_OPTIONS,
  type DictationLanguage,
  readStoredDictationLanguage,
  recognitionLanguageTag,
  writeStoredDictationLanguage,
} from "@/lib/codex-chat/dictation-preferences";
import {
  consumeTaskChatHandoff,
  createTaskChatNavigation,
  reportControlCenterUiActivity,
  reportTaskChatUiActivity,
  type TaskChatNavigationContext,
  type TaskChatUiActivitySource,
} from "@/lib/codex-chat/ui-activity-client";
import type {
  AcceptedTurn,
  ChatEvent,
  ChatItemView,
  CreatedThreadTurn,
  RuntimeStatus,
  ThreadDetail,
  ThreadPage,
  ThreadSummary,
  TurnPage,
  TurnRecoveryAction,
  TurnRecoveryResult,
  TurnView,
} from "@/lib/codex-chat/types";

type ConnectionState = "idle" | "connecting" | "ready" | "reconnecting";
type DictationState = "idle" | "listening" | "error";
type HistoryState = "idle" | "loading" | "slow" | "ready" | "error";
type ChatGroup = "my_chats" | "voice_work";
type ChatFailure = {
  message: string;
  source: "bootstrap" | "history" | "mutation" | "turn";
  kind: "backend_offline" | "runtime_unavailable" | "stream_reconnecting" | "turn_failed" | "request_failed";
  chatId?: string | null;
  turnId?: string;
  code?: string;
  retryable?: boolean;
  replacementAllowed?: boolean;
};

type SubmittedDraft = {
  draftKey: string;
  revision: number;
  attachments: string[];
  settings?: { modelId: string; effortId?: string };
};
type PendingDelivery = SubmittedDraft & {
  voiceHandoff?: {taskId:string;topicGeneration:number};
  mode?: "after_completion";
  chatId: string;
  runId?: string;
  clientMessageId: string;
  text: string;
  status: "sending" | "delivery_unknown";
};

type PendingNewChatDelivery = SubmittedDraft & {
  clientThreadId: string;
  clientMessageId: string;
  text: string;
  status: "sending" | "delivery_unknown";
};

type RecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
};

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => RecognitionLike;
  webkitSpeechRecognition?: new () => RecognitionLike;
};

const HISTORY_SLOW_MS = 2_500;
const HISTORY_TIMEOUT_MS = 12_000;
const TURN_START_TIMEOUT_MS = 30_000;

function requestErrorCode(cause: unknown) {
  if (cause instanceof ControlCenterRequestError && /^[a-z0-9_]{1,64}$/.test(cause.code)) return cause.code;
  return "unknown_error";
}

function isTransientConnectivityFailure(cause: unknown) {
  return cause instanceof ControlCenterRequestError
    && cause.retryable
    && (cause.kind === "network" || cause.kind === "gateway" || cause.kind === "invalid_response");
}

function failure(cause: unknown, fallback: string, source: ChatFailure["source"], chatId?: string | null): ChatFailure {
  const requestError = cause instanceof ControlCenterRequestError ? cause : null;
  const runtimeUnavailable = requestError?.code === "runtime_unavailable" || requestError?.code === "runtime_incompatible";
  return {
    message: requestError?.message || fallback,
    source,
    chatId,
    code: requestError?.code,
    retryable: requestError?.retryable ?? true,
    replacementAllowed: requestError?.details?.replacementAllowed === true,
    kind: requestError && (requestError.kind === "network" || requestError.kind === "gateway" || requestError.kind === "invalid_response")
      ? "backend_offline"
      : runtimeUnavailable
        ? "runtime_unavailable"
        : source === "turn"
          ? "turn_failed"
          : source === "history"
            ? "stream_reconnecting"
            : "request_failed",
  };
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

async function loadThreadPage(group: ChatGroup, options: { cursor?: string | null; search?: string; archived?: boolean } = {}) {
  const query = new URLSearchParams({ group, limit: "50" });
  if (options.archived) query.set("archived", "true");
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.search) query.set("search", options.search);
  const response = await api<ThreadPage>(`/api/codex-chat/v1/threads?${query.toString()}`);
  return response.data;
}

function upsertTurn(rows: TurnView[], turn: TurnView) {
  const index = rows.findIndex((row) => row.turnId === turn.turnId);
  if (index < 0) return [...rows, turn].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  const next = [...rows];
  next[index] = turn;
  return next;
}

function turnNeedsRecovery(turn: TurnView) {
  return turn.status === "failed";
}

function upsertItem(rows: TurnView[], turnId: string, item: ChatItemView) {
  return rows.map((turn) => {
    if (turn.turnId !== turnId) return turn;
    const index = turn.items.findIndex((row) => row.id === item.id);
    const items = [...turn.items];
    if (index < 0) items.push(item);
    else items[index] = item;
    return { ...turn, items };
  });
}

function appendDelta(rows: TurnView[], event: ChatEvent): TurnView[] {
  if (!event.turnId) return rows;
  const delta = String(event.payload.delta || "");
  if (!delta) return rows;
  return rows.map((turn) => {
    if (turn.turnId !== event.turnId) return turn;
    const itemId = event.itemId || `${turn.turnId}-assistant`;
    const existingIndex = turn.items.findIndex((item) => item.id === itemId && item.kind === "assistant_message");
    const items = [...turn.items];
    if (existingIndex >= 0) {
      const item = items[existingIndex];
      if (item.kind === "assistant_message") {
        items[existingIndex] = {
          ...item,
          status: "in_progress",
          message: { ...item.message, markdown: `${item.message.markdown}${delta}`, status: "streaming" },
        };
      }
    } else {
      items.push({
        id: itemId,
        kind: "assistant_message",
        status: "in_progress",
        startedAt: event.occurredAt,
        completedAt: null,
        message: { id: itemId, role: "assistant", markdown: delta, status: "streaming", createdAt: event.occurredAt },
      });
    }
    return { ...turn, status: "in_progress" as const, items };
  });
}

function ActivityItem({ item }: { item: ChatItemView }) {
  if (item.kind === "assistant_message") {
    return (
      <article className={`codex-message codex-assistant-message ${item.message.status === "streaming" ? "streaming" : ""}`}>
        <div className="codex-message-label"><Bot size={15} /> Pritha</div>
        <CodexMarkdown markdown={item.message.markdown || "…"} />
      </article>
    );
  }
  return <ActivityAction item={item} />;
}

function shouldRenderActivityItem(item: ChatItemView) {
  // Older builds discarded the diagnostic text and persisted only this label.
  // New diagnostic notices and terminal `turn.error` messages remain visible.
  return item.kind !== "unsupported" || item.label.trim().toLowerCase() !== "error";
}

function ThreadRow({ thread, active, onSelect, onArchive, busy }: { thread: ThreadSummary; active: boolean; onSelect: () => void; onArchive: () => void; busy: boolean }) {
  const execution=thread.execution;
  const states:Record<string,string>={queued:'Queued',running:'Working',waiting_for_provider:'Waiting for provider',waiting_for_input:'Answer needed',waiting_for_approval:'Decision needed',completed:'Completed',interrupted:'Stopped',failed:'Needs attention'};
  const status=execution?.waitReason==='workspace_conflict'?'Waiting for workspace':execution?.waitReason==='resume_confirmation_required'?'Recovery needed':execution ? states[execution.state] : null;
  return (
    <div className="codex-thread-entry"><button className={`codex-thread-row ${active ? "active" : ""}`} type="button" onClick={onSelect}>
      <span className="codex-thread-title">{thread.title}</span>
      <span className="codex-thread-meta">
        <span>{status || (thread.status === "active" ? "Working" : thread.preview || "No messages yet")}</span>
        <time>{relativeTime(thread.updatedAt)}</time>
      </span>
      {thread.taskLinks.length ? <span className="codex-thread-task-links">{thread.taskLinks.slice(-3).map((link) => `#${link.shortId || link.taskId.slice(-6)}`).join(" · ")}</span> : null}
    </button>
    {active ? <button type="button" className="codex-text-action codex-archive-action" onClick={onArchive} disabled={busy}>{thread.archived ? "Restore from archive" : "Archive"}</button> : null}
    </div>
  );
}

export function CodexChatPage() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [backgroundCounts,setBackgroundCounts]=useState<Record<string,{working:number;attention:number}>>({});
  const [activeGroup, setActiveGroup] = useState<ChatGroup>("my_chats");
  const activeGroupRef = useRef<ChatGroup>("my_chats");
  const selectedByGroupRef = useRef<Record<ChatGroup, string | null>>({ my_chats: null, voice_work: null });
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [draftsByChat, setDraftsByChat] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);
  const archiveViewRef = useRef(false);
  const listRequestVersion = useRef(0);
  archiveViewRef.current = showArchived;
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [nextCursorByGroup, setNextCursorByGroup] = useState<Record<ChatGroup, string | null>>({ my_chats: null, voice_work: null });
  const [listLoading, setListLoading] = useState(true);
  const [listPageLoading, setListPageLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [voiceSync, setVoiceSync] = useState<ThreadPage["sync"]>(undefined);
  const [loading, setLoading] = useState(true);
  const [draftStoreReady, setDraftStoreReady] = useState(false);
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null);
  const [draftTab, setDraftTab] = useState<string | null>(null);
  const [activeNewDraft, setActiveNewDraft] = useState(() => `draft_${crypto.randomUUID()}`);
  const activeNewDraftRef = useRef(activeNewDraft);
  const revisionsRef = useRef<Record<string, number>>({});
  const persistDraftsRef = useRef<() => Promise<void>>(async () => {});
  const [error, setError] = useState<ChatFailure | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [turnRecovery, setTurnRecovery] = useState<{ turnId: string; action: TurnRecoveryAction } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState<TurnPage | null>(null);
  const olderHistoryRef = useRef<AbortController | null>(null);
  const browsingOlderRef = useRef(false);
  const summarySelectedRefreshRef=useRef<(()=>void)|null>(null);
  const [olderHistoryLoading, setOlderHistoryLoading] = useState(false);
  const [historyCompleteness, setHistoryCompleteness] = useState<TurnPage["completeness"]>();
  const [historyState, setHistoryState] = useState<HistoryState>("idle");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyIssue, setHistoryIssue] = useState<{ code: string; retryable: boolean; replacementAllowed: boolean } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [streamRevision, setStreamRevision] = useState(0);
  const [pendingDeliveries, setPendingDeliveries] = useState<Record<string, PendingDelivery>>({});
  const [budgetNotice, setBudgetNotice] = useState<{ chatId: string; message: string } | null>(null);
  const [pendingNewDeliveries, setPendingNewDeliveries] = useState<Record<string, PendingNewChatDelivery>>({});
  const pendingNewDeliveriesRef = useRef<Record<string, PendingNewChatDelivery>>({});
  const [dictation, setDictation] = useState<DictationState>("idle");
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictationLanguage, setDictationLanguage] = useState<DictationLanguage>("browser");
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const { transcriptRef, contentRef: transcriptContentRef, preservePosition, followLatest } = useTranscriptScroll(selectedChatId);
  const listSentinelRef = useRef<HTMLDivElement | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);
  const displayedChatIdRef = useRef<string | null>(null);
  const draftsByChatRef = useRef<Record<string, string>>({});
  const pendingDeliveriesRef = useRef<Record<string, PendingDelivery>>({});
  const newChatDraftActiveRef = useRef(false);
  const detailRequestRef = useRef<{ chatId: string; token: symbol; controller: AbortController } | null>(null);
  const historyRequestRef = useRef<{ chatId: string; token: symbol; controller: AbortController } | null>(null);
  const navigationRef = useRef<TaskChatNavigationContext | null>(null);
  const completedInteractionsRef = useRef<Set<string>>(new Set());
  const listRefreshMountedRef = useRef(false);
  const connectionRef = useRef<ConnectionState>("idle");
  selectedChatIdRef.current = selectedChatId;
  activeGroupRef.current = activeGroup;
  connectionRef.current = connection;
  activeNewDraftRef.current = activeNewDraft;
  const pendingNewChatDelivery = pendingNewDeliveries[activeNewDraft] || null;

  const draftKey = selectedChatId || activeNewDraft;
  const draft = draftsByChat[draftKey] || "";
  const pendingDelivery = selectedChatId ? pendingDeliveries[selectedChatId] || null : pendingNewChatDelivery;

  const updateDraftForChat = useCallback((chatId: string | null, value: SetStateAction<string>) => {
    const key = chatId || activeNewDraftRef.current;
    const current = draftsByChatRef.current[key] || "";
    const nextValue = typeof value === "function" ? value(current) : value;
    if (nextValue === current) return;
    revisionsRef.current[key] = (revisionsRef.current[key] || 0) + 1;
    const next = { ...draftsByChatRef.current };
    if (nextValue) next[key] = nextValue;
    else delete next[key];
    draftsByChatRef.current = next;
    setDraftsByChat(next);
    void persistDraftsRef.current().catch(cause => setDraftStorageError(String(cause.message || cause)));
  }, []);

  const setDraft = useCallback((value: SetStateAction<string>) => {
    updateDraftForChat(selectedChatIdRef.current, value);
  }, [updateDraftForChat]);

  const setPendingForChat = useCallback((chatId: string, value: PendingDelivery | null) => {
    const next = { ...pendingDeliveriesRef.current };
    if (value) next[chatId] = value;
    else delete next[chatId];
    pendingDeliveriesRef.current = next;
    setPendingDeliveries(next);
    void persistDraftsRef.current().catch(cause => setDraftStorageError(String(cause.message || cause)));
  }, []);

  const draftScope = runtime?.providers.find(provider => provider.providerId === "neuraldeep_cli")?.stateIdentityHash || null;
  const attachmentContentChanged = useCallback((key: string) => { revisionsRef.current[key] = (revisionsRef.current[key] || 0) + 1; void persistDraftsRef.current().catch(cause => setDraftStorageError(cause.message)); }, []);
  const draftAttachments = useDraftAttachments(draftScope, draftTab, attachmentContentChanged);
  const currentAttachments = draftAttachments.byDraft[draftKey] || [];
  const sending = pendingDelivery?.status === "sending";
  const attachmentsBusy = currentAttachments.some(file => file.status !== "ready");
  const persistDrafts = useCallback(async () => {
    if (!draftScope || !draftTab || !draftStoreReady) return;
    await writeBrowserDraft(draftScope, `drafts:${draftTab}`, { version: 1, drafts: draftsByChatRef.current,
      revisions: revisionsRef.current, activeNewDraft: activeNewDraftRef.current,
      pending: pendingDeliveriesRef.current, newPending: pendingNewDeliveriesRef.current });
  }, [draftScope, draftTab, draftStoreReady]);
  persistDraftsRef.current = persistDrafts;
  useEffect(() => { try { setDraftTab(browserDraftTab()); } catch { setDraftStorageError("Browser draft storage is unavailable. Keep this page open."); } }, []);
  useEffect(() => {
    if (!draftScope || !draftTab) return;
    let active = true;
    void readBrowserDraft<{ version: number; drafts: Record<string,string>; revisions: Record<string,number>; activeNewDraft: string; pending: Record<string,PendingDelivery>; newPending: Record<string,PendingNewChatDelivery> }>(draftScope, `drafts:${draftTab}`).then(saved => {
      if (!active) return;
      if (saved && saved.version !== 1) throw new Error("The saved browser drafts need a compatible reader. They have been kept.");
      if (saved?.version === 1) {
        const drafts = Object.fromEntries(Object.entries(saved.drafts || {}).filter(([key,value]) => /^(draft_|chat_)[A-Za-z0-9_-]+$/.test(key) && typeof value === "string"));
        draftsByChatRef.current = drafts; setDraftsByChat(drafts); revisionsRef.current = saved.revisions || {};
        if (/^draft_[A-Za-z0-9_-]+$/.test(saved.activeNewDraft)) { activeNewDraftRef.current = saved.activeNewDraft; setActiveNewDraft(saved.activeNewDraft); }
        const pending = Object.fromEntries(Object.entries(saved.pending || {}).map(([key,value]) => [key,{ ...value,status: "delivery_unknown" as const }]));
        const newPending = Object.fromEntries(Object.entries(saved.newPending || {}).map(([key,value]) => [key,{ ...value,status: "delivery_unknown" as const }]));
        pendingDeliveriesRef.current = pending; setPendingDeliveries(pending);
        pendingNewDeliveriesRef.current = newPending; setPendingNewDeliveries(newPending);
        if (!new URLSearchParams(window.location.search).has("chat") && (drafts[saved.activeNewDraft] || newPending[saved.activeNewDraft])) {
          newChatDraftActiveRef.current = true; selectedChatIdRef.current = null; setSelectedChatId(null);
        }
      }
      setDraftStoreReady(true);
    }).catch(cause => { if (active) setDraftStorageError(cause.message); });
    return () => { active = false; };
  }, [draftScope,draftTab]);
  const setPendingForDraft = useCallback((key: string, value: PendingNewChatDelivery | null) => {
    const next = { ...pendingNewDeliveriesRef.current }; if (value) next[key] = value; else delete next[key];
    pendingNewDeliveriesRef.current = next; setPendingNewDeliveries(next);
    void persistDraftsRef.current().catch(cause => setDraftStorageError(cause.message));
  }, []);
  const clearSubmittedDraft = useCallback(async (delivery: SubmittedDraft & { text: string }) => {
    if ((revisionsRef.current[delivery.draftKey] || 0) === delivery.revision) updateDraftForChat(delivery.draftKey, "");
    await draftAttachments.clearAccepted(delivery.draftKey, delivery.attachments || []);
    await persistDraftsRef.current();
  }, [draftAttachments.clearAccepted, updateDraftForChat]);

  const selectedSummary = useMemo(
    () => threads.find((thread) => thread.chatId === selectedChatId) || null,
    [selectedChatId, threads],
  );

  const refreshRuntime = useCallback(async () => {
    const response = await api<RuntimeStatus>("/api/codex-chat/v1/runtime");
    setRuntime(response.data);
    return response.data;
  }, []);

  const refreshThreads = useCallback(async () => {
    if (archiveViewRef.current !== showArchived) return [];
    const requestVersion = ++listRequestVersion.current;
    setListPageLoading(false);
    const requestedGroup = activeGroup;
    const interactionId = crypto.randomUUID();
    const startedAt = Date.now();
    reportControlCenterUiActivity({ event: "thread_list_started", interactionId, source: "thread_list", durationMs: 0, group: requestedGroup });
    setListLoading(true);
    setListError(null);
    try {
      const page = await loadThreadPage(requestedGroup, { search: debouncedSearch, archived: showArchived });
      if (requestVersion !== listRequestVersion.current || archiveViewRef.current !== showArchived) return [];
      const groupRows = page.data.filter((thread) => thread.group === requestedGroup && thread.archived === showArchived);
      setThreads((current) => [...current.filter((thread) => thread.group !== requestedGroup), ...groupRows]);
      setNextCursorByGroup((current) => ({ ...current, [requestedGroup]: page.nextCursor }));
      if (requestedGroup === "voice_work") setVoiceSync(page.sync);
      reportControlCenterUiActivity({ event: "thread_list_first_page_loaded", interactionId, source: "thread_list", durationMs: Date.now() - startedAt, group: requestedGroup, count: Math.min(50, groupRows.length) });
      if (activeGroupRef.current !== requestedGroup) return groupRows;
      setSelectedChatId((current) => {
        // A recoverable draft stays in the sidebar without overriding a selected chat.
        if (requestedGroup === "my_chats" && newChatDraftActiveRef.current) return null;
        const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chat") : null;
        const next = requested || [current, selectedByGroupRef.current[requestedGroup], groupRows[0]?.chatId]
          .find((candidate) => candidate && groupRows.some((thread) => thread.chatId === candidate)) || null;
        selectedByGroupRef.current[requestedGroup] = next;
        return next;
      });
      return groupRows;
    } catch (cause) {
      if (requestVersion !== listRequestVersion.current || archiveViewRef.current !== showArchived) return [];
      setListError(cause instanceof ControlCenterRequestError ? cause.message : "Task Chat list could not load.");
      reportControlCenterUiActivity({ event: "thread_list_page_failed", interactionId, source: "thread_list", durationMs: Date.now() - startedAt, group: requestedGroup, errorCode: requestErrorCode(cause) });
      throw cause;
    } finally {
      if (activeGroupRef.current === requestedGroup && requestVersion === listRequestVersion.current) setListLoading(false);
    }
  }, [activeGroup, debouncedSearch, showArchived]);

  const loadMoreThreads = useCallback(async () => {
    const group = activeGroupRef.current;
    const requestVersion = listRequestVersion.current;
    const cursor = nextCursorByGroup[group];
    if (!cursor || listLoading || listPageLoading) return;
    setListPageLoading(true);
    setListError(null);
    try {
      const page = await loadThreadPage(group, { cursor, search: debouncedSearch, archived: showArchived });
      if (requestVersion !== listRequestVersion.current || archiveViewRef.current !== showArchived || group !== activeGroupRef.current) return;
      setThreads((current) => {
        const ids = new Set(current.map((row) => row.chatId));
        return [...current, ...page.data.filter((row) => !ids.has(row.chatId))];
      });
      setNextCursorByGroup((current) => ({ ...current, [group]: page.nextCursor }));
      if (group === "voice_work") setVoiceSync(page.sync);
    } catch (cause) {
      if (requestVersion !== listRequestVersion.current || archiveViewRef.current !== showArchived) return;
      setListError(cause instanceof ControlCenterRequestError ? cause.message : "More chats could not load.");
    } finally {
      if (requestVersion === listRequestVersion.current) setListPageLoading(false);
    }
  }, [debouncedSearch, listLoading, listPageLoading, nextCursorByGroup, showArchived]);

  useEffect(()=>{
    let disposed=false,inFlight=false,again=false;
    const group=activeGroup;
    const refresh=async()=>{
      if(disposed)return;
      if(inFlight){again=true;return;}
      inFlight=true;
      const requestVersion=listRequestVersion.current;
      try{
        const page=await loadThreadPage(group,{search:debouncedSearch,archived:showArchived});
        if(disposed || requestVersion!==listRequestVersion.current || archiveViewRef.current!==showArchived)return;
        setThreads(current=>[...current.filter(thread=>thread.group!==group),...page.data]);
        setNextCursorByGroup(current=>({...current,[group]:page.nextCursor}));
        if(group==='voice_work')setVoiceSync(page.sync);
        setListError(current=>current?.startsWith('Background chat updates')?null:current);
      }catch{if(!disposed && requestVersion===listRequestVersion.current && archiveViewRef.current===showArchived)setListError('Background chat updates are temporarily unavailable. Reconnecting…');}
      finally{inFlight=false;if(again&&!disposed){again=false;void refresh();}}
    };
    const source=new EventSource('/api/codex-chat/v1/events');
    source.addEventListener('summary.changed',event=>{
      try{const value=JSON.parse((event as MessageEvent).data);if(value.groups&&typeof value.groups==='object')setBackgroundCounts(value.groups);
        if(value.reset||value.changed?.includes(selectedChatIdRef.current))summarySelectedRefreshRef.current?.();
      }catch{ /* Reconnect/refresh remains available after a malformed notification. */ }
      void refresh();
    });
    source.addEventListener('summary.unavailable',()=>{if(!disposed)setListError('Background chat updates are temporarily unavailable. Reconnecting…');});
    return()=>{disposed=true;source.close();};
  },[activeGroup,debouncedSearch,showArchived]);

  const completeNavigation = useCallback((
    context: TaskChatNavigationContext | null,
    event: "history_loaded" | "history_failed",
    options: { stage: "navigation" | "metadata" | "history"; durationMs: number; errorCode?: string },
  ) => {
    if (!context || completedInteractionsRef.current.has(context.interactionId)) return;
    if (completedInteractionsRef.current.size >= 500) completedInteractionsRef.current.clear();
    completedInteractionsRef.current.add(context.interactionId);
    reportTaskChatUiActivity(context, event, options);
  }, []);

  const beginNavigation = useCallback((
    chatId: string,
    source: TaskChatUiActivitySource,
    options: { selected?: boolean; context?: TaskChatNavigationContext | null } = {},
  ) => {
    const context = options.context || createTaskChatNavigation(chatId, source);
    const previous = navigationRef.current;
    if (previous && previous.interactionId !== context.interactionId) {
      completeNavigation(previous, "history_failed", {
        stage: "navigation",
        durationMs: Math.max(0, Date.now() - previous.startedAt),
        errorCode: "navigation_superseded",
      });
    }
    navigationRef.current = context;
    if (options.selected) reportTaskChatUiActivity(context, "thread_selected", { stage: "navigation", durationMs: 0 });
    if (!options.context) reportTaskChatUiActivity(context, "navigation_started", { stage: "navigation", durationMs: 0 });
    return context;
  }, [completeNavigation]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const group: ChatGroup = params.get("group") === "voice_work" ? "voice_work" : "my_chats";
    const requested = params.get("chat");
    setActiveGroup(group);
    if (requested) {
      selectedByGroupRef.current[group] = requested;
      beginNavigation(requested, "direct_link", { context: consumeTaskChatHandoff(requested) });
      setSelectedChatId(requested);
    }
  }, [beginNavigation]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const sentinel = listSentinelRef.current;
    if (!sentinel || !nextCursorByGroup[activeGroup]) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMoreThreads();
    }, { rootMargin: "160px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeGroup, loadMoreThreads, nextCursorByGroup]);

  useEffect(() => {
    if (activeGroup !== "voice_work" || voiceSync?.state !== "refreshing") return;
    const timer = window.setTimeout(() => void refreshThreads().catch(() => undefined), 1_000);
    return () => window.clearTimeout(timer);
  }, [activeGroup, refreshThreads, voiceSync?.state]);

  const loadThreadDetail = useCallback(async (chatId: string) => {
    detailRequestRef.current?.controller.abort();
    const token = Symbol(chatId);
    const controller = new AbortController();
    detailRequestRef.current = { chatId, token, controller };
    if (selectedChatIdRef.current === chatId) setDetailLoading(true);
    try {
      const response = await api<ThreadDetail>(
        `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}`,
        { signal: controller.signal },
        { timeoutMs: HISTORY_TIMEOUT_MS },
      );
      if (detailRequestRef.current?.token === token && selectedChatIdRef.current === chatId) {
        setDetail(response.data);
        setError((currentError) => currentError?.source === "history" ? null : currentError);
      }
      return response.data;
    } finally {
      if (detailRequestRef.current?.token === token) {
        detailRequestRef.current = null;
        if (selectedChatIdRef.current === chatId) setDetailLoading(false);
      }
    }
  }, []);

  const loadThreadHistory = useCallback(async (
    chatId: string,
    threadDetail: ThreadDetail,
    context: TaskChatNavigationContext | null = null,
  ) => {
    historyRequestRef.current?.controller.abort();
    const token = Symbol(chatId);
    const controller = new AbortController();
    historyRequestRef.current = { chatId, token, controller };
    if (selectedChatIdRef.current === chatId) {
      setHistoryState("loading");
      setHistoryError(null);
      setHistoryIssue(null);
    }
    const slowTimer = window.setTimeout(() => {
      if (historyRequestRef.current?.token === token && selectedChatIdRef.current === chatId) setHistoryState("slow");
    }, HISTORY_SLOW_MS);
    try {
      const page = (await api<TurnPage>(
        `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/history?limit=20`,
        { signal: controller.signal }, { timeoutMs: 35_000, maxBodyBytes: 256 * 1024 },
      )).data;
      const rows = page.data;
      if (historyRequestRef.current?.token !== token) return false;
      if (selectedChatIdRef.current === chatId) {
        setTurns(previous => browsingOlderRef.current ? previous.map(turn => rows.find(row => row.turnId === turn.turnId) || turn) : rows);
        if (!browsingOlderRef.current) setHistoryPage(page);
        setHistoryCompleteness(page.completeness);
        setHistoryState("ready");
        setHistoryError(null);
        setHistoryIssue(null);
        setError((currentError) => currentError?.source === "history" ? null : currentError);
      }
      const pending = pendingDeliveriesRef.current[chatId];
      if (pending && rows.some((turn) => turn.clientMessageId === pending.clientMessageId)) {
        await clearSubmittedDraft(pending);
        setPendingForChat(chatId, null);
        setError((current) => current?.source === "turn" && current.chatId === chatId ? null : current);
      }
      completeNavigation(context, "history_loaded", {
        stage: "history",
        durationMs: context ? Math.max(0, Date.now() - context.startedAt) : 0,
      });
      return true;
    } catch (cause) {
      if (historyRequestRef.current?.token !== token) return false;
      const code = requestErrorCode(cause);
      if (selectedChatIdRef.current === chatId) {
        setHistoryState("error");
        const requestError = cause instanceof ControlCenterRequestError ? cause : null;
        const missing = code === "native_thread_missing";
        setHistoryIssue({ code, retryable: requestError?.retryable ?? true, replacementAllowed: requestError?.details?.replacementAllowed === true });
        setHistoryError(missing
          ? "This chat is no longer available in the selected runtime. It may have been created before the runtime restarted."
          : code === "request_timeout" || code === "history_timeout"
            ? "History took too long to load. The thread is safe; retry when the connection is ready."
            : "History could not load. Retry without leaving this thread.");
      }
      completeNavigation(context, "history_failed", {
        stage: "history",
        durationMs: context ? Math.max(0, Date.now() - context.startedAt) : 0,
        errorCode: code,
      });
      return false;
    } finally {
      window.clearTimeout(slowTimer);
      if (historyRequestRef.current?.token === token) historyRequestRef.current = null;
    }
  }, [completeNavigation, setPendingForChat, clearSubmittedDraft]);

  async function loadOlderHistory() {
    const chatId = selectedChatIdRef.current, cursor = historyPage?.olderCursor;
    if (!chatId || !cursor || olderHistoryLoading) return;
    const controller = new AbortController(); olderHistoryRef.current?.abort(); olderHistoryRef.current = controller;
    setOlderHistoryLoading(true);
    try {
      const page = (await api<TurnPage>(`/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/history?cursor=${encodeURIComponent(cursor)}`, { signal: controller.signal }, { timeoutMs: 35_000, maxBodyBytes: 256 * 1024 })).data;
      if (!controller.signal.aborted && selectedChatIdRef.current === chatId) {
        browsingOlderRef.current = true;
        preservePosition();
        setTurns(previous => [...new Map([...page.data, ...previous].map(turn => [turn.turnId, turn])).values()].slice(0, 60));
        setHistoryPage(page); setHistoryError(null);
      }
    } catch (cause) { if (selectedChatIdRef.current === chatId) setHistoryError(cause instanceof Error ? cause.message : "Older history could not load."); }
    finally { if (olderHistoryRef.current === controller) setOlderHistoryLoading(false); }
  }

  const reconcileChat = useCallback(async (chatId: string) => {
    const nextDetail = await loadThreadDetail(chatId);
    await loadThreadHistory(chatId, nextDetail);
    return nextDetail;
  }, [loadThreadDetail, loadThreadHistory]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let attempt = 0;
    let firstAttempt = true;
    let consecutiveConnectivityFailures = 0;

    const load = async () => {
      try {
        await checkControlCenterHealth();
        await Promise.all([refreshRuntime(), refreshThreads()]);
        consecutiveConnectivityFailures = 0;
        if (!cancelled) setError((current) => current?.source === "bootstrap" ? null : current);
      } catch (cause) {
        if (cancelled) return;
        const transient = isTransientConnectivityFailure(cause);
        consecutiveConnectivityFailures = transient ? consecutiveConnectivityFailures + 1 : 0;
        // A single failed mobile wake/focus request is common and usually heals
        // on the first backoff. Confirm it before replacing the UI with red.
        if (!transient || consecutiveConnectivityFailures >= 2) {
          setError(failure(cause, "Task Chat could not load.", "bootstrap"));
        }
        const schedule = [1_000, 2_000, 5_000, 10_000, 30_000];
        const base = schedule[Math.min(attempt, schedule.length - 1)];
        const delay = Math.round(base * (0.8 + Math.random() * 0.4));
        attempt += 1;
        retryTimer = window.setTimeout(() => void load(), delay);
      } finally {
        if (!cancelled && firstAttempt) {
          firstAttempt = false;
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
    };
  }, [refreshRuntime]);

  useEffect(() => {
    if (!listRefreshMountedRef.current) {
      listRefreshMountedRef.current = true;
      return;
    }
    void refreshThreads().catch(() => undefined);
  }, [activeGroup, debouncedSearch, refreshThreads]);

  useEffect(() => {
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    setDictationSupported(Boolean(SpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    const synchronizeDictationLanguage = () => setDictationLanguage(readStoredDictationLanguage());
    synchronizeDictationLanguage();
    window.addEventListener("storage", synchronizeDictationLanguage);
    window.addEventListener(DICTATION_LANGUAGE_CHANGED_EVENT, synchronizeDictationLanguage);
    return () => {
      window.removeEventListener("storage", synchronizeDictationLanguage);
      window.removeEventListener(DICTATION_LANGUAGE_CHANGED_EVENT, synchronizeDictationLanguage);
    };
  }, []);

  useEffect(() => {
    if (displayedChatIdRef.current === selectedChatId) return;
    displayedChatIdRef.current = selectedChatId;
    detailRequestRef.current?.controller.abort();
    historyRequestRef.current?.controller.abort();
    setDetail(null);
    setTurns([]);
    setDetailLoading(Boolean(selectedChatId));
    setHistoryState(selectedChatId ? "loading" : "idle");
    setHistoryError(null);
    setHistoryIssue(null);
    setConnection(selectedChatId ? "connecting" : "idle");
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) {
      setDetail(null);
      setHistoryPage(null);
      setTurns([]);
      setConnection("idle");
      return;
    }
    browsingOlderRef.current = false;
    olderHistoryRef.current?.abort();
    setOlderHistoryLoading(false);
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: number | null = null;
    let historyTimer: number | null = null;
    let reloadInFlight=false,reloadAgain=false;
    let retryAttempt = 0;
    let streamUrl = "";
    const existingContext = navigationRef.current?.chatId === selectedChatId ? navigationRef.current : null;
    const requested = new URLSearchParams(window.location.search).get("chat");
    const context = existingContext || beginNavigation(selectedChatId, requested === selectedChatId ? "direct_link" : "group_restore");

    setConnection("connecting");

    const reload = async () => {
      if(reloadInFlight){reloadAgain=true;return;}
      reloadInFlight=true;
      try {
        const nextDetail = await loadThreadDetail(selectedChatId);
        if (!cancelled) await loadThreadHistory(selectedChatId, nextDetail);
      } catch (cause) {
        if (!cancelled) {
          if (isTransientConnectivityFailure(cause)) {
            setConnection("reconnecting");
            scheduleReconnect();
          } else {
            setError(failure(cause, "Chat history could not be synchronized.", "history"));
          }
        }
      }finally{reloadInFlight=false;if(reloadAgain&&!cancelled){reloadAgain=false;scheduleHistory();}}
    };
    const scheduleHistory=()=>{if(historyTimer==null&&!cancelled)historyTimer=window.setTimeout(()=>{historyTimer=null;if(!cancelled)void reload();},500);};
    summarySelectedRefreshRef.current=scheduleHistory;

    const event = (message: MessageEvent<string>) => {
      let payload: ChatEvent;
      try { payload = JSON.parse(message.data) as ChatEvent; } catch { return; }
      if (message.type === "connection.ready") {
        retryAttempt = 0;
        setConnection("ready");
        setError((current) => current?.source === "history" && current.kind === "backend_offline" ? null : current);
      }
      if (message.type === "history.changed" || message.type.startsWith("turn.")) {
        scheduleHistory();
      }
      if (message.type === "stream.reset") void reload();
      if (message.type === "message.delta") setTurns((rows) => appendDelta(rows, payload));
      if (message.type === "turn.started" || message.type === "turn.completed" || message.type === "turn.interrupted" || message.type === "turn.failed") {
        const turn = payload.payload.turn as TurnView | undefined;
        if (turn) setTurns((rows) => upsertTurn(rows, turn));
        if (message.type !== "turn.started") {
          void refreshThreads();
          window.setTimeout(() => void reload(), 150);
        }
      }
      if (message.type === "item.started" || message.type === "item.completed") {
        const item = payload.payload.item as ChatItemView | undefined;
        if (item && payload.turnId) setTurns((rows) => upsertItem(rows, payload.turnId || "", item));
      }
      if (message.type === "message.completed") void reload();
      if (message.type === "thread.updated") {
        const thread = payload.payload.thread as ThreadSummary | undefined;
        if (thread) {
          setThreads((rows) => rows.some((row) => row.chatId === thread.chatId)
            ? rows.map((row) => row.chatId === thread.chatId ? thread : row)
            : [thread, ...rows]);
          setDetail((current) => current && current.thread.chatId === thread.chatId ? { ...current, thread } : current);
        }
      }
    };

    const attachStream = (streamUrl: string) => {
      source?.close();
      source = new EventSource(`${streamUrl}${streamUrl.includes("?") ? "&" : "?"}history=compact`);
      source.onopen = () => {
        if (!cancelled) setConnection("connecting");
      };
      for (const name of [
        "connection.ready", "stream.reset", "thread.updated", "turn.started", "turn.completed", "turn.interrupted", "turn.failed",
        "history.changed", "message.delta", "message.completed", "item.started", "item.completed",
      ]) source.addEventListener(name, event as EventListener);
      source.onerror = () => {
        if (cancelled) return;
        source?.close();
        setConnection("reconnecting");
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled || retryTimer != null) return;
      const schedule = [1_000, 2_000, 5_000, 10_000, 30_000];
      const base = schedule[Math.min(retryAttempt, schedule.length - 1)];
      const delay = Math.round(base * (0.8 + Math.random() * 0.4));
      retryAttempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (streamUrl) attachStream(streamUrl);
        else void connect();
      }, delay);
    };

    const connect = async () => {
      if(reloadInFlight)return;
      reloadInFlight=true;
      try {
        const nextDetail = await loadThreadDetail(selectedChatId);
        if (cancelled) return;
        streamUrl = nextDetail.streamUrl;
        attachStream(streamUrl);
        await loadThreadHistory(selectedChatId, nextDetail, context);
      } catch (cause) {
        if (cancelled) return;
        setConnection("reconnecting");
        const transient = isTransientConnectivityFailure(cause);
        if (!transient || retryAttempt >= 2) {
          setError(failure(cause, "Chat history could not load.", "history"));
        }
        setHistoryState("error");
        const code = requestErrorCode(cause);
        const requestError = cause instanceof ControlCenterRequestError ? cause : null;
        setHistoryIssue({ code, retryable: requestError?.retryable ?? true, replacementAllowed: requestError?.details?.replacementAllowed === true });
        setHistoryError(code === "native_thread_missing"
          ? "This chat is no longer available in the selected runtime. It may have been created before the runtime restarted."
          : code === "request_timeout" || code === "history_timeout"
            ? "The thread took too long to open. Retry when the connection is ready."
            : "The thread could not be opened. Retry without leaving Task Chat.");
        completeNavigation(context, "history_failed", {
          stage: "metadata",
          durationMs: Math.max(0, Date.now() - context.startedAt),
          errorCode: requestErrorCode(cause),
        });
        if (transient) scheduleReconnect();
      }finally{reloadInFlight=false;if(reloadAgain&&!cancelled){reloadAgain=false;scheduleHistory();}}
    };

    void connect();
    return () => {
      cancelled = true;
      if(summarySelectedRefreshRef.current===scheduleHistory)summarySelectedRefreshRef.current=null;
      if (historyTimer != null) window.clearTimeout(historyTimer);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [beginNavigation, completeNavigation, loadThreadDetail, loadThreadHistory, refreshThreads, selectedChatId, streamRevision]);

  const selectionChanging = displayedChatIdRef.current !== selectedChatId;
  const displayedTurns = selectionChanging ? [] : turns;
  const visibleThreads = useMemo(() => threads.filter((thread) => thread.group === activeGroup && thread.archived === showArchived), [activeGroup, threads, showArchived]);

  const hasActiveTurn = displayedTurns.some((turn) => turn.status === "queued" || turn.status === "waiting_for_provider" || turn.status === "in_progress" || turn.status === "waiting_for_approval" || turn.status === "waiting_for_input");
  const workingLabel = displayedTurns.some(turn => turn.status === "waiting_for_input" || turn.status === "waiting_for_approval")
    ? null
    : displayedTurns.some(turn => turn.status === "in_progress") ? "Pritha is working"
      : displayedTurns.some(turn => turn.status === "waiting_for_provider") ? "Waiting for provider"
        : displayedTurns.some(turn => turn.status === "queued") ? "In queue" : null;
  const displayedDetail = selectionChanging ? null : detail;
  const voiceQueueLink=displayedDetail?.thread.origin==="voice" && (hasActiveTurn || displayedDetail.continuationState==="blocked_active_turn")
    ? displayedDetail.thread.taskLinks.at(-1) : undefined;
  const voiceQueue=voiceQueueLink?.subjectScope ? {taskId:voiceQueueLink.taskId,topicGeneration:voiceQueueLink.subjectScope.generation} : undefined;
  const displayedThread = displayedDetail?.thread || selectedSummary;
  const effectiveProvider = runtime?.providers.find((provider) => provider.providerId === (displayedThread?.runtime.providerId || runtime.effectiveProvider));
  const visibleError = error && (error.chatId == null || error.chatId === selectedChatId) ? error : null;
  const backendOffline = visibleError?.kind === "backend_offline";
  const threadUnavailable = historyIssue?.code === "native_thread_missing";
  const transcriptStale = backendOffline || connection === "reconnecting";
  const historyBusy = selectionChanging || detailLoading || historyState === "loading" || historyState === "slow";

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      const chatId = selectedChatIdRef.current;
      if (chatId && (detailRequestRef.current?.chatId === chatId || historyRequestRef.current?.chatId === chatId)) return;
      void (async () => {
        await checkControlCenterHealth();
        const shellRefresh = Promise.allSettled([refreshRuntime(), refreshThreads()]);
        if (chatId) {
          const nextDetail = await loadThreadDetail(chatId);
          await loadThreadHistory(chatId, nextDetail);
        }
        await shellRefresh;
        if (!cancelled && chatId && connectionRef.current === "reconnecting") setStreamRevision((current) => current + 1);
      })().catch((cause) => {
        if (cancelled) return;
        if (isTransientConnectivityFailure(cause)) {
          if (chatId && selectedChatIdRef.current === chatId) {
            setConnection("reconnecting");
            setStreamRevision((current) => current + 1);
          }
          return;
        }
        setError(failure(cause, "Chat history could not be synchronized.", "history"));
      });
    };
    const onFocus = () => sync();
    const onOnline = () => sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadThreadDetail, loadThreadHistory, refreshRuntime, refreshThreads]);

  const retryNow = useCallback(async () => {
    const restartStream = Boolean(selectedChatIdRef.current && connection !== "ready");
    setRecovering(true);
    setError(null);
    if (restartStream) setConnection("connecting");
    try {
      await checkControlCenterHealth();
      await refreshRuntime();
      const chatId = selectedChatIdRef.current;
      if (chatId) {
        const context = beginNavigation(chatId, "retry");
        const nextDetail = await loadThreadDetail(chatId);
        await loadThreadHistory(chatId, nextDetail, context);
        if (restartStream) setStreamRevision((current) => current + 1);
      } else {
        await refreshThreads();
      }
    } catch (cause) {
      setConnection(selectedChatIdRef.current ? "reconnecting" : "idle");
      setError(failure(cause, "Task Chat could not reconnect.", "history"));
    } finally {
      setRecovering(false);
    }
  }, [beginNavigation, connection, loadThreadDetail, loadThreadHistory, refreshRuntime, refreshThreads]);

  const openNewDraft = useCallback((key: string) => {
    activeNewDraftRef.current = key; setActiveNewDraft(key);
    newChatDraftActiveRef.current = true;
    selectedChatIdRef.current = null;
    selectedByGroupRef.current.my_chats = null;
    setActiveGroup("my_chats");
    setSelectedChatId(null);
    setDetail(null);
    setTurns([]);
    setHistoryState("idle");
    setError(null);
    setDrawerOpen(false);
    window.history.replaceState(null, "", "/task-chat?group=my_chats");
  }, []);

  const startNewDraft = useCallback(() => openNewDraft(`draft_${crypto.randomUUID()}`), [openNewDraft]);

  const startReplacementDraft = useCallback(() => {
    const chatId = selectedChatIdRef.current;
    const pending = chatId ? pendingDeliveriesRef.current[chatId] : null;
    const replacementText = chatId ? draftsByChatRef.current[chatId] || pending?.text || "" : "";
    if (chatId) {
      updateDraftForChat(chatId, "");
      setPendingForChat(chatId, null);
    }
    startNewDraft();
    updateDraftForChat(activeNewDraftRef.current, replacementText);
  }, [setPendingForChat, startNewDraft, updateDraftForChat]);

  const backToThreadList = useCallback(() => {
    selectedByGroupRef.current[activeGroupRef.current] = null;
    setSelectedChatId(null);
    setDetail(null);
    setTurns([]);
    setHistoryState("idle");
    setHistoryIssue(null);
    setError(null);
    setDrawerOpen(true);
    window.history.replaceState(null, "", `/task-chat?group=${activeGroupRef.current}`);
  }, []);

  const continueInTaskChat = useCallback(async () => {
    if (!detail?.thread.taskLinks.length) return;
    const task = detail.thread.taskLinks.at(-1);
    if (!task) return;
    setRecovering(true);
    setError(null);
    try {
      const mode = "shared_thread" as const;
      const key = `${detail.thread.chatId}:${task.taskId}:${mode}`;
      const response = await api<ThreadDetail>(`/api/codex-chat/v1/threads/${encodeURIComponent(detail.thread.chatId)}/task-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ taskId: task.taskId, mode, expectedRevision: detail.revision, topicGeneration: task.subjectScope?.generation }),
      });
      if (selectedChatIdRef.current === response.data.thread.chatId) setDetail(response.data);
      setThreads((rows) => rows.map((row) => row.chatId === response.data.thread.chatId ? response.data.thread : row));
    } catch (cause) {
      setError(failure(cause, "This Voice task cannot be continued safely yet.", "mutation"));
    } finally {
      setRecovering(false);
    }
  }, [detail]);

  function switchGroup(group: ChatGroup) {
    if (group === activeGroup) return;
    selectedByGroupRef.current[activeGroup] = selectedChatId;
    setActiveGroup(group);
    const next = group === "my_chats" && newChatDraftActiveRef.current
      ? null
      : selectedByGroupRef.current[group] || threads.find((thread) => thread.group === group)?.chatId || null;
    if (next) beginNavigation(next, "group_restore");
    setSelectedChatId(next);
    setDetail(null);
    setTurns([]);
    setSearch("");
    const params = new URLSearchParams(window.location.search);
    params.set("group", group);
    if (next) params.set("chat", next); else params.delete("chat");
    window.history.replaceState(null, "", `/task-chat?${params.toString()}`);
  }

  async function deliverMessage(delivery: PendingDelivery) {
    setPendingForChat(delivery.chatId, { ...delivery, status: "sending" });
    setError(null);
    let acceptedByServer = false;
    try {
      await persistDraftsRef.current();
      if (parseBudgetIntent(delivery.text).kind === "delivery_budget") {
        const response = await api<TaskDeliveryView>(`/api/codex-chat/v1/threads/${encodeURIComponent(delivery.chatId)}/delivery/intent`, {
          method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": delivery.clientMessageId },
          body: JSON.stringify({ clientMessageId: delivery.clientMessageId, text: delivery.text, runId: delivery.runId }),
        }, { timeoutMs: TURN_START_TIMEOUT_MS });
        acceptedByServer = true;
        setBudgetNotice({ chatId: delivery.chatId, message: `Бюджет обновлён: ${response.data.budget.maxTokens.toLocaleString()} токенов.` });
        await clearSubmittedDraft(delivery);
        setPendingForChat(delivery.chatId, null);
        return;
      }
      const response = await api<AcceptedTurn>(`/api/codex-chat/v1/threads/${encodeURIComponent(delivery.chatId)}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": delivery.clientMessageId },
        body: JSON.stringify({ clientMessageId: delivery.clientMessageId, input: [{ type: "text", text: delivery.text }], attachments: delivery.attachments, settings: delivery.settings, ...(delivery.mode ? {mode:delivery.mode} : {}),...(delivery.voiceHandoff?{voiceHandoff:delivery.voiceHandoff}:{}) }),
      }, { timeoutMs: TURN_START_TIMEOUT_MS });
      acceptedByServer = true;
      await clearSubmittedDraft(delivery);
      setPendingForChat(delivery.chatId, null);
      if (selectedChatIdRef.current === delivery.chatId) setTurns((rows) => upsertTurn(rows, response.data.turn));
      void refreshThreads();
    } catch (cause) {
      if (acceptedByServer || deliveryMayBeUnknown(cause)) {
        const unknown = { ...delivery, status: "delivery_unknown" as const };
        setPendingForChat(delivery.chatId, unknown);
      } else {
        setPendingForChat(delivery.chatId, null);
        setError(failure(cause, "Message could not be sent.", "turn", delivery.chatId));
      }
    }
  }

  async function deliverNewChatMessage(delivery: PendingNewChatDelivery) {
    setError(null);
    setPendingForDraft(delivery.draftKey, { ...delivery, status: "sending" });
    let acceptedByServer = false;
    try {
      await persistDraftsRef.current();
      const response = await api<CreatedThreadTurn>("/api/codex-chat/v1/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": delivery.clientThreadId },
        body: JSON.stringify({
          clientThreadId: delivery.clientThreadId,
          source: "chat",
          settings: delivery.settings,
          initialTurn: {
            clientMessageId: delivery.clientMessageId,
            input: [{ type: "text", text: delivery.text }],
            attachments: delivery.attachments,
            settings: delivery.settings,
          },
        }),
      }, { timeoutMs: TURN_START_TIMEOUT_MS });
      const { detail: nextDetail, accepted } = response.data;
      acceptedByServer = true;
      const stillSelected = () => selectedChatIdRef.current === null && newChatDraftActiveRef.current && activeNewDraftRef.current === delivery.draftKey && activeGroupRef.current === "my_chats";
      await clearSubmittedDraft(delivery);
      setPendingForDraft(delivery.draftKey, null);
      setThreads((rows) => [nextDetail.thread, ...rows.filter((thread) => thread.chatId !== nextDetail.thread.chatId)]);
      if ((draftsByChatRef.current[delivery.draftKey] || "") || draftAttachments.records.current[delivery.draftKey]?.length) {
        const key = `draft_${crypto.randomUUID()}`;
        updateDraftForChat(key, draftsByChatRef.current[delivery.draftKey] || "");
        updateDraftForChat(delivery.draftKey, "");
        await draftAttachments.move(delivery.draftKey, key);
        if (stillSelected()) { activeNewDraftRef.current = key; setActiveNewDraft(key); }
      } else if (stillSelected()) {
        newChatDraftActiveRef.current = false;
        selectedByGroupRef.current.my_chats = nextDetail.thread.chatId;
        selectedChatIdRef.current = nextDetail.thread.chatId; setSelectedChatId(nextDetail.thread.chatId);
        setDetail(nextDetail); setTurns([accepted.turn]); setDrawerOpen(false);
        window.history.replaceState(null, "", `/task-chat?group=my_chats&chat=${encodeURIComponent(nextDetail.thread.chatId)}`);
      }
      await persistDraftsRef.current();
    } catch (cause) {
      if (acceptedByServer || deliveryMayBeUnknown(cause)) {
        setPendingForDraft(delivery.draftKey, { ...delivery, status: "delivery_unknown" });
      } else {
        setPendingForDraft(delivery.draftKey, null);
        setError(failure(cause, "The new chat was not created because its first message was not accepted.", "turn"));
      }
    }
  }

  async function sendMessage() {
    const text = draft;
    if ((!text.trim() && !currentAttachments.length) || !draftStoreReady || !draftAttachments.ready || attachmentsBusy || hasActiveTurn || (selectedChatId ? pendingDeliveriesRef.current[selectedChatId] : pendingNewDeliveriesRef.current[draftKey])) return;
    const submitted = { draftKey, revision: revisionsRef.current[draftKey] || 0, attachments: currentAttachments.map(file => file.id),
      ...(!selectedChatId && runtime?.selected.modelId ? { settings: { modelId: runtime.selected.modelId, ...(runtime.selected.effortId ? { effortId: runtime.selected.effortId } : {}) } } : {}) };
    const chatId = selectedChatId;
    const intent = parseBudgetIntent(text);
    if (intent.kind === "clarification" || (intent.kind === "delivery_budget" && !chatId)) {
      setError({ message: intent.kind === "clarification" ? intent.message : "Выберите существующую задачу и её сборку для изменения бюджета.", source: "turn", kind: "turn_failed", chatId });
      return;
    }
    if (!chatId) {
      newChatDraftActiveRef.current = true;
      await deliverNewChatMessage({
        ...submitted,
        clientThreadId: draftKey,
        clientMessageId: crypto.randomUUID(),
        text,
        status: "sending",
      });
      return;
    }
    const delivery: PendingDelivery = {
      ...submitted,
      ...(voiceQueue ? {mode:"after_completion" as const} : {}),
      ...(voiceQueue ? {voiceHandoff:voiceQueue} : {}),
      chatId,
      clientMessageId: crypto.randomUUID(),
      text,
      status: "sending",
    };
    setPendingForChat(chatId, delivery);
    await deliverMessage(delivery);
  }

  async function retryUnknownDelivery() {
    const chatId = selectedChatIdRef.current;
    if (!chatId) {
      const delivery = pendingNewChatDelivery;
      if (!delivery || delivery.status !== "delivery_unknown" || sending) return;
      setRecovering(true);
      try {
        await checkControlCenterHealth();
        await refreshRuntime();
        await deliverNewChatMessage(delivery);
      } catch (cause) {
        setError(failure(cause, "First-message delivery could not be reconciled.", "turn"));
      } finally {
        setRecovering(false);
      }
      return;
    }
    const delivery = chatId ? pendingDeliveriesRef.current[chatId] : null;
    if (!delivery || delivery.status !== "delivery_unknown" || sending) return;
    setRecovering(true);
    try {
      await checkControlCenterHealth();
      await refreshRuntime();
      const nextDetail = await loadThreadDetail(delivery.chatId);
      await loadThreadHistory(delivery.chatId, nextDetail);
      const unresolved = pendingDeliveriesRef.current[delivery.chatId];
      if (!unresolved || unresolved.clientMessageId !== delivery.clientMessageId) return;
      await deliverMessage(delivery);
    } catch (cause) {
      setError(failure(cause, "Delivery could not be reconciled.", "turn", delivery.chatId));
    } finally {
      setRecovering(false);
    }
  }

  async function cancelQueuedMessage(turn: TurnView, edit = false) {
    const chatId = selectedChatIdRef.current;
    if (!chatId || !turn.executionIntent?.queueRevision) return;
    const revision = revisionsRef.current[chatId] || 0;
    try {
      const requestId = crypto.randomUUID();
      const response = await api<{turn:TurnView;originalText:string}>(`/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/turns/${encodeURIComponent(turn.turnId)}/queue`, {
        method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":requestId},
        body:JSON.stringify({requestId,expectedRevision:turn.executionIntent.queueRevision,action:"cancel"}),
      });
      if (selectedChatIdRef.current === chatId) setTurns(rows=>upsertTurn(rows,response.data.turn));
      if (edit) {
        const untouched = (revisionsRef.current[chatId] || 0) === revision && !draftsByChatRef.current[chatId] && !draftAttachments.records.current[chatId]?.length;
        const target = untouched ? chatId : `draft_${crypto.randomUUID()}`;
        updateDraftForChat(target,response.data.originalText);
        await draftAttachments.restoreReferences(target,response.data.turn.userMessage.attachments || []);
        await persistDraftsRef.current();
      }
      void refreshThreads();
    } catch (cause) { setError(failure(cause,"The queue changed. Refresh the message before editing or cancelling it.","turn",chatId)); }
  }

  async function interruptActiveTurn() {
    const expectedTurnId = displayedDetail?.activeTurnId;
    if (!selectedChatId || !expectedTurnId) return;
    setError(null);
    try {
      const response = await api<ThreadDetail>(`/api/codex-chat/v1/threads/${encodeURIComponent(selectedChatId)}/interrupt`, {
        method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({expectedTurnId}),
      });
      setDetail(response.data);
      await reconcileChat(selectedChatId);
    } catch (cause) {
      setError(failure(cause, "The active Codex CLI process could not be interrupted.", "turn"));
    }
  }

  function clearArchiveSelection() {
    selectedByGroupRef.current[activeGroupRef.current] = null;
    selectedChatIdRef.current = null;
    detailRequestRef.current?.controller.abort();
    historyRequestRef.current?.controller.abort();
    setSelectedChatId(null); setDetail(null); setTurns([]); setHistoryState("idle");
    setError(null);
    window.history.replaceState(null, "", `/task-chat?group=${activeGroupRef.current}`);
  }

  function changeArchiveView() {
    listRequestVersion.current++;
    archiveViewRef.current = !showArchived;
    newChatDraftActiveRef.current = false;
    selectedByGroupRef.current = { my_chats: null, voice_work: null };
    clearArchiveSelection();
    setThreads([]); setNextCursorByGroup({ my_chats: null, voice_work: null });
    setListError(null); setListPageLoading(false); setListLoading(true);
    setShowArchived(!showArchived);
  }

  async function changeChatMetadata(action: "archive" | "unarchive" | "restore-access") {
    const current = detail, chatId = selectedChatIdRef.current;
    if (!current || !chatId || current.thread.chatId !== chatId || metadataBusy) return;
    setMetadataBusy(true);
    const requestId = crypto.randomUUID();
    try {
      const result = await api<ThreadDetail>(`/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
        body: JSON.stringify({ requestId, expectedRevision: current.revision, proofHash: current.history?.proofHash }),
      });
      if (action === "restore-access") {
        if (selectedChatIdRef.current === chatId) { setDetail(result.data); await reconcileChat(chatId); }
      } else {
        listRequestVersion.current++;
        if (selectedChatIdRef.current === chatId) clearArchiveSelection();
        setThreads(rows => rows.filter(row => row.chatId !== chatId));
      }
      await refreshThreads();
    } catch (cause) { if (selectedChatIdRef.current === chatId) setError(failure(cause, "Chat metadata could not be updated.", "mutation", chatId)); }
    finally { setMetadataBusy(false); }
  }

  async function recoverFailedTurn(turn: TurnView, action: TurnRecoveryAction) {
    if (!selectedChatId || !turnNeedsRecovery(turn) || turnRecovery) return;
    const chatId = selectedChatId;
    setTurnRecovery({ turnId: turn.turnId, action });
    setError(null);
    const recoveryId = crypto.randomUUID();
    try {
      const response = await api<TurnRecoveryResult>(
        `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/turns/${encodeURIComponent(turn.turnId)}/recovery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": recoveryId },
          body: JSON.stringify({ recoveryId, action, expectedAttemptId:turn.executionIntent?.attemptId || null }),
        },
      );
      if (selectedChatIdRef.current === chatId) {
        setDetail(response.data.detail);
        await reconcileChat(chatId);
      }
      void refreshThreads();
    } catch (cause) {
      await reconcileChat(chatId).catch(() => undefined);
      if (selectedChatIdRef.current === chatId) setError({ ...failure(
        cause,
        "The recovery decision could not be confirmed. History was refreshed; no action is replayed automatically.",
        "turn",
        chatId,
      ), turnId: turn.turnId });
    } finally {
      setTurnRecovery(null);
    }
  }

  function toggleDictation() {
    if (recognitionRef.current && dictation === "listening") {
      recognitionRef.current.stop();
      return;
    }
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setDictation("error");
      return;
    }
    const recognition = new SpeechRecognition();
    const languageTag = recognitionLanguageTag(dictationLanguage);
    if (languageTag) recognition.lang = languageTag;
    recognition.continuous = false;
    recognition.interimResults = false;
    const dictationDraftKey = selectedChatIdRef.current || activeNewDraftRef.current;
    recognition.onresult = (event) => {
      const recognized: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) recognized.push(event.results[index][0].transcript);
      }
      const text = recognized.join(" ").trim();
      if (text) updateDraftForChat(dictationDraftKey, (current) => `${current}${current.trim() ? " " : ""}${text}`);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setDictation("idle");
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setDictation("error");
    };
    recognitionRef.current = recognition;
    setDictation("listening");
    recognition.start();
  }

  function changeDictationLanguage(value: string) {
    const option = DICTATION_LANGUAGE_OPTIONS.find((candidate) => candidate.value === value);
    if (!option) return;
    setDictationLanguage(option.value);
    writeStoredDictationLanguage(option.value);
  }

  const history = (
    <div className="codex-history-content">
      <div className="codex-history-title-row">
        <h2>Task Chat</h2>
        <button type="button" className="codex-icon-button codex-drawer-close" aria-label="Close chat history" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
      </div>
      <div className="codex-history-tabs" role="tablist" aria-label="Task Chat sources">
        <button type="button" role="tab" aria-selected={activeGroup === "my_chats"} className={activeGroup === "my_chats" ? "active" : ""} onClick={() => switchGroup("my_chats")}>Direct Chats{backgroundCounts.my_chats?.attention ? ` · ${backgroundCounts.my_chats.attention} need attention` : backgroundCounts.my_chats?.working ? ` · ${backgroundCounts.my_chats.working} working` : ''}</button>
        <button type="button" role="tab" aria-selected={activeGroup === "voice_work"} className={activeGroup === "voice_work" ? "active" : ""} onClick={() => switchGroup("voice_work")}>Voice Tasks{backgroundCounts.voice_work?.attention ? ` · ${backgroundCounts.voice_work.attention} need attention` : backgroundCounts.voice_work?.working ? ` · ${backgroundCounts.voice_work.working} working` : ''}</button>
      </div>
      {activeGroup === "my_chats" ? <button className="codex-new-chat" type="button" onClick={startNewDraft} disabled={!draftStoreReady}>
        <Plus size={17} /> New chat
      </button> : null}
      <button type="button" className="codex-text-action codex-archive-toggle" onClick={changeArchiveView} disabled={metadataBusy}>{showArchived ? "Show active" : "Show archived"}</button>
      {activeGroup === "my_chats" ? <nav className="codex-drafts" aria-label="New chat drafts">{Array.from(new Set([...Object.keys(draftsByChat), ...Object.keys(pendingNewDeliveries), ...Object.keys(draftAttachments.byDraft)])).filter(key => key.startsWith("draft_")).map(key => <button type="button" key={key} aria-current={!selectedChatId && key === activeNewDraft ? "page" : undefined} onClick={() => openNewDraft(key)}>
        <span>{(draftsByChat[key] || draftAttachments.byDraft[key]?.[0]?.name || "New draft").slice(0,60)}</span><small>{pendingNewDeliveries[key]?.status === "sending" ? "Sending…" : pendingNewDeliveries[key] ? "Check delivery" : "Draft"}</small>
      </button>)}</nav> : null}
      <label className="codex-search">
        <Search size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeGroup === "voice_work" ? "Search Voice tasks…" : "Search chats…"} aria-label="Search Task Chat" />
      </label>
      <section className="codex-thread-group">
        {listLoading && visibleThreads.length === 0 ? <div className="codex-list-loading"><LoaderCircle className="spin" size={20} /><span>Loading {activeGroup === "voice_work" ? "Voice tasks" : "chats"}…</span></div> : null}
        {visibleThreads.length ? visibleThreads.map((thread) => (
          <ThreadRow key={thread.chatId} thread={thread} active={thread.chatId === selectedChatId} onArchive={() => void changeChatMetadata(thread.archived ? "unarchive" : "archive")} busy={metadataBusy || displayedDetail?.thread.chatId !== thread.chatId || displayedDetail?.revision == null} onSelect={() => {
            if (thread.chatId !== selectedChatId) {
              if (thread.group === "my_chats") newChatDraftActiveRef.current = false;
              beginNavigation(thread.chatId, "history_row", { selected: true });
              setSelectedChatId(thread.chatId);
              selectedByGroupRef.current[activeGroup] = thread.chatId;
              const params = new URLSearchParams({ group: activeGroup, chat: thread.chatId });
              window.history.replaceState(null, "", `/task-chat?${params.toString()}`);
            }
            setDrawerOpen(false);
          }} />
        )) : !listLoading && !(activeGroup === "voice_work" && voiceSync?.state === "refreshing") ? <p className="codex-history-empty">{debouncedSearch ? "No matching items" : showArchived ? "No archived chats." : activeGroup === "voice_work" ? "Persistent Voice task threads will appear here after their work environment is resolved." : "Create a chat to start working with Pritha."}</p> : null}
        {listError ? <div className="codex-list-error"><span>{listError}</span><button type="button" onClick={() => void refreshThreads()}>Retry</button></div> : null}
        {nextCursorByGroup[activeGroup] ? <button className="codex-load-more" type="button" onClick={() => void loadMoreThreads()} disabled={listPageLoading}>{listPageLoading ? "Loading…" : "Load more"}</button> : null}
        <div ref={listSentinelRef} aria-hidden="true" />
      </section>
      {activeGroup === "voice_work" && voiceSync?.state !== "ready" ? (
        <p className={`codex-index-state ${voiceSync?.state || "refreshing"}`}>{voiceSync?.state === "degraded" ? "Voice index update failed; showing saved persistent tasks." : "Updating Voice tasks…"}</p>
      ) : null}
    </div>
  );

  return (
    <div className="codex-page">
      <aside className="codex-history" aria-label="Task Chat history">{history}</aside>
      {drawerOpen ? <div className="codex-history-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDrawerOpen(false)}><aside className="codex-history-drawer" aria-label="Task Chat history drawer">{history}</aside></div> : null}

      <section className="codex-conversation" aria-label="Task Chat conversation">
        <header className="codex-conversation-header">
          <button className="codex-icon-button codex-history-open" type="button" aria-label="Open chat history" onClick={() => setDrawerOpen(true)}><Menu size={19} /></button>
          <div className="codex-conversation-heading">
            <div className="codex-title-line">
              <h1>{displayedThread?.title || (selectedChatId ? "Opening thread…" : "Task Chat")}</h1>
              <span className={`codex-runtime-pill ${backendOffline || threadUnavailable ? "unavailable" : runtime?.availability || "unavailable"}`}>{threadUnavailable ? "Thread unavailable" : backendOffline ? "Offline" : runtime?.availability === "ready" ? "Ready" : runtime?.availability || "Checking"}</span>
            </div>
            <p>
              Pritha · {displayedThread?.runtime.model || runtime?.selected.modelId || "NeuralDeep"} · {effectiveProvider?.locationLabel || "Resolving runtime"}
              {effectiveProvider?.protocol === "exec_resume" ? " · exec/resume" : ""}
              {runtime?.selected.sandboxMode ? ` · ${runtime.selected.sandboxMode.replaceAll("_", " ")}` : ""}
            </p>
          </div>
          <span className={`codex-connection ${connection}`} title={`Event stream: ${connection}`}><span /></span>
        </header>

        {runtime?.availability !== "ready" || runtime.providerState !== "available" ? (
          <div className="codex-runtime-warning"><AlertTriangle size={17} /><span>{runtime?.availability !== "ready" ? "The isolated NeuralDeep CLI runtime is unavailable." : runtime.providerState === "auth_required" ? "NeuralDeep rejected the configured key. Replace it in Settings." : runtime.providerState === "billing_required" ? "NeuralDeep requires a compatible tariff, wallet mode, or sufficient balance." : runtime.providerState === "access_denied" ? "NeuralDeep denied the current account request. Review model access in Settings." : runtime.providerState === "rate_limited" ? "NeuralDeep is rate limited. Queued work will wait without switching provider or model." : "NeuralDeep is temporarily unavailable. New unstarted turns will wait without switching provider or model."}</span></div>
        ) : null}
        {displayedDetail?.history?.restoreAvailable && !displayedDetail.thread.archived ? <div className="codex-inline-notice info">
          <span>Earlier history is available for this chat.</span>
          <button type="button" className="codex-text-action" disabled={metadataBusy} onClick={() => void changeChatMetadata("restore-access")}>Restore access</button>
        </div> : null}
        {connection === "reconnecting" && !backendOffline ? (
          <div className="codex-runtime-warning"><LoaderCircle className="spin" size={17} /><span>Event stream is reconnecting. The last synchronized history remains visible and read-only.</span></div>
        ) : null}
        {visibleError ? (
          <div className="codex-error-banner">
            <AlertTriangle size={17} />
            <span>{visibleError.message}</span>
            <div className="codex-error-actions">
              {visibleError.retryable !== false && pendingDelivery?.status !== "delivery_unknown" ? <button type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry"}</button> : null}
              <button type="button" onClick={() => setError(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}

        <div ref={transcriptRef} className={`codex-transcript ${transcriptStale ? "stale" : ""}`} role="log" aria-live="polite" aria-label="Task Chat messages" aria-busy={historyBusy || connection === "connecting"}>
          <div ref={transcriptContentRef} className="codex-transcript-content">
          {loading && !selectedChatId ? <div className="codex-empty-state"><LoaderCircle className="spin" size={28} /><h2>Loading Task Chat</h2></div> : null}
          {!loading && !selectedChatId ? (
            <div className="codex-empty-state">
              <Bot size={34} />
              <h2>{activeGroup === "voice_work" ? "Voice task threads" : "Work directly with Pritha"}</h2>
              <p>Start a persistent conversation with the runtime selected in Settings.</p>
              {activeGroup === "my_chats" ? <button className="codex-new-chat codex-empty-action" type="button" onClick={startNewDraft} disabled={!draftStoreReady}><Plus size={17} /> New chat</button> : null}
            </div>
          ) : null}
          {selectedChatId && displayedTurns.length === 0 && historyBusy ? (
            <div className="codex-empty-state compact codex-history-loading">
              <LoaderCircle className="spin" size={28} />
              <h2>{historyState === "slow" ? "Still loading history…" : detailLoading ? "Opening thread…" : "Loading conversation history…"}</h2>
              <p>{historyState === "slow" ? "This is taking longer than expected. You can retry without leaving the selected thread." : "The selected thread is ready; messages are loading separately."}</p>
              {historyState === "slow" ? <button className="outline-button compact" type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry now"}</button> : null}
            </div>
          ) : null}
          {selectedChatId && displayedTurns.length === 0 && historyState === "error" ? (
            <div className="codex-empty-state compact codex-history-failed">
              <AlertTriangle size={28} />
              <h2>History did not load</h2>
              <p>{historyError || "Retry without leaving the selected thread."}</p>
              <div className="codex-empty-actions">
                {historyIssue?.retryable !== false ? <button className="outline-button compact" type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry history"}</button> : null}
                {historyIssue?.replacementAllowed ? <button className="primary-action-button compact" type="button" onClick={startReplacementDraft}>Start replacement draft</button> : null}
                {historyIssue?.retryable === false && !historyIssue.replacementAllowed ? <button className="outline-button compact" type="button" onClick={backToThreadList}>Back to list</button> : null}
              </div>
            </div>
          ) : null}
          {selectedChatId && displayedTurns.length === 0 && historyState === "ready" ? (
            <div className="codex-empty-state compact"><Bot size={30} /><h2>{activeGroup === "voice_work" ? "Voice task thread" : "What should Pritha do?"}</h2><p>Messages and activity remain attached to this native task thread.</p></div>
          ) : null}
          {selectedChatId && displayedTurns.length > 0 && historyState === "error" ? (
            <div className="codex-inline-notice warning codex-history-refresh-error">
              <span>{historyError || "History refresh failed. The last loaded messages remain visible."}</span>
              {historyIssue?.retryable !== false ? <button type="button" onClick={() => void retryNow()} disabled={recovering}>{recovering ? "Retrying…" : "Retry history"}</button> : null}
            </div>
          ) : null}
          {historyCompleteness === "legacy-gaps-possible" ? <p className="codex-inline-notice info">Earlier versions may have saved only part of this history. Available originals are preserved.</p> : null}
          {displayedThread?.workspace?.applicationRequired ? <div className="codex-inline-notice info"><span>Changes in this workspace await review and application to the source project.</span><code>{displayedThread.workspace.path}</code>{displayedThread.workspace.sourceDirty ? <span>The source had uncommitted changes when this workspace was created; review them before applying the result.</span> : null}</div> : null}
          {selectedChatId && historyPage ? <div className="codex-history-navigation">
            {historyPage.olderCursor ? <button type="button" className="codex-text-action" disabled={olderHistoryLoading} onClick={() => void loadOlderHistory()}>{olderHistoryLoading ? "Loading…" : "Older messages"}</button> : null}
            <button type="button" className="codex-text-action" onClick={() => { browsingOlderRef.current = false; followLatest(); void retryNow(); }}>Latest messages</button>
          </div> : null}
          {displayedTurns.map((turn) => (
            <section className="codex-turn" key={turn.turnId} aria-label={`Turn ${turn.status}`}>
              {turn.history && selectedChatId ? <HistoryTurn chatId={selectedChatId} turn={turn} /> : <>
                <article className="codex-message codex-user-message" data-scroll-anchor={`${turn.turnId}:user`}><div className="codex-message-label">You</div><CodexMarkdown markdown={turn.userMessage.markdown} /><ChatAttachments files={turn.userMessage.attachments} /></article>
                {turn.items.filter(item => item.kind === "assistant_message" && item.message.phase !== "commentary").map(item => <div key={item.id} data-scroll-anchor={`${turn.turnId}:${item.id}`}><ActivityItem item={item} /></div>)}
                <ActivityFeed status={turn.status} items={turn.items.filter(shouldRenderActivityItem).filter(item => item.kind !== "assistant_message" || item.message.phase === "commentary")} renderItem={item => <ActivityAction item={item} />} />
                <CopyResponse turn={turn} />
              </>}
              <div className="codex-turn-items">
                {!turn.taskId && turn.executionIntent?.dispatchState === "accepted" && ["queued","waiting_for_provider"].includes(turn.status) ? <div className="codex-turn-recovery-actions" aria-label="Queued message actions">
                  <button type="button" onClick={()=>void cancelQueuedMessage(turn)}>Cancel queued message</button>
                  <button type="button" onClick={()=>void cancelQueuedMessage(turn,true)} disabled={Boolean(draft || currentAttachments.length)}>Edit queued message</button>
                </div> : null}
                {turn.error ? (
                  <div className="codex-inline-notice error codex-turn-recovery">
                    <span>{turn.error.message}</span>
                    {["neuraldeep_billing_required", "neuraldeep_access_denied"].includes(turn.error.code) ? (
                      <div className="codex-turn-recovery-actions" aria-label="NeuralDeep account actions">
                        <a href="https://neuraldeep.ru/app/spend" target="_blank" rel="noreferrer">Expenses</a>
                        <a href="https://neuraldeep.ru/app/billing" target="_blank" rel="noreferrer">Plan &amp; payment</a>
                      </div>
                    ) : null}
                    {turnNeedsRecovery(turn) && !turn.taskId ? (
                      <div className="codex-turn-recovery-actions" aria-label="Turn recovery actions">
                        {turn.error.code === "admission_runtime_exit_unconfirmed" || (visibleError?.turnId === turn.turnId && visibleError.code === "admission_runtime_exit_unconfirmed") ? <>
                          <span role="status">{visibleError?.turnId === turn.turnId ? visibleError.message : "Check that the previous run has stopped before continuing. This check does not send a new request to the model."}</span>
                          <button type="button" onClick={() => void recoverFailedTurn(turn, "reconcile")} disabled={Boolean(turnRecovery)}>{turnRecovery?.turnId === turn.turnId ? "Checking…" : "Check recovery"}</button>
                        </> : <>
                        <button type="button" onClick={() => void recoverFailedTurn(turn, "resume")} disabled={Boolean(turnRecovery)}>{turnRecovery?.turnId === turn.turnId && turnRecovery.action === "resume" ? "Resuming…" : "Resume"}</button>
                        <button type="button" onClick={() => void recoverFailedTurn(turn, "retry")} disabled={Boolean(turnRecovery)}>{turnRecovery?.turnId === turn.turnId && turnRecovery.action === "retry" ? "Retrying…" : "Retry"}</button>
                        <button type="button" onClick={() => void recoverFailedTurn(turn, "cancel")} disabled={Boolean(turnRecovery)}>{turnRecovery?.turnId === turn.turnId && turnRecovery.action === "cancel" ? "Cancelling…" : "Cancel"}</button>
                        </>}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ))}
          </div>
        </div>

        <div className="codex-composer-wrap">
          {displayedDetail?.thread.origin === "voice" && operatorTaskForLinks(displayedDetail.thread.taskLinks) ?
            <VoiceOperatorCard key={operatorTaskForLinks(displayedDetail.thread.taskLinks)} taskId={operatorTaskForLinks(displayedDetail.thread.taskLinks)!} onChanged={()=>void refreshThreads()} /> : null}
          {budgetNotice?.chatId === selectedChatId ? <div className="codex-inline-notice info" role="status"><span>{budgetNotice.message}</span><button type="button" onClick={() => setBudgetNotice(null)}>Dismiss</button></div> : null}
          {draftStorageError || draftAttachments.error ? <div className="codex-inline-notice warning" role="alert">{draftStorageError || draftAttachments.error}</div> : null}
          {pendingDelivery?.status === "delivery_unknown" ? (
            <div className="codex-inline-notice warning codex-delivery-unknown">
              {pendingNewChatDelivery
                ? "First-message delivery is unknown. The same idempotent create request will be reconciled before anything new is sent."
                : "Delivery is unknown. History will be checked first; Task Chat will never replay this turn automatically."}
              <button type="button" onClick={() => void retryUnknownDelivery()} disabled={recovering || sending}>
                {recovering ? "Checking…" : "Check and retry same message"}
              </button>
            </div>
          ) : null}
          {selectedChatId && !displayedDetail ? (
            <div className="codex-composer-status"><LoaderCircle className="spin" size={17} /><span>Opening thread controls…</span></div>
          ) : displayedDetail?.thread.archived ? (
            <div className="codex-continuation-gate"><p>This chat is archived. Use Restore from archive in the history list to continue.</p></div>
          ) : displayedDetail?.thread.origin === "voice" && displayedDetail.continuationState !== "continuation_enabled" && !voiceQueue ? (
            <div className="codex-continuation-gate">
              <div><strong>{displayedDetail.continuationState === "blocked_active_turn" ? "Voice task is running" : "Voice task history is read-only"}</strong><p>{displayedDetail.continuationState === "blocked_active_turn" ? "Wait for the active Voice turn to finish before continuing here." : "Enable continuation only when you want to add a typed turn to this same task thread."}</p></div>
              <button className="codex-new-chat" type="button" onClick={() => void continueInTaskChat()} disabled={recovering || historyState !== "ready" || displayedDetail.continuationState !== "read_only"}>{recovering ? "Checking…" : historyBusy ? "Loading history…" : "Continue in Task Chat"}</button>
            </div>
          ) : <div className="codex-composer" role="group" aria-label="Message Pritha"
            onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
            onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); void draftAttachments.add(draftKey, Array.from(event.dataTransfer.files)); } }}>
            {voiceQueue?<small role="note">The message will wait for the Voice workflow to finish. Answer its questions using the task card; this message does not answer or approve them.</small>:null}
            <div className="codex-composer-input">
              <textarea
                aria-describedby="codex-working-status"
                aria-label="Message Pritha"
                value={draft}
                onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void draftAttachments.add(draftKey,files); } }}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={workingLabel ? "" : pendingDelivery?.status === "delivery_unknown"
                  ? "Delivery confirmation is pending…"
                  : selectedChatId && historyState === "error"
                    ? "Retry history before sending…"
                    : selectedChatId && historyState !== "ready"
                      ? "Loading history…"
                      : hasActiveTurn ? "Message to send after completion…" : "Ask Pritha…"}
                rows={3}
                maxLength={64_000}
                disabled={!draftStoreReady || Boolean(selectedChatId && historyState !== "ready")}
              />
              <WorkingIndicator label={workingLabel} concealed={Boolean(draft)} />
            </div>
            <ul className="codex-draft-attachments" aria-label="Draft attachments">{currentAttachments.map(file => <li key={file.id}>
              {file.view?.kind === "image" ? <img src={`/api/codex-chat/v1/attachments/${encodeURIComponent(file.id)}`} alt={file.name} referrerPolicy="no-referrer" /> : null}
              <span>{file.name}<small>{file.size.toLocaleString()} bytes · {file.status === "ready" ? "Original uploaded" : file.status === "uploading" ? "Uploading…" : file.error}</small></span>
              {file.status === "error" ? <button type="button" onClick={() => void draftAttachments.retry(draftKey,file.id)}>Retry upload</button> : null}
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => void draftAttachments.remove(draftKey,file.id)}><X size={15}/></button>
            </li>)}</ul>
            {currentAttachments.length ? <AttachmentCapabilityNotice model={displayedDetail?.thread.runtime.model || runtime?.selected.modelId || null} resume={Boolean(displayedDetail?.thread.runtime.sessionId)} /> : null}
            <div className="codex-composer-actions">
              <small>
                {dictationSupported
                  ? "Enter to send · Dictation stays editable · browser speech may use an online service"
                  : "Enter to send · Browser dictation unavailable; use system dictation"}
              </small>
              <div className="codex-composer-controls">
                <label className="codex-file-picker"><Plus size={16}/><span>Attach files</span><input type="file" multiple aria-label="Attach original files" disabled={!draftAttachments.ready} onChange={event => { const files = Array.from(event.target.files || []); event.currentTarget.value = ""; if (files.length) void draftAttachments.add(draftKey,files); }}/></label>
                <label
                  className="codex-dictation-language"
                  title="Auto uses the browser default. Choose one language when recognition guesses incorrectly."
                >
                  <Globe2 size={15} aria-hidden="true" />
                  <select
                    aria-label="Dictation language"
                    value={dictationLanguage}
                    onChange={(event) => changeDictationLanguage(event.target.value)}
                    disabled={!dictationSupported || dictation === "listening"}
                  >
                    {DICTATION_LANGUAGE_OPTIONS.map((option) => (
                      <option value={option.value} title={option.description} key={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  className={`codex-dictation ${dictation === "listening" ? "active" : ""}`}
                  type="button"
                  onClick={toggleDictation}
                  disabled={!dictationSupported}
                  aria-pressed={dictation === "listening"}
                  title={dictationSupported
                    ? "Dictate into the message. Audio processing is controlled by the browser and may use an online service."
                    : "This browser does not expose speech recognition. Use system dictation instead."}
                >
                  <Mic size={16} /> {!dictationSupported ? "Unavailable" : dictation === "listening" ? "Listening" : dictation === "error" ? "Try again" : "Dictate"}
                </button>
                {displayedDetail?.activeTurnId && !displayedTurns.some(turn=>turn.turnId===displayedDetail.activeTurnId && turn.taskId) ? (
                  <button className="outline-button" type="button" onClick={() => void interruptActiveTurn()} title="Interrupt the active NeuralDeep CLI process">
                    <Square size={15} /> Stop
                  </button>
                ) : null}
                <button className="codex-send" type="button" onClick={() => void sendMessage()} disabled={(!draft.trim() && !currentAttachments.length) || attachmentsBusy || !draftStoreReady || !draftAttachments.ready || sending || hasActiveTurn || Boolean(pendingDelivery) || Boolean(selectedChatId && historyState !== "ready") || backendOffline || runtime?.availability !== "ready"}>
                  {sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} {voiceQueue ? "Send after Voice" : "Send"}
                </button>
              </div>
            </div>
          </div>}
        </div>
      </section>
    </div>
  );
}
