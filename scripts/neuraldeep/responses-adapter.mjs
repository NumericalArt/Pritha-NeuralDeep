import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { RESPONSES_REQUEST_LIMIT } from "./attachment-policy.mjs";
import { classifyNeuralDeepProviderError, parseProviderErrorPayload } from "./provider-error.mjs";

const { Agent } = createRequire(new URL("../../interfaces/control-center/package.json", import.meta.url))("undici");
const DEFAULT_UPSTREAM = "https://api.neuraldeep.ru";
const DEFAULT_REQUEST_LIMIT = RESPONSES_REQUEST_LIMIT;
const DEFAULT_RESPONSE_LIMIT = 32 * 1024 * 1024;
// NeuralDeep advertises a 900-second gateway deadline; allow its terminal response to arrive.
const DEFAULT_UPSTREAM_TIMEOUT_MS = 930_000;
const upstreamDispatchers = new WeakMap();
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function parseSseData(raw) {
  const events = [];
  for (const block of raw.replaceAll("\r\n", "\n").split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      events.push(JSON.parse(data));
    } catch (error) {
      throw new Error(`NeuralDeep returned malformed Responses SSE: ${error.message}`);
    }
  }
  return events;
}

function outputTextParts(message) {
  return Array.isArray(message?.content)
    ? message.content.filter((part) => part?.type === "output_text" && typeof part.text === "string")
    : [];
}

function canonicalMessageEvents(message, outputIndex) {
  const id = message.id;
  const addedItem = {
    ...message,
    status: "in_progress",
    content: [],
  };
  const completedItem = {
    ...message,
    status: "completed",
  };
  const events = [
    {
      type: "response.output_item.added",
      output_index: outputIndex,
      item: addedItem,
    },
  ];

  for (const [contentIndex, sourcePart] of outputTextParts(message).entries()) {
    const part = {
      type: "output_text",
      text: sourcePart.text,
      annotations: Array.isArray(sourcePart.annotations) ? sourcePart.annotations : [],
      logprobs: Array.isArray(sourcePart.logprobs) ? sourcePart.logprobs : [],
    };
    events.push({
      type: "response.content_part.added",
      item_id: id,
      output_index: outputIndex,
      content_index: contentIndex,
      part: { ...part, text: "" },
    });
    if (part.text) {
      events.push({
        type: "response.output_text.delta",
        item_id: id,
        output_index: outputIndex,
        content_index: contentIndex,
        delta: part.text,
        logprobs: [],
      });
    }
    events.push(
      {
        type: "response.output_text.done",
        item_id: id,
        output_index: outputIndex,
        content_index: contentIndex,
        text: part.text,
        logprobs: part.logprobs,
      },
      {
        type: "response.content_part.done",
        item_id: id,
        output_index: outputIndex,
        content_index: contentIndex,
        part,
      },
    );
  }

  events.push({
    type: "response.output_item.done",
    output_index: outputIndex,
    item: completedItem,
  });
  return events;
}

function isUpstreamMessageLifecycle(event) {
  if (event?.type?.startsWith("response.output_text.")) return true;
  if (event?.type?.startsWith("response.content_part.")) return true;
  if (!["response.output_item.added", "response.output_item.done"].includes(event?.type)) return false;
  return event?.item?.type === "message";
}

function completedOutput(response, sourceEvents) {
  const messageId = (item,index) => `msg_nd_${createHash("sha256").update(JSON.stringify([response?.id,index,item.content])).digest("hex").slice(0,24)}`;
  const output = Array.isArray(response?.output) ? response.output.map((item,index) => item?.type === "message" && typeof item.id !== "string"
    ? { ...item, id: messageId(item,index) } : item) : [];
  const hasText = item => item?.type === "message" && outputTextParts(item).some(part => part.text.trim().length > 0);
  if (output.some(hasText)) return output;

  // Some Responses bridges omit the message from the terminal snapshot. Recover
  // only explicit public output; reasoning_text is never promoted to an answer.
  const doneMessages = sourceEvents.filter(event => event.type === "response.output_item.done" && hasText(event.item)).map(event => event.item);
  let messages = doneMessages;
  if (!messages.length) {
    const parts = new Map();
    for (const event of sourceEvents) {
      if (!["response.output_text.delta", "response.output_text.done"].includes(event.type)) continue;
      const key = JSON.stringify([event.item_id, event.output_index, event.content_index]);
      const part = parts.get(key) || { delta: "", done: null };
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") part.delta += event.delta;
      if (event.type === "response.output_text.done" && typeof event.text === "string") part.done = event.text;
      parts.set(key, part);
    }
    const content = [...parts.values()].map(part => ({ type: "output_text", text: part.done ?? part.delta, annotations: [] })).filter(part => part.text);
    if (content.length) messages = [{ type: "message", role: "assistant", status: "completed", content }];
  }
  for (const [index, message] of messages.entries()) {
    const id = typeof message.id === "string" ? message.id : messageId(message,index);
    const existing = output.findIndex(item => item?.type === "message" && item.id === id);
    if (existing >= 0) output[existing] = { ...message, id };
    else output.push({ ...message, id });
  }
  const isTool = item => ["function_call","custom_tool_call","local_shell_call"].includes(item?.type);
  if (!output.some(hasText) && !output.some(isTool) && !sourceEvents.some(event => event.type === "response.output_item.done" && isTool(event.item))) {
    throw Object.assign(new Error("NeuralDeep completed the request without a visible answer."), { code: "neuraldeep_empty_response", statusCode: 502 });
  }
  return output;
}

