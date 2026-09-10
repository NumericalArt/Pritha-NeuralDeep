import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from '../interfaces/control-center/node_modules/typescript/lib/typescript.js';
const temporary = mkdtempSync(path.join(tmpdir(), 'pritha-activity-recovery-'));
for (const [name, source] of [['request', 'lib/control-center-request.ts'], ['activity', 'components/codex/activity-request.ts']]) {
  const text = readFileSync(`interfaces/control-center/src/${source}`, 'utf8');
  writeFileSync(path.join(temporary, `${name}.mjs`), ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"@/lib/control-center-request"', '"./request.mjs"'));
}
const { readActivityPage } = await import(pathToFileURL(path.join(temporary, 'activity.mjs')));
test.after(() => rmSync(temporary, { recursive: true, force: true }));
const ok = data => Response.json({ apiVersion: '1', requestId: 'fixture', data });
const expired = () => Response.json({ apiVersion: '1', error: { code: 'history_cursor_expired', message: 'Expired fixture cursor', retryable: true, requestId: 'fixture' } }, { status: 409 });
function requests(t, respond) {
  const original = globalThis.fetch, seen = [];
  globalThis.fetch = async (url, init) => { seen.push(String(url)); assert.equal(init.method || 'GET', 'GET'); return respond(new URL(url, 'http://fixture')); };
  t.after(() => { globalThis.fetch = original; }); return seen;
}
test('expired older snapshot recovers the exact turn tail once', async t => {
  const seen = requests(t, url => url.searchParams.get('cursor') === 'old' ? expired() : ok({ data: [{ id: 'kept' }], nextCursor: 'older_fresh' }));
  const result = await readActivityPage('chat_a', 'turn_a', 'old', 'tail', new AbortController().signal);
  assert.equal(result.recovered, true); assert.equal(result.page.data[0].id, 'kept');
  assert.equal(seen.length, 2); assert.ok(seen.every(url => url.includes('/chat_a/history/turns/turn_a/')));
});
test('server restart renews a reference by exact turn identity on one bounded recent page', async t => {
  const seen = requests(t, url => {
    if (url.searchParams.get('limit') === '20') return ok({ data: [{ turnId: 'other', history: { itemsRef: 'wrong' } }, { turnId: 'turn_a', history: { itemsRef: 'fresh' } }] });
    return url.searchParams.get('cursor') === 'fresh' ? ok({ data: [], nextCursor: null }) : expired();
  });
  assert.equal((await readActivityPage('chat_a', 'turn_a', 'tail', 'tail', new AbortController().signal)).recovered, true);
  assert.equal(seen.length, 3); assert.ok(!seen.some(url => url.includes('wrong')));
});
test('repeated expiration is bounded and never becomes a retry loop', async t => {
  const seen = requests(t, url => url.searchParams.has('limit') ? ok({ data: [{ turnId: 'turn_a', history: { itemsCursor: 'fresh_nd' } }] }) : expired());
  await assert.rejects(readActivityPage('chat_a', 'turn_a', 'old', 'tail', new AbortController().signal), error => error.code === 'history_cursor_expired');
  assert.equal(seen.length, 4);
});
test('missing target never adopts another turn or walks unlimited history', async t => {
  const seen = requests(t, url => url.searchParams.has('limit') ? ok({ data: [{ turnId: 'other', history: { itemsRef: 'wrong' } }], olderCursor: 'more' }) : expired());
  await assert.rejects(readActivityPage('chat_a', 'turn_a', 'tail', 'tail', new AbortController().signal), /could not be refreshed/);
  assert.equal(seen.length, 2);
});
test('cancellation prevents cursor renewal', async t => {
  const controller = new AbortController();
  const seen = requests(t, () => { controller.abort(); return expired(); });
  await assert.rejects(readActivityPage('chat_a', 'turn_a', 'tail', 'tail', controller.signal));
  assert.equal(seen.length, 1);
});
