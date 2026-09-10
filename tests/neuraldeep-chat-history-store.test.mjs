import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { NeuralDeepChatHistoryStore, HISTORY_PAGE_BYTES, HISTORY_CONTENT_BYTES } from '../scripts/neuraldeep/chat-history-store.mjs';

const moduleUrl = pathToFileURL(path.resolve('scripts/neuraldeep/chat-history-store.mjs')).href;
const exec = promisify(execFile);
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nd-history-'));
  const options = { databasePath: path.join(root, 'history.sqlite'), instanceScope: 'nd-history-fixture' };
  let store = new NeuralDeepChatHistoryStore(options);
  t.after(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  return { root, options, get store() { return store; }, reopen() { store.close(); store = new NeuralDeepChatHistoryStore(options); return store; } };
}
function binding(id = 'chat_test') {
  return { chatId: id, clientThreadId: `client_${id}`, providerId: 'neuraldeep_cli', stateIdentityHash: 'a'.repeat(24),
    title: 'Fixture', createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z', archived: false, pinned: false,
    messageReceipts: {}, turns: [], deliveryBudgetRequests: {}, taskLinks: [] };
}
function turn(index, items = []) {
  return { turnId: `turn_${index}`, status: 'completed', startedAt: '2026-09-08T00:00:00.000Z', completedAt: '2026-09-08T00:00:01.000Z',
    userMessage: { id: `user_${index}`, markdown: `Request ${index}`, role: 'user', status: 'completed', createdAt: '2026-09-08T00:00:00.000Z' },
    items, error: null, pendingRequestIds: [] };
}
function message(id, text) {
  return { id, kind: 'assistant_message', status: 'completed', startedAt: null, completedAt: null,
    message: { id, markdown: text, role: 'assistant', status: 'completed', createdAt: '2026-09-08T00:00:00.000Z' } };
}
test('explicit commentary is visible in activity while final and unclassified answers retain their place', t => {
  const f = fixture(t), progress = message('progress', 'Checking the result for you.'), answer = message('answer', 'Done.');
  progress.message.phase = 'commentary'; answer.message.phase = 'final_answer';
  f.store.put(binding()); f.store.putTurn('chat_test', turn(1, [progress, answer]));
  const summary = f.store.turnsPage('chat_test').data[0];
  assert.deepEqual(summary.items.map(x => x.id), ['answer']);
  const activity = f.store.itemsPage('chat_test', 'turn_1', summary.history.itemsCursor, true);
  assert.deepEqual(activity.data.map(x => x.id), ['progress']);
  assert.equal(activity.data[0].message.phase, 'commentary');
  const legacy = message('legacy', 'Older answer without phase.');
  f.store.putTurn('chat_test', turn(2, [legacy]));
  const older = f.store.turnsPage('chat_test').data.find(x => x.turnId === 'turn_2');
  assert.equal(older.items[0].id, 'legacy');
  assert.deepEqual(f.store.itemsPage('chat_test', 'turn_2', older.history.itemsCursor, true).data, []);
});
function content(store, chat, itemId, ref) {
  const chunks = []; let cursor = ref;
  while (cursor) {
    const page = store.content(chat, itemId, cursor);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= HISTORY_CONTENT_BYTES);
    chunks.push(page.text); cursor = page.nextCursor;
  }
  return chunks.join('');
}

test('restart clears orphan direct-chat activity without touching live turns, Voice or history', t => {
  const f=fixture(t);
  f.store.put({...binding(),origin:'chat',lastStatus:'active',turns:[{...turn(1),status:'interrupted'}]});
  for (const status of ['queued','waiting_for_provider','in_progress','waiting_for_approval','waiting_for_input']) {
    f.store.put({...binding(`chat_${status}`),origin:'chat',lastStatus:'active',turns:[{...turn(status),status}]});
  }
  f.store.put({...binding('chat_voice'),origin:'voice',lastStatus:'active'});
  f.reopen();const before=f.store.turn('chat_test','turn_1');
  assert.equal(f.store.reconcileInactiveDirectChats(),1);
  assert.equal(f.store.get('chat_test').lastStatus,'idle');
  assert.deepEqual(f.store.turn('chat_test','turn_1'),before);
  assert.equal(f.store.reconcileInactiveDirectChats(),0);
  for (const b of f.store.all().filter(b=>b.chatId!=='chat_test'))assert.equal(b.lastStatus,'active');
});

