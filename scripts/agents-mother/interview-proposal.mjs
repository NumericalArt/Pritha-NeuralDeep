// Shared document proposal logic. No CLI initialization, scaffold assets or process execution.
import path from "node:path";
import { createHash } from "node:crypto";
import { redactSensitiveText } from "../lib/redaction.mjs";
import { slug as makeSlug } from "../lib/slug.mjs";
import { today } from "../lib/date.mjs";
import { yamlList } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentParent, resolveTechscopeRoot } from "../lib/paths.mjs";
import { AUTOSTART_MODES, PROACTIVE_MODES, RUNTIME_FAMILIES, RUNTIME_PLACEMENT_PROFILES, SERVICE_MODES } from "./contract.mjs";
import { CONTRACT_SCHEMA_VERSION, proposeAgentKind } from "./agent-kind.mjs";
import { INTERVIEW_PRESETS, interviewBriefOptions, parseInterviewBrief } from "./interview-brief.mjs";
const ROOT=resolveTechscopeRoot();
const slug=(value,fallback="agent")=>makeSlug(value,{fallback});

export function listFromText(value, fallback = []) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function bulletList(items) {
  const list = Array.isArray(items) && items.length > 0 ? items : ["TBD"];
  return list.map((item) => `- ${markdownText(item)}`).join("\n");
}

export function scalar(value, fallback = "TBD") {
  const text = redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim();
  return text || redactSensitiveText(String(fallback || "")).replace(/\s+/g, " ").trim();
}

export function yamlScalar(value) {
  return JSON.stringify(redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim() || "none");
}

export function markdownText(value, max = 2000) {
  const text = redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim();
  const bounded = text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
  return bounded
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replaceAll("|", "&#124;");
}

export function normalizeServiceMode(value, fallback = "none") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback;
  if (text.includes("launchd")) return "launchd";
  if (text.includes("external") || text.includes("systemd") || text.includes("cloud")) return "external";
  if (text.includes("manual") || text.includes("service") || text.includes("long-running")) return "manual";
  if (SERVICE_MODES.has(text)) return text;
  return fallback;
}

export function normalizeAutostartMode(value, serviceMode = "none") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "disabled";
  if (text.includes("launchd") || text.includes("approval")) return "launchd-on-approval";
  if (text.includes("optional")) return "optional";
  if (text.includes("external") || serviceMode === "external") return "external";
  if (text.includes("disable") || text.includes("none") || text.includes("no")) return "disabled";
  if (AUTOSTART_MODES.has(text)) return text;
  return "disabled";
}

export function normalizeProactiveMode(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "none" || text.includes("manual")) return text.includes("manual") ? "manual" : "none";
  if (text.includes("queue")) return "queue-watcher";
  if (text.includes("event") || text.includes("webhook")) return "event-driven";
  if (text.includes("heart") || text.includes("pulse") || text.includes("\u043f\u0443\u043b\u044c\u0441")) return "heartbeat";
  if (text.includes("cron") || text.includes("chrono") || text.includes("\u0445\u0440\u043e\u043d\u043e\u0441") || text.includes("schedule")) return "scheduled";
  if (text.includes("hybrid") || text.includes("mixed")) return "hybrid";
  if (PROACTIVE_MODES.has(text)) return text;
  return "manual";
}

export function normalizeRuntimePlacementProfile(value, runtimeFamily = "codex-native") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    if (runtimeFamily === "local-model") return "local-first";
    if (runtimeFamily === "hybrid") return "hybrid";
    if (runtimeFamily === "api") return "deterministic-first";
    return "frontier-first";
  }
  if (text.includes("determin")) return "deterministic-first";
  if (text.includes("frontier") || text.includes("codex") || text.includes("cloud")) return "frontier-first";
  if (text.includes("local")) return "local-first";
  if (text.includes("hybrid") || text.includes("mixed")) return "hybrid";
  if (RUNTIME_PLACEMENT_PROFILES.has(text)) return text;
  return "unknown";
}

