import { expect, test, type Page, type Route } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

// The same scenarios cover both runtime projections. All chat traffic is synthetic.
async function fixture(page: Page, history = false, options: { body?: boolean; older?: boolean } = {}) {
  const now = '2026-09-10T12:00:00Z';
  const providerId = process.cwd().includes('Pritha-NeuralDeep') ? 'neuraldeep_cli' : 'desktop_bundled';
  const stateIdentityHash = 'c'.repeat(24);
  const message = (id: string, text: string) => ({ id, kind: 'assistant_message', status: 'in_progress', message: { id, role: 'assistant', markdown: text, status: 'streaming', createdAt: now } });
  const row: any = { turnId: 'turn_scroll', status: 'in_progress', userMessage: { id: 'user', markdown: Array.from({ length: 35 }, (_, n) => `Context paragraph ${n}. A stable place to read while the assistant works.`).join('\n\n') }, items: [message('answer', 'The response begins here.')], pendingRequestIds: [], startedAt: now, error: null };
  if (history) row.history = { itemsRef: 'activity_tail', itemsCursor: 'activity_tail' };
  const fullBody = Array.from({ length: 18 }, (_, n) => `Body paragraph ${n}. This original text must stay displayed while its reference is refreshed.`).join('\n\n');
  if (options.body) Object.assign(row.items[0].message, { markdown: 'Short body preview.', contentRef: 'body_first' });
  const pendingContent: Route[] = [];
  const actions: any[] = Array.from({ length: 5 }, (_, n) => ({ id: `command_${n}`, kind: 'command', status: 'completed', commandPreview: `command ${n}`, outputPreview: 'result' }));
  const thread = { chatId: 'chat_scroll', title: 'Scroll fixture', group: 'my_chats', origin: 'chat', status: 'active', archived: false, createdAt: now, updatedAt: now, preview: '', activeFlags: [], taskLinks: [], runtime: { providerId, stateIdentityHash, compatibility: 'bound', capabilities: {} }, continuationState: 'continuation_enabled' };
  let activityReads = 0;
  const writes: string[] = [];
  await page.addInitScript(() => {
    (window as any).__scrollSources = [];
    class Source extends EventTarget {
      static OPEN = 1; readyState = 1;
      constructor(public url: string) { super(); (window as any).__scrollSources.push(this); }
      close() { this.readyState = 2; }
    }
    Object.defineProperty(window, 'EventSource', { value: Source });
  });
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const send = (data: unknown) => route.fulfill({ json: { apiVersion: '1', requestId: 'scroll-fixture', data } });
    if (!['GET', 'HEAD'].includes(req.method())) { if (!url.pathname.endsWith('/ui-activity')) writes.push(url.pathname); return send({ recorded: true }); }
    if (!url.pathname.includes('/codex-chat/')) return route.continue();
    if (url.pathname.endsWith('/health')) return route.fulfill({ json: { schema: 'pritha-control-center-health-v2', ok: true, service: 'pritha-control-center', status: 'ready' } });
    if (url.pathname.endsWith('/runtime')) return send({ availability: 'ready', preferredProvider: 'auto', effectiveProvider: providerId, providers: [{ providerId, stateIdentityHash, availability: 'ready', capabilities: { fullChat: true } }], models: [], selected: { modelId: 'fixture' } });
    if (url.pathname.endsWith('/threads')) return send({ data: [thread], nextCursor: null });
    if (url.pathname.endsWith('/history')) {
      if (url.searchParams.get('cursor') === 'older') return send({ data: [{ ...structuredClone(row), turnId: 'turn_older', startedAt: '2026-09-09T12:00:00Z', items: [], history: undefined }], olderCursor: null });
      return send({ data: [structuredClone(row)], olderCursor: options.older ? 'older' : null, completeness: 'captured-from-creation' });
    }
    if (url.pathname.endsWith('/content')) {
      if (['body_next', 'body_tail'].includes(url.searchParams.get('cursor') || '')) { pendingContent.push(route); return; }
      return send({ text: fullBody, nextCursor: null, complete: true });
    }
    if (url.pathname.endsWith('/items')) {
      activityReads++;
      await new Promise(resolve => setTimeout(resolve, 130));
      return send({ data: structuredClone(actions).reverse(), nextCursor: null });
    }
    if (url.pathname.endsWith('/chat_scroll')) return send({ thread, activeTurnId: row.turnId, pendingRequests: [], continuationState: 'continuation_enabled', streamUrl: '/api/codex-chat/v1/threads/chat_scroll/events' });
    if (url.pathname.endsWith('/attachments/capabilities')) return send({ image: 'supported', files: 'supported' });
    return send({ data: [], changed: [], cursor: 0 });
  });
  await page.goto('/task-chat?group=my_chats&chat=chat_scroll');
  await expect(page.locator('.codex-composer textarea')).toBeEnabled();
  await expect(page.locator('.codex-turn').first()).toBeVisible();
  const transcript = page.locator('.codex-transcript');
  await transcript.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
  if (history) await expect(page.locator('.codex-history-action')).toHaveCount(5);
  await page.waitForTimeout(600);
  const emit = (type: string, payload: any = {}) => page.evaluate(({ type, payload, now }) => {
    const source = (window as any).__scrollSources.find((s: any) => s.readyState === 1 && s.url.includes('/chat_scroll/events'));
    if (!source) throw new Error('Synthetic chat stream did not connect');
    source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify({ turnId: 'turn_scroll', itemId: 'answer', occurredAt: now, payload }) }));
  }, { type, payload, now });
  return { row, actions, writes, emit, fullBody, pendingContent, get activityReads() { return activityReads; } };
}