test('recent activity reads five latest actions and expands older actions without losing copy order', t => {
  const f = fixture(t); f.store.put(binding());
  f.store.putTurn('chat_test', turn(1, [message('answer_first', 'First response')]));
  for (let i=0;i<73;i++) f.store.putItem('chat_test','turn_1',{id:`cmd_${i}`,kind:'command',status:'completed',commandPreview:`echo ${i}`,outputPreview:`output ${i}`});
  f.store.putItem('chat_test','turn_1',message('answer_last','Last response'));
  const ref=f.store.turnsPage('chat_test').data[0].history.itemsCursor;
  const first=f.store.itemsPage('chat_test','turn_1',ref,true);
  assert.deepEqual(first.data.map(item=>item.commandPreview),[72,71,70,69,68].map(i=>`echo ${i}`));
  f.store.putItem('chat_test','turn_1',{id:'new_command',kind:'command',commandPreview:'new',status:'completed'});
  const all=[...first.data];let cursor=first.nextCursor;
  while(cursor){const page=f.store.itemsPage('chat_test','turn_1',cursor,true);assert.ok(page.data.length<=5);all.push(...page.data);cursor=page.nextCursor;}
  assert.deepEqual(all.map(item=>item.commandPreview),Array.from({length:73},(_,i)=>`echo ${72-i}`));
  const original=f.store.itemsPage('chat_test','turn_1',ref);
  assert.equal(original.data[0].message.markdown,'First response');
  assert.equal(original.data[1].commandPreview,'echo 0');
});

test('10,001 turns remain complete, indexed, cursor-stable across append, restart and rebuild', t => {
  const f = fixture(t); f.store.put(binding());
  for (let index = 1; index <= 10001; index++) f.store.putTurn('chat_test', turn(index, [message(`answer_${index}`, `Answer ${index}`)]));
  const first = f.store.turnsPage('chat_test');
  assert.equal(first.data.length, 20); assert.equal(first.data.at(-1).turnId, 'turn_10001');
  assert.equal(first.completeness, 'captured-from-creation');
  f.store.putTurn('chat_test', turn(10002)); f.reopen();
  const ids = new Set(first.data.map(x => x.turnId)); let cursor = first.olderCursor;
  while (cursor) {
    const page = f.store.turnsPage('chat_test', { cursor });
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= HISTORY_PAGE_BYTES);
    for (const row of page.data) { assert.equal(ids.has(row.turnId), false); ids.add(row.turnId); }
    cursor = page.olderCursor;
  }
  assert.equal(ids.size, 10001); assert.ok(!ids.has('turn_10002'));
  const before = f.store.verifySource();
  assert.deepEqual(f.store.rebuildProjection(), before);
  assert.equal(f.store.turnsPage('chat_test').data.at(-1).turnId, 'turn_10002');
  assert.equal(f.store.turnsPage('chat_test', { cursor: first.olderCursor }).data.length, 20);
});

