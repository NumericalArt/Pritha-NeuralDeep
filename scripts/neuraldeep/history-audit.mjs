#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NeuralDeepChatHistoryStore } from './chat-history-store.mjs';
import { loadPrithaRuntimeEnv } from '../lib/env.mjs';
import { resolvePrithaStateRoot, resolveTechscopeRoot } from '../lib/paths.mjs';

export function auditChatHistory(options) {
  const store = new NeuralDeepChatHistoryStore({ ...options, readOnly: true });
  try {
    const source = store.verifySource();
    let legacyChats = 0, completeChats = 0;
    for (const row of store.statement('SELECT meta FROM chats').iterate()) {
      if (JSON.parse(row.meta).historyCompleteness === 'captured-from-creation') completeChats++; else legacyChats++;
    }
    return { ok: true, source, chats: { completeFromCreation: completeChats, legacyGapsPossible: legacyChats },
      counts: Object.fromEntries(['texts','text_parts','turns','items','receipts','task_links'].map(table => [table, store.statement(`SELECT count(*) AS count FROM ${table}`).get().count])),
      readOnly: true, inferenceCalls: 0 };
  } finally { store.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--json')) throw new Error('unsupported_audit_option');
    const root = resolveTechscopeRoot(); loadPrithaRuntimeEnv({ root });
    const stateRoot = resolvePrithaStateRoot({ root }), chatRoot = path.join(stateRoot, ...(stateRoot === root ? ['.private', 'codex-chat'] : ['codex-chat']));
    const databasePath = path.join(chatRoot, 'history.sqlite');
    if (!existsSync(databasePath)) throw new Error('history_storage_missing');
    const instanceScope = createHash('sha256').update(`${path.resolve(stateRoot)}:neuraldeep-chat-v1`).digest('hex');
    console.log(JSON.stringify(auditChatHistory({ databasePath, instanceScope }), null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: /^[a-z_]{1,80}$/.test(String(error?.code || error?.message || '')) ? error.code || error.message : 'history_audit_failed', readOnly: true, inferenceCalls: 0 })); process.exitCode = 1;
  }
}
