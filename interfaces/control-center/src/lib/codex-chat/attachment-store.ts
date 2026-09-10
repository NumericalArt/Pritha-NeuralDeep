import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { NeuralDeepAttachmentStore } from "../../../../../scripts/neuraldeep/attachment-store.mjs";
export { AttachmentError, ATTACHMENT_LIMITS } from "../../../../../scripts/neuraldeep/attachment-store.mjs";
export type { AttachmentView, PreparedAttachment } from "../../../../../scripts/neuraldeep/attachment-store.mjs";

const stores = new Map<string, NeuralDeepAttachmentStore>();
export function getChatAttachmentStore() {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  const privateRoot = stateRoot === root ? path.join(root, ".private", "codex-chat") : path.join(stateRoot, "codex-chat");
  let store = stores.get(privateRoot);
  if (!store) { store = new NeuralDeepAttachmentStore({ stateRoot, privateRoot }); stores.set(privateRoot, store); }
  return store;
}
