import { readAgentTestResult } from "./command-probe.mjs";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { withFileLock } from "../lib/atomic-file.mjs";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { redactSensitiveText } from "../lib/redaction.mjs";
import { readAgentCatalog, findCatalogAgent, readCatalogArtifact, readIdentityEvidence, readAgentOperationsManifest, agentOperationsApplicability, authoredAgentId } from "./identity.mjs";
import { contractData } from "./contract.mjs";
import { approvedTrialPlan, latestOutcomeSpecForContract, parseOutcomeSpecText } from "./outcome-spec.mjs";
import { readAgentResultReadiness } from "./result-readiness.mjs";
import { workspaceRevision } from "./workspace-revision.mjs";
import { writeLifecycleReport } from "./lifecycle-report.mjs";

const scalar = value => JSON.stringify(redactSensitiveText(String(value || "unknown")).replace(/[\r\n]+/g, " "));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function prepareDirectory(root, directory) {
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("handoff_output_outside_instance");
  let current = root;
  for (const part of ["", ...relative.split(path.sep)].filter((item, i) => item || i === 0)) {
    current = path.join(current, part);
    if (existsSync(current)) { const info = lstatSync(current); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("handoff_output_unsafe"); }
    else mkdirSync(current);
  }
}

export function firstScenarioForHandoff(kind, { data, parsed, plan, manifest }) {
  const general = plan?.demo?.length ? plan.demo.map((step, index) => `${index + 1}. ${step}`).join("\n") : "Сначала подготовьте и одобрите конкретный demo script в Outcome Spec.";
  const headless = parsed?.headless;
  const headlessContract = headless ? `\n- Триггер: ${headless.trigger}\n- Вход: ${headless.inputContract}\n- Выход: ${headless.outputArtifacts}\n- Ошибки и exit codes: ${headless.failureVisibility}\n- Наблюдаемость: ${headless.observability}\n` : "";
  const intro = {
    "one-shot-cli": "CLI запускается по запросу из каталога агента. Выполните точную команду из одобренного сценария; постоянный процесс и URL не требуются.",
    "service": `Сервис использует выбранный manager: ${manifest?.control_center_runtime?.manager || data.serviceMode || "не подготовлен"}. Start/stop выполняются только через его reviewed operations contract и отдельное разрешение.`,
    "job-runner": `Первый запуск job выполняется вручную по одобренному trigger. Выбранная проактивность: ${data.proactiveMode || "none"}. Расписание не включается подготовкой handoff.`,
    "tool-server": "Откройте выбранный consumer, подключите согласованный transport и выполните указанный вызов инструмента. Подготовка handoff не меняет MCP permissions.",
    "library": "Используйте библиотеку из указанного в Outcome consumer. Выполните пример импорта/вызова и проверьте возвращаемый результат.",
    "interactive-agent": `Откройте выбранный интерфейс ${data.primaryInterface || "из контракта"} и выполните одобренный диалоговый пример.`,
  }[kind] || "Тип результата требует уточнения в authored contract; обнаруженные файлы не заменяют это решение.";
  const examples = parsed?.userFacing?.sessions?.map(item => `### ${item.name}\n\n\`\`\`text\n${item.transcript}\n\`\`\``).join("\n\n") || "";
  const healthArgv = manifest?.healthcheck_argv;
  return `${intro}\n${headlessContract}\n${general}\n\n${examples}${Array.isArray(healthArgv) ? `\n\nHealth argv (проверка запуска, отдельно от результата): ${JSON.stringify(healthArgv)}` : ""}`;
}

