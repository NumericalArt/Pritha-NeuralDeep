import { createHash } from "node:crypto";
import path from "node:path";
import type { ChatBinding } from "./private-store";
import type {
  ChatItemView,
  MessageView,
  RuntimeProviderView,
  ThreadStatus,
  ThreadSummary,
  TurnStatus,
  TurnView,
} from "./types";

export type ActiveAttemptSnapshot = {
  turnId: string;
  nativeTurnId: string;
  userText: string;
  startedAt: string;
  assistantText: string;
  clientMessageId?: string;
};

export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stableId(prefix: "turn" | "item", chatId: string, nativeId: string) {
  const digest = createHash("sha256").update(`${prefix}:${chatId}:${nativeId}`).digest("hex").slice(0, 24);
  return `${prefix}_${digest}`;
}

export function turnIdFor(chatId: string, nativeTurnId: string) {
  return stableId("turn", chatId, nativeTurnId);
}

export function itemIdFor(chatId: string, nativeItemId: string) {
  return stableId("item", chatId, nativeItemId);
}

function isoTimestamp(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1_000;
    return new Date(millis).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return fallback;
}

function boundedText(value: unknown, max: number) {
  return String(value || "").slice(0, max);
}

function safePathLabel(value: unknown, root: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  const relative = path.relative(root, absolute);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
  if (!relative) return ".";
  return path.basename(absolute);
}

function activeFlags(status: ThreadStatus) {
  return status === "active" ? (["streaming"] as ThreadSummary["activeFlags"]) : [];
}

export function threadStatusFromNative(value: unknown, archived = false): ThreadStatus {
  if (archived) return "archived";
  const status = asObject(value);
  const type = String(status?.type || value || "");
  if (type === "active") return "active";
  if (type === "idle") return "idle";
  if (type === "systemError") return "system_error";
  return "not_loaded";
}

export function summarizeThread(binding: ChatBinding, provider: RuntimeProviderView | null, nativeThread?: unknown): ThreadSummary {
  const native = asObject(nativeThread);
  const status = native ? threadStatusFromNative(native.status, false) : binding.lastStatus === "archived" ? "idle" : binding.lastStatus;
  const providerReady = provider?.availability === "ready";
  const identityMatches = Boolean(binding.providerId === "neuraldeep_cli" && binding.identityStatus !== "unverified" && binding.stateIdentityHash && provider?.stateIdentityHash === binding.stateIdentityHash);
  const compatibility = !providerReady
    ? "probe_required"
    : !binding.stateIdentityHash
      ? "probe_required"
      : identityMatches
        ? "bound"
        : "mismatch";
  return {
    chatId: binding.chatId,
    ...(binding.executionWorkspace ? {workspace:{mode:binding.executionWorkspace.mode,path:binding.workspacePath||binding.executionWorkspace.cwd,
      sourceDirty:Boolean(binding.executionWorkspace.sourceDirty),baseCommit:binding.executionWorkspace.baseCommit||null,applicationRequired:binding.executionWorkspace.mode==='worktree'}} : {}),
    title: binding.title,
    preview: binding.preview || boundedText(native?.preview, 500),
    group: binding.group,
    origin: binding.origin,
    status,
    activeFlags: activeFlags(status),
    pinned: binding.pinned,
    archived: binding.archived,
    historyKind: "mirrored",
    createdAt: isoTimestamp(native?.createdAt, binding.createdAt),
    updatedAt: isoTimestamp(native?.updatedAt, binding.updatedAt),
    runtime: {
      providerId: binding.providerId,
      version: provider?.version || null,
      protocol: "exec_resume",
      stateIdentityHash: provider?.stateIdentityHash || null,
      compatibility,
      provider: "neuraldeep",
      model: binding.modelId,
      sessionId: binding.nativeThreadId,
      providerState: binding.providerState,
    },
    taskLinks: binding.taskLinks,
    continuationState: status === "active"
      ? "blocked_active_turn"
      : compatibility === "mismatch"
        ? "blocked_runtime_mismatch"
        : compatibility !== "bound"
          ? "blocked_history_unavailable"
          : binding.continuationEnabled
            ? "continuation_enabled"
            : "read_only",
  };
}

export function normalizeCliItem(
  chatId: string,
  raw: unknown,
  root: string,
  createdAt: string,
): ChatItemView | null {
  const item = asObject(raw);
  if (!item) return null;
  const type = String(item.type || "");
  const mappedType: Record<string, string> = {
    agent_message: "agentMessage",
    reasoning: "reasoning",
    command_execution: "commandExecution",
    file_change: "fileChange",
    mcp_tool_call: "mcpToolCall",
    dynamic_tool_call: "dynamicToolCall",
    collab_agent_tool_call: "collabAgentToolCall",
    web_search: "webSearch",
    todo_list: "plan",
  };
  const status = String(item.status || "completed") === "in_progress" ? "inProgress" : item.status;
  const command = typeof item.command === "string" ? item.command : Array.isArray(item.command) ? item.command.map(String).join(" ") : "";
  return normalizeNativeItem(chatId, {
    ...item,
    type: mappedType[type] || type,
    status,
    command,
    cwd: item.cwd,
    aggregatedOutput: item.aggregated_output ?? item.aggregatedOutput,
    exitCode: item.exit_code ?? item.exitCode,
    changes: item.changes,
    summary: item.summary,
    text: item.text ?? item.message,
    tool: item.tool ?? item.name,
    query: item.query,
  }, root, createdAt);
}

