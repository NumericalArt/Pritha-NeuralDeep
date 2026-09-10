import { createHash, randomUUID } from "node:crypto";
import { constants, chmodSync } from "node:fs";
import { mkdir, lstat, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

export const ATTACHMENT_LIMITS = Object.freeze({ count: 10, fileBytes: 100 * 1024 ** 2, messageBytes: 250 * 1024 ** 2, storageBytes: 10 * 1024 ** 3, unreferencedHours: 24 });
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const inside = (root, value) => value.startsWith(`${root}${path.sep}`);
export class AttachmentError extends Error {
  constructor(code, message, status = 400, retryable = false) { super(message); Object.assign(this, { code, status, retryable }); }
}
const unavailable = () => new AttachmentError("attachment_storage_unavailable", "Attachment storage needs recovery. Existing originals have been preserved.", 503, true);
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== "ESRCH"; } }
function publicView(record) {
  const { id, name, size, mediaType, kind } = record;
  return { id, name, size, mediaType, kind, href: `/api/codex-chat/v1/attachments/${id}` };
}
function imageType(prefix) {
  if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return TYPES[0];
  if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) return TYPES[1];
  if (/^GIF8[79]a$/.test(prefix.subarray(0, 6).toString("ascii"))) return TYPES[2];
  if (prefix.subarray(0, 4).toString() === "RIFF" && prefix.subarray(8, 12).toString() === "WEBP") return TYPES[3];
  return "application/octet-stream";
}
async function safeDirectory(directory, create = false) {
  const resolved = path.resolve(directory);
  for (let current = resolved; current !== path.dirname(current); current = path.dirname(current)) {
    const info = await lstat(current).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!info) continue;
    const alias = process.platform === "darwin" && ["/tmp", "/var"].includes(current)
      && info.isSymbolicLink() && await realpath(current) === `/private${current}`;
    if (!alias && (info.isSymbolicLink() || !info.isDirectory())) throw unavailable();
  }
  if (create) await mkdir(resolved, { recursive: true, mode: 0o700 });
  return realpath(resolved);
}

/** Immutable originals, with an independent cross-process mutex for quota and references.
 * No chat/admission transaction is held while an upload streams. A live owner
 * is never evicted by a timeout; a dead owner's private files remain auditable. */
export class NeuralDeepAttachmentStore {
  constructor({ stateRoot, privateRoot, limits = ATTACHMENT_LIMITS, lockTimeoutMs = 60000, uploadIdleMs = 30000 } = {}) {
    this.stateRoot = path.resolve(stateRoot);
    this.root = path.join(path.resolve(privateRoot), "attachments");
    if (!inside(this.stateRoot, this.root)) throw unavailable();
    this.limits = { ...ATTACHMENT_LIMITS, ...limits };
    for (const key of Object.keys(ATTACHMENT_LIMITS)) if (!Number.isSafeInteger(this.limits[key]) || this.limits[key] < 1 || this.limits[key] > ATTACHMENT_LIMITS[key]) throw unavailable();
    this.lockTimeoutMs = lockTimeoutMs;
    this.uploadIdleMs = uploadIdleMs;
  }

