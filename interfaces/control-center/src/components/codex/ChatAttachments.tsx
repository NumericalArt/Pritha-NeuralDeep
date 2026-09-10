"use client";
import type { MessageView } from "@/lib/codex-chat/types";
export function ChatAttachments({ files }: { files: MessageView["attachments"] }) {
  if (!files?.length) return null;
  return <ul className="codex-attachments" aria-label="Original attachments">{files.map(file => {
    const href = `/api/codex-chat/v1/attachments/${encodeURIComponent(file.id)}`;
    return <li key={file.id}>{file.kind === "image" ? <a href={href} download={file.name}><img src={href} alt={file.name} loading="lazy" referrerPolicy="no-referrer" /></a> : null}
      <a href={href} download={file.name}>{file.name}</a><small>{file.size.toLocaleString()} bytes · original</small></li>;
  })}</ul>;
}
