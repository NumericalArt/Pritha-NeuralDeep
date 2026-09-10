import type { AgentCardModel } from "@/data/mockAgents";
import { getCardActionLabel } from "@/data/mockAgents";

const resultLabels = {
  unverified: "Нет подтверждения", verified: "Проверен", awaiting_operator: "Нужна ручная проверка",
  failed: "Проверки не прошли", stale: "Проверка устарела", unknown: "Пока неизвестно",
};
const kinds: Record<string, string> = {
  service: "Сервис", "one-shot-cli": "CLI", "job-runner": "Задания", "tool-server": "Сервер инструментов",
  library: "Библиотека", "interactive-agent": "Диалоговый агент", "legacy-unclassified": "Тип не уточнён",
};
const acceptanceLabels = {
  not_accepted: "Ещё не принят", accepted: "Принят пользователем",
  recorded_for_other_revision: "Принята прежняя версия", unknown: "Нет подтверждённой записи",
};

export function AgentResultReadiness({ agent }: { agent: AgentCardModel }) {
  const result = agent.resultReadiness;
  if (!result) return null;
  const checked = result.verification;
  const runtime = agent.runtimeReadiness?.status === "not_applicable" ? "Не требуется"
    : agent.healthStatus === "ok" ? "Health отвечает" : agent.healthStatus === "failed" ? "Health не отвечает" : "Не подтверждён";
  return <details className="agent-result-readiness" data-testid="agent-result-readiness">
    <summary>Результат: {resultLabels[checked.status]}</summary>
    <dl>
      <dt>Тип</dt><dd>{kinds[agent.agentKind?.kind || "legacy-unclassified"]}</dd>
      <dt>Trials</dt><dd>{checked.counts ? `${checked.counts.passed}/${checked.counts.automated} автоматических · ${checked.counts.operator} ручных` : "Нет актуальных измерений"}</dd>
      <dt>Ревизия</dt><dd>{checked.head?.slice(0, 12) || "Не проверена"}</dd>
      <dt>Приёмка</dt><dd>{acceptanceLabels[result.acceptance.status]}</dd>
      <dt>Процесс</dt><dd>{runtime}</dd>
      <dt>Действие</dt><dd>{getCardActionLabel(agent)}{agent.control?.executionMode === "plan_only" ? " · план" : ""}</dd>
      {result.candidate.head && (result.candidate.head !== checked.head || result.candidate.status !== checked.status) ? <><dt>Ветка сборки</dt><dd>{resultLabels[result.candidate.status]} · {result.candidate.head.slice(0, 12)}</dd></> : null}
    </dl>
    {checked.reason === "outcome-approval-not-current" ? <p>Требуется актуальное одобрение Outcome Spec.</p> : null}
    {result.observedAt ? <p>Состояние на <time dateTime={result.observedAt}>{new Date(result.observedAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</time></p> : null}
  </details>;
}
