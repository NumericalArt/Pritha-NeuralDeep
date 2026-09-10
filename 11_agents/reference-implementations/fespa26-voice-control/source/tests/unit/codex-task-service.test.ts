import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CodexAppServerClient } from "@/lib/codex-task/adapters/codex-app-server-client"
import { CodexAutoClient } from "@/lib/codex-task/adapters/codex-auto-client"
import { CodexSessionContractClient } from "@/lib/codex-task/adapters/codex-session-contract-client"
import {
  CodexTaskService,
  CodexTaskTimeoutError,
  CodexTaskUnavailableError,
} from "@/lib/codex-task/service"
import type { CodexTaskClient, CodexTaskPayload, CodexTaskRunOptions } from "@/lib/codex-task/types"

class MockCodexTaskClient implements CodexTaskClient {
  calls: CodexTaskPayload[] = []

  constructor(private readonly handler: (payload: CodexTaskPayload) => Promise<unknown>) {}

  async runTask(payload: CodexTaskPayload, _options: Required<CodexTaskRunOptions>) {
    this.calls.push(payload)
    return this.handler(payload)
  }
}

describe("CodexTaskService", () => {
  let tmpDir = ""
  let logPath = ""

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fespa26-codex-task-"))
    logPath = path.join(tmpDir, "codex-task-events.jsonl")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("sends a structured payload and validates a successful result", async () => {
    const client = new MockCodexTaskClient(async () => ({
      status: "ok",
      text: "Done",
      data: { changed: true },
      errors: [],
      warnings: ["minor"],
      transport: "mock",
    }))
    const service = new CodexTaskService(client, { cwd: "/workspace", logPath })

    const result = await service.runTask({
      taskType: "system_change",
      userIntent: "Change the Feed UI",
      ids: { feedItemId: "feed_1" },
      data: { token: "must-not-pass", safe: "ok" },
      expectedSchema: { status: "ok" },
    })

    expect(result.status).toBe("ok")
    expect(result.text).toBe("Done")
    expect(client.calls[0]?.projectContext.project).toBe("FESPA26")
    expect(client.calls[0]?.userIntent).toBe("Change the Feed UI")
    expect(client.calls[0]?.data?.token).toBeUndefined()
    expect(client.calls[0]?.data?.safe).toBe("ok")
    expect(fs.readFileSync(logPath, "utf8")).toContain('"status":"ok"')
  })

  it("returns an error result for invalid Codex output", async () => {
    const client = new MockCodexTaskClient(async () => ({
      status: "ok",
      errors: [],
      warnings: [],
    }))
    const service = new CodexTaskService(client, { logPath })

    const result = await service.runTask({
      taskType: "explicit",
      userIntent: "Analyze this",
      expectedSchema: { status: "ok" },
    })

    expect(result.status).toBe("error")
    expect(result.errors[0]).toContain("ok without text or data")
  })

  it("maps timeout failures to a graceful fallback result", async () => {
    let calls = 0
    const client = new MockCodexTaskClient(async () => {
      calls += 1
      throw new CodexTaskTimeoutError("timed out")
    })
    const service = new CodexTaskService(client, { logPath })

    const result = await service.runTask(
      {
        taskType: "media_analysis",
        userIntent: "Analyze latest video",
        expectedSchema: { status: "ok" },
      },
      { retries: 0, timeoutMs: 10 },
    )

    expect(result.status).toBe("timeout")
    expect(calls).toBe(1)
    expect(result.warnings).toContain("Falling back to the local Codex job queue.")
  })

  it("does not retry permanent unavailable errors", async () => {
    const client = new MockCodexTaskClient(async () => {
      throw new CodexTaskUnavailableError("not configured")
    })
    const service = new CodexTaskService(client, { logPath })

    const result = await service.runTask(
      {
        taskType: "source_search",
        userIntent: "Check source",
        expectedSchema: { status: "ok" },
      },
      { retries: 3 },
    )

    expect(result.status).toBe("unavailable")
    expect(client.calls).toHaveLength(1)
  })

  it("writes a Codex session contract and resumes from a validated decision", async () => {
    const client = new CodexSessionContractClient({
      runId: "test-run",
      decisionRoot: path.join(tmpDir, "contracts"),
    })
    const service = new CodexTaskService(client, { cwd: "/workspace", logPath })
    const input = {
      taskType: "explicit" as const,
      userIntent: "Compile a deterministic answer",
      expectedSchema: { status: "ok" },
    }

    const first = await service.runTask(input)

    expect(first.status).toBe("decision_required")
    const decisionPath = String(first.data?.decisionPath)
    const requestPath = String(first.data?.requestPath)
    const latestPendingPath = path.join(tmpDir, "contracts", "latest_pending.json")
    expect(fs.existsSync(requestPath)).toBe(true)
    expect(fs.existsSync(decisionPath)).toBe(false)
    expect(JSON.parse(fs.readFileSync(latestPendingPath, "utf8")).requestPath).toBe(requestPath)

    fs.writeFileSync(
      decisionPath,
      `${JSON.stringify(
        {
          schema_version: "codex_session_solve_decision_v1",
          outcome: "OUTCOME_OK",
          message: "Validated answer",
          refs: [requestPath],
          family: "project_codex_session_test",
          contract_rewrite: "Compile a deterministic answer.",
          solution_mode: "deterministic",
          hypotheses: ["The evidence is sufficient."],
          output_format: "free_text",
          effectful: false,
          planned_mutations: [],
          evidence_refs: [requestPath],
          reasoning_summary: "Decision was compiled from the request file.",
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    const second = await service.runTask(input)

    expect(second.status).toBe("ok")
    expect(second.text).toBe("Validated answer")
    expect(second.data?.decision).toMatchObject({ outcome: "OUTCOME_OK" })
  })

  it("runs the automatic Codex client and returns structured JSON", async () => {
    const scriptPath = path.join(tmpDir, "fake_codex.sh")
    const capturePath = path.join(tmpDir, "prompt.txt")
    fs.writeFileSync(
      scriptPath,
      `#!/bin/sh
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output-last-message" ]; then
    shift
    out="$1"
  fi
  shift
done
cat > "${capturePath}"
printf '{"status":"ok","text":"Auto answer","data":{"changed":false},"errors":[],"warnings":[]}' > "$out"
`,
      "utf8",
    )
    fs.chmodSync(scriptPath, 0o755)

    const client = new CodexAutoClient({
      codexBin: scriptPath,
      model: "test-model",
      cwd: tmpDir,
    })
    const service = new CodexTaskService(client, { cwd: tmpDir, logPath })

    const result = await service.runTask(
      {
        taskType: "source_search",
        userIntent: "Find a source",
        expectedSchema: { status: "ok" },
      },
      { retries: 0, timeoutMs: 5_000 },
    )

    expect(result.status).toBe("ok")
    expect(result.text).toBe("Auto answer")
    expect(fs.readFileSync(capturePath, "utf8")).toContain("Find a source")
  })

  it("runs the Codex app-server client through a project control thread registry", async () => {
    const scriptPath = path.join(tmpDir, "fake_codex_app_server.js")
    const registryPath = path.join(tmpDir, "voice-codex", "projects.json")
    fs.writeFileSync(
      scriptPath,
      `#!/usr/bin/env node
const readline = require("node:readline")
const rl = readline.createInterface({ input: process.stdin })
function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n")
}
rl.on("line", (line) => {
  const request = JSON.parse(line)
  const method = request.method
  if (method === "initialize") {
    send({ id: request.id, result: { protocolVersion: 1 } })
    return
  }
  if (method === "thread/list") {
    send({ id: request.id, result: { data: [] } })
    return
  }
  if (method === "thread/start") {
    send({
      id: request.id,
      result: {
        thread: {
          id: "thr_test",
          sessionId: "sess_test",
          cwd: request.params.cwd,
          name: null,
          updatedAt: 1,
        },
      },
    })
    return
  }
  if (method === "thread/name/set") {
    send({ id: request.id, result: {} })
    return
  }
  if (method === "thread/resume") {
    send({
      id: request.id,
      result: {
        thread: {
          id: request.params.threadId,
          sessionId: "sess_test",
          cwd: request.params.cwd,
          name: "VC · fespa26-codex-task-test · main · control",
          updatedAt: 2,
        },
      },
    })
    return
  }
  if (method === "turn/start") {
    const responseText = JSON.stringify({
      status: "ok",
      text: "App server answer",
      data: {
        summary: "Completed by fake app-server.",
        refs: [],
        changedFiles: [],
        nextActions: [],
        structuredJson: "{}",
      },
      errors: [],
      warnings: [],
    })
    send({ id: request.id, result: { turn: { id: "turn_test", items: [] } } })
    send({
      method: "turn/completed",
      params: {
        threadId: request.params.threadId,
        turn: {
          id: "turn_test",
          items: [{ type: "agentMessage", text: responseText, phase: "final" }],
        },
      },
    })
    return
  }
  send({ id: request.id, error: { message: "unsupported method " + method } })
})
`,
      "utf8",
    )
    fs.chmodSync(scriptPath, 0o755)

    const client = new CodexAppServerClient({
      codexBin: scriptPath,
      cwd: tmpDir,
      registryPath,
      branch: "main",
    })
    const service = new CodexTaskService(client, { cwd: tmpDir, logPath })

    const result = await service.runTask(
      {
        taskType: "explicit",
        userIntent: "Use the control thread",
        expectedSchema: { status: "ok" },
      },
      { retries: 0, timeoutMs: 5_000 },
    )

    expect(result.status).toBe("ok")
    expect(result.text).toBe("App server answer")
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"))
    const entries = Object.values(registry.threads) as Array<Record<string, unknown>>
    expect(entries[0]).toMatchObject({
      branch: "main",
      role: "control",
      threadId: "thr_test",
      sessionId: "sess_test",
    })
  })
})
