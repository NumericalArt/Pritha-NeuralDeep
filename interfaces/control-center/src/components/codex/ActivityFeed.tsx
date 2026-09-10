"use client";

import { useState, type ReactNode } from "react";
import type { ChatItemView } from "@/lib/codex-chat/types";

export function ActivityFeed({ status, items, renderItem, hasEarlier = false, onEarlier, busy = false, error, onRetry }: {
  status: string; items: ChatItemView[]; renderItem: (item: ChatItemView) => ReactNode;
  hasEarlier?: boolean; onEarlier?: () => void; busy?: boolean; error?: string | null; onRetry?: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(5);
  if (!items.length && !hasEarlier && !busy && !error) return null;
  const hidden = Math.max(0, items.length - visibleCount);
  return <section className="codex-activity-feed" aria-label="Activity">
    <div className="codex-activity-heading">Activity · {status.replaceAll("_", " ")}</div>
    {hidden || hasEarlier ? <button type="button" className="codex-text-action" disabled={busy} onClick={event => {
      event.currentTarget.dispatchEvent(new CustomEvent("codex-history-expand", { bubbles: true }));
      setVisibleCount(count => count + 5);
      if (!hidden) onEarlier?.();
    }}>Show earlier actions{hidden ? ` (${hidden})` : ""}</button> : null}
    {error ? <div role="status">{error} <button type="button" className="codex-text-action" onClick={onRetry}>Retry activity</button></div> : null}
    {busy && !items.length ? <span className="codex-activity-loading" role="status">Loading activity…</span> : null}
    <div className="codex-activity-items">{items.slice(-visibleCount).map(item => <div key={item.id} className="codex-activity-entry" data-activity-id={item.id} data-scroll-anchor={`activity:${item.id}`}>{renderItem(item)}</div>)}</div>
  </section>;
}
