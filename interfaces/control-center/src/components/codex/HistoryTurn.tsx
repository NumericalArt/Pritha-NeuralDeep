"use client";
import { controlCenterRequest } from "@/lib/control-center-request";
import type { HistoryContentPage, HistoryItemsPage, MessageView, TurnView } from "@/lib/codex-chat/types";
import { HistoryActivity } from "./HistoryActivity";
import { CopyResponse } from "./CopyResponse";
import { HistoryText } from "./HistoryText";
import { ChatAttachments } from "./ChatAttachments";

const requestOptions = { timeoutMs: 35_000, maxBodyBytes: 256 * 1024 };
function base(chatId: string) { return `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/history`; }
async function content(chatId: string, id: string, cursor: string, signal: AbortSignal) {
  return (await controlCenterRequest<HistoryContentPage>(`${base(chatId)}/items/${encodeURIComponent(id)}/content?cursor=${encodeURIComponent(cursor)}`, { signal }, requestOptions)).data;
}
async function fullContent(chatId: string, id: string, cursor: string, signal: AbortSignal) {
  let text = "", next: string | null = cursor;
  const seen = new Set<string>();
  while (next) {
    if (seen.has(next)) throw new Error("History returned a repeated position."); seen.add(next);
    const page = await content(chatId, id, next, signal);
    text += page.text; next = page.nextCursor;
    if (text.length > 64 * 1024 * 1024) throw new Error("This response is too large to copy in the browser.");
  }
  return text;
}
export function HistoryTurn({ chatId, turn }: { chatId: string; turn: TurnView }) {
  async function copy(signal: AbortSignal) {
    let ref: string | null = turn.history?.itemsCursor || null;
    const messages: string[] = [], seen = new Set<string>();
    while (ref) {
      if (seen.has(ref)) throw new Error("History returned a repeated position."); seen.add(ref);
      const page = (await controlCenterRequest<HistoryItemsPage>(`${base(chatId)}/turns/${encodeURIComponent(turn.turnId)}/items?cursor=${encodeURIComponent(ref)}`, { signal }, requestOptions)).data;
      for (const item of page.data) if (item.kind === "assistant_message") messages.push(item.message.contentRef ? await fullContent(chatId, item.id, item.message.contentRef, signal) : item.message.markdown);
      ref = page.nextCursor;
    }
    if (signal.aborted) throw new Error("Copy cancelled.");
    if (!messages.length) throw new Error("No assistant response is available for this turn.");
    return messages.join("\n\n");
  }
  const message = (value: MessageView, id: string, label: string) => <article data-scroll-anchor={`${turn.turnId}:${id}`} className={`codex-message ${label === "You" ? "codex-user-message" : "codex-assistant-message"}`}>
    <div className="codex-message-label">{label}</div><ChatAttachments files={value.attachments} />
    <HistoryText chatId={chatId} id={id} preview={value.markdown} contentRef={value.contentRef} />
  </article>;
  return <section className="codex-turn" aria-label={`Turn ${turn.status}`}>
    {message(turn.userMessage, "user", "You")}
    {turn.items.filter(item => item.kind === "assistant_message" && item.message.phase !== "commentary").map(item => item.kind === "assistant_message" ? <div key={item.id}>{message(item.message, item.id, "Pritha")}</div> : null)}
    <HistoryActivity chatId={chatId} turn={turn} reference={turn.history?.itemsCursor || null} />
    <CopyResponse turn={turn} loadText={copy} />
  </section>;
}
