export const ROLLING_SUMMARY_SCHEMA_VERSION = "pritha-realtime-rolling-summary-v1";
export const ROLLING_SUMMARY_MAX_BYTES = 4_096;
export const ROLLING_SUMMARY_CONTEXT_MAX_BYTES = 1_800;
export const ROLLING_SUMMARY_DEBOUNCE_MS = 12_000;

const RAW_TRANSCRIPT_OMISSION = "[omitted raw transcript]";
const DEFAULT_TOPIC_KEY = "pritha-general";
const MIN_SUMMARY_BYTES = 1_300;
const MAX_SUMMARY_BYTES = 8_192;

const FIELD_LIMITS = {
  task: 260,
  currentStatus: 260,
  nextStep: 220,
  item: 180,
  sourceEvent: 80,
  sessionId: 120,
  sessionSummary: 420,
  sessionNextStep: 220,
  codexTaskId: 140,
  codexTitle: 220,
  codexStatus: 100,
  codexPhase: 100,
  codexSubject: 120,
  codexResult: 320,
  codexNextStep: 220,
};

const LIST_LIMITS = {
  keyRefs: 6,
  keyResources: 5,
  confirmedConstraints: 5,
  confirmedAccesses: 5,
  sessionKeyPoints: 4,
  sessionUserIntents: 3,
  codexRefs: 4,
};

const LIST_FIELDS = ["keyRefs", "keyResources", "confirmedConstraints", "confirmedAccesses"] as const;
const TEXT_FIELDS = ["task", "currentStatus", "nextStep"] as const;

export const ROLLING_SUMMARY_KEY_EVENTS = [
  "task_started",
  "task_switched",
  "session_started",
  "session_turn",
  "session_stopping",
  "page_unload_checkpoint",
  "important_resource",
  "confirmed_access",
  "confirmed_constraint",
  "decision_gate",
  "plan_created",
  "mode_selected",
  "step_started",
  "step_completed",
  "step_blocked",
  "operator_question",
  "completed",
  "failed",
  "failed_timeout",
  "fallback_started",
  "stale_repaired",
  "connection_lost",
  "manual_checkpoint",
  "periodic_checkpoint",
  "codex_task_complete",
  "codex_task_progress",
  "codex_task_approval_received",
  "codex_task_rejected",
  "sticky_context_reset",
] as const;

export type RollingSummaryCheckpoint = {
  schemaVersion: string;
  topicKey: string;
  updatedAt: string;
  task: string;
  currentStatus: string;
  keyRefs: string[];
  keyResources: string[];
  confirmedConstraints: string[];
  confirmedAccesses: string[];
  nextStep: string;
  latestRealtimeSession: RollingSummaryRealtimeSession;
  latestCodexTask: RollingSummaryCodexTask;
  sourceEvent?: string;
  privacy: "summary-only";
  sizeLimitBytes: number;
};

export type RollingSummaryRealtimeSession = {
  sessionId: string;
  updatedAt: string;
  summary: string;
  keyPoints: string[];
  userIntents: string[];
  nextStep: string;
};

export type RollingSummaryCodexTask = {
  taskId: string;
  title: string;
  status: string;
  phase: string;
  subject: string;
  result: string;
  refs: string[];
  nextStep: string;
};

export type RollingSummaryCheckpointInput = {
  topicKey?: unknown;
  updatedAt?: unknown;
  task?: unknown;
  currentStatus?: unknown;
  keyRefs?: unknown;
  keyResources?: unknown;
  confirmedConstraints?: unknown;
  confirmedAccesses?: unknown;
  nextStep?: unknown;
  latestRealtimeSession?: unknown;
  latestCodexTask?: unknown;
  sourceEvent?: unknown;
  maxBytes?: unknown;
};

export type RollingSummaryPrivacyFlags = {
  rawTranscriptOmitted: number;
  sensitiveRedacted: boolean;
  truncated: boolean;
};

export type RollingSummaryBuildResult = {
  checkpoint: RollingSummaryCheckpoint;
  serialized: string;
  byteLength: number;
  privacyFlags: RollingSummaryPrivacyFlags;
};

