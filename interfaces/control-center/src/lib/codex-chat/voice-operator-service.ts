import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NeuralDeepOperatorRequests, OperatorRequestRecord } from "../../../../../scripts/neuraldeep/operator-requests.mjs";
import type { PersistentVoiceTaskLink } from "./voice-task-links";
import { voiceOperatorRequestView, type VoiceOperatorRequestView } from "./voice-operator-context";

type OperatorControl = {
  operatorRequests(): NeuralDeepOperatorRequests;
  logicalOwnerForKey(key: string): { owner: string; generation: number; held: number } | null;
  acquireTaskControl(taskId: string, owner: string): boolean;
  releaseTaskControl(taskId: string, owner: string): boolean;
};
export type VoiceOperatorResponse = { operator_request_id?: unknown; topic_generation?: unknown; expected_revision?: unknown };
type Snapshot = { request: Record<string, unknown> | null; status: Record<string, unknown> | null; link: PersistentVoiceTaskLink | null };
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const taskControls = new AsyncLocalStorage<{ control: OperatorControl; taskId: string; owner: string; held: boolean }>();
function failure(code: string) { return Object.assign(new Error(code),{code}); }
export function voiceOperatorErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return ID.test(code) ? code : "voice_operator_dispatch_unconfirmed";
}
function acknowledgement(record: OperatorRequestRecord): Record<string, unknown> {
  return record.result || { ok: true, task_id: record.taskId, operator_request_id: record.requestId,
    operator_intent_id: record.intentId, answer_accepted: record.kind === "answer", status: "accepted" };
}

function register(control: OperatorControl, descriptor: VoiceOperatorRequestView, link: PersistentVoiceTaskLink, status: Record<string, unknown> | null) {
  const owner = control.logicalOwnerForKey(link.topicId);
  return control.operatorRequests().register({ requestId: descriptor.request_id, taskId: descriptor.task_id, topicId: link.topicId,
    scope: createHash("sha256").update(link.topicId).digest("hex").slice(0,24), generation: link.scope.generation,
    ownerGeneration: owner?.held && owner.owner === descriptor.task_id ? owner.generation : 0, kind: descriptor.kind,
    context: { question: descriptor.question, stateIdentityHash: link.stateIdentityHash, sessionId: link.sessionId,
      modelId: link.modelId, effortId: link.effortId, sandbox: status?.sandbox || null, network: status?.network_access ?? null,
      ...(descriptor.recovery_of ? { recoveryOf: descriptor.recovery_of } : {}) } });
}

export function registerVoiceOperatorQuestion(control: OperatorControl, taskId: string, link: PersistentVoiceTaskLink,
  question: string, status: { sandbox: string; network_access: boolean }) {
  const owner = control.logicalOwnerForKey(link.topicId);
  if (!owner?.held || owner.owner !== taskId) throw failure("operator_request_owner_changed");
  const descriptor: VoiceOperatorRequestView = {request_id:`request_${randomUUID()}`,task_id:taskId,topic_id:link.topicId,
    topic_generation:link.scope.generation,revision:1,kind:"answer",question:question.slice(0,1000)};
  register(control,descriptor,link,status);
  return descriptor;
}

export async function withVoiceTaskControl<T>(control: OperatorControl, taskId: string, operation: () => Promise<T>): Promise<T> {
  const inherited = taskControls.getStore();
  if (inherited?.held && inherited.control === control && inherited.taskId === taskId) return operation();
  const owner = `voice_control_${randomUUID()}`;
  if (!control.acquireTaskControl(taskId,owner)) throw failure("voice_task_operation_busy");
  const context = {control,taskId,owner,held:true};
  try { return await taskControls.run(context,operation); }
  finally { context.held = false; control.releaseTaskControl(taskId,owner); }
}

/** One host decision receipt precedes all mutable mirrors and any new CLI attempt. */
export async function dispatchVoiceOperatorResponse(input: VoiceOperatorResponse & {
  taskId: string; kind: "answer" | "approval" | "recovery"; answer: Record<string, unknown>; control: OperatorControl;
  readSnapshot: () => Promise<Snapshot>; apply: (receipt: OperatorRequestRecord) => Promise<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  const requestId = String(input.operator_request_id || ""), generation = input.topic_generation, revision = input.expected_revision;
  if (!ID.test(input.taskId) || !ID.test(requestId) || !Number.isSafeInteger(generation) || Number(generation) < 1 || !Number.isSafeInteger(revision)) {
    return { ok: false, error: "operator_request_context_required", task_id: input.taskId };
  }
  let requests: NeuralDeepOperatorRequests;
  try { requests = input.control.operatorRequests(); }
  catch (error) { return {ok:false,error:voiceOperatorErrorCode(error),task_id:input.taskId}; }
  let claimed: OperatorRequestRecord | null = null;
  const accept = (record: OperatorRequestRecord) => {
    if (record.kind !== input.kind) throw failure("operator_request_identity_conflict");
    return requests.accept({ requestId, taskId: input.taskId, topicId: record.topicId,
      generation: Number(generation), expectedRevision: Number(revision), answer: input.answer });
  };
  try {
    const previous = requests.get(requestId);
    if (previous?.answer) return acknowledgement(accept(previous));
    return await withVoiceTaskControl(input.control,input.taskId,async () => {
      const prior = requests.get(requestId);
      if (prior?.answer) return acknowledgement(accept(prior));
      const snapshot = await input.readSnapshot();
      const descriptor = voiceOperatorRequestView(input.taskId,snapshot.request,snapshot.status,snapshot.link,requests.latest(input.taskId));
      if (!descriptor || descriptor.request_id !== requestId || descriptor.kind !== input.kind
        || descriptor.topic_generation !== generation || descriptor.revision !== revision) throw failure("operator_request_revision_conflict");
      const link = snapshot.link!;
      const record = register(input.control,descriptor,link,snapshot.status);
      const accepted = accept(record);
      if (!accepted.dispatch) return acknowledgement(accepted);
      claimed = accepted;
      const result = await input.apply(accepted);
      const response: Record<string, unknown> = { ...acknowledgement(accepted), ok: result.ok === true,
        status: typeof result.status === "string" ? result.status : result.ok === true ? "accepted" : "recovery_required",
        ...(typeof result.error === "string" ? {error:result.error} : {}),
        ...(typeof result.short_id === "string" ? {short_id:result.short_id} : {}),
        operator_note: result.ok === true ? "Ответ принят Pritha. Состояние исполнения показано в карточке задачи." : "Ответ сохранён; проверьте состояние задачи перед продолжением." };
      requests.finish(requestId,accepted.intentId!,response);
      return response;
    });
  } catch (error) {
    const response = { ok: false, error: voiceOperatorErrorCode(error), task_id: input.taskId, operator_request_id: requestId };
    const saved = claimed as OperatorRequestRecord | null;
    if (saved?.intentId) {
      try { requests.finish(requestId,saved.intentId,response); }
      catch { return {...response,error:"operator_receipt_finish_unconfirmed",answer_accepted:true}; }
    }
    return response;
  }
}
