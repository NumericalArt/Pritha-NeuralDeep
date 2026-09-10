export function attachmentTransportHash(root: string): string;
export function chatPrivateRoot(stateRoot: string, root: string): string;
export function readPrivateAttachmentJson(file: string, root: string): Record<string, unknown>;
export function readAttachmentTransport(options: { root: string; stateRoot: string; codexBin?: string }): Record<string, unknown> | null;
export function loadAttachmentDispatch(runtime: Record<string, any>, options: Record<string, any>): { close(): void; validate(payload: unknown): Promise<void> } | null;