// Only public response fields are eligible for history content endpoints.
// The complete protocol record is retained privately before normalization.
export function cliItemOriginalText(raw: unknown, normalized: ChatItemView): string | undefined {
  const item = asObject(raw);
  if (!item) return undefined;
  if (normalized.kind === "assistant_message") return String(item.text ?? item.message ?? "");
  if (normalized.kind === "command") {
    const command = Array.isArray(item.command) ? item.command.map(String).join(" ") : String(item.command ?? "");
    return [command, item.aggregated_output ?? item.aggregatedOutput].filter(value => value != null).join("\n\n");
  }
  if (normalized.kind === "file_change") return (Array.isArray(item.changes) ? item.changes : [])
    .map(entry => String(asObject(entry)?.diff ?? "")).filter(Boolean).join("\n");
  if (normalized.kind === "reasoning_summary") return Array.isArray(item.summary) ? item.summary.map(String).join("\n\n") : undefined;
  return undefined;
}

function itemStatus(value: unknown): ChatItemView["status"] {
  const raw = String(value || "");
  if (raw === "inProgress") return "in_progress";
  if (raw === "failed") return "failed";
  if (raw === "declined") return "declined";
  return "completed";
}

function userText(item: Record<string, unknown> | undefined) {
  const content = Array.isArray(item?.content) ? item.content : [];
  return content
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && entry.type === "text"))
    .map((entry) => String(entry.text || ""))
    .filter(Boolean)
    .join("\n\n");
}

function fileOperation(value: unknown): "add" | "modify" | "delete" | "rename" | "unknown" {
  const structured = asObject(value);
  if (structured?.type === "update" && (typeof structured.move_path === "string" || typeof structured.movePath === "string")) return "rename";
  const kind = String(structured?.type || value || "").toLowerCase();
  if (kind.includes("add") || kind.includes("create")) return "add";
  if (kind.includes("delete") || kind.includes("remove")) return "delete";
  if (kind.includes("rename") || kind.includes("move")) return "rename";
  if (kind.includes("update") || kind.includes("modify")) return "modify";
  return "unknown";
}

function planSteps(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((label) => ({ label: label.slice(0, 500), status: "completed" as const }));
}

