"use client";
import { searchIntent } from "../../../../../scripts/search/intent.mjs";

import { VOICE_SETTINGS_CHANGED_EVENT } from "@/lib/voice/settings";
import type { VoiceOperatorRequestView } from "@/lib/codex-chat/voice-operator-context";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { readStickyContextSetting, STICKY_CONTEXT_CHANGED_EVENT, STICKY_CONTEXT_STORAGE_KEY } from "./voicePreferences";
import { NeuralDeepVoiceTransport, type VoiceEventChannel, type VoiceCaptureStats } from "./NeuralDeepVoiceTransport";
import { chainedInputGain } from "../../../../../scripts/neuraldeep/voice-audio.mjs";
import { useVoiceMusicController } from "./useVoiceMusic";

export type RealtimePhase = "idle" | "connecting" | "listening" | "speaking" | "working" | "error";

export type VoiceTranscriptItem = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  timestamp: string;
};

export type VoiceSessionEvent = {
  id: string;
  kind: "user" | "assistant" | "tool" | "task" | "system";
  text: string;
  timestamp: string;
  taskId?: string;
  status?: string;
};

export type CodexTaskApproval = {
  status?: "pending" | "approved" | "rejected" | string;
  action_type?: string;
  summary?: string;
  reasons?: string[];
  requested_at?: string;
  decided_at?: string;
  decided_by?: string;
};

export type CodexTaskVoiceFeedback = {
  timestamp?: string;
  task_id?: string;
  phase?: string;
  priority?: "low" | "normal" | "high" | string;
  speakable?: boolean;
  voice_text?: string;
  requires_response?: boolean;
  step_id?: string;
  step_title?: string;
};

export type CodexTaskThreadScope = {
  kind?: string;
  id?: string;
  label?: string;
  source?: string;
  generation?: number;
};

export type CodexTaskState = {
  id: string;
  admissionAttemptId?: string;
  operatorRequest?: VoiceOperatorRequestView | null;
  shortId?: string;
  title: string;
  status: string;
  summary: string;
  progress: number;
  progressDetail?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  phase?: string;
  lastActivityAt?: string;
  lastActivity?: string;
  stale?: boolean;
  operatorBrief?: string;
  voiceHandoffRequired?: boolean;
  resultPath?: string;
  statusPath?: string;
  resultExcerpt?: string;
  handoffStatus?: "pending" | "sent" | "skipped";
  handoffReason?: string;
  approval?: CodexTaskApproval | null;
  latestVoiceFeedback?: CodexTaskVoiceFeedback | null;
  threadScope?: CodexTaskThreadScope | null;
  threadRoutingMode?: string;
  parentTaskId?: string;
  parentShortId?: string;
  continuation?: Record<string, unknown> | null;
};

export type SessionMemoryPromotionState = {
  status: "idle" | "checking" | "saved" | "skipped" | "failed";
  decision?: string;
  reason?: string;
  path?: string;
  eventCount?: number;
  error?: string;
};

export type GoodStateSignalState = {
  id: string;
  status: "voice_confirmed_alignment_signal" | "pending_baseline_review" | string;
  source?: string;
  created_at: string;
  scope: string;
  operator_signal_preview: string;
  reasons?: string[];
  confidence?: string;
  git?: {
    branch?: string;
    head?: string;
    dirty_tracked_count?: number;
    untracked_count?: number;
  };
  alignment?: {
    status?: string;
    baselines?: Array<{
      path?: string;
      title?: string;
      tag?: string;
      relevance?: string;
      match_score?: number;
    }>;
  };
  paths?: {
    record?: string;
  };
  finalization?: {
    codex_task_required?: boolean;
    ui_approval_required?: boolean;
    voice_confirmation_sufficient?: boolean;
    tracked_git_baseline?: string;
    next_action?: string;
  };
};

export type MicGainRuntimeState = {
  available: boolean;
  active: boolean;
  fallbackReason?: string;
  audioContextState?: string;
  capture?: VoiceCaptureStats;
};

export type PrithaRealtimeStatus = {
  ok: boolean;
  model: string;
  voice: string;
  voice_behavior_profile?: string;
  transcription_model: string;
  tools: string[];
  openai_key_configured: boolean;
  voice_transport?: "openai_realtime" | "neuraldeep_chained";
  voice_key_configured?: boolean;
  memory: {
    available?:boolean;
    state?:'ready'|'missing'|'busy'|'unavailable';
    sqlite: boolean;
    sqlite_cli: boolean;
    stats: unknown[];
  };
  codex: {
    mode: string;
    available: boolean;
    detail: string;
    write_enabled: boolean;
  };
  private_root: string;
};

type SessionErrorPayload = {
  error?: string;
  code?: string;
};

type RealtimeSessionPayload = {
  client_secret: { value: string };
  model: string;
  voice: string;
  tools: string[];
};

type RealtimeCallResponse = {
  answerSdp: string;
};

type RealtimeFunctionCallItem = {
  id?: string;
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  text?: string;
  item?: RealtimeFunctionCallItem;
  response?: {
    output?: RealtimeFunctionCallItem[];
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type CodexTaskSnapshot = {
  ok: boolean;
  admission_attempt_id?: string;
  operator_request?: VoiceOperatorRequestView | null;
  task_id?: string;
  short_id?: string;
  status?: string;
  complete?: boolean;
  phase?: string;
  elapsed_ms?: number;
  last_activity_at?: string;
  last_activity?: string;
  stale?: boolean;
  operator_brief?: string;
  voice_handoff_required?: boolean;
  latest_voice_feedback?: CodexTaskVoiceFeedback | null;
  speakable_events?: CodexTaskVoiceFeedback[];
  result_available?: boolean;
  result_excerpt?: string;
  progress_percent?: number;
  progress_detail?: {
    source?: string;
    total_steps?: number;
    completed_steps?: number;
    active_step_id?: string;
    active_step_title?: string;
    blocked_step_id?: string;
    stale?: boolean;
  };
  approval?: CodexTaskApproval | null;
  thread_scope?: CodexTaskThreadScope | null;
  parent_task_id?: string;
  parent_short_id?: string;
  continuation?: Record<string, unknown> | null;
  codex_app_thread_routing_mode?: string;
  request?: {
    created_at?: string;
    task?: string;
    task_type?: string;
    thread_scope?: CodexTaskThreadScope | null;
    parent_task_id?: string;
    continuation?: Record<string, unknown> | null;
    codex_app_thread_routing_mode?: string;
  };
  handoff_status?: "pending" | "sent" | "skipped";
  handoff_reason?: string;
  created_at?: string;
  updated_at?: string;
  task?: string;
  task_type?: string;
  plan?: {
    executionMode?: string;
    steps?: Array<{
      id?: string;
      title?: string;
    }>;
  } | null;
  progress_timeline?: Array<{
    timestamp?: string;
    phase?: string;
    level?: string;
    message?: string;
    status?: string;
    transport?: string;
    step_id?: string;
    step_title?: string;
  }>;
  telemetry?: Array<{
    kind?: string;
    reason?: string;
    status?: string;
    timestamp?: string;
  }>;
  paths?: {
    request?: string;
    status?: string;
    result?: string;
    progress?: string;
  };
  error?: string;
};

type CodexTaskListPayload = {
  ok: boolean;
  tasks?: CodexTaskSnapshot[];
  error?: string;
};

export type VoiceIntakeIntent =
  | "summarize"
  | "extract_facts"
  | "memory_candidate"
  | "agent_context"
  | "transcribe"
  | "research"
  | "music_local_folder"
  | "other";

export type VoiceIntakeTextRole = "instruction" | "context" | "content_to_analyze" | "unknown";

export type VoiceIntakePersistence = "none" | "candidate_only" | "write_if_relevant";

export type VoiceIntakeFileMetadata = {
  id: string;
  name: string;
  type: string;
  size: number;
};

export type VoiceIntakeClarificationMetadata = {
  intakeId: string;
  textPreview: string;
  textLength: number;
  links: string[];
  files: VoiceIntakeFileMetadata[];
  totalBytes: number;
};

export type VoiceIntakeConfirmation = {
  intake_id?: string;
  action: "submit" | "cancel" | "ask_more";
  operator_instruction?: string;
  intent?: VoiceIntakeIntent;
  original_text_role?: VoiceIntakeTextRole;
  target_agent?: string;
  persistence?: VoiceIntakePersistence;
  notes?: string;
};

export type VoiceIntakeSubmitResult = {
  ok?: boolean;
  task_id?: string;
  short_id?: string;
  status?: string;
  mode?: string;
  operator_note?: string;
  result_path?: string;
  status_path?: string;
  approval?: CodexTaskApproval | null;
  thread_scope?: CodexTaskThreadScope | null;
  parent_task_id?: string;
  parent_short_id?: string;
  continuation?: Record<string, unknown> | null;
  codex_app_thread_routing_mode?: string;
  error?: string;
};

type VoiceIntakePendingHandlers = {
  submit: (confirmation: VoiceIntakeConfirmation) => Promise<VoiceIntakeSubmitResult>;
  cancel: (confirmation: VoiceIntakeConfirmation) => void;
  askMore?: (confirmation: VoiceIntakeConfirmation) => void;
  status?: (status: "starting_voice" | "awaiting_instruction" | "asking_more" | "sending" | "submitted" | "cancelled" | "failed") => void;
};

type SessionMemoryPromotionPayload = {
  ok: boolean;
  saved?: boolean;
  decision?: string;
  reason?: string;
  path?: string;
  event_count?: number;
  error?: string;
};

type GoodStateSignalsPayload = {
  ok: boolean;
  signals?: GoodStateSignalState[];
  error?: string;
};

const SESSION_STORAGE_KEY = "pritha.voice.session.v1";
const MAX_SESSION_EVENTS = 120;
const MAX_VISIBLE_TASKS = 5;
const MAX_STICKY_CONTEXT_EVENTS = 6;
const MAX_STICKY_CONTEXT_TASKS = 3;
const MAX_STICKY_CONTEXT_CHARS = 3_500;
const ROLLING_SUMMARY_CLIENT_DEBOUNCE_MS = 12_000;
const MIC_INPUT_LEVEL_STORAGE_KEY = "pritha.voice.inputLevel.v1";
const LEGACY_MIC_GAIN_STORAGE_KEY = "pritha.voice.micGain.v1"; // gitleaks:allow -- synthetic test fixture or non-secret identifier
const DEFAULT_MIC_INPUT_LEVEL = 100;

function codexTaskCreatedMs(task: Pick<CodexTaskState, "createdAt" | "id">) {
  const created = Date.parse(task.createdAt);
  return Number.isFinite(created) ? created : 0;
}

function orderVisibleCodexTasks(tasks: CodexTaskState[]) {
  return [...tasks]
    .sort((a, b) => codexTaskCreatedMs(b) - codexTaskCreatedMs(a) || b.id.localeCompare(a.id))
    .slice(0, MAX_VISIBLE_TASKS);
}

function clampTaskProgress(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(Math.round(numeric), 100));
}

function fallbackCodexTaskProgress(params: {
  terminal: boolean;
  waitingForOperator: boolean;
  resultAvailable: boolean;
  stale?: boolean;
  statusText: string;
  decisionRequired: boolean;
}) {
  if (params.terminal) return 100;
  if (params.waitingForOperator) return 80;
  if (params.resultAvailable) return 75;
  if (params.stale) return 65;
  if (params.statusText === "running") return 45;
  if (params.decisionRequired) return 5;
  return 15;
}

function formatCodexProgressDetail(detail?: CodexTaskSnapshot["progress_detail"]) {
  if (!detail) return "";
  const total = Number(detail.total_steps || 0);
  const completed = Number(detail.completed_steps || 0);
  if (!Number.isFinite(total) || total <= 1) return detail.source ? `progress: ${detail.source}` : "";
  const parts = [`${Math.max(0, completed)} of ${total} steps complete`];
  if (detail.active_step_title || detail.active_step_id) parts.push(`active: ${detail.active_step_title || detail.active_step_id}`);
  if (detail.blocked_step_id) parts.push(`blocked: ${detail.blocked_step_id}`);
  if (detail.stale) parts.push("possibly stale");
  return parts.join("; ");
}

function normalizeVoiceIntakeChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  const text = String(value || "").trim();
  return choices.includes(text as T) ? (text as T) : fallback;
}

