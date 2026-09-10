export type CodexContinuationMode = "auto" | "force_new";

export type CodexContinuationConfidence = "none" | "low" | "medium" | "high";

export type CodexContinuationThreadScope = {
  kind?: string;
  id?: string;
  label?: string;
  source?: string;
  generation?: number;
};

export type CodexContinuationCandidate = {
  taskId: string;
  shortId?: string;
  status: string;
  taskType?: string;
  taskText?: string;
  resultExcerpt?: string;
  operatorBrief?: string;
  threadScope?: CodexContinuationThreadScope | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CodexContinuationRequest = {
  taskText: string;
  taskType?: string;
  threadScope?: CodexContinuationThreadScope | null;
  explicitTaskId?: string;
  mode?: CodexContinuationMode;
};

export type ScoredCodexContinuationCandidate = CodexContinuationCandidate & {
  score: number;
  confidence: CodexContinuationConfidence;
  reasons: string[];
};

export type CodexContinuationResolution =
  | {
      action: "new";
      confidence: "none";
      reason: string;
      candidates: ScoredCodexContinuationCandidate[];
    }
  | {
      action: "continue";
      confidence: "high";
      reason: string;
      selected: ScoredCodexContinuationCandidate;
      candidates: ScoredCodexContinuationCandidate[];
    }
  | {
      action: "ask";
      confidence: "medium";
      reason: string;
      candidates: ScoredCodexContinuationCandidate[];
    };

const STOPPED_STATUSES = new Set(["complete", "failed", "failed_timeout", "failed_empty_result", "rejected", "aborted"]);
const BLOCKED_STATUSES = new Set(["decision_required", "waiting_for_operator"]);
const ACTIVE_STATUSES = new Set(["running", "queued"]);

const CONTINUATION_CUE_RE =
  /\b(continue|continuation|followup|follow-up|resume|same task|same thread|next step|carry on|pick up|finish|fix|repair|retry|rerun)\b|(?:продолж|додел|доработ|почин|исправ|вернись|возобнов|та\s+же|ту\s+же|это\s+же|следующ(?:ий|ая|ее)\s+шаг|переоткрой|перезапусти)/i;

export function hasCodexContinuationCue(value: unknown) {
  return CONTINUATION_CUE_RE.test(String(value || ""));
}

export function isStoppedCodexTaskStatus(status: unknown) {
  return STOPPED_STATUSES.has(String(status || ""));
}

export function isBlockedCodexTaskStatus(status: unknown) {
  return BLOCKED_STATUSES.has(String(status || ""));
}

export function isActiveCodexTaskStatus(status: unknown) {
  return ACTIVE_STATUSES.has(String(status || ""));
}

export function scoreCodexTaskContinuation(
  request: CodexContinuationRequest,
  candidate: CodexContinuationCandidate,
  index = 0,
) {
  const reasons: string[] = [];
  const taskText = compactText(request.taskText, 8_000);
  const candidateText = compactText(
    [candidate.taskText, candidate.resultExcerpt, candidate.operatorBrief, candidate.threadScope?.label].filter(Boolean).join(" "),
    8_000,
  );
  const taskTextLower = taskText.toLowerCase();
  const continuationCue = hasCodexContinuationCue(taskText);
  let score = 0;

  if (candidate.taskId && taskTextLower.includes(candidate.taskId.toLowerCase())) {
    score += 100;
    reasons.push("task_id_mentioned");
  }

  const shortTaskId = normalizeTaskRef(candidate.shortId);
  if (shortTaskId && textMentionsToken(taskTextLower, shortTaskId)) {
    score += 80;
    reasons.push("short_task_id_mentioned");
  }

  if (sameThreadScope(request.threadScope, candidate.threadScope)) {
    score += 35;
    reasons.push("same_thread_scope");
  }

  if (request.taskType && candidate.taskType && request.taskType === candidate.taskType) {
    score += 4;
    reasons.push("same_task_type");
  }

  const overlap = tokenOverlapScore(taskText, candidateText);
  if (overlap > 0) {
    score += overlap;
    reasons.push(`text_overlap_${overlap}`);
  }

  if (continuationCue) {
    score += index === 0 ? 28 : 16;
    reasons.push("continuation_cue");
  }

  if (isStoppedCodexTaskStatus(candidate.status)) {
    score += 7;
    reasons.push("stopped_task");
  } else if (isBlockedCodexTaskStatus(candidate.status)) {
    score += 3;
    reasons.push("blocked_task");
  }

  if (score > 0 && (continuationCue || overlap > 0 || reasons.includes("same_thread_scope") || reasons.includes("task_id_mentioned"))) {
    const recency = Math.max(0, 12 - index * 3);
    if (recency) {
      score += recency;
      reasons.push(`recency_${recency}`);
    }
  }

  const confidence: CodexContinuationConfidence = score >= 65 ? "high" : score >= 45 ? "medium" : score > 0 ? "low" : "none";
  return {
    ...candidate,
    score,
    confidence,
    reasons,
  } satisfies ScoredCodexContinuationCandidate;
}

export function resolveCodexTaskContinuation(
  request: CodexContinuationRequest,
  candidates: CodexContinuationCandidate[],
): CodexContinuationResolution {
  if (request.mode === "force_new") {
    return { action: "new", confidence: "none", reason: "force_new_requested", candidates: [] };
  }

  const safeCandidates = candidates.filter((candidate) => candidate.taskId);
  const explicitTaskId = normalizeTaskRef(request.explicitTaskId);
  if (explicitTaskId) {
    const explicit = safeCandidates.find((candidate) => {
      const taskId = normalizeTaskRef(candidate.taskId);
      const shortId = normalizeTaskRef(candidate.shortId);
      return taskId === explicitTaskId || shortId === explicitTaskId;
    });
    if (!explicit) return { action: "ask", confidence: "medium", reason: "explicit_task_not_found", candidates: [] };
    const explicitReason = normalizeTaskRef(explicit.shortId) === explicitTaskId ? "explicit_short_task_id" : "explicit_task_id";
    const selected = {
      ...scoreCodexTaskContinuation(request, explicit, 0),
      score: 100,
      confidence: "high" as const,
      reasons: [explicitReason],
    };
    return {
      action: "continue",
      confidence: "high",
      reason: explicitReason,
      selected,
      candidates: [selected],
    };
  }

  const scored = safeCandidates
    .map((candidate, index) => scoreCodexTaskContinuation(request, candidate, index))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, 5);

  const top = scored[0];
  if (!top || top.score < 35) {
    return { action: "new", confidence: "none", reason: "no_suitable_continuation_candidate", candidates: scored };
  }

  const second = scored[1];
  const margin = top.score - (second?.score || 0);
  const singleVagueContinuation = hasCodexContinuationCue(request.taskText) && scored.length === 1 && top.score >= 45;
  const sameSubjectNearTie = Boolean(
    second &&
      sameThreadScope(top.threadScope, second.threadScope) &&
      top.confidence === "high" &&
      second.confidence === "high" &&
      margin < 20 &&
      !request.explicitTaskId,
  );
  const highConfidence = top.score >= 65 && !sameSubjectNearTie && (margin >= 12 || top.score >= 95 || singleVagueContinuation);
  if (highConfidence) {
    return {
      action: "continue",
      confidence: "high",
      reason: singleVagueContinuation ? "single_recent_continuation_candidate" : "high_confidence_match",
      selected: top,
      candidates: scored,
    };
  }

  return {
    action: "ask",
    confidence: "medium",
    reason: second && margin < 12 ? "ambiguous_continuation_candidates" : "medium_confidence_match",
    candidates: scored,
  };
}

function compactText(value: unknown, maxChars: number) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length <= maxChars ? text : text.slice(0, maxChars).trim();
}

function normalizeTaskRef(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textMentionsToken(textLower: string, tokenLower: string) {
  if (!tokenLower) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(tokenLower)}(?=$|[^a-z0-9])`, "i").test(textLower);
}

function sameThreadScope(left?: CodexContinuationThreadScope | null, right?: CodexContinuationThreadScope | null) {
  const leftKind = String(left?.kind || "");
  const rightKind = String(right?.kind || "");
  const leftId = String(left?.id || "");
  const rightId = String(right?.id || "");
  return Boolean(leftKind && rightKind && leftId && rightId && leftKind === rightKind && leftId === rightId);
}

function significantTokens(value: string) {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "task",
    "codex",
    "voice",
    "control",
    "continue",
    "продолжи",
    "продолжить",
    "задачу",
    "это",
    "эту",
    "кодекс",
  ]);
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !stop.has(token)),
  );
}

function tokenOverlapScore(left: string, right: string) {
  const leftTokens = significantTokens(left);
  const rightTokens = significantTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  if (!overlap) return 0;

  const ratio = overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  return Math.min(34, Math.round(overlap * 5 + ratio * 14));
}