export function normalizeNativeItem(
  chatId: string,
  raw: unknown,
  root: string,
  createdAt: string,
): ChatItemView | null {
  const item = asObject(raw);
  if (!item) return null;
  const nativeId = String(item.id || `${item.type || "unknown"}:${createdAt}`);
  const id = itemIdFor(chatId, nativeId);
  const base = {
    id,
    status: itemStatus(item.status),
    startedAt: createdAt,
    completedAt: item.status === "inProgress" ? null : createdAt,
  };
  const type = String(item.type || "");

  if (type === "userMessage" || type === "hookPrompt") return null;
  // CLI's built-in model catalog does not include NeuralDeep models. Its
  // fallback-metadata startup warning is non-terminal and repeats every turn;
  // do not present it as a failed tool. Preserve other diagnostic messages.
  if (type === "error") {
    const text = boundedText(item.text || item.message, 4_000).trim();
    if (/^Model metadata for `[^`]{1,160}` not found\. Defaulting to fallback metadata; this can degrade performance and cause issues\.$/.test(text)) return null;
    return text ? { ...base, kind: "notice", tone: "warning", text } : null;
  }
  if (type === "agentMessage") {
    const message: MessageView = {
      id,
      role: "assistant",
      ...(item.phase === "commentary" || item.phase === "final_answer" ? { phase: item.phase } : {}),
      markdown: boundedText(item.text, 256_000),
      status: item.status === "failed" ? "failed" : item.status === "inProgress" ? "streaming" : "completed",
      createdAt,
    };
    return { ...base, kind: "assistant_message", message };
  }
  if (type === "reasoning") {
    const summary = Array.isArray(item.summary) ? item.summary.map(String).join("\n\n") : "";
    return summary ? { ...base, kind: "reasoning_summary", markdown: boundedText(summary, 32_000) } : null;
  }
  if (type === "commandExecution") {
    return {
      ...base,
      kind: "command",
      commandPreview: boundedText(item.command, 4_000),
      cwdLabel: safePathLabel(item.cwd, root),
      outputPreview: item.aggregatedOutput == null ? null : boundedText(item.aggregatedOutput, 16_384),
      exitCode: Number.isFinite(Number(item.exitCode)) ? Number(item.exitCode) : null,
    };
  }
  if (type === "fileChange") {
    const changes = (Array.isArray(item.changes) ? item.changes : [])
      .map((entry) => asObject(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .slice(0, 100)
      .map((entry) => ({
        path: safePathLabel(entry.path, root) || "unknown",
        operation: fileOperation(entry.kind),
      }));
    const diffPreview = (Array.isArray(item.changes) ? item.changes : [])
      .map((entry) => boundedText(asObject(entry)?.diff, 16_384))
      .filter(Boolean)
      .join("\n")
      .slice(0, 65_536);
    return { ...base, kind: "file_change", changes, diffPreview: diffPreview || null };
  }
  if (type === "mcpToolCall" || type === "dynamicToolCall" || type === "collabAgentToolCall") {
    const toolName = boundedText(item.tool || type, 160);
    return {
      ...base,
      kind: "tool",
      toolName,
      displayName: toolName.replace(/[_-]+/g, " "),
      summary: item.server === "pritha_search" ? searchToolSummary(item) : item.status ? `Status: ${String(item.status)}` : null,
    };
  }
  if (type === "webSearch") {
    return { ...base, kind: "web_search", query: boundedText(item.query, 1_000), statusText: "Search completed" };
  }
  if (type === "plan") {
    return { ...base, kind: "plan", steps: planSteps(boundedText(item.text, 32_000)) };
  }
  if (type === "contextCompaction") {
    return { ...base, kind: "notice", tone: "info", text: "Codex compacted the conversation context." };
  }
  return { ...base, kind: "unsupported", label: boundedText(type || "Unsupported activity", 120) };
}

function turnStatus(value: unknown): TurnStatus {
  const raw = String(value || "");
  if (raw === "inProgress") return "in_progress";
  if (raw === "interrupted") return "interrupted";
  if (raw === "failed") return "failed";
  return "completed";
}

export function normalizeNativeTurn(
  binding: ChatBinding,
  raw: unknown,
  root: string,
  active?: ActiveAttemptSnapshot | null,
): TurnView | null {
  const turn = asObject(raw);
  const nativeTurnId = String(turn?.id || active?.nativeTurnId || "");
  if (!nativeTurnId) return null;
  const storedReceipt = Object.values(binding.messageReceipts).find((receipt) => receipt.nativeTurnId === nativeTurnId);
  const storedTurnId = storedReceipt?.turnId;
  const turnId = active?.turnId || storedTurnId || turnIdFor(binding.chatId, nativeTurnId);
  const startedAt = isoTimestamp(turn?.startedAt, active?.startedAt || binding.updatedAt || binding.createdAt);
  const completedAt = turn?.completedAt == null ? null : isoTimestamp(turn.completedAt, startedAt);
  const nativeItems = Array.isArray(turn?.items) ? turn.items : [];
  const userItem = nativeItems.map(asObject).find((item) => item?.type === "userMessage") || undefined;
  const nativeClientMessageId = /^[A-Za-z0-9_-]{8,128}$/.test(String(userItem?.clientId || ""))
    ? String(userItem?.clientId)
    : null;
  const text = active?.userText || userText(userItem) || "Codex request";
  const items = nativeItems
    .map((item) => normalizeNativeItem(binding.chatId, item, root, startedAt))
    .filter((item): item is ChatItemView => Boolean(item));

  if (active?.assistantText && !items.some((item) => item.kind === "assistant_message")) {
    const id = itemIdFor(binding.chatId, `${nativeTurnId}:streaming-assistant`);
    items.push({
      id,
      kind: "assistant_message",
      status: "in_progress",
      startedAt,
      completedAt: null,
      message: { id, role: "assistant", markdown: active.assistantText, status: "streaming", createdAt: startedAt },
    });
  }

  const nativeStatus = turnStatus(turn?.status);
  const status = active && nativeStatus === "in_progress" ? "in_progress" : nativeStatus;
  return {
    turnId,
    clientMessageId: active?.clientMessageId || storedReceipt?.clientMessageId || nativeClientMessageId,
    status,
    userMessage: {
      id: itemIdFor(binding.chatId, `${nativeTurnId}:user`),
      role: "user",
      markdown: text,
      status: "completed",
      createdAt: startedAt,
    },
    items,
    pendingRequestIds: [],
    startedAt,
    completedAt: status === "in_progress" ? null : completedAt || new Date().toISOString(),
    error: status === "failed" ? { code: "codex_turn_failed", message: "Codex could not complete this turn." } : null,
  };
}

function searchToolSummary(item: Record<string, unknown>): string {
  const result = asObject(item.result);
  const blocks = Array.isArray(result?.content) ? result.content : [];
  let payload: Record<string, unknown> | null = null;
  for (const block of blocks) { const b=asObject(block); if(b?.type === "text" && typeof b.text === "string") { try {payload=asObject(JSON.parse(b.text));} catch {} } }
  const args=asObject(item.arguments);
  const lines=[boundedText(args?.query,1000), `Provider: ${boundedText(payload?.provider,80) || "configured"} · ${boundedText(payload?.status || item.status,80)}`];
  if(Array.isArray(payload?.sources)) for(const raw of payload.sources.slice(0,10)) {const source=asObject(raw); try {const u=new URL(String(source?.url));if(u.protocol === "https:" && !u.username && !u.password)lines.push(`[${boundedText(source?.title,200).replace(/[\[\]\n]/g,"") || "Source"}](${u.href})`);}catch{}}
  return lines.filter(Boolean).join("\n\n");
}
