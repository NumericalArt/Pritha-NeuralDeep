"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TurnView } from "@/lib/codex-chat/types";

export function CopyResponse({ turn, loadText }: { turn: TurnView; loadText?: (signal: AbortSignal) => Promise<string> }) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); if (timer.current) clearTimeout(timer.current); }, []);
  const messages = turn.items.filter(item => item.kind === "assistant_message");
  if (!["completed", "interrupted", "failed"].includes(turn.status) || !messages.some(item => item.message.markdown || item.message.contentRef)) return null;
  return <div className="codex-copy-response">
    <button type="button" className="codex-copy-button" disabled={state === "copying"} aria-label="Copy response" title="Copy response" aria-busy={state === "copying"} onClick={async () => {
      if (state === "copying") return;
      const request = new AbortController(); controller.current = request; setState("copying"); setError("");
      if (timer.current) clearTimeout(timer.current);
      try {
        if (!navigator.clipboard) throw new Error("Clipboard is unavailable. Open this instance in a secure browser context.");
        const gathered = loadText ? loadText(request.signal) : Promise.resolve(messages.map(item => item.message.markdown).join("\n\n"));
        void gathered.catch(() => undefined);
        if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": gathered.then(text => new Blob([text], { type: "text/plain" })) })]);
        } else await navigator.clipboard.writeText(await gathered);
        if (!request.signal.aborted) { setState("copied"); timer.current = setTimeout(() => setState("idle"), 1500); }
      } catch (cause) { if (!request.signal.aborted) { setState("error"); setError(cause instanceof Error && (cause.name === "NotAllowedError" || /denied/i.test(cause.message)) ? "Clipboard access was denied. Select the response text to copy it." : cause instanceof Error ? cause.message : "Copy failed. Retry to copy the complete response."); } }
    }}>{state === "copied" ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}</button>
    {state === "error" ? <span role="status">{error}</span> : null}
  </div>;
}
