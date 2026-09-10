import { controlCenterRequest } from "@/lib/control-center-request";
import type { HistoryContentPage } from "@/lib/codex-chat/types";

// Visible message bodies share a small request pool; off-screen text is not queued.
const MAX_READS = 2;
let active = 0;
const waiting: Array<() => void> = [];
function cancelled() { return new DOMException("Text loading cancelled.", "AbortError"); }
export async function inReadPool<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return; }
    const start = () => { signal.removeEventListener("abort", abort); active++; resolve(); };
    const abort = () => {
      const index = waiting.indexOf(start);
      if (index >= 0) waiting.splice(index, 1);
      reject(cancelled());
    };
    if (active < MAX_READS) start();
    else { waiting.push(start); signal.addEventListener("abort", abort, { once: true }); }
  });
  try { if (signal.aborted) throw cancelled(); return await read(); }
  finally { active--; waiting.shift()?.(); }
}
export async function readVisibleHistoryText(chatId: string, id: string, cursor: string, signal: AbortSignal) {
  return inReadPool(signal, async () => {
    const url = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/history/items/${encodeURIComponent(id)}/content?cursor=${encodeURIComponent(cursor)}`;
    const { data } = await controlCenterRequest<HistoryContentPage>(url, { signal }, { timeoutMs: 35_000, maxBodyBytes: 64 * 1024 });
    if (!data || typeof data.text !== "string" || typeof data.complete !== "boolean"
      || !(data.nextCursor === null || typeof data.nextCursor === "string")
      || data.complete !== (data.nextCursor === null) || data.nextCursor === cursor
      || (!data.complete && !data.text)) throw new Error("The next part of this text could not be read.");
    return data;
  });
}
