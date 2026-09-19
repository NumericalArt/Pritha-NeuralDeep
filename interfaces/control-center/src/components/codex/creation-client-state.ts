import type { CreationAction, CreationJobView, CreationRequest } from "@/lib/codex-chat/creation-types";

const actions = new Set<CreationAction>(["approve_contract", "approve_outcome", "continue", "pause", "cancel", "revise_proposal"]);
export const creationPendingKey = (chatId: string) => `pritha.creation.pending.v1:${chatId}`;

const phases: Record<string, string> = { request: "Описание задачи", proposal: "Предложение", interview: "Уточнение задачи", approvals: "Согласования", contract: "Контракт", outcome: "Outcome Spec", research: "Проверка архитектуры", scaffold: "Подготовка проекта", implementation: "Реализация", implement: "Реализация", verification: "Проверки", verify: "Проверки", demonstration: "Демонстрация", demo: "Демонстрация", finish: "Результат" };
const statuses: Record<string, string> = { pending: "Ожидает следующего шага", running: "Выполняется", ready: "Готов к демонстрации", completed: "Завершено", cancelled: "Отменено", failed: "Шаг завершился с ошибкой", paused: "Приостановлено", blocked: "Нужна проверка", awaiting_approval: "Ожидает согласования", awaiting_acceptance: "Ожидает приёмки пользователя", awaiting_input: "Нужен ваш ответ", awaiting_contract_approval: "Ожидает подтверждения контракта", awaiting_outcome_approval: "Ожидает подтверждения Outcome Spec" };
const idleStatuses = new Set(["ready", "completed", "cancelled", "failed", "paused", "blocked", "awaiting_approval", "awaiting_acceptance", "awaiting_input", "awaiting_contract_approval", "awaiting_outcome_approval"]);
export const creationPhaseLabel = (phase: string) => phases[phase] || "Текущий этап";
export const creationStatusLabel = (status: string) => statuses[status] || "Обновление состояния";
export const creationShouldPoll = (status: string) => !idleStatuses.has(status);
export function creationResultPresentation(job: Pick<CreationJobView, "status" | "delivery" | "agentCardUrl">) {
  const verified = job.status === "ready" && job.delivery?.adopted === true;
  return {
    verified,
    message: verified ? "Результат проверен; приёмка пользователя ожидается." : null,
    href: verified && typeof job.agentCardUrl === "string" && /^\/agents\/[A-Za-z0-9_-]+$/.test(job.agentCardUrl) ? job.agentCardUrl : null,
  };
}

export function readCreationPending(text: string | null): CreationRequest | null {
  if (!text || text.length > 8192) return null;
  try {
    const value = JSON.parse(text) as CreationRequest;
    if (!value || typeof value !== "object" || !actions.has(value.action)
      || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0
      || typeof value.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.requestId)
      || !value.actor || !["user", "codex-operator"].includes(value.actor)
      || (value.authorizationBasis !== undefined && (typeof value.authorizationBasis !== "string" || value.authorizationBasis.length > 2000))
      || (value.actor === "codex-operator" && !value.authorizationBasis?.trim())
      || (value.action === "revise_proposal" && (typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 2000))) return null;
    return { requestId: value.requestId, action: value.action, expectedRevision: value.expectedRevision, actor: value.actor, ...(value.authorizationBasis ? { authorizationBasis: value.authorizationBasis } : {}), ...(value.action === "revise_proposal" ? {reason:value.reason} : {}) };
  } catch { return null; }
}

export function creationRequestForAction(pending: CreationRequest | null, action: CreationAction, revision: number, actor: CreationRequest["actor"], authorizationBasis: string, requestId: string, reason?: string): CreationRequest {
  // An uncertain response must be reconciled using exactly the original request.
  if (pending) return pending;
  return { requestId, expectedRevision: revision, action, actor, ...(actor === "codex-operator" ? { authorizationBasis: authorizationBasis.trim() } : {}), ...(action === "revise_proposal" ? {reason:reason?.trim() || ""} : {}) };
}
