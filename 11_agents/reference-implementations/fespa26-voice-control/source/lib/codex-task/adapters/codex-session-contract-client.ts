import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type { CodexTaskClient, CodexTaskPayload, CodexTaskRunOptions } from "@/lib/codex-task/types"

const REQUEST_VERSION = "codex_session_contract_request_v1"
const SCHEMA_VERSION = "codex_session_solve_decision_v1"
const ALLOWED_OUTCOMES = new Set([
  "OUTCOME_OK",
  "OUTCOME_DENIED_SECURITY",
  "OUTCOME_NONE_CLARIFICATION",
  "OUTCOME_NONE_UNSUPPORTED",
])

type CodexSessionContractOptions = {
  runId?: string
  decisionRoot?: string
}

export class CodexSessionContractClient implements CodexTaskClient {
  private readonly runId: string
  private readonly decisionRoot: string

  constructor(options: CodexSessionContractOptions = {}) {
    this.runId = options.runId || process.env.CODEX_SESSION_RUN_ID || "fespa26-current"
    this.decisionRoot =
      options.decisionRoot ||
      process.env.CODEX_SESSION_CONTRACT_ROOT ||
      path.join(process.cwd(), "data", "codex_session_contracts", this.runId)
  }

  async runTask(payload: CodexTaskPayload, _options: Required<CodexTaskRunOptions>) {
    const taskId = stableTaskId(payload)
    const taskDir = this.taskDir(taskId)
    const requestPath = path.join(taskDir, "codex_contract_request.json")
    const promptPath = path.join(taskDir, "codex_contract_prompt.md")
    const decisionPath = path.join(taskDir, "codex_solve_decision.json")
    const latestPendingPath = path.join(this.decisionRoot, "latest_pending.json")

    await fs.promises.mkdir(taskDir, { recursive: true })

    if (fs.existsSync(decisionPath)) {
      const decision = JSON.parse(await fs.promises.readFile(decisionPath, "utf8")) as Record<
        string,
        unknown
      >
      validateDecision(decision)
      return decisionToResult(payload.requestId, decision)
    }

    const request = buildRequest({
      payload,
      runId: this.runId,
      taskId,
      decisionPath,
    })
    await fs.promises.writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8")
    await fs.promises.writeFile(
      promptPath,
      [
        "# Codex Session Contract Request",
        "",
        "Read `codex_contract_request.json` and write `codex_solve_decision.json`.",
        "",
        "Decision JSON must follow `decision_schema`. Do not include markdown in the JSON file.",
        "",
        `- request: \`${requestPath}\``,
        `- decision: \`${decisionPath}\``,
        "",
      ].join("\n"),
      "utf8",
    )
    await fs.promises.writeFile(
      latestPendingPath,
      `${JSON.stringify(
        {
          runId: this.runId,
          taskId,
          taskType: payload.taskType,
          instruction: payload.userIntent,
          requestPath,
          promptPath,
          decisionPath,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    )

    return {
      requestId: payload.requestId,
      status: "decision_required",
      text: "Codex session decision required.",
      data: {
        taskId,
        requestPath,
        promptPath,
        decisionPath,
        resumeCommand:
          "Repeat the same FESPA26 realtime tool call after the foreground Codex thread writes the decision JSON.",
      },
      errors: [],
      warnings: ["Foreground Codex App thread must write codex_solve_decision.json."],
      transport: "codex-session-contract",
    }
  }

  private taskDir(taskId: string) {
    return path.join(this.decisionRoot, taskId)
  }
}

function stableTaskId(payload: CodexTaskPayload) {
  const evidence = {
    taskType: payload.taskType,
    userIntent: payload.userIntent,
    ids: payload.ids || {},
    data: payload.data || {},
    constraints: payload.constraints,
  }
  const hash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 16)
  return `${payload.taskType}_${hash}`
}

function decisionSchema() {
  return {
    schema_version: SCHEMA_VERSION,
    outcome:
      "OUTCOME_OK|OUTCOME_DENIED_SECURITY|OUTCOME_NONE_CLARIFICATION|OUTCOME_NONE_UNSUPPORTED",
    message: "final answer string exactly as required by the task",
    refs: ["/absolute/evidence/path"],
    family: "project_codex_session_<semantic_family>",
    contract_rewrite: "one-sentence restatement of the exact task contract",
    solution_mode: "deterministic|policy_gate|tool_action|unsupported|clarification",
    hypotheses: ["short competing hypotheses considered"],
    output_format: "exact message format required, or free_text",
    effectful: false,
    planned_mutations: [{ type: "write", path: "/path/to/target" }],
    evidence_refs: ["/absolute/evidence/path"],
    reasoning_summary: "short non-secret explanation for audit",
  }
}

function buildRequest(input: {
  payload: CodexTaskPayload
  runId: string
  taskId: string
  decisionPath: string
}) {
  return {
    request_version: REQUEST_VERSION,
    run_id: input.runId,
    task_id: input.taskId,
    instruction: input.payload.userIntent,
    operator_contract: [
      "Solve only from current evidence.",
      "Do not use prior run artifacts as solution source.",
      "Return non-OK only when evidence proves denial, unsupported capability, or ambiguity.",
      "For effectful OK, provide planned_mutations and evidence refs.",
      "Do not call an LLM provider from project code.",
      "Codex writes the contract; project code validates and applies only after resume.",
    ],
    evidence: {
      codex_task_payload: input.payload,
    },
    decision_schema: decisionSchema(),
    decision_path: input.decisionPath,
  }
}

function validateDecision(payload: Record<string, unknown>) {
  if (payload.schema_version !== SCHEMA_VERSION) {
    throw new Error(`decision schema_version must be ${SCHEMA_VERSION}`)
  }

  const outcome = String(payload.outcome || "")
  if (!ALLOWED_OUTCOMES.has(outcome)) {
    throw new Error(`invalid outcome: ${outcome}`)
  }

  if (!String(payload.message || "").trim()) {
    throw new Error("decision message is required")
  }

  const refs = Array.isArray(payload.refs)
    ? payload.refs.filter((ref) => typeof ref === "string" && ref.startsWith("/"))
    : []
  if (refs.length === 0) {
    throw new Error("decision refs must contain at least one absolute evidence path")
  }

  for (const field of ["contract_rewrite", "solution_mode", "output_format"]) {
    if (!String(payload[field] || "").trim()) {
      throw new Error(`decision ${field} is required`)
    }
  }

  const hypotheses = payload.hypotheses
  if (
    !Array.isArray(hypotheses) ||
    hypotheses.length === 0 ||
    !hypotheses.every((item) => String(item).trim())
  ) {
    throw new Error("decision hypotheses must be a non-empty list of strings")
  }

  if (outcome !== "OUTCOME_OK" && Array.isArray(payload.planned_mutations)) {
    if (payload.planned_mutations.length > 0) {
      throw new Error("non-OK decisions must not carry planned_mutations")
    }
  }
}

function decisionToResult(requestId: string, decision: Record<string, unknown>) {
  const outcome = String(decision.outcome)
  if (outcome === "OUTCOME_OK") {
    return {
      requestId,
      status: "ok",
      text: String(decision.message),
      data: { decision },
      errors: [],
      warnings: [],
      transport: "codex-session-contract",
    }
  }

  return {
    requestId,
    status: "error",
    text: String(decision.message),
    data: { decision },
    errors: [String(decision.message)],
    warnings: [],
    transport: "codex-session-contract",
  }
}