/**
 * Normalize NeuralDeep's Responses stream for Codex.
 *
 * NeuralDeep currently places output_text events on a reasoning item and omits
 * the message lifecycle. The completed response still contains the canonical
 * message, so message events are rebuilt from that value. Reasoning and tool
 * events pass through unchanged.
 */
export function normalizeResponsesSse(raw) {
  const normalized = [];
  let terminal = null;
  const sourceEvents = parseSseData(raw);

  for (const [index,event] of sourceEvents.entries()) {
    if (event?.type === "response.completed") {
      terminal = event;
      const output = completedOutput(event.response, sourceEvents.slice(0,index));
      output.forEach((item, outputIndex) => {
        if (item?.type === "message" && typeof item.id === "string") {
          normalized.push(...canonicalMessageEvents(item, outputIndex));
        }
      });
      normalized.push({ ...event, response: { ...event.response, output } });
      continue;
    }
    if (["response.failed", "response.incomplete", "response.cancelled"].includes(event?.type)) {
      terminal = event;
    }
    if (!isUpstreamMessageLifecycle(event)) normalized.push(event);
  }

  if (!terminal) throw new Error("NeuralDeep Responses stream ended without a terminal event");

  return `${normalized
    .map((event, sequenceNumber) => `data: ${JSON.stringify({ ...event, sequence_number: sequenceNumber })}\n\n`)
    .join("")}data: [DONE]\n\n`;
}

