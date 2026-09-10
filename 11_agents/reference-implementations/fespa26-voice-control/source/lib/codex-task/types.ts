export type CodexTaskStatus = "ok" | "error" | "timeout" | "unavailable" | "decision_required"

export type CodexTaskType =
  | "feed_refine"
  | "card_update"
  | "system_change"
  | "explicit"
  | "source_search"
  | "media_analysis"
  | "translation_pass"
  | "followup_checklist"

export type CodexTaskPayload = {
  requestId: string
  userId: string
  taskType: CodexTaskType
  userIntent: string
  projectContext: {
    project: "FESPA26"
    cwd: string
    interface: "realtime"
    focus: string[]
  }
  ids?: Record<string, string | string[] | number | number[] | null>
  data?: Record<string, unknown>
  constraints: string[]
  expectedResponse: {
    format: "json"
    schema: Record<string, unknown>
  }
}

export type CodexTaskResult = {
  requestId: string
  status: CodexTaskStatus
  text?: string
  data?: Record<string, unknown>
  errors: string[]
  warnings: string[]
  startedAt: string
  finishedAt: string
  transport?: string
}

export type CodexTaskRunOptions = {
  timeoutMs?: number
  retries?: number
  userId?: string
}

export interface CodexTaskClient {
  runTask(payload: CodexTaskPayload, options: Required<CodexTaskRunOptions>): Promise<unknown>
}
