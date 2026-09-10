import { Readable } from "node:stream";
import { apiError, apiSuccess } from "@/lib/codex-chat/http";
import { AttachmentError, getChatAttachmentStore } from "@/lib/codex-chat/attachment-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await context.params;
    let name: string;
    try {
      const encoded = request.headers.get("x-attachment-name") || "";
      if (encoded.length > 4096) throw new Error("invalid name");
      name = decodeURIComponent(encoded);
    } catch { throw new AttachmentError("invalid_attachment_name", "The filename could not be decoded."); }
    return apiSuccess(await getChatAttachmentStore().upload(attachmentId, name, request));
  } catch (error) { return apiError(error); }
}

export async function GET(_request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await context.params;
    const { view, handle } = await getChatAttachmentStore().openOriginal(attachmentId);
    const name = encodeURIComponent(view.name).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    try {
      return new Response(Readable.toWeb(handle.createReadStream({ start: 0, autoClose: true })) as ReadableStream<Uint8Array>, {
        headers: {
          "Content-Type": view.mediaType,
          "Content-Length": String(view.size),
          "Content-Disposition": `${view.kind === "image" ? "inline" : "attachment"}; filename="attachment"; filename*=UTF-8''${name}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    } catch (error) { await handle.close(); throw error; }
  } catch (error) { return apiError(error); }
}
