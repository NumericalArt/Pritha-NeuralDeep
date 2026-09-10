import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { inspectNativeSession } from '../scripts/neuraldeep/native-history-proof.mjs';
import { neuralDeepRuntimeIdentity } from '../scripts/neuraldeep/runtime-identity.mjs';
import { NeuralDeepChatHistoryStore } from '../scripts/neuraldeep/chat-history-store.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'nd-native-proof-')), stateRoot = path.join(root, 'state'), cwd = path.join(root, 'workspace');
  mkdirSync(cwd); const identity = neuralDeepRuntimeIdentity(stateRoot, {}), sessions = path.join(identity.home, 'sessions');
  mkdirSync(sessions, { recursive: true });
  const file = path.join(sessions, 'synthetic.jsonl'), index = path.join(identity.home, 'state_5.sqlite');
  const header = { type: 'session_meta', payload: { id: 'session-fixture', cwd, model_provider: 'neuraldeep', cli_version: '0.153.0' } };
  writeFileSync(file, JSON.stringify(header)+'\n');
  const db = new DatabaseSync(index);
  db.exec('CREATE TABLE threads(id TEXT PRIMARY KEY,rollout_path TEXT,model_provider TEXT,cwd TEXT)');
  db.prepare('INSERT INTO threads VALUES(?,?,?,?)').run(header.payload.id, file, 'neuraldeep', cwd); db.close();
  const binding = { chatId: 'chat_fixture', clientThreadId: 'client_fixture', nativeThreadId: header.payload.id, stateIdentityHash: identity.stateIdentityHash,
    providerId: 'neuraldeep_cli', identityStatus: 'recorded', turns: [], messageReceipts: {}, taskLinks: [], archived: false, lastStatus: 'active' };
  const options = { stateRoot, codeRoot: cwd, env: {} };
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, options, binding, identity, header, file, index, cwd };
}

test('native proof reads a pinned ND source without launching or modifying it and requires original storage/provider/workspace', t => {
  const f = fixture(t), before = createHash('sha256').update(readFileSync(f.file)).digest('hex');
  const proof = inspectNativeSession(f.binding, f.options);
  assert.equal(proof.available, true); assert.equal(proof.restoreAvailable, true);
  assert.equal(proof.profileIdentity, f.identity.profileIdentity);
  for (const altered of [ { providerId: 'desktop_bundled' }, { stateIdentityHash: '' }, { stateIdentityHash: 'a'.repeat(24) }, { profileIdentity: 'wrong' }, { workspacePath: f.root }, { nativeThreadId: 'missing' } ]) {
    assert.equal(inspectNativeSession({ ...f.binding, ...altered }, f.options).available, false);
  }
  assert.equal(inspectNativeSession({ ...f.binding, identityStatus: 'restored', profileIdentity: proof.profileIdentity, workspacePath: proof.workspacePath }, f.options).restoreAvailable, false);
  assert.equal(createHash('sha256').update(readFileSync(f.file)).digest('hex'), before);
  writeFileSync(f.file, JSON.stringify({ ...f.header, payload: { ...f.header.payload, model_provider: 'other' } })+'\n');
  assert.equal(inspectNativeSession(f.binding, f.options).code, 'native_format_unsupported');
  rmSync(f.file); symlinkSync(f.index, f.file);
  assert.equal(inspectNativeSession(f.binding, f.options).available, false);
});

test('archive affects only proven aliases, survives late aliases, execution updates, source replay and idempotent metadata CAS', t => {
  const f = fixture(t), store = new NeuralDeepChatHistoryStore({ databasePath: ':memory:', instanceScope: 'fixture' }); t.after(() => store.close());
  const first = { ...f.binding, profileIdentity: f.identity.profileIdentity };
  store.put(first);
  const copy = id => ({ ...first, chatId: id, clientThreadId: `client_${id}` });
  store.put(copy('chat_second'));
  store.put({ ...copy('chat_foreign'), profileIdentity: 'other-profile' });
  store.put({ ...copy('chat_unverified'), identityStatus: 'unverified' });
  const revision = store.get(first.chatId).revision;
  assert.equal(store.archive(first.chatId, true, 'request_archive', revision).replayed, false);
  assert.equal(store.archive(first.chatId, true, 'request_archive', revision).replayed, true);
  assert.throws(() => store.archive(first.chatId, false, 'request_archive', revision), { code: 'idempotency_conflict' });
  assert.throws(() => store.archive(first.chatId, false, 'request_stale', revision), { code: 'history_revision_conflict' });
  store.put(copy('chat_late'));
  for (const id of [first.chatId,'chat_second','chat_late']) { assert.equal(store.get(id).archived, true); assert.equal(store.get(id).lastStatus, 'active'); }
  for (const id of ['chat_foreign','chat_unverified']) assert.equal(store.get(id).archived, false);
  store.mutate('chat_second', row => ({ ...row, archived: false, lastStatus: 'idle' }));
  assert.equal(store.get('chat_second').archived, true);
  store.rebuildProjection(); assert.equal(store.get('chat_late').archived, true);
  store.archive('chat_second', false, 'request_unarchive', store.get('chat_second').revision);
  assert.equal(store.get(first.chatId).archived, false);
  const snapshot = store.verifySource();
  assert.throws(() => store.operation(first.chatId, 'request_restore', { proof: 'old' }, store.get(first.chatId).revision, current => { store.put({ ...current, identityStatus: 'restored' }); throw new Error('proof changed'); }), /proof changed/);
  assert.equal(store.get(first.chatId).identityStatus, 'recorded'); assert.deepEqual(store.verifySource(), snapshot);
});
