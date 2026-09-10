import { createHash } from "node:crypto";
import type { PersistentVoiceTaskLink } from "./voice-task-links";
import type { OperatorRequestRecord } from "../../../../../scripts/neuraldeep/operator-requests.mjs";

export type VoiceOperatorRequestView = {
  request_id: string; task_id: string; topic_id: string; topic_generation: number; revision: number;
  kind: "answer" | "approval" | "recovery"; question: string | null;
  recovery_of?: string;
};

/** Pure read projection. Viewing a question cannot accept it or start a CLI. */
export function voiceOperatorRequestView(taskId: string, request: Record<string, unknown> | null,
  status: Record<string, unknown> | null, link: PersistentVoiceTaskLink | null, latest?: OperatorRequestRecord | null): VoiceOperatorRequestView | null {
  if (!request || !link || link.taskId !== taskId) return null;
  if (latest?.kind === "recovery" && latest.status === "pending" && latest.context.recoveryOf
    && latest.taskId === taskId && latest.topicId === link.topicId && latest.generation === link.scope.generation) {
    return {request_id:latest.requestId,task_id:taskId,topic_id:link.topicId,topic_generation:link.scope.generation,
      revision:latest.revision,kind:"recovery",recovery_of:String(latest.context.recoveryOf),question:String(latest.context.question || "")};
  }
  if (latest?.answer && latest.taskId === taskId && latest.topicId === link.topicId && latest.generation === link.scope.generation
    && ["accepted","recovery_required"].includes(latest.status)) {
    const hash = createHash("sha256").update(JSON.stringify([latest.requestId,latest.revision,"reconcile"])).digest("hex");
    return {request_id:`request_${hash.slice(0,40)}`,task_id:taskId,topic_id:link.topicId,topic_generation:link.scope.generation,
      revision:1,kind:"recovery",recovery_of:latest.requestId,
      question:"Ответ сохранён. Подтверждение продолжения потеряно; сначала проверьте состояние предыдущего исполнения."};
  }
  const state = String(status?.status || request.status || "");
  const approval = (request.approval || status?.approval) as Record<string, unknown> | null;
  const question = String(status?.question || request.operator_question || "").trim();
  const kind = state === "waiting_for_operator" && question ? "answer"
    : approval?.status === "pending" && ["decision_required","waiting_for_approval","queued"].includes(state) ? "approval"
    : ["waiting_for_provider","failed","failed_timeout","failed_empty_result"].includes(state) ? "recovery" : null;
  if (!kind) return null;
  const anchor = kind === "approval" ? approval?.requested_at : status?.admission_attempt_id || status?.updated_at || request.created_at;
  const hash = createHash("sha256").update(JSON.stringify([taskId,link.topicId,link.scope.generation,kind,anchor,
    kind === "answer" ? question : kind === "approval" ? approval : null])).digest("hex");
  const savedId = kind === "answer" ? String(status?.operator_request_id || "") : "";
  return { request_id: /^request_[A-Za-z0-9-]{24,64}$/.test(savedId) ? savedId : `request_${hash.slice(0,40)}`,
    task_id: taskId, topic_id: link.topicId, topic_generation: link.scope.generation, revision: 1, kind,
    question: kind === "answer" ? question.slice(0,1000) : kind === "approval" ? String(approval?.summary || "").slice(0,1000) : null };
}
