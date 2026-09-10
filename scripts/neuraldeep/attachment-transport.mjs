import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import path from "node:path";
import { runSyncProbe } from "../lib/sync-probe.mjs";
import { AttachmentError } from "./attachment-store.mjs";
import { assertAttachmentSupport } from "./attachment-policy.mjs";
import { validateResponsesInputs } from "./responses-input-policy.mjs";
import { neuralDeepRuntimeIdentity } from "./runtime-identity.mjs";
import { NeuralDeepChatHistoryStore } from "./chat-history-store.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const TRANSPORT_FILES = ["neuraldeep-codex.mjs", "neuraldeep/responses-adapter.mjs", "neuraldeep/responses-input-policy.mjs", "neuraldeep/attachment-transport.mjs", "neuraldeep/attachment-policy.mjs", "neuraldeep/process-supervisor.mjs", "neuraldeep/process-snapshot.mjs"];
export function attachmentTransportHash(root) {
  return digest(JSON.stringify(TRANSPORT_FILES.map(file => [file, digest(readFileSync(path.join(root, "scripts", file)))])));
}
export function chatPrivateRoot(stateRoot, root) { return path.resolve(stateRoot) === path.resolve(root) ? path.join(root, ".private", "codex-chat") : path.join(stateRoot, "codex-chat"); }

export function readPrivateAttachmentJson(file, root) {
  const absolute = path.resolve(file), allowed = realpathSync(root);
  if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new AttachmentError("attachment_manifest_invalid", "Attachment evidence is outside this instance.", 409);
  for (let current = absolute; current !== path.resolve(root); current = path.dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new AttachmentError("attachment_manifest_invalid", "Attachment evidence contains an unsafe link.", 409);
  }
  if (!realpathSync(absolute).startsWith(allowed + path.sep)) throw new AttachmentError("attachment_manifest_invalid", "Attachment evidence changed location.", 409);
  const fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 256 * 1024) throw new AttachmentError("attachment_manifest_invalid", "Attachment evidence has an invalid size or identity.", 409);
    const bytes = Buffer.alloc(256 * 1024 + 1); let size = 0;
    while (size < bytes.length) { const count = readSync(fd, bytes, size, bytes.length-size, size); if (!count) break; size += count; }
    if (size > 256 * 1024) throw new AttachmentError("attachment_manifest_invalid", "Attachment evidence exceeds its size limit.", 409);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0,size)));
  } finally { closeSync(fd); }
}

export function readAttachmentTransport({ root, stateRoot, codexBin = process.env.PRITHA_CODEX_BIN || process.env.CODEX_BIN || "codex" }) {
  const privateRoot = chatPrivateRoot(stateRoot, root), evidencePath = path.join(privateRoot, "attachment-capabilities.json");
  if (!existsSync(evidencePath)) return null;
  const evidence = readPrivateAttachmentJson(evidencePath, privateRoot);
  const identity = neuralDeepRuntimeIdentity(stateRoot);
  if (evidence.profileIdentity !== identity.profileIdentity) return null;
  const version = runSyncProbe(codexBin, ["--version"], { timeout: 5000, maxBuffer: 16 * 1024 });
  return { ...evidence, currentCliVersion: version.status === 0 ? String(version.stdout).trim() : null, currentAdapterHash: attachmentTransportHash(root) };
}

