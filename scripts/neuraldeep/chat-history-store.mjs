import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync, constants, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NeuralDeepChatSummaries } from './chat-summary-projection.mjs';

export const HISTORY_PAGE_BYTES = 256 * 1024;
export const HISTORY_CONTENT_BYTES = 64 * 1024;
const CHUNK_BYTES = 8192;
const PREVIEW_BYTES = 2048;
const hash = text => createHash('sha256').update(text).digest('hex');
const encode = value => JSON.stringify(value);
const parse = value => value == null ? null : JSON.parse(value);
const validId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(id);
const ACTIVE = "('queued','waiting_for_provider','in_progress','waiting_for_approval','waiting_for_input')";

export class ChatHistoryError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
function requireId(id) { if (!validId(id)) throw new ChatHistoryError('history_identity_invalid', 'Invalid history identity.', 400); return id; }
function prefix(text, bytes = PREVIEW_BYTES) {
  const buffer = Buffer.from(String(text || ''));
  if (buffer.length <= bytes) return buffer.toString();
  let end = bytes;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString();
}
function *textChunks(text) {
  const buffer = Buffer.from(text);
  for (let offset = 0; offset < buffer.length;) {
    let end = Math.min(buffer.length, offset + CHUNK_BYTES);
    while (end < buffer.length && (buffer[end] & 0xc0) === 0x80) end--;
    yield buffer.subarray(offset, end).toString(); offset = end;
  }
}
function protectDatabase(file) {
  if (file === ':memory:') return;
  for (let current = path.dirname(path.resolve(file)); current !== path.dirname(current); current = path.dirname(current)) {
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    const alias = process.platform === 'darwin' && ['/tmp', '/var'].includes(current) && stat.isSymbolicLink() && realpathSync(current) === `/private${current}`;
    if (!alias && (stat.isSymbolicLink() || !stat.isDirectory())) throw new ChatHistoryError('history_storage_unsafe', 'History storage identity is invalid.');
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  for (const p of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(p) && (lstatSync(p).isSymbolicLink() || !lstatSync(p).isFile())) throw new ChatHistoryError('history_storage_unsafe', 'History storage identity is invalid.');
}

// Migration is a one-time bounded read under the existing registry writer lock.
export function readHistoryMigrationInput(file, stateRoot) {
  const stat = lstatSync(file), maximum = 128 * 1024 * 1024;
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maximum) throw new ChatHistoryError('history_migration_input_invalid', 'Preserve this registry and migrate it with a compatible bounded reader.');
  const real = realpathSync(file), root = realpathSync(stateRoot);
  if (!real.startsWith(`${root}${path.sep}`)) throw new ChatHistoryError('history_storage_unsafe', 'The migration source is outside this instance.');
  const fd = openSync(real, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new ChatHistoryError('history_storage_unsafe', 'The migration source changed during open.');
    const chunks = []; let total = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - total));
      const bytes = readSync(fd, buffer, 0, buffer.length, total);
      if (!bytes) break; total += bytes;
      if (total > maximum) throw new ChatHistoryError('history_migration_input_invalid', 'The migration source exceeds its bounded read limit.');
      chunks.push(buffer.subarray(0, bytes));
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total));
  } finally { closeSync(fd); }
}

