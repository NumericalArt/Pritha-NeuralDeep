import type { PreparedAttachment } from "./attachment-store.mjs";
export const ATTACHMENT_TRANSPORT_VERSION: string;
export const RESPONSES_REQUEST_LIMIT: number;
export function attachmentModelEvidenceHash(model: unknown): string;
export type AttachmentSupport = { image: string; files: string; advertisedImage: string; advertisedFiles: string; imageFormats: string[]; reason: string };
export type AttachmentPolicyContext = { model: unknown; catalog: unknown; transport: unknown; path?: "initial" | "resume"; now?: number };
export function attachmentSupport(context: AttachmentPolicyContext): AttachmentSupport;
export function assertAttachmentSupport(context: AttachmentPolicyContext & { attachments?: PreparedAttachment[]; historicalImages?: boolean }): AttachmentSupport;
