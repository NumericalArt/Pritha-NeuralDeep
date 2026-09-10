"use client";

import { VoiceOperatorCard } from "../codex/VoiceOperatorCard";
import type { VoiceOperatorRequestView } from "@/lib/codex-chat/voice-operator-context";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  Code2,
  Database,
  Heart,
  MemoryStick,
  Mic,
  MicOff,
  Music,
  Paperclip,
  Play,
  Search,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import type { ControlCenterStatus } from "@/lib/control-center/types";
import { MAX_MUSIC_LEVEL_PERCENT, musicPercentToUserVolume, musicSourceCapabilities, musicUserVolumeToPercent } from "@/lib/music/volume";
import { PrithaStarScene } from "./PrithaStarScene";
import {
  usePrithaRealtime,
  type CodexTaskState,
  type CodexTaskThreadScope,
  type CodexTaskVoiceFeedback,
  type GoodStateSignalState,
  type MicGainRuntimeState,
  type PrithaRealtimeController,
  type PrithaRealtimeStatus,
  type RealtimePhase,
  type SessionMemoryPromotionState,
  type VoiceIntakeClarificationMetadata,
  type VoiceIntakeConfirmation,
  type VoiceIntakeSubmitResult,
  type VoiceSessionEvent,
} from "./usePrithaRealtime";
import { beginTaskChatHandoff } from "@/lib/codex-chat/ui-activity-client";

type CodexTaskDetail = {
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
  request?: Record<string, unknown> | null;
  status_detail?: Record<string, unknown> | null;
  approval?: Record<string, unknown> | null;
  telemetry?: Array<Record<string, unknown>>;
  result_available?: boolean;
  result_excerpt?: string;
  result_read?:{available:boolean;total_bytes:number|null;truncated:boolean;error:string|null};
  stdout_excerpt?: string;
  stderr_excerpt?: string;
  progress_timeline?: Array<Record<string, unknown>>;
  thread_scope?: CodexTaskThreadScope | null;
  parent_task_id?: string;
  parent_short_id?: string;
  continuation?: Record<string, unknown> | null;
  codex_app_thread_routing_mode?: string;
  paths?: Record<string, string>;
  task_chat?: {
    chatId: string;
    href: string;
    historyAvailable: boolean;
    continuationState: string;
  } | null;
  recovery?: {
    retry: boolean;
    resume: boolean;
    cancel: boolean;
  } | null;
  error?: string;
};

function formatElapsed(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `00:${mins}:${secs}`;
}

function phaseIsActive(phase: RealtimePhase) {
  return phase === "connecting" || phase === "listening" || phase === "speaking" || phase === "working";
}

function stateLabel(phase: RealtimePhase) {
  return {
    idle: "Ready",
    connecting: "Connecting",
    listening: "Listening",
    speaking: "Speaking",
    working: "Working",
    error: "Connection issue",
  }[phase];
}

function subtitleForState(phase: RealtimePhase) {
  return {
    idle: "Ready when you are.",
    connecting: "Connecting microphone and voice...",
    listening: "Listening for you...",
    speaking: "Pritha is answering...",
    working: "Running a tool...",
    error: "Reconnect to continue.",
  }[phase];
}

function keyStatusLabel(status: PrithaRealtimeStatus | null, error?: string | null) {
  if (error) return error;
  if (!status) return "Checking key...";
  return (status.voice_key_configured ?? status.openai_key_configured) ? "Ready" : "Key missing";
}

function keyIsMissing(status: PrithaRealtimeStatus | null) {
  return status !== null && !(status.voice_key_configured ?? status.openai_key_configured);
}

function primaryButtonLabel(phase: RealtimePhase, status: PrithaRealtimeStatus | null) {
  if (phase === "idle" && keyIsMissing(status)) return "Missing API Key";
  if (phase === "idle") return "Start Listening";
  if (phase === "connecting") return "Cancel connection";
  if (phase === "error") return "Reconnect";
  return "Stop Listening";
}

function PrimaryButtonIcon({ phase, status, size }: { phase: RealtimePhase; status: PrithaRealtimeStatus | null; size: number }) {
  if (primaryButtonLabel(phase, status) === "Start Listening") {
    return <Play size={size} fill="currentColor" />;
  }
  return <Square size={size} fill="currentColor" />;
}

