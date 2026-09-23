import { createHash } from "node:crypto";
import { neuralDeepUsageKnown, normalizeNeuralDeepUsage } from "./usage-ledger.mjs";

export function parseSseData(raw) {
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

export function responsesUsage(body, contentType = '') {
  try {
    const value = contentType.includes('text/event-stream')
      ? parseSseData(String(body)).findLast(event => ['response.completed','response.incomplete','response.failed'].includes(event?.type))?.response
      : JSON.parse(String(body));
    return neuralDeepUsageKnown(value?.usage) ? normalizeNeuralDeepUsage(value.usage) : null;
  } catch { return null; }
}

export function outputTextParts(message) {
  return Array.isArray(message?.content)
    ? message.content.filter((part) => part?.type === "output_text" && typeof part.text === "string")
    : [];
}

export function canonicalMessageEvents(message, outputIndex) {
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

export function completedOutput(response, sourceEvents) {
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

