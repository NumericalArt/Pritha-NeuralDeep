import { readJsonlLines } from "../../../../../scripts/neuraldeep/jsonl-reader.mjs";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { appendPrivateText } from "@/lib/private-json";
import { NeuralDeepCliRuntime, type CliTurnOptions } from "./cli-runtime";

export type NeuralDeepProviderError = {
  class: "credentials" | "billing" | "rate_limit" | "outage" | "model_unavailable" | "access_denied" | "request" | "input";
  code: string;
  status: number | null;
  retryAfter: string | null;
};

export type NeuralDeepCliRunSnapshot = {
  threadId: string | null;
  usage: Record<string, unknown> | null;
  providerError: NeuralDeepProviderError | null;
  toolActivity: boolean;
  completedEvent: boolean;
  failedEvent: boolean;
};

export type NeuralDeepCliRunResult = NeuralDeepCliRunSnapshot & {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string;
  timedOut: boolean;
  interrupted: boolean;
  malformedEventCount: number;
  handlerErrorCode: string | null;
};

export type NeuralDeepCliRunHandle = {
  child: ChildProcessWithoutNullStreams;
  completion: Promise<NeuralDeepCliRunResult>;
  interrupt: () => void;
};

export type NeuralDeepCliRunnerOptions = CliTurnOptions & {
  timeoutMs?: number | null;
  stdoutLogPath?: string;
  stderrLogPath?: string;
  onRawLine?: (line: string) => void | Promise<void>;
  onEvent?: (event: Record<string, unknown>, snapshot: NeuralDeepCliRunSnapshot) => void | Promise<void>;
  onTimeout?: () => void | Promise<void>;
};

export type NeuralDeepRunnerFailure = {
  kind:
    | "none"
    | "input_rejected"
    | "interrupted"
    | "timeout"
    | "auth_required"
    | "billing_required"
    | "access_denied"
    | "model_unavailable"
    | "rate_limited"
    | "outage"
    | "runtime_identity_mismatch"
    | "runtime_failed";
  code: string | null;
  retryableBeforeToolActivity: boolean;
};

type ProcessRuntime = Pick<NeuralDeepCliRuntime, "stateRoot" | "startTurn" | "interrupt">;

const STDERR_TAIL_CHARS = 8_000;
const SAFE_ERROR_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const TOOL_ITEM_TYPES = new Set([
  "command_execution",
  "file_change",
  "mcp_tool_call",
  "dynamic_tool_call",
  "collab_agent_tool_call",
  "web_search",
]);

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function providerErrorFromEvent(event: Record<string, unknown>): NeuralDeepProviderError | null {
  if (event.type !== "pritha.provider_error") return null;
  const raw = asRecord(event.error) || {};
  const errorClass = String(raw.class || "request");
  if (!["credentials", "billing", "rate_limit", "outage", "model_unavailable", "access_denied", "request", "input"].includes(errorClass)) {
    return null;
  }
  return {
    class: errorClass as NeuralDeepProviderError["class"],
    code: SAFE_ERROR_CODE.test(String(raw.code || "")) ? String(raw.code) : "provider_error",
    status: raw.status != null && Number.isInteger(Number(raw.status)) ? Number(raw.status) : null,
    retryAfter: raw.retryAfter == null ? null : String(raw.retryAfter).slice(0, 80),
  };
}

function handlerErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code || "") : "";
  return SAFE_ERROR_CODE.test(code) ? code : "event_handler_failed";
}

function tracksToolActivity(event: Record<string, unknown>) {
  if (event.type !== "item.started" && event.type !== "item.completed") return false;
  return TOOL_ITEM_TYPES.has(String(asRecord(event.item)?.type || ""));
}

function snapshotOf(state: NeuralDeepCliRunSnapshot): NeuralDeepCliRunSnapshot {
  return { ...state, usage: state.usage ? { ...state.usage } : null, providerError: state.providerError ? { ...state.providerError } : null };
}

