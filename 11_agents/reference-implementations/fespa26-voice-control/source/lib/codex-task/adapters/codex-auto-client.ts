import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { CodexTaskTimeoutError, CodexTaskUnavailableError } from "@/lib/codex-task/service"
import type {
  CodexTaskClient,
  CodexTaskPayload,
  CodexTaskRunOptions,
  CodexTaskType,
} from "@/lib/codex-task/types"

type CodexAutoClientOptions = {
  codexBin?: string
  model?: string
  cwd?: string
  maxBuffer?: number
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

export class CodexAutoClient implements CodexTaskClient {
  private readonly codexBin: string
  private readonly model: string
  private readonly cwd: string
  private readonly maxBuffer: number

  constructor(options: CodexAutoClientOptions = {}) {
    this.codexBin = options.codexBin || process.env.CODEX_BIN?.trim() || "codex"
    this.model = options.model || process.env.FESPA_CODEX_AUTO_MODEL?.trim() || ""
    this.cwd = options.cwd || process.cwd()
    this.maxBuffer = options.maxBuffer || 8 * 1024 * 1024
  }

  async runTask(payload: CodexTaskPayload, options: Required<CodexTaskRunOptions>) {
    if (looksLikeMissingPath(this.codexBin) && !fs.existsSync(this.codexBin)) {
      throw new CodexTaskUnavailableError(`Codex binary not found: ${this.codexBin}`)
    }

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fespa26-codex-auto-"))
    const outputPath = path.join(tempDir, "result.json")
    const schemaPath = path.join(tempDir, "schema.json")
    await fs.promises.writeFile(outputPath, "", "utf8")
    await fs.promises.writeFile(schemaPath, `${JSON.stringify(RESULT_SCHEMA, null, 2)}\n`, "utf8")

    const sandbox = sandboxForTask(payload.taskType)
    const prompt = buildPrompt(payload)
    const args = [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--disable",
      "plugins",
      "--skip-git-repo-check",
      "-s",
      sandbox,
      "-c",
      'approval_policy="never"',
    ]
    if (sandbox === "read-only" || sandbox === "workspace-write") {
      const key = sandbox === "read-only" ? "sandbox_read_only" : "sandbox_workspace_write"
      args.push("-c", `${key}.network_access=true`)
    }
    if (this.model) {
      args.push("-m", this.model)
    }
    args.push(
      "-C",
      this.cwd,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "-",
    )

    try {
      await runCommand(this.codexBin, args, prompt, {
        cwd: this.cwd,
        timeout: options.timeoutMs,
        maxBuffer: this.maxBuffer,
        env: codexEnv(),
      })
      const raw = await fs.promises.readFile(outputPath, "utf8")
      return parseCodexJson(raw)
    } catch (error) {
      if (isTimeout(error)) {
        throw new CodexTaskTimeoutError(`Codex auto task timed out after ${options.timeoutMs}ms`)
      }
      throw error
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }
  }
}

function sandboxForTask(taskType: CodexTaskType) {
  if (process.env.FESPA_CODEX_AUTO_SANDBOX) {
    return process.env.FESPA_CODEX_AUTO_SANDBOX
  }
  return taskType === "system_change" ? "workspace-write" : "read-only"
}

function buildPrompt(payload: CodexTaskPayload) {
  return [
    "You are the autonomous Codex task processor for the FESPA26 voice agent.",
    "Complete the task using the current project workspace and the evidence in the payload.",
    "Return JSON only. The final response must match the provided output schema.",
    "Put any task-specific structured payload into data.structuredJson as a JSON string.",
    "",
    "Operational constraints:",
    "- Do not expose secrets, tokens, private credentials, or unnecessary raw private media.",
    "- Do not publish or delete public feed items unless the payload contains explicit operator confirmation.",
    "- For source/media/card tasks, prefer read-only analysis and return actionable structured data.",
    "- For system_change tasks, make narrowly scoped code/config/doc changes only when needed and report changed files plus verification.",
    "- If evidence is insufficient, return status=error with a concise explanation and next required data.",
    "",
    "Task payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n")
}

function parseCodexJson(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      status: "error",
      text: "",
      data: {},
      errors: ["Codex returned an empty response"],
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
      data: {},
      errors: ["Codex returned non-JSON output"],
      warnings: [],
    }
  }
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

function isTimeout(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    ("killed" in error || "signal" in error) &&
    ((error as { killed?: boolean }).killed === true ||
      (error as { signal?: string }).signal === "SIGTERM")
  )
}

function runCommand(
  command: string,
  args: string[],
  input: string,
  options: { cwd: string; timeout: number; maxBuffer: number; env: NodeJS.ProcessEnv },
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let killTimer: NodeJS.Timeout | undefined
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer) {
        clearTimeout(killTimer)
      }
      callback()
    }
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      killTimer = setTimeout(() => {
        if (!child.killed || child.exitCode === null) {
          child.kill("SIGKILL")
        }
      }, 5_000)
    }, options.timeout)
    const appendOutput = (target: "stdout" | "stderr", chunk: Buffer) => {
      if (target === "stdout") {
        stdout += String(chunk)
      } else {
        stderr += String(chunk)
      }
      if (stdout.length + stderr.length > options.maxBuffer) {
        child.kill("SIGTERM")
        finish(() => reject(new Error("Codex command output exceeded maxBuffer")))
      }
    }

    child.stdout.on("data", (chunk: Buffer) => appendOutput("stdout", chunk))
    child.stderr.on("data", (chunk: Buffer) => appendOutput("stderr", chunk))
    child.on("error", (error) => finish(() => reject(error)))
    child.on("close", (code, signal) => {
      finish(() => {
        if (timedOut) {
          reject(
            Object.assign(new Error("Command timed out"), {
              killed: true,
              signal: signal || "SIGTERM",
            }),
          )
          return
        }
        if (code === 0) {
          resolve()
          return
        }
        reject(
          Object.assign(
            new Error(`Codex command exited with ${code ?? signal}: ${stderr || stdout}`),
            {
              code,
              signal,
            },
          ),
        )
      })
    })
    child.stdin.end(input)
  })
}

function looksLikeMissingPath(value: string) {
  return value.includes("/") || value.startsWith(".")
}

export function buildCodexAutoPromptForTests(payload: CodexTaskPayload) {
  return buildPrompt({ ...payload, requestId: `test-${randomUUID()}` })
}
