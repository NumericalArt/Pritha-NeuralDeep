import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

import { CodexTaskTimeoutError, CodexTaskUnavailableError } from "@/lib/codex-task/service"
import type { CodexTaskClient, CodexTaskPayload, CodexTaskRunOptions } from "@/lib/codex-task/types"
import {
  controlThreadName,
  getVoiceCodexThread,
  projectSlug,
  saveVoiceCodexThread,
} from "@/lib/codex-task/voice-codex-registry"

type CodexAppServerClientOptions = {
  codexBin?: string
  cwd?: string
  registryPath?: string
  branch?: string
  role?: "control"
}

type RpcMessage = {
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { message?: string; code?: number; data?: unknown }
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

type ResolvedThreadTarget = {
  threadId: string
  sessionId: string | null
  threadName: string
}

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "text", "data", "errors", "warnings"],
  properties: {
    status: { enum: ["ok", "error"] },
    text: { type: "string" },
    data: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "refs", "changedFiles", "nextActions", "structuredJson"],
      properties: {
        summary: { type: "string" },
        refs: { type: "array", items: { type: "string" } },
        changedFiles: { type: "array", items: { type: "string" } },
        nextActions: { type: "array", items: { type: "string" } },
        structuredJson: { type: "string" },
      },
    },
    errors: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const

export class CodexAppServerClient implements CodexTaskClient {
  private readonly codexBin: string
  private readonly cwd: string
  private readonly registryPath?: string
  private readonly branch: string
  private readonly role: "control"

  constructor(options: CodexAppServerClientOptions = {}) {
    this.codexBin = options.codexBin || process.env.CODEX_BIN?.trim() || "codex"
    this.cwd = path.resolve(options.cwd || process.cwd())
    this.registryPath = options.registryPath
    this.branch =
      options.branch || process.env.VOICE_CODEX_BRANCH?.trim() || currentBranch(this.cwd)
    this.role = options.role || "control"
  }