export class NeuralDeepCliRunner {
  constructor(private readonly runtime: ProcessRuntime = new NeuralDeepCliRuntime()) {}

  async start(options: NeuralDeepCliRunnerOptions): Promise<NeuralDeepCliRunHandle> {
    const child = this.runtime.startTurn(options);
    const state: NeuralDeepCliRunSnapshot = {
      threadId: null,
      usage: null,
      providerError: null,
      toolActivity: false,
      completedEvent: false,
      failedEvent: false,
    };
    let stderrTail = "";
    let timedOut = false;
    let interrupted = false;
    let malformedEventCount = 0;
    let eventHandlerErrorCode: string | null = null;
    let timeoutWork = Promise.resolve();

    const appendLog = (filePath: string | undefined, kind: "stdout" | "stderr", text: string | Uint8Array) => {
      if (!filePath || !text) return Promise.resolve();
      return appendPrivateText({
        stateRoot: this.runtime.stateRoot,
        filePath,
        resourceKey: `neuraldeep-cli-${kind}:${filePath}`,
        text,
      });
    };
    const interruptProcess = (reason: "operator" | "timeout" | "handler") => {
      if (reason === "operator") interrupted = true;
      if (reason === "timeout") timedOut = true;
      this.runtime.interrupt(child);
    };

    const processLines = (async () => {
      for await (const line of readJsonlLines(child.stdout, { onChunk: chunk => appendLog(options.stdoutLogPath, "stdout", chunk) })) {
        await options.onRawLine?.(line);
        let event: Record<string, unknown>;
        try { event = JSON.parse(line) as Record<string, unknown>; } catch { malformedEventCount++; continue; }
        if (!asRecord(event)) { malformedEventCount++; continue; }
        const type = String(event.type || ""), providerError = providerErrorFromEvent(event);
        if (providerError) state.providerError = providerError;
        if (type === "thread.started" && /^[A-Za-z0-9._:-]{1,160}$/.test(String(event.thread_id || ""))) state.threadId = String(event.thread_id);
        if (type === "turn.completed") { state.completedEvent = true; state.usage = asRecord(event.usage); }
        if (type === "turn.failed" || type === "error") state.failedEvent = true;
        if (tracksToolActivity(event)) state.toolActivity = true;
        await options.onEvent?.(event, snapshotOf(state));
      }
    })().catch(error => { eventHandlerErrorCode ||= handlerErrorCode(error); interruptProcess("handler"); });
    const processStderr = (async () => {
      const decoder = new TextDecoder();
      for await (const chunk of child.stderr) {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        stderrTail = `${stderrTail}${decoder.decode(bytes, { stream: true })}`.slice(-STDERR_TAIL_CHARS);
        await appendLog(options.stderrLogPath, "stderr", bytes);
      }
      stderrTail = `${stderrTail}${decoder.decode()}`.slice(-STDERR_TAIL_CHARS);
    })().catch(error => { eventHandlerErrorCode ||= handlerErrorCode(error); interruptProcess("handler"); });
    child.once("error", (error) => {
      stderrTail = `${stderrTail}\n${error.message}`.slice(-STDERR_TAIL_CHARS);
    });

    const timeoutMs = Number(options.timeoutMs);
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          interruptProcess("timeout");
          timeoutWork = Promise.resolve().then(() => options.onTimeout?.()).catch(error => { eventHandlerErrorCode ||= handlerErrorCode(error); });
        }, timeoutMs)
      : null;
    timer?.unref();

    const completion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    }).then(async ({ code, signal }) => {
      if (timer) clearTimeout(timer);
      await Promise.all([processLines, processStderr, timeoutWork]);
      return {
        ...snapshotOf(state),
        code,
        signal,
        stderrTail,
        timedOut,
        interrupted,
        malformedEventCount,
        handlerErrorCode: eventHandlerErrorCode,
      } satisfies NeuralDeepCliRunResult;
    });

    return {
      child,
      completion,
      interrupt: () => interruptProcess("operator"),
    };
  }
}

