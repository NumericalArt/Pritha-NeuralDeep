"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readBrowserDraft, writeBrowserDraft } from "@/lib/codex-chat/browser-drafts";

type FileView = { id: string; name: string; size: number; mediaType: string; kind: "image" | "file"; href: string };
export type DraftAttachment = { id: string; name: string; size: number; status: "uploading" | "ready" | "error"; error?: string; view?: FileView };
type Limits = { count: number; fileBytes: number; messageBytes: number };
const message = (error: unknown) => error instanceof Error ? error.message : "The original file could not be uploaded. Retry without changing it.";
export function useDraftAttachments(scope: string | null, tab: string | null, onContentChange: (key: string) => void) {
  const [byDraft, setByDraft] = useState<Record<string, DraftAttachment[]>>({});
  const records = useRef<Record<string, DraftAttachment[]>>({});
  const [limits, setLimits] = useState<Limits | null>(null), [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const persist = useCallback(async (next: Record<string, DraftAttachment[]>) => {
    records.current = next; setByDraft(next);
    if (!scope || !tab) throw new Error("The current instance is still opening.");
    await writeBrowserDraft(scope, `attachments:${tab}`, next);
  }, [scope, tab]);
  const change = useCallback(async (key: string, update: (files: DraftAttachment[]) => DraftAttachment[]) => {
    const next = { ...records.current, [key]: update(records.current[key] || []) };
    if (!next[key].length) delete next[key];
    await persist(next);
  }, [persist]);
  useEffect(() => {
    if (!scope || !tab) return;
    let active = true;
    void Promise.all([readBrowserDraft<Record<string, DraftAttachment[]>>(scope, `attachments:${tab}`), fetch("/api/codex-chat/v1/attachments", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Attachment limits could not be loaded.");
      const body = await response.json(); const limits = body.data?.limits;
      if (![limits?.count, limits?.fileBytes, limits?.messageBytes].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("Attachment limits are unavailable.");
      return limits as Limits;
    })]).then(([saved, configured]) => {
      if (!active) return;
      const next: Record<string, DraftAttachment[]> = {};
      for (const [key, value] of Object.entries(saved || {})) if (Array.isArray(value)) next[key] = value.filter(file => /^[a-f0-9-]{36}$/.test(file.id) && typeof file.name === "string" && Number.isSafeInteger(file.size)).map(file => file.status === "ready" ? file : { ...file, status: "error", error: "Upload was interrupted. Retry the saved original." });
      records.current = next; setByDraft(next); setLimits(configured); setReady(true);
    }).catch(cause => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [scope,tab]);
  useEffect(() => { const requests = controllers.current; return () => { for (const controller of requests.values()) controller.abort(); }; }, []);
  const retry = useCallback(async (key: string, id: string) => {
    if (!scope || !tab || controllers.current.has(id)) return;
    const controller = new AbortController(); controllers.current.set(id, controller);
    const timeout = setTimeout(() => controller.abort(), 15 * 60000);
    const updateFile = async (update: (file: DraftAttachment) => DraftAttachment) => {
      const currentKey = Object.keys(records.current).find(candidate => records.current[candidate].some(file => file.id === id));
      if (currentKey) await change(currentKey, files => files.map(file => file.id === id ? update(file) : file));
    };
    try {
      const original = await readBrowserDraft<File>(scope, `original:${id}`);
      if (!(original instanceof Blob)) throw new Error("The browser original is unavailable. Select the same file again.");
      const row = records.current[key]?.find(file => file.id === id);
      if (!row) return;
      await updateFile(file => ({ ...file, status: "uploading", error: undefined }));
      const response = await fetch(`/api/codex-chat/v1/attachments/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-attachment-name": encodeURIComponent(row.name) }, body: original, signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body.data?.id !== id || body.data?.size !== row.size) throw new Error(body.error?.message || "The original upload was not confirmed. Retry the same file.");
      await updateFile(file => ({ ...file, status: "ready", view: body.data, error: undefined }));
    } catch (cause) {
      try { await updateFile(file => ({ ...file, status: "error", error: message(cause) })); } catch (storageError) { setError(message(storageError)); }
    } finally { clearTimeout(timeout); controllers.current.delete(id); }
  }, [scope,tab,change]);
  const add = useCallback(async (key: string, selected: File[]) => {
    if (!ready || !scope || !limits) { setError("Wait for attachment storage to open."); return; }
    setError(null);
    const existing = records.current[key] || [];
    if (existing.length + selected.length > limits.count || selected.some(file => file.size > limits.fileBytes) || [...existing,...selected].reduce((sum,file) => sum + file.size,0) > limits.messageBytes) {
      setError(`Up to ${limits.count} files, ${Math.floor(limits.fileBytes / 1024 ** 2)} MiB per file and ${Math.floor(limits.messageBytes / 1024 ** 2)} MiB per message.`); return;
    }
    const additions = selected.map(file => ({ id: crypto.randomUUID(), name: file.name, size: file.size, status: "uploading" as const }));
    onContentChange(key);
    try {
      // Reserve the IDs synchronously so a second drop cannot exceed the count.
      const published = change(key, files => [...files,...additions]);
      await Promise.all([published, ...selected.map((file,index) => writeBrowserDraft(scope, `original:${additions[index].id}`,file))]);
      await Promise.all(additions.map(file => retry(key,file.id)));
    } catch (cause) {
      setError(message(cause));
      const failed = additions.map(file => file.id);
      records.current = { ...records.current, [key]: (records.current[key] || []).map(file => failed.includes(file.id) ? { ...file, status: "error", error: message(cause) } : file) };
      setByDraft(records.current);
    }
  }, [scope,limits,ready,change,retry,onContentChange]);
  const remove = useCallback(async (key: string,id: string) => {
    controllers.current.get(id)?.abort();onContentChange(key);
    try { await change(key, files => files.filter(file => file.id !== id)); if (scope) await writeBrowserDraft(scope, `original:${id}`,undefined); } catch (cause) { setError(message(cause)); }
  },[scope,change,onContentChange]);
  const clearAccepted = useCallback(async (key: string, ids: string[]) => {
    await change(key, files => files.filter(file => !ids.includes(file.id)));
    if (scope) await Promise.all(ids.map(id=>writeBrowserDraft(scope,`original:${id}`,undefined)));
  },[scope,change]);
  const move = useCallback(async (from: string,to: string) => { const next = { ...records.current, [to]: records.current[from] || [] }; delete next[from]; await persist(next); },[persist]);
  const restoreReferences = useCallback(async (key: string, files: FileView[]) => {
    if (records.current[key]?.length) throw new Error("This draft already has attachments. Its originals were preserved.");
    onContentChange(key);
    await change(key,()=>files.map(view=>({id:view.id,name:view.name,size:view.size,status:"ready",view})));
  },[change,onContentChange]);
  return { byDraft, records, limits, ready, error, add, remove, retry, clearAccepted, move, restoreReferences };
}