type SanitizedText = {
  text: string;
  rawTranscriptOmitted: number;
  sensitiveRedacted: boolean;
  truncated: boolean;
};

export type RollingSummaryDebounceInput = {
  topicKey?: unknown;
  sourceEvent?: unknown;
  nowMs?: unknown;
  lastWriteAtMs?: unknown;
  force?: unknown;
  debounceMs?: unknown;
};

export function isRollingSummaryKeyEvent(value: unknown) {
  return ROLLING_SUMMARY_KEY_EVENTS.includes(String(value || "") as (typeof ROLLING_SUMMARY_KEY_EVENTS)[number]);
}

export function rollingSummaryDebounceDecision(input: RollingSummaryDebounceInput = {}) {
  const sourceEvent = String(input.sourceEvent || "");
  if (!isRollingSummaryKeyEvent(sourceEvent)) {
    return { write: false, reason: "not_key_event", waitMs: 0 };
  }
  if (input.force === true) return { write: true, reason: "forced", waitMs: 0 };

  const debounceMs = Math.max(1_000, Math.min(Number(input.debounceMs) || ROLLING_SUMMARY_DEBOUNCE_MS, 120_000));
  const nowMs = Number(input.nowMs);
  const lastWriteAtMs = Number(input.lastWriteAtMs);
  if (!Number.isFinite(nowMs) || !Number.isFinite(lastWriteAtMs) || lastWriteAtMs <= 0) {
    return { write: true, reason: "no_recent_checkpoint", waitMs: 0 };
  }
  const elapsed = nowMs - lastWriteAtMs;
  if (elapsed >= debounceMs) return { write: true, reason: "debounce_elapsed", waitMs: 0 };
  return { write: false, reason: "debounced", waitMs: Math.max(0, debounceMs - elapsed) };
}

function compactWhitespace(value: unknown) {
  return String(value ?? "")
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rollingSummaryByteLength(value: unknown) {
  return new TextEncoder().encode(String(value ?? "")).length;
}

function trimToUtf8Bytes(value: string, maxBytes: number) {
  const limit = Math.max(0, Math.floor(Number(maxBytes) || 0));
  if (limit <= 0) return "";
  if (rollingSummaryByteLength(value) <= limit) return value;

  const suffix = "...";
  const suffixBytes = rollingSummaryByteLength(suffix);
  if (limit <= suffixBytes) return suffix.slice(0, limit);

  const chars = Array.from(value);
  let low = 0;
  let high = chars.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = chars.slice(0, mid).join("").trimEnd();
    if (rollingSummaryByteLength(candidate) + suffixBytes <= limit) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return `${best}${suffix}`;
}

export function normalizeRollingSummaryMaxBytes(value: unknown) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return ROLLING_SUMMARY_MAX_BYTES;
  return Math.max(MIN_SUMMARY_BYTES, Math.min(Math.round(raw), MAX_SUMMARY_BYTES));
}

export function normalizeRollingSummaryTopicKey(value: unknown, fallback = DEFAULT_TOPIC_KEY) {
  const text = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return text || fallback;
}

export function containsRawTranscript(value: unknown) {
  const text = String(value ?? "");
  if (!text.trim()) return false;
  const speakerPair = /(?:^|\n)\s*(?:user|assistant|operator|pritha|tool|system)\s*:\s+.+\n\s*(?:user|assistant|operator|pritha|tool|system)\s*:/i;
  return [
    /\b(?:raw|full|verbatim)\s+(?:transcript|transcription)\s*[:=]/i,
    /\b(?:session|voice)\s+(?:journal|transcript|transcription)\s+events?\s*[:=]/i,
    /\bSticky Context Update\s*:/i,
    /\bRecent voice session events\s*:/i,
    /\b(?:conversation\.item|response\.audio_transcript|input_audio_transcription|transcript_delta)\b/i,
    /(?:сырая|полная)\s+(?:стенограмма|расшифровка)\s*[:=]/i,
    speakerPair,
  ].some((pattern) => pattern.test(text));
}