test('isolated candidate passes strict page and JavaScript chunk health', async ({ baseURL }, info) => {
  test.setTimeout(120_000);
  expect(process.env.PRITHA_INSTANCE_ID).toMatch(/test|e2e|fixture/);
  const { stdout } = await promisify(execFile)(process.execPath, [path.resolve('../../scripts/control-center-health.mjs'), '--base-url', baseURL!, '--strict', '--json'], { timeout: 100_000, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  await info.attach('strict-health', { body: stdout, contentType: 'application/json' });
  expect(result.status).toBe('pass');
});

async function trace(page: Page) {
  await page.evaluate(() => {
    const rows: any[] = []; (window as any).__scrollTrace = rows;
    const tick = () => {
      const el = document.querySelector('.codex-transcript')!;
      rows.push({ t: performance.now(), top: el.scrollTop, height: el.scrollHeight, gap: el.scrollHeight - el.scrollTop - el.clientHeight });
      (window as any).__scrollFrame = requestAnimationFrame(tick);
    }; tick();
  });
}
async function finishTrace(page: Page, info: any) {
  const rows = await page.evaluate(() => { cancelAnimationFrame((window as any).__scrollFrame); return (window as any).__scrollTrace as Array<{top:number;gap:number;height:number}>; });
  await info.attach('scroll-geometry', { body: JSON.stringify(rows), contentType: 'application/json' });
  return rows;
}

for (const width of [1440, 390]) {
  test(`stream follows the bottom without repeated animation at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const f = await fixture(page);
    await trace(page);
    for (let n = 0; n < 15; n++) { await f.emit('message.delta', { delta: `\n\nNew response paragraph ${n}. The model continues writing.` }); await page.waitForTimeout(70); }
    await page.waitForTimeout(250);
    const rows = await finishTrace(page, info);
    // An animation repeatedly chasing the new bottom leaves a sustained visible gap.
    expect(rows.filter(row => row.gap > 6).length / rows.length).toBeLessThan(0.15);
    expect(rows.at(-1)!.gap).toBeLessThanOrEqual(2);
    const resizedHeight = width < 768 ? 580 : 780;
    await page.setViewportSize({ width, height: resizedHeight });
    await f.emit('message.delta', { delta: '\n\nWriting continues after the available viewport shrinks.' });
    await expect.poll(() => page.locator('.codex-transcript').evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
    const composer = await page.locator('.codex-composer-wrap').boundingBox();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(resizedHeight + 1);
    expect(f.writes).toEqual([]);
  });

  test(`activity refresh holds the bottom and leaves a reader above it alone at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const f = await fixture(page, true);
    await trace(page);
    for (let n = 0; n < 4; n++) {
      const before = f.activityReads;
      f.actions.push({ id: `progress_${n}`, kind: 'assistant_message', status: 'completed', message: { phase: 'commentary', markdown: `Progress update ${n}.\n\nThe visible activity window changes height while work continues.` } });
      if (n === 3) { f.row.status = 'completed'; f.row.items[0].status = 'completed'; f.row.items[0].message.status = 'completed'; }
      await f.emit('history.changed'); await expect.poll(() => f.activityReads).toBeGreaterThan(before); await page.waitForTimeout(350);
    }
    const rows = await finishTrace(page, info);
    expect(rows.filter(row => row.gap > 6).length / rows.length).toBeLessThan(0.15);
    const transcript = page.locator('.codex-transcript');
    await transcript.hover(); await page.mouse.wheel(0, -420); await page.waitForTimeout(250);
    const before = await transcript.evaluate(el => el.scrollTop);
    await f.emit('message.delta', { delta: '\n\nNew material while the user is reading above.' });
    await page.waitForTimeout(650);
    expect(Math.abs(await transcript.evaluate(el => el.scrollTop) - before)).toBeLessThanOrEqual(2);
    await transcript.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(100);
    await f.emit('message.delta', { delta: '\n\nFollow resumes after returning to the bottom.' });
    await expect.poll(() => transcript.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
    expect(f.writes).toEqual([]);
  });

  test(`history refresh preserves the full body, open Details and draft at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const f = await fixture(page, true, { body: true });
    const transcript = page.locator('.codex-transcript'), input = page.locator('.codex-composer textarea');
    await input.fill('An unsent draft');
    await expect(page.getByText('Body paragraph 17.', { exact: false })).toBeAttached();
    const details = page.locator('[data-activity-id="command_4"] details');
    await details.locator('summary').click(); await expect(details).toHaveAttribute('open', '');
    // Keep the response end visible. A body outside the viewport must remain
    // lazy even when its reference changes (especially above mobile Activity).
    await page.locator('.codex-assistant-message .codex-history-text').evaluate(el => {
      const viewport = el.closest('.codex-transcript')!;
      viewport.scrollTo({ top: viewport.scrollTop + el.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top - viewport.clientHeight / 2, behavior: 'instant' });
    });
    await page.waitForTimeout(50);
    const before = await transcript.evaluate(el => el.scrollTop);
    Object.assign(f.row.items[0].message, { contentRef: 'body_next', markdown: 'A refreshed short preview.' });
    await f.emit('history.changed');
    await expect.poll(() => f.pendingContent.length).toBe(1);
    await expect(page.getByText('Body paragraph 17.', { exact: false })).toBeAttached();
    expect(Math.abs(await transcript.evaluate(el => el.scrollTop) - before)).toBeLessThanOrEqual(2);
    const cut = Math.floor(f.fullBody.length / 2);
    await f.pendingContent[0].fulfill({ json: { apiVersion: '1', requestId: 'replacement-head', data: { text: f.fullBody.slice(0, cut), nextCursor: 'body_tail', complete: false } } });
    await expect.poll(() => f.pendingContent.length).toBe(2);
    await expect(page.getByText('Body paragraph 17.', { exact: false })).toBeAttached();
    expect(Math.abs(await transcript.evaluate(el => el.scrollTop) - before)).toBeLessThanOrEqual(2);
    await f.pendingContent[1].fulfill({ json: { apiVersion: '1', requestId: 'replacement-tail', data: { text: f.fullBody.slice(cut) + '\n\nNew authoritative ending.', nextCursor: null, complete: true } } });
    await expect(page.getByText('New authoritative ending.', { exact: true })).toBeAttached();
    await expect(details).toHaveAttribute('open', ''); await expect(input).toHaveValue('An unsent draft');
    await page.screenshot({ path: info.outputPath('stable-history.png'), fullPage: true });
    const bounds = await page.locator('.codex-composer-wrap').boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(901);
    expect(f.writes).toEqual([]);
  });

  test(`prepending older turns keeps the current message in place at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); const f = await fixture(page, false, { older: true });
    await page.locator('.codex-transcript').evaluate(el => el.scrollTo({ top: 0, behavior: 'instant' }));
    const current = page.locator('[data-scroll-anchor="turn_scroll:user"]');
    const before = await current.evaluate(el => el.getBoundingClientRect().top);
    await page.getByRole('button', { name: /^(Load earlier messages|Older messages)$/, exact: true }).click();
    await expect(page.locator('.codex-turn')).toHaveCount(2);
    expect(Math.abs(await current.evaluate(el => el.getBoundingClientRect().top) - before)).toBeLessThanOrEqual(2);
    const latest = page.getByRole('button', { name: 'Latest messages', exact: true });
    if (await latest.count()) {
      await latest.click();
      await expect.poll(() => page.locator('.codex-transcript').evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
    }
    expect(f.writes).toEqual([]);
  });
}
