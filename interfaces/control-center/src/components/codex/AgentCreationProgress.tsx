"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { controlCenterRequest, ControlCenterRequestError, deliveryMayBeUnknown } from "@/lib/control-center-request";
import type { CreationAction, CreationJobView, CreationRequest } from "@/lib/codex-chat/creation-types";
import { CodexMarkdown } from "./CodexMarkdown";
import { creationPendingKey, creationOperatorKey, readCreationOperator, creationRequestForAction, readCreationPending, creationPhaseLabel, creationStatusLabel, creationShouldPoll, creationResultPresentation } from "./creation-client-state";

const labels: Record<CreationAction, string> = { approve_contract: "Подтвердить контракт", approve_outcome: "Подтвердить Outcome Spec", continue: "Продолжить создание", pause: "Приостановить", cancel: "Отменить создание", revise_proposal: "Пересмотреть предложение" };
const shortSha = (value: string | null | undefined) => value ? value.slice(0, 12) : "неизвестна";

export function AgentCreationProgress({ chatId, refreshKey }: { chatId: string; refreshKey?: string | number }) {
  const [job, setJob] = useState<CreationJobView | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [pending, setPending] = useState<CreationRequest | null>(null);
  const [actor, setActor] = useState<CreationRequest["actor"]>("user");
  const [basis, setBasis] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [reviewed, setReviewed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [pollingExpired, setPollingExpired] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
  const mounted = useRef(false), busyRef = useRef(false);
  const endpoint = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/creation`;
  const key = creationPendingKey(chatId);

  useEffect(() => {
    mounted.current = true;
    let operator = readCreationOperator(null);
    try {
      setPending(readCreationPending(sessionStorage.getItem(key)));
      operator = readCreationOperator(sessionStorage.getItem(creationOperatorKey(chatId)));
    } catch { /* Browser storage may be unavailable. */ }
    setActor(operator.actor); setBasis(operator.basis); setReviewed({});
    return () => { mounted.current = false; };
  }, [key, chatId]);

  function chooseOperator(nextActor: CreationRequest["actor"], nextBasis: string) {
    setActor(nextActor); setBasis(nextBasis);
    // This is an unfinished form preference, never host approval evidence.
    try { sessionStorage.setItem(creationOperatorKey(chatId), JSON.stringify({ actor: nextActor, basis: nextBasis })); }
    catch { /* The current page still retains the form values. */ }
  }

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const { data } = await controlCenterRequest<{ job: CreationJobView | null; legacy?: boolean }>(endpoint, { signal }, { timeoutMs: 15_000 });
    if (mounted.current && !signal?.aborted) {
      setJob(previous => previous && data.job && previous.jobId === data.job.jobId && previous.revision > data.job.revision ? previous : data.job);
      setLegacy(data.legacy === true);
    }
    return data.job;
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    setPollingExpired(false);
    async function poll() {
      try {
        const value = await refresh(controller.signal);
        if (controller.signal.aborted || !value || !creationShouldPoll(value.status)) return;
        if (++polls >= 360) { setPollingExpired(true); return; }
        timer = setTimeout(() => void poll(), document.hidden ? 15_000 : 5000);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ControlCenterRequestError && error.httpStatus === 404) return;
        setMessage("Состояние создания пока недоступно. Обновите его перед следующим действием.");
      }
    }
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [refresh, refreshKey, pollEpoch]);

  function persist(request: CreationRequest | null) {
    setPending(request);
    try { if (request) sessionStorage.setItem(key, JSON.stringify(request)); else sessionStorage.removeItem(key); }
    catch { /* Ref/state still retain the idempotency key until this page is closed. */ }
  }

  function refreshManually() {
    setMessage("");
    setPollEpoch(previous => previous + 1);
  }

  async function act(action: CreationAction) {
    if (!job || busyRef.current) return;
    if (!pending && (!job.actions[action] || (actor === "codex-operator" && !basis.trim()))) return;
    if (!pending && action === "revise_proposal" && !revisionReason.trim()) return;
    const request = creationRequestForAction(pending, action, job.revision, actor, basis, crypto.randomUUID(), revisionReason);
    busyRef.current = true; setBusy(true); persist(request); setMessage("");
    try {
      const { data } = await controlCenterRequest<{ job: CreationJobView }>(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.requestId }, body: JSON.stringify(request),
      }, { timeoutMs: 30_000 });
      if (!mounted.current) return;
      setJob(data.job); persist(null); setMessage("Действие сохранено."); setPollEpoch(previous => previous + 1);
    } catch (error) {
      if (!mounted.current) return;
      if (!deliveryMayBeUnknown(error)) persist(null);
      setMessage(deliveryMayBeUnknown(error)
        ? "Ответ не подтверждён. Проверьте сохранённое действие: повтор использует тот же запрос и не создаёт новую задачу."
        : error instanceof ControlCenterRequestError ? error.message : "Действие не выполнено.");
      try { await refresh(); } catch { /* Keep the original action and its error visible. */ }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  if (!job && legacy) return <p className="codex-inline-notice" role="status">Историческая задача; автоматическое подключение отсутствует. Переписка доступна для чтения.</p>;
  if (!job && !pending) return message ? <p className="codex-inline-notice" role="status">{message} <button type="button" className="outline-button compact" onClick={refreshManually}>Повторить обновление</button></p> : null;
  if (!job) return <p role="status">Сохранён неподтверждённый запрос создания. <button type="button" className="outline-button compact" onClick={refreshManually}>Получить состояние</button></p>;
  const locked = busy || Boolean(pending);
  const delegatedMissing = actor === "codex-operator" && !basis.trim();
  const result = creationResultPresentation(job);
  const versionsDiffer = Boolean(job.versions.sourceDirty || (job.versions.runtime && job.versions.execution && job.versions.runtime !== job.versions.execution) || (job.versions.source && job.versions.execution && job.versions.source !== job.versions.execution));
  return <section className="codex-operation-card" aria-label="Создание агента" style={{ marginBottom: 16, padding: 16 }}>
    <h2>Создание агента · {creationPhaseLabel(job.phase)}</h2>
    <p role="status">{creationStatusLabel(job.status)}. Агент {job.agentId}.</p>
    {result.verified ? <p role="status">{result.message} {result.href ? <a className="outline-button compact" href={result.href}>Открыть карточку агента</a> : <a href="/agents">Открыть список агентов</a>}</p> : null}
    <p>{job.budget.unknownAttempts.length > 0 || job.status === "running" ? "Подтверждённый расход завершённых шагов" : "Расход"}: {job.budget.tokensUsed.toLocaleString("ru-RU")} / {job.budget.maxTokens.toLocaleString("ru-RU")} токенов; {Math.ceil(job.budget.activeMs / 60_000)} / {Math.ceil(job.budget.maxActiveMs / 60_000)} минут активной работы.</p>
    {job.observedUsage && job.observedUsage.unfinalizedTokens > 0 ? <p role="status">По сохранённым ответам уже израсходовано не менее {job.observedUsage.knownMinimumTokens.toLocaleString("ru-RU")} токенов, включая {job.observedUsage.unfinalizedTokens.toLocaleString("ru-RU")} в шагах без итоговой квитанции. Эти числа не складываются повторно.</p> : null}
    {job.budget.unknownAttempts.length > 0 ? <p role="status">Итоговый расход неизвестен. Ноль в подтверждённой части не означает, что токены не расходовались.</p> : job.status === "running" ? <p role="status">Расход текущего шага ещё уточняется.</p> : null}
    {job.budget.unknownAttempts.length > 0 ? <p className="codex-inline-notice" role="alert">Есть исполнения с неподтверждённым расходом: {job.budget.unknownAttempts.length}. Продолжение доступно после сверки.</p> : null}
    {job.preparation ? <div aria-label="Расход подготовки">
      <p>Подготовка: подтверждено {job.preparation.total.toLocaleString("ru-RU")} / {job.preparation.limits.totalTokens.toLocaleString("ru-RU")} токенов. Запросы: {job.preparation.requests} / {job.preparation.limits.maxRequests}.</p>
      <ul>{([['brief','Brief и пересмотры'],['research','Research']] as const).map(([key,label])=><li key={key}>{label}: {job.preparation!.phase[key].toLocaleString("ru-RU")} токенов; остаток {job.preparation!.phaseRemaining[key].toLocaleString("ru-RU")}.</li>)}</ul>
      <p>Для реализации после подготовки: {job.preparation.availableForDelivery === null ? "остаток уточняется" : `${job.preparation.availableForDelivery.toLocaleString("ru-RU")} токенов`}; защищённый ресурс — {job.preparation.deliveryProtected.toLocaleString("ru-RU")}.</p>
      {job.preparation.pendingRequests ? <p role="status">Ожидают ответа: {job.preparation.pendingRequests}. Их итоговый расход пока неизвестен.</p> : null}
      {job.preparation.unknownRequests ? <p role="alert">Запросы с неизвестным расходом: {job.preparation.unknownRequests}. Следующая отправка запрещена.</p> : null}
      {job.preparation.research ? <p>Research: проверено тем {job.preparation.research.checked.length}; осталось {job.preparation.research.remaining.length}{job.preparation.research.remaining.length ? ` (${job.preparation.research.remaining.join(', ')})` : ''}.</p> : null}
    </div> : null}
    {job.context ? <p aria-label="Размер контекста">{job.context.requestMode==='host-brief-v1'?'Brief без инструментов. ':job.context.requestMode==='host-research-v1'?'Research: инструкции только для проверки источников. ':''}Полный запрос: {job.context.bytes===null?'ещё не подготовлен':`${(job.context.bytes/1024).toFixed(1)} КиБ`}; резерв {job.context.reservation===null?'ещё не рассчитан':`${job.context.reservation.toLocaleString('ru-RU')} токенов`}. Границы: 64 КиБ для новой сессии, 96 КиБ для checkpoint, 128 КиБ — предел. КиБ измеряют байты; резерв не является фактическим расходом.</p> : null}
    {job.nextDispatch ? <p role="status">{job.nextDispatch.reason}</p> : null}
    {job.blocker ? <p className="codex-inline-notice" role="alert">{job.blocker.message}</p> : null}
    {pending ? <p role="status">Ожидает подтверждения: «{labels[pending.action]}». Оператор: {pending.actor === "codex-operator" ? "Codex по поручению пользователя" : "пользователь"}. Повтор сохранит исходную ревизию и основание поручения.</p> : null}
    {versionsDiffer ? <p className="codex-inline-notice" role="status">Версии исходников, работающей Pritha и исполнения различаются. Создание закреплено за выпуском {shortSha(job.releaseSha)}.</p> : null}
    <details><summary>Версии и восстановление</summary>
      <p>Исходники: {shortSha(job.versions.source)}{job.versions.sourceDirty ? " · есть незакоммиченные изменения" : ""}. Control Center: {shortSha(job.versions.runtime)}. Исполнение: {shortSha(job.versions.execution)}.</p>
      {job.checkpoint ? <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{typeof job.checkpoint === "string" ? job.checkpoint : JSON.stringify(job.checkpoint, null, 2)}</pre> : <p>Checkpoint пока отсутствует.</p>}
    </details>
    {([ ["contract", "Архитектурный контракт", "approve_contract"], ["outcome", "Outcome Spec — конечный результат", "approve_outcome"] ] as const).map(([kind, title, action]) => {
      const document = job[kind];
      if (!document) return null;
      const approval = job.approvals[kind];
      const approved = approval?.hash === document.hash;
      return <div key={kind} style={{ marginTop: 12 }}>
        <details><summary>{title}</summary><div style={{ maxHeight: 420, overflow: "auto" }}><CodexMarkdown markdown={document.text} /></div></details>
        {approved ? <p>Эта ревизия подтверждена: {approval.actor === "codex-operator" ? "Codex по поручению пользователя" : "пользователь"}. {approval.authorizationBasis && approval.actor === "codex-operator" ? `Основание: ${approval.authorizationBasis}` : ""}</p> : approval ? <p role="alert">Подтверждение относится к другой ревизии документа.</p> : null}
        {document.issues.length ? <ul>{document.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
        {job.actions[action] ? <><label style={{ display: "block", margin: "8px 0" }}><input type="checkbox" disabled={locked} checked={reviewed[kind] === document.hash} onChange={event => setReviewed(previous => ({ ...previous, [kind]: event.target.checked ? document.hash : "" }))} /> Проверена эта ревизия документа</label>
          <button type="button" className="outline-button compact" disabled={locked || delegatedMissing || reviewed[kind] !== document.hash || document.issues.length > 0} onClick={() => void act(action)}>{labels[action]}</button></> : null}
      </div>;
    })}
    <p>Проверка документа не является согласием. Контракт и Outcome Spec подтверждаются отдельно; готовый результат принимает пользователь.</p>
    <label>Кто выполняет действие <select value={actor} disabled={locked} onChange={event => chooseOperator(event.target.value as CreationRequest["actor"], basis)}><option value="user">Пользователь</option><option value="codex-operator">Codex по поручению пользователя</option></select></label>
    {actor === "codex-operator" ? <label style={{ display: "block", marginTop: 8 }}>Основание поручения <textarea value={basis} disabled={locked} maxLength={2000} rows={2} onChange={event => chooseOperator(actor, event.target.value)} placeholder="Какое поручение пользователя разрешает этот контрольный прогон" style={{ width: "100%" }} /></label> : null}
    {job.actions.revise_proposal ? <details style={{marginTop:12}}><summary>Пересмотреть предложение до создания проекта</summary>
      <p>Предыдущие согласования сохранятся в истории. Новые контракт и Outcome Spec потребуют отдельных подтверждений.</p>
      <label>Что нужно изменить <textarea value={revisionReason} disabled={locked} maxLength={2000} rows={3} onChange={event => setRevisionReason(event.target.value)} style={{width:"100%"}} /></label>
      <button type="button" className="outline-button compact" disabled={locked || delegatedMissing || !revisionReason.trim()} onClick={() => void act("revise_proposal")}>{labels.revise_proposal}</button>
    </details> : job.deliveryRunId ? <p>Проект уже создан. Изменение согласованного задания требует новой задачи и отдельного каталога.</p> : null}
    <div className="codex-goal-fields" style={{ marginTop: 12, flexWrap: "wrap" }}>
      {(["continue", "pause", "cancel"] as const).filter(action => job.actions[action]).map(action => <button key={action} type="button" className="outline-button compact" disabled={locked || delegatedMissing} onClick={() => void act(action)}>{labels[action]}</button>)}
      {pending ? <button type="button" className="outline-button compact" disabled={busy} onClick={() => void act(pending.action)}>Проверить сохранённое действие</button> : null}
      <button type="button" className="outline-button compact" disabled={busy} onClick={refreshManually}>Обновить состояние</button>
    </div>
    {pollingExpired ? <p role="status">Автоматическое обновление приостановлено. Можно обновить состояние вручную; работа Pritha продолжается.</p> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