test('thousands of commands preserve every assistant part and >10 MiB original Unicode with bounded pages', t => {
  const f = fixture(t); f.store.put(binding());
  const original = 'Начало 😀漢字\n```text\n'.repeat(430000) + '\n```\nКонец';
  assert.ok(Buffer.byteLength(original) > 10 * 1024 * 1024);
  f.store.putTurn('chat_test', turn(1, [message('answer_first', 'First response\n'), message('answer_large', original)]));
  for (let index = 0; index < 2500; index++) f.store.putItem('chat_test', 'turn_1', {
    id: `command_${index}`, kind: 'command', status: 'completed', startedAt: null, completedAt: null,
    commandPreview: `printf command-${index}`, cwdLabel: '.', outputPreview: `output ${index}`, exitCode: 0,
  });
  f.store.putItem('chat_test', 'turn_1', message('answer_last', 'Last response'));
  const page = f.store.turnsPage('chat_test'); assert.equal(page.data[0].items.length, 1);
  assert.equal(page.data[0].history.activityState, 'not_loaded');
  let cursor = page.data[0].history.itemsCursor, count = 0; const texts = [];
  while (cursor) {
    const activity = f.store.itemsPage('chat_test', 'turn_1', cursor);
    assert.ok(activity.data.length <= 40); assert.ok(Buffer.byteLength(JSON.stringify(activity)) <= HISTORY_PAGE_BYTES);
    for (const item of activity.data) { count++; if (item.kind === 'assistant_message') texts.push(content(f.store, 'chat_test', item.id, item.message.contentRef)); }
    cursor = activity.nextCursor;
  }
  assert.equal(count, 2503); assert.deepEqual(texts, ['First response\n', original, 'Last response']);
  f.store.mutateTurn('chat_test', 'turn_1', value => ({ ...value, status: 'interrupted' }));
  assert.equal(content(f.store, 'chat_test', 'answer_large', f.store.item('chat_test', 'answer_large').message.contentRef), original);
  assert.ok(f.store.verifySource().count > 2503);
});

test('immutable original versions survive appends; scoped cursors reject other chat, instance, generation and tampering', t => {
  const f = fixture(t); f.store.put(binding()); f.store.put(binding('chat_other'));
  f.store.putTurn('chat_test', turn(1, [message('answer', 'version one')]));
  const ref = f.store.item('chat_test', 'answer').message.contentRef;
  f.store.putItem('chat_test', 'turn_1', message('answer', 'version two'));
  assert.equal(content(f.store, 'chat_test', 'answer', ref), 'version one');
  assert.throws(() => f.store.content('chat_other', 'answer', ref), { code: 'history_cursor_expired' });
  assert.throws(() => f.store.content('chat_test', 'wrong', ref), { code: 'history_cursor_expired' });
  assert.throws(() => f.store.content('chat_test', 'answer', ref.slice(0, -3) + 'xxx'), { code: 'history_cursor_expired' });
  const other = new NeuralDeepChatHistoryStore({ databasePath: ':memory:', instanceScope: 'other' });
  t.after(() => other.close()); assert.throws(() => other.content('chat_test', 'answer', ref), { code: 'history_cursor_expired' });
  assert.throws(() => new NeuralDeepChatHistoryStore({ ...f.options, instanceScope: 'foreign' }), { code: 'history_storage_mismatch' });
});

test('legacy gaps, archive flags and permanent receipts survive more than 500 writes and replay', t => {
  const f = fixture(t); f.store.put({ ...binding(), archived: true, nativeThreadId: 'exact-session', turns: [turn(1)] }, { legacy: true });
  for (let i = 0; i < 600; i++) f.store.mutate('chat_test', row => ({ ...row, messageReceipts: { [`message_${i}`]: { turnId: 'turn_1', requestHash: `hash-${i}` } } }));
  f.reopen();
  assert.equal(f.store.turnsPage('chat_test').completeness, 'legacy-gaps-possible');
  assert.equal(f.store.get('chat_test').archived, true);
  assert.equal(f.store.receipt('chat_test', 'message_0').value.requestHash, 'hash-0');
  assert.throws(() => f.store.mutate('chat_test', row => ({ ...row, deliveryBudgetRequests: { message_0: { requestHash: 'hash-0' } } })), { code: 'idempotency_conflict' });
  f.store.rebuildProjection();
  assert.equal(f.store.get('chat_test').nativeThreadId, 'exact-session');
  assert.equal(f.store.receipt('chat_test', 'message_0').value.requestHash, 'hash-0');
});