async function readNodeBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error(`Request body exceeds ${limit} bytes`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function readWebBody(response, limit, onChunk) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    if (chunk.length) onChunk?.(chunk.length);
    size += chunk.length;
    if (size > limit) throw new Error(`Upstream response exceeds ${limit} bytes`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function upstreamHeaders(requestHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(requestHeaders)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

function copyResponseHeaders(upstream, response) {
  for (const [name, value] of upstream.headers) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === "content-encoding") continue;
    response.setHeader(name, value);
  }
}

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

export function createNeuralDeepAdapter(options = {}) {
  const upstreamOrigin = new URL(options.upstreamOrigin || DEFAULT_UPSTREAM);
  const requestLimit = options.requestLimit || DEFAULT_REQUEST_LIMIT;
  const responseLimit = options.responseLimit || DEFAULT_RESPONSE_LIMIT;
  const upstreamTimeoutMs = options.upstreamTimeoutMs || DEFAULT_UPSTREAM_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (upstreamOrigin.protocol !== "https:") throw new Error("NeuralDeep upstream must use HTTPS");
  // Node fetch has separate 300-second header/body timers unless its dispatcher overrides them.
  const dispatcher = options.fetchImpl ? undefined : new Agent({ headersTimeout: upstreamTimeoutMs, bodyTimeout: upstreamTimeoutMs });

  const server = createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/healthz") {
      sendJson(response, 200, { ok: true, service: "pritha-neuraldeep-responses-adapter" });
      return;
    }
    // Codex expects its private catalog schema here, while NeuralDeep correctly
    // returns the public OpenAI { data: [...] } shape. An empty compatible
    // refresh keeps Codex on its fallback metadata for the explicitly selected
    // model without treating the standard upstream response as a transport
    // failure.
    if (request.method === "GET" && requestUrl.pathname === "/v1/models") {
      sendJson(response, 200, { models: [] });
      return;
    }
    if (!requestUrl.pathname.startsWith("/v1/")) {
      sendJson(response, 404, { error: { message: "Only /v1/* is proxied" } });
      return;
    }

    const controller = new AbortController();
    const timings = { upstreamStartedAt: null, firstByteMs: null, lastByteMs: null, responseCompletedMs: null, responseBytes: 0, timedOut: false };
    const timeout = setTimeout(() => {
      timings.timedOut = true;
      controller.abort(new Error("NeuralDeep upstream request timed out"));
    }, upstreamTimeoutMs);
    const abortIfClientLeaves = () => {
      if (!response.writableEnded) controller.abort(new Error("Codex disconnected from the adapter"));
    };
    response.once("close", abortIfClientLeaves);
    let upstreamAttempted = false;
    let requestHash = null;
    try {
      let body = await readNodeBody(request, requestLimit);
      if (requestUrl.pathname === "/v1/responses") {
        let payload;
        try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body || Buffer.alloc(0))); }
        catch { throw Object.assign(new Error("Invalid Responses JSON request."), { statusCode: 400 }); }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Object.assign(new Error("Invalid Responses request."), { statusCode: 400 });
        await options.validateResponsesRequest?.(payload, body);
        if (options.transformResponsesRequest) body = Buffer.from(JSON.stringify(options.transformResponsesRequest(payload)));
        requestHash = createHash("sha256").update(body).digest("hex");
        await options.beforeResponsesDispatch?.({ requestHash, model: payload.model, bytes: body.length });
      }
      const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstreamOrigin);
      upstreamAttempted = true;
      const upstreamStartedAt = Date.now();
      timings.upstreamStartedAt = new Date(upstreamStartedAt).toISOString();
      const upstream = await fetchImpl(target, {
        method: request.method,
        headers: upstreamHeaders(request.headers),
        body,
        redirect: "error",
        signal: controller.signal,
        dispatcher,
      });
      const upstreamBody = await readWebBody(upstream, responseLimit, bytes => {
        const elapsedMs = Date.now() - upstreamStartedAt;
        timings.firstByteMs ??= elapsedMs;
        timings.lastByteMs = elapsedMs;
        timings.responseBytes += bytes;
      });
      timings.responseCompletedMs = Date.now() - upstreamStartedAt;
      const isResponses = requestUrl.pathname === "/v1/responses";
      const isEventStream = upstream.headers.get("content-type")?.includes("text/event-stream");
      const output = isResponses && isEventStream
        ? Buffer.from(normalizeResponsesSse(options.transformResponsesStream ? options.transformResponsesStream(upstreamBody.toString("utf8")) : upstreamBody.toString("utf8")))
        : upstreamBody;
      copyResponseHeaders(upstream, response);
      response.setHeader("content-length", output.length);
      response.writeHead(upstream.status);
      response.end(output);
      options.onRequest?.({
        method: request.method,
        path: requestUrl.pathname,
        status: upstream.status,
        durationMs: Date.now() - startedAt,
        timings: { ...timings },
        requestHash,
        upstreamAttempted,
        error: upstream.ok ? null : classifyNeuralDeepProviderError({
          status: upstream.status,
          payload: parseProviderErrorPayload(upstreamBody),
          retryAfter: upstream.headers.get("retry-after"),
        }),
      });
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
      if (!response.destroyed && !response.headersSent) {
        sendJson(response, statusCode, { error: { message: error instanceof Error ? error.message : String(error) } });
      } else if (!response.destroyed) {
        response.destroy();
      }
      options.onRequest?.({
        method: request.method,
        path: requestUrl.pathname,
        status: statusCode,
        durationMs: Date.now() - startedAt,
        timings: { ...timings },
        requestHash,
        upstreamAttempted,
        error: classifyNeuralDeepProviderError({
          status: Number.isInteger(error?.statusCode) ? error.statusCode : null,
          transportCode: error?.name === "AbortError" ? "timeout" : error?.code,
        }),
      });
    } finally {
      clearTimeout(timeout);
      response.off("close", abortIfClientLeaves);
    }
  });
  if (dispatcher) upstreamDispatchers.set(server, dispatcher);
  return server;
}

export async function listenNeuralDeepAdapter(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = options.port ?? 17861;
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error("NeuralDeep adapter may bind only to a loopback host");
  }
  const server = createNeuralDeepAdapter(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

export async function closeNeuralDeepAdapter(server) {
  if (!server) return;
  if (server.listening) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  const dispatcher = upstreamDispatchers.get(server);
  upstreamDispatchers.delete(server);
  await dispatcher?.close();
}
