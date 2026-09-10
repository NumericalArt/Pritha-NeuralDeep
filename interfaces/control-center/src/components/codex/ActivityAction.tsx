"use client";

import { useState } from "react";
import type { ChatItemView } from "@/lib/codex-chat/types";
import { CodexMarkdown } from "./CodexMarkdown";
import { HistoryText } from "./HistoryText";

export function ActivityAction({ item, chatId }: { item: ChatItemView; chatId?: string }) {
  const [open, setOpen] = useState(false);
  if (item.kind === "assistant_message") return <div className="codex-activity-message">
    {chatId ? <HistoryText chatId={chatId} id={item.id} preview={item.message.markdown} contentRef={item.message.contentRef} /> : <CodexMarkdown markdown={item.message.markdown || "…"} />}
  </div>;
  // Diagnostics addressed to the operator remain visible even with Details closed.
  if (item.kind === "notice") return <div className={`codex-inline-notice ${item.tone}`}>{item.text}</div>;
  const labels: Record<string, string> = { command: "Command", file_change: "Files changed", tool: "Tool", web_search: "Web search", plan: "Plan", reasoning_summary: "Reasoning summary", task_link: "Linked task", unsupported: "Activity" };
  const text = item.kind === "command" ? [item.commandPreview, item.cwdLabel ? `in ${item.cwdLabel}` : "", item.outputPreview].filter(Boolean).join("\n\n")
    : item.kind === "reasoning_summary" ? item.markdown
    : item.kind === "tool" ? [item.displayName, item.summary].filter(Boolean).join("\n\n")
    : item.kind === "web_search" ? item.query
    : item.kind === "plan" ? item.steps.map(step => `${step.status}: ${step.label}`).join("\n")
    : item.kind === "file_change" ? [item.changes.map(change => `${change.operation}: ${change.path}`).join("\n"), item.diffPreview].filter(Boolean).join("\n\n")
    : item.kind === "task_link" ? item.task.label : item.kind === "unsupported" ? item.label : "";
  const code = item.kind === "command" || item.kind === "file_change";
  return <div className="codex-history-action">
    <div className="codex-history-action-label">{labels[item.kind] || "Activity"} · {item.status.replaceAll("_", " ")}</div>
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Details</summary>
      {open ? chatId && item.contentRef
        ? <HistoryText chatId={chatId} id={item.id} preview={text} contentRef={item.contentRef} code={code} />
        : code ? <pre>{text}</pre> : <CodexMarkdown markdown={text} /> : null}
    </details>
  </div>;
}
