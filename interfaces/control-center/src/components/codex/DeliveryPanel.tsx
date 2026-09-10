"use client";

import { OperationDecisions } from "./OperationDecisions";

import { useCallback, useEffect, useRef, useState } from "react";
import { controlCenterRequest, ControlCenterRequestError } from "@/lib/control-center-request";
import type { DeliveryBudgetChange, TaskDeliveryRequest, TaskDeliveryView } from "@/lib/codex-chat/delivery-types";

const statusLabel: Record<string, string> = { created: "Создана", preparing: "Подготовка", building: "Создание агента", correcting: "Готова к продолжению", paused: "Приостановлена", blocked: "Нужен контроль", verifying: "Проверяем", verified: "Проверено", awaiting_acceptance: "Ожидает приёмки", accepted: "Принято", failed: "Нужен разбор", abandoned: "Завершена без результата", cancelled: "Отменена" };
export function DeliveryPanel({ chatId, active, editable, refreshKey = 0, onSelectedRun, budgetResult }: { chatId: string; active: boolean; editable: boolean; refreshKey?: number; onSelectedRun?: (chatId: string, runId: string | null) => void; budgetResult?: TaskDeliveryView | null }) {
  const [runId, setRunId] = useState("");
  const [links, setLinks] = useState<Array<{ runId: string; status: string }>>([]);
  const [run, setRun] = useState<TaskDeliveryView | null>(null);
  const [pending, setPending] = useState<TaskDeliveryRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [budgetMode, setBudgetMode] = useState<"add" | "set">("add");
  const [tokens, setTokens] = useState("");
  const [extraIterations, setExtraIterations] = useState("");
  const [extraMinutes, setExtraMinutes] = useState("");
  const [resume, setResume] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true), busyRef = useRef(false);
  const pendingRef = useRef<TaskDeliveryRequest | null>(null);
  const keepPending = useCallback((request: TaskDeliveryRequest | null) => { pendingRef.current = request; setPending(request); }, []);
  const url = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/delivery`;
  const remember = useCallback((value: TaskDeliveryView) => {
    setRun(value); setRunId(value.runId);
    onSelectedRun?.(chatId, value.runId); // selection is explicit; the host separately verifies ownership
    const current = pendingRef.current;
    const matched = current && value.receipts.find(receipt => receipt.requestId === current.requestId);
    if (current && !matched) return; // the server may still be preparing this request
    keepPending(value.receipts.find(receipt => receipt.status === "started")?.request || null);
  }, [chatId, keepPending, onSelectedRun]);
  const refresh = useCallback(async (id: string, signal?: AbortSignal) => {
    try {
      const { data } = await controlCenterRequest<{ run: TaskDeliveryView }>(`${url}?runId=${encodeURIComponent(id)}`, { signal });
      if (!mounted.current || signal?.aborted) return;
      remember(data.run); setError("");
    } catch (cause) {
      if (mounted.current && !signal?.aborted) setError(cause instanceof ControlCenterRequestError ? cause.message : "Состояние сборки пока недоступно. Сохранённое действие можно проверить повторно.");
    }
  }, [remember, url]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (budgetResult) remember(budgetResult); }, [budgetResult, remember]);
  useEffect(() => {
    const controller = new AbortController();
    void controlCenterRequest<{ runs: Array<{ runId: string; status: string }> }>(url, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted || !mounted.current) return;
      if (!data || !Array.isArray(data.runs) || data.runs.some(row => !row || typeof row.runId !== "string" || typeof row.status !== "string")) {
        throw new Error("invalid_delivery_discovery");
      }
      setLinks(data.runs);
      if (data.runs.length === 1) void refresh(data.runs[0].runId, controller.signal);
    }).catch(() => {
      if (!controller.signal.aborted && mounted.current) setError("Список сборок пока недоступен. Чат остаётся доступен.");
    });
    return () => controller.abort();
  }, [refresh, url]);
  const loadedRunId = run?.runId;
  useEffect(() => {
    if (!loadedRunId) return;
    const controller = new AbortController();
    void refresh(loadedRunId, controller.signal);
    return () => controller.abort();
  }, [loadedRunId, refresh, refreshKey]);
  useEffect(() => {
    if (!run || (!busy && !pending)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(run.runId, controller.signal), 3000);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [run, busy, pending, refresh]);

  async function act(action: TaskDeliveryRequest["action"], budget?: DeliveryBudgetChange) {
    if (!run || busyRef.current || active || !editable || (!pending && runId.trim() !== run.runId)) return;
    const request = pending || { requestId: crypto.randomUUID(), runId: run.runId, expectedRevision: run.revision, action, ...(budget ? { budget } : {}) };
    busyRef.current = true; setBusy(true); keepPending(request); setError("");
    try {
      const { data } = await controlCenterRequest<TaskDeliveryView>(url, {
        method: "POST", headers: { "Idempotency-Key": request.requestId }, body: JSON.stringify(request),
      }, { timeoutMs: 30_000 });
      if (mounted.current) { keepPending(null); remember(data); }
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof ControlCenterRequestError && ["delivery_changed", "delivery_task_mismatch", "delivery_binding_exists", "delivery_verify_unavailable", "delivery_not_verified", "delivery_budget_invalid", "delivery_budget_complete", "delivery_usage_unknown", "idempotency_conflict"].includes(cause.code)) keepPending(null);
        setError("Подтверждение пока не получено. Обновите состояние или проверьте сохранённое действие; повтор запроса не запускает проверки заново.");
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const disabled = busy || active || !editable || (!pending && runId.trim() !== run?.runId);
  const latest = run?.receipts.at(-1);
  return <details className="codex-goal-panel codex-delivery-panel">
    <summary><strong>Сборка агента</strong><span>{run ? `${run.agentName} · ${statusLabel[run.status] || run.status}` : links.length ? `Связанных сборок: ${links.length}` : "Связь с delivery run"}</span></summary>
    <div className="codex-goal-body">
      <p>Свяжите конкретную сборку с этой задачей, чтобы запустить одобренные проверки и подготовить передачу результата при достижении лимита сборки.</p>
      {links.length > 1 ? <label>Связанные сборки<select value={run?.runId || ""} disabled={busy || Boolean(pending)} onChange={event => void refresh(event.target.value)}><option value="">Выберите сборку</option>{links.map(row => <option key={row.runId} value={row.runId}>{row.runId} · {statusLabel[row.status] || row.status}</option>)}</select></label> : null}
      <form onSubmit={event => { event.preventDefault(); if (runId.trim()) void refresh(runId.trim()); }}>
        <label>Идентификатор delivery run<input value={runId} onChange={event => { setRunId(event.target.value); onSelectedRun?.(chatId, event.target.value.trim() || null); }} disabled={busy || Boolean(pending)} autoComplete="off" spellCheck={false} /></label>
        <button className="outline-button compact" disabled={!runId.trim() || busy || Boolean(pending)} type="submit">Показать сборку</button>
      </form>
      {run ? <>
        <p><strong>{run.agentName}</strong> · {run.runId}<br />Outcome Spec: {run.specId}</p>
        <p>Проверка: {statusLabel[run.status] || run.status}. Приёмка: {run.acceptance === "accepted_by_user" ? "подтверждена пользователем" : "ещё не подтверждена"}.</p>
        <p>Подтверждённый расход сборочного исполнителя: {run.budget.tokensUsed.toLocaleString("ru-RU")} / {run.budget.maxTokens.toLocaleString("ru-RU")} токенов. {run.budget.usageStatus !== "complete" ? "Часть расхода ещё не установлена. " : ""}Переписка и расход внутри проверок учитываются отдельно.</p>
        <p>Сборочные итерации: {run.budget.iterations} / {run.budget.maxIterations}. Время с начала сборки: {Math.floor(run.budget.elapsedMs / 60000)} / {Math.ceil(run.budget.maxElapsedMs / 60000)} мин. При продлении времени новый запас отсчитывается от текущего момента, если прежний срок уже прошёл.</p>
        {run.usage ? <details><summary>Расход по этапам</summary>
          <p>Переписка: {run.usage.parent.observedTokens === null ? "расход ещё не установлен" : `наблюдалось ${run.usage.parent.observedTokens.toLocaleString("ru-RU")} токенов`}. Это сумма подтверждённых запусков этой native сессии из ledger NeuralDeep; он не распределён между её сборками и может содержать неполные наблюдения.</p>
          <p>Сборочный исполнитель: {run.usage.build.tokensUsed.toLocaleString("ru-RU")} подтверждённых токенов; {run.usage.build.measuredTurns} учтённых шагов. {run.usage.build.coverage !== "complete" ? "Учёт неполный." : ""}</p>
          <p>Проверки: {run.usage.trials.attempts} сохранённых запусков; расход моделей внутри команд не измерен. {run.usage.trials.unconfirmedTerminals ? `Завершение ${run.usage.trials.unconfirmedTerminals} запусков ещё не подтверждено.` : ""}</p>
          <p>Итог по всем этапам пока не определён. Неизвестный расход и счётчик общей задачи не прибавляются к бюджету сборки.</p>
        </details> : null}
        {run.bindingStatus === "bound" && run.actions.budget ? <form onSubmit={event => {
          event.preventDefault();
          const number = (value: string) => { const raw = value.replace(/\s/g, ""); return raw === "" ? 0 : /^\d+$/.test(raw) ? Number(raw) : NaN; };
          const amount = number(tokens), addIterations = number(extraIterations), addElapsedMs = number(extraMinutes) * 60000;
          if ([amount, addIterations, addElapsedMs].some(value => !Number.isSafeInteger(value) || value < 0) || (!amount && (budgetMode === "set" || (!addIterations && !addElapsedMs)))) {
            setError("Введите положительное целое изменение бюджета. Для общего лимита обязательно укажите токены."); return;
          }
          void act("budget", { mode: budgetMode, tokens: amount, resume, ...(addIterations ? { addIterations } : {}), ...(addElapsedMs ? { addElapsedMs } : {}) });
        }}>
          <label>Изменение бюджета сборки<select value={budgetMode} disabled={disabled || Boolean(pending)} onChange={event => setBudgetMode(event.target.value as "add" | "set")}><option value="add">Добавить токены</option><option value="set">Задать общий лимит</option></select></label>
          <label>Токены сборки<input inputMode="numeric" value={tokens} disabled={disabled || Boolean(pending)} onChange={event => setTokens(event.target.value)} /></label>
          <label>Добавить сборочные итерации<input inputMode="numeric" value={extraIterations} disabled={disabled || Boolean(pending)} onChange={event => setExtraIterations(event.target.value)} /></label>
          <label>Добавить минуты<input inputMode="numeric" value={extraMinutes} disabled={disabled || Boolean(pending)} onChange={event => setExtraMinutes(event.target.value)} /></label>
          <label className="codex-goal-resume"><input type="checkbox" checked={resume} disabled={disabled || Boolean(pending)} onChange={event => setResume(event.target.checked)} />Продолжить создание агента после изменения бюджета</label>
          <button className="outline-button compact" disabled={disabled || Boolean(pending)}>Применить бюджет сборки</button>
        </form> : null}
        <details><summary>Одобренный план проверок</summary>
          <p>Команды выполняются последовательно в рабочей копии этой сборки. До {run.plan.maxVerificationPasses} проходов, вывод каждой команды ограничен {run.plan.outputBytesCap.toLocaleString("ru-RU")} байтами. Backend: {run.plan.backend}.</p>
          <p>Команды могут использовать сеть, модели и другие побочные эффекты в пределах одобренного плана. Режим изоляции указан для каждой проверки.</p>
          <ul>{run.plan.commands.map(command => <li key={command.id}><strong>{command.id}</strong><pre>{JSON.stringify(command.argv)}</pre>Каталог: {command.cwd}; срок: {command.timeoutMs / 1000} с; изоляция: {command.isolation}.</li>)}</ul>
        </details>
        {run.bindingStatus === "unbound" ? <button className="outline-button compact" disabled={disabled || Boolean(pending)} onClick={() => void act("bind")}>Связать эту сборку с задачей</button>
          : run.bindingStatus === "other_task" ? <p>Сборка уже связана с другой задачей. Откройте исходную задачу для host actions.</p>
          : <div className="codex-goal-fields">
            <button className="outline-button compact" disabled={disabled || Boolean(pending) || !run.actions.verify} onClick={() => void act("verify")}>Запустить одобренные проверки</button>
            <button className="outline-button compact" disabled={disabled || Boolean(pending) || !run.actions.prepareHandoff} onClick={() => void act("prepare_handoff")}>Подготовить передачу результата</button>
          </div>}
        {pending ? <button className="outline-button compact" disabled={disabled} onClick={() => void act(pending.action)}>Проверить сохранённое действие</button> : null}
        {latest && latest.action !== "bind" ? <p role="status">{latest.status === "started" ? "Проверяем ход действия…" : latest.status === "interrupted" ? "Предыдущее действие прервалось. Проверьте состояние сборки перед новым запуском." : latest.status === "failed" ? "Действие требует разбора; прежние результаты сохранены." : latest.action === "budget" ? `Бюджет сборки сверён.${latest.request?.budget?.resume ? " Продолжение запрошено; текущее состояние показано выше." : " Продолжение доступно отдельным действием."}` : latest.result?.handoff === "prepared_for_review" ? "Материалы передачи подготовлены для проверки. Приёмка, merge и deployment выполняются отдельно." : "Проверки завершились. Текущее состояние сборки показано выше."}</p> : null}
        {run.preparation ? <details><summary>Подготовленный сценарий демонстрации</summary><p>Подготовлено: {run.preparation.preparedAt}{run.preparation.head ? `; ревизия ${run.preparation.head.slice(0, 12)}` : ""}. Текущая ревизия повторно сверяется при подготовке передачи.</p><ol>{run.preparation.demo.map((step, index) => <li key={index}>{step}</li>)}</ol></details> : null}
        {run.bindingStatus === "bound" ? <OperationDecisions key={run.runId} chatId={chatId} runId={run.runId} disabled={disabled || Boolean(pending)} /> : null}
        <button className="codex-text-action" onClick={() => void refresh(run.runId)}>Обновить состояние сборки</button>
      </> : null}
      {active ? <p>Host actions доступны после завершения активного шага и ожидающих подтверждений.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </details>;
}