test('two Node processes perform one create and retain all concurrent receipts', async t => {
  const f = fixture(t);
  const script = `import { NeuralDeepChatHistoryStore } from ${JSON.stringify(moduleUrl)};
    const [options, row, prefix] = process.argv.slice(1).map(JSON.parse);
    const s = new NeuralDeepChatHistoryStore(options); const result = s.putIfAbsent(row);
    for(let i=0;i<30;i++)s.mutate(row.chatId,r=>({...r,messageReceipts:{[prefix+i]:{requestHash:prefix+i,turnId:'turn_1'}}}));
    console.log(JSON.stringify({created:result.created}));s.close();`;
  const results = await Promise.all(['left_', 'right_'].map(label => exec(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(f.options), JSON.stringify(binding()), JSON.stringify(label)], { timeout: 20000, killSignal: 'SIGKILL' })));
  assert.equal(results.filter(x => JSON.parse(x.stdout).created).length, 1);
  assert.equal(f.store.all().length, 1);
  assert.ok(f.store.receipt('chat_test', 'left_29')); assert.ok(f.store.receipt('chat_test', 'right_29'));
});

test('storage write failure rolls back source and projection; corruption preserves evidence', t => {
  const f = fixture(t); f.store.put(binding()); f.store.putTurn('chat_test', turn(1, [message('answer', 'original')]));
  const source = f.store.verifySource(), bindingBefore = f.store.get('chat_test');
  f.store.db.exec('PRAGMA query_only=ON');
  assert.throws(() => f.store.mutate('chat_test', row => ({ ...row, title: 'cannot save' })));
  f.store.db.exec('PRAGMA query_only=OFF');
  assert.deepEqual(f.store.verifySource(), source); assert.deepEqual(f.store.get('chat_test'), bindingBefore);
  f.store.db.prepare('UPDATE text_parts SET text=? WHERE hash=?').run('damaged', f.store.cursor('chat_test', f.store.item('chat_test', 'answer').message.contentRef, 'content').hash);
  assert.throws(() => f.store.verifySource(), { code: 'history_source_corrupt' });
  const bad = path.join(f.root, 'bad.sqlite'); writeFileSync(bad, 'preserve-corrupt-database');
  assert.throws(() => new NeuralDeepChatHistoryStore({ ...f.options, databasePath: bad }));
  assert.equal(readFileSync(bad, 'utf8'), 'preserve-corrupt-database');
});

test('headless audit uses a read-only snapshot, bounded source pages, complete digest and no new execution on retry', async t => {
  const f = fixture(t); f.store.put(binding());
  f.store.transaction(() => { for (let n = 1; n <= 10001; n++) f.store.putTurn('chat_test', turn(n)); });
  const { auditChatHistory } = await import('../scripts/neuraldeep/history-audit.mjs');
  const first = auditChatHistory(f.options), second = auditChatHistory(f.options);
  assert.deepEqual(first, second); assert.equal(first.inferenceCalls, 0); assert.equal(first.counts.turns, 10001);
  const audit = new NeuralDeepChatHistoryStore({ ...f.options, readOnly: true });
  try {
    let count = 0, checkpoint; const start = process.memoryUsage().heapUsed;
    for (const event of audit.audit()) { count++; checkpoint = event.checkpoint; assert.ok(Buffer.byteLength(JSON.stringify(event)) < 16 * 1024); }
    assert.equal(count, first.source.count); assert.equal(checkpoint.hash, first.source.digest);
    assert.ok(process.memoryUsage().heapUsed - start < 64 * 1024 * 1024);
    assert.throws(() => audit.put(binding('chat_blocked')), /readonly|read-only/);
    f.store.putTurn('chat_test', turn(10002));
    assert.equal(audit.verifySource().count, first.source.count);
  } finally { audit.close(); }
  assert.equal(auditChatHistory(f.options).counts.turns, 10002);
  assert.throws(() => new NeuralDeepChatHistoryStore({ ...f.options, databasePath: path.join(f.root, 'absent.sqlite'), readOnly: true }), { code: 'history_storage_missing' });
});
