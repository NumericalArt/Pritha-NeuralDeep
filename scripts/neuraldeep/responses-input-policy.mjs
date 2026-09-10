import { createHash } from "node:crypto";
const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { code, statusCode }); };

/** Validate the exact encoded request; never resize, convert or remove images. */
export async function validateResponsesInputs(payload, { model, imagesAllowed = false, imageFormats = [], expectedImages = [], requireCurrentImages = false, hasHistoricalImage = () => false } = {}) {
  if (model && payload.model !== model) fail("neuraldeep_model_identity_mismatch");
  const found = [];
  if (payload.input != null && typeof payload.input !== "string" && !Array.isArray(payload.input)) fail("invalid_responses_input", 400);
  for (const message of Array.isArray(payload.input) ? payload.input : []) {
    if (!message || typeof message !== "object") fail("invalid_responses_input", 400);
    for (const part of Array.isArray(message.content) ? message.content : []) {
      if (part?.type !== "input_image") continue;
      if (!imagesAllowed) fail("model_image_unverified");
      const uri = typeof part.image_url === "string" ? part.image_url : "";
      const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(uri);
      if (!match || !imageFormats.includes(match[1])) fail("image_format_unverified");
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.toString("base64") !== match[2]) fail("invalid_image_encoding", 400);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const expected = expectedImages.find(file => file.sha256 === hash && file.size === bytes.length && file.mediaType === match[1]);
      if (!expected && !await hasHistoricalImage(hash, match[1], bytes.length)) fail("attachment_original_not_preserved");
      found.push(hash);
    }
  }
  if (requireCurrentImages && expectedImages.some(image => !found.includes(image.sha256))) fail("attachment_image_missing");
  return found;
}
