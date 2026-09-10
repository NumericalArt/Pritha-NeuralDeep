import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type {
  CodexTaskClient,
  CodexTaskPayload,
  CodexTaskResult,
  CodexTaskRunOptions,
  CodexTaskStatus,
  CodexTaskType,
} from "@/lib/codex-task/types"

const DEFAULT_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.FESPA_CODEX_AUTO_TIMEOUT_MS) || 180_000,
)
const DEFAULT_RETRIES = Math.max(0, Number(process.env.FESPA_CODEX_AUTO_RETRIES) || 0)

export class CodexTaskUnavailableError extends Error {
  constructor(message = "Codex task transport is unavailable") {
    super(message)
    this.name = "CodexTaskUnavailableError"
  }
}

export class CodexTaskTimeoutError extends Error {
  constructor(message = "Codex task timed out") {
    super(message)
    this.name = "CodexTaskTimeoutError"
  }
}

export class UnavailableCodexTaskClient implements CodexTaskClient {
  async runTask(): Promise<unknown> {
    throw new CodexTaskUnavailableError()
  }
}

type RunTaskInput = {
  taskType: CodexTaskType
  userIntent: string
  ids?: CodexTaskPayload["ids"]
  data?: CodexTaskPayload["data"]
  constraints?: string[]
  expectedSchema: Record<string, unknown>
}

function clampText(value: string, max = 8_000) {
  const text = value.trim()
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeErrors(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 12)
    : []
}

export function validateCodexTaskResult(
  value: unknown,
  requestId: string,
  startedAt: string,
): CodexTaskResult {
  const finishedAt = new Date().toISOString()
  const raw = asObject(value)
  if (!raw) {
    return {
      requestId,
      status: "error",
      errors: ["Codex returned a non-object result"],
      warnings: [],
      startedAt,
      finishedAt,
    }
  }

  const status = raw.status
  const allowed: CodexTaskStatus[] = ["ok", "error", "timeout", "unavailable", "decision_required"]
  const normalizedStatus = allowed.includes(status as CodexTaskStatus)
    ? (status as CodexTaskStatus)
    : "error"
  const data = asObject(raw.data) || undefined
  const text = typeof raw.text === "string" ? raw.text.trim() : undefined
  const errors = normalizeErrors(raw.errors)
  const warnings = normalizeErrors(raw.warnings)

  if (normalizedStatus === "ok" && !text && !data) {
    return {
      requestId,
      status: "error",
      errors: ["Codex returned ok without text or data"],
      warnings,
      startedAt,
      finishedAt,
      transport: typeof raw.transport === "string" ? raw.transport : undefined,
    }
  }

  return {
    requestId,
    status: normalizedStatus,
    text,
    data,
    errors,
    warnings,
    startedAt,
    finishedAt,
    transport: typeof raw.transport === "string" ? raw.transport : undefined,
  }
}

export class CodexTaskService {
  constructor(
    private readonly client: CodexTaskClient,
    private readonly options: {
      cwd?: string
      logPath?: string
      defaultUserId?: string
    } = {},
  ) {}

  async runTask(input: RunTaskInput, options: CodexTaskRunOptions = {}): Promise<CodexTaskResult> {
    const requestId = randomUUID()
    const startedAt = new Date().toISOString()
    const normalizedOptions = {
      timeoutMs: Math.max(1_000, options.timeoutMs || DEFAULT_TIMEOUT_MS),
      retries: Math.max(0, options.retries ?? DEFAULT_RETRIES),
      userId: options.userId || this.options.defaultUserId || "single-operator",
    }
    const payload = this.buildPayload(requestId, normalizedOptions.userId, input)
    await this.logEvent({
      requestId,
      userId: normalizedOptions.userId,
      taskType: input.taskType,
      status: "started",
      timestamp: startedAt,
    })

    let lastError: unknown
    for (let attempt = 0; attempt <= normalizedOptions.retries; attempt += 1) {
      try {
        const raw = await this.client.runTask(payload, normalizedOptions)
        const result = validateCodexTaskResult(raw, requestId, startedAt)
        await this.logEvent({
          requestId,
          userId: normalizedOptions.userId,
          taskType: input.taskType,
          status: result.status,
          attempt,
          timestamp: result.finishedAt,
          warnings: result.warnings,
          errors: result.errors,
        })
        return result
      } catch (error) {
        lastError = error
        if (attempt < normalizedOptions.retries && shouldRetryError(error)) {
          continue
        }
        break
      }
    }

    const finishedAt = new Date().toISOString()
    const status = statusForError(lastError)
    const result: CodexTaskResult = {
      requestId,
      status,
      errors: [errorMessage(lastError)],
      warnings: ["Falling back to the local Codex job queue."],
      startedAt,
      finishedAt,
    }
    await this.logEvent({
      requestId,
      userId: normalizedOptions.userId,
      taskType: input.taskType,
      status,
      timestamp: finishedAt,
      errors: result.errors,
      warnings: result.warnings,
    })
    return result
  }

  private buildPayload(requestId: string, userId: string, input: RunTaskInput): CodexTaskPayload {
    return {
      requestId,
      userId,
      taskType: input.taskType,
      userIntent: clampText(input.userIntent),
      projectContext: {
        project: "FESPA26",
        cwd: this.options.cwd || process.cwd(),
        interface: "realtime",
        focus: ["Durst", "Flora", "Scodix", "PrintFactory", "FESPA 2026"],
      },
      ids: input.ids,
      data: sanitizeData(input.data || {}),
      constraints: [
        "Do not expose secrets, tokens, unpublished private files, or unnecessary raw media.",
        "Keep publication/deletion actions behind explicit operator approval.",
        "Return structured JSON only.",
        ...(input.constraints || []),
      ],
      expectedResponse: {
        format: "json",
        schema: input.expectedSchema,
      },
    }
  }

  private async logEvent(event: Record<string, unknown>) {
    const logPath =
      this.options.logPath || path.join(process.cwd(), "data", "logs", "codex-task-events.jsonl")
    await fs.promises.mkdir(path.dirname(logPath), { recursive: true })
    await fs.promises.appendFile(logPath, `${JSON.stringify(event)}\n`, "utf8")
  }
}

function sanitizeData(data: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const normalized = key.toLowerCase()
    if (
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("password") ||
      normalized.includes("api_key") ||
      normalized.includes("apikey")
    ) {
      continue
    }
    if (typeof value === "string") {
      sanitized[key] = clampText(value)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

function shouldRetryError(error: unknown) {
  if (error instanceof CodexTaskUnavailableError) return false
  if (error instanceof CodexTaskTimeoutError) return false
  return true
}

function statusForError(error: unknown): CodexTaskStatus {
  if (error instanceof CodexTaskTimeoutError) return "timeout"
  if (error instanceof CodexTaskUnavailableError) return "unavailable"
  return "error"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Codex task failed"
}