export function loadAttachmentDispatch(runtime, options) {
  if (!options.attachmentManifest) return null;
  const privateRoot = chatPrivateRoot(runtime.stateRoot, runtime.projectRoot);
  const relative = path.relative(privateRoot, path.resolve(options.attachmentManifest));
  if (!/^turns\/turn_[A-Za-z0-9]+\/inputs\/[a-f0-9-]{36}\/manifest\.json$/.test(relative)) throw new AttachmentError("attachment_manifest_invalid", "Invalid attachment dispatch identity.", 409);
  const manifest = readPrivateAttachmentJson(options.attachmentManifest, privateRoot);
  const identity = neuralDeepRuntimeIdentity(runtime.stateRoot);
  if (manifest.version !== 1 || manifest.profileIdentity !== identity.profileIdentity || manifest.turnId !== options.workloadId || manifest.model?.id !== options.model
    || manifest.resume !== (options.resume || null) || manifest.path !== (options.resume ? "resume" : "initial") || !Array.isArray(manifest.attachments) || manifest.attachments.length > 10) throw new AttachmentError("attachment_manifest_invalid", "The attachment dispatch identity changed.", 409);
  const openHistory = () => new NeuralDeepChatHistoryStore({ databasePath: path.join(privateRoot, "history.sqlite"),
    instanceScope: digest(`${path.resolve(runtime.stateRoot)}:neuraldeep-chat-v1`), readOnly: true });
  const database = openHistory(); let closed = false;
  try {
    const binding = database.get(manifest.chatId, { turnLimit: 0 }), turn = database.turn(manifest.chatId, manifest.turnId);
    if (!binding || !turn || binding.profileIdentity !== identity.profileIdentity || binding.nativeThreadId !== manifest.resume || binding.modelId !== options.model) throw new AttachmentError("attachment_manifest_invalid", "The saved attachment session does not match this dispatch.", 409);
    const saved = turn.userMessage.attachments || [];
    if (saved.length !== manifest.attachments.length || manifest.attachments.some((file,index) => saved[index]?.id !== file.view?.id || saved[index]?.sha256 !== file.sha256 || saved[index]?.size !== file.view?.size || saved[index]?.mediaType !== file.view?.mediaType)) throw new AttachmentError("attachment_manifest_invalid", "The original attachment references changed.", 409);
    const support = assertAttachmentSupport({ model: manifest.model, catalog: manifest.catalog,
      transport: readAttachmentTransport({ root: runtime.projectRoot, stateRoot: runtime.stateRoot, codexBin: runtime.codexBin }),
      path: manifest.path, attachments: manifest.attachments, historicalImages: database.attachmentInSession(manifest.chatId) });
    const images = manifest.attachments.filter(file => file.view.kind === "image");
    if (JSON.stringify(options.images || []) !== JSON.stringify(images.map(file => file.filePath))) throw new AttachmentError("attachment_manifest_invalid", "The image arguments do not match the saved originals.", 409);
    for (const file of manifest.attachments) {
      if (path.dirname(file.filePath) !== path.dirname(realpathSync(options.attachmentManifest)) || lstatSync(file.filePath).isSymbolicLink()) throw new AttachmentError("attachment_manifest_invalid", "The dispatch copy is outside its owned directory.", 409);
      const fd = openSync(file.filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
      try {
        const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1 || stat.size !== file.view.size) throw new AttachmentError("attachment_integrity_failed", "The dispatch copy changed.", 409);
        const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024); let offset = 0;
        while (true) { const count = readSync(fd,buffer,0,buffer.length,offset); if (!count) break; offset += count; if (offset > file.view.size) throw new AttachmentError("attachment_integrity_failed", "The dispatch copy changed.", 409); hash.update(buffer.subarray(0,count)); }
        if (hash.digest("hex") !== file.sha256) throw new AttachmentError("attachment_integrity_failed", "The dispatch copy changed.", 409);
      } finally { closeSync(fd); }
    }
    database.close(); closed = true;
    let first = true;
    return { close: () => {}, validate: async payload => {
      const history = openHistory();
      try { await validateResponsesInputs(payload, { model: options.model, imagesAllowed: support.image === "supported", imageFormats: support.imageFormats,
        expectedImages: images.map(file => ({ sha256: file.sha256, size: file.view.size, mediaType: file.view.mediaType })),
        requireCurrentImages: first, hasHistoricalImage: (sha256,mediaType,size) => history.attachmentInSession(manifest.chatId,{sha256,mediaType,size}) });
      } finally { history.close(); }
      first = false;
    } };
  } catch (error) { if (!closed) database.close(); throw error; }
}