  async runTask(payload: CodexTaskPayload, options: Required<CodexTaskRunOptions>) {
    if (looksLikeMissingPath(this.codexBin) && !fs.existsSync(this.codexBin)) {
      throw new CodexTaskUnavailableError(`Codex binary not found: ${this.codexBin}`)
    }

    const connection = new AppServerConnection(this.codexBin, this.cwd)
    const startedAt = Date.now()
    let target: ResolvedThreadTarget | null = null
    let turnId = ""
    try {
      await connection.start(options.timeoutMs)
      await connection.request(
        "initialize",
        {
          clientInfo: { name: "fespa26-voice-control", version: "0.1" },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
            optOutNotificationMethods: [
              "thread/tokenUsage/updated",
              "item/reasoning/textDelta",
              "item/reasoning/summaryTextDelta",
            ],
          },
        },
        remainingMs(startedAt, options.timeoutMs),
      )

      target = await this.resolveControlThread(
        connection,
        remainingMs(startedAt, options.timeoutMs),
      )
      await this.injectThreadReport(
        connection,
        target.threadId,
        buildTaskReport("started", payload, { threadName: target.threadName }),
        remainingMs(startedAt, options.timeoutMs),
      )
      const prompt = buildPrompt(payload)
      const turnResponse = (await connection.request(
        "turn/start",
        {
          threadId: target.threadId,
          input: [{ type: "text", text: prompt, text_elements: [] }],
          cwd: this.cwd,
          approvalPolicy: "never",
          sandboxPolicy: sandboxPolicyForTask(payload.taskType, this.cwd),
          outputSchema: RESULT_SCHEMA,
          effort: effortForTask(payload.taskType),
          summary: "none",
          personality: "pragmatic",
        },
        remainingMs(startedAt, options.timeoutMs),
      )) as { turn?: { id?: string; items?: unknown[] } }

      turnId = String(turnResponse.turn?.id || "")
      if (!turnId) {
        throw new Error("Codex app-server did not return a turn id")
      }
      const completed = await connection.waitForTurnCompleted(
        target.threadId,
        turnId,
        remainingMs(startedAt, options.timeoutMs),
      )
      const text = extractAssistantText(completed) || connection.agentTextForTurn(turnId)
      const result = parseCodexJson(text)
      await this.injectThreadReport(
        connection,
        target.threadId,
        buildTaskReport("completed", payload, {
          threadName: target.threadName,
          turnId,
          result,
          durationMs: Date.now() - startedAt,
        }),
        remainingMs(startedAt, options.timeoutMs),
      )
      return result
    } catch (error) {
      if (target) {
        await this.injectThreadReport(
          connection,
          target.threadId,
          buildTaskReport("failed", payload, {
            threadName: target.threadName,
            turnId,
            error,
            durationMs: Date.now() - startedAt,
          }),
          remainingMs(startedAt, options.timeoutMs),
        )
      }
      if (error instanceof CodexTaskTimeoutError || isAbortLike(error)) {
        throw new CodexTaskTimeoutError(
          `Codex App thread task timed out after ${options.timeoutMs}ms`,
        )
      }
      throw error
    } finally {
      connection.close()
    }
  }

  private async resolveControlThread(connection: AppServerConnection, timeoutMs: number) {
    const overrideThreadId = process.env.CODEX_APP_THREAD_ID?.trim()
    const threadName = controlThreadName(this.cwd, this.branch)
    if (overrideThreadId) {
      const thread = await this.resumeThread(connection, overrideThreadId, timeoutMs)
      this.saveThread(threadName, thread)
      return { threadId: String(thread.id), sessionId: stringOrNull(thread.sessionId), threadName }
    }

    const registered = getVoiceCodexThread(
      {
        projectRoot: this.cwd,
        branch: this.branch,
        role: this.role,
      },
      this.registryPath,
    )
    if (registered?.threadId) {
      try {
        const thread = await this.resumeThread(connection, registered.threadId, timeoutMs)
        this.saveThread(registered.threadName || threadName, thread)
        return {
          threadId: String(thread.id),
          sessionId: stringOrNull(thread.sessionId),
          threadName,
        }
      } catch {
        // Registry entries are local hints. If stale, fall through to list/create.
      }
    }

    const listed = (await connection.request(
      "thread/list",
      {
        limit: 20,
        cwd: this.cwd,
        archived: false,
        searchTerm: threadName,
      },
      timeoutMs,
    )) as { data?: Array<Record<string, unknown>> }
    const exact = (listed.data || [])
      .filter((thread) => thread.name === threadName && thread.cwd === this.cwd)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]
    if (exact?.id) {
      const thread = await this.resumeThread(connection, String(exact.id), timeoutMs)
      this.saveThread(threadName, thread)
      return { threadId: String(thread.id), sessionId: stringOrNull(thread.sessionId), threadName }
    }

    const started = (await connection.request(
      "thread/start",
      {
        cwd: this.cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        personality: "pragmatic",
        threadSource: "user",
      },
      timeoutMs,
    )) as { thread?: Record<string, unknown> }
    const thread = started.thread
    if (!thread?.id) {
      throw new Error("Codex app-server did not create a thread")
    }
    await connection.request(
      "thread/name/set",
      { threadId: thread.id, name: threadName },
      timeoutMs,
    )
    this.saveThread(threadName, thread)
    return { threadId: String(thread.id), sessionId: stringOrNull(thread.sessionId), threadName }
  }

  private async resumeThread(connection: AppServerConnection, threadId: string, timeoutMs: number) {
    const resumed = (await connection.request(
      "thread/resume",
      {
        threadId,
        cwd: this.cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        personality: "pragmatic",
      },
      timeoutMs,
    )) as { thread?: Record<string, unknown> }
    if (!resumed.thread?.id) {
      throw new Error(`Codex app-server did not resume thread ${threadId}`)
    }
    return resumed.thread
  }

  private saveThread(threadName: string, thread: Record<string, unknown>) {
    saveVoiceCodexThread(
      {
        projectRoot: this.cwd,
        projectSlug: projectSlug(this.cwd),
        branch: this.branch,
        role: this.role,
        threadName,
        threadId: String(thread.id),
        sessionId: stringOrNull(thread.sessionId),
        updatedAt: new Date().toISOString(),
      },
      this.registryPath,
    )
  }

  private async injectThreadReport(
    connection: AppServerConnection,
    threadId: string,
    report: string,
    timeoutMs: number,
  ) {
    if (process.env.FESPA_CODEX_APP_THREAD_REPORTS === "false") {
      return
    }
    try {
      await connection.request(
        "thread/inject_items",
        {
          threadId,
          items: [
            {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: report }],
            },
          ],
        },
        Math.min(Math.max(1_000, timeoutMs), 5_000),
      )
    } catch {
      // Reporting is audit-only. It must never block the operator task itself.
    }
  }
}

