import type { CreationAction, CreationJobView, CreationRequest } from "@/lib/codex-chat/creation-types";

const actions = new Set<CreationAction>(["approve_contract", "approve_outcome", "continue", "pause", "cancel", "revise_proposal", "verify_saved", "adopt_verified", "reconcile_usage"]);
export const creationPendingKey = (chatId: string) => `pritha.creation.pending.v1:${chatId}`;
export const creationOperatorKey = (chatId: string) => `pritha.creation.operator.v1:${chatId}`;
export function readCreationOperator(text: string | null): { actor: CreationRequest["actor"]; basis: string } {
  try {
    const value = text && text.length <= 8192 ? JSON.parse(text) : null;
    if (value && ["user", "codex-operator"].includes(value.actor) && typeof value.basis === "string" && value.basis.length <= 2000) return { actor: value.actor, basis: value.basis };
  } catch { /* A corrupt preference cannot create an approval or erase history. */ }
  return { actor: "user", basis: "" };
}

const phases: Record<string, string> = { request: "Описание задачи", proposal: "Предложение", interview: "Уточнение задачи", approvals: "Согласования", contract: "Контракт", outcome: "Outcome Spec", research: "Проверка архитектуры", scaffold: "Подготовка проекта", implementation: "Реализация", implement: "Реализация", verification: "Проверки", verify: "Проверки", demonstration: "Демонстрация", demo: "Демонстрация", finish: "Результат" };
const statuses: Record<string, string> = { pending: "Ожидает следующего шага", running: "Выполняется", ready: "Готов к демонстрации", completed: "Завершено", cancelled: "Отменено", failed: "Шаг завершился с ошибкой", paused: "Приостановлено", blocked: "Нужна проверка", awaiting_approval: "Ожидает согласования", awaiting_acceptance: "Ожидает приёмки пользователя", awaiting_input: "Нужен ваш ответ", awaiting_contract_approval: "Ожидает подтверждения контракта", awaiting_outcome_approval: "Ожидает подтверждения Outcome Spec" };
const idleStatuses = new Set(["ready", "completed", "cancelled", "failed", "paused", "blocked", "awaiting_approval", "awaiting_acceptance", "awaiting_input", "awaiting_contract_approval", "awaiting_outcome_approval"]);
export const creationPhaseLabel = (phase: string) => phases[phase] || "Текущий этап";
export const creationStatusLabel = (status: string) => statuses[status] || "Обновление состояния";
export const creationShouldPoll = (status: string) => !idleStatuses.has(status);
export function creationRecoveryExplanation(reason: string | undefined) {
  const reasons: Record<string,string> = {
    'verified-candidate-preserved': 'Проверенный результат сохранён. Его перенос не запускает модель и не означает приёмку пользователем.',
    'sandbox-verification-available': 'Сохранённый проект можно проверить в изоляции без сетевого доступа. Новый запрос модели не запускается.',
    creation_execution_unconfirmed: 'Сначала нужно подтвердить завершение предыдущего процесса. Повторный запуск пока недоступен.',
    creation_preparation_usage_unknown: 'Не подтверждён расход подготовки. Сверка использует сохранённые квитанции и может оставить расход неизвестным.',
    creation_scaffold_baseline_changed: 'Исходная версия проекта изменилась. Нужна проверка сохранённых версий перед переносом.',
    creation_source_changed: 'В каталоге результата появились изменения. Автоматический перенос остановлен, чтобы сохранить их.',
    creation_candidate_evidence_stale: 'Проверки не подтверждают текущую версию результата. Требуется восстановить связь с согласованным заданием и повторить допустимые проверки.',
    trial_model_usage_unknown: 'Проверяющие команды могут обращаться к модели. Их повтор остановлен до проверки способа выполнения и бюджета.',
  };
  return reason ? reasons[reason] || 'Для восстановления требуется проверить сохранённые версии и квитанции.' : null;
}
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