function formatTaskElapsed(createdAt: string, completedAt?: string) {
  const start = Date.parse(createdAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Unknown";
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function taskStatusTone(task: CodexTaskState) {
  if (task.stale) return "orange";
  if (task.status.startsWith("failed")) return "orange";
  if (task.status === "decision_required" || task.approval?.status === "pending") return "orange";
  if (task.status === "rejected" || task.status === "aborted" || task.approval?.status === "rejected") return "orange";
  if (task.status === "complete") return "green";
  if (task.status === "running") return "blue";
  return "";
}

function taskNeedsApproval(task: CodexTaskState) {
  return task.status === "decision_required" || task.approval?.status === "pending";
}

function taskIsTerminal(task: CodexTaskState) {
  return task.status === "complete" || task.status === "rejected" || task.status === "aborted" || task.status.startsWith("failed");
}

function taskShortLabel(task: Pick<CodexTaskState, "shortId" | "id">) {
  return task.shortId ? `#${task.shortId}` : `#${task.id.slice(-3).toUpperCase()}`;
}

function parentTaskLabel(task: Pick<CodexTaskState, "parentShortId" | "parentTaskId">) {
  if (task.parentShortId) return `#${task.parentShortId}`;
  return task.parentTaskId || "";
}

function formatThreadScope(scope?: CodexTaskThreadScope | null) {
  if (!scope?.kind || !scope.id) return "thread: pending";
  const generation = Number(scope.generation || 1);
  return `thread: ${scope.kind}:${scope.id}${generation > 1 ? ` g${generation}` : ""}`;
}

function VoiceWave({ mobile = false }: { mobile?: boolean }) {
  return (
    <svg className={mobile ? "mobile-voice-wave" : "voice-wave"} viewBox="0 0 900 180" aria-hidden="true">
      <path className="wave wave-1" d="M0 94 C80 62 116 62 180 94 S300 126 370 92 S510 58 600 94 S735 130 900 82" />
      <path className="wave wave-2" d="M0 98 C96 118 148 28 228 84 S360 136 446 88 S570 48 668 94 S782 136 900 92" />
      <path className="wave wave-3" d="M0 90 C116 82 142 124 232 98 S350 64 448 96 S588 126 704 86 S804 58 900 96" />
    </svg>
  );
}

function VoiceVisualization({ phase, mobile = false }: { phase: RealtimePhase; mobile?: boolean }) {
  return (
    <div className={mobile ? "mobile-voice-visual" : "voice-visualization"}>
      <VoiceWave mobile={mobile} />
      <PrithaStarScene phase={phase} mobile={mobile} />
    </div>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const iconProps = { size: 20 };
  if (tool.includes("memory")) return <BookOpen {...iconProps} />;
  if (tool.includes("intake")) return <Paperclip {...iconProps} />;
  if (tool.includes("codex")) return <Code2 {...iconProps} />;
  if (tool.includes("search")) return <Search {...iconProps} />;
  return <Database {...iconProps} />;
}

function activeToolNames(status: PrithaRealtimeStatus | null) {
  return status?.tools?.length
    ? status.tools
    : [
        "full_pritha_memory",
        "inspect_pritha_files",
        "inspect_codex_task",
        "recall_rolling_summary",
        "record_good_state_signal",
        "answer_codex_task",
        "confirm_voice_intake",
        "web_search",
        "read_page",
        "research_start",
        "research_status",
        "research_cancel",
        "run_codex_task",
      ];
}

type ActiveToolDetail = {
  label: string;
  summary: string;
};

const ACTIVE_TOOL_DETAILS: Record<string, ActiveToolDetail> = {
  full_pritha_memory: {
    label: "Full Pritha Memory",
    summary: "Searches and reads curated Pritha knowledge: standards, decisions, workflows, child agents, and memory status.",
  },
  inspect_pritha_files: {
    label: "Inspect Pritha Files",
    summary: "Reads safe project files, folder trees, and text search results without changing the filesystem.",
  },
  inspect_codex_task: {
    label: "Inspect Voice Task",
    summary: "Checks task status, progress, approvals, stale state, and failure details.",
  },
  recall_rolling_summary: {
    label: "Rolling Summary",
    summary: "Recalls the summary-only handoff from the current or previous voice session.",
  },
  record_good_state_signal: {
    label: "Good State Signal",
    summary: "Captures positive operator acceptance as a private Good State Alignment signal.",
  },
  answer_codex_task: {
    label: "Answer Voice Task",
    summary: "Sends your spoken answer back to a task that is waiting for clarification.",
  },
  run_codex_task: {
    label: "Run Voice Task",
    summary: "Starts or queues deeper task work for implementation, research, review, or repo analysis.",
  },
  confirm_voice_intake: {
    label: "Confirm Voice Intake",
    summary: "Confirms, cancels, or clarifies pasted files and links before sending them to the task runtime.",
  },
  web_search: {
    label: "Web Search",
    summary: "Searches public web sources through the provider selected in Settings and returns sources and freshness warnings.",
  },
  read_page: { label: "Read Page", summary: "Reads a public source and returns bounded, untrusted text with its retrieval date." },
  research_start: { label: "Start Research", summary: "Starts a separate bounded research job after your explicit request." },
  research_status: { label: "Research Status", summary: "Shows research progress, sources, remaining budget, and the report." },
  research_cancel: { label: "Cancel Research", summary: "Stops the selected research job and preserves its checkpoint." },
};

function activeToolDetail(tool: string): ActiveToolDetail {
  return ACTIVE_TOOL_DETAILS[tool] ?? {
    label: tool
      .split("_")
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`)
      .join(" "),
    summary: "Realtime tool exposed by the current Voice session.",
  };
}

const CLIENT_INTAKE_MAX_FILES = 8;
const CLIENT_INTAKE_MAX_FILE_BYTES = 10 * 1024 * 1024;
const CLIENT_INTAKE_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

type VoiceIntakeUiStatus =
  | "idle"
  | "starting_voice"
  | "awaiting_instruction"
  | "asking_more"
  | "sending"
  | "submitted"
  | "cancelled"
  | "failed";

function fileSizeLabel(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function intakeLinksFromText(value: string) {
  return [...new Set(value.match(/https?:\/\/[^\s<>"')\]]+/g) || [])].slice(0, 20);
}

function textHasUrl(value: string) {
  return /https?:\/\/[^\s<>"')\]]+/i.test(value);
}

function isAudioIntakeFile(file: Pick<File, "name" | "type">) {
  if (/^audio\//i.test(file.type || "")) return true;
  return /\.(mp3|m4a|aac|wav|flac|ogg|opus)$/i.test(file.name || "");
}

function voiceIntakeStatusLabel(status: VoiceIntakeUiStatus) {
  return {
    idle: "Ready",
    starting_voice: "Starting voice...",
    awaiting_instruction: "Waiting for instruction",
    asking_more: "Clarifying",
    sending: "Processing intake",
    submitted: "Intake handled",
    cancelled: "Cancelled",
    failed: "Needs attention",
  }[status];
}

function ContextCard({
  status,
  stickyContextEnabled,
  sessionEventCount,
  onResetVoiceContext,
  mobile = false,
}: {
  status: PrithaRealtimeStatus | null;
  stickyContextEnabled: boolean;
  sessionEventCount: number;
  onResetVoiceContext: () => boolean;
  mobile?: boolean;
}) {
  const tools = activeToolNames(status);
  const memoryReady = Boolean(status?.memory.sqlite && status.memory.sqlite_cli && status.memory.available!==false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [openTool, setOpenTool] = useState<string | null>(null);
  const toolPopoverId = useId();
  const toolBlockRef = useRef<HTMLDivElement | null>(null);
  const selectedTool = openTool ? activeToolDetail(openTool) : null;

  useEffect(() => {
    if (!openTool) return;

    function onPointerDown(event: PointerEvent) {
      if (!toolBlockRef.current?.contains(event.target as Node)) setOpenTool(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenTool(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openTool]);

  return (
    <section className={mobile ? "mobile-info-card voice-context-card" : "side-card voice-context-card"}>
      <div className="card-title-row">
        <h2>Voice Context</h2>
        <span className={`inline-status ${stickyContextEnabled ? "green" : ""}`}>{stickyContextEnabled ? "Sticky" : "Off"}</span>
      </div>
      <div className="detail-block">
        <span className="muted-label">Sticky Focus</span>
        <strong className="accent-focus">
          <MemoryStick size={18} />
          {stickyContextEnabled ? "Auto session context" : "Disabled in settings"}
        </strong>
        <p>{memoryReady ? `${sessionEventCount} current-session events available to pin.` : status?.memory.state==='busy' ? 'The memory index is busy. Chat remains available.' : 'The memory index is temporarily unavailable. Saved sources are preserved.'}</p>
      </div>
      <div className="detail-block" ref={toolBlockRef}>
        <span className="muted-label">Active Tools</span>
        <div className={mobile ? "mobile-tool-row" : "tool-chip-row"}>
          {tools.map((tool) => {
            const detail = activeToolDetail(tool);
            const open = openTool === tool;
            return (
              <button
                className={`${mobile ? "mobile-tool-chip" : "tool-chip"} ${open ? "active" : ""}`}
                type="button"
                key={tool}
                title={detail.label}
                aria-label={`${detail.label}: ${detail.summary}`}
                aria-expanded={open}
                aria-controls={toolPopoverId}
                aria-describedby={open ? toolPopoverId : undefined}
                onClick={() => setOpenTool((current) => (current === tool ? null : tool))}
              >
                <ToolIcon tool={tool} />
              </button>
            );
          })}
          <span className="tool-count">{tools.length} active</span>
        </div>
        {selectedTool ? (
          <div className="tool-summary-popover" id={toolPopoverId} role="tooltip">
            <strong>{selectedTool.label}</strong>
            <p>{selectedTool.summary}</p>
            <code>{openTool}</code>
          </div>
        ) : null}
      </div>
      {confirmingReset ? (
        <div className="reset-confirmation">
          <p>Reset current voice context for this session?</p>
          <div>
            <button
              className="decline-button"
              type="button"
              onClick={() => setConfirmingReset(false)}
            >
              Cancel
            </button>
            <button
              className="approve-button"
              type="button"
              onClick={() => {
                if (onResetVoiceContext()) setConfirmingReset(false);
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      ) : (
        <button className="rail-link-button" type="button" disabled={!stickyContextEnabled} onClick={() => setConfirmingReset(true)}>
          Reset Voice Context
          <span>⌄</span>
        </button>
      )}
    </section>
  );
}

function TaskListCard({
  tasks,
  toolStatus,
  onOpenTask,
  onAbortTask,
  onApproveTask,
  onRejectTask,
}: {
  tasks: CodexTaskState[];
  toolStatus: string;
  onOpenTask: (taskId: string) => void;
  onAbortTask: (taskId: string) => void;
  onApproveTask: (taskId: string) => void;
  onRejectTask: (taskId: string) => void;
}) {
  const activeCount = tasks.filter((task) => !taskIsTerminal(task)).length;

  return (
    <section className="side-card task-list-card">
      <div className="card-title-row">
        <h2>Voice Tasks</h2>
        <span className={`inline-status ${activeCount ? "blue" : ""}`}>{activeCount ? `${activeCount} active` : "Idle"}</span>
      </div>
      {tasks.length ? (
        <div className="task-list">
          {tasks.map((task) => (
            <article className="task-list-row" key={task.id}>
              <div className="task-row-top">
                <div className="task-title-cell">
                  <span className="task-short-id">{taskShortLabel(task)}</span>
                  <strong>{task.title}</strong>
                </div>
                <span className={`inline-status ${taskStatusTone(task)}`}>{task.status}</span>
              </div>
              <div className="task-progress-row" title={task.progressDetail || undefined}>
                <div className="task-progress-track">
                  <span className="task-progress-fill" style={{ width: `${task.progress}%` }} />
                </div>
                <span>{task.progress}%</span>
              </div>
              <p>{task.resultExcerpt || task.summary}</p>
              {task.latestVoiceFeedback?.voice_text ? (
                <div className={`task-row-note ${task.latestVoiceFeedback.priority === "high" ? "" : "neutral"}`}>
                  Voice: {task.latestVoiceFeedback.voice_text}
                </div>
              ) : null}
              {task.parentTaskId ? <div className="task-row-note neutral">Continues: {parentTaskLabel(task)}</div> : null}
              <div className="task-phase-row">
                <span>{task.phase ? `phase: ${task.phase}` : "phase: unknown"}</span>
                <span>{formatThreadScope(task.threadScope)}</span>
                {task.threadRoutingMode ? <span>{`routing: ${task.threadRoutingMode}`}</span> : null}
                {task.stale ? <strong>possibly stale</strong> : null}
              </div>
              {task.lastActivity ? <div className="task-row-note neutral">Last activity: {task.lastActivity}</div> : null}
              {taskNeedsApproval(task) ? (
                <div className="task-approval-note">
                  <strong>{task.approval?.action_type || "Approval required"}</strong>
                  <span>{task.approval?.summary || "Approve this task before the task runtime starts."}</span>
                </div>
              ) : null}
              <div className="task-row-meta">
                <span>{formatTaskElapsed(task.createdAt, task.completedAt)}</span>
                <span>{task.handoffStatus ? `handoff: ${task.handoffStatus}` : "handoff: pending"}</span>
              </div>
              {task.handoffReason ? <div className="task-row-note">Reason: {task.handoffReason}</div> : null}
              <div className="task-row-actions">
                <button className="outline-button compact" type="button" onClick={() => onOpenTask(task.id)}>
                  Details
                </button>
                <button
                  className="decline-button compact"
                  type="button"
                  onClick={() => onAbortTask(task.id)}
                  disabled={taskIsTerminal(task)}
                  title={taskIsTerminal(task) ? "Task is already terminal" : "Abort this task"}
                >
                  <Square size={15} />
                  Abort
                </button>
                {taskNeedsApproval(task) ? (
                  <>
                    <button className="decline-button compact" type="button" onClick={() => onRejectTask(task.id)}>
                      <X size={16} />
                      Reject
                    </button>
                    <button className="approve-button compact" type="button" onClick={() => onApproveTask(task.id)}>
                      <Check size={16} />
                      Approve
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p>{toolStatus}</p>
      )}
      <p className="task-limit-note">Voice Tasks share the current NeuralDeep parallel limit with Task Chat; an unknown limit allows one active run.</p>
    </section>
  );
}

function formatGoodStateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "pending";
  return new Date(parsed).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function GoodStateCard({
  signals,
  onRefresh,
}: {
  signals: GoodStateSignalState[];
  onRefresh: () => void;
}) {
  const capturedCount = signals.length;

  return (
    <section className="side-card task-list-card good-state-card">
      <div className="card-title-row">
        <h2>Good State</h2>
        <span className={`inline-status ${capturedCount ? "green" : ""}`}>{capturedCount ? `${capturedCount} captured` : "Ready"}</span>
      </div>
      {signals.length ? (
        <div className="task-list">
          {signals.slice(0, 3).map((signal) => {
            const baseline = signal.alignment?.baselines?.[0];
            return (
              <article className="task-list-row" key={signal.id}>
                <div className="task-row-top">
                  <div className="task-title-cell">
                    <span className="task-short-id">
                      <Heart size={14} />
                    </span>
                    <strong>{signal.scope || "pritha"}</strong>
                  </div>
                  <span className="inline-status green">{signal.status.replace(/_/g, " ")}</span>
                </div>
                <p>{signal.operator_signal_preview || "Positive operator signal captured."}</p>
                <div className="task-phase-row">
                  <span>{formatGoodStateTime(signal.created_at)}</span>
                  <span>{signal.git?.head ? `HEAD ${signal.git.head}` : "HEAD pending"}</span>
                  <span>{signal.alignment?.status || "alignment pending"}</span>
                </div>
                {baseline?.tag || baseline?.title ? (
                  <div className="task-row-note neutral">
                    Baseline: {baseline.tag || baseline.title}
                  </div>
                ) : null}
                {signal.paths?.record ? <div className="task-row-note neutral">Record: {signal.paths.record}</div> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p>Positive voice signals will appear here before Git baseline finalization.</p>
      )}
      <div className="task-row-actions">
        <button className="outline-button compact" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="task-limit-note">Final Git/tag baseline still needs separate approval and checks.</p>
    </section>
  );
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return "None";
  return JSON.stringify(value, null, 2);
}

function TaskDetailDrawer({
  detail,
  loading,
  recoveryAction,
  onClose,
  onRefresh,
  onRecover,
}: {
  detail: CodexTaskDetail | null;
  loading: boolean;
  recoveryAction: "retry" | "resume" | "cancel" | null;
  onClose: () => void;
  onRefresh: () => void;
  onRecover: (action: "retry" | "resume" | "cancel") => void;
}) {
  if (!detail && !loading) return null;
  const paths = detail?.paths ? Object.entries(detail.paths) : [];
  const telemetry = detail?.telemetry || [];
  const recoveryAvailable = Boolean(detail?.task_chat && detail.recovery && Object.values(detail.recovery).some(Boolean));

  return (
    <div className="voice-drawer-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? onClose() : undefined)}>
      <aside className="voice-drawer" role="dialog" aria-modal="true" aria-label="Voice task details">
        <div className="voice-drawer-header">
          <div>
            <span className="muted-label">Voice Task</span>
            <h2>{detail?.short_id ? `#${detail.short_id}` : detail?.task_id || "Loading..."}</h2>
            {detail?.task_id ? <code className="drawer-subtitle">{detail.task_id}</code> : null}
          </div>
          <button className="icon-button" type="button" aria-label="Close task details" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {loading ? <p className="drawer-muted">Loading task details...</p> : null}
        {detail?.error ? <p className="drawer-error">{detail.error}</p> : null}
        {detail ? (
          <div className="drawer-stack">
            {detail.task_id ? <VoiceOperatorCard key={detail.task_id} taskId={detail.task_id} onChanged={onRefresh} /> : null}
            <div className="drawer-kv">
              <span>Status</span>
              <strong>{detail.status || "unknown"}</strong>
              <span>Short ID</span>
              <strong>{detail.short_id ? `#${detail.short_id}` : "unknown"}</strong>
              <span>Phase</span>
              <strong>{detail.phase || "unknown"}</strong>
              <span>Complete</span>
              <strong>{detail.complete ? "yes" : "no"}</strong>
              <span>Result</span>
              <strong>{detail.result_available ? "available" : "not yet"}</strong>
              <span>Thread</span>
              <strong>{formatThreadScope(detail.thread_scope)}</strong>
              <span>Parent task</span>
              <strong>{detail.parent_short_id ? `#${detail.parent_short_id}` : detail.parent_task_id || "none"}</strong>
              <span>Continuation</span>
              <strong>{typeof detail.continuation?.mode === "string" ? detail.continuation.mode : detail.continuation ? "linked" : "none"}</strong>
              <span>Routing</span>
              <strong>{detail.codex_app_thread_routing_mode || "unknown"}</strong>
              <span>Last activity</span>
              <strong>{detail.last_activity_at || "unknown"}</strong>
            </div>
            <section>
              <h3>Operator Brief</h3>
              <pre>{detail.operator_brief || detail.last_activity || "No brief available yet."}</pre>
            </section>
            <section>
              <h3>Voice Feedback</h3>
              <pre>{detail.latest_voice_feedback?.voice_text || formatJson(detail.latest_voice_feedback)}</pre>
            </section>
            <section>
              <h3>Request</h3>
              <pre>{formatJson(detail.request)}</pre>
            </section>
            <section>
              <h3>Status Detail</h3>
              <pre>{formatJson(detail.status_detail)}</pre>
            </section>
            {detail.approval ? (
              <section>
                <h3>Approval</h3>
                <pre>{formatJson(detail.approval)}</pre>
              </section>
            ) : null}
            <section>
              <h3>Result Excerpt</h3>
              {detail.result_read?.error==='file_preview_unavailable' ? <p role="status">The original result could not be read. Its saved file has been preserved.</p> : null}
              <pre>{detail.result_excerpt || "No result excerpt yet."}</pre>
              {detail.result_read?.truncated ? <p>This is a bounded preview. The full original remains in the task history and result file.</p> : null}
            </section>
            {detail.stderr_excerpt ? (
              <section>
                <h3>Stderr Excerpt</h3>
                <pre>{detail.stderr_excerpt}</pre>
              </section>
            ) : null}
            <section>
              <h3>Safe Paths</h3>
              <div className="drawer-path-list">
                {paths.length ? paths.map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <code>{value}</code>
                  </div>
                )) : <p className="drawer-muted">No paths available.</p>}
              </div>
            </section>
            <section>
              <h3>Telemetry</h3>
              <div className="drawer-event-list">
                {telemetry.length ? telemetry.slice(-12).map((event, index) => (
                  <div key={`${event.kind || "event"}-${index}`}>
                    <strong>{String(event.kind || "event")}</strong>
                    <span>{String(event.timestamp || "")}</span>
                    {event.reason ? <em>{String(event.reason)}</em> : null}
                  </div>
                )) : <p className="drawer-muted">No telemetry events for this task yet.</p>}
              </div>
            </section>
            <section>
              <h3>Progress Timeline</h3>
              <div className="drawer-event-list">
                {detail.progress_timeline?.length ? detail.progress_timeline.slice(-12).map((event, index) => (
                  <div key={`${event.phase || "progress"}-${index}`}>
                    <strong>{String(event.phase || "progress")}</strong>
                    <span>{String(event.timestamp || "")}</span>
                    {event.message ? <em>{String(event.message)}</em> : null}
                  </div>
                )) : <p className="drawer-muted">No progress events for this task yet.</p>}
              </div>
            </section>
          </div>
        ) : null}
        <div className="drawer-actions">
          {detail?.task_chat?.historyAvailable ? (
            <button className="approve-button compact" type="button" onClick={() => {
              const taskChat = detail.task_chat;
              if (taskChat?.chatId) beginTaskChatHandoff(taskChat.chatId);
              window.location.href = taskChat?.href || "/task-chat?group=voice_work";
            }}>
              Open in Task Chat
            </button>
          ) : detail?.task_chat ? <span className="drawer-muted">Task chat is temporarily unavailable for this runtime.</span> : detail?.task_id ? <span className="drawer-muted">{detail.complete ? "No persistent chat" : "Preparing task chat…"}</span> : null}
          {recoveryAvailable ? (
            <>
              {detail?.recovery?.resume ? <button className="secondary-button compact" type="button" onClick={() => onRecover("resume")} disabled={Boolean(recoveryAction)}>{recoveryAction === "resume" ? "Resuming…" : "Resume"}</button> : null}
              {detail?.recovery?.retry ? <button className="secondary-button compact" type="button" onClick={() => onRecover("retry")} disabled={Boolean(recoveryAction)}>{recoveryAction === "retry" ? "Retrying…" : "Retry"}</button> : null}
              {detail?.recovery?.cancel ? <button className="decline-button compact" type="button" onClick={() => onRecover("cancel")} disabled={Boolean(recoveryAction)}>{recoveryAction === "cancel" ? "Cancelling…" : "Cancel recovery"}</button> : null}
            </>
          ) : null}
          <button className="secondary-button compact" type="button" onClick={onRefresh} disabled={!detail?.task_id}>
            Refresh
          </button>
          <button className="outline-button compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function SessionCard({
  events,
  phase,
  memoryPromotion,
  onSendRecap,
  onOpenRecall,
  onPromoteMemory,
}: {
  events: VoiceSessionEvent[];
  phase: RealtimePhase;
  memoryPromotion: SessionMemoryPromotionState;
  onSendRecap: () => boolean;
  onOpenRecall: () => void;
  onPromoteMemory: () => void;
}) {
  const canSend = phaseIsActive(phase);
  const taskEvents = events.filter((event) => event.kind === "task").length;
  const latest = events.at(-1);
  const memoryLabel = memoryPromotion.status === "idle" ? "waiting" : memoryPromotion.status;

  return (
    <section className="side-card session-card">
      <div className="card-title-row">
        <h2>Current Session</h2>
        <span className="inline-status green">Private</span>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>Journal</dt>
          <dd>{events.length} events</dd>
        </div>
        <div>
          <dt>Tasks</dt>
          <dd>{taskEvents}</dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>{memoryLabel}</dd>
        </div>
      </dl>
      <p>{latest ? `Latest: ${latest.kind} at ${latest.timestamp}` : "Session journal is ready."}</p>
      {memoryPromotion.path ? <p className="session-memory-path">Saved: {memoryPromotion.path}</p> : null}
      {memoryPromotion.reason ? <p className="session-memory-path">Decision: {memoryPromotion.reason}</p> : null}
      <button className="rail-link-button" type="button" disabled={!events.length} onClick={onOpenRecall}>
        Earlier This Session
        <span>⌄</span>
      </button>
      <button className="rail-link-button" type="button" disabled={!events.length || memoryPromotion.status === "checking"} onClick={onPromoteMemory}>
        Promote Memory
        <span>⌄</span>
      </button>
      <button className="rail-link-button" type="button" disabled={!canSend || !events.length} onClick={onSendRecap}>
        Send Recap To Pritha
        <span>⌄</span>
      </button>
    </section>
  );
}

function buildSessionRecap(events: VoiceSessionEvent[]) {
  const taskEvents = events.filter((event) => event.kind === "task");
  const recent = events.slice(-8);
  const lines = [
    `Session events: ${events.length}`,
    `Task events: ${taskEvents.length}`,
    "Recent details:",
    ...recent.map((event) => `- ${event.timestamp} ${event.kind}${event.taskId ? ` ${event.taskId}` : ""}: ${event.text}`),
  ];
  return lines.join("\n");
}

function SessionRecallDrawer({
  events,
  open,
  phase,
  onClose,
  onSendRecap,
}: {
  events: VoiceSessionEvent[];
  open: boolean;
  phase: RealtimePhase;
  onClose: () => void;
  onSendRecap: () => boolean;
}) {
  const [query, setQuery] = useState("");
  if (!open) return null;

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? events.filter((event) => `${event.kind} ${event.status || ""} ${event.taskId || ""} ${event.text}`.toLowerCase().includes(normalized))
    : events;
  const canSend = phaseIsActive(phase) && events.length > 0;
  const recap = buildSessionRecap(events);

  return (
    <div className="voice-drawer-overlay" role="presentation" onMouseDown={(event) => (event.target === event.currentTarget ? onClose() : undefined)}>
      <aside className="voice-drawer" role="dialog" aria-modal="true" aria-label="Earlier this session">
        <div className="voice-drawer-header">
          <div>
            <span className="muted-label">Current Session</span>
            <h2>Earlier This Session</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close session recall" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="drawer-stack">
          <section>
            <h3>Search</h3>
            <input
              className="drawer-search-input"
              value={query}
              placeholder="Search current-session events, task ids, or result snippets"
              onChange={(event) => setQuery(event.target.value)}
            />
          </section>
          <section>
            <h3>Compact Recap</h3>
            <pre>{recap}</pre>
          </section>
          <section>
            <h3>Events</h3>
            <div className="drawer-session-list">
              {filtered.length ? filtered.slice(-60).reverse().map((event) => (
                <article key={event.id}>
                  <div>
                    <strong>{event.kind}</strong>
                    <span>{event.timestamp}</span>
                  </div>
                  {event.taskId ? <code>{event.taskId}</code> : null}
                  <p>{event.text}</p>
                </article>
              )) : <p className="drawer-muted">No matching session events.</p>}
            </div>
          </section>
        </div>
        <div className="drawer-actions">
          <button className="secondary-button compact" type="button" disabled={!canSend} onClick={onSendRecap}>
            Send Recap To Pritha
          </button>
          <button className="outline-button compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function PasteCommandPanel({
  sendText,
  phase,
  sessionId,
  voiceError,
  beginVoiceIntakeClarification,
  onCodexTaskCreated,
}: {
  sendText: (text: string) => boolean;
  phase: RealtimePhase;
  sessionId: string;
  voiceError?: string | null;
  beginVoiceIntakeClarification: PrithaRealtimeController["beginVoiceIntakeClarification"];
  onCodexTaskCreated: (taskId: string) => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pendingIntake, setPendingIntake] = useState<{ id: string; status: VoiceIntakeUiStatus } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sessionIdRef = useRef(sessionId);
  const canSend = phaseIsActive(phase);
  const routesToCodex = files.length > 0 || textHasUrl(text);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const intakeLocked = Boolean(pendingIntake && !["cancelled", "failed"].includes(pendingIntake.status));
  const canSubmit = !busy && !intakeLocked && (routesToCodex ? Boolean(text.trim() || files.length) : canSend && Boolean(text.trim()));

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!pendingIntake || pendingIntake.status === "failed" || phase !== "error") return;
    setPendingIntake((current) => (current?.id === pendingIntake.id ? { ...current, status: "failed" } : current));
    setNote(voiceError || "Voice Control could not start. The intake was not sent to the task runtime.");
  }, [pendingIntake, pendingIntake?.id, pendingIntake?.status, phase, voiceError]);

  function addFiles(nextFiles: Iterable<File>) {
    setNote("");
    setFiles((current) => {
      const merged = [...current];
      for (const file of nextFiles) {
        if (merged.length >= CLIENT_INTAKE_MAX_FILES) {
          setNote(`Too many files. Max ${CLIENT_INTAKE_MAX_FILES}.`);
          break;
        }
        if (file.size > CLIENT_INTAKE_MAX_FILE_BYTES) {
          setNote(`${file.name} is too large. Max ${fileSizeLabel(CLIENT_INTAKE_MAX_FILE_BYTES)}.`);
          continue;
        }
        if (merged.reduce((sum, item) => sum + item.size, 0) + file.size > CLIENT_INTAKE_MAX_TOTAL_BYTES) {
          setNote(`Files are too large. Max ${fileSizeLabel(CLIENT_INTAKE_MAX_TOTAL_BYTES)} total.`);
          continue;
        }
        merged.push(file);
      }
      return merged;
    });
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submitConfirmedCodexIntake(params: {
    intakeId: string;
    intakeText: string;
    intakeFiles: File[];
    confirmation: VoiceIntakeConfirmation;
  }): Promise<VoiceIntakeSubmitResult> {
    if (params.confirmation.intent === "music_local_folder") {
      return await submitConfirmedMusicImport(params);
    }
    setBusy(true);
    try {
      const form = new FormData();
      const confirmedSessionId = sessionIdRef.current;
      form.set("text", params.intakeText);
      form.set("session_id", confirmedSessionId);
      form.set("confirmation_intake_id", params.intakeId);
      form.set("confirmation_session_id", confirmedSessionId);
      form.set("confirmation_timestamp", new Date().toISOString());
      form.set("confirmed_instruction", params.confirmation.operator_instruction || "");
      form.set("confirmed_intent", params.confirmation.intent || "other");
      form.set("original_text_role", params.confirmation.original_text_role || "unknown");
      form.set("target_agent", params.confirmation.target_agent || "");
      form.set("persistence", params.confirmation.persistence || "none");
      form.set("confirmation_notes", params.confirmation.notes || "");
      for (const file of params.intakeFiles) form.append("files", file, file.name);
      const response = await fetch("/api/realtime/intake", { method: "POST", body: form });
      const payload = (await response.json().catch(() => ({ ok: false, error: "intake returned non-json" }))) as VoiceIntakeSubmitResult & {
        max_file_label?: string;
        max_total_label?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Intake failed with status ${response.status}`);
      }
      if (payload.task_id) {
        onCodexTaskCreated(payload.task_id);
      }
      setText("");
      setFiles([]);
      setNote(payload.operator_note || "Sent to the task runtime.");
      setPendingIntake(null);
      return payload;
    } finally {
      setBusy(false);
    }
  }

  async function submitConfirmedMusicImport(params: {
    intakeId: string;
    intakeText: string;
    intakeFiles: File[];
    confirmation: VoiceIntakeConfirmation;
  }): Promise<VoiceIntakeSubmitResult> {
    setBusy(true);
    try {
      const audioFiles = params.intakeFiles.filter(isAudioIntakeFile);
      if (!audioFiles.length) throw new Error("No supported audio files were attached for Local Folder import.");
      const skippedCount = params.intakeFiles.length - audioFiles.length;
      const form = new FormData();
      form.set("source", "voice-intake");
      form.set("source_intake_id", params.intakeId);
      form.set("session_id", sessionIdRef.current);
      form.set("operator_instruction", params.confirmation.operator_instruction || "");
      form.set("note", params.intakeText);
      for (const file of audioFiles) form.append("files", file, file.name);
      const response = await fetch("/api/music/library/import", { method: "POST", body: form });
      const payload = (await response.json().catch(() => ({ ok: false, error: "music import returned non-json" }))) as {
        ok?: boolean;
        importedCount?: number;
        skippedCount?: number;
        operator_note?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Music import failed with status ${response.status}`);
      }
      const importedCount = Number(payload.importedCount || audioFiles.length);
      const baseNote = payload.operator_note || `Imported ${importedCount} audio file(s) to the Music Local Folder library.`;
      const operatorNote = skippedCount ? `${baseNote} Skipped ${skippedCount} non-audio file(s).` : baseNote;
      setText("");
      setFiles([]);
      setNote(operatorNote);
      setPendingIntake(null);
      return {
        ok: true,
        status: "music_library_imported",
        mode: "music_local_folder",
        operator_note: operatorNote,
      };
    } finally {
      setBusy(false);
    }
  }

  function startVoiceIntakeClarification() {
    const intakeText = text.trim();
    const intakeFiles = [...files];
    const intakeId = `voice-intake-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const links = intakeLinksFromText(intakeText);
    const metadata: VoiceIntakeClarificationMetadata = {
      intakeId,
      textPreview: intakeText.replace(/\s+/g, " ").slice(0, 700),
      textLength: intakeText.length,
      links,
      files: intakeFiles.map((file, index) => ({
        id: `file-${index + 1}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      })),
      totalBytes: intakeFiles.reduce((sum, file) => sum + file.size, 0),
    };

    setPendingIntake({ id: intakeId, status: "starting_voice" });
    setNote("Starting Voice Control to clarify this intake before upload or import.");
    const started = beginVoiceIntakeClarification(metadata, {
      status: (status) => {
        setPendingIntake((current) => (current?.id === intakeId ? { ...current, status } : current));
        if (status === "awaiting_instruction") setNote("Pritha is waiting for your voice instruction before upload or import.");
        if (status === "sending") setNote("Confirmed. Processing intake.");
        if (status === "failed") setNote("Could not process intake.");
      },
      askMore: () => {
        setPendingIntake((current) => (current?.id === intakeId ? { ...current, status: "asking_more" } : current));
        setNote("Pritha is asking for one more clarification.");
      },
      cancel: () => {
        setPendingIntake({ id: intakeId, status: "cancelled" });
        setNote("Intake cancelled. Nothing was sent to the task runtime.");
      },
      submit: async (confirmation) => submitConfirmedCodexIntake({ intakeId, intakeText, intakeFiles, confirmation }),
    });
    if (started.status === "awaiting_instruction") setNote("Pritha is waiting for your voice instruction before upload or import.");
    if (started.status === "waiting_for_realtime_channel") setNote("Waiting for Voice Control data channel before asking for instructions.");
  }

  function submit() {
    if (!canSubmit) return;
    setNote("");
    if (routesToCodex) {
      startVoiceIntakeClarification();
      return;
    }
    const sent = sendText(text);
    if (sent) setText("");
  }

  return (
    <section
      className={`command-panel ${routesToCodex ? "codex-intake" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="card-title-row">
        <h2>Paste Command</h2>
        <span className={`inline-status ${routesToCodex ? "blue" : canSend ? "green" : ""}`}>
          {busy ? "Sending" : pendingIntake ? voiceIntakeStatusLabel(pendingIntake.status) : routesToCodex ? "Voice gate" : canSend ? "Live" : "Start voice"}
        </span>
      </div>
      <div className="command-input-row large">
        <textarea
          value={text}
          placeholder="Paste a command, link, screenshot, file, or context."
          disabled={busy || intakeLocked}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            if (busy || intakeLocked) return;
            const pastedFiles = Array.from(event.clipboardData.files || []);
            if (pastedFiles.length) addFiles(pastedFiles);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
          }}
        />
        <div className="command-button-stack">
          <button type="button" aria-label="Attach files" onClick={() => fileInputRef.current?.click()} disabled={busy || intakeLocked}>
            <Paperclip size={20} />
          </button>
          <button type="button" aria-label="Send command" onClick={submit} disabled={!canSubmit}>
            <SendHorizontal size={22} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (!busy && !intakeLocked && event.currentTarget.files) addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {files.length ? (
        <div className="command-file-list">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="command-file-chip">
              <span>{file.name}</span>
              <small>{fileSizeLabel(file.size)}</small>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeFile(index)} disabled={busy || intakeLocked}>
                <X size={14} />
              </button>
            </div>
          ))}
          <span className="command-file-total">{fileSizeLabel(totalBytes)} total</span>
        </div>
      ) : null}
      {pendingIntake ? (
        <div className={`command-intake-status ${pendingIntake.status}`}>
          <span>{voiceIntakeStatusLabel(pendingIntake.status)}</span>
          {pendingIntake.status === "cancelled" || pendingIntake.status === "failed" ? (
            <button type="button" onClick={() => setPendingIntake(null)}>
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      {note ? <p className="command-intake-note">{note}</p> : null}
    </section>
  );
}

function MicInputLevelControl({
  value,
  active,
  runtime,
  onChange,
}: {
  value: number;
  active: boolean;
  runtime: MicGainRuntimeState;
  onChange: (value: number) => void;
}) {
  function updateValue(event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) {
    onChange(Number(event.currentTarget.value));
  }

  const capture = active ? runtime.capture : undefined;
  const statusText = capture
    ? capture.paused ? "Microphone paused"
      : capture.stalled || capture.audioContextState !== "running" ? "Audio capture stalled — reconnect"
      : "Listening for speech"
    : !runtime.available
    ? "Unavailable on this device"
    : active && runtime.active
      ? "Live attenuation"
      : "Saved for next start";

  return (
    <label className="mic-gain-control" title={runtime.fallbackReason || runtime.audioContextState || undefined}>
      <span>Voice input level</span>
      <input
        aria-label="Voice input level"
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        onInput={updateValue}
        onChange={updateValue}
      />
      <strong>{Math.round(value)}%</strong>
      <small>
        {statusText}
        {capture ? <meter aria-label="Microphone signal" min="0" max="0.05" value={capture.paused ? 0 : capture.rms} style={{ width: 80, marginInlineStart: 8, verticalAlign: "middle" }} /> : null}
      </small>
    </label>
  );
}

function MusicLevelControl({
  value,
  enabled,
  source,
  streamKind,
  onChange,
}: {
  value: number;
  enabled: boolean;
  source: string;
  streamKind?: string;
  onChange: (value: number) => void;
}) {
  function updateValue(event: ChangeEvent<HTMLInputElement> | FormEvent<HTMLInputElement>) {
    onChange(musicPercentToUserVolume(Number(event.currentTarget.value)));
  }

  const percent = musicUserVolumeToPercent(value);
  const capabilities = musicSourceCapabilities(source);
  const statusText = !enabled
    ? "Saved for music"
    : streamKind === "decoded-radio"
      ? "Live radio level"
      : capabilities.programmaticVolume
        ? "Live source level"
        : "External stream";

  return (
    <label className="mic-gain-control music-level-control">
      <span>Music level</span>
      <input
        aria-label="Music level"
        type="range"
        min="0"
        max={MAX_MUSIC_LEVEL_PERCENT}
        step="1"
        value={percent}
        onChange={updateValue}
      />
      <strong>{percent}%</strong>
      <small>{statusText}</small>
    </label>
  );
}

function ConnectionCard({
  status,
  phase,
  latencyMs,
  remoteAudioReady,
  onReconnect,
}: {
  status: PrithaRealtimeStatus | null;
  phase: RealtimePhase;
  latencyMs: number | null;
  remoteAudioReady: boolean;
  onReconnect: () => void;
}) {
  const connected = phase === "listening" || phase === "speaking" || phase === "working";
  const statusLoaded = status !== null;
  const keyReady = (status?.voice_key_configured ?? status?.openai_key_configured) === true;
  const headerTone = connected || keyReady ? "green" : statusLoaded ? "orange" : "";
  const headerLabel = connected ? "Good" : keyReady ? "Ready" : statusLoaded ? "Needs key" : "Checking";
  const realtimeLabel = connected ? "Connected" : keyReady ? "Configured" : statusLoaded ? "Missing key" : "Checking";
  const codexLabel = status ? (status.codex.available ? `${status.codex.mode} ready` : "Waiting for NeuralDeep") : "Checking";

  return (
    <section className="side-card connection-card">
      <div className="card-title-row">
        <h2>Connection</h2>
        <span className={`inline-status ${headerTone}`}>{headerLabel}</span>
      </div>
      <dl className="compact-dl">
        <div>
          <dt>{status?.voice_transport === "neuraldeep_chained" ? "NeuralDeep Voice" : "Realtime"}</dt>
          <dd className={connected || keyReady ? "good" : ""}>{realtimeLabel}</dd>
        </div>
        <div>
          <dt>Task runtime</dt>
          <dd className={status?.codex.available ? "good" : ""}>{codexLabel}</dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{remoteAudioReady ? "Remote ready" : "Remote idle"}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{typeof latencyMs === "number" ? `${latencyMs} ms` : "Unknown"}</dd>
        </div>
      </dl>
      <button className="secondary-button compact" type="button" onClick={onReconnect}>
        Reconnect
      </button>
    </section>
  );
}

function VoiceSessionPanel({
  phase,
  elapsedSec,
  status,
  isMuted,
  micInputLevel,
  micGainRuntime,
  musicControlEnabled,
  musicVolume,
  musicSource,
  musicStreamKind,
  error,
  onPrimary,
  onMute,
  onMusicToggle,
  onMusicVolumeChange,
  onMicInputLevelChange,
  mobile = false,
}: {
  phase: RealtimePhase;
  elapsedSec: number;
  status: PrithaRealtimeStatus | null;
  isMuted: boolean;
  micInputLevel: number;
  micGainRuntime: MicGainRuntimeState;
  musicControlEnabled: boolean;
  musicVolume: number;
  musicSource: string;
  musicStreamKind?: string;
  error: string | null;
  onPrimary: () => void;
  onMute: () => void;
  onMusicToggle: () => void;
  onMusicVolumeChange: (value: number) => void;
  onMicInputLevelChange: (value: number) => void;
  mobile?: boolean;
}) {
  const model = status?.model || "gpt-realtime-2";
  const active = phaseIsActive(phase);
  const keyMissing = keyIsMissing(status);
  const primaryDisabled = phase === "idle" && keyMissing;
  const muteDisabled = !active || phase === "connecting";
  const muteTitle = muteDisabled ? "Mute becomes available after Start Listening connects the microphone." : "Toggle microphone mute.";
  const musicTitle = active
    ? "Enable or disable background music control for this voice session."
    : "Music control can be enabled before starting the voice session.";
  const gainActive = phase === "listening" || phase === "speaking" || phase === "working";

  if (mobile) {
    return (
      <section className="mobile-voice-card">
        <div className="mobile-voice-card-header">
          <h1 className="mobile-voice-title">Voice Control</h1>
          <div className="mobile-model-block">
            <span>Model</span>
            <strong className="mobile-model-name">{model}</strong>
            <span className="connection-quality">{keyStatusLabel(status, error)}</span>
          </div>
        </div>
        <VoiceVisualization phase={phase} mobile />
        <div className="mobile-voice-timer">{formatElapsed(elapsedSec)}</div>
        <div className="mobile-voice-subtitle">{subtitleForState(phase)}</div>
        <button className="mobile-voice-primary" type="button" onClick={onPrimary} disabled={primaryDisabled}>
          <PrimaryButtonIcon phase={phase} status={status} size={17} />
          {primaryButtonLabel(phase, status)}
        </button>
        <div className="mobile-voice-secondary-row">
          <button className="mobile-voice-secondary" type="button" onClick={onMute} disabled={muteDisabled} title={muteTitle}>
            {isMuted ? <Mic size={20} /> : <MicOff size={20} />}
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            className={`mobile-voice-secondary ${musicControlEnabled ? "active" : ""}`}
            type="button"
            onClick={onMusicToggle}
            title={musicTitle}
          >
            <Music size={20} />
            Music
          </button>
        </div>
        <MicInputLevelControl value={micInputLevel} active={gainActive} runtime={micGainRuntime} onChange={onMicInputLevelChange} />
        <MusicLevelControl
          value={musicVolume}
          enabled={musicControlEnabled}
          source={musicSource}
          streamKind={musicStreamKind}
          onChange={onMusicVolumeChange}
        />
      </section>
    );
  }

  return (
    <section className="voice-session-panel">
      <div className="voice-panel-top">
        <div>
          <span className="muted-label">Status</span>
          <strong className={`voice-state-label ${phase}`}>
            {stateLabel(phase)}
            <span className="tiny-wave" aria-hidden="true" />
          </strong>
        </div>
        <div className="voice-model-block">
          <span className="muted-label">Model</span>
          <strong>{model}</strong>
          <span className="connection-quality">{keyStatusLabel(status, error)}</span>
        </div>
      </div>
      <VoiceVisualization phase={phase} />
      <div className="voice-timer">{formatElapsed(elapsedSec)}</div>
      <div className="voice-subtitle">{subtitleForState(phase)}</div>
      <div className="voice-controls">
        <button className="voice-secondary-control" type="button" onClick={onMute} disabled={muteDisabled} title={muteTitle}>
          {isMuted ? <Mic size={22} /> : <MicOff size={22} />}
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button className="voice-primary-button" type="button" onClick={onPrimary} disabled={primaryDisabled}>
          <PrimaryButtonIcon phase={phase} status={status} size={18} />
          {primaryButtonLabel(phase, status)}
        </button>
        <button
          className={`voice-secondary-control ${musicControlEnabled ? "active" : ""}`}
          type="button"
          onClick={onMusicToggle}
          title={musicTitle}
        >
          <Music size={22} />
          Music
        </button>
      </div>
      <MicInputLevelControl value={micInputLevel} active={gainActive} runtime={micGainRuntime} onChange={onMicInputLevelChange} />
      <MusicLevelControl
        value={musicVolume}
        enabled={musicControlEnabled}
        source={musicSource}
        streamKind={musicStreamKind}
        onChange={onMusicVolumeChange}
      />
    </section>
  );
}

function MobileStatusChips({ status }: { status: PrithaRealtimeStatus | null }) {
  const codexReady = status?.codex.available === true;
  const realtimeReady = (status?.voice_key_configured ?? status?.openai_key_configured) === true;

  return (
    <div className="mobile-status-grid">
      <div className="mobile-status-chip">
        <span className="mobile-status-title">
          Pritha <span className="dot green" />
        </span>
        <strong className="mobile-status-value">Ready</strong>
      </div>
      <div className="mobile-status-chip">
        <span className="mobile-status-title">
          Task runtime <span className={`dot ${codexReady ? "green" : status ? "orange" : ""}`} />
        </span>
        <strong className={`mobile-status-value ${codexReady ? "" : "muted"}`}>{status ? (codexReady ? "Connected" : "Queue") : "Checking"}</strong>
      </div>
      <div className="mobile-status-chip">
        <span className="mobile-status-title">
          {status?.voice_transport === "neuraldeep_chained" ? "NeuralDeep Voice" : "Realtime"} <span className={`dot ${realtimeReady ? "green" : status ? "orange" : ""}`} />
        </span>
        <strong className={`mobile-status-value ${realtimeReady ? "" : "muted"}`}>{status ? (realtimeReady ? "Ready" : "Key") : "Checking"}</strong>
      </div>
    </div>
  );
}

export function VoiceControlPage({ status }: { status: ControlCenterStatus }) {
  const realtime = usePrithaRealtime();
  const [elapsedSec, setElapsedSec] = useState(0);
  const [taskDetail, setTaskDetail] = useState<CodexTaskDetail | null>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [taskRecoveryAction, setTaskRecoveryAction] = useState<"retry" | "resume" | "cancel" | null>(null);
  const [sessionRecallOpen, setSessionRecallOpen] = useState(false);
  const isActive = phaseIsActive(realtime.phase);
  const primaryAction = useMemo(
    () => () => {
      if (isActive) realtime.stop();
      else void realtime.start();
    },
    [isActive, realtime],
  );

  useEffect(() => {
    if (!isActive) {
      setElapsedSec(0);
      return undefined;
    }
    const interval = window.setInterval(() => setElapsedSec((value) => value + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  async function openTaskDetails(taskId: string) {
    setTaskDetailLoading(true);
    try {
      const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}`, { cache: "no-store" });
      const detail = (await response.json().catch(() => ({ ok: false, error: "Task details returned non-json" }))) as CodexTaskDetail;
      setTaskDetail(detail);
      void realtime.refreshCodexTask(taskId).catch(() => undefined); // The hook reports refresh failures.
    } catch {
      setTaskDetail({ ok: false, task_id: taskId, error: "Детали задачи пока недоступны. Повторите обновление." });
    } finally {
      setTaskDetailLoading(false);
    }
  }

  async function refreshVisibleTask(taskId: string) {
    const snapshot = await realtime.refreshCodexTask(taskId).catch(() => null);
    if (taskDetail?.task_id === taskId || snapshot?.task_id === taskDetail?.task_id) await openTaskDetails(taskId);
  }

  function displayedOperatorResponse(taskId: string) {
    const context = taskDetail?.task_id === taskId ? taskDetail.operator_request : realtime.codexTasks.find(task=>task.id===taskId)?.operatorRequest;
    return { operator_request_id: context?.request_id, topic_generation: context?.topic_generation, expected_revision: context?.revision };
  }

  async function decideCodexTask(taskId: string, action: "approve" | "reject") {
    const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...displayedOperatorResponse(taskId) }),
    });
    const result = (await response.json().catch(() => ({ ok: false, error: "approval returned non-json" }))) as CodexTaskDetail;
    if (response.ok) {
      await realtime.refreshCodexTask(taskId);
      if (action === "approve") realtime.watchCodexTask(taskId);
      if (taskDetail?.task_id === taskId || result.task_id === taskDetail?.task_id) await openTaskDetails(taskId);
    } else {
      setTaskDetail(result);
    }
  }

  async function abortCodexTask(taskId: string) {
    const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "operator_requested_from_task_card",
        expected_attempt_id: taskDetail?.task_id === taskId ? taskDetail.admission_attempt_id : realtime.codexTasks.find(task => task.id === taskId)?.admissionAttemptId }),
    });
    const result = (await response.json().catch(() => ({ ok: false, error: "abort returned non-json" }))) as CodexTaskDetail;
    if (response.ok) {
      const nextTaskId = result.task_id || taskId;
      await realtime.refreshCodexTask(nextTaskId);
      if (taskDetail?.task_id === taskId || result.task_id === taskDetail?.task_id) await openTaskDetails(taskId);
    } else {
      setTaskDetail(result);
    }
  }

  async function recoverCodexTask(taskId: string, action: "retry" | "resume" | "cancel") {
    setTaskRecoveryAction(action);
    try {
      const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...displayedOperatorResponse(taskId) }),
      });
      const result = (await response.json().catch(() => ({ ok: false, error: "recovery returned non-json" }))) as CodexTaskDetail;
      setTaskDetail(result.task_id ? result : { ...result, task_id: taskId });
      if (response.ok) {
        await realtime.refreshCodexTask(result.task_id || taskId);
        if (taskDetail?.task_id === taskId) await openTaskDetails(result.task_id || taskId);
        if (action !== "cancel") realtime.watchCodexTask(result.task_id || taskId);
      }
    } finally {
      setTaskRecoveryAction(null);
    }
  }

  function handleCodexTaskCreated(taskId: string) {
    realtime.watchCodexTask(taskId);
    void realtime.refreshCodexTask(taskId).catch(() => undefined);
  }

  return (
    <>
      {realtime.voiceAudioDraftReady && <div className="settings-rowline" role="status">
        <div><strong>Запись достигла 2 минут</strong><span>Аудио сохранено в этой вкладке. Отправьте запись целиком или удалите её.</span></div>
        <button className="outline-button" onClick={()=>void realtime.resolveVoiceAudioDraft(true)}>Отправить запись</button>
        <button className="outline-button" onClick={()=>void realtime.resolveVoiceAudioDraft(false)}>Удалить</button>
      </div>}
      <div className="mobile-voice-screen">
        <MobileStatusChips status={realtime.status} />
        <VoiceSessionPanel
          phase={realtime.phase}
          elapsedSec={elapsedSec}
          status={realtime.status}
          isMuted={realtime.isMuted}
          micInputLevel={realtime.micInputLevel}
          micGainRuntime={realtime.micGainRuntime}
          musicControlEnabled={realtime.music.controlEnabled}
          musicVolume={realtime.music.userVolume}
          musicSource={realtime.music.currentItem?.source || realtime.music.source}
          musicStreamKind={realtime.music.currentItem?.streamKind}
          error={realtime.error}
          onPrimary={primaryAction}
          onMute={realtime.toggleMute}
          onMusicToggle={realtime.toggleMusicControl}
          onMusicVolumeChange={(value) => void realtime.music.setMusicVolume(value, "ui")}
          onMicInputLevelChange={realtime.setMicInputLevel}
          mobile
        />
        <PasteCommandPanel
          sendText={realtime.sendTextMessage}
          phase={realtime.phase}
          sessionId={realtime.sessionId}
          voiceError={realtime.error}
          beginVoiceIntakeClarification={realtime.beginVoiceIntakeClarification}
          onCodexTaskCreated={handleCodexTaskCreated}
        />
        <TaskListCard
          tasks={realtime.codexTasks}
          toolStatus={realtime.toolStatus}
          onOpenTask={openTaskDetails}
          onAbortTask={(taskId) => void abortCodexTask(taskId)}
          onApproveTask={(taskId) => void decideCodexTask(taskId, "approve")}
          onRejectTask={(taskId) => void decideCodexTask(taskId, "reject")}
        />
        <GoodStateCard signals={realtime.goodStateSignals} onRefresh={() => void realtime.refreshGoodStateSignals()} />
        <SessionCard
          events={realtime.sessionEvents}
          phase={realtime.phase}
          memoryPromotion={realtime.sessionMemoryPromotion}
          onSendRecap={realtime.sendSessionRecap}
          onOpenRecall={() => setSessionRecallOpen(true)}
          onPromoteMemory={() => void realtime.promoteSessionMemory("manual")}
        />
        <ContextCard
          status={realtime.status}
          stickyContextEnabled={realtime.stickyContextEnabled}
          sessionEventCount={realtime.sessionEvents.length}
          onResetVoiceContext={realtime.resetVoiceContext}
          mobile
        />
      </div>
      <div className="voice-desktop-content">
        <PageHeader title="Voice Control" subtitle="Talk to Pritha. Give commands. Get things done." variant="voice" status={status} />
        <div className="voice-layout">
          <main className="voice-main">
            <VoiceSessionPanel
              phase={realtime.phase}
              elapsedSec={elapsedSec}
              status={realtime.status}
              isMuted={realtime.isMuted}
              micInputLevel={realtime.micInputLevel}
              micGainRuntime={realtime.micGainRuntime}
              musicControlEnabled={realtime.music.controlEnabled}
              musicVolume={realtime.music.userVolume}
              musicSource={realtime.music.currentItem?.source || realtime.music.source}
              musicStreamKind={realtime.music.currentItem?.streamKind}
              error={realtime.error}
              onPrimary={primaryAction}
              onMute={realtime.toggleMute}
              onMusicToggle={realtime.toggleMusicControl}
              onMusicVolumeChange={(value) => void realtime.music.setMusicVolume(value, "ui")}
              onMicInputLevelChange={realtime.setMicInputLevel}
            />
            <PasteCommandPanel
              sendText={realtime.sendTextMessage}
              phase={realtime.phase}
              sessionId={realtime.sessionId}
              voiceError={realtime.error}
              beginVoiceIntakeClarification={realtime.beginVoiceIntakeClarification}
              onCodexTaskCreated={handleCodexTaskCreated}
            />
          </main>
          <aside className="voice-rail">
            <TaskListCard
              tasks={realtime.codexTasks}
              toolStatus={realtime.toolStatus}
              onOpenTask={openTaskDetails}
              onAbortTask={(taskId) => void abortCodexTask(taskId)}
              onApproveTask={(taskId) => void decideCodexTask(taskId, "approve")}
              onRejectTask={(taskId) => void decideCodexTask(taskId, "reject")}
            />
            <GoodStateCard signals={realtime.goodStateSignals} onRefresh={() => void realtime.refreshGoodStateSignals()} />
            <SessionCard
              events={realtime.sessionEvents}
              phase={realtime.phase}
              memoryPromotion={realtime.sessionMemoryPromotion}
              onSendRecap={realtime.sendSessionRecap}
              onOpenRecall={() => setSessionRecallOpen(true)}
              onPromoteMemory={() => void realtime.promoteSessionMemory("manual")}
            />
            <ConnectionCard
              status={realtime.status}
              phase={realtime.phase}
              latencyMs={realtime.lastLatencyMs}
              remoteAudioReady={realtime.remoteAudioReady}
              onReconnect={() => {
                realtime.stop();
                void realtime.start();
              }}
            />
            <ContextCard
              status={realtime.status}
              stickyContextEnabled={realtime.stickyContextEnabled}
              sessionEventCount={realtime.sessionEvents.length}
              onResetVoiceContext={realtime.resetVoiceContext}
            />
          </aside>
        </div>
      </div>
      <TaskDetailDrawer
        detail={taskDetail}
        loading={taskDetailLoading}
        recoveryAction={taskRecoveryAction}
        onClose={() => setTaskDetail(null)}
        onRefresh={() => {
          if (taskDetail?.task_id) void refreshVisibleTask(taskDetail.task_id);
        }}
        onRecover={(action) => {
          if (taskDetail?.task_id) void recoverCodexTask(taskDetail.task_id, action);
        }}
      />
      <SessionRecallDrawer
        events={realtime.sessionEvents}
        open={sessionRecallOpen}
        phase={realtime.phase}
        onClose={() => setSessionRecallOpen(false)}
        onSendRecap={realtime.sendSessionRecap}
      />
    </>
  );
}
