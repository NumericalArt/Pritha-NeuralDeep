export type TaskChatUiActivityEvent = "thread_selected" | "navigation_started" | "history_loaded" | "history_failed";
export type TaskChatUiActivitySource = "voice_task_card" | "history_row" | "direct_link" | "group_restore" | "retry";
export type TaskChatUiActivityStage = "navigation" | "metadata" | "history";

export type TaskChatNavigationContext = {
  chatId: string;
  interactionId: string;
  source: TaskChatUiActivitySource;
  startedAt: number;
};

const HANDOFF_KEY = "pritha.taskChatNavigation";
const HANDOFF_MAX_AGE_MS = 2 * 60_000;

function clientClass() {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth <= 767) return "mobile";
  if (window.innerWidth <= 1024) return "tablet";
  return "desktop";
}

export function createTaskChatNavigation(chatId: string, source: TaskChatUiActivitySource): TaskChatNavigationContext {
  return { chatId, interactionId: crypto.randomUUID(), source, startedAt: Date.now() };
}

export function reportTaskChatUiActivity(
  context: TaskChatNavigationContext,
  event: TaskChatUiActivityEvent,
  options: { stage?: TaskChatUiActivityStage; durationMs?: number; errorCode?: string } = {},
) {
  if (typeof window === "undefined") return;
  void fetch("/api/codex-chat/v1/ui-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      chatId: context.chatId,
      interactionId: context.interactionId,
      source: context.source,
      stage: options.stage || "navigation",
      durationMs: options.durationMs,
      errorCode: options.errorCode,
      clientClass: clientClass(),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export function reportControlCenterUiActivity(input: {
  event: "primary_navigation_started" | "primary_navigation_completed" | "primary_navigation_timeout" | "thread_list_started" | "thread_list_first_page_loaded" | "thread_list_page_failed";
  interactionId: string;
  source: "mobile_bottom_nav" | "thread_list";
  durationMs?: number;
  errorCode?: string;
  fromRoute?: "voice" | "agents" | "task_chat" | "settings" | "other";
  toRoute?: "voice" | "agents" | "task_chat" | "settings" | "other";
  group?: "my_chats" | "voice_work";
  count?: number;
}) {
  if (typeof window === "undefined") return;
  void fetch("/api/codex-chat/v1/ui-activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, stage: "navigation", clientClass: clientClass() }),
    keepalive: true,
  }).catch(() => undefined);
}

export function beginTaskChatHandoff(chatId: string) {
  const context = createTaskChatNavigation(chatId, "voice_task_card");
  reportTaskChatUiActivity(context, "thread_selected", { stage: "navigation", durationMs: 0 });
  reportTaskChatUiActivity(context, "navigation_started", { stage: "navigation", durationMs: 0 });
  try { sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(context)); } catch { /* navigation remains functional without telemetry correlation */ }
  return context;
}

export function consumeTaskChatHandoff(chatId: string) {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch { return null; }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TaskChatNavigationContext>;
    if (value.chatId !== chatId || value.source !== "voice_task_card" || typeof value.interactionId !== "string" || typeof value.startedAt !== "number") return null;
    if (Date.now() - value.startedAt > HANDOFF_MAX_AGE_MS) return null;
    return value as TaskChatNavigationContext;
  } catch { return null; }
}
