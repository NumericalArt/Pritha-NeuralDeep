export type PrithaCodexTaskStatus = "ok" | "error" | "timeout" | "unavailable" | "decision_required";

export type PrithaCodexTaskType = "analysis" | "research" | "implementation" | "review" | "agent_creation" | "system_change";

export type PrithaCodexThreadScopeKind = "agent" | "pritha" | "task" | "control";

export type PrithaCodexThreadScopeSource = "explicit" | "derived" | "fallback" | "override";

export type PrithaCodexThreadScope = {
  kind: PrithaCodexThreadScopeKind;
  id: string;
  label: string;
  source: PrithaCodexThreadScopeSource;
  generation: number;
};

export type PrithaCodexTaskPayload = {
  requestId: string;
  userId: string;
  taskType: PrithaCodexTaskType;
  userIntent: string;
  threadScope?: PrithaCodexThreadScope;
  projectContext: {
    project: "Pritha";
    cwd: string;
    interface: "realtime";
    focus: string[];
  };
  ids?: Record<string, string | string[] | number | number[] | null>;
  data?: Record<string, unknown>;
  constraints: string[];
  expectedResponse: {
    format: "json";
    schema: Record<string, unknown>;
  };
};

export type PrithaCodexTaskResult = {
  requestId: string;
  status: PrithaCodexTaskStatus;
  text?: string;
  data?: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  startedAt: string;
  finishedAt: string;
  transport?: string;
};

export type PrithaCodexTaskRunOptions = {
  timeoutMs: number;
  userId: string;
  signal?: AbortSignal;
  onProgress?: (event: PrithaCodexTaskProgressEvent) => void | Promise<void>;
};

export type PrithaCodexTaskClient = {
  runTask(payload: PrithaCodexTaskPayload, options: PrithaCodexTaskRunOptions): Promise<unknown>;
};

export type PrithaCodexTaskProgressEvent = {
  timestamp?: string;
  phase: string;
  level?: "info" | "warning" | "error" | "heartbeat" | "complete";
  message?: string;
  status?: string;
  transport?: string;
  elapsed_ms?: number;
  [key: string]: unknown;
};