export function classifyNeuralDeepRunnerFailure(result: NeuralDeepCliRunResult): NeuralDeepRunnerFailure {
  if (result.handlerErrorCode === "runtime_identity_mismatch") {
    return { kind: "runtime_identity_mismatch", code: "runtime_identity_mismatch", retryableBeforeToolActivity: false };
  }
  if (result.handlerErrorCode) {
    return { kind: "runtime_failed", code: result.handlerErrorCode, retryableBeforeToolActivity: false };
  }
  if (result.interrupted || result.signal === "SIGINT") {
    return { kind: "interrupted", code: "interrupted", retryableBeforeToolActivity: false };
  }
  if (result.timedOut) return { kind: "timeout", code: "codex_cli_timeout", retryableBeforeToolActivity: false };
  if (result.providerError?.class === "input") return { kind: "input_rejected", code: result.providerError.code, retryableBeforeToolActivity: false };
  if (result.code === 0 && !result.failedEvent && result.completedEvent && result.threadId) {
    return { kind: "none", code: null, retryableBeforeToolActivity: false };
  }
  // Structured provider semantics take precedence over a generic HTTP status
  // repeated in stderr (including model access denials reported as HTTP 401).
  if (result.providerError) {
    const failures = {
      credentials: ["auth_required", "neuraldeep_auth_required"],
      billing: ["billing_required", "neuraldeep_billing_required"],
      access_denied: ["access_denied", "neuraldeep_access_denied"],
      model_unavailable: ["model_unavailable", "neuraldeep_model_unavailable"],
      rate_limit: ["rate_limited", "neuraldeep_rate_limited"],
      outage: ["outage", "neuraldeep_unavailable"],
      request: ["runtime_failed", result.providerError.code],
    } as const;
    const [kind, code] = failures[result.providerError.class];
    return { kind, code, retryableBeforeToolActivity: false };
  }
  if (/neuraldeep_http_401|\b401\b|unauthori[sz]ed/i.test(result.stderrTail)) {
    return { kind: "auth_required", code: "neuraldeep_auth_required", retryableBeforeToolActivity: false };
  }
  if (/neuraldeep_http_402|\b402\b|(?:neuraldeep_http_403|\b403\b)[^\n]{0,160}(?:wallet|balance|billing|payment|entitlement|subscription|plan|tariff|credit|fund)|insufficient[_\s-]*(?:balance|fund|credit)/i.test(result.stderrTail)) {
    return { kind: "billing_required", code: "neuraldeep_billing_required", retryableBeforeToolActivity: false };
  }
  if (/neuraldeep_http_403|\b403\b|forbidden/i.test(result.stderrTail)) {
    return { kind: "access_denied", code: "neuraldeep_access_denied", retryableBeforeToolActivity: false };
  }
  if (/unexpected status 404|\b404\s+Not Found\b|NotFoundError|model(?:_group)?[^\n]{0,120}(?:not found|unavailable)|No fallback model group/i.test(result.stderrTail)) {
    return { kind: "model_unavailable", code: "neuraldeep_model_unavailable", retryableBeforeToolActivity: false };
  }
  if (/neuraldeep_http_429|\b429\b|rate.?limit/i.test(result.stderrTail)) {
    // Absence of observed tools cannot prove that the provider did not accept
    // (and charge for) the request. Only pre-dispatch readiness may auto-wait.
    return { kind: "rate_limited", code: "neuraldeep_rate_limited", retryableBeforeToolActivity: false };
  }
  if (/neuraldeep_http_5\d\d|\b(?:500|502|503|504)\b|bad gateway|service unavailable|gateway timeout|ECONN|network|timed?\s*out|fetch failed/i.test(result.stderrTail)) {
    return { kind: "outage", code: "neuraldeep_unavailable", retryableBeforeToolActivity: false };
  }
  return { kind: "runtime_failed", code: result.toolActivity ? "resume_confirmation_required" : "codex_cli_failed", retryableBeforeToolActivity: false };
}
