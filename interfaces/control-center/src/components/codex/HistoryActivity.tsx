"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatItemView, TurnView } from "@/lib/codex-chat/types";
import { ActivityFeed } from "./ActivityFeed";
import { ActivityAction } from "./ActivityAction";
import { inReadPool } from "./history-text-request";
import { readActivityPage } from "./activity-request";

export function HistoryActivity({ chatId, turn, reference }: { chatId: string; turn: TurnView; reference: string | null }) {
  const anchor = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null), expanded = useRef(false);
  const loaded = useRef(false), pendingTail = useRef<string | null>(null);
  const [visible, setVisible] = useState(false), [items, setItems] = useState<ChatItemView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const read = async (ref: string, earlier = false) => {
    // Coalesce background updates; only explicit pagination can supersede a read.
    if (controller.current && !earlier) { pendingTail.current = ref; return; }
    if (controller.current && earlier) pendingTail.current = reference;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request; setBusy(earlier || !loaded.current); setError(null);
    let completed = false;
    try {
      const { page, recovered } = await inReadPool(request.signal, () => readActivityPage(chatId, turn.turnId, ref, reference, request.signal));
      if (request.signal.aborted) return;
      const chronological = page.data.filter(item => item.kind === "assistant_message" ? item.message.phase === "commentary" : String(item.kind) !== "user_message").reverse();
      setItems(old => [...new Map((recovered ? [...old, ...chronological] : earlier ? [...chronological, ...old] : expanded.current ? [...old, ...chronological] : chronological).map(item => [item.id, item])).values()]);
      // A tail refresh must not rewind the cursor after older pages were loaded.
      if (earlier || recovered || !expanded.current) setCursor(page.nextCursor);
      loaded.current = true; completed = true;
    } catch { if (!request.signal.aborted) setError("Activity could not be refreshed. Your messages are still available."); }
    finally {
      if (controller.current === request && !request.signal.aborted) {
        controller.current = null; setBusy(false);
        const next = pendingTail.current; pendingTail.current = null;
        if (completed && next) void read(next);
      }
    }
  };
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: "100px" });
    if (anchor.current) observer.observe(anchor.current);
    return () => { observer.disconnect(); pendingTail.current = null; controller.current?.abort(); controller.current = null; };
  }, []);
  useEffect(() => {
    if (visible && reference) void read(reference);
    // Turn updates refresh the visible tail; expanded older actions stay available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reference, turn]);
  return <div ref={anchor} className="codex-history-activity">
    <ActivityFeed status={turn.status} items={items} hasEarlier={Boolean(cursor)} busy={busy} error={error}
      renderItem={item => <ActivityAction chatId={chatId} item={item} />}
      onEarlier={() => { if (cursor) { expanded.current = true; void read(cursor, true); } }}
      onRetry={() => { if (reference) void read(reference); }} />
  </div>;
}