  async initialize() {
    if (this.db) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const state = await safeDirectory(this.stateRoot, true);
      const root = await safeDirectory(this.root, true);
      if (!inside(state, root)) throw unavailable();
      this.stateRoot = state; this.root = root;
      const file = path.join(root, "coordination.sqlite");
      for (const candidate of [file, `${file}-wal`, `${file}-shm`]) {
        const info = await lstat(candidate).catch(error => { if (error.code === "ENOENT") return null; throw error; });
        if (info && (!info.isFile() || info.isSymbolicLink())) throw unavailable();
      }
      const db = new DatabaseSync(file);
      try {
        chmodSync(file, 0o600);
        db.exec("PRAGMA busy_timeout=5000;");
        const deadline = Date.now() + 5000;
        for (;;) {
          try { db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;"); break; }
          catch (error) {
            if (![5, 6].includes(error.errcode) || Date.now() >= deadline) throw error;
            await new Promise(resolve => setTimeout(resolve, 30));
          }
        }
        if (![0, 1].includes(db.prepare("PRAGMA user_version").get().user_version)) throw unavailable();
        db.exec("CREATE TABLE IF NOT EXISTS mutex(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,pid INTEGER NOT NULL); PRAGMA user_version=1;");
        this.db = db;
      } catch (error) { db.close(); throw error; }
    })();
    try { await this.initializing; } finally { this.initializing = null; }
  }

  async withLock(work) {
    await this.initialize();
    const token = randomUUID(); const deadline = Date.now() + this.lockTimeoutMs;
    for (;;) {
      this.db.exec("BEGIN IMMEDIATE");
      let acquired = false;
      try {
        const held = this.db.prepare("SELECT * FROM mutex WHERE id=1").get();
        if (!held || !alive(held.pid)) {
          this.db.prepare("INSERT INTO mutex VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,pid=excluded.pid").run(token, process.pid);
          acquired = true;
        }
        this.db.exec("COMMIT");
      } catch (error) { this.db.exec("ROLLBACK"); throw error; }
      if (acquired) break;
      if (Date.now() >= deadline) throw new AttachmentError("attachment_storage_busy", "Another upload is still in progress. Retry shortly; your file is kept.", 503, true);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    try { return await work(); }
    finally { this.db.prepare("DELETE FROM mutex WHERE id=1 AND owner=?").run(token); }
  }

  async directory(id, create = false) {
    await this.initialize();
    if (!ID.test(id)) throw new AttachmentError("attachment_not_found", "Attachment not found.", 404);
    const directory = path.join(this.root, id.toLowerCase());
    try { await safeDirectory(directory, create); } catch (error) {
      if (error.code === "ENOENT") throw new AttachmentError("attachment_not_found", "Attachment not found.", 404);
      throw error;
    }
    return directory;
  }

  async openPrivate(file) {
    let handle;
    try {
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const [info, current, resolved] = await Promise.all([handle.stat(), lstat(file), realpath(file)]);
      if (!info.isFile() || !current.isFile() || current.isSymbolicLink() || info.nlink !== 1
        || info.dev !== current.dev || info.ino !== current.ino || resolved !== file || !inside(this.root, resolved)) throw unavailable();
      await safeDirectory(path.dirname(file));
      return handle;
    } catch (error) { await handle?.close(); throw error; }
  }

  async record(id) {
    const directory = await this.directory(id);
    let record; let handle;
    try {
      handle = await this.openPrivate(path.join(directory, "metadata.json"));
      if ((await handle.stat()).size > 8192) throw unavailable();
      record = JSON.parse(await handle.readFile("utf8"));
    } catch (error) {
      if (error.code === "ENOENT") throw new AttachmentError("attachment_not_found", "The original upload is incomplete or unavailable.", 404);
      throw unavailable();
    } finally { await handle?.close(); }
    if (record?.version !== 1 || record.id !== id.toLowerCase() || !/^original(?:\.[a-z0-9]{1,16})?$/.test(record.filename)
      || typeof record.name !== "string" || !record.name || record.name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(record.name)
      || !Number.isSafeInteger(record.size) || record.size < 0 || record.size > this.limits.fileBytes
      || !/^[a-f0-9]{64}$/.test(record.sha256) || typeof record.referenced !== "boolean"
      || !Number.isFinite(Date.parse(record.createdAt))
      || !(record.kind === "image" && TYPES.includes(record.mediaType) || record.kind === "file" && record.mediaType === "application/octet-stream")) throw unavailable();
    return record;
  }

  async publishMetadata(directory, record) {
    const temporary = path.join(directory, `.metadata-${randomUUID()}`);
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(record)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, path.join(directory, "metadata.json"));
    const folder = await open(directory, "r"); try { await folder.sync(); } finally { await folder.close(); }
  }

  async storageUsage() {
    let bytes = 0;
    const cutoff = Date.now() - this.limits.unreferencedHours * 3600000;
    for (const item of await readdir(this.root, { withFileTypes: true })) {
      if (!ID.test(item.name)) continue;
      if (!item.isDirectory() || item.isSymbolicLink()) throw unavailable();
      const directory = await this.directory(item.name);
      let record;
      try { record = await this.record(item.name); }
      catch (error) { if (error.code !== "attachment_not_found") throw error; }
      const names = await readdir(directory);
      for (const name of names) {
        if (!/^(?:metadata\.json|pending\.json|original(?:\.[a-z0-9]{1,16})?|\.(?:metadata|upload)-[a-f0-9-]{36})$/.test(name)) throw unavailable();
        const handle = await this.openPrivate(path.join(directory, name)); await handle.close();
      }
      if (record ? !record.referenced && Date.parse(record.createdAt) < cutoff : (await lstat(directory)).mtimeMs < cutoff) {
        await rm(directory, { recursive: true }); continue;
      }
      // Include abandoned temporary files in quota until their known draft expires.
      for (const name of names) {
        const handle = await this.openPrivate(path.join(directory, name));
        try { bytes += (await handle.stat()).size; } finally { await handle.close(); }
      }
    }
    return bytes;
  }

  async upload(id, name, request) {
    if (!ID.test(id)) throw new AttachmentError("invalid_attachment_id", "The upload identifier is invalid.");
    id = id.toLowerCase();
    if (typeof name !== "string" || !name.trim() || name.length > 240 || /[\x00-\x1f\x7f/\\]/.test(name)) throw new AttachmentError("invalid_attachment_name", "Use a filename without paths or control characters.");
    const rawLength = request.headers.get("content-length");
    const declared = rawLength === null ? null : /^\d+$/.test(rawLength) ? Number(rawLength) : NaN;
    if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0)) throw new AttachmentError("invalid_request", "Invalid upload size.");
    if (declared > this.limits.fileBytes) throw new AttachmentError("attachment_too_large", "Each attachment must be 100 MiB or smaller.", 413);
    return this.withLock(async () => {
      const usage = await this.storageUsage();
      const directory = await this.directory(id, true);
      const existing = await this.record(id).catch(error => { if (error.code === "attachment_not_found") return null; throw error; });
      const temporary = path.join(directory, `.upload-${randomUUID()}`);
      const file = await open(temporary, "wx", 0o600);
      const reader = request.body?.getReader();
      const hash = createHash("sha256"); let size = 0; let prefix = Buffer.alloc(0);
      const deadline = Date.now() + 15 * 60000;
      try {
        if (usage + 8192 > this.limits.storageBytes) throw new AttachmentError("attachment_storage_full", "Attachment storage is full. Existing originals have been kept.", 507);
        while (reader) {
          const next = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new AttachmentError("attachment_upload_interrupted", "Upload stalled. Retry this file.", 503, true)), Math.max(1, Math.min(this.uploadIdleMs, deadline - Date.now())));
            reader.read().then(resolve, reject).finally(() => clearTimeout(timer));
          });
          if (next.done) break;
          const chunk = Buffer.from(next.value); size += chunk.length;
          if (size > this.limits.fileBytes) throw new AttachmentError("attachment_too_large", "Each attachment must be 100 MiB or smaller.", 413);
          if (usage + size + 8192 > this.limits.storageBytes) throw new AttachmentError("attachment_storage_full", "Attachment storage is full. Existing originals have been kept.", 507);
          if (prefix.length < 16) prefix = Buffer.concat([prefix, chunk.subarray(0, 16 - prefix.length)]);
          hash.update(chunk); await file.writeFile(chunk);
        }
        if (declared !== null && declared !== size) throw new AttachmentError("attachment_upload_interrupted", "Upload was incomplete. Retry this file.", 503, true);
        const digest = hash.digest("hex");
        if (existing) {
          if (existing.sha256 !== digest || existing.name !== name) throw new AttachmentError("attachment_conflict", "This identifier belongs to a different original.", 409);
          const verified = await this.openOriginal(id); await verified.handle.close();
          return publicView(existing);
        }
        await file.sync();
        const extension = path.extname(name).toLowerCase();
        const filename = `original${/^\.[a-z0-9]{1,16}$/.test(extension) ? extension : ""}`;
        const mediaType = imageType(prefix);
        const record = { version: 1, id, name, filename, size, sha256: digest, mediaType,
          kind: mediaType.startsWith("image/") ? "image" : "file", createdAt: new Date().toISOString(), referenced: false };
        // A pending receipt precedes publication, so an interrupted upload can
        // reconcile exact original bytes without overwriting an unknown file.
        const destination = path.join(directory, filename);
        const pendingPath = path.join(directory, "pending.json");
        let pending = null;
        try {
          const pendingFile = await this.openPrivate(pendingPath);
          try { if ((await pendingFile.stat()).size > 8192) throw unavailable(); pending = JSON.parse(await pendingFile.readFile("utf8")); } finally { await pendingFile.close(); }
        } catch (error) { if (error.code !== "ENOENT") throw unavailable(); }
        if (pending && ["id", "name", "filename", "sha256", "size"].some(key => pending[key] !== record[key])) throw new AttachmentError("attachment_conflict", "An interrupted upload with this identifier has different bytes or metadata.", 409);
        if (!pending) {
          const receipt = await open(pendingPath, "wx", 0o600);
          try { await receipt.writeFile(JSON.stringify(record)); await receipt.sync(); } finally { await receipt.close(); }
        }
        if (await lstat(destination).catch(error => { if (error.code === "ENOENT") return null; throw error; })) {
          if (!pending) throw unavailable();
          const orphan = await this.openPrivate(destination); const orphanHash = createHash("sha256");
          try { for await (const chunk of orphan.createReadStream({ autoClose: false, start: 0 })) orphanHash.update(chunk); } finally { await orphan.close(); }
          if (orphanHash.digest("hex") !== digest) throw unavailable();
        } else await rename(temporary, destination);
        await this.publishMetadata(directory, record);
        await rm(pendingPath);
        return publicView(record);
      } catch (error) {
        await reader?.cancel().catch(() => undefined);
        throw error instanceof AttachmentError ? error : new AttachmentError("attachment_upload_interrupted", "Upload was interrupted. Retry this file.", 503, true);
      } finally { reader?.releaseLock(); await file.close(); await rm(temporary, { force: true }); }
    });
  }

  async openOriginal(id) {
    const record = await this.record(id);
    let handle;
    try {
      handle = await this.openPrivate(path.join(await this.directory(id), record.filename));
      const before = await handle.stat(); const hash = createHash("sha256");
      if (before.size !== record.size) throw unavailable();
      for await (const chunk of handle.createReadStream({ autoClose: false, start: 0 })) hash.update(chunk);
      const after = await handle.stat();
      if (hash.digest("hex") !== record.sha256 || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw unavailable();
      return { view: publicView(record), sha256: record.sha256, handle };
    } catch (error) { await handle?.close(); throw error instanceof AttachmentError ? error : unavailable(); }
  }

  async prepare(ids, { retain = false } = {}) {
    if (!Array.isArray(ids) || ids.length > this.limits.count || ids.some(id => typeof id !== "string" || !ID.test(id)) || new Set(ids.map(id => id.toLowerCase())).size !== ids.length) throw new AttachmentError("attachment_limit", "Use up to 10 different attachments per message.");
    return this.withLock(async () => {
      const records = [];
      for (const id of ids) {
        const original = await this.openOriginal(id); await original.handle.close();
        records.push({ view: original.view, sha256: original.sha256 });
      }
      if (records.reduce((sum, value) => sum + value.view.size, 0) > this.limits.messageBytes) throw new AttachmentError("attachment_limit", "Attachments in one message must total 250 MiB or less.", 413);
      if (retain) for (const id of ids) {
        const record = await this.record(id);
        if (!record.referenced) await this.publishMetadata(await this.directory(id), { ...record, referenced: true });
      }
      return records;
    });
  }

  async snapshotForDispatch(ids, directory) {
    const records = await this.prepare(ids, { retain: true });
    const destination = await safeDirectory(directory, true);
    const snapshots = [];
    for (const record of records) {
      const original = await this.openOriginal(record.view.id);
      const filePath = path.join(destination, record.view.id + path.extname(record.view.name).replace(/[^.a-zA-Z0-9]/g, "").slice(0, 17));
      let output; const hash = createHash("sha256");
      try {
        output = await open(filePath, "wx", 0o600);
        for await (const chunk of original.handle.createReadStream({ autoClose: false, start: 0 })) { hash.update(chunk); await output.writeFile(chunk); }
        if (hash.digest("hex") !== record.sha256) throw unavailable();
        await output.sync();
        snapshots.push({ ...record, filePath });
      } finally { await original.handle.close(); await output?.close(); }
    }
    return snapshots;
  }

  async close() { await this.initializing; this.db?.close(); this.db = null; }
}
