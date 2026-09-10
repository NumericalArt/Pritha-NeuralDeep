"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatItemView, TurnView } from "@/lib/codex-chat/types";
import { ActivityFeed } from "./ActivityFeed";
import { ActivityAction } from "./ActivityAction";
import { inReadPool } from "./history-text-request";
import { readActivityPage } from "./activity-request";

export function HistoryActivity({ chatId, turn, reference }: { chatId: string; turn: TurnView; reference: string | null }) {
  const anchor = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null), expanded = useRef(false);
  const [visible, setVisible] = useState(false), [items, setItems] = useState<ChatItemView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const read = async (ref: string, earlier = false) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request; setBusy(true); setError(null);
    try {
      const { page, recovered } = await inReadPool(request.signal, () => readActivityPage(chatId, turn.turnId, ref, reference, request.signal));
      if (request.signal.aborted) return;
      const chronological = page.data.filter(item => item.kind === "assistant_message" ? item.message.phase === "commentary" : String(item.kind) !== "user_message").reverse();
      setItems(old => [...new Map((recovered ? [...old, ...chronological] : earlier ? [...chronological, ...old] : expanded.current ? [...old, ...chronological] : chronological).map(item => [item.id, item])).values()]);
      setCursor(page.nextCursor);
    } catch { if (!request.signal.aborted) setError("Activity could not be refreshed. Your messages are still available."); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: "100px" });
    if (anchor.current) observer.observe(anchor.current);
    return () => { observer.disconnect(); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (visible && reference) void read(reference);
    return () => controller.current?.abort();
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
