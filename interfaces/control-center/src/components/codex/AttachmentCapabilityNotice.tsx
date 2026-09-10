"use client";
import { useEffect, useState } from "react";
import { controlCenterRequest } from "@/lib/control-center-request";
export function AttachmentCapabilityNotice({ model, resume }: { model: string | null; resume: boolean }) {
  const [support,setSupport] = useState<{ image: string; files: string; imageFormats: string[] } | null>(null);
  useEffect(() => {
    if (!model) return;
    const controller = new AbortController();setSupport(null);
    void controlCenterRequest<{ image: string; files: string; imageFormats: string[] }>(`/api/codex-chat/v1/attachments/capabilities?model=${encodeURIComponent(model)}&path=${resume ? "resume" : "initial"}`, {signal:controller.signal}).then(response=>{ if(!controller.signal.aborted)setSupport(response.data); }).catch(()=>{if(!controller.signal.aborted)setSupport({image:"unknown",files:"unknown",imageFormats:[]});});
    return ()=>controller.abort();
  },[model,resume]);
  return <small className="codex-attachment-capabilities" role="status">{!support ? "Checking attachment support…" : `Images: ${support.image === "supported" ? `verified (${support.imageFormats.map(format=>format.replace("image/","")).join(", ")})` : support.image === "unsupported" ? "unsupported by this model" : "not yet verified"}. File access: ${support.files === "supported" ? "verified" : support.files === "unsupported" ? "unsupported" : "not yet verified"}. Originals are kept without conversion.`}</small>;
}
