import { CodexTaskTimeoutError, CodexTaskUnavailableError } from "@/lib/codex-task/service"
import type { CodexTaskClient, CodexTaskPayload, CodexTaskRunOptions } from "@/lib/codex-task/types"

type CodexAppThreadClientOptions = {
  endpoint?: string
  threadId?: string
}

export class CodexAppThreadClient implements CodexTaskClient {
  private readonly endpoint: string
  private readonly threadId: string

  constructor(options: CodexAppThreadClientOptions = {}) {
    this.endpoint = options.endpoint || process.env.CODEX_APP_TASK_ENDPOINT || ""
    this.threadId = options.threadId || process.env.CODEX_APP_THREAD_ID || ""
  }

  async runTask(payload: CodexTaskPayload, options: Required<CodexTaskRunOptions>) {
    if (!this.endpoint) {
      throw new CodexTaskUnavailableError("CODEX_APP_TASK_ENDPOINT is not configured")
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: this.threadId || undefined,
          payload,
        }),
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => null)) as unknown
      if (!response.ok) {
        return {
          requestId: payload.requestId,
          status: "error",
          errors: [`Codex App thread endpoint returned HTTP ${response.status}`],
          warnings: [],
          data: body && typeof body === "object" ? (body as Record<string, unknown>) : undefined,
          transport: "codex-app-thread-http",
        }
      }
      return body
    } catch (error) {
      if (isAbortError(error)) {
        throw new CodexTaskTimeoutError(`Codex App task timed out after ${options.timeoutMs}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}
