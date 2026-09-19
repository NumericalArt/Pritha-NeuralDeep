import { expect, test, type Page } from '@playwright/test';
import type { CreationJobView, CreationRequest } from '../../src/lib/codex-chat/creation-types';

const now = '2026-09-19T10:00:00Z', chatId = 'chat_creation_fixture', sha = 'a'.repeat(40);
const envelope = (data: unknown) => ({ apiVersion: '1', requestId: 'creation-ui-fixture', data });
function proposal(): CreationJobView {
  return {
    jobId: 'creation_fixture', chatId, agentId: 'signal-desk-fixture', revision: 7, phase: 'approvals', status: 'awaiting_contract_approval', releaseSha: sha,
    versions: { source: sha, runtime: sha, execution: sha, sourceDirty: false },
    contract: { path: 'contracts/fixture.md', hash: 'b'.repeat(64), text: '# Architecture fixture\n\nLocal SQLite, manual updates, two public RSS sources.', issues: [] },
    outcome: { path: 'contracts/fixture-outcome.md', hash: 'c'.repeat(64), text: '# Outcome fixture\n\nRussian digest of at most twenty selected items with Markdown export.', issues: [] },
    approvals: {}, blocker: null, checkpoint: null,
    budget: { tokensUsed: 2400, maxTokens: 1_000_000, activeMs: 60000, maxActiveMs: 5400000, unknownAttempts: [], maxIterations: 6, repeatedFailures: 0 },
    deliveryRunId: null,
    actions: { approve_contract: true, approve_outcome: false, continue: false, pause: false, cancel: true, revise_proposal: true },
  };
}