/** Immutable source records and text chunks; indexed tables are rebuildable projections. */
export class NeuralDeepChatHistoryStore {
  constructor({ databasePath, instanceScope, readOnly = false }) {
    if (!databasePath || !instanceScope) throw new Error('history_storage_identity_required');
    if (readOnly && !existsSync(databasePath)) throw new ChatHistoryError('history_storage_missing', 'The history source does not exist.', 404);
    protectDatabase(databasePath);
    this.db = new DatabaseSync(databasePath, { readOnly });
    this.statements = new Map(); this.depth = 0;
    try {
      if (readOnly) {
        this.db.exec('PRAGMA busy_timeout=5000; PRAGMA query_only=ON; BEGIN DEFERRED;');
        if (this.db.prepare('PRAGMA user_version').get().user_version !== 1 || this.meta('instance') !== instanceScope) throw new ChatHistoryError('history_storage_mismatch', 'The source schema or instance identity does not match.');
        this.scope = instanceScope; this.generation = this.meta('generation'); this.secret = this.meta('cursor_secret');
        return;
      }
      if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
      this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (![0, 1].includes(version)) throw new ChatHistoryError('history_schema_unsupported', 'This history requires a compatible reader.');
      this.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS history_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS texts(hash TEXT PRIMARY KEY,bytes INTEGER NOT NULL,parts INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS text_parts(hash TEXT NOT NULL,part INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(hash,part));
          CREATE TABLE IF NOT EXISTS source_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,chat TEXT NOT NULL,kind TEXT NOT NULL,record TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS source_chat_sequence ON source_events(chat,sequence);
          CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY,client_id TEXT UNIQUE,revision INTEGER NOT NULL,meta TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS receipts(chat TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(chat,id));
          CREATE TABLE IF NOT EXISTS history_operations(chat TEXT NOT NULL,id TEXT NOT NULL,request_hash TEXT NOT NULL,PRIMARY KEY(chat,id));
          CREATE TABLE IF NOT EXISTS chat_visibility(scope TEXT PRIMARY KEY,archived INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS task_links(chat TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(chat,id));
          CREATE INDEX IF NOT EXISTS task_links_id ON task_links(id,chat);
          CREATE TABLE IF NOT EXISTS turns(sequence INTEGER PRIMARY KEY AUTOINCREMENT,chat TEXT NOT NULL,id TEXT NOT NULL,task_id TEXT,status TEXT NOT NULL,meta TEXT NOT NULL,user_body TEXT NOT NULL,UNIQUE(chat,id));
          CREATE INDEX IF NOT EXISTS turns_task ON turns(chat,task_id);
          CREATE INDEX IF NOT EXISTS turns_chat_sequence ON turns(chat,sequence);
          CREATE INDEX IF NOT EXISTS turns_active ON turns(chat,status,sequence);
          CREATE TABLE IF NOT EXISTS items(sequence INTEGER PRIMARY KEY AUTOINCREMENT,chat TEXT NOT NULL,turn_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,meta TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(chat,id));
          CREATE INDEX IF NOT EXISTS items_turn_sequence ON items(chat,turn_id,sequence);
          CREATE TABLE IF NOT EXISTS attachment_refs(chat TEXT NOT NULL,turn_id TEXT NOT NULL,id TEXT NOT NULL,sha256 TEXT NOT NULL,media_type TEXT NOT NULL,size INTEGER NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(chat,turn_id,id));
          CREATE INDEX IF NOT EXISTS attachment_refs_hash ON attachment_refs(chat,kind,sha256);
          CREATE INDEX IF NOT EXISTS chats_native_identity ON chats(json_extract(meta,'$.providerId'),json_extract(meta,'$.stateIdentityHash'),json_extract(meta,'$.profileIdentity'),json_extract(meta,'$.nativeThreadId'));
          PRAGMA user_version=1;`);
        const saved = this.meta('instance');
        if (saved && saved !== instanceScope) throw new ChatHistoryError('history_storage_mismatch', 'History belongs to another instance.');
        if (!saved) { this.setMeta('instance', instanceScope); this.setMeta('generation', randomUUID()); this.setMeta('cursor_secret', randomBytes(32).toString('hex')); }
      });
      this.scope = instanceScope; this.generation = this.meta('generation'); this.secret = this.meta('cursor_secret');
    } catch (error) { this.db.close(); throw error; }
  }
  statement(sql) { if (!this.statements.has(sql)) this.statements.set(sql, this.db.prepare(sql)); return this.statements.get(sql); }
  transaction(work) {
    if (this.depth) return work();
    this.db.exec('BEGIN IMMEDIATE'); this.depth++;
    try { const result = work(); if (result?.then) throw new Error('history_transaction_must_be_synchronous'); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.depth--; }
  }
  meta(key) { return this.statement('SELECT value FROM history_meta WHERE key=?').get(key)?.value || null; }
  setMeta(key, value) { this.statement('INSERT INTO history_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  close() { this.db.close(); }
  summaries() { return this.summaryProjection ||= new NeuralDeepChatSummaries(this); }
  body(text) {
    const value = String(text ?? ''), digest = hash(value);
    if (!this.statement('SELECT 1 FROM texts WHERE hash=?').get(digest)) {
      let part = 0;
      for (const chunk of textChunks(value)) this.statement('INSERT INTO text_parts VALUES(?,?,?)').run(digest, part++, chunk);
      this.statement('INSERT INTO texts VALUES(?,?,?)').run(digest, Buffer.byteLength(value), part);
    }
    return digest;
  }
  bodyPreview(digest, bytes = PREVIEW_BYTES) { return prefix(this.statement('SELECT text FROM text_parts WHERE hash=? AND part=0').get(digest)?.text || '', bytes); }
  event(chat, kind, record) {
    const raw = encode(record);
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new ChatHistoryError('history_metadata_too_large', 'History metadata exceeds its safe limit.');
    const previous = this.statement('SELECT hash FROM source_events ORDER BY sequence DESC LIMIT 1').get()?.hash || '';
    const digest = hash(encode([previous, chat, kind, raw]));
    this.statement('INSERT INTO source_events(chat,kind,record,previous_hash,hash) VALUES(?,?,?,?,?)').run(chat, kind, raw, previous, digest);
    this.project(chat, kind, record);
  }
  project(chat, kind, record) {
    if (kind === 'chat') this.statement(`INSERT INTO chats VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,revision=excluded.revision,meta=excluded.meta`).run(chat, record.clientId || null, record.revision, encode(record.meta));
    else if (kind === 'receipt') this.statement('INSERT INTO receipts VALUES(?,?,?,?) ON CONFLICT(chat,id) DO UPDATE SET value=excluded.value').run(chat, record.id, record.kind, encode(record.value));
    else if (kind === 'turn') {
      this.statement(`INSERT INTO turns(chat,id,task_id,status,meta,user_body) VALUES(?,?,?,?,?,?) ON CONFLICT(chat,id) DO UPDATE SET task_id=excluded.task_id,status=excluded.status,meta=excluded.meta,user_body=excluded.user_body`).run(chat, record.id, record.meta.taskId || null, record.meta.status, encode(record.meta), record.body);
      for (const file of record.meta.userMessage.attachments || []) {
        if (!validId(file.id) || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || !Number.isSafeInteger(file.size) || file.size < 0 || !['file','image'].includes(file.kind)) throw new ChatHistoryError('history_attachment_invalid', 'Invalid original attachment reference.');
        const prior = this.statement('SELECT sha256,media_type,size,kind FROM attachment_refs WHERE chat=? AND turn_id=? AND id=?').get(chat,record.id,file.id);
        if (prior && (prior.sha256 !== file.sha256 || prior.media_type !== file.mediaType || prior.size !== file.size || prior.kind !== file.kind)) throw new ChatHistoryError('history_attachment_conflict', 'A saved original reference cannot change.');
        this.statement('INSERT OR IGNORE INTO attachment_refs VALUES(?,?,?,?,?,?,?)').run(chat,record.id,file.id,file.sha256,file.mediaType,file.size,file.kind);
      }
    }
    else if (kind === 'item') this.statement(`INSERT INTO items(chat,turn_id,id,kind,meta,body) VALUES(?,?,?,?,?,?) ON CONFLICT(chat,id) DO UPDATE SET meta=excluded.meta,body=excluded.body,kind=excluded.kind`).run(chat, record.turnId, record.id, record.meta.kind, encode(record.meta), record.body);
    else if (kind === 'operation') this.statement('INSERT INTO history_operations VALUES(?,?,?)').run(chat, record.id, record.requestHash);
    else if (kind === 'visibility') this.statement('INSERT INTO chat_visibility VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET archived=excluded.archived').run(record.scope, record.archived ? 1 : 0);
    else if (kind === 'task_link') this.statement('INSERT INTO task_links VALUES(?,?,?) ON CONFLICT(chat,id) DO UPDATE SET value=excluded.value').run(chat, record.id, encode(record.value));
  }
  sourceRaw(chat, turnId, raw) { return this.transaction(() => { this.event(requireId(chat), 'raw', { turnId: requireId(turnId), body: this.body(raw), format: 'codex-cli-jsonl-v1' }); }); }
  replayedOperation(chat,id,input) {
    requireId(id);
    const row=this.statement('SELECT request_hash FROM history_operations WHERE chat=? AND id=?').get(chat,id);
    if(!row)return null;
    if(row.request_hash!==hash(encode(input)))throw new ChatHistoryError('idempotency_conflict','This operation ID has different content.');
    return this.get(chat);
  }
  operation(chat, id, input, expectedRevision, update) {
    requireId(id);
    const requestHash = hash(encode(input));
    return this.transaction(() => {
      const prior = this.statement('SELECT request_hash FROM history_operations WHERE chat=? AND id=?').get(chat, id);
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ChatHistoryError('idempotency_conflict', 'This operation ID has different content.');
        return { binding: this.get(chat), replayed: true };
      }
      const current = this.get(chat);
      if (!current) throw new ChatHistoryError('thread_not_found', 'Chat not found.', 404);
      if (!Number.isSafeInteger(expectedRevision) || current.revision !== expectedRevision) throw new ChatHistoryError('history_revision_conflict', 'This chat changed. Refresh before applying this operation.');
      update(current);
      this.event(chat, 'operation', { id, requestHash });
      return { binding: this.get(chat), replayed: false };
    });
  }
  aliasScope(binding) {
    return binding.nativeThreadId && binding.providerId === 'neuraldeep_cli' && ['recorded', 'restored'].includes(binding.identityStatus) && binding.stateIdentityHash && binding.profileIdentity
      ? hash(encode([binding.providerId, binding.stateIdentityHash, binding.profileIdentity, binding.nativeThreadId])) : `chat:${binding.chatId}`;
  }
  archive(chat, archived, id, expectedRevision) {
    if (typeof archived !== 'boolean') throw new ChatHistoryError('invalid_request', 'Archive state must be a boolean.', 400);
    return this.operation(chat, id, { action: 'archive', archived }, expectedRevision, binding => {
      const scope = this.aliasScope(binding);
      this.event(chat, 'visibility', { scope, archived });
      this.put({ ...binding, archived, updatedAt: new Date().toISOString() });
    });
  }
  putReceipt(chat, id, kind, value) {
    requireId(id);
    const old = this.receipt(chat, id);
    if (old && (old.kind !== kind || (old.value.requestHash && value.requestHash && old.value.requestHash !== value.requestHash) || (old.value.turnId && value.turnId && old.value.turnId !== value.turnId))) throw new ChatHistoryError('idempotency_conflict', 'This request ID already belongs to another action.');
    if (!old || encode(old.value) !== encode(value)) this.event(chat, 'receipt', { id, kind, value });
  }
  receipt(chat, id) { const row = this.statement('SELECT kind,value FROM receipts WHERE chat=? AND id=?').get(chat, id); return row ? { kind: row.kind, value: parse(row.value) } : null; }
  put(binding, { legacy = false } = {}) {
    return this.transaction(() => {
      const startSequence = this.statement('SELECT max(sequence) AS sequence FROM source_events').get().sequence;
      const chat = requireId(binding.chatId), old = this.statement('SELECT meta,revision FROM chats WHERE id=?').get(chat);
      const { turns = [], messageReceipts = {}, deliveryBudgetRequests = {}, taskLinks = [], revision: _revision, ...meta } = binding;
      meta.historyCompleteness = old ? parse(old.meta).historyCompleteness : legacy ? 'legacy-gaps-possible' : 'captured-from-creation';
      for (const [id, receipt] of Object.entries(messageReceipts)) this.putReceipt(chat, id, 'message', receipt);
      for (const [id, receipt] of Object.entries(deliveryBudgetRequests)) this.putReceipt(chat, id, 'budget', receipt);
      for (const link of taskLinks) {
        const oldLink = this.statement('SELECT value FROM task_links WHERE chat=? AND id=?').get(chat, link.taskId);
        if (oldLink?.value !== encode(link)) this.event(chat, 'task_link', { id: link.taskId, value: link });
      }
      for (const turn of turns) this.putTurn(chat, legacy ? { ...turn, items: turn.items.map(item => {
        const previous = this.statement('SELECT turn_id FROM items WHERE chat=? AND id=?').get(chat, item.id);
        if (!previous || previous.turn_id === turn.turnId) return item;
        const id = `item_${hash(`${chat}:${turn.turnId}:${item.id}`).slice(0, 24)}`;
        return { ...item, id, ...(item.kind === 'assistant_message' ? { message: { ...item.message, id } } : {}) };
      }) } : turn);
      const encoded = encode(meta);
      if (!old || encoded !== old.meta || startSequence !== this.statement('SELECT max(sequence) AS sequence FROM source_events').get().sequence) this.event(chat, 'chat', { clientId: binding.clientThreadId, revision: (old?.revision || 0) + 1, meta });
      return this.get(chat);
    });
  }
  putIfAbsent(binding) {
    return this.transaction(() => {
      const prior = this.statement('SELECT id FROM chats WHERE client_id=?').get(binding.clientThreadId);
      if (prior) return { binding: this.get(prior.id), created: false };
      return { binding: this.put(binding), created: true };
    });
  }
  putTurn(chat, turn) {
    return this.transaction(() => {
      requireId(chat); requireId(turn.turnId);
      const { items = [], ...meta } = turn, user = meta.userMessage;
      if (!user || typeof user.markdown !== 'string') throw new ChatHistoryError('history_turn_invalid', 'A stored turn needs its original request.');
      const old = this.statement('SELECT meta,user_body FROM turns WHERE chat=? AND id=?').get(chat, turn.turnId);
      const priorBody = this.contentHash(chat, 'user', user.contentRef);
      const body = priorBody || this.body(user.markdown);
      meta.userMessage = { ...user, markdown: this.bodyPreview(body) }; delete meta.userMessage.contentRef;
      delete meta.history;
      if (!old || old.meta !== encode(meta) || old.user_body !== body) this.event(chat, 'turn', { id: turn.turnId, meta, body });
      for (const item of items) this.putItem(chat, turn.turnId, item);
      return this.turn(chat, turn.turnId);
    });
  }
  putItem(chat, turnId, item, originalText) {
    return this.transaction(() => {
      requireId(item.id); requireId(turnId);
      const old = this.statement('SELECT turn_id,kind,meta,body FROM items WHERE chat=? AND id=?').get(chat, item.id);
      if (old && old.turn_id !== turnId) throw new ChatHistoryError('history_item_conflict', 'This item belongs to another turn.');
      const meta = structuredClone(item); delete meta.contentRef;
      let text = '', ref = item.contentRef;
      if (item.kind === 'assistant_message') { text = item.message.markdown; ref = item.message.contentRef; delete meta.message.contentRef; }
      else if (item.kind === 'command') text = [item.commandPreview, item.outputPreview].filter(x => x != null).join('\n\n');
      else if (item.kind === 'file_change') text = item.diffPreview || '';
      else if (item.kind === 'reasoning_summary') text = item.markdown || '';
      else if (item.kind === 'tool') text = item.summary || '';
      else if (item.kind === 'web_search') text = item.query || '';
      else if (item.kind === 'notice') text = item.text || '';
      const body = originalText != null ? this.body(originalText) : this.contentHash(chat, item.id, ref) || this.body(text);
      const preview = this.bodyPreview(body);
      if (item.kind === 'assistant_message') meta.message.markdown = preview;
      if (item.kind === 'command') { meta.commandPreview = prefix(item.commandPreview, 256); meta.outputPreview = null; }
      if (item.kind === 'file_change') { meta.diffPreview = null; meta.changes = item.changes.slice(0, 10).map(change => ({ ...change, path: prefix(change.path, 512) })); }
      if (item.kind === 'reasoning_summary') meta.markdown = preview;
      if (item.kind === 'tool') meta.summary = preview;
      if (item.kind === 'web_search') meta.query = preview;
      if (item.kind === 'notice') meta.text = preview;
      if (!old || old.kind !== item.kind || old.meta !== encode(meta) || old.body !== body) this.event(chat, 'item', { turnId, id: item.id, meta, body });
      return this.item(chat, item.id);
    });
  }
  sign(chat, kind, data) {
    const payload = Buffer.from(encode({ v: 1, generation: this.generation, scope: this.scope, chat, kind, ...data })).toString('base64url');
    return `${payload}.${createHmac('sha256', this.secret).update(payload).digest('base64url')}`;
  }
  cursor(chat, token, kind) {
    if (typeof token !== 'string' || token.length > 4096) throw new ChatHistoryError('history_cursor_expired', 'Reload this history page.');
    const [payload, signature, excess] = token.split('.');
    const expected = createHmac('sha256', this.secret).update(payload || '').digest();
    const actual = Buffer.from(signature || '', 'base64url');
    if (excess || actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new ChatHistoryError('history_cursor_expired', 'Reload this history page.');
    let value; try { value = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { /* rejected below */ }
    if (value?.v !== 1 || value.generation !== this.generation || value.scope !== this.scope || value.chat !== chat || value.kind !== kind) throw new ChatHistoryError('history_cursor_expired', 'This history position belongs to another source.');
    return value;
  }
  contentHash(chat, itemId, ref) {
    if (!ref) return null;
    const value = this.cursor(chat, ref, 'content');
    if (value.item !== itemId || !/^[a-f0-9]{64}$/.test(value.hash || '') || !this.statement('SELECT 1 FROM texts WHERE hash=?').get(value.hash)) throw new ChatHistoryError('history_content_missing', 'Original content is unavailable.');
    return value.hash;
  }
  item(chat, itemId) {
    const row = this.statement('SELECT meta,body FROM items WHERE chat=? AND id=?').get(chat, itemId);
    if (!row) return null;
    const item = parse(row.meta), ref = this.sign(chat, 'content', { item: itemId, hash: row.body, part: 0 });
    if (item.kind === 'assistant_message') item.message.contentRef = ref; else item.contentRef = ref;
    return item;
  }
  turn(chat, turnId, { itemLimit = 20, compact = false } = {}) {
    const row = this.statement('SELECT meta,user_body FROM turns WHERE chat=? AND id=?').get(chat, turnId);
    if (!row) return null;
    const turn = parse(row.meta);
    turn.userMessage.contentRef = this.sign(chat, 'content', { item: 'user', turn: turnId, hash: row.user_body, part: 0 });
    const last = compact ? this.statement("SELECT id FROM items WHERE chat=? AND turn_id=? AND kind='assistant_message' AND coalesce(json_extract(meta,'$.message.phase'),'')!='commentary' ORDER BY sequence DESC LIMIT 1").all(chat, turnId)
      : this.statement('SELECT id FROM items WHERE chat=? AND turn_id=? ORDER BY sequence DESC LIMIT ?').all(chat, turnId, Math.max(1, Math.min(itemLimit, 40))).reverse();
    turn.items = last.map(item => this.item(chat, item.id));
    const summary = this.statement('SELECT count(*) AS count,max(sequence) AS high FROM items WHERE chat=? AND turn_id=?').get(chat, turnId);
    turn.history = { activityState: summary.count ? 'not_loaded' : 'empty', itemCount: summary.count,
      itemsCursor: summary.count ? this.sign(chat, 'items', { turn: turnId, after: 0, high: summary.high }) : null };
    return turn;
  }
  get(chat, { turnLimit = 20, includeTurnId } = {}) {
    const row = this.statement('SELECT meta,revision FROM chats WHERE id=?').get(chat);
    if (!row) return null;
    const binding = { ...parse(row.meta), revision: row.revision, messageReceipts: {}, deliveryBudgetRequests: {}, turns: [], taskLinks: this.statement('SELECT value FROM task_links WHERE chat=? ORDER BY rowid DESC LIMIT 200').all(chat).reverse().map(row => parse(row.value)) };
    const visibility = this.statement('SELECT archived FROM chat_visibility WHERE scope=?').get(this.aliasScope(binding));
    if (visibility) binding.archived = Boolean(visibility.archived);
    for (const receipt of this.statement('SELECT id,kind,value FROM receipts WHERE chat=? ORDER BY rowid DESC LIMIT 200').all(chat)) {
      binding[receipt.kind === 'budget' ? 'deliveryBudgetRequests' : 'messageReceipts'][receipt.id] = parse(receipt.value);
    }
    const ids = this.statement('SELECT id,sequence FROM turns WHERE chat=? ORDER BY sequence DESC LIMIT ?').all(chat, Math.max(0, Math.min(turnLimit, 200)));
    if (includeTurnId && !ids.some(x => x.id === includeTurnId)) {
      const extra = this.statement('SELECT id,sequence FROM turns WHERE chat=? AND id=?').get(chat, includeTurnId); if (extra) ids.push(extra);
    }
    binding.turns = ids.sort((a, b) => a.sequence - b.sequence).map(row => this.turn(chat, row.id));
    if (includeTurnId) {
      const turn = binding.turns.find(row => row.turnId === includeTurnId), receipt = turn?.clientMessageId ? this.receipt(chat, turn.clientMessageId) : null;
      if (receipt?.kind === 'message') binding.messageReceipts[turn.clientMessageId] = receipt.value;
      if (turn?.taskId && !binding.taskLinks.some(link => link.taskId === turn.taskId)) {
        const link = this.statement('SELECT value FROM task_links WHERE chat=? AND id=?').get(chat, turn.taskId); if (link) binding.taskLinks.push(parse(link.value));
      }
    }
    return binding;
  }
  chatForTask(taskId) { return this.statement('SELECT chat FROM task_links WHERE id=? ORDER BY rowid LIMIT 1').get(taskId)?.chat || null; }
  attachmentInSession(chat, file = null) {
    const binding = this.statement('SELECT meta FROM chats WHERE id=?').get(chat);
    if (!binding) return false;
    const b = parse(binding.meta);
    const aliases = b.providerId === 'neuraldeep_cli' && ['recorded','restored'].includes(b.identityStatus) && b.nativeThreadId && b.profileIdentity && b.stateIdentityHash;
    const where = aliases ? `(c.id=? OR (json_extract(c.meta,'$.providerId')='neuraldeep_cli' AND json_extract(c.meta,'$.identityStatus') IN ('recorded','restored') AND json_extract(c.meta,'$.stateIdentityHash')=? AND json_extract(c.meta,'$.profileIdentity')=? AND json_extract(c.meta,'$.nativeThreadId')=?))` : 'c.id=?';
    const params = aliases ? [chat,b.stateIdentityHash,b.profileIdentity,b.nativeThreadId] : [chat];
    if (file) params.push(file.sha256,file.mediaType,file.size);
    return Boolean(this.statement(`SELECT 1 FROM chats c JOIN attachment_refs a ON a.chat=c.id WHERE ${where} AND a.kind='image' ${file ? 'AND a.sha256=? AND a.media_type=? AND a.size=?' : ''} LIMIT 1`).get(...params));
  }
  all() { return this.statement('SELECT id FROM chats ORDER BY rowid').all().map(row => this.get(row.id, { turnLimit: 0 })); }
  findByClient(clientId) { const row = this.statement('SELECT id FROM chats WHERE client_id=?').get(clientId); return row ? this.get(row.id) : null; }
  mutate(chat, update, create, includeTurnId) {
    return this.transaction(() => {
      const existing = this.get(chat, { includeTurnId }), current = existing || create?.();
      if (!current) return null;
      const updated = update(structuredClone(current), !existing);
      if (updated?.chatId !== chat) throw new ChatHistoryError('history_identity_conflict', 'A mutation cannot replace chat identity.');
      this.put(updated);
      return { binding: this.get(chat, { includeTurnId }), created: !existing };
    });
  }
  mutateTurn(chat, turnId, update) {
    return this.transaction(() => { const current = this.turn(chat, turnId); return current ? this.putTurn(chat, update(current)) : null; });
  }
  turnIdForTask(chat, taskId) { return this.statement('SELECT id FROM turns WHERE chat=? AND task_id=? ORDER BY sequence DESC LIMIT 1').get(chat, taskId)?.id || null; }
  taskStatus(chat, taskId) { return this.statement('SELECT status FROM turns WHERE chat=? AND task_id=? ORDER BY sequence DESC LIMIT 1').get(chat, taskId)?.status || null; }
  turnState(chat, id) { const row=this.statement('SELECT meta FROM turns WHERE chat=? AND id=?').get(chat,id);return row?parse(row.meta):null; }
  liveTurns(chat) {
    return this.statement(`SELECT id FROM turns WHERE chat=? AND status IN ${ACTIVE} ORDER BY sequence LIMIT 101`).all(chat)
      .map(row => this.turn(chat,row.id,{compact:true}));
  }
  reconcileInactiveDirectChats() {
    return this.transaction(() => {
      const rows = this.statement(`SELECT id FROM chats c WHERE json_extract(meta,'$.origin')='chat'
        AND json_extract(meta,'$.lastStatus')='active'
        AND NOT EXISTS (SELECT 1 FROM turns t WHERE t.chat=c.id AND t.status IN ${ACTIVE})`).all();
      for (const row of rows) this.mutate(row.id, current => ({...current,lastStatus:'idle'}));
      return rows.length;
    });
  }
  originalUserText(chat, turnId, maxBytes = 64_000) {
    const row = this.statement('SELECT user_body FROM turns WHERE chat=? AND id=?').get(chat,turnId);
    const body = row && this.statement('SELECT bytes FROM texts WHERE hash=?').get(row.user_body);
    if (!body || body.bytes > maxBytes) throw new ChatHistoryError('history_request_unavailable','The original request cannot be dispatched within the current input limit.');
    return this.statement('SELECT text FROM text_parts WHERE hash=? ORDER BY part').all(row.user_body).map(part=>part.text).join('');
  }
  *activeTurns() {
    let after = 0;
    while (true) {
      const rows = this.statement(`SELECT chat,id,sequence FROM turns WHERE status IN ${ACTIVE} AND sequence>? ORDER BY sequence LIMIT 32`).all(after);
      if (!rows.length) break;
      for (const row of rows) { after = row.sequence; yield { chatId: row.chat, turn: this.turn(row.chat, row.id) }; }
    }
  }
  turnsPage(chat, { cursor, limit = 20 } = {}) {
    const binding = this.get(chat, { turnLimit: 0 });
    if (!binding) throw new ChatHistoryError('thread_not_found', 'Task Chat was not found.', 404);
    const position = cursor ? this.cursor(chat, cursor, 'turns') : { before: Number.MAX_SAFE_INTEGER, high: this.statement('SELECT max(sequence) AS high FROM turns WHERE chat=?').get(chat).high || 0 };
    if (!Number.isSafeInteger(position.before) || !Number.isSafeInteger(position.high)) throw new ChatHistoryError('history_cursor_expired', 'Reload this history page.');
    const rows = this.statement('SELECT id,sequence FROM turns WHERE chat=? AND sequence<? AND sequence<=? ORDER BY sequence DESC LIMIT ?').all(chat, position.before, position.high, Math.max(1, Math.min(limit, 20)));
    const data = []; let before = position.before;
    for (const row of rows) {
      const turn = this.turn(chat, row.id, { compact: true });
      if (Buffer.byteLength(encode([...data, turn])) > HISTORY_PAGE_BYTES - 4096) break;
      data.push(turn); before = row.sequence;
    }
    if (!data.length && rows.length) throw new ChatHistoryError('history_item_too_large', 'This history item needs a compatible bounded reader.', 413);
    const hasOlder = Boolean(this.statement('SELECT 1 FROM turns WHERE chat=? AND sequence<? AND sequence<=? LIMIT 1').get(chat, before, position.high));
    return { data: data.reverse(), olderCursor: hasOlder ? this.sign(chat, 'turns', { before, high: position.high }) : null,
      newerCursor: null, hasOlder, hasNewer: false, snapshotAt: new Date().toISOString(), sourceMode: 'neuraldeep-private', completeness: binding.historyCompleteness };
  }
  itemsPage(chat, turnId, cursor, activity = false) {
    const position = this.cursor(chat, cursor, 'items');
    if (position.turn !== turnId || !Number.isSafeInteger(position.after) || !Number.isSafeInteger(position.high)) throw new ChatHistoryError('history_cursor_expired', 'Reload this activity page.');
    if (activity || position.activity) {
      if (!position.activity && position.after !== 0) throw new ChatHistoryError('history_cursor_expired', 'Reload recent activity.');
      const before = position.activity ? position.before : position.high + 1;
      if (!Number.isSafeInteger(before)) throw new ChatHistoryError('history_cursor_expired', 'Reload recent activity.');
      const rows = this.statement("SELECT id,sequence FROM items WHERE chat=? AND turn_id=? AND sequence<? AND sequence<=? AND (kind!='assistant_message' OR json_extract(meta,'$.message.phase')='commentary') ORDER BY sequence DESC LIMIT 5").all(chat, turnId, before, position.high);
      const data = []; let nextBefore = before;
      for (const row of rows) {
        const item = this.item(chat, row.id);
        if (Buffer.byteLength(encode([...data, item])) > HISTORY_PAGE_BYTES - 4096) break;
        data.push(item); nextBefore = row.sequence;
      }
      if (!data.length && rows.length) throw new ChatHistoryError('history_item_too_large', 'This activity needs a compatible bounded reader.', 413);
      const more = Boolean(this.statement("SELECT 1 FROM items WHERE chat=? AND turn_id=? AND sequence<? AND sequence<=? AND (kind!='assistant_message' OR json_extract(meta,'$.message.phase')='commentary') LIMIT 1").get(chat, turnId, nextBefore, position.high));
      return { data, nextCursor: more ? this.sign(chat, 'items', { turn: turnId, after: 0, high: position.high, before: nextBefore, activity: true }) : null };
    }
    const rows = this.statement('SELECT id,sequence FROM items WHERE chat=? AND turn_id=? AND sequence>? AND sequence<=? ORDER BY sequence LIMIT 40').all(chat, turnId, position.after, position.high);
    const data = []; let after = position.after;
    for (const row of rows) { const item = this.item(chat, row.id); if (Buffer.byteLength(encode([...data, item])) > HISTORY_PAGE_BYTES - 4096) break; data.push(item); after = row.sequence; }
    if (!data.length && rows.length) throw new ChatHistoryError('history_item_too_large', 'This activity needs a compatible bounded reader.', 413);
    const more = Boolean(this.statement('SELECT 1 FROM items WHERE chat=? AND turn_id=? AND sequence>? AND sequence<=? LIMIT 1').get(chat, turnId, after, position.high));
    return { data, nextCursor: more ? this.sign(chat, 'items', { turn: turnId, after, high: position.high }) : null };
  }
  content(chat, itemId, cursor) {
    const position = this.cursor(chat, cursor, 'content');
    if (position.item !== itemId || !Number.isSafeInteger(position.part) || position.part < 0) throw new ChatHistoryError('history_cursor_expired', 'Reload this original content.');
    const row = this.statement('SELECT parts,bytes FROM texts WHERE hash=?').get(position.hash);
    if (!row || position.part > row.parts) throw new ChatHistoryError('history_content_missing', 'Original content is unavailable.');
    let text = '', part = position.part;
    for (const chunk of this.statement('SELECT text FROM text_parts WHERE hash=? AND part>=? ORDER BY part LIMIT 7').all(position.hash, part)) {
      const next = part + 1 < row.parts ? this.sign(chat, 'content', { ...position, part: part + 1 }) : null;
      if (Buffer.byteLength(encode({ text: text + chunk.text, nextCursor: next, complete: !next, sha256: position.hash, bytes: row.bytes })) > HISTORY_CONTENT_BYTES - 512) break;
      text += chunk.text; part++;
    }
    const next = part < row.parts ? this.sign(chat, 'content', { ...position, part }) : null;
    return { text, nextCursor: next, complete: !next, sha256: position.hash, bytes: row.bytes };
  }
  *audit({ after = 0, chatId = null } = {}) {
    let cursor = after;
    const high = this.statement('SELECT max(sequence) AS high FROM source_events').get().high || 0;
    while (cursor < high) {
      const rows = chatId ? this.statement('SELECT * FROM source_events WHERE chat=? AND sequence>? AND sequence<=? ORDER BY sequence LIMIT 32').all(chatId, cursor, high)
        : this.statement('SELECT * FROM source_events WHERE sequence>? AND sequence<=? ORDER BY sequence LIMIT 32').all(cursor, high);
      if (!rows.length) break;
      for (const row of rows) { cursor = row.sequence; yield { ...row, record: parse(row.record), checkpoint: { sequence: cursor, high, hash: row.hash, generation: this.generation } }; }
    }
  }
  verifySource() {
    for (const body of this.statement('SELECT hash,bytes,parts FROM texts ORDER BY hash').iterate()) {
      const digest = createHash('sha256'); let bytes = 0, parts = 0;
      for (const row of this.statement('SELECT part,text FROM text_parts WHERE hash=? ORDER BY part').iterate(body.hash)) {
        if (row.part !== parts) throw new ChatHistoryError('history_source_corrupt', 'Original text has a missing part.');
        digest.update(row.text); bytes += Buffer.byteLength(row.text); parts++;
      }
      if (digest.digest('hex') !== body.hash || bytes !== body.bytes || parts !== body.parts) throw new ChatHistoryError('history_source_corrupt', 'Original text integrity check failed.');
    }
    let previous = '', count = 0;
    for (const row of this.audit()) { const computed = hash(encode([previous, row.chat, row.kind, encode(row.record)])); if (row.previous_hash !== previous || row.hash !== computed) throw new ChatHistoryError('history_source_corrupt', 'History source integrity check failed.'); previous = row.hash; count++; }
    return { count, digest: previous, generation: this.generation };
  }
  rebuildProjection() {
    return this.transaction(() => {
      const source = this.verifySource();
      this.setMeta('summary_projection_version','0');this.summaryProjection=null;
      this.db.exec('DELETE FROM chats; DELETE FROM receipts; DELETE FROM items; DELETE FROM turns; DELETE FROM attachment_refs; DELETE FROM task_links; DELETE FROM history_operations; DELETE FROM chat_visibility; DELETE FROM sqlite_sequence WHERE name IN (\'items\',\'turns\');');
      for (const row of this.audit()) this.project(row.chat, row.kind, row.record);
      return source;
    });
  }
}