class AppServerConnection {
  private child: ReturnType<typeof spawn> | null = null
  private nextId = 1
  private pending = new Map<string | number, PendingRequest>()
  private turnWaiters = new Map<string, PendingRequest & { threadId: string; turnId: string }>()
  private turnErrors = new Map<string, string>()
  private agentText = new Map<string, string>()

  constructor(
    private readonly codexBin: string,
    private readonly cwd: string,
  ) {}

  start(timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.codexBin, ["app-server", "--listen", "stdio://"], {
        cwd: this.cwd,
        env: codexEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      })
      this.child = child
      let settled = false
      const timer = setTimeout(
        () => {
          if (settled) return
          settled = true
          reject(new CodexTaskTimeoutError("Codex app-server startup timed out"))
        },
        Math.min(timeoutMs, 10_000),
      )
      child.once("spawn", () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      })
      child.once("error", (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new CodexTaskUnavailableError(error.message))
      })
      child.stderr.on("data", () => {
        // app-server may write diagnostics. Keep them out of voice responses.
      })
      readline.createInterface({ input: child.stdout }).on("line", (line) => {
        this.handleLine(line)
      })
    })
  }

  request(method: string, params: unknown, timeoutMs: number) {
    const child = this.child
    const stdin = child?.stdin
    if (!stdin?.writable) {
      return Promise.reject(new CodexTaskUnavailableError("Codex app-server is not running"))
    }
    const id = this.nextId++
    const safeTimeout = Math.max(1_000, timeoutMs)
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new CodexTaskTimeoutError(`Codex app-server request timed out: ${method}`))
      }, safeTimeout)
      this.pending.set(id, { resolve, reject, timer })
      stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  waitForTurnCompleted(threadId: string, turnId: string, timeoutMs: number) {
    const key = `${threadId}:${turnId}`
    const priorError = this.turnErrors.get(key)
    if (priorError) {
      this.turnErrors.delete(key)
      return Promise.reject(new Error(priorError))
    }
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.turnWaiters.delete(key)
          reject(new CodexTaskTimeoutError(`Codex app-server turn timed out: ${turnId}`))
        },
        Math.max(1_000, timeoutMs),
      )
      this.turnWaiters.set(key, { threadId, turnId, resolve, reject, timer })
    })
  }

  agentTextForTurn(turnId: string) {
    return this.agentText.get(turnId) || ""
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
    }
    for (const waiter of this.turnWaiters.values()) {
      clearTimeout(waiter.timer)
    }
    this.pending.clear()
    this.turnWaiters.clear()
    this.turnErrors.clear()
    this.child?.kill("SIGTERM")
    this.child = null
  }

  private handleLine(line: string) {
    const trimmed = line.trim()
    if (!trimmed) return
    let message: RpcMessage
    try {
      message = JSON.parse(trimmed) as RpcMessage
    } catch {
      return
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) {
        pending.reject(new Error(message.error.message || "Codex app-server JSON-RPC error"))
      } else {
        pending.resolve(message.result)
      }
      return
    }
    if (message.method === "item/agentMessage/delta") {
      const turnId = String(message.params?.turnId || "")
      const delta = String(message.params?.delta || "")
      if (turnId && delta) {
        this.agentText.set(turnId, `${this.agentText.get(turnId) || ""}${delta}`)
      }
      return
    }
    if (message.method === "error") {
      const threadId = String(message.params?.threadId || "")
      const turnId = String(message.params?.turnId || "")
      const error = asObject(message.params?.error)
      const messageText = String(error?.message || "Codex app-server turn failed")
      const key = `${threadId}:${turnId}`
      const waiter = this.turnWaiters.get(key)
      if (waiter) {
        this.turnWaiters.delete(key)
        clearTimeout(waiter.timer)
        waiter.reject(new Error(messageText))
      } else if (threadId && turnId) {
        this.turnErrors.set(key, messageText)
      }
      return
    }
    if (message.method === "turn/completed") {
      const threadId = String(message.params?.threadId || "")
      const turn = asObject(message.params?.turn)
      const turnId = String(turn?.id || "")
      const waiter = this.turnWaiters.get(`${threadId}:${turnId}`)
      if (waiter) {
        this.turnWaiters.delete(`${threadId}:${turnId}`)
        clearTimeout(waiter.timer)
        waiter.resolve(turn)
      }
    }
  }
}