export function contractMarkdown(data) {
  const date = data.date || today();
  const agentSlug = data.technicalSlug || slug(data.agentName);
  const runtimeFamily = scalar(data.runtimeFamily, "codex-native");
  const telegramMode = scalar(data.telegramMode, "none");
  const primaryInterface = scalar(data.primaryInterface, "Codex project");
  const targetFolder = scalar(data.targetFolder, "sibling of Pritha");
  const serviceMode = normalizeServiceMode(data.serviceMode || data.service || "none");
  const autostart = normalizeAutostartMode(data.autostart || "disabled", serviceMode);
  const proactiveMode = normalizeProactiveMode(data.proactiveMode || "none");
  const agentKind = proposeAgentKind({ ...data, primaryInterface, serviceMode, proactiveMode });
  const skillNeeds = scalar(data.skillNeeds, "auto");
  const allowedSkillSources = scalar(data.allowedSkillSources, "local-only");
  const skillInstallMode = scalar(data.skillInstallMode, "recommend");
  const skillMutationPolicy = scalar(data.skillMutationPolicy, "read-only");
  const repositoryResearchPolicy = scalar(data.repositoryResearchPolicy, "auto");
  const repositoryResearchTopics = scalar(data.repositoryResearchTopics, "auto from contract and pattern pack");
  const repositoryAdoptionMode = scalar(data.repositoryAdoptionMode, "none");
  const runtimePlacementProfile = normalizeRuntimePlacementProfile(data.runtimePlacementProfile, runtimeFamily);
  const multiModelRoutingRequested = scalar(data.multiModelRoutingRequested, "only-if-needed");
  const localInferenceRequired = scalar(data.localInferenceRequired, runtimeFamily === "local-model" ? "required" : runtimeFamily === "hybrid" ? "optional" : "later");
  const presetProduct = ["local-feed", "llm-app"].includes(data.interviewPreset);
  const runtimeMatrix = presetProduct ? `| Task class | Runtime class | Candidate | Evidence | Fallback | Check |
| --- | --- | --- | --- | --- | --- |
| Product input, storage, UI and health | deterministic local | Node.js HTTP; ${scalar(data.memoryModel)} | runtime/source research required before scaffold | preserve last successful data and retry manually | independent source, persistence and lifecycle Trials |
${data.interviewPreset === "llm-app" ? "| Product model operation | instance-bound NeuralDeep | model selected in Pritha | provider capability and API research required before scaffold | no automatic alternative provider; show error and retry | successful response, provider failure and invalid format Trials |\n" : ""}
Planning, coding and verification belong to Pritha's creation workflow. The child does not acquire those model routes or extra audio/embedding capabilities.` : `| Task class | Runtime class | Current candidate | Verified | Recheck before scaffold | Fallback | Eval fixture | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Planning | ${scalar(data.planningRuntime, "frontier-hosted")} | ${scalar(data.planningCandidate, "TBD current model")} | ${date} | yes | human/manual | ${scalar(data.planningEval, "TBD")} | architecture and workflow discovery |
| Coding | ${scalar(data.codingRuntime, "Codex/frontier-hosted")} | ${scalar(data.codingCandidate, "TBD current model")} | ${date} | yes | human/manual | ${scalar(data.codingEval, "TBD")} | code changes and tests |
| Extraction | ${scalar(data.extractionRuntime, "frontier-hosted")} | ${scalar(data.extractionCandidate, "TBD current model")} | ${date} | yes | small-hosted/local | ${scalar(data.extractionEval, "TBD")} | move only after schemas stabilize |
| Summarization | ${scalar(data.summarizationRuntime, "frontier-hosted")} | ${scalar(data.summarizationCandidate, "TBD current model")} | ${date} | yes | small-hosted/local | ${scalar(data.summarizationEval, "TBD")} | check compression loss |
| Classification | ${scalar(data.classificationRuntime, "small-hosted/local")} | ${scalar(data.classificationCandidate, "TBD after eval")} | ${date} | yes | frontier-hosted | ${scalar(data.classificationEval, "TBD")} | good offload candidate |
| Transcription | ${scalar(data.transcriptionRuntime, "local/hosted-audio")} | ${scalar(data.transcriptionCandidate, "TBD current model")} | ${date} | yes | hosted-audio/local | ${scalar(data.transcriptionEval, "TBD")} | accuracy and language dependent |
| Embeddings | ${scalar(data.embeddingsRuntime, "local/small-hosted")} | ${scalar(data.embeddingsCandidate, "TBD current model")} | ${date} | yes | hosted | ${scalar(data.embeddingsEval, "TBD")} | good local candidate |
| Memory query | ${scalar(data.memoryQueryRuntime, "local/small-hosted")} | ${scalar(data.memoryQueryCandidate, "TBD after eval")} | ${date} | yes | frontier-hosted | ${scalar(data.memoryQueryEval, "TBD")} | privacy-sensitive |
| Security scan | ${scalar(data.securityScanRuntime, "frontier-hosted/specialized")} | ${scalar(data.securityScanCandidate, "TBD current model")} | ${date} | yes | manual | ${scalar(data.securityScanEval, "TBD")} | do not underpower high-risk checks |`;
  const tools = ["Codex", "AGENTS.md"];
  if (telegramMode !== "none" || primaryInterface.toLowerCase().includes("telegram")) tools.push("Telegram");
  if (runtimeFamily === "cli") tools.push("CLI");
  if (runtimeFamily === "api" && serviceMode === "process") tools.push("Node.js HTTP");
  else if (runtimeFamily === "api") tools.push("OpenAI Agents SDK");
  if (serviceMode === "launchd") tools.push("launchd");

  const report = `---
id: ${data.artifactId || `${date}-${agentSlug}-agent-contract`}
type: agent-contract
contract_schema_version: ${CONTRACT_SCHEMA_VERSION}
interview_brief_schema_version: 1
interview_preset: ${data.interviewPreset || "generic"}
outcome_trial_preset: ${data.interviewPreset === "llm-app" ? "llm-http-app-v1" : data.interviewPreset === "local-feed" && data.sourceFormat === "json" ? "public-json-feed-v1" : "none"}
init_request_fingerprint: ${data.initRequestFingerprint || "legacy"}
agent_kind: ${agentKind}
agent_id: agent-${createHash("sha256").update(data.artifactId || `${date}-${agentSlug}-agent-contract`).digest("hex").slice(0, 24)}
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - harness-engineering
  - ${agentSlug}
tools:${yamlList(tools)}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - ${yamlScalar(runtimeFamily)}
config_surfaces:
  - AGENTS.md
  - workflows
  - scripts
portability: codex-native
sources:
  - user-interview
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-runtime-placement.md
related:
  intakes: []
  briefs: []
  reviews: []
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-runtime-placement.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: ${date}
source_updated: ${date}
source_version: contract draft v2
retrieved: ${date}
verified: pending
valid_for: initial agent design
temporal_status: current
---

# Agent Project Contract: ${scalar(data.agentName, "agent-name")}

Date: ${date}
Status: draft

## Purpose

- Agent name: ${scalar(data.agentName)}
- Technical slug: ${agentSlug}
- Primary mission: ${scalar(data.primaryMission)}
- Target user: ${scalar(data.targetUser)}
- Success criteria: ${scalar(data.successCriteria)}
- Out of scope: ${scalar(data.outOfScope)}
- Product constraints: ${scalar((data.constraints || []).join("; "), "none specified")}

## Functional scope

### V1 core functions

${bulletList(data.coreFunctions)}

### Deferred functions

${bulletList(data.deferredFunctions)}

### Critical user workflows

${bulletList(data.criticalWorkflows)}

## Outcome delivery

- Outcome Spec required: yes
- Outcome approval policy: separate-explicit-user
- Build Git mode: ${scalar(data.buildGitMode, "disposable-worktree")}
- Build executor: ${scalar(data.buildExecutor, "codex-cli")}
- Trial backend policy: ${scalar(data.trialBackendPolicy, "local-or-codex-cli")}
- Build iteration budget: ${scalar(data.buildIterationBudget, "6")}
- Build elapsed budget ms: ${scalar(data.buildElapsedBudgetMs, "5400000")}
- Build token budget: ${scalar(data.buildTokenBudget, "1000000")}
- Build token budget confirmation: ${scalar(data.buildTokenBudgetConfirmation, "pending")}
- Repeated failure threshold: ${scalar(data.repeatedFailureThreshold, "3")}
- Autonomous effects denied: push, merge, deployment, service enablement, secret provisioning, Outcome Spec mutation, verifier mutation
- Acceptance policy: verified is distinct from accepted; operator-judged Trials require explicit user acceptance

## Runtime and interface

- Runtime family: ${runtimeFamily}
- Primary interface: ${primaryInterface}
- Secondary interfaces: ${scalar(data.secondaryInterfaces, "none")}
- Telegram mode: ${telegramMode}
- Expected hosting: ${scalar(data.expectedHosting, "local Mac")}

## Runtime placement

- Runtime placement profile: ${runtimePlacementProfile}
- Multi-model routing requested: ${multiModelRoutingRequested}
- Local inference required: ${localInferenceRequired}
- Local inference adapter: ${scalar(data.localInferenceAdapter, localInferenceRequired === "required" ? "TBD" : "none")}
- Provider fallbacks: ${scalar(data.providerFallbacks, "frontier hosted model or manual review")}
- Privacy routing rules: ${scalar(data.privacyRoutingRules, "do not send sensitive data to external providers unless explicitly allowed")}
- Model budget policy: ${scalar(data.modelBudgetPolicy, "TBD before production usage")}
- Route healthcheck: ${scalar(data.routeHealthcheck, "node scripts/smoke-test.mjs")}
- Route change log: ${scalar(data.routeChangeLog, "document changes in reports")}

${runtimeMatrix}

## Operations and service

- Deployment target: ${scalar(data.deploymentTarget || data.expectedHosting, "local Mac")}
- Deployment profile: ${scalar(data.deploymentProfile, "local-development")}
- Service mode: ${serviceMode}
- Autostart: ${autostart}
- Start command: ${scalar(data.startCommand, "node scripts/agent-cli.mjs status")}
- Stop command: ${scalar(data.stopCommand, serviceMode === "none" ? "not-applicable" : "manual stop; define before production")}
- Healthcheck command: ${scalar(data.healthcheckCommand, "node scripts/smoke-test.mjs")}
- Log path: ${scalar(data.logPath, "logs/")}
- Restart policy: ${serviceMode === "launchd" ? "launchd template may be generated, but installation requires explicit user approval" : "manual unless contract is updated"}

## Proactivity

- Proactive mode: ${proactiveMode}
- Trigger sources: ${scalar(data.triggerSources, proactiveMode === "none" ? "manual user request" : "TBD")}
- Schedule: ${scalar(data.schedule, proactiveMode === "scheduled" ? "TBD cron/launchd calendar interval" : "not-applicable")}
- Heartbeat interval: ${scalar(data.heartbeatInterval, proactiveMode === "heartbeat" ? "TBD" : "not-applicable")}
- Idle behavior: ${scalar(data.idleBehavior, "sleep until trigger")}
- User interruption policy: ${scalar(data.userInterruptionPolicy, "do not interrupt unless configured by user")}

## Skills and procedural memory

- Skill needs: ${skillNeeds}
- Allowed skill sources: ${allowedSkillSources}
- Skill install mode: ${skillInstallMode}
- Skill mutation policy: ${skillMutationPolicy}
- Installed skills: ${scalar(data.installedSkills, "none yet; research step may recommend local reviewed skills")}
- Candidate skills: ${scalar(data.candidateSkills, "to be filled by research")}
- External skill approval: ${scalar(data.externalSkillApproval, "external skills remain candidate-only until a dedicated pinned-bundle verification and approval workflow exists; approval text alone is insufficient")}
- Skill update policy: ${scalar(data.skillUpdatePolicy, "read-only for scaffold v1; update through Pritha audit")}
- Skill audit command: ${scalar(data.skillAuditCommand, "node scripts/skills-status.mjs")}

## Repository research and adoption

- Repository research policy: ${repositoryResearchPolicy}
- Repository research topics: ${repositoryResearchTopics}
- Repository research waiver reason: ${scalar(data.repositoryResearchWaiverReason, repositoryResearchPolicy === "not-applicable" ? "TBD: explain why repository discovery cannot affect this contract" : "not-applicable")}
- Selected GitHub repositories: ${scalar(data.selectedGitHubRepositories, "none")}
- Repository adoption mode: ${repositoryAdoptionMode}
- Selected repository module: ${scalar(data.selectedRepositoryModule, "not-applicable")}
- Repository pin: ${scalar(data.repositoryPin, "pending")}
- Repository license decision: ${scalar(data.repositoryLicenseDecision, "pending")}
- Repository security review: ${scalar(data.repositorySecurityReview, "pending")}
- Repository permissions: ${scalar(data.repositoryPermissions, "pending")}
- Repository eval status: ${scalar(data.repositoryEvalStatus, "pending")}
- Repository user approval: ${scalar(data.repositoryUserApproval, "pending")}

Discovery produces advisory candidates only. It never authorizes cloning, installation, execution, vendoring or registry mutation. Reference-only use requires current evidence bound to every exact selected repository. In selected-module v1, the module must be a verified directory tree at the immutable pin and carry module-local LICENSE/manifest evidence whose Git blob SHA, SHA-256 content identity and detected SPDX identifier are bound to that pin. GitHub HEAD license metadata is advisory only. Every adoption field, current evidence item and memory synthesis must pass before scaffold.

## Harness inventory

- Information boundaries: ${scalar(data.informationBoundaries)}
- Runtime placement: ${runtimePlacementProfile}; local inference ${localInferenceRequired}; fallbacks ${scalar(data.providerFallbacks, "frontier hosted model or manual review")}
- Tool system: ${scalar(data.toolSystem)}
- Execution orchestration: ${scalar(data.executionOrchestration)}
- Memory and state: ${scalar(data.memoryAndState)}
- Evaluation and observability: ${scalar(data.evaluationAndObservability)}
- Constraints, validation and recovery: ${scalar(data.constraintsValidationRecovery)}
- Human approval gates: ${scalar(data.humanApprovalGates)}
- Completion criteria: ${scalar(data.completionCriteria)}

## Data, memory and sources

- Input data types: ${scalar(data.inputDataTypes)}
- Stored data: ${scalar(data.storedData)}
- Sensitive data: ${scalar(data.sensitiveData)}
- Memory model: ${scalar(data.memoryModel, "Markdown-first")}
- Indexing/search needs: ${scalar(data.indexingSearchNeeds, "none for v1 unless contract is updated")}
- External verification needs: ${scalar(data.externalVerificationNeeds, "Pritha memory plus current official docs before scaffold")}
- Source freshness requirements: ${scalar(data.sourceFreshnessRequirements, "verify volatile platform/API choices before scaffold")}
- Product data sources: ${scalar((data.sources || []).join("; "), "none specified")}
- Source format: ${scalar(data.sourceFormat, "contract-selected")}
- Provider binding: ${scalar(data.providerBinding, "not-applicable")}

## Tools and integrations

| Capability | Default boundary | Notes |
| --- | --- | --- |
| Project files and local checks | CLI/script | Default for Codex-native scaffold |
| Agent operating procedure | skill/workflow | Encode repeatable Pritha rules |
| External services | MCP/API | Only when contract requires auth/service boundary |
| Rendered or visual checks | browser/manual | Use when UI or dynamic pages matter |

## Security and permissions

- Secrets required: ${scalar(data.secretsRequired, telegramMode === "none" ? "none known yet" : "Telegram bot token and allowed user id through .env")}
- \`.env.example\` variables: ${scalar(data.envExampleVariables, telegramMode === "none" ? "TBD" : "TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_IDS")}
- Allowed network access: ${scalar(data.allowedNetworkAccess)}
- Allowed filesystem access: ${scalar(data.allowedFilesystemAccess, "agent project folder only by default")}
- User authorization model: ${scalar(data.userAuthorizationModel, telegramMode === "none" ? "local operator" : "one-user allowlist by Telegram user id")}
- Risk notes: ${scalar(data.riskNotes)}

## Scaffold requirements

- Target folder: ${targetFolder}
- Files to generate: ${scalar(data.filesToGenerate, "AGENTS.md, README.md, .env.example, workflow notes, scripts, smoke test, user training guide")}
- Dependencies: ${scalar(data.dependencies, "minimal until scaffold profile is selected")}
- Setup commands: ${scalar(data.setupCommands)}
- Run commands: ${scalar(data.runCommands)}
- Tests/healthchecks: ${scalar(data.testsHealthchecks, "structure validation and smoke test")}
- User training guide: ${scalar(data.userTrainingGuide, "first exercise proving the main v1 function")}

## Research basis

- Related Pritha artifacts: 07_workflows/agents-mother.md; 04_standards/agent-creation-harness.md; 04_standards/agent-runtime-placement.md; 04_standards/agent-environment-compatibility.md; 04_standards/agent-tool-integration-selection.md
- Pritha memory searches performed: pending
- Pattern pack: pending
- Semantic/embedding memory status: pending
- Semantic failure log: none
- Current primary sources checked: pending
- Trusted secondary sources checked: pending
- Pattern-derived external research seeds: pending
- Alternatives considered: ${scalar(data.alternativesConsidered, "pending research step")}
- Decision rationale: ${scalar(data.decisionRationale, "pending research step")}

## Acceptance checklist

- [ ] Contract reviewed with user.
- [ ] Separate Outcome Spec reviewed and explicitly approved by user.
- [ ] Every V1 core function and required deliverable is covered by a Trial.
- [x] Runtime family selected.
- [x] Runtime placement selected.
- [x] Interface mode selected.
- [x] Telegram need explicitly decided.
- [ ] Harness inventory complete.
- [ ] Security model documented.
- [ ] Tests/healthchecks defined.
- [ ] Handoff/training plan defined.
`;
  return report;
}