function redactSensitiveText(value: string) {
  let text = value;
  text = text.replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/g, "[redacted-key]");
  text = text.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi, "[redacted-github-token]");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "Bearer [redacted]");
  text = text.replace(
    /((?:api[_-]?key|token|secret|password|credential|auth[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,
    "$1[redacted]",
  );
  text = text.replace(
    /("(?:api[_-]?key|token|secret|password|credential|auth[_-]?key)"\s*:\s*")[^"]+(")/gi,
    "$1[redacted]$2",
  );
  return text;
}

function trimText(value: string, maxChars: number) {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`, truncated: true };
}

export function sanitizeRollingSummaryText(value: unknown, maxChars = FIELD_LIMITS.item): SanitizedText {
  if (containsRawTranscript(value)) {
    return {
      text: RAW_TRANSCRIPT_OMISSION,
      rawTranscriptOmitted: 1,
      sensitiveRedacted: false,
      truncated: false,
    };
  }

  const compact = compactWhitespace(value);
  const redacted = redactSensitiveText(compact);
  const trimmed = trimText(redacted, Math.max(20, maxChars));
  return {
    text: trimmed.text,
    rawTranscriptOmitted: 0,
    sensitiveRedacted: redacted !== compact,
    truncated: trimmed.truncated,
  };
}

function requiredField(value: unknown, fallback: string, maxChars: number) {
  const sanitized = sanitizeRollingSummaryText(value, maxChars);
  return {
    ...sanitized,
    text: sanitized.text && sanitized.text !== RAW_TRANSCRIPT_OMISSION ? sanitized.text : fallback,
  };
}

function valuesFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/\r?\n|[;]+/);
  if (value === undefined || value === null) return [];
  return [value];
}

function itemList(value: unknown, maxItems: number) {
  const items: string[] = [];
  const seen = new Set<string>();
  const flags: RollingSummaryPrivacyFlags = {
    rawTranscriptOmitted: 0,
    sensitiveRedacted: false,
    truncated: false,
  };

  for (const raw of valuesFromUnknown(value)) {
    const sanitized = sanitizeRollingSummaryText(raw, FIELD_LIMITS.item);
    flags.rawTranscriptOmitted += sanitized.rawTranscriptOmitted;
    flags.sensitiveRedacted = flags.sensitiveRedacted || sanitized.sensitiveRedacted;
    flags.truncated = flags.truncated || sanitized.truncated;
    if (!sanitized.text || sanitized.text === RAW_TRANSCRIPT_OMISSION) continue;
    const key = sanitized.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(sanitized.text);
    if (items.length >= maxItems) break;
  }

  return { items, flags };
}

function objectFromUnknown(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringProp(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function stringPropUnlessDefault(record: Record<string, unknown>, defaults: string[], ...keys: string[]) {
  const value = stringProp(record, ...keys);
  const text = compactWhitespace(value);
  if (!text) return undefined;
  const defaultSet = new Set(defaults.map((item) => item.toLowerCase()));
  return defaultSet.has(text.toLowerCase()) ? undefined : value;
}

function listPropOrFallback(record: Record<string, unknown>, fallback: unknown, ...keys: string[]) {
  const value = stringProp(record, ...keys);
  if (value === undefined || value === null) return fallback;
  if (Array.isArray(value) && value.length === 0) return fallback;
  if (compactWhitespace(value) === "") return fallback;
  return value;
}

function optionalField(value: unknown, fallback: string, maxChars: number) {
  const sanitized = sanitizeRollingSummaryText(value, maxChars);
  return {
    ...sanitized,
    text: sanitized.text && sanitized.text !== RAW_TRANSCRIPT_OMISSION ? sanitized.text : fallback,
  };
}

function latestRealtimeSessionFromInput(value: unknown, fallback: Partial<RollingSummaryRealtimeSession> = {}) {
  const input = objectFromUnknown(value);
  const sessionId = optionalField(stringPropUnlessDefault(input, ["unknown"], "sessionId", "session_id"), fallback.sessionId || "unknown", FIELD_LIMITS.sessionId);
  const updatedAt = optionalField(stringProp(input, "updatedAt", "updated_at"), fallback.updatedAt || "", FIELD_LIMITS.item);
  const summary = optionalField(
    stringPropUnlessDefault(input, ["No Realtime session summary captured."], "summary"),
    fallback.summary || "No Realtime session summary captured.",
    FIELD_LIMITS.sessionSummary,
  );
  const keyPoints = itemList(listPropOrFallback(input, fallback.keyPoints, "keyPoints", "key_points"), LIST_LIMITS.sessionKeyPoints);
  const userIntents = itemList(listPropOrFallback(input, fallback.userIntents, "userIntents", "user_intents"), LIST_LIMITS.sessionUserIntents);
  const nextStep = optionalField(
    stringProp(input, "nextStep", "next_step"),
    fallback.nextStep || "Continue from the latest operator request if relevant.",
    FIELD_LIMITS.sessionNextStep,
  );

  return {
    section: {
      sessionId: sessionId.text,
      updatedAt: updatedAt.text,
      summary: summary.text,
      keyPoints: keyPoints.items,
      userIntents: userIntents.items,
      nextStep: nextStep.text,
    } satisfies RollingSummaryRealtimeSession,
    flags: mergeFlags(sessionId, updatedAt, summary, keyPoints.flags, userIntents.flags, nextStep),
  };
}

function latestCodexTaskFromInput(value: unknown, fallback: Partial<RollingSummaryCodexTask> = {}) {
  const input = objectFromUnknown(value);
  const taskId = optionalField(stringPropUnlessDefault(input, ["none"], "taskId", "task_id"), fallback.taskId || "none", FIELD_LIMITS.codexTaskId);
  const title = optionalField(stringPropUnlessDefault(input, ["No Codex task captured."], "title"), fallback.title || "No Codex task captured.", FIELD_LIMITS.codexTitle);
  const status = optionalField(stringPropUnlessDefault(input, ["unknown"], "status"), fallback.status || "unknown", FIELD_LIMITS.codexStatus);
  const phase = optionalField(stringPropUnlessDefault(input, ["unknown"], "phase"), fallback.phase || "unknown", FIELD_LIMITS.codexPhase);
  const subject = optionalField(stringPropUnlessDefault(input, ["unknown"], "subject"), fallback.subject || "unknown", FIELD_LIMITS.codexSubject);
  const result = optionalField(stringPropUnlessDefault(input, ["No Codex task result captured."], "result", "summary"), fallback.result || "No Codex task result captured.", FIELD_LIMITS.codexResult);
  const refs = itemList(listPropOrFallback(input, fallback.refs, "refs", "keyRefs", "key_refs"), LIST_LIMITS.codexRefs);
  const nextStep = optionalField(
    stringProp(input, "nextStep", "next_step"),
    fallback.nextStep || "Inspect or continue the latest Codex task only if the operator asks.",
    FIELD_LIMITS.codexNextStep,
  );

  return {
    section: {
      taskId: taskId.text,
      title: title.text,
      status: status.text,
      phase: phase.text,
      subject: subject.text,
      result: result.text,
      refs: refs.items,
      nextStep: nextStep.text,
    } satisfies RollingSummaryCodexTask,
    flags: mergeFlags(taskId, title, status, phase, subject, result, refs.flags, nextStep),
  };
}

function mergeFlags(...values: RollingSummaryPrivacyFlags[]) {
  return values.reduce<RollingSummaryPrivacyFlags>(
    (next, item) => ({
      rawTranscriptOmitted: next.rawTranscriptOmitted + item.rawTranscriptOmitted,
      sensitiveRedacted: next.sensitiveRedacted || item.sensitiveRedacted,
      truncated: next.truncated || item.truncated,
    }),
    { rawTranscriptOmitted: 0, sensitiveRedacted: false, truncated: false },
  );
}

function checkpointJson(checkpoint: RollingSummaryCheckpoint) {
  return JSON.stringify(checkpoint);
}

function copyCheckpoint(checkpoint: RollingSummaryCheckpoint): RollingSummaryCheckpoint {
  return {
    ...checkpoint,
    keyRefs: [...checkpoint.keyRefs],
    keyResources: [...checkpoint.keyResources],
    confirmedConstraints: [...checkpoint.confirmedConstraints],
    confirmedAccesses: [...checkpoint.confirmedAccesses],
    latestRealtimeSession: {
      ...checkpoint.latestRealtimeSession,
      keyPoints: [...checkpoint.latestRealtimeSession.keyPoints],
      userIntents: [...checkpoint.latestRealtimeSession.userIntents],
    },
    latestCodexTask: {
      ...checkpoint.latestCodexTask,
      refs: [...checkpoint.latestCodexTask.refs],
    },
  };
}

function longestListField(checkpoint: RollingSummaryCheckpoint) {
  return LIST_FIELDS.map((field) => ({ field, length: checkpoint[field].length }))
    .sort((a, b) => b.length - a.length)[0];
}

function longestTextField(checkpoint: RollingSummaryCheckpoint) {
  return TEXT_FIELDS.map((field) => ({ field, length: checkpoint[field].length }))
    .sort((a, b) => b.length - a.length)[0];
}

function trimNestedCheckpointField(checkpoint: RollingSummaryCheckpoint) {
  const nestedLists = [
    checkpoint.latestRealtimeSession.userIntents,
    checkpoint.latestRealtimeSession.keyPoints,
    checkpoint.latestCodexTask.refs,
  ].sort((a, b) => b.length - a.length);
  if (nestedLists[0]?.length > 0) {
    nestedLists[0].pop();
    return true;
  }

  const nestedTextFields = [
    {
      length: checkpoint.latestRealtimeSession.summary.length,
      trim: (nextLength: number) => {
        checkpoint.latestRealtimeSession.summary = trimText(checkpoint.latestRealtimeSession.summary, nextLength).text;
      },
    },
    {
      length: checkpoint.latestCodexTask.result.length,
      trim: (nextLength: number) => {
        checkpoint.latestCodexTask.result = trimText(checkpoint.latestCodexTask.result, nextLength).text;
      },
    },
    {
      length: checkpoint.latestCodexTask.status.length,
      trim: (nextLength: number) => {
        checkpoint.latestCodexTask.status = trimText(checkpoint.latestCodexTask.status, nextLength).text;
      },
    },
    {
      length: checkpoint.latestRealtimeSession.nextStep.length,
      trim: (nextLength: number) => {
        checkpoint.latestRealtimeSession.nextStep = trimText(checkpoint.latestRealtimeSession.nextStep, nextLength).text;
      },
    },
    {
      length: checkpoint.latestCodexTask.title.length,
      trim: (nextLength: number) => {
        checkpoint.latestCodexTask.title = trimText(checkpoint.latestCodexTask.title, nextLength).text;
      },
    },
    {
      length: checkpoint.latestCodexTask.nextStep.length,
      trim: (nextLength: number) => {
        checkpoint.latestCodexTask.nextStep = trimText(checkpoint.latestCodexTask.nextStep, nextLength).text;
      },
    },
  ].sort((a, b) => b.length - a.length);

  if (nestedTextFields[0] && nestedTextFields[0].length > 48) {
    nestedTextFields[0].trim(Math.max(48, Math.floor(nestedTextFields[0].length * 0.75)));
    return true;
  }

  return false;
}

export function enforceRollingSummarySize(checkpoint: RollingSummaryCheckpoint, maxBytes = checkpoint.sizeLimitBytes) {
  const limit = normalizeRollingSummaryMaxBytes(maxBytes);
  const candidate = copyCheckpoint({ ...checkpoint, sizeLimitBytes: limit });
  let truncated = false;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const serialized = checkpointJson(candidate);
    const byteLength = rollingSummaryByteLength(serialized);
    if (byteLength <= limit) {
      return { checkpoint: candidate, serialized, byteLength, truncated };
    }

    truncated = true;
    const listField = longestListField(candidate);
    if (listField.length > 0) {
      candidate[listField.field].pop();
      continue;
    }

    if (trimNestedCheckpointField(candidate)) continue;

    const textField = longestTextField(candidate);
    if (textField.length > 90) {
      const nextLength = Math.max(90, Math.floor(textField.length * 0.75));
      candidate[textField.field] = trimText(candidate[textField.field], nextLength).text;
      continue;
    }

    for (const field of TEXT_FIELDS) candidate[field] = trimText(candidate[field], 70).text;
  }

  const serialized = checkpointJson(candidate);
  return {
    checkpoint: candidate,
    serialized,
    byteLength: rollingSummaryByteLength(serialized),
    truncated: true,
  };
}

export function buildRollingSummaryCheckpoint(input: RollingSummaryCheckpointInput = {}): RollingSummaryBuildResult {
  const maxBytes = normalizeRollingSummaryMaxBytes(input.maxBytes);
  const task = requiredField(input.task, "Task summary not captured.", FIELD_LIMITS.task);
  const currentStatus = requiredField(input.currentStatus, "Status not captured.", FIELD_LIMITS.currentStatus);
  const nextStep = requiredField(input.nextStep, "Next step not captured.", FIELD_LIMITS.nextStep);
  const sourceEvent = sanitizeRollingSummaryText(input.sourceEvent, FIELD_LIMITS.sourceEvent);
  const keyRefs = itemList(input.keyRefs, LIST_LIMITS.keyRefs);
  const keyResources = itemList(input.keyResources, LIST_LIMITS.keyResources);
  const confirmedConstraints = itemList(input.confirmedConstraints, LIST_LIMITS.confirmedConstraints);
  const confirmedAccesses = itemList(input.confirmedAccesses, LIST_LIMITS.confirmedAccesses);
  const topicKey = normalizeRollingSummaryTopicKey(input.topicKey);
  const updatedAt = compactWhitespace(input.updatedAt) || new Date().toISOString();
  const legacySessionSummary =
    currentStatus.text !== "Status not captured."
      ? currentStatus.text
      : task.text !== "Task summary not captured."
        ? task.text
        : "No Realtime session summary captured.";
  const latestRealtimeSession = latestRealtimeSessionFromInput(input.latestRealtimeSession, {
    updatedAt,
    summary: legacySessionSummary,
    keyPoints: currentStatus.text !== "Status not captured." ? [currentStatus.text] : [],
    userIntents: task.text !== "Task summary not captured." ? [task.text] : [],
    nextStep: nextStep.text,
  });
  const latestCodexTask = latestCodexTaskFromInput(input.latestCodexTask, {
    taskId: topicKey,
    title: task.text,
    status: currentStatus.text,
    phase: sourceEvent.text || "legacy-handoff",
    subject: topicKey,
    result: currentStatus.text !== "Status not captured." ? currentStatus.text : task.text,
    refs: keyRefs.items,
    nextStep: nextStep.text,
  });

  const checkpoint: RollingSummaryCheckpoint = {
    schemaVersion: ROLLING_SUMMARY_SCHEMA_VERSION,
    topicKey,
    updatedAt,
    task: task.text,
    currentStatus: currentStatus.text,
    keyRefs: keyRefs.items,
    keyResources: keyResources.items,
    confirmedConstraints: confirmedConstraints.items,
    confirmedAccesses: confirmedAccesses.items,
    nextStep: nextStep.text,
    latestRealtimeSession: latestRealtimeSession.section,
    latestCodexTask: latestCodexTask.section,
    sourceEvent: sourceEvent.text && sourceEvent.text !== RAW_TRANSCRIPT_OMISSION ? sourceEvent.text : undefined,
    privacy: "summary-only",
    sizeLimitBytes: maxBytes,
  };

  const sizeResult = enforceRollingSummarySize(checkpoint, maxBytes);
  const privacyFlags = mergeFlags(
    task,
    currentStatus,
    nextStep,
    sourceEvent,
    keyRefs.flags,
    keyResources.flags,
    confirmedConstraints.flags,
    confirmedAccesses.flags,
    latestRealtimeSession.flags,
    latestCodexTask.flags,
    { rawTranscriptOmitted: 0, sensitiveRedacted: false, truncated: sizeResult.truncated },
  );

  return {
    checkpoint: sizeResult.checkpoint,
    serialized: sizeResult.serialized,
    byteLength: sizeResult.byteLength,
    privacyFlags,
  };
}

const STOP_TERMS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "task",
  "status",
  "current",
  "next",
  "step",
  "voice",
  "session",
  "realtime",
  "codex",
  "задача",
  "статус",
  "следующий",
  "шаг",
  "голос",
  "сессия",
]);

function relevanceTerms(value: unknown) {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !STOP_TERMS.has(term));
}

export function rollingSummaryRelevance(query: unknown, checkpoint: RollingSummaryCheckpoint, minScore = 2) {
  const queryTerms = new Set(relevanceTerms(query));
  const latestRealtimeSession = checkpoint.latestRealtimeSession || latestRealtimeSessionFromInput(undefined).section;
  const latestCodexTask = checkpoint.latestCodexTask || latestCodexTaskFromInput(undefined).section;
  const checkpointTerms = new Set(
    relevanceTerms([
      checkpoint.topicKey.replace(/-/g, " "),
      checkpoint.task,
      checkpoint.currentStatus,
      checkpoint.keyRefs.join(" "),
      checkpoint.keyResources.join(" "),
      checkpoint.confirmedConstraints.join(" "),
      checkpoint.confirmedAccesses.join(" "),
      checkpoint.nextStep,
      latestRealtimeSession.sessionId,
      latestRealtimeSession.summary,
      latestRealtimeSession.keyPoints.join(" "),
      latestRealtimeSession.userIntents.join(" "),
      latestRealtimeSession.nextStep,
      latestCodexTask.taskId,
      latestCodexTask.title,
      latestCodexTask.status,
      latestCodexTask.phase,
      latestCodexTask.subject,
      latestCodexTask.result,
      latestCodexTask.refs.join(" "),
      latestCodexTask.nextStep,
    ].join(" ")),
  );
  const matchedTerms = [...queryTerms].filter((term) => checkpointTerms.has(term)).slice(0, 16);
  const topicTerms = relevanceTerms(checkpoint.topicKey.replace(/-/g, " "));
  const topicScore = topicTerms.some((term) => queryTerms.has(term)) ? 1 : 0;
  const score = matchedTerms.length + topicScore;
  return {
    related: score >= minScore,
    score,
    matchedTerms,
  };
}

export function formatRollingSummaryForRealtime(checkpoint: RollingSummaryCheckpoint, maxBytes = ROLLING_SUMMARY_CONTEXT_MAX_BYTES) {
  const limit = Math.max(0, Math.floor(Number(maxBytes) || ROLLING_SUMMARY_CONTEXT_MAX_BYTES));
  const latestRealtimeSession = checkpoint.latestRealtimeSession || latestRealtimeSessionFromInput(undefined).section;
  const latestCodexTask = checkpoint.latestCodexTask || latestCodexTaskFromInput(undefined).section;
  const lines = [
    "Internal rolling summary checkpoint. Use only if it is relevant to the operator's current task.",
    `Latest Realtime session: ${latestRealtimeSession.summary}`,
    latestRealtimeSession.userIntents.length ? `Session user intents: ${latestRealtimeSession.userIntents.join("; ")}` : "",
    latestRealtimeSession.keyPoints.length ? `Session key points: ${latestRealtimeSession.keyPoints.join("; ")}` : "",
    `Session next step: ${latestRealtimeSession.nextStep}`,
    `Latest Codex task: ${latestCodexTask.title}`,
    `Codex task status: ${latestCodexTask.status}; phase: ${latestCodexTask.phase}; subject: ${latestCodexTask.subject}`,
    `Codex task result: ${latestCodexTask.result}`,
    latestCodexTask.refs.length ? `Codex task refs: ${latestCodexTask.refs.join("; ")}` : "",
    `Codex task next step: ${latestCodexTask.nextStep}`,
    `Task: ${checkpoint.task}`,
    `Current status: ${checkpoint.currentStatus}`,
    checkpoint.keyRefs.length ? `Key refs: ${checkpoint.keyRefs.join("; ")}` : "",
    checkpoint.keyResources.length ? `Key resources: ${checkpoint.keyResources.join("; ")}` : "",
    checkpoint.confirmedConstraints.length ? `Confirmed constraints: ${checkpoint.confirmedConstraints.join("; ")}` : "",
    checkpoint.confirmedAccesses.length ? `Confirmed accesses: ${checkpoint.confirmedAccesses.join("; ")}` : "",
    `Next step: ${checkpoint.nextStep}`,
  ].filter(Boolean);
  const compact = lines.join("\n");
  return trimToUtf8Bytes(compact, limit);
}
