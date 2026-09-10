import type { ApiErrorEnvelope, ApiSuccess } from "./codex-chat/types";

export type ControlCenterRequestErrorKind = "network" | "gateway" | "api" | "invalid_response";

export class ControlCenterRequestError extends Error {
  constructor(
    readonly kind: ControlCenterRequestErrorKind,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly httpStatus: number | null,
    readonly requestId: string | null,
    readonly details?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
    this.name = "ControlCenterRequestError";
  }
}

type RequestOptions = {
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const JSON_CONTENT_TYPE = /^(?:application|text)\/(?:[a-z0-9.+-]*\+)?json\b/i;

function requestError(
  kind: ControlCenterRequestErrorKind,
  code: string,
  message: string,
  retryable: boolean,
  httpStatus: number | null,
  requestId: string | null = null,
  details?: Record<string, string | number | boolean | null>,
) {
  return new ControlCenterRequestError(kind, code, message, retryable, httpStatus, requestId, details);
}

async function readBoundedText(response: Response, maxBodyBytes: number) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw requestError("invalid_response", "response_too_large", "Control Center returned an oversized response.", false, response.status);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBodyBytes) {
        await reader.cancel();
        throw requestError("invalid_response", "response_too_large", "Control Center returned an oversized response.", false, response.status);
      }
      output += decoder.decode(chunk.value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

function gatewayError(status: number) {
  if ([502, 503, 504].includes(status)) {
    return requestError("gateway", "control_center_unavailable", "Control Center is temporarily unavailable.", true, status);
  }
  return requestError("invalid_response", "invalid_server_response", "Control Center returned an invalid response.", status >= 500, status);
}

function validApiError(value: unknown): value is ApiErrorEnvelope {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ApiErrorEnvelope>;
  return payload.apiVersion === "1"
    && typeof payload.error?.code === "string"
    && typeof payload.error?.message === "string"
    && typeof payload.error?.retryable === "boolean"
    && typeof payload.error?.requestId === "string";
}

function validApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ApiSuccess<T>>;
  return payload.apiVersion === "1" && typeof payload.requestId === "string" && Object.hasOwn(payload, "data");
}

export async function controlCenterRequest<T>(url: string, init: RequestInit = {}, options: RequestOptions = {}) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  try {
    const response = await (options.fetchImpl || fetch)(url, { cache: "no-store", ...init, signal: controller.signal });
    const text = await readBoundedText(response, options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES);
    const contentType = response.headers.get("content-type") || "";
    if (!JSON_CONTENT_TYPE.test(contentType)) throw gatewayError(response.status);

    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      if ([502, 503, 504].includes(response.status)) throw gatewayError(response.status);
      throw requestError("invalid_response", "invalid_server_response", "Control Center returned an invalid response.", response.status >= 500, response.status);
    }

    if (validApiError(payload)) {
      throw requestError("api", payload.error.code, payload.error.message, payload.error.retryable, response.status, payload.error.requestId, payload.error.details);
    }
    if (!response.ok || !validApiSuccess<T>(payload)) throw gatewayError(response.status);
    return payload;
  } catch (cause) {
    if (cause instanceof ControlCenterRequestError) throw cause;
    const timedOut = controller.signal.aborted && !externalSignal?.aborted;
    throw requestError(
      "network",
      timedOut ? "request_timeout" : "network_unreachable",
      timedOut ? "Control Center did not answer in time." : "Control Center cannot be reached.",
      true,
      null,
    );
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

export async function checkControlCenterHealth(options: RequestOptions = {}) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs || 5_000);
  try {
    const response = await (options.fetchImpl || fetch)("/api/health", {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await readBoundedText(response, 64 * 1024);
    if (!response.ok || !JSON_CONTENT_TYPE.test(response.headers.get("content-type") || "")) throw gatewayError(response.status);
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : null; } catch { throw gatewayError(response.status); }
    const health = payload as { schema?: unknown; ok?: unknown; service?: unknown; status?: unknown } | null;
    if (health?.schema !== "pritha-control-center-health-v2" || health.ok !== true || health.service !== "pritha-control-center" || health.status !== "ready") {
      throw requestError("invalid_response", "invalid_server_response", "Control Center returned an invalid health response.", false, response.status);
    }
    return health;
  } catch (cause) {
    if (cause instanceof ControlCenterRequestError) throw cause;
    const timedOut = controller.signal.aborted;
    throw requestError("network", timedOut ? "request_timeout" : "network_unreachable", timedOut ? "Control Center did not answer in time." : "Control Center cannot be reached.", true, null);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function deliveryMayBeUnknown(error: unknown) {
  if (!(error instanceof ControlCenterRequestError)) return true;
  if (error.kind === "network" || error.kind === "gateway" || error.kind === "invalid_response") return true;
  return error.code === "fallback_confirmation_required"
    || error.code === "turn_active"
    || error.httpStatus === null
    || error.httpStatus >= 500;
}