export function parseInterviewBriefDecisions(text) {
  const brief = parseInterviewBrief(text);
  const cliOptions = interviewBriefOptions(brief);
  return {
    brief, cliOptions,
    data: {
      agentName: brief.identity.name, technicalSlug: brief.identity.slug,
      primaryMission: brief.goal, targetUser: brief.user,
      successCriteria: brief.successCriteria.join("; "), outOfScope: brief.nonGoals.join("; "),
      coreFunctions: brief.coreFunctions, criticalWorkflows: brief.workflows,
      sources: brief.sources, constraints: brief.constraints,
      allowedNetworkAccess: brief.permissions.network.join("; "),
      allowedFilesystemAccess: brief.permissions.filesystem.join("; "),
      userAuthorizationModel: brief.permissions.authorization,
      ...brief.technical,
    },
  };
}

export function interviewPresetOptions(options = {}) {
  const preset = options.preset || "generic";
  if (!INTERVIEW_PRESETS.has(preset)) throw new Error("Invalid interview preset; use generic, local-feed, or llm-app");
  if (options["source-format"] && !["json", "rss", "atom", "mixed"].includes(options["source-format"])) throw new Error("Invalid source format; use json, rss, atom, or mixed");
  if (preset === "generic") return options;
  if ((options.runtime && options.runtime !== "api") || (options.service && options.service !== "process") || (options.interface && !/^(?:web|api)$/i.test(options.interface))) {
    throw new Error("The selected interview preset requires api runtime, process service, and web/API interface; use generic for another architecture");
  }
  const base = { runtime: "api", service: "process", interface: "web", "runtime-placement": preset === "local-feed" ? "deterministic-first" : "hybrid",
    "multi-model": "no", "local-inference": "not-required", "skill-needs": "none",
    fallbacks: "none; retain saved data, show a clear error and allow an explicit manual retry",
    memory: preset === "llm-app" ? "SQLite" : "local durable JSON records",
    stored: "Product records and user selections in the declared local store; no provider credentials",
    inputs: "Declared external sources and explicit UI input",
    sensitive: "Product history and preferences remain local; provider credentials stay with Pritha",
  };
  if (preset === "local-feed") Object.assign(base, {
    "repository-policy": "not-applicable", "repository-topics": "none",
    "repository-waiver": "Explicit local-feed preset uses standard local HTTP and feed processing; repository discovery is unnecessary. Runtime, source API, and operations evidence remain required.",
  });
  if (preset === "llm-app") Object.assign(base, {
    "repository-policy": "auto", tools: "local HTTP endpoints plus instance-bound NeuralDeep provider adapter",
    "provider-binding": "instance-bound NeuralDeep provider; secrets stay with the provider host; validate provider readiness before paid execution",
  });
  return { ...base, ...options };
}