// Only the actual compiled browser UI is under test here. Every creation request
// is intercepted; this fixture grants no approval and creates no child project.
async function fixture(page: Page, job = proposal(), loseFirstApproval = false) {
  const health = await (await page.request.get('/api/health')).json();
  expect(health.instance?.role).toBe('development');
  expect(health.instance?.id).toMatch(/fixture|e2e|test/);
  const requests: CreationRequest[] = [], applied = new Map<string, CreationJobView>();
  const thread = { chatId, title: 'Creation UI fixture', preview: '', group: 'my_chats', origin: 'chat', status: 'idle', archived: false,
    createdAt: now, updatedAt: now, activeFlags: [], taskLinks: [], continuationState: 'continuation_enabled',
    runtime: { providerId: 'neuraldeep_cli', sessionId: null, model: 'fixture', stateIdentityHash: 'c'.repeat(24), capabilities: {}, protocol: 'exec_resume' } };
  await page.addInitScript(() => {
    class QuietEventSource extends EventTarget {
      static OPEN = 1; readyState = 1; onopen: (() => void) | null = null;
      constructor(public url: string) { super(); setTimeout(() => { this.onopen?.(); this.dispatchEvent(new Event('open')); }, 0); }
      close() { this.readyState = 2; }
    }
    Object.defineProperty(window, 'EventSource', { value: QuietEventSource });
  });
  await page.route('**/api/codex-chat/v1/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const send = (data: unknown) => route.fulfill({ json: envelope(data) });
    if (url.pathname.endsWith('/creation')) {
      if (req.method() === 'GET') return send({ job });
      const body: CreationRequest = req.postDataJSON(); requests.push(body);
      expect(req.headers()['idempotency-key']).toBe(body.requestId);
      if (applied.has(body.requestId)) return send({ job: applied.get(body.requestId) });
      expect(body.expectedRevision).toBe(job.revision);
      const kind = body.action === 'approve_contract' ? 'contract' : body.action === 'approve_outcome' ? 'outcome' : null;
      if (!kind) throw new Error(`Unexpected fixture action: ${body.action}`);
      job.approvals[kind] = { hash: job[kind]!.hash, actor: body.actor!, approvedAt: now, authorizationBasis: body.authorizationBasis };
      job.revision++;
      job.actions.approve_contract = false;
      job.actions.approve_outcome = kind === 'contract';
      job.status = kind === 'contract' ? 'awaiting_outcome_approval' : 'paused';
      job.actions.continue = kind === 'outcome';
      applied.set(body.requestId, structuredClone(job));
      if (loseFirstApproval && requests.length === 1) return route.abort('failed');
      return send({ job });
    }
    if (url.pathname.endsWith('/runtime')) return send({ availability: 'ready', preferredProvider: 'neuraldeep_cli', effectiveProvider: 'neuraldeep_cli', providerState: 'available',
      providers: [{ providerId: 'neuraldeep_cli', availability: 'ready', stateIdentityHash: 'c'.repeat(24), capabilities: { fullChat: true }, protocol: 'exec_resume' }],
      models: [{ id: 'fixture', label: 'Fixture', effortIds: [], serviceTierIds: [] }], selected: { modelId: 'fixture', sandboxMode: 'workspace_write', approvalMode: 'never' } });
    if (url.pathname.endsWith('/threads')) { expect(req.method()).toBe('GET'); return send({ data: [thread], nextCursor: null }); }
    if (url.pathname.endsWith('/history')) return send({ data: [], olderCursor: null, newerCursor: null, completeness: 'captured-from-creation' });
    if (url.pathname.endsWith(`/${chatId}`)) return send({ thread, activeTurnId: null, pendingRequests: [], continuationState: 'continuation_enabled', streamUrl: `/api/codex-chat/v1/threads/${chatId}/events` });
    if (url.pathname.endsWith('/ui-activity')) return send({ recorded: true });
    if (url.pathname.endsWith('/attachments/capabilities')) return send({ image: 'supported', files: 'supported' });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto(`/task-chat?group=my_chats&chat=${chatId}`);
  const card = page.getByRole('region', { name: 'Создание агента', exact: true });
  await expect(card).toBeVisible();
  return { job, card, requests };
}

for (const width of [1440, 390]) {
  test(`creation reviews each revision and records two delegated approvals at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await fixture(page), contractButton = f.card.getByRole('button', { name: 'Подтвердить контракт', exact: true });
    await expect(contractButton).toBeDisabled();
    await f.card.getByText('Архитектурный контракт', { exact: true }).click();
    await expect(f.card.getByRole('heading', { name: 'Architecture fixture' })).toBeVisible();
    await f.card.getByLabel('Кто выполняет действие').selectOption('codex-operator');
    await f.card.getByRole('checkbox', { name: 'Проверена эта ревизия документа' }).check();
    await expect(contractButton).toBeDisabled();
    await f.card.getByLabel('Основание поручения').fill('Explicit user instruction to operate this UI trial; personal acceptance remains separate.');
    await page.reload();
    await expect(f.card.getByLabel('Кто выполняет действие')).toHaveValue('codex-operator');
    await expect(f.card.getByLabel('Основание поручения')).toHaveValue('Explicit user instruction to operate this UI trial; personal acceptance remains separate.');
    await expect(f.card.getByRole('checkbox')).not.toBeChecked();
    await expect(contractButton).toBeDisabled();
    expect(f.requests).toEqual([]);
    await f.card.getByRole('checkbox').check();
    // A revised document invalidates the checkbox before any approval request.
    f.job.contract!.hash = 'd'.repeat(64); f.job.revision++;
    await f.card.getByRole('button', { name: 'Обновить состояние', exact: true }).click();
    await expect(f.card.getByRole('checkbox')).not.toBeChecked();
    await expect(contractButton).toBeDisabled();
    await f.card.getByRole('checkbox').check(); await contractButton.click();
    await expect.poll(() => f.requests.length).toBe(1);
    expect(f.requests[0]).toMatchObject({ action: 'approve_contract', actor: 'codex-operator', expectedRevision: 8 });
    const outcomeButton = f.card.getByRole('button', { name: 'Подтвердить Outcome Spec', exact: true });
    await expect(outcomeButton).toBeDisabled();
    await f.card.getByText('Outcome Spec — конечный результат', { exact: true }).click();
    await expect(f.card.getByRole('heading', { name: 'Outcome fixture' })).toBeVisible();
    await f.card.getByRole('checkbox').check(); await outcomeButton.click();
    await expect.poll(() => f.requests.length).toBe(2);
    expect(f.requests[1]).toMatchObject({ action: 'approve_outcome', actor: 'codex-operator', expectedRevision: 9, authorizationBasis: f.requests[0].authorizationBasis });
    expect(f.requests[1].requestId).not.toBe(f.requests[0].requestId);
    await expect(f.card.getByRole('button', { name: 'Продолжить создание' })).toBeEnabled();
    await expect(f.card).toContainText('готовый результат принимает пользователь');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const composer = await page.locator('.codex-composer-wrap').boundingBox();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(901);
    await page.screenshot({ path: info.outputPath('separate-approvals.png'), fullPage: true });
  });

  test(`uncertain creation approval replays original authority and revision after reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await fixture(page, proposal(), true);
    await f.card.getByLabel('Кто выполняет действие').selectOption('codex-operator');
    await f.card.getByLabel('Основание поручения').fill('User-approved UI operator trial.');
    await f.card.getByRole('checkbox').check();
    await f.card.getByRole('button', { name: 'Подтвердить контракт', exact: true }).click();
    await expect(f.card).toContainText('Ответ не подтверждён');
    const original = structuredClone(f.requests[0]);
    await page.reload();
    await expect(f.card).toContainText('Ожидает подтверждения');
    await expect(f.card.getByRole('button', { name: 'Подтвердить Outcome Spec', exact: true })).toBeDisabled();
    await f.card.getByRole('button', { name: 'Проверить сохранённое действие' }).click();
    await expect.poll(() => f.requests.length).toBe(2);
    expect(f.requests[1]).toEqual(original);
    await expect(f.card).not.toContainText('Ожидает подтверждения:');
    expect(f.job.revision).toBe(8);
  });

  test(`creation displays unresolved usage and version mismatch without offering dispatch at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const job = proposal(); job.status = 'blocked'; job.phase = 'implementation';
    job.actions = { approve_contract: false, approve_outcome: false, continue: false, pause: false, cancel: false, revise_proposal: false };
    job.budget.unknownAttempts = ['unsettled-run']; job.versions.sourceDirty = true;
    job.blocker = { code: 'creation_usage_unknown', message: 'Previous usage is not confirmed.' };
    const f = await fixture(page, job);
    await expect(f.card).toContainText('Есть исполнения с неподтверждённым расходом: 1');
    await expect(f.card).toContainText('Итоговый расход неизвестен');
    await expect(f.card).toContainText('Подтверждённый расход завершённых шагов');
    await expect(f.card).toContainText('Версии исходников, работающей Pritha и исполнения различаются');
    await expect(f.card.getByRole('button', { name: 'Продолжить создание' })).toHaveCount(0);
    await expect(f.card.getByRole('button', { name: 'Пересмотреть предложение', exact: true })).toHaveCount(0);
    await page.reload(); await expect(f.card).toContainText('Previous usage is not confirmed.');
    expect(f.requests).toEqual([]);
  });
}