function normalizeVoiceIntakeConfirmation(args: Record<string, unknown>): VoiceIntakeConfirmation {
  return {
    intake_id: stickyText(args.intake_id, 160),
    action: normalizeVoiceIntakeChoice(args.action, ["submit", "cancel", "ask_more"] as const, "ask_more"),
    operator_instruction: stickyText(args.operator_instruction, 3_000),
    intent: normalizeVoiceIntakeChoice(
      args.intent,
      ["summarize", "extract_facts", "memory_candidate", "agent_context", "transcribe", "research", "music_local_folder", "other"] as const,
      "other",
    ),
    original_text_role: normalizeVoiceIntakeChoice(
      args.original_text_role,
      ["instruction", "context", "content_to_analyze", "unknown"] as const,
      "unknown",
    ),
    target_agent: stickyText(args.target_agent, 160),
    persistence: normalizeVoiceIntakeChoice(args.persistence, ["none", "candidate_only", "write_if_relevant"] as const, "none"),
    notes: stickyText(args.notes, 1_000),
  };
}

function voiceIntakeFileLooksAudio(file: VoiceIntakeFileMetadata) {
  if (/^audio\//i.test(file.type || "")) return true;
  return /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(file.name || "");
}

function formatVoiceIntakeClarificationPrompt(metadata: VoiceIntakeClarificationMetadata) {
  const files = metadata.files.length
    ? metadata.files
        .map((file) => `- ${file.id}: ${file.name} (${file.type || "unknown"}, ${Math.round(file.size / 1024)} KiB)`)
        .join("\n")
    : "- none";
  const links = metadata.links.length ? metadata.links.map((url) => `- ${url}`).join("\n") : "- none";
  const textPreview = metadata.textPreview || "(no pasted text)";
  const hasAudioFiles = metadata.files.some(voiceIntakeFileLooksAudio);
  return [
    "Voice Intake Clarification Pending",
    "",
    `intake_id: ${metadata.intakeId}`,
    `pasted_text_chars: ${metadata.textLength}`,
    `pasted_text_preview: ${textPreview}`,
    "",
    "Detected links:",
    links,
    "",
    "Attached file metadata only; file bytes are still local in the browser and have not been sent to the task runtime:",
    files,
    "",
    "Ask the operator in Russian what to do with this intake before the task runtime runs.",
    hasAudioFiles
      ? "Audio files are present. Offer the Local Folder option: import supported audio files into the Music Local Folder library for playback in Music mode. If the operator chooses it, call confirm_voice_intake with intent=music_local_folder; do not send those audio files to the task runtime."
      : "",
    "Offer concise options when useful: quick analysis for this conversation, extract important ideas as a Pritha memory candidate, prepare context for a specific child agent, transcribe/summarize video or audio, research/cite sources, import audio to Music Local Folder when audio is present, or cancel.",
    "Clarify whether pasted text is an instruction, context, or content to analyze when that is ambiguous.",
    "Do not call run_codex_task for this intake. After the operator answers, call confirm_voice_intake with the same intake_id and action submit, cancel, or ask_more.",
    "For submit, include operator_instruction, intent, original_text_role, target_agent when relevant, and persistence. Do not include secrets.",
  ].join("\n");
}

type RollingSummaryPayload = {
  topicKey: string;
  task: string;
  currentStatus: string;
  keyRefs: string[];
  keyResources: string[];
  confirmedConstraints: string[];
  confirmedAccesses: string[];
  nextStep: string;
  latestRealtimeSession: {
    sessionId: string;
    updatedAt: string;
    summary: string;
    keyPoints: string[];
    userIntents: string[];
    nextStep: string;
  };
  latestCodexTask: {
    taskId: string;
    title: string;
    status: string;
    phase: string;
    subject: string;
    result: string;
    refs: string[];
    nextStep: string;
  };
  sourceEvent: string;
  force?: boolean;
};

function stickyText(value: unknown, maxChars: number) {
  return String(value || "")
    .replace(/(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, "[redacted-key]")
    .replace(/([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]")
    .replace(/SkyComputerUseClient[^\n]*/g, "[omitted computer-use process]")
    .replace(/"input-messages"\s*:\s*\[[\s\S]{0,1600}/g, '"input-messages":[omitted]')
    .replace(/\bps aux\b[^\n]*/g, "ps output omitted")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function clampMicInputLevel(value: number) {
  return Math.max(0, Math.min(Number.isFinite(value) ? value : DEFAULT_MIC_INPUT_LEVEL, 100));
}

function inputLevelToGain(inputLevel: number) {
  const normalized = clampMicInputLevel(inputLevel) / 100;
  if (normalized <= 0) return 0;
  return Math.pow(normalized, 2.5);
}

function loadSavedMicInputLevel() {
  if (typeof window === "undefined") return DEFAULT_MIC_INPUT_LEVEL;
  const raw = window.localStorage.getItem(MIC_INPUT_LEVEL_STORAGE_KEY);
  if (raw !== null) return clampMicInputLevel(Number(raw));
  const legacyRaw = window.localStorage.getItem(LEGACY_MIC_GAIN_STORAGE_KEY);
  if (legacyRaw !== null) return clampMicInputLevel(Number(legacyRaw) * 100);
  return DEFAULT_MIC_INPUT_LEVEL;
}

function saveMicInputLevel(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MIC_INPUT_LEVEL_STORAGE_KEY, String(clampMicInputLevel(value)));
}

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function itemId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function loadSessionEvents() {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { events?: VoiceSessionEvent[] };
    return Array.isArray(parsed.events) ? parsed.events.slice(-MAX_SESSION_EVENTS) : [];
  } catch {
    return [];
  }
}

function uniqueLimited(values: Array<string | undefined>, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = stickyText(value, 220);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function extractRollingSummaryRefs(value: unknown) {
  const text = String(value || "");
  const matches = text.match(/https?:\/\/[^\s)"']+|(?:[A-Za-z0-9_.-]+\/){1,}[A-Za-z0-9_.-]+\.(?:md|ts|tsx|js|mjs|json|txt|sqlite)/g) || [];
  return uniqueLimited(matches.map((item) => item.replace(/[),.;]+$/g, "")), 6);
}

function buildRealtimeSessionSection(sessionId: string, events: VoiceSessionEvent[], activeTask?: Partial<CodexTaskState> & { id?: string }) {
  const recentEvents = events.slice(-20);
  const userIntents = uniqueLimited(
    recentEvents.filter((event) => event.kind === "user").map((event) => stickyText(event.text, 170)),
    3,
  );
  const keyPoints = uniqueLimited(
    recentEvents
      .filter((event) => event.kind !== "user")
      .map((event) => {
        const label = event.kind === "assistant" ? "Pritha" : event.kind === "task" ? "Voice task" : event.kind;
        return `${label}: ${stickyText(event.text, 170)}`;
      }),
    4,
  );
  const latestUserIntent = userIntents[userIntents.length - 1] || userIntents[0] || "";
  const summary = stickyText(
    [
      userIntents.length ? `Operator asked/discussed: ${userIntents.join("; ")}` : "",
      keyPoints.length ? `Session signals: ${keyPoints.slice(0, 2).join("; ")}` : "",
      activeTask?.title ? `Recent task context: ${activeTask.title} (${activeTask.status || "unknown"}).` : "",
    ].filter(Boolean).join(" "),
    420,
  ) || "No spoken Realtime session content captured yet.";

  return {
    sessionId,
    updatedAt: nowIso(),
    summary,
    keyPoints,
    userIntents,
    nextStep: latestUserIntent
      ? stickyText(`Continue from operator intent: ${latestUserIntent}`, 220)
      : activeTask?.title
        ? stickyText(`Continue around latest Voice task: ${activeTask.title}`, 220)
        : "Ask the operator what to continue.",
  };
}

function isTerminalCodexTaskStatus(status: unknown) {
  const value = String(status || "");
  return value === "complete" || value === "rejected" || value === "aborted" || value.startsWith("failed");
}

function rollingSummaryEventFromSnapshot(snapshot: CodexTaskSnapshot) {
  if (!snapshot.ok || !snapshot.task_id) return "";
  const status = snapshot.status || "";
  if (snapshot.complete) {
    if (status.startsWith("failed")) return "failed";
    if (status === "aborted") return "aborted";
    if (status === "rejected") return "rejected";
    return "completed";
  }
  if (status === "failed_timeout") return "failed_timeout";
  if (status === "decision_required" || snapshot.approval?.status === "pending") return "decision_gate";
  if (status === "waiting_for_operator") return "operator_question";
  if (snapshot.stale) return "stale_repaired";
  const phase = snapshot.latest_voice_feedback?.phase || snapshot.phase || "";
  if (
    [
      "plan_created",
      "mode_selected",
      "step_started",
      "step_completed",
      "step_blocked",
      "operator_question",
      "fallback_started",
      "stale_repaired",
    ].includes(phase)
  ) {
    return phase;
  }
  return "";
}

function usePrithaRealtimeController() {
  const [phase, setPhase] = useState<RealtimePhase>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [micInputLevel, setMicInputLevelState] = useState(DEFAULT_MIC_INPUT_LEVEL);
  const [micGainRuntime, setMicGainRuntime] = useState<MicGainRuntimeState>({
    available: true,
    active: false,
    audioContextState: "idle",
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PrithaRealtimeStatus | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscriptItem[]>([
    {
      id: "initial-ready",
      role: "assistant",
      text: "Ready. Start listening and talk to Pritha.",
      timestamp: "ready",
    },
  ]);
  const [toolStatus, setToolStatus] = useState<string>("No tool calls yet.");
  const [remoteAudioReady, setRemoteAudioReady] = useState(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [codexTasks, setCodexTasks] = useState<CodexTaskState[]>([]);
  const [goodStateSignals, setGoodStateSignals] = useState<GoodStateSignalState[]>([]);
  const [sessionEvents, setSessionEvents] = useState<VoiceSessionEvent[]>([]);
  const [stickyContextEnabled, setStickyContextEnabled] = useState(true);
  const [sessionMemoryPromotion, setSessionMemoryPromotion] = useState<SessionMemoryPromotionState>({ status: "idle" });

  const searchTurnRef=useRef(`search-turn-${itemId()}`);
  const searchIntentRef=useRef({explicit:false,researchExplicit:false});
  const searchAbortRef=useRef(new Map<string,AbortController>());
  const sessionIdRef = useRef(`voice-${itemId()}`);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const micInputLevelRef = useRef(micInputLevel);
  const chainedInputRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const eventsChannelRef = useRef<VoiceEventChannel | null>(null);
  const chainedTransportRef = useRef<NeuralDeepVoiceTransport | null>(null);
  const connectionEpochRef = useRef(0);
  const connectionAbortRef = useRef<AbortController | null>(null);
  const connectionStartingRef = useRef(false);
  const [voiceAudioDraftReady, setVoiceAudioDraftReady] = useState(false);
  const assistantDraftRef = useRef("");
  const responseInProgressRef = useRef(false);
  const responseQueuedRef = useRef(false);
  const processingToolBatchRef = useRef(false);
  const pendingToolCallsRef = useRef(new Map<string, RealtimeFunctionCallItem>());
  const handledToolCallsRef = useRef(new Set<string>());
  const codexTaskPollTimersRef = useRef(new Map<string, number>());
  const reportedCodexTaskResultsRef = useRef(new Set<string>());
  const reportedCodexTaskApprovalDecisionsRef = useRef(new Set<string>());
  const lastCodexTaskApprovalStatusRef = useRef(new Map<string, string>());
  const lastCodexTaskProgressBriefRef = useRef(new Map<string, number>());
  const sessionLoggedCodexTaskResultsRef = useRef(new Set<string>());
  const memoryPromotionAttemptCountRef = useRef(0);
  const sessionEventsRef = useRef<VoiceSessionEvent[]>([]);
  const codexTasksRef = useRef<CodexTaskState[]>([]);
  const lastStickyContextSentRef = useRef("");
  const rollingSummaryTimerRef = useRef<number | null>(null);
  const rollingSummaryPendingRef = useRef<RollingSummaryPayload | null>(null);
  const lastRollingSummaryEventKeyRef = useRef("");
  const rollingSummarySessionActiveRef = useRef(false);
  const pendingVoiceIntakeRef = useRef<{
    metadata: VoiceIntakeClarificationMetadata;
    handlers: VoiceIntakePendingHandlers;
    promptSent: boolean;
  } | null>(null);
  const unmountCleanupRef = useRef<{
    checkpointRollingSummaryNow?: (sourceEvent: string, options?: { keepalive?: boolean }) => unknown;
    flushRollingSummaryCheckpoint?: (reason?: string) => unknown;
    clearCodexTaskPolling?: () => void;
    closeConnection?: () => void;
  }>({});

  useEffect(() => {
    const savedLevel = loadSavedMicInputLevel();
    micInputLevelRef.current = savedLevel;
    setMicInputLevelState(savedLevel);
  }, []);

  const logClientEvent = useCallback((kind: string, payload: Record<string, unknown> = {}) => {
    void fetch("/api/realtime/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload }),
    }).catch(() => undefined);
  }, []);

  const music = useVoiceMusicController({ codexTasks, logClientEvent });
  const musicControlEnabledRef = useRef(false);

  useEffect(() => {
    musicControlEnabledRef.current = music.controlEnabled;
  }, [music.controlEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStickyContextEnabled(readStickyContextSetting(true));
    const storageKey = `${SESSION_STORAGE_KEY}:id`;
    const existingId = window.sessionStorage.getItem(storageKey);
    if (existingId) {
      sessionIdRef.current = existingId;
    } else {
      window.sessionStorage.setItem(storageKey, sessionIdRef.current);
    }
    const recoveredEvents = loadSessionEvents();
    if (recoveredEvents.length) {
      sessionEventsRef.current = recoveredEvents;
      memoryPromotionAttemptCountRef.current = recoveredEvents.length;
      for (const event of recoveredEvents) {
        if (event.kind === "task" && event.taskId) sessionLoggedCodexTaskResultsRef.current.add(event.taskId);
      }
      setSessionEvents(recoveredEvents);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshStickyContextSetting = () => setStickyContextEnabled(readStickyContextSetting(true));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STICKY_CONTEXT_STORAGE_KEY) refreshStickyContextSetting();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(STICKY_CONTEXT_CHANGED_EVENT, refreshStickyContextSetting);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(STICKY_CONTEXT_CHANGED_EVENT, refreshStickyContextSetting);
    };
  }, []);

  const appendSessionEvent = useCallback(
    (kind: VoiceSessionEvent["kind"], text: string, extra: Omit<Partial<VoiceSessionEvent>, "id" | "kind" | "text" | "timestamp"> = {}) => {
      const compact = text.replace(/\s+/g, " ").trim();
      if (!compact) return;
      const event: VoiceSessionEvent = {
        id: itemId(),
        kind,
        text: compact.slice(0, 3_000),
        timestamp: nowTime(),
        ...extra,
      };
      setSessionEvents((items) => {
        const next = [...items, event].slice(-MAX_SESSION_EVENTS);
        sessionEventsRef.current = next;
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            SESSION_STORAGE_KEY,
            JSON.stringify({
              session_id: sessionIdRef.current,
              updated_at: nowIso(),
              events: next,
            }),
          );
        }
        return next;
      });
      logClientEvent("voice_session_event", {
        session_id: sessionIdRef.current,
        kind,
        text: compact.slice(0, 1_000),
        task_id: extra.taskId,
        status: extra.status,
      });
    },
    [logClientEvent],
  );

  const addTranscript = useCallback(
    (role: VoiceTranscriptItem["role"], text: string) => {
      const compact = text.replace(/\s+/g, " ").trim();
      if (!compact) return;
      setTranscript((items) => [
        ...items.slice(-40),
        {
          id: itemId(),
          role,
          text: compact,
          timestamp: nowTime(),
        },
      ]);
      appendSessionEvent(role === "system" ? "system" : role, compact);
    },
    [appendSessionEvent],
  );

  const upsertCodexTask = useCallback((task: Partial<CodexTaskState> & { id: string }) => {
    const timestamp = nowIso();
    setCodexTasks((tasks) => {
      const existing = tasks.find((item) => item.id === task.id);
      const nextTask: CodexTaskState = {
        id: task.id,
        shortId: task.shortId || existing?.shortId,
        title: task.title || task.id,
        status: task.status || existing?.status || "queued",
        summary: task.summary || existing?.summary || "Voice task queued.",
        progress: typeof task.progress === "number" ? task.progress : existing?.progress || 0,
        progressDetail: task.progressDetail || existing?.progressDetail,
        createdAt: task.createdAt || existing?.createdAt || timestamp,
        updatedAt: timestamp,
        completedAt: task.completedAt || existing?.completedAt,
        phase: task.phase || existing?.phase,
        lastActivityAt: task.lastActivityAt || existing?.lastActivityAt,
        lastActivity: task.lastActivity || existing?.lastActivity,
        stale: task.stale ?? existing?.stale,
        operatorBrief: task.operatorBrief || existing?.operatorBrief,
        voiceHandoffRequired: task.voiceHandoffRequired ?? existing?.voiceHandoffRequired,
        resultPath: task.resultPath || existing?.resultPath,
        statusPath: task.statusPath || existing?.statusPath,
        resultExcerpt: task.resultExcerpt || existing?.resultExcerpt,
        handoffStatus: task.handoffStatus || existing?.handoffStatus,
        handoffReason: task.handoffReason || existing?.handoffReason,
        approval: task.approval === undefined ? existing?.approval : task.approval,
        latestVoiceFeedback: task.latestVoiceFeedback === undefined ? existing?.latestVoiceFeedback : task.latestVoiceFeedback,
        threadScope: task.threadScope === undefined ? existing?.threadScope : task.threadScope,
        threadRoutingMode: task.threadRoutingMode || existing?.threadRoutingMode,
        parentTaskId: task.parentTaskId === undefined ? existing?.parentTaskId : task.parentTaskId,
        parentShortId: task.parentShortId === undefined ? existing?.parentShortId : task.parentShortId,
	        continuation: task.continuation === undefined ? existing?.continuation || null : task.continuation,
      };
      const nextTasks = orderVisibleCodexTasks([nextTask, ...tasks.filter((item) => item.id !== task.id)]);
      codexTasksRef.current = nextTasks;
      return nextTasks;
    });
  }, []);

  const upsertGoodStateSignal = useCallback((signal: GoodStateSignalState) => {
    if (!signal?.id) return;
    setGoodStateSignals((items) => {
      const next = [signal, ...items.filter((item) => item.id !== signal.id)]
        .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || "") || b.id.localeCompare(a.id))
        .slice(0, 5);
      return next;
    });
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/realtime/status", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as PrithaRealtimeStatus & SessionErrorPayload;
    if (!response.ok) {
      throw new Error(payload.error || `Realtime status failed with status ${response.status}`);
    }
    setStatus(payload);
    return payload;
  }, []);

  useEffect(() => {
    void loadStatus().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load realtime status");
    });
  }, [loadStatus]);

  const bindRemoteAudioElement = useCallback((element: HTMLAudioElement | null) => {
    remoteAudioRef.current = element;
  }, []);

  useEffect(() => {
    const changed = () => { if (phase === "idle" || phase === "error") void loadStatus().catch(() => undefined); };
    window.addEventListener(VOICE_SETTINGS_CHANGED_EVENT, changed);
    return () => window.removeEventListener(VOICE_SETTINGS_CHANGED_EVENT, changed);
  }, [loadStatus, phase]);

  const closeConnection = useCallback(() => {
    for(const controller of searchAbortRef.current.values())controller.abort();searchAbortRef.current.clear();
    connectionEpochRef.current += 1;
    connectionAbortRef.current?.abort();
    connectionAbortRef.current = null;
    connectionStartingRef.current = false;
    if (localTrackRef.current) {
      localTrackRef.current.stop();
      localTrackRef.current = null;
    }
    if (processedStreamRef.current) {
      processedStreamRef.current.getTracks().forEach((track) => track.stop());
      processedStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    chainedTransportRef.current?.close();
    chainedTransportRef.current = null;
    chainedInputRef.current = false;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
      gainNodeRef.current = null;
    }
    setMicGainRuntime((current) => ({
      ...current,
      active: false,
      capture: undefined,
      audioContextState: current.available ? "closed" : current.audioContextState,
    }));
    if (eventsChannelRef.current) {
      eventsChannelRef.current.close();
      eventsChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
    musicControlEnabledRef.current = false;
    music.setControlEnabled(false);
    responseInProgressRef.current = false;
    responseQueuedRef.current = false;
    processingToolBatchRef.current = false;
    pendingToolCallsRef.current.clear();
    handledToolCallsRef.current.clear();
    reportedCodexTaskResultsRef.current.clear();
    reportedCodexTaskApprovalDecisionsRef.current.clear();
    lastCodexTaskApprovalStatusRef.current.clear();
    assistantDraftRef.current = "";
    setRemoteAudioReady(false);
    setIsMuted(false);
  }, [music]);

  const requestResponse = useCallback((reason = "") => {
    const channel = eventsChannelRef.current;
    if (!channel || channel.readyState !== "open") return;
    if (responseInProgressRef.current || processingToolBatchRef.current) {
      responseQueuedRef.current = true;
      setToolStatus(`Response queued${reason ? `: ${reason}` : ""}`);
      return;
    }
    responseInProgressRef.current = true;
    channel.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const applyRealtimeMusicControlGate = useCallback(
    async (enabled: boolean) => {
      const channel = eventsChannelRef.current;
      if (!channel || channel.readyState !== "open") return false;
      const response = await fetch("/api/realtime/session-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicControlEnabled: enabled }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "session config returned non-json" }))) as {
        ok?: boolean;
        type?: string;
        instructions?: string;
        tools?: Array<{ name?: string }>;
        tool_choice?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.instructions || !Array.isArray(payload.tools)) {
        throw new Error(payload.error || `Realtime session config failed with status ${response.status}`);
      }
      channel.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: payload.type || "realtime",
            instructions: payload.instructions,
            tools: payload.tools,
            tool_choice: payload.tool_choice || "auto",
          },
        }),
      );
      setStatus((current) =>
        current
          ? {
              ...current,
              tools: payload.tools?.map((tool) => String(tool.name || "")).filter(Boolean) || current.tools,
            }
          : current,
      );
      setToolStatus(enabled ? "Music control enabled for Realtime voice." : "Music control disabled for Realtime voice.");
      logClientEvent("realtime_music_control_session_update", {
        enabled,
        tool_count: payload.tools.length,
      });
      return true;
    },
    [logClientEvent],
  );

  const toggleMusicControl = useCallback(() => {
    const previous = musicControlEnabledRef.current;
    const enabled = !previous;
    musicControlEnabledRef.current = enabled;
    music.setControlEnabled(enabled);
    if (enabled && remoteStreamRef.current) void music.attachAssistantStream(remoteStreamRef.current);
    void applyRealtimeMusicControlGate(enabled).catch((error) => {
      musicControlEnabledRef.current = previous;
      music.setControlEnabled(previous);
      if (previous && remoteStreamRef.current) void music.attachAssistantStream(remoteStreamRef.current);
      setToolStatus(error instanceof Error ? error.message : "Could not update Realtime music control.");
    });
  }, [applyRealtimeMusicControlGate, music]);

  const flushQueuedResponse = useCallback(() => {
    if (!responseQueuedRef.current || responseInProgressRef.current || processingToolBatchRef.current) return;
    responseQueuedRef.current = false;
    requestResponse("queued");
  }, [requestResponse]);

  const sendPendingVoiceIntakeClarification = useCallback(
    (reason: string) => {
      const pending = pendingVoiceIntakeRef.current;
      const channel = eventsChannelRef.current;
      if (!pending || pending.promptSent || !channel || channel.readyState !== "open") return false;

      const prompt = formatVoiceIntakeClarificationPrompt(pending.metadata);
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        }),
      );
      pending.promptSent = true;
      pending.handlers.status?.("awaiting_instruction");
      appendSessionEvent(
        "system",
        `Voice intake ${pending.metadata.intakeId} is waiting for spoken clarification before task-runtime upload.`,
      );
      logClientEvent("voice_intake_clarification_prompt_sent", {
        intake_id: pending.metadata.intakeId,
        file_count: pending.metadata.files.length,
        link_count: pending.metadata.links.length,
        reason,
      });
      requestResponse("voice_intake_clarification");
      return true;
    },
    [appendSessionEvent, logClientEvent, requestResponse],
  );

  const rememberToolCall = useCallback((item: RealtimeFunctionCallItem) => {
    if (!item.name || !item.call_id) return;
    const callKey = item.call_id || item.id || `${item.name}:${item.arguments || ""}`;
    if (handledToolCallsRef.current.has(callKey) || pendingToolCallsRef.current.has(callKey)) return;
    pendingToolCallsRef.current.set(callKey, item);
    setToolStatus(`Pending tool: ${item.name}`);
    setPhase("working");
  }, []);

  const clearCodexTaskPolling = useCallback((taskId?: string) => {
    if (taskId) {
      const timer = codexTaskPollTimersRef.current.get(taskId);
      if (timer !== undefined) {
        window.clearInterval(timer);
        codexTaskPollTimersRef.current.delete(taskId);
      }
      return;
    }

    for (const timer of codexTaskPollTimersRef.current.values()) {
      window.clearInterval(timer);
    }
    codexTaskPollTimersRef.current.clear();
  }, []);

  const postRollingSummaryCheckpoint = useCallback(
    async (payload: RollingSummaryPayload, options: { keepalive?: boolean } = {}) => {
      const response = await fetch("/api/realtime/rolling-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: options.keepalive,
      });
      const result = (await response.json().catch(() => ({ ok: false, error: "rolling summary returned non-json" }))) as {
        ok?: boolean;
        saved?: boolean;
        reason?: string;
        topic_key?: string;
        source_event?: string;
        byte_length?: number;
        path?: string;
        error?: string;
      };
      logClientEvent("rolling_summary_checkpoint_result", {
        ok: Boolean(result.ok),
        saved: Boolean(result.saved),
        reason: result.reason,
        topic_key: result.topic_key || payload.topicKey,
        source_event: result.source_event || payload.sourceEvent,
        byte_length: result.byte_length,
        path: result.path,
      });
      if (!response.ok || !result.ok) throw new Error(result.error || `Rolling summary failed with status ${response.status}`);
      return result;
    },
    [logClientEvent],
  );

  const sendRollingSummaryCheckpointKeepalive = useCallback(
    (payload: RollingSummaryPayload, reason = "keepalive") => {
      const body = JSON.stringify({ ...payload, force: true });
      let sentByBeacon = false;
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        sentByBeacon = navigator.sendBeacon(
          "/api/realtime/rolling-summary",
          new Blob([body], { type: "application/json" }),
        );
      }
      if (!sentByBeacon) {
        void fetch("/api/realtime/rolling-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch((err) => {
          logClientEvent("rolling_summary_checkpoint_failed", {
            topic_key: payload.topicKey,
            source_event: payload.sourceEvent,
            reason,
            error: err instanceof Error ? err.message : "rolling summary keepalive checkpoint failed",
          });
        });
      }
      logClientEvent("rolling_summary_checkpoint_keepalive_sent", {
        topic_key: payload.topicKey,
        source_event: payload.sourceEvent,
        reason,
        sent_by_beacon: sentByBeacon,
      });
      return true;
    },
    [logClientEvent],
  );

  const flushRollingSummaryCheckpoint = useCallback(
    (reason = "flush") => {
      if (rollingSummaryTimerRef.current !== null) {
        window.clearTimeout(rollingSummaryTimerRef.current);
        rollingSummaryTimerRef.current = null;
      }
      const payload = rollingSummaryPendingRef.current;
      rollingSummaryPendingRef.current = null;
      if (!payload) return false;
      void postRollingSummaryCheckpoint(payload).catch((err) => {
        logClientEvent("rolling_summary_checkpoint_failed", {
          topic_key: payload.topicKey,
          source_event: payload.sourceEvent,
          reason,
          error: err instanceof Error ? err.message : "rolling summary checkpoint failed",
        });
      });
      return true;
    },
    [logClientEvent, postRollingSummaryCheckpoint],
  );

  const buildRollingSummaryPayload = useCallback(
    (
      sourceEvent: string,
      options: {
        snapshot?: CodexTaskSnapshot;
        task?: Partial<CodexTaskState> & { id?: string };
        force?: boolean;
      } = {},
    ): RollingSummaryPayload => {
      const taskSnapshot = codexTasksRef.current;
      const activeTask =
        options.task ||
	        taskSnapshot.find((task) => !isTerminalCodexTaskStatus(task.status)) ||
        taskSnapshot[0];
      const snapshot = options.snapshot;
      const scope = snapshot?.thread_scope || snapshot?.request?.thread_scope || activeTask?.threadScope || null;
      const topicKey = scope?.kind && scope.id ? `${scope.kind}-${scope.id}` : "pritha-voice";
      const taskLabel = stickyText(
        scope?.label ||
          snapshot?.request?.task ||
          snapshot?.task ||
          activeTask?.title ||
          "Pritha voice session",
        260,
      );
      const statusText = snapshot?.status || activeTask?.status || "active";
      const phaseText = snapshot?.phase || activeTask?.phase || "voice-session";
      const brief = stickyText(
        snapshot?.latest_voice_feedback?.voice_text ||
          snapshot?.operator_brief ||
          snapshot?.result_excerpt ||
          activeTask?.latestVoiceFeedback?.voice_text ||
          activeTask?.operatorBrief ||
          activeTask?.summary ||
          "",
        220,
      );
      const sessionSnapshot = sessionEventsRef.current;
      const keyEventText = sessionSnapshot
        .filter((event) => event.kind === "task" || event.kind === "system")
        .slice(-8)
        .map((event) => event.text)
        .join(" ");
      const keyRefs = uniqueLimited(
        [
          snapshot?.paths?.status,
          snapshot?.paths?.result,
          activeTask?.statusPath,
          activeTask?.resultPath,
          ...extractRollingSummaryRefs(keyEventText),
          ...extractRollingSummaryRefs(brief),
        ],
        6,
      );
      const keyResources = uniqueLimited(
        [
          scope?.label,
          scope?.kind && scope.id ? `${scope.kind}:${scope.id}` : undefined,
          snapshot?.task_id ? `codex-task:${snapshot.task_id}` : activeTask?.id ? `codex-task:${activeTask.id}` : undefined,
          snapshot?.codex_app_thread_routing_mode || activeTask?.threadRoutingMode,
        ],
        5,
      );
      const confirmedAccesses = uniqueLimited(
        [
          snapshot?.approval?.status === "approved" || activeTask?.approval?.status === "approved" ? "UI approval recorded for current Voice task" : undefined,
          snapshot?.approval?.status === "rejected" || activeTask?.approval?.status === "rejected" ? "UI rejection recorded for current Voice task" : undefined,
          snapshot?.codex_app_thread_routing_mode || activeTask?.threadRoutingMode ? `Task-thread routing: ${snapshot?.codex_app_thread_routing_mode || activeTask?.threadRoutingMode}` : undefined,
        ],
        5,
      );
	      const nextStep = statusText === "aborted"
	        ? "The Voice task was aborted by the operator; ask what to do next only if needed."
	        : snapshot?.complete || isTerminalCodexTaskStatus(statusText)
	        ? "Review the terminal task result and continue only if the operator asks."
        : statusText === "waiting_for_operator"
          ? "Ask the operator for the pending answer, then resume the same Voice task."
          : statusText === "decision_required"
            ? "Wait for the UI decision gate before continuing the Voice task."
            : "Continue the current voice task from the latest saved step.";
      const latestRealtimeSession = buildRealtimeSessionSection(sessionIdRef.current, sessionSnapshot, activeTask);
      const latestCodexTask = {
        taskId: stickyText(snapshot?.task_id || activeTask?.id || "none", 140),
        title: taskLabel,
        status: stickyText(statusText, 100),
        phase: stickyText(phaseText, 100),
        subject: stickyText(scope?.kind && scope.id ? `${scope.kind}:${scope.id}` : scope?.label || "pritha-voice", 120),
        result: stickyText(
          brief ||
            snapshot?.last_activity ||
            activeTask?.lastActivity ||
            activeTask?.resultExcerpt ||
            activeTask?.summary ||
            "No task result captured.",
          320,
        ),
        refs: keyRefs.slice(0, 4),
        nextStep: stickyText(nextStep, 220),
      };

      return {
        topicKey,
        task: taskLabel,
        currentStatus: stickyText(`Status: ${statusText}; phase: ${phaseText}${brief ? `; brief: ${brief}` : ""}`, 300),
        keyRefs,
        keyResources,
        confirmedConstraints: [
          "Internal summary-only checkpoint",
          "No raw transcript storage",
          "No secrets or credentials",
          "No user-visible UI change",
        ],
        confirmedAccesses,
        nextStep,
        latestRealtimeSession,
        latestCodexTask,
        sourceEvent,
        force: options.force,
      };
    },
    [],
  );

  const queueRollingSummaryCheckpoint = useCallback(
    (
      sourceEvent: string,
      options: {
        snapshot?: CodexTaskSnapshot;
        task?: Partial<CodexTaskState> & { id?: string };
        force?: boolean;
      } = {},
    ) => {
      if (!sourceEvent) return false;
      const payload = buildRollingSummaryPayload(sourceEvent, options);
      const eventKey = [
        payload.topicKey,
        payload.sourceEvent,
        payload.task,
        payload.currentStatus,
        payload.latestRealtimeSession.summary,
        payload.latestCodexTask.result,
        payload.nextStep,
      ].join("|");
      if (!options.force && eventKey === lastRollingSummaryEventKeyRef.current) return false;
      lastRollingSummaryEventKeyRef.current = eventKey;
      rollingSummaryPendingRef.current = payload;

      if (options.force) return flushRollingSummaryCheckpoint(sourceEvent);
      if (rollingSummaryTimerRef.current !== null) window.clearTimeout(rollingSummaryTimerRef.current);
      rollingSummaryTimerRef.current = window.setTimeout(() => {
        flushRollingSummaryCheckpoint("debounced");
      }, ROLLING_SUMMARY_CLIENT_DEBOUNCE_MS);
      logClientEvent("rolling_summary_checkpoint_queued", {
        topic_key: payload.topicKey,
        source_event: payload.sourceEvent,
      });
      return true;
    },
    [buildRollingSummaryPayload, flushRollingSummaryCheckpoint, logClientEvent],
  );

  const checkpointRollingSummaryNow = useCallback(
    (
      sourceEvent: string,
      options: {
        snapshot?: CodexTaskSnapshot;
        task?: Partial<CodexTaskState> & { id?: string };
        keepalive?: boolean;
      } = {},
    ) => {
      if (!sourceEvent) return false;
      if (rollingSummaryTimerRef.current !== null) {
        window.clearTimeout(rollingSummaryTimerRef.current);
        rollingSummaryTimerRef.current = null;
      }
      rollingSummaryPendingRef.current = null;
      const payload = buildRollingSummaryPayload(sourceEvent, { ...options, force: true });
      lastRollingSummaryEventKeyRef.current = [
        payload.topicKey,
        payload.sourceEvent,
        payload.task,
        payload.currentStatus,
        payload.latestRealtimeSession.summary,
        payload.latestCodexTask.result,
        payload.nextStep,
      ].join("|");
      if (options.keepalive) return sendRollingSummaryCheckpointKeepalive(payload, sourceEvent);
      void postRollingSummaryCheckpoint(payload, { keepalive: true }).catch((err) => {
        logClientEvent("rolling_summary_checkpoint_failed", {
          topic_key: payload.topicKey,
          source_event: payload.sourceEvent,
          reason: sourceEvent,
          error: err instanceof Error ? err.message : "rolling summary checkpoint failed",
        });
      });
      return true;
    },
    [buildRollingSummaryPayload, logClientEvent, postRollingSummaryCheckpoint, sendRollingSummaryCheckpointKeepalive],
  );

  const applyCodexTaskSnapshot = useCallback(
    (snapshot: CodexTaskSnapshot, options: { recordSessionEvent?: boolean } = {}) => {
      const recordSessionEvent = options.recordSessionEvent !== false;
      if (!snapshot.ok || !snapshot.task_id) {
        setToolStatus(JSON.stringify(snapshot, null, 2));
        return false;
      }

      const statusText = snapshot.status || "unknown";
      const displayTaskId = snapshot.short_id ? `#${snapshot.short_id}` : snapshot.task_id;
      const terminal = Boolean(snapshot.complete);
      const failed = statusText.startsWith("failed");
      const resultText = snapshot.result_excerpt?.trim();
      const operatorBrief = snapshot.operator_brief?.trim();
      const voiceFeedback = snapshot.latest_voice_feedback || null;
      const voiceFeedbackText = voiceFeedback?.voice_text?.trim();
      const decisionRequired = statusText === "decision_required" || snapshot.approval?.status === "pending";
      const waitingForOperator = statusText === "waiting_for_operator";
      const fallbackProgress = fallbackCodexTaskProgress({
        terminal,
        waitingForOperator,
        resultAvailable: Boolean(snapshot.result_available),
        stale: snapshot.stale,
        statusText,
        decisionRequired,
      });
      const progress = snapshot.progress_percent === undefined ? fallbackProgress : clampTaskProgress(snapshot.progress_percent, fallbackProgress);
      const progressDetail = formatCodexProgressDetail(snapshot.progress_detail);
      const handoffSkipped = snapshot.telemetry?.find((event) => event.kind === "codex_task_result_handoff_skipped");
      const handoffSent = snapshot.telemetry?.find((event) => event.kind === "codex_task_result_handoff_sent");
      const handoffStatus = snapshot.handoff_status || (handoffSent ? "sent" : handoffSkipped ? "skipped" : undefined);
      const handoffReason = snapshot.handoff_reason || handoffSkipped?.reason;
      const summary = operatorBrief
        ? operatorBrief
        : terminal
        ? resultText || voiceFeedbackText || (failed ? "Voice task failed. Open task logs for details." : "Voice task completed.")
        : voiceFeedbackText
          ? voiceFeedbackText
        : decisionRequired
          ? snapshot.approval?.summary || "Waiting for operator approval in Pritha UI."
        : snapshot.paths?.status
          ? `Voice task ${statusText}. Status: ${snapshot.paths.status}`
          : `Voice task ${statusText}.`;

      upsertCodexTask({
        id: snapshot.task_id,
        admissionAttemptId: snapshot.admission_attempt_id,
        operatorRequest: snapshot.operator_request,
        shortId: snapshot.short_id,
        title: snapshot.task ? snapshot.task.slice(0, 80) : snapshot.request?.task ? snapshot.request.task.slice(0, 80) : snapshot.task_id,
        status: statusText,
        summary,
        progress,
        progressDetail,
        phase: snapshot.phase,
        lastActivityAt: snapshot.last_activity_at,
        lastActivity: snapshot.last_activity,
        stale: snapshot.stale,
        operatorBrief,
        voiceHandoffRequired: snapshot.voice_handoff_required,
        resultPath: snapshot.paths?.result,
        statusPath: snapshot.paths?.status,
        resultExcerpt: resultText,
        createdAt: snapshot.created_at || snapshot.request?.created_at,
        handoffStatus,
        handoffReason,
        approval: snapshot.approval || null,
        latestVoiceFeedback: voiceFeedback,
        threadScope: snapshot.thread_scope || snapshot.request?.thread_scope || null,
        threadRoutingMode: snapshot.codex_app_thread_routing_mode || snapshot.request?.codex_app_thread_routing_mode,
        parentTaskId: snapshot.parent_task_id || snapshot.request?.parent_task_id,
        parentShortId: snapshot.parent_short_id,
        continuation:
          typeof snapshot.continuation === "object" && snapshot.continuation !== null
            ? snapshot.continuation
            : typeof snapshot.request?.continuation === "object" && snapshot.request.continuation !== null
              ? snapshot.request.continuation
              : null,
        completedAt: terminal ? nowIso() : undefined,
      });
      setToolStatus(JSON.stringify(snapshot, null, 2));

      const rollingSummaryEvent = rollingSummaryEventFromSnapshot(snapshot);
      if (rollingSummaryEvent) queueRollingSummaryCheckpoint(rollingSummaryEvent, { snapshot });

      if (recordSessionEvent && terminal && snapshot.task_id && !sessionLoggedCodexTaskResultsRef.current.has(snapshot.task_id)) {
        sessionLoggedCodexTaskResultsRef.current.add(snapshot.task_id);
        const eventText = operatorBrief || resultText || voiceFeedbackText || displayTaskId;
        addTranscript("tool", `Voice task ${statusText}: ${eventText.slice(0, 900)}`);
        appendSessionEvent("task", `Voice task ${displayTaskId} ${statusText}${eventText ? `: ${eventText.slice(0, 900)}` : ""}`, {
          taskId: snapshot.task_id,
          status: statusText,
        });
      }
      return terminal;
    },
    [addTranscript, appendSessionEvent, queueRollingSummaryCheckpoint, upsertCodexTask],
  );

  const refreshCodexTask = useCallback(
    async (taskId: string, apply = true) => {
      const safeTaskId = taskId.trim();
      if (!safeTaskId) return null;
      try {
        const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(safeTaskId)}`, { cache: "no-store" });
        const snapshot = (await response.json()) as CodexTaskSnapshot;
        if (!response.ok || !snapshot.ok) throw new Error("task_status_unavailable");
        if (apply) applyCodexTaskSnapshot(snapshot);
        return snapshot;
      } catch (cause) {
        setToolStatus("Состояние задачи пока недоступно. Сохранённая задача остаётся на месте; повторите обновление.");
        throw cause;
      }
    },
    [applyCodexTaskSnapshot],
  );

  const loadRecentCodexTasks = useCallback(async () => {
    const response = await fetch("/api/realtime/codex-task?limit=5", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({ ok: false, error: "task list returned non-json" }))) as CodexTaskListPayload;
    if (!response.ok || !payload.ok) throw new Error("Task list is temporarily unavailable.");
    const tasks = payload.tasks || [];
    for (const task of tasks) {
      applyCodexTaskSnapshot({ ...task, ok: true }, { recordSessionEvent: false });
    }
    return payload;
  }, [applyCodexTaskSnapshot]);

  const refreshGoodStateSignals = useCallback(async () => {
    const response = await fetch("/api/realtime/good-state?limit=5", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({ ok: false, error: "good state returned non-json" }))) as GoodStateSignalsPayload;
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Good State signals failed with status ${response.status}`);
    setGoodStateSignals(payload.signals || []);
    return payload;
  }, []);

  useEffect(() => {
    void loadRecentCodexTasks().catch(() => setToolStatus("Список задач пока недоступен. Повторите обновление."));
    void refreshGoodStateSignals().catch(() => setToolStatus("Принятые состояния пока недоступны. Сохранённые записи не изменены."));
  }, [loadRecentCodexTasks, refreshGoodStateSignals]);

  const buildStickyContext = useCallback(
    (reason: string) => {
      const recentEvents = sessionEvents
	        .filter((event) => event.kind !== "system" || /reset|sticky|codex|fallback|failed|complete|aborted/i.test(event.text))
        .slice(-MAX_STICKY_CONTEXT_EVENTS);
      const visibleTasks = codexTasks
	        .filter((task) => !isTerminalCodexTaskStatus(task.status) || task.voiceHandoffRequired || task.handoffStatus === "pending")
	        .slice(0, MAX_STICKY_CONTEXT_TASKS);
	      const activeTasks = visibleTasks.filter((task) => !isTerminalCodexTaskStatus(task.status));
      const lines = [
        "Sticky Voice Context is enabled for this Pritha Control Center session.",
        `Session id: ${sessionIdRef.current}`,
        `Update reason: ${reason}`,
        "Use this as pinned context for the live operator dialogue. Prefer the operator's newest direct instruction over older context.",
        `Session journal events: ${sessionEvents.length}`,
        `Visible Voice tasks: ${visibleTasks.length}; active tasks: ${activeTasks.length}`,
      ];

      if (visibleTasks.length) {
        lines.push("", "Voice task state:");
        for (const task of visibleTasks) {
          const result = stickyText(task.latestVoiceFeedback?.voice_text || task.operatorBrief || task.summary || task.resultExcerpt, 260);
          lines.push(
            `- ${task.id}: ${task.status}, phase ${task.phase || "unknown"}, progress ${task.progress}%, handoff ${task.handoffStatus || "pending"}${task.lastActivity ? `, last activity ${stickyText(task.lastActivity, 140)}` : ""}${result ? `, brief ${result}` : ""}`,
          );
        }
      }

      if (recentEvents.length) {
        lines.push("", "Recent voice session events:");
        for (const event of recentEvents) {
          lines.push(`- ${event.timestamp} ${event.kind}${event.taskId ? ` ${event.taskId}` : ""}: ${stickyText(event.text, 220)}`);
        }
      }

      return lines.join("\n").slice(0, MAX_STICKY_CONTEXT_CHARS);
    },
    [codexTasks, sessionEvents],
  );

  const sendStickyContext = useCallback(
    (reason: string) => {
      if (!stickyContextEnabled) return false;
      const channel = eventsChannelRef.current;
      if (!channel || channel.readyState !== "open") return false;
      const text = buildStickyContext(reason);
      if (!text.trim() || lastStickyContextSentRef.current === text) return false;
      lastStickyContextSentRef.current = text;
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: `Sticky Context Update:\n${text}` }],
          },
        }),
      );
      logClientEvent("sticky_context_sent", {
        session_id: sessionIdRef.current,
        reason,
        event_count: sessionEvents.length,
        task_count: codexTasks.length,
      });
      return true;
    },
    [buildStickyContext, codexTasks.length, logClientEvent, sessionEvents.length, stickyContextEnabled],
  );

  const resetVoiceContext = useCallback(() => {
    lastStickyContextSentRef.current = "";
    const channel = eventsChannelRef.current;
    const text = "Reset Sticky Voice Context for this live voice session. Do not rely on earlier pinned context unless the operator restates it.";
    appendSessionEvent("system", "Sticky Voice Context reset requested.");
    logClientEvent("sticky_context_reset", { session_id: sessionIdRef.current, channel_state: channel?.readyState || "missing" });
    queueRollingSummaryCheckpoint("sticky_context_reset", { force: true });

    if (!channel || channel.readyState !== "open") return false;
    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      }),
    );
    requestResponse("sticky_context_reset");
    return true;
  }, [appendSessionEvent, logClientEvent, queueRollingSummaryCheckpoint, requestResponse]);

  const sendCodexTaskApprovalHandoff = useCallback(
    (snapshot: CodexTaskSnapshot) => {
      if (!snapshot.ok || !snapshot.task_id) return false;
      const approvalStatus = typeof snapshot.approval?.status === "string" ? snapshot.approval.status : "";
      if (approvalStatus) lastCodexTaskApprovalStatusRef.current.set(snapshot.task_id, approvalStatus);
      if (approvalStatus !== "approved" && approvalStatus !== "rejected") return false;

      const decisionKey = `${snapshot.task_id}:${approvalStatus}:${snapshot.approval?.decided_at || ""}`;
      if (reportedCodexTaskApprovalDecisionsRef.current.has(decisionKey)) return false;
      reportedCodexTaskApprovalDecisionsRef.current.add(decisionKey);

      const statusText = snapshot.status || (approvalStatus === "rejected" ? "rejected" : "running");
      const displayTaskId = snapshot.short_id ? `#${snapshot.short_id}` : snapshot.task_id;
      const message =
        approvalStatus === "approved"
          ? `UI approval received for Voice task ${displayTaskId}. Status is now ${statusText}. Briefly acknowledge only that approval was received and the task started.`
          : `UI rejection received for Voice task ${displayTaskId}. Status is now ${statusText}. Briefly acknowledge only that the task was rejected.`;
      appendSessionEvent("task", message, { taskId: snapshot.task_id, status: statusText });
      queueRollingSummaryCheckpoint(approvalStatus === "approved" ? "codex_task_approval_received" : "codex_task_rejected", {
        snapshot,
        force: true,
      });

      const channel = eventsChannelRef.current;
      const channelState = channel?.readyState || "missing";
      if (channel?.readyState === "open") {
        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: message }],
            },
          }),
        );
        if (approvalStatus === "approved") requestResponse("codex_task_approval_received");
        else requestResponse("codex_task_rejected");
        logClientEvent("codex_task_approval_handoff_sent", {
          task_id: snapshot.task_id,
          approval_status: approvalStatus,
          status: statusText,
        });
        sendStickyContext(approvalStatus === "approved" ? "codex_task_approval_received" : "codex_task_rejected");
      } else {
        logClientEvent("codex_task_approval_handoff_skipped", {
          task_id: snapshot.task_id,
          approval_status: approvalStatus,
          status: statusText,
          reason: `channel_${channelState}`,
        });
      }

      return true;
    },
    [appendSessionEvent, logClientEvent, queueRollingSummaryCheckpoint, requestResponse, sendStickyContext],
  );

  const startCodexTaskPolling = useCallback(
    (taskId: string) => {
      const safeTaskId = taskId.trim();
      if (!safeTaskId) return;
      clearCodexTaskPolling(safeTaskId);
      logClientEvent("codex_task_polling_started", { task_id: safeTaskId });
      let attempts = 0;
      let stopped = false;

      const stopPolling = () => {
        stopped = true;
        clearCodexTaskPolling(safeTaskId);
      };

      const poll = async () => {
        if (stopped) return;
        attempts += 1;
        const snapshot = await refreshCodexTask(safeTaskId, false);
        if (!snapshot) return;
        const terminal = applyCodexTaskSnapshot(snapshot);
        const approvalHandoffSent = sendCodexTaskApprovalHandoff(snapshot);
        const suppressTerminalHandoff = approvalHandoffSent && snapshot.approval?.status === "rejected";
        if (terminal && !suppressTerminalHandoff && snapshot.task_id && !reportedCodexTaskResultsRef.current.has(snapshot.task_id)) {
          reportedCodexTaskResultsRef.current.add(snapshot.task_id);
          const channel = eventsChannelRef.current;
          const resultText = snapshot.result_excerpt?.trim();
          const operatorBrief = snapshot.operator_brief?.trim();
          const voiceFeedbackText = snapshot.latest_voice_feedback?.voice_text?.trim();
          const displayTaskId = snapshot.short_id ? `#${snapshot.short_id}` : snapshot.task_id;
          const handoffText =
            resultText ||
            operatorBrief ||
            voiceFeedbackText ||
            (snapshot.status?.startsWith("failed")
              ? `Voice task ${displayTaskId} finished with status ${snapshot.status}. Open the task card for details.`
              : "");
          const channelState = channel?.readyState || "missing";
          const responseBusy = responseInProgressRef.current || processingToolBatchRef.current;
          logClientEvent("codex_task_terminal_snapshot", {
            task_id: snapshot.task_id,
            status: snapshot.status || "unknown",
            result_available: Boolean(handoffText),
            result_chars: handoffText.length,
            channel_state: channelState,
            response_busy: responseBusy,
          });
          if (channel?.readyState === "open" && handoffText) {
            channel.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `Voice task ${displayTaskId} finished with status ${snapshot.status || "complete"}.\n\nResult:\n${handoffText}`,
                    },
                  ],
                },
              }),
            );
            requestResponse("codex_task_complete");
            logClientEvent("codex_task_result_handoff_sent", {
              task_id: snapshot.task_id,
              status: snapshot.status || "unknown",
              result_chars: handoffText.length,
              response_queued: responseBusy,
            });
            upsertCodexTask({
              id: snapshot.task_id,
        admissionAttemptId: snapshot.admission_attempt_id,
        operatorRequest: snapshot.operator_request,
              handoffStatus: "sent",
            });
            sendStickyContext("codex_task_complete");
          } else {
            const reason = handoffText ? `channel_${channelState}` : "empty_result";
            logClientEvent("codex_task_result_handoff_skipped", {
              task_id: snapshot.task_id,
              status: snapshot.status || "unknown",
              reason,
              channel_state: channelState,
            });
            upsertCodexTask({
              id: snapshot.task_id,
        admissionAttemptId: snapshot.admission_attempt_id,
        operatorRequest: snapshot.operator_request,
              handoffStatus: "skipped",
              handoffReason: reason,
            });
          }
        } else if (!terminal && !approvalHandoffSent && snapshot.task_id) {
          const latestFeedback = snapshot.latest_voice_feedback || null;
          const progressText = latestFeedback?.speakable === false ? snapshot.operator_brief?.trim() : latestFeedback?.voice_text?.trim() || snapshot.operator_brief?.trim();
          const urgentFeedback = latestFeedback?.speakable !== false && latestFeedback?.priority === "high";
          if (progressText && (urgentFeedback || attempts >= 30)) {
            const channel = eventsChannelRef.current;
            const now = Date.now();
            const lastBriefAt = lastCodexTaskProgressBriefRef.current.get(snapshot.task_id) || 0;
            const responseBusy = responseInProgressRef.current || processingToolBatchRef.current;
            if (channel?.readyState === "open" && !responseBusy && now - lastBriefAt >= 180_000) {
              lastCodexTaskProgressBriefRef.current.set(snapshot.task_id, now);
              channel.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: `Voice task ${snapshot.short_id ? `#${snapshot.short_id}` : snapshot.task_id} progress update.\n\nStatus:\n${progressText}`,
                      },
                    ],
                  },
                }),
              );
              requestResponse("codex_task_progress");
              logClientEvent("codex_task_progress_handoff_sent", {
                task_id: snapshot.task_id,
                status: snapshot.status || "unknown",
                phase: snapshot.phase || "unknown",
                voice_feedback_phase: snapshot.latest_voice_feedback?.phase || null,
              });
            }
          }
        }
        if (terminal || attempts >= 180) stopPolling();
      };

      const timer = window.setInterval(() => {
        void poll().catch((err) => {
          setToolStatus(err instanceof Error ? err.message : "Could not poll Voice task");
        });
      }, 4_000);
      codexTaskPollTimersRef.current.set(safeTaskId, timer);
      void poll().catch((err) => {
        setToolStatus(err instanceof Error ? err.message : "Could not poll Voice task");
      });
    },
    [applyCodexTaskSnapshot, clearCodexTaskPolling, logClientEvent, refreshCodexTask, requestResponse, sendCodexTaskApprovalHandoff, sendStickyContext, upsertCodexTask],
  );

  const handleVoiceIntakeConfirmation = useCallback(
    async (args: Record<string, unknown>) => {
      const pending = pendingVoiceIntakeRef.current;
      if (!pending) return { ok: false, error: "no_pending_voice_intake" };

      const confirmation = normalizeVoiceIntakeConfirmation(args);
      const confirmedIntakeId = confirmation.intake_id || pending.metadata.intakeId;
      if (confirmedIntakeId !== pending.metadata.intakeId) {
        return {
          ok: false,
          error: "voice_intake_id_mismatch",
          expected_intake_id: pending.metadata.intakeId,
          received_intake_id: confirmedIntakeId,
        };
      }
      confirmation.intake_id = pending.metadata.intakeId;

      if (confirmation.action === "cancel") {
        pending.handlers.status?.("cancelled");
        pending.handlers.cancel(confirmation);
        pendingVoiceIntakeRef.current = null;
        appendSessionEvent("system", `Voice intake ${confirmedIntakeId} cancelled before upload or import.`);
        logClientEvent("voice_intake_cancelled", { intake_id: confirmedIntakeId });
        return { ok: true, intake_id: confirmedIntakeId, status: "cancelled" };
      }

      if (confirmation.action === "ask_more") {
        pending.handlers.status?.("asking_more");
        pending.handlers.askMore?.(confirmation);
        logClientEvent("voice_intake_more_detail_requested", { intake_id: confirmedIntakeId });
        return { ok: true, intake_id: confirmedIntakeId, status: "awaiting_more_instruction" };
      }

      if (!confirmation.operator_instruction?.trim()) {
        return {
          ok: false,
          error: "operator_instruction_required",
          intake_id: confirmedIntakeId,
          message: "Ask the operator what should be done with the files or links, then call confirm_voice_intake again.",
        };
      }

      pending.handlers.status?.("sending");
      const output: VoiceIntakeSubmitResult = await pending.handlers.submit(confirmation).catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : "voice_intake_submit_failed",
      }));
      if (!output.ok) {
        pending.handlers.status?.("failed");
        return output;
      }

      pending.handlers.status?.("submitted");
      pendingVoiceIntakeRef.current = null;
      const taskId = typeof output.task_id === "string" ? output.task_id : "";
      if (taskId) {
        const nextTask: Partial<CodexTaskState> & { id: string } = {
          id: taskId,
          shortId: typeof output.short_id === "string" ? output.short_id : undefined,
          title: `Voice intake ${confirmedIntakeId}`,
          status: String(output.status || output.mode || "queued"),
          summary: String(output.operator_note || "Voice intake handled after spoken clarification."),
          progress: output.status === "running" ? 15 : 10,
          phase: String(output.status || output.mode || "queued"),
          lastActivity: String(output.operator_note || "Voice intake handled after spoken clarification."),
          operatorBrief: String(output.operator_note || ""),
          resultPath: typeof output.result_path === "string" ? output.result_path : undefined,
          statusPath: typeof output.status_path === "string" ? output.status_path : undefined,
          handoffStatus: "pending",
          approval: typeof output.approval === "object" && output.approval !== null ? output.approval : null,
          threadScope: typeof output.thread_scope === "object" && output.thread_scope !== null ? output.thread_scope : null,
          threadRoutingMode: typeof output.codex_app_thread_routing_mode === "string" ? output.codex_app_thread_routing_mode : undefined,
          parentTaskId: typeof output.parent_task_id === "string" ? output.parent_task_id : undefined,
          parentShortId: typeof output.parent_short_id === "string" ? output.parent_short_id : undefined,
          continuation: typeof output.continuation === "object" && output.continuation !== null ? output.continuation : null,
        };
        upsertCodexTask(nextTask);
        startCodexTaskPolling(taskId);
        queueRollingSummaryCheckpoint("voice_intake_submitted", { task: nextTask });
      }

      appendSessionEvent("task", `Voice intake ${confirmedIntakeId} handled${taskId ? ` as task ${taskId}` : ""}.`, {
        taskId: taskId || undefined,
        status: String(output.status || output.mode || "submitted"),
      });
      logClientEvent("voice_intake_confirmed_and_submitted", { intake_id: confirmedIntakeId, task_id: taskId });
      return { ...output, intake_id: confirmedIntakeId };
    },
    [appendSessionEvent, logClientEvent, queueRollingSummaryCheckpoint, startCodexTaskPolling, upsertCodexTask],
  );

  const runToolCall = useCallback(
    async (item: RealtimeFunctionCallItem, serverOutput?: Record<string, unknown>) => {
      let args: Record<string, unknown> = {};
      try {
        args = item.arguments ? (JSON.parse(item.arguments) as Record<string, unknown>) : {};
      } catch {
        return { ok: false, error: "voice_tool_arguments_invalid" };
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) return { ok: false, error: "voice_tool_arguments_invalid" };

      const label = `${item.name || "tool"}(${JSON.stringify(args).slice(0, 180)})`;
      addTranscript("tool", `Tool call: ${label}`);
      setToolStatus(`Running ${item.name || "tool"}...`);

      if (item.name === "music_control") {
        const output = (await music.handleMusicControl(args)) as Record<string, unknown>;
        setToolStatus(JSON.stringify(output, null, 2));
        return output;
      }

      if (item.name === "confirm_voice_intake") {
        const output = await handleVoiceIntakeConfirmation(args);
        setToolStatus(JSON.stringify(output, null, 2));
        return output;
      }

      let output = serverOutput;
      if (!output) {
        const isSearch=["web_search","read_page"].includes(item.name||"");
        const abort=new AbortController(),callKey=item.call_id||itemId();if(isSearch)searchAbortRef.current.set(callKey,abort);
        try {
        const response = await fetch("/api/realtime/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: isSearch?abort.signal:undefined,
          body: JSON.stringify({ name: item.name, arguments: args, operation: item.call_id ? { id: `rt_${sessionIdRef.current}_${item.call_id}`, sessionId: sessionIdRef.current, turnId: searchTurnRef.current, explicitSearch:searchIntentRef.current.explicit||searchIntentRef.current.researchExplicit,researchExplicit:searchIntentRef.current.researchExplicit } : undefined }),
        });
        output = (await response.json().catch(() => ({ ok: false, error: "voice_tool_failed" }))) as Record<string, unknown>;
        } catch { output={ok:false,error:isSearch&&abort.signal.aborted?"cancelled":"voice_tool_failed"}; }
        finally{searchAbortRef.current.delete(callKey);}
      }
      setToolStatus(JSON.stringify(output, null, 2));

      if (item.name === "run_codex_task" || item.name === "answer_codex_task") {
        const taskId = typeof output.task_id === "string" ? output.task_id : "";
        if (taskId) {
          const nextTask: Partial<CodexTaskState> & { id: string } = {
            id: taskId,
            shortId: typeof output.short_id === "string" ? output.short_id : undefined,
            title: taskId,
            status: String(output.status || output.mode || (output.ok === false ? "resume_confirmation_required" : "queued")),
            summary: String(output.operator_note || (output.ok === false ? "Task acceptance needs checking." : "Task handoff created.")),
            progress: output.status === "running" ? 35 : 10,
            phase: String(output.status || output.mode || "queued"),
            lastActivity: String(output.operator_note || "Task handoff created."),
            operatorBrief: String(output.operator_note || ""),
            resultPath: typeof output.result_path === "string" ? output.result_path : undefined,
            statusPath: typeof output.status_path === "string" ? output.status_path : undefined,
            handoffStatus: "pending",
            approval: typeof output.approval === "object" && output.approval !== null ? (output.approval as CodexTaskApproval) : null,
            threadScope: typeof output.thread_scope === "object" && output.thread_scope !== null ? (output.thread_scope as CodexTaskThreadScope) : null,
            threadRoutingMode: typeof output.codex_app_thread_routing_mode === "string" ? output.codex_app_thread_routing_mode : undefined,
            parentTaskId: typeof output.parent_task_id === "string" ? output.parent_task_id : undefined,
            parentShortId: typeof output.parent_short_id === "string" ? output.parent_short_id : undefined,
            continuation:
              typeof output.continuation === "object" && output.continuation !== null
                ? (output.continuation as Record<string, unknown>)
                : null,
          };
          upsertCodexTask(nextTask);
          queueRollingSummaryCheckpoint(item.name === "answer_codex_task" ? "codex_task_progress" : "task_started", {
            task: nextTask,
          });
        }
        if (taskId) startCodexTaskPolling(taskId);
      }

      if (item.name === "record_good_state_signal") {
        const signal = typeof output.signal === "object" && output.signal !== null ? (output.signal as GoodStateSignalState) : null;
        if (signal?.id) {
          upsertGoodStateSignal(signal);
          appendSessionEvent("system", `Good State signal ${signal.id} captured for ${signal.scope}.`, {
            status: signal.status,
          });
          queueRollingSummaryCheckpoint("good_state_signal_recorded", { force: true });
        }
        void refreshGoodStateSignals().catch(() => setToolStatus("Принятые состояния пока недоступны. Сохранённые записи не изменены."));
      }

      return output;
    },
    [
      addTranscript,
      appendSessionEvent,
      handleVoiceIntakeConfirmation,
      music,
      queueRollingSummaryCheckpoint,
      refreshGoodStateSignals,
      startCodexTaskPolling,
      upsertCodexTask,
      upsertGoodStateSignal,
    ],
  );

  const processPendingToolCalls = useCallback(async () => {
    const channel = eventsChannelRef.current;
    if (processingToolBatchRef.current || responseInProgressRef.current || !pendingToolCallsRef.current.size || !channel || channel.readyState !== "open") {
      return;
    }

    processingToolBatchRef.current = true;
    const batch = Array.from(pendingToolCallsRef.current.entries());
    pendingToolCallsRef.current.clear();
    let sentOutput = false;

    try {
      for (const [callKey, item] of batch) {
        if (handledToolCallsRef.current.has(callKey)) continue;
        handledToolCallsRef.current.add(callKey);
        const epoch=searchTurnRef.current;
        const output = await runToolCall(item);
        if(["web_search","read_page"].includes(item.name||"")&&epoch!==searchTurnRef.current)continue;
        if (channel.readyState === "open") {
          channel.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: item.call_id,
                output: JSON.stringify(output),
              },
            }),
          );
          sentOutput = true;
        }
      }
    } finally {
      processingToolBatchRef.current = false;
    }

    if (sentOutput) requestResponse("tool_outputs");
    else flushQueuedResponse();
  }, [flushQueuedResponse, requestResponse, runToolCall]);

  const markResponseDone = useCallback(
    (event: RealtimeEvent) => {
      responseInProgressRef.current = false;
      if (event.response && Array.isArray(event.response.output)) {
        for (const item of event.response.output) {
          if (item && item.type === "function_call") rememberToolCall(item);
        }
      }
      if (pendingToolCallsRef.current.size) void processPendingToolCalls();
      else {
        if (phase === "working") setPhase("listening");
        flushQueuedResponse();
      }
    },
    [flushQueuedResponse, phase, processPendingToolCalls, rememberToolCall],
  );

  const handleRealtimeEvent = useCallback(
    (raw: string) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(raw) as RealtimeEvent;
      } catch {
        return;
      }

      if (event.type === "response.created") responseInProgressRef.current = true;
      if (event.type === "input_audio_buffer.speech_started") {
        for(const controller of searchAbortRef.current.values())controller.abort();searchAbortRef.current.clear();
        searchTurnRef.current=`search-turn-${itemId()}`;searchIntentRef.current={explicit:false,researchExplicit:false};
        music.onUserSpeechStart();
      }
      if (event.type === "input_audio_buffer.speech_stopped") {
        music.onUserSpeechStop();
      }
      if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
        searchIntentRef.current=searchIntent(event.transcript);
        addTranscript("user", event.transcript);
      }
      if ((event.type === "response.audio_transcript.delta" || event.type === "response.output_audio_transcript.delta") && event.delta) {
        assistantDraftRef.current += event.delta;
        setPhase("speaking");
      }
      if (event.type === "response.audio_transcript.done" || event.type === "response.output_audio_transcript.done") {
        const text = event.transcript || assistantDraftRef.current;
        assistantDraftRef.current = "";
        if (text) {
          addTranscript("assistant", text);
          queueRollingSummaryCheckpoint("session_turn");
        }
      }
      if (event.type === "response.output_text.delta" && event.delta) {
        assistantDraftRef.current += event.delta;
        setPhase("speaking");
      }
      if (event.type === "response.output_text.done") {
        const text = event.text || assistantDraftRef.current;
        assistantDraftRef.current = "";
        if (text) {
          addTranscript("assistant", text);
          queueRollingSummaryCheckpoint("session_turn");
        }
      }
      if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
        rememberToolCall(event.item);
      }
      if (event.type === "response.done") {
        markResponseDone(event);
      }
      if (event.type === "error") {
        const code = event.error?.code;
        if (code === "conversation_already_has_active_response") {
          responseInProgressRef.current = true;
          responseQueuedRef.current = true;
          setToolStatus("Realtime response is active. Tool output response will retry after response.done.");
          return;
        }
        const message = event.error?.message || code || "Realtime error";
        setError(message);
        addTranscript("tool", message);
      }
    },
    [addTranscript, markResponseDone, music, queueRollingSummaryCheckpoint, rememberToolCall],
  );

  const start = useCallback(async () => {
    if (phase === "connecting" || connectionStartingRef.current) return;
    connectionStartingRef.current = true;
    const connectionEpoch = ++connectionEpochRef.current;
    const connectionAbort = new AbortController();
    connectionAbortRef.current = connectionAbort;
    const assertConnecting = () => { if (connectionEpoch !== connectionEpochRef.current) throw new Error("voice_connection_cancelled"); };
    let createdChainedSession: string | null = null;
    setError(null);
    setPhase("connecting");
    const t0 = performance.now();

    try {
      // Unlock the single audio context in the original user gesture (Safari).
      const GestureAudioContextCtor = window.AudioContext || (window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if (GestureAudioContextCtor) { audioContextRef.current = new GestureAudioContextCtor(); void audioContextRef.current.resume().catch(() => undefined); }
      const selectionResponse = await fetch("/api/voice/status", { cache: "no-store", signal: connectionAbort.signal });
      if (!selectionResponse.ok) throw new Error("Voice settings are unavailable.");
      const selection = await selectionResponse.json();
      assertConnecting();
      const chained = selection.transport === "neuraldeep_chained";
      chainedInputRef.current = chained;
      const runtimeStatus = chained ? null : await loadStatus();
      if (!chained && !runtimeStatus?.openai_key_configured) {
        throw new Error("OPENAI_API_KEY is not configured for the control-center server.");
      }

      const sessionResponse = await fetch(chained ? "/api/voice/sessions" : "/api/realtime/session", {
        signal: connectionAbort.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicControlEnabled: musicControlEnabledRef.current }),
      });
      if (!sessionResponse.ok) {
        const payload = (await sessionResponse.json().catch(() => ({}))) as SessionErrorPayload;
        throw new Error(payload.error || `Realtime session failed with status ${sessionResponse.status}`);
      }
      const sessionPayload = await sessionResponse.json();
      if (chained) createdChainedSession = sessionPayload.sessionId;
      assertConnecting();
      const sessionData = (chained ? { model: sessionPayload.settings.model, voice: sessionPayload.settings.voice, tools: sessionPayload.tools, client_secret: {value:""} } : sessionPayload) as RealtimeSessionPayload;
      const nextSessionId = chained ? sessionPayload.sessionId : `voice-${itemId()}`;
      sessionIdRef.current = nextSessionId;
      sessionEventsRef.current = [];
      memoryPromotionAttemptCountRef.current = 0;
      sessionLoggedCodexTaskResultsRef.current.clear();
      setSessionEvents([]);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(`${SESSION_STORAGE_KEY}:id`, nextSessionId);
        window.sessionStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({
            session_id: nextSessionId,
            updated_at: nowIso(),
            events: [],
          }),
        );
      }
      setStatus((current) =>
        current
          ? { ...current, model: sessionData.model, voice: sessionData.voice, tools: sessionData.tools }
          : current,
      );

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
      };
      // Local Silero needs a speech-level mono input; Realtime keeps its existing capture policy.
      (audioConstraints as MediaTrackConstraints & { autoGainControl?: boolean }).autoGainControl = chained;
      if (chained) audioConstraints.channelCount = 1;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      if (connectionEpoch !== connectionEpochRef.current) { stream.getTracks().forEach(track => track.stop()); assertConnecting(); }
      localStreamRef.current = stream;
      const inputTrack = stream.getAudioTracks()[0];
      if (!inputTrack) throw new Error("No local audio track available.");
      if (chained) {
        const captureSettings = inputTrack.getSettings();
        logClientEvent("voice_capture_config", {
          transport: "neuraldeep_chained",
          sample_rate: captureSettings.sampleRate,
          channel_count: captureSettings.channelCount,
          auto_gain_control: captureSettings.autoGainControl,
          noise_suppression: captureSettings.noiseSuppression,
          echo_cancellation: captureSettings.echoCancellation,
          track_state: inputTrack.readyState,
          track_muted: inputTrack.muted,
        });
      }

      let track = inputTrack;
      let streamForPeer = stream;
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        try {
          const audioContext = audioContextRef.current || new AudioContextCtor();
          if (audioContext.state === "suspended") await audioContext.resume().catch(() => undefined);
          const source = audioContext.createMediaStreamSource(stream);
          const gain = audioContext.createGain();
          const destination = audioContext.createMediaStreamDestination();
          gain.gain.value = chained ? chainedInputGain(micInputLevelRef.current) : inputLevelToGain(micInputLevelRef.current);
          source.connect(gain);
          gain.connect(destination);
          const processedTrack = destination.stream.getAudioTracks()[0];
          if (processedTrack) {
            track = processedTrack;
            streamForPeer = destination.stream;
            processedStreamRef.current = destination.stream;
            audioContextRef.current = audioContext;
            gainNodeRef.current = gain;
            setMicGainRuntime({
              available: true,
              active: true,
              audioContextState: audioContext.state,
            });
          } else {
            setMicGainRuntime({
              available: false,
              active: false,
              fallbackReason: "Web Audio did not produce a processed microphone track.",
              audioContextState: audioContext.state,
            });
            void audioContext.close().catch(() => undefined);
          }
        } catch (error) {
          setMicGainRuntime({
            available: false,
            active: false,
            fallbackReason: error instanceof Error ? error.message : "Web Audio microphone gain is unavailable on this device.",
            audioContextState: "unavailable",
          });
        }
      } else {
        setMicGainRuntime({
          available: false,
          active: false,
          fallbackReason: "Web Audio is unavailable in this browser.",
          audioContextState: "unsupported",
        });
      }
      localTrackRef.current = track;

      if (chained) {
        const audioContext = audioContextRef.current;
        if (!audioContext) throw new Error("NeuralDeep voice requires Web Audio on this device.");
        let lastCaptureLoggedAt = 0;
        const transport = await NeuralDeepVoiceTransport.create({
          sessionId: nextSessionId, stream: streamForPeer, audioContext, signal: connectionAbort.signal,
          onEvent: handleRealtimeEvent, onTool: runToolCall, onPhase: setPhase,
          onDraft: setVoiceAudioDraftReady, onLatency: setLastLatencyMs,
          onMuted: muted => { if (localTrackRef.current) localTrackRef.current.enabled = !muted; setIsMuted(muted); },
          onDisconnected: () => setPhase("error"),
          onCapture: capture => {
            if (connectionEpoch !== connectionEpochRef.current) return;
            setMicGainRuntime(current => ({ ...current, capture, audioContextState: capture.audioContextState }));
            if (performance.now() - lastCaptureLoggedAt >= 10000) {
              lastCaptureLoggedAt = performance.now();
              logClientEvent("voice_capture_state", {
                transport: "neuraldeep_chained", ...capture, mic_input_level: micInputLevelRef.current,
                input_track_state: inputTrack.readyState, input_track_muted: inputTrack.muted, input_track_enabled: inputTrack.enabled,
              });
            }
          },
          onAssistantStream: assistantStream => { remoteStreamRef.current = assistantStream; if (musicControlEnabledRef.current) void music.attachAssistantStream(assistantStream); },
        });
        if (connectionEpoch !== connectionEpochRef.current) { transport.close(); assertConnecting(); }
        chainedTransportRef.current = transport;
        eventsChannelRef.current = transport;
        rollingSummarySessionActiveRef.current = true;
        setRemoteAudioReady(true);
        setToolStatus("NeuralDeep voice connected · experimental");
        sendPendingVoiceIntakeClarification("data_channel_open");
        return;
      }

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;
      peerConnection.addTrack(track, streamForPeer);
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") setPhase("listening");
        if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "disconnected") {
          setPhase("error");
          setError("Realtime connection lost. Reconnect to continue.");
          queueRollingSummaryCheckpoint("connection_lost", { force: true });
        }
      };
      peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        remoteStreamRef.current = remoteStream;
        if (musicControlEnabledRef.current) void music.attachAssistantStream(remoteStream);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play();
          setRemoteAudioReady(true);
          setLastLatencyMs(Math.round(performance.now() - t0));
        }
      };

      const channel = peerConnection.createDataChannel("oai-events");
      eventsChannelRef.current = channel;
      channel.onopen = () => {
        rollingSummarySessionActiveRef.current = true;
        setPhase("listening");
        setToolStatus(`Realtime data channel connected. Tools: ${sessionData.tools.join(", ")}.`);
        logClientEvent("realtime_data_channel_connected", {
          session_id: sessionIdRef.current,
          sticky_context_available: stickyContextEnabled,
          music_control_enabled: musicControlEnabledRef.current,
          event_count: sessionEvents.length,
          task_count: codexTasks.length,
        });
        sendPendingVoiceIntakeClarification("data_channel_open");
      };
      channel.onmessage = (event) => handleRealtimeEvent(String(event.data));
      channel.onclose = () => {
        if (phase !== "idle") setToolStatus("Realtime data channel closed.");
      };

      const offer = await peerConnection.createOffer();
      assertConnecting();
      await peerConnection.setLocalDescription(offer);

      const callResponse = await fetch("/api/realtime/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerSdp: offer.sdp || "",
          ephemeralKey: sessionData.client_secret.value,
        }),
      });
      if (!callResponse.ok) {
        const payload = (await callResponse.json().catch(() => ({}))) as SessionErrorPayload;
        throw new Error(payload.error || `Realtime call failed with status ${callResponse.status}`);
      }
      const callPayload = (await callResponse.json()) as RealtimeCallResponse;
      assertConnecting();
      await peerConnection.setRemoteDescription({ type: "answer", sdp: callPayload.answerSdp });
    } catch (err) {
      if (createdChainedSession && !chainedTransportRef.current) void fetch(`/api/voice/sessions/${createdChainedSession}`, {method:"DELETE",keepalive:true}).catch(() => undefined);
      if (connectionEpoch !== connectionEpochRef.current) return;
      closeConnection();
      setPhase("error");
      const message = err instanceof Error ? err.message : "Unknown realtime call error";
      setError(message);
      addTranscript("tool", message);
    } finally {
      if (connectionEpoch === connectionEpochRef.current) connectionStartingRef.current = false;
    }
  }, [addTranscript, checkpointRollingSummaryNow, closeConnection, codexTasks.length, handleRealtimeEvent, runToolCall, loadStatus, logClientEvent, music, phase, queueRollingSummaryCheckpoint, sendPendingVoiceIntakeClarification, sessionEvents.length, stickyContextEnabled]);

  const beginVoiceIntakeClarification = useCallback(
    (metadata: VoiceIntakeClarificationMetadata, handlers: VoiceIntakePendingHandlers) => {
      pendingVoiceIntakeRef.current = {
        metadata,
        handlers,
        promptSent: false,
      };
      handlers.status?.(phase === "idle" || phase === "error" ? "starting_voice" : "awaiting_instruction");
      appendSessionEvent(
        "system",
        `Voice intake ${metadata.intakeId} prepared for spoken clarification before task-runtime upload.`,
      );
      logClientEvent("voice_intake_clarification_started", {
        intake_id: metadata.intakeId,
        file_count: metadata.files.length,
        link_count: metadata.links.length,
        voice_phase: phase,
      });

      const sent = sendPendingVoiceIntakeClarification("begin_voice_intake");
      if (!sent && (phase === "idle" || phase === "error")) {
        void start();
      }
      return {
        ok: true,
        intake_id: metadata.intakeId,
        status: sent ? "awaiting_instruction" : phase === "idle" || phase === "error" ? "starting_voice" : "waiting_for_realtime_channel",
      };
    },
    [appendSessionEvent, logClientEvent, phase, sendPendingVoiceIntakeClarification, start],
  );

  const stop = useCallback(() => {
    checkpointRollingSummaryNow("session_stopping", { keepalive: true });
    rollingSummarySessionActiveRef.current = false;
    closeConnection();
    setPhase("idle");
  }, [checkpointRollingSummaryNow, closeConnection]);

  const toggleMute = useCallback(() => {
    if (!localTrackRef.current) return;
    const nextMuted = !isMuted;
    localTrackRef.current.enabled = !nextMuted;
    void chainedTransportRef.current?.setMuted(nextMuted);
    setIsMuted(nextMuted);
  }, [isMuted]);

  const setMicInputLevel = useCallback((value: number) => {
    const next = clampMicInputLevel(value);
    micInputLevelRef.current = next;
    setMicInputLevelState(next);
    saveMicInputLevel(next);
    const node = gainNodeRef.current;
    if (node) node.gain.setTargetAtTime(chainedInputRef.current ? chainedInputGain(next) : inputLevelToGain(next), node.context.currentTime, 0.01);
  }, []);

  const sendTextMessage = useCallback(
    (text: string) => {
      const compact = text.trim();
      const channel = eventsChannelRef.current;
      if (!compact || !channel || channel.readyState !== "open") return false;

      if (chainedTransportRef.current) {
        if (!chainedTransportRef.current.sendUserText(compact)) return false;
      } else channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: compact }],
          },
        }),
      );
      addTranscript("user", compact);
      requestResponse("text_message");
      return true;
    },
    [addTranscript, requestResponse],
  );

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  const sendSessionRecap = useCallback(() => {
    const events = sessionEvents.slice(-12);
    if (!events.length) return false;
    const recap = events
      .map((event) => `- ${event.timestamp} ${event.kind}${event.taskId ? ` ${event.taskId}` : ""}: ${event.text}`)
      .join("\n");
    return sendTextMessage(`Brief context for the current voice session:\n${recap}`);
  }, [sendTextMessage, sessionEvents]);

  const promoteSessionMemory = useCallback(
    async (reason = "manual") => {
      if (!sessionEvents.length) return null;
      setSessionMemoryPromotion({ status: "checking", eventCount: sessionEvents.length });
      const response = await fetch("/api/realtime/session-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          reason,
          events: sessionEvents,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "session memory returned non-json" }))) as SessionMemoryPromotionPayload;
      const next: SessionMemoryPromotionState = payload.ok
        ? {
            status: payload.saved ? "saved" : "skipped",
            decision: payload.decision,
            reason: payload.reason,
            path: payload.path,
            eventCount: payload.event_count || sessionEvents.length,
          }
        : {
            status: "failed",
            error: payload.error || `Session memory failed with status ${response.status}`,
            eventCount: sessionEvents.length,
          };
      setSessionMemoryPromotion(next);
      logClientEvent("voice_session_memory_promotion", {
        session_id: sessionIdRef.current,
        trigger: reason,
        status: next.status,
        decision: next.decision,
        path: next.path,
        event_count: next.eventCount,
      });
      return payload;
    },
    [logClientEvent, sessionEvents],
  );

  useEffect(() => {
    if (sessionEvents.length < 4) return;
    if (sessionEvents.length - memoryPromotionAttemptCountRef.current < 6 && memoryPromotionAttemptCountRef.current !== 0) return;
    memoryPromotionAttemptCountRef.current = sessionEvents.length;
    void promoteSessionMemory("automatic").catch((err) => {
      setSessionMemoryPromotion({
        status: "failed",
        error: err instanceof Error ? err.message : "automatic session memory failed",
        eventCount: sessionEvents.length,
      });
    });
  }, [promoteSessionMemory, sessionEvents.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => {
	      if (codexTasks.some((task) => !isTerminalCodexTaskStatus(task.status))) {
        queueRollingSummaryCheckpoint("periodic_checkpoint");
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [codexTasks, queueRollingSummaryCheckpoint]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkpointUnload = () => {
      if (!rollingSummarySessionActiveRef.current) return;
      checkpointRollingSummaryNow("page_unload_checkpoint", { keepalive: true });
    };
    const checkpointHidden = () => {
      if (document.visibilityState === "hidden") checkpointUnload();
    };
    window.addEventListener("pagehide", checkpointUnload);
    document.addEventListener("visibilitychange", checkpointHidden);
    return () => {
      window.removeEventListener("pagehide", checkpointUnload);
      document.removeEventListener("visibilitychange", checkpointHidden);
    };
  }, [checkpointRollingSummaryNow]);

  useEffect(() => {
    unmountCleanupRef.current = {
      checkpointRollingSummaryNow,
      flushRollingSummaryCheckpoint,
      clearCodexTaskPolling,
      closeConnection,
    };
  }, [checkpointRollingSummaryNow, clearCodexTaskPolling, closeConnection, flushRollingSummaryCheckpoint]);

  useEffect(() => {
    return () => {
      const cleanup = unmountCleanupRef.current;
      if (rollingSummarySessionActiveRef.current) cleanup.checkpointRollingSummaryNow?.("page_unload_checkpoint", { keepalive: true });
      cleanup.flushRollingSummaryCheckpoint?.("unmount");
      cleanup.clearCodexTaskPolling?.();
      cleanup.closeConnection?.();
    };
  }, []);

  return {
    phase,
    voiceAudioDraftReady,
    resolveVoiceAudioDraft: (send: boolean) => chainedTransportRef.current?.resolveDraft(send),
    isMuted,
    micInputLevel,
    error,
    status,
    transcript,
    sessionEvents,
    sessionId: sessionIdRef.current,
    stickyContextEnabled,
    sessionMemoryPromotion,
    micGainRuntime,
    toolStatus,
    remoteAudioReady,
    lastLatencyMs,
    codexTasks,
    goodStateSignals,
    music,
    bindRemoteAudioElement,
    loadStatus,
    loadRecentCodexTasks,
    refreshGoodStateSignals,
    refreshCodexTask,
    watchCodexTask: startCodexTaskPolling,
    start,
    beginVoiceIntakeClarification,
    stop,
    toggleMute,
    toggleMusicControl,
    setMicInputLevel,
    sendTextMessage,
    sendSessionRecap,
    sendStickyContext,
    resetVoiceContext,
    promoteSessionMemory,
    clearTranscript,
  };
}

export type PrithaRealtimeController = ReturnType<typeof usePrithaRealtimeController>;

const PrithaRealtimeContext = createContext<PrithaRealtimeController | null>(null);

export function PrithaRealtimeProvider({ children }: { children: ReactNode }) {
  const controller = usePrithaRealtimeController();

  return createElement(
    PrithaRealtimeContext.Provider,
    { value: controller },
    createElement("audio", { ref: controller.bindRemoteAudioElement, autoPlay: true, hidden: true }),
    children,
  );
}

export function usePrithaRealtime() {
  const controller = useContext(PrithaRealtimeContext);
  if (!controller) throw new Error("usePrithaRealtime must be used inside PrithaRealtimeProvider.");
  return controller;
}