function applyApiProcessContractDefaults(data, options = {}) {
  if (data.runtimeFamily !== "api" || data.serviceMode !== "process") return;
  if (!options["runtime-placement"] && !options.placement) data.runtimePlacementProfile = "deterministic-first";
  if (!options.start) data.startCommand = "node scripts/service-control.mjs start";
  if (!options.stop) data.stopCommand = "node scripts/service-control.mjs stop";
  if (!options.healthcheck) data.healthcheckCommand = "node scripts/healthcheck.mjs";
  if (!options.tests) data.testsHealthchecks = "Independent Outcome Trials; read-only GET /health for process health; refresh is a separate mutating action";
}

export function applyInterviewTechnicalProposal(data, options = {}) {
  options = interviewPresetOptions(options);
  data.interviewPreset = options.preset || "generic";
  data.sourceFormat = options["source-format"] || "";
  data.technicalSlug = options.slug || data.technicalSlug || slug(data.agentName);
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(data.technicalSlug)) throw new Error("Invalid technical slug");
  data.sources = options.sources && options.sources !== data.sources?.join("; ") ? listFromText(options.sources) : data.sources || [];
  data.constraints = options.constraints && options.constraints !== data.constraints?.join("; ") ? listFromText(options.constraints) : data.constraints || [];
  data.allowedNetworkAccess = options["allowed-network"] || data.allowedNetworkAccess;
  data.allowedFilesystemAccess = options["allowed-filesystem"] || data.allowedFilesystemAccess;
  data.userAuthorizationModel = options.authorization || data.userAuthorizationModel;
  data.providerBinding = options["provider-binding"] || data.providerBinding;
  data.coreFunctions = Array.isArray(data.coreFunctions) && data.coreFunctions.length
    ? data.coreFunctions
    : listFromText(options.core, [data.primaryMission || "TBD"]);
  data.deferredFunctions = Array.isArray(data.deferredFunctions) && data.deferredFunctions.length
    ? data.deferredFunctions
    : listFromText(options.deferred, [data.outOfScope || "TBD"]);
  data.criticalWorkflows = Array.isArray(data.criticalWorkflows) && data.criticalWorkflows.length
    ? data.criticalWorkflows
    : listFromText(options.workflows, ["Request the outcome, review evidence, then correct or accept the result"]);
  data.runtimeFamily = options.runtime && RUNTIME_FAMILIES.has(options.runtime) ? options.runtime : "codex-native";
  data.runtimeCoercedFrom = options.runtime && !RUNTIME_FAMILIES.has(options.runtime) ? options.runtime : undefined;
  data.agentKind = options["agent-kind"];
  data.primaryInterface = options.interface || data.primaryInterface || "Codex project";
  data.secondaryInterfaces = options.secondary || "none";
  data.telegramMode = options.telegram || (String(data.primaryInterface).toLowerCase().includes("telegram") ? "primary-chat" : "none");
  data.expectedHosting = options.hosting || "local Mac";
  data.runtimePlacementProfile = options["runtime-placement"] || options.placement || "frontier-first";
  data.multiModelRoutingRequested = options["multi-model"] || "only-if-needed";
  data.localInferenceRequired = options["local-inference"] || "later";
  data.localInferenceAdapter = options["local-adapter"] || "none";
  data.providerFallbacks = options.fallbacks || "frontier hosted model or manual review";
  data.privacyRoutingRules = options.privacy || "do not send sensitive data to external providers unless explicitly allowed";
  data.modelBudgetPolicy = options.budget || "bounded per delivery run; measure before changing defaults";
  data.deploymentTarget = options.deployTarget || options["deployment-target"] || data.expectedHosting;
  data.deploymentProfile = options.deployProfile || options["deployment-profile"] || "local-development";
  data.serviceMode = options.service && SERVICE_MODES.has(options.service) ? options.service : "none";
  data.serviceModeCoercedFrom = options.service && !SERVICE_MODES.has(options.service) ? options.service : undefined;
  data.autostart = options.autostart && AUTOSTART_MODES.has(options.autostart) ? options.autostart : "disabled";
  data.autostartCoercedFrom = options.autostart && !AUTOSTART_MODES.has(options.autostart) ? options.autostart : undefined;
  data.healthcheckCommand = options.healthcheck || "node scripts/smoke-test.mjs";
  data.startCommand = options.start || "node scripts/agent-cli.mjs status";
  data.stopCommand = options.stop || "not-applicable";
  data.proactiveMode = options.proactive && PROACTIVE_MODES.has(options.proactive) ? options.proactive : "none";
  data.proactiveModeCoercedFrom = options.proactive && !PROACTIVE_MODES.has(options.proactive) ? options.proactive : undefined;
  data.triggerSources = options.triggers || "manual user request";
  data.schedule = options.schedule || "not-applicable";
  data.heartbeatInterval = options.heartbeat || "not-applicable";
  data.idleBehavior = options.idle || "sleep until trigger";
  data.skillNeeds = options["skill-needs"] || "auto";
  data.allowedSkillSources = options["skill-sources"] || "local-only";
  data.skillInstallMode = options["skill-install"] || "recommend";
  data.skillMutationPolicy = options["skill-mutation"] || "read-only";
  data.installedSkills = options["installed-skills"] || "none";
  data.repositoryResearchPolicy = options["repository-policy"] || "auto";
  data.repositoryResearchTopics = options["repository-topics"] || (data.repositoryResearchPolicy === "not-applicable" ? "none" : "auto from contract and pattern pack");
  data.repositoryResearchWaiverReason = options["repository-waiver"] || (data.repositoryResearchPolicy === "not-applicable"
    ? "TBD"
    : "not-applicable");
  data.selectedGitHubRepositories = options["github-repositories"] || "none";
  data.repositoryAdoptionMode = options["repository-adoption"] || "none";
  data.selectedRepositoryModule = options["repository-module"] || "not-applicable";
  data.repositoryPin = options["repository-pin"] || "pending";
  data.repositoryLicenseDecision = options["repository-license"] || "pending";
  data.repositorySecurityReview = options["repository-security"] || "pending";
  data.repositoryPermissions = options["repository-permissions"] || "pending";
  data.repositoryEvalStatus = options["repository-eval"] || "pending";
  data.repositoryUserApproval = options["repository-approval"] || "pending";
  data.inputDataTypes = options.inputs || "text and contract-selected files";
  data.storedData = options.stored || "Markdown artifacts and private run state";
  data.sensitiveData = data.sensitiveData || options.sensitive || "unknown; resolve before production use";
  data.memoryModel = options.memory || "Markdown-first";
  data.toolSystem = options.tools || "minimal structured CLI/script tools";
  data.executionOrchestration = options.orchestration || "outcome-driven build, independent Trials and typed blockers";
  data.testsHealthchecks = options.tests || "Outcome Trials plus structure validation and smoke test";
  data.userTrainingGuide = options.training || "first exercise demonstrating and accepting the main V1 outcome";
  data.targetFolder = options["target-folder"] ? path.resolve(String(options["target-folder"])) : path.join(resolvePrithaAgentParent({ root: ROOT }), data.technicalSlug);
  data.buildGitMode = options["build-git-mode"] || "disposable-worktree";
  data.buildExecutor = ["codex-app-server", "app-server"].includes(options["build-executor"])
    ? "codex-cli"
    : options["build-executor"] || "codex-cli";
  data.trialBackendPolicy = options["trial-backend-policy"] === "app-server-required"
    ? "codex-cli-required"
    : options["trial-backend-policy"] === "local-or-app-server"
      ? "local-or-codex-cli"
      : options["trial-backend-policy"] || "local-or-codex-cli";
  data.buildIterationBudget = options["build-iterations"] || "6";
  data.buildElapsedBudgetMs = options["build-elapsed-ms"] || "5400000";
  data.buildTokenBudget = data.buildTokenBudget || options["build-token-budget"] || "1000000";
  data.buildTokenBudgetConfirmation = data.buildTokenBudgetConfirmation || (
    options["build-token-budget"] && options["token-budget-confirmed-by"] === "user"
      ? "user"
      : "pending"
  );
  data.repeatedFailureThreshold = options["repeated-failure-threshold"] || "3";
  data.riskNotes = options.risks || data.riskNotes;
  applyApiProcessContractDefaults(data, options);
  if (["local-feed", "llm-app"].includes(data.interviewPreset)) {
    data.informationBoundaries ||= "External content is untrusted data; only declared sources, the local product UI and the authorized project directory are available";
    data.memoryAndState ||= `${data.memoryModel}: ${data.storedData}; preserve last successful data and validate writes before replacing it`;
    data.evaluationAndObservability ||= "Independent host Trials test actual behavior; source/provider results and errors are visible without exposing secrets";
    data.constraintsValidationRecovery ||= "Validate input and output, use bounded requests, preserve saved results on failure and offer explicit retry; no schedules or automatic provider fallback";
    data.humanApprovalGates ||= "Separate host approval of contract and Outcome; runtime actions through Pritha; personal acceptance remains a distinct user decision";
    data.completionCriteria ||= data.successCriteria;
    data.riskNotes ||= "Treat external text as data, bound response sizes and timeouts, avoid unsafe HTML, keep provider credentials out of source and browser, and retain saved data on errors";
    data.secretsRequired ||= data.interviewPreset === "llm-app" ? "Pritha-managed NeuralDeep binding only; no provider key copied to child source, documents or browser" : "none";
    data.envExampleVariables ||= "Non-secret local host, available port and storage configuration only";
    data.setupCommands ||= "npm install (only declared package dependencies); see generated README";
    data.runCommands ||= data.startCommand;
    data.routeHealthcheck ||= data.healthcheckCommand;
  }
  return data;
}
