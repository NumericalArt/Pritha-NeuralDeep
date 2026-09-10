"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskLinkView } from "@/lib/codex-chat/types";
import type { VoiceOperatorRequestView } from "@/lib/codex-chat/voice-operator-context";

export function operatorTaskForLinks(links:TaskLinkView[]) {
  return [...links].reverse().find(link=>["waiting_for_operator","waiting_for_input","waiting_for_approval","waiting_for_provider","decision_required","failed","failed_timeout","failed_empty_result"].includes(link.status))?.taskId
    || links.find(link=>["running","in_progress","active"].includes(link.status))?.taskId || links.at(-1)?.taskId || null;
}

/** Task Chat and Voice submit the same immutable host question, never an unrelated typed turn. */
export function VoiceOperatorCard({taskId,onChanged}:{taskId:string;onChanged?:()=>void}) {
  const [request,setRequest] = useState<VoiceOperatorRequestView | null>(null);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false),[error,setError] = useState<string | null>(null);
  const [notice,setNotice] = useState<string | null>(null);
  const [activeAttempt,setActiveAttempt]=useState<string | null>(null),[readError,setReadError]=useState<string | null>(null);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/operator`,{cache:"no-store"});
    if (!response.ok) throw new Error("Не удалось проверить вопрос задачи.");
    const data = await response.json();
    if (mounted.current) {setRequest(data.operator_request || null);setActiveAttempt(typeof data.active_attempt_id==="string"?data.active_attempt_id:null);setReadError(null);}
  },[taskId]);
  useEffect(()=>{
    mounted.current=true;
    const poll=()=>{void refresh().catch(()=>{if(mounted.current)setReadError("Не удалось обновить состояние Voice. Последняя карточка сохранена.");});};
    poll(); const timer=setInterval(poll,5000);
    return()=>{mounted.current=false;clearInterval(timer);};
  },[refresh]);
  async function submit(action?:string) {
    if (!request || busy) return;
    const submitted=request,answer=drafts[request.request_id] || "";
    setBusy(true);setError(null);setNotice(null);
    try {
      const response=await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/${submitted.kind}`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operator_request_id:submitted.request_id,
          topic_generation:submitted.topic_generation,expected_revision:submitted.revision,
          ...(submitted.kind==="answer"?{answer}:{action})})});
      const result=await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error==="voice_task_operation_busy" || result.error==="task_already_active"
        ? "Предыдущее действие ещё выполняется. Обновите состояние задачи."
        : result.error==="admission_runtime_exit_unconfirmed" ? "Завершение предыдущего процесса ещё не подтверждено. Ответ и история сохранены."
        : "Не удалось подтвердить продолжение. Ответ сохранён в форме; проверьте обновлённую карточку.");
      if (mounted.current) {setNotice("Ответ принят Pritha. Ход исполнения показан в задаче.");onChanged?.();}
    } catch (cause) {if(mounted.current)setError(cause instanceof Error?cause.message:"Связь прервалась. Проверьте состояние перед продолжением.");}
    finally {if(mounted.current){setBusy(false);await refresh().catch(()=>undefined);}}
  }
  async function stop() {
    if(!activeAttempt || busy)return;
    const expectedAttemptId=activeAttempt;setBusy(true);setError(null);
    try {
      const response=await fetch(`/api/realtime/codex-task/${encodeURIComponent(taskId)}/abort`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expected_attempt_id:expectedAttemptId,reason:"Operator stopped this Voice task from its Task Chat card."})});
      const result=await response.json();if(!response.ok || !result.ok)throw new Error("Остановка не подтверждена. Обновите состояние именно этой задачи.");
      if(mounted.current){setNotice("Остановка подтверждена для выбранной задачи. История и расход сохранены.");onChanged?.();}
    } catch(cause) {if(mounted.current)setError(cause instanceof Error?cause.message:"Не удалось подтвердить остановку.");}
    finally {if(mounted.current){setBusy(false);await refresh().catch(()=>undefined);}}
  }
  if (!request && !error && !notice && !activeAttempt && !readError) return null;
  return <section className="codex-operator-card" aria-label="Вопрос задачи" aria-busy={busy}>
    {request ? <><strong>{request.kind==="answer"?"Задача ждёт ответа":request.kind==="approval"?"Требуется решение":"Проверка продолжения"}</strong>
      {request.question ? <p>{request.question}</p> : null}
      {request.kind==="answer" ? <><textarea aria-label="Ответ на вопрос задачи" maxLength={4000} value={drafts[request.request_id] || ""}
        onChange={event=>setDrafts(current=>({...current,[request.request_id]:event.target.value}))}/>
        <button type="button" disabled={busy || !(drafts[request.request_id] || "").trim()} onClick={()=>void submit()}>Отправить ответ</button></>
        : <div className="codex-operator-actions">{(request.kind==="approval" ? [["approve","Одобрить"],["reject","Отклонить"]]
          : [["resume","Проверить и продолжить"],["retry","Проверить и повторить"],["cancel","Отменить продолжение"]]).map(([action,label])=>
          <button key={action} type="button" disabled={busy} onClick={()=>void submit(action)}>{label}</button>)}</div>}</> : null}
    {notice ? <p role="status">{notice}</p>:null}{error ? <p role="alert">{error}</p>:null}
    {readError?<p role="alert">{readError}</p>:null}
    {activeAttempt?<button type="button" disabled={busy || Boolean(readError)} onClick={()=>void stop()}>Stop Voice task</button>:null}
  </section>;
}
