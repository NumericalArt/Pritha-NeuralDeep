"use client";
import { useEffect, useRef, useState } from "react";
import { controlCenterRequest, ControlCenterRequestError } from "@/lib/control-center-request";
import type { OperationAction, OperationPlan, OperationReceipt, OperationRequest } from "@/lib/codex-chat/operation-types";

export function OperationDecisions({ chatId, runId, disabled }: { chatId: string; runId: string; disabled: boolean }) {
  const [plan, setPlan] = useState<OperationPlan | null>(null), [pending, setPending] = useState<OperationRequest | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const mounted = useRef(true), busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const url = `/api/codex-chat/v1/threads/${encodeURIComponent(chatId)}/operations`;
  async function preview(action: OperationAction) {
    if (busyRef.current || disabled || pending) return;
    busyRef.current = true; setBusy(true); setMessage("");
    try {
      const result = await controlCenterRequest<OperationPlan>(`${url}?runId=${encodeURIComponent(runId)}&action=${action}`, {}, { timeoutMs: 30000 });
      if (mounted.current) { setPlan(result.data); setPending(result.data.pendingRequest); }
    } catch (error) { if (mounted.current) setMessage(error instanceof ControlCenterRequestError ? error.message : "План пока недоступен."); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function decide(decision: "approve" | "cancel") {
    if (busyRef.current || disabled || !plan) return;
    const request = pending || { requestId: crypto.randomUUID(), runId, action: plan.action, planLock: plan.planLock, decision };
    busyRef.current = true; setBusy(true); setPending(request); setMessage("");
    try {
      const { data } = await controlCenterRequest<OperationReceipt>(url, { method: "POST", body: JSON.stringify(request), headers: { "Idempotency-Key": request.requestId } }, { timeoutMs: 150000 });
      if (!mounted.current) return;
      if (data.status !== "started") { setPending(null); setPlan(null); }
      setMessage(data.status === "completed" ? "Операция выполнена. Доступ с другого устройства проверьте отдельно." : data.status === "cancelled" ? "Операция отменена." : data.status === "started" ? "Выполнение ещё не подтверждено. Проверьте Operations; повтор не запустит действие заново." : "Операция завершилась с ошибкой. Проверьте Operations.");
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ControlCenterRequestError && error.httpStatus === 409 && error.code === "operation_plan_changed") { setPending(null); setPlan(null); }
      setMessage(error instanceof ControlCenterRequestError ? error.message : "Ответ не получен. Проверьте сохранённое действие.");
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className="codex-operation-decisions" aria-label="Операции агента">
    <p>Запуск и приватный доступ подтверждаются отдельно.</p>
    <div className="codex-goal-fields">
      <button className="outline-button compact" disabled={disabled || busy || Boolean(pending)} onClick={() => void preview("start")}>План Start</button>
      <button className="outline-button compact" disabled={disabled || busy || Boolean(pending)} onClick={() => void preview("tailscale-serve")}>План Tailscale Serve</button>
    </div>
    {plan ? <div className="codex-operation-card"><strong>{plan.label}</strong><p>{plan.summary}</p>{plan.reason ? <p>{plan.reason}</p> : null}
      {pending ? <button className="outline-button compact" disabled={disabled || busy} onClick={() => void decide(pending.decision)}>Проверить сохранённое действие</button> : <div className="codex-goal-fields">
        <button className="outline-button compact" disabled={disabled || busy || !plan.enabled} onClick={() => void decide("approve")}>Подтвердить {plan.label}</button>
        <button className="outline-button compact" disabled={disabled || busy} onClick={() => void decide("cancel")}>Отмена</button>
      </div>}
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
