import { createHash } from "node:crypto";
import { AttachmentError } from "./attachment-store.mjs";

export const ATTACHMENT_TRANSPORT_VERSION = "neuraldeep-attachments-v1";
export const RESPONSES_REQUEST_LIMIT = 16 * 1024 ** 2;
export function attachmentModelEvidenceHash(model) {
  return createHash("sha256").update(JSON.stringify([model?.id, model?.provider,
    Array.isArray(model?.inputModalities) ? [...model.inputModalities].sort() : null,
    model?.visionAdvertised ?? null, model?.toolsAdvertised ?? null])).digest("hex");
}

export function attachmentSupport({ model, catalog, transport, path = "initial", now = Date.now() }) {
  const fresh = catalog?.source !== "fallback" && catalog?.source != null
    && Number.isFinite(Date.parse(catalog.refreshedAt)) && now - Date.parse(catalog.refreshedAt) >= 0
    && now - Date.parse(catalog.refreshedAt) <= 5 * 60000 && model?.provider === "neuraldeep" && model?.capabilitiesKnown === true;
  const modalities = model?.inputModalities;
  let image = "unknown";
  let files = "unknown";
  if (fresh && Array.isArray(modalities) && modalities.includes("text")) {
    if (modalities.includes("image") && model.visionAdvertised === true) image = "supported";
    if (!modalities.includes("image") && model.visionAdvertised === false) image = "unsupported";
  }
  if (fresh && typeof model.toolsAdvertised === "boolean") files = model.toolsAdvertised ? "supported" : "unsupported";
  const entry = (Array.isArray(transport?.entries) ? transport.entries : []).find(entry => entry?.model === model?.id && entry.path === path
    && entry.modelEvidenceHash === attachmentModelEvidenceHash(model));
  const verifiedAt = Date.parse(entry?.verifiedAt);
  const compatible = transport?.version === 1 && transport?.protocolVersion === ATTACHMENT_TRANSPORT_VERSION
    && typeof transport?.currentCliVersion === "string" && transport.currentCliVersion === transport.cliVersion
    && /^[a-f0-9]{64}$/.test(transport?.adapterHash || "") && transport.adapterHash === transport.currentAdapterHash
    && Number.isFinite(verifiedAt) && verifiedAt <= now && now - verifiedAt <= 30 * 86400000;
  return {
    image: image === "supported" && !(compatible && entry?.image === "passed" && entry?.source === "synthetic-provider-smoke") ? "unknown" : image,
    files: files === "supported" && !(compatible && entry?.files === "passed" && entry?.source === "synthetic-provider-smoke") ? "unknown" : files,
    advertisedImage: image, advertisedFiles: files,
    imageFormats: compatible && Array.isArray(entry?.imageFormats) ? entry.imageFormats.filter(type => ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type)) : [],
    reason: !fresh ? "model_metadata_unverified" : !compatible ? "transport_unverified" : "capability_checked",
  };
}

export function assertAttachmentSupport({ attachments = [], historicalImages = false, ...context }) {
  const support = attachmentSupport(context);
  const images = attachments.filter(file => file.view.kind === "image");
  const hasFiles = attachments.some(file => file.view.kind === "file");
  if ((historicalImages || images.length) && support.image !== "supported") throw new AttachmentError(
    support.image === "unsupported" ? "model_image_unsupported" : "model_image_unverified",
    "Image support for this model and CLI path is unavailable or unverified. Your draft and originals have been kept.", 409);
  if (hasFiles && support.files !== "supported") throw new AttachmentError("attachment_runtime_unsupported", "Access to original files through this model and CLI path is unverified. Your draft and originals have been kept.", 409);
  if (images.some(file => !support.imageFormats.includes(file.view.mediaType))) throw new AttachmentError("image_format_unverified", "This image format has not been verified through the selected model. The original has been kept.", 409);
  const minimumImageBody = images.reduce((sum, file) => sum + Math.ceil(file.view.size / 3) * 4 + 256, 0);
  if (minimumImageBody >= RESPONSES_REQUEST_LIMIT) throw new AttachmentError("attachment_provider_payload_too_large", "Original images exceed the provider request limit after encoding. They have been kept without resizing.", 413);
  return support;
}