function buildPrompt(payload: CodexTaskPayload) {
  return [
    "You are the Codex App control thread for the FESPA26 voice agent.",
    "Complete the task using the current project workspace and the evidence in the payload.",
    "Return JSON only. The final response must match the provided output schema.",
    "Put any task-specific structured payload into data.structuredJson as a JSON string.",
    "",
    "Operational constraints:",
    "- Do not expose secrets, tokens, private credentials, or unnecessary raw private media.",
    "- Do not publish or delete public feed items unless the payload contains explicit operator confirmation.",
    "- For source/media/card tasks, prefer read-only analysis and return actionable structured data.",
    "- For system_change tasks, make narrowly scoped code/config/documentation changes only when needed and report changed files plus verification.",
    "- If evidence is insufficient, return status=error with a concise explanation and next required data.",
    "",
    "Output schema:",
    JSON.stringify(RESULT_SCHEMA, null, 2),
    "",
    "Task payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n")
}

function buildTaskReport(
  status: "started" | "completed" | "failed",
  payload: CodexTaskPayload,
  details: {
    threadName: string
    turnId?: string
    durationMs?: number
    result?: unknown
    error?: unknown
  },
) {
  const result = asObject(details.result)
  const data = asObject(result?.data)
  const report = {
    marker: "FESPA26_CODEX_APP_TASK_REPORT",
    status,
    request_id: payload.requestId,
    user_id: payload.userId,
    task_type: payload.taskType,
    thread_name: details.threadName,
    turn_id: details.turnId || null,
    timestamp: new Date().toISOString(),
    duration_ms: details.durationMs ?? null,
    intent: truncate(payload.userIntent, 600),
    result_status: stringOrNull(result?.status),
    result_text: truncate(String(result?.text || ""), 1_000),
    changed_files: stringArray(data?.changedFiles).slice(0, 20),
    refs: stringArray(data?.refs).slice(0, 20),
    warnings: stringArray(result?.warnings).slice(0, 10),
    errors:
      status === "failed"
        ? [truncate(errorMessage(details.error), 1_000)]
        : stringArray(result?.errors).slice(0, 10),
  }
  return [
    "[FESPA26 task report]",
    "This is an automatic audit note from the voice-control Codex App adapter. No response is required.",
    JSON.stringify(report, null, 2),
  ].join("\n")
}

function parseCodexJson(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      status: "error",
      text: "",
      data: {
        summary: "",
        refs: [],
        changedFiles: [],
        nextActions: [],
        structuredJson: "{}",
      },
      errors: ["Codex App returned an empty response"],
      warnings: [],
    }
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim()
    if (fenced) {
      return JSON.parse(fenced)
    }
    const objectStart = trimmed.indexOf("{")
    const objectEnd = trimmed.lastIndexOf("}")
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1))
    }
    return {
      status: "error",
      text: trimmed.slice(0, 2_000),
      data: {
        summary: trimmed.slice(0, 2_000),
        refs: [],
        changedFiles: [],
        nextActions: [],
        structuredJson: "{}",
      },
      errors: ["Codex App returned non-JSON output"],
      warnings: [],
    }
  }
}

function extractAssistantText(turn: unknown) {
  const items = Array.isArray(asObject(turn)?.items) ? (asObject(turn)?.items as unknown[]) : []
  const messages = items
    .map(asObject)
    .filter((item): item is Record<string, unknown> => item?.type === "agentMessage")
    .map((item) => String(item.text || "").trim())
    .filter(Boolean)
  return messages.at(-1) || ""
}

function sandboxPolicyForTask(taskType: string, cwd: string) {
  if (taskType === "system_change") {
    return {
      type: "workspaceWrite",
      writableRoots: [cwd],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    }
  }
  return { type: "readOnly", networkAccess: true }
}

function effortForTask(taskType: string) {
  return taskType === "explicit" ? "low" : "medium"
}

function currentBranch(cwd: string) {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf8",
  })
  const branch = result.stdout?.trim()
  return branch || "main"
}

function remainingMs(startedAt: number, timeoutMs: number) {
  return Math.max(1_000, timeoutMs - (Date.now() - startedAt))
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean)
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error")
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function looksLikeMissingPath(value: string) {
  return value.includes("/") || value.startsWith(".")
}

function isAbortLike(error: unknown) {
  return error instanceof Error && /timed out|timeout/i.test(error.message)
}

function codexEnv() {
  const env = { ...process.env }
  if (process.env.FESPA_CODEX_USE_PROXY === "true") {
    return env
  }
  for (const key of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
  ]) {
    delete env[key]
  }
  return env
}