export function prepareAuthoredHandoff(target, options = {}) {
  const root = path.resolve(options.root || resolveTechscopeRoot()), input = { ...options, root, fresh: true };
  const memoryRoot = resolvePrithaAgentMemoryRoot(input);
  const agent = findCatalogAgent(readAgentCatalog(input), target);
  if (!agent?.agentId || !agent.contractSource) return null;
  if (agent.identityStatus === "conflict" || !agent.projectPath) throw new Error("handoff_identity_conflict");
  const contract = readCatalogArtifact(agent, agent.contractSource, input);
  if (!/^status: accepted$/m.test(contract)) throw new Error("handoff_accepted_contract_required");
  const data = contractData(agent.contractSource, { root }), revision = workspaceRevision(agent.projectPath, { requireComplete: true });
  const selected = latestOutcomeSpecForContract(agent.contractSource, input);
  let plan = null, parsed = null;
  if (selected?.path) {
    try { plan = approvedTrialPlan(selected.path, input); parsed = parseOutcomeSpecText(readIdentityEvidence(path.resolve(root, selected.path), memoryRoot)); }
    catch { /* A guide may explain pending approval, never manufacture it. */ }
  }
  const operation = readAgentOperationsManifest(agent), applicability = agentOperationsApplicability(agent, operation.manifest, input);
  const readiness = readAgentResultReadiness(agent.agentId, input);
  const childTests = readAgentTestResult(agent.agentId, input);
  const date = new Date().toISOString().slice(0, 10), profiles = path.join(memoryRoot, "profiles"), reports = path.join(memoryRoot, "reports");
  const profilePath = agent.artifacts.find(item => item.type === "child-agent-profile")?.path || path.join(profiles, `${agent.agentId}.md`);
  prepareDirectory(path.dirname(memoryRoot), profiles); prepareDirectory(path.dirname(memoryRoot), reports);
  const context = { ...input, projectRoot: agent.projectPath, instanceKey: agent.instanceKey };
  return withFileLock(path.join(profiles, `${agent.agentId}.handoff`), () => {
    let profileText = readIdentityEvidence(profilePath, memoryRoot);
    let profileCreated = false;
    const profileIdentity = authoredAgentId(parseFrontmatterData(profileText) || {});
    if (existsSync(profilePath) && (!profileText || profileIdentity.issue || profileIdentity.id !== agent.agentId)) throw new Error("handoff_profile_identity_conflict");
    if (!profileText) {
      const written = writeLifecycleReport(profilePath, ({ artifactId }) => `---\nid: ${artifactId}\ntype: child-agent-profile\nstatus: active\ncreated: ${date}\nupdated: ${date}\nagent_id: ${agent.agentId}\ninstance_key: ${agent.instanceKey}\ncontract_path: ${scalar(path.relative(root, agent.contractSource))}\ncontract_fingerprint: ${data.fingerprint}\nproject_path: ${scalar(path.relative(root, agent.projectPath))}\nmission: ${scalar(data.primaryMission)}\ntopics: [child-agent, handoff]\ntools: [Pritha]\nsources:\n  - ${scalar(path.relative(root, agent.contractSource))}\nrelated:\n  workflows: [07_workflows/agents-mother.md]\nsupersedes: []\nsuperseded_by: []\nmemory_domain: child-agents\nsubject:\n  kind: child-agent\n  id: ${agent.agentId}\nprivacy: local-private\nretention: durable\nreview_status: derived-from-accepted-contract\nconfidence: high\n---\n\n# ${data.agentName}\n\n## Purpose\n\n${data.primaryMission}\n\nThis authored profile is derived from the accepted contract. It is not verification or acceptance evidence.\n`, context);
      profileText = readIdentityEvidence(written.path, memoryRoot); profileCreated = true;
    }
    const key = hash({ agentId: agent.agentId, instance: agent.instanceKey, contract: data.fingerprint, revision, plan,
      profile: hash(profileText), manifest: operation.manifest, manifestIssue: operation.issue, readiness, childTests });
    const previous = agent.artifacts.find(item => item.type === "agent-handoff-report" && item.fm?.handoff_digest === key);
    if (previous && readCatalogArtifact(agent, previous.path, input)) return { reportPath: previous.path, profilePath, profileCreated, unchanged: true, readiness, status: "guide-prepared" };
    const scenario = firstScenarioForHandoff(agent.agentKind.kind, { data, plan, parsed, manifest: operation.manifest });
    const written = writeLifecycleReport(path.join(reports, `${date}-${agent.agentId}-agent-handoff-${key.slice(0, 12)}.md`), ({ artifactId }) => `---\nid: ${artifactId}\ntype: agent-handoff-report\nstatus: guide-prepared\ncreated: ${date}\nupdated: ${date}\nagent_id: ${agent.agentId}\ninstance_key: ${agent.instanceKey}\ncontract_path: ${scalar(path.relative(root, agent.contractSource))}\ncontract_fingerprint: ${data.fingerprint}\nproject_path: ${scalar(path.relative(root, agent.projectPath))}\nhandoff_digest: ${key}\ntopics: [agent-engineering, handoff]\ntools: [Pritha]\nsources:\n  - ${scalar(path.relative(root, agent.contractSource))}\nrelated:\n  workflows: [07_workflows/agents-mother.md]\nsupersedes: []\nsuperseded_by: []\nmemory_domain: child-agents\nsubject:\n  kind: child-agent\n  id: ${agent.agentId}\nprivacy: local-private\nretention: durable\nreview_status: prepared\nconfidence: medium\n---\n\n# Передача ${data.agentName}\n\nТип: ${agent.agentKind.kind}. Этот документ подготавливает первый сценарий; приёмка выполняется отдельно.\n\n## Состояние результата\n\n- Проверка canonical project: ${readiness.verification.status}\n- Candidate: ${readiness.candidate.status}\n- Приёмка: ${readiness.acceptance.status}\n- Git HEAD: ${revision.head || "unknown"}\n- Approved Outcome: ${plan?.spec_id || "не подготовлен"}\n- Operations manifest: ${operation.issue || (applicability.manifestRequired === false ? "не требуется выбранным контрактом" : operation.present ? "присутствует" : "требуется подготовка выбранного operations adapter")}\n\n## Первый сценарий\n\n${scenario}\n\n## Проверки результата\n\n- npm test: ${childTests.status}${childTests.status === "pass" ? "" : " — warning; handoff continues"}. Это не Outcome verification или приёмка.\n\n${plan?.trials.map(trial => `- ${trial.id}: ${trial.kind}; ${trial.argv ? JSON.stringify(trial.argv) : trial.passCriteria}`).join("\n") || "Нужен approved Outcome с конкретными Trials."}\n\nИзменение executable или locked inputs требует свежей verification. Authored profile и проект не перезаписываются handoff. Отсутствующие operations metadata готовятся выбранным scaffold adapter и проходят отдельную verification; handoff не назначает service mode и не создаёт healthcheck по догадке.\n`, context);
    return { reportPath: written.path, profilePath, profileCreated, unchanged: false, readiness, status: "guide-prepared" };
  });
}
