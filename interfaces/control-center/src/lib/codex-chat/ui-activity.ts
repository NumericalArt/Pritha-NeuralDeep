import { createHash } from "node:crypto";
import { appendPrivateAuditEvent } from "@/lib/private-json";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { CodexChatGatewayError } from "./gateway";
import { CodexChatPrivateStore } from "./private-store";

const EVENTS = new Set([
  "thread_selected",
  "navigation_started",
  "history_loaded",
  "history_failed",
  "primary_navigation_started",
  "primary_navigation_completed",
  "primary_navigation_timeout",
  "thread_list_started",
  "thread_list_first_page_loaded",
  "thread_list_page_failed",
]);
const SOURCES = new Set(["voice_task_card", "history_row", "direct_link", "group_restore", "retry", "mobile_bottom_nav", "thread_list"]);
const STAGES = new Set(["navigation", "metadata", "history"]);
const CLIENT_CLASSES = new Set(["mobile", "tablet", "desktop", "unknown"]);
const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ERROR_CODE = /^[a-z0-9_]{1,64}$/;
const ROUTES = new Set(["voice", "agents", "task_chat", "settings", "other"]);
const GROUPS = new Set(["my_chats", "voice_work"]);
const INPUT_KEYS = new Set([
  "event",
  "chatId",
  "interactionId",
  "source",
  "stage",
  "durationMs",
  "errorCode",
  "clientClass",
  "fromRoute",
  "toRoute",
  "group",
  "count",
]);

export type TaskChatUiActivityInput = {
  event: string;
  chatId?: string;
  interactionId: string;
  source: string;
  stage?: string;
  durationMs?: number;
  errorCode?: string;
  clientClass?: string;
  fromRoute?: string;
  toRoute?: string;
  group?: string;
  count?: number;
};

function boundedDuration(value: unknown) {
  if (value == null) return null;
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0 || duration > 120_000) {
    throw new CodexChatGatewayError("invalid_request", "Telemetry duration must be between 0 and 120000 milliseconds.", 400);
  }
  return Math.round(duration);
}

export async function recordTaskChatUiActivity(input: TaskChatUiActivityInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry payload is invalid.", 400);
  }
  if (Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry contains an unsupported field.", 400);
  }
  if (!EVENTS.has(input.event) || !SAFE_ID.test(input.interactionId) || (input.chatId != null && !SAFE_ID.test(input.chatId))) {
    throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry identifiers are invalid.", 400);
  }
  if (!SOURCES.has(input.source)) throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry source is invalid.", 400);
  const stage = input.stage || "navigation";
  if (!STAGES.has(stage)) throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry stage is invalid.", 400);
  const clientClass = input.clientClass || "unknown";
  if (!CLIENT_CLASSES.has(clientClass)) throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry client class is invalid.", 400);
  const errorCode = String(input.errorCode || "");
  if (errorCode && !SAFE_ERROR_CODE.test(errorCode)) throw new CodexChatGatewayError("invalid_request", "Task Chat telemetry error code is invalid.", 400);
  if (input.fromRoute && !ROUTES.has(input.fromRoute)) throw new CodexChatGatewayError("invalid_request", "Telemetry source route is invalid.", 400);
  if (input.toRoute && !ROUTES.has(input.toRoute)) throw new CodexChatGatewayError("invalid_request", "Telemetry destination route is invalid.", 400);
  if (input.group && !GROUPS.has(input.group)) throw new CodexChatGatewayError("invalid_request", "Telemetry thread group is invalid.", 400);
  const count = input.count == null ? null : Number(input.count);
  if (count != null && (!Number.isInteger(count) || count < 0 || count > 50)) {
    throw new CodexChatGatewayError("invalid_request", "Telemetry item count is invalid.", 400);
  }

  const store = new CodexChatPrivateStore();
  const binding = input.chatId ? await store.get(input.chatId) : null;
  if (input.chatId && !binding) throw new CodexChatGatewayError("thread_not_found", "Chat not found.", 404);
  const root = resolveTechscopeRoot();
  await appendPrivateAuditEvent({
    stateRoot: resolvePrithaStateRoot(root),
    filePath: resolvePrithaStatePath("audit", "task-chat-ui-actions.jsonl"),
    event: {
      schema: "pritha-neuraldeep-control-center-ui-activity-v1",
      timestamp: new Date().toISOString(),
      event: input.event,
      interaction_id: input.interactionId,
      chat_ref: input.chatId ? createHash("sha256").update(input.chatId).digest("hex").slice(0, 24) : null,
      group: input.group || binding?.group || null,
      origin: binding?.origin || null,
      source: input.source,
      stage,
      client_class: clientClass,
      duration_ms: boundedDuration(input.durationMs),
      error_code: errorCode || null,
      from_route: input.fromRoute || null,
      to_route: input.toRoute || null,
      item_count: count,
    },
  });
  return { recorded: true };
}
