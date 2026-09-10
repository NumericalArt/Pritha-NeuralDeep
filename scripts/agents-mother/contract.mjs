import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "../lib/paths.mjs";
import { normalizeGitHubRepositoryUrl, normalizeRepositoryModulePath } from "../lib/github-repository-radar.mjs";
import { authoredAgentId } from "./identity.mjs";
import { readAgentKind } from "./agent-kind.mjs";

export const RUNTIME_FAMILIES = new Set(["codex-native", "cli", "api", "local-model", "hybrid", "environment-specific"]);
export const TELEGRAM_MODES = new Set(["none", "primary-chat", "intake-channel", "notifications-only", "operator-control"]);
export const SERVICE_MODES = new Set(["none", "manual", "process", "launchd", "external"]);
export const AUTOSTART_MODES = new Set(["disabled", "optional", "launchd-on-approval", "external"]);
export const PROACTIVE_MODES = new Set(["none", "manual", "scheduled", "heartbeat", "event-driven", "queue-watcher", "hybrid"]);
export const RUNTIME_PLACEMENT_PROFILES = new Set(["deterministic-first", "frontier-first", "local-first", "hybrid", "unknown"]);
export const SKILL_NEEDS = new Set(["auto", "none", "selected"]);
export const SKILL_SOURCES = new Set(["local-only", "trusted-only", "external-with-approval"]);
export const SKILL_INSTALL_MODES = new Set(["recommend", "vendor", "link", "runtime-install"]);
export const SKILL_MUTATION_POLICIES = new Set(["read-only", "patch-with-approval", "agent-managed"]);
export const STATUS_VALUES = new Set(["draft", "accepted", "superseded"]);
export const REPOSITORY_RESEARCH_POLICIES = new Set(["auto", "required", "registry-only", "not-applicable"]);
export const REPOSITORY_ADOPTION_MODES = new Set(["none", "reference-only", "selected-module"]);
export const BUILD_GIT_MODES = new Set(["disposable-worktree", "no-git-in-place"]);
// Historical App Server values remain accepted only so existing contracts can be read and normalized.
export const BUILD_EXECUTORS = new Set(["codex-cli", "manual", "codex-app-server", "app-server"]);
export const TRIAL_BACKEND_POLICIES = new Set([
  "local-or-codex-cli",
  "codex-cli-required",
  "local-trusted-only",
  "local-or-app-server",
  "app-server-required",
]);
export const REPOSITORY_RESEARCH_SCOPES = new Set([
  "agent-harness",
  "agent-memory",
  "agent-evals",
  "mcp-tools",
  "agent-skills",
  "agent-interface",
  "agent-voice",
  "agent-operations",
]);
export const REPOSITORY_RESEARCH_TOPIC_SENTINELS = new Set([
  "auto",
  "auto from contract and pattern pack",
  "none",
]);

export function parseRepositoryResearchTopics(value) {
  const values = String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const invalid = values.filter((item) => (
    !REPOSITORY_RESEARCH_SCOPES.has(item)
    && !REPOSITORY_RESEARCH_TOPIC_SENTINELS.has(item)
  ));
  const sentinels = values.filter((item) => REPOSITORY_RESEARCH_TOPIC_SENTINELS.has(item));
  const scopes = values.filter((item) => REPOSITORY_RESEARCH_SCOPES.has(item));
  return {
    values,
    scopes: [...new Set(scopes)],
    invalid,
    ambiguous: sentinels.length > 1 || (sentinels.length > 0 && scopes.length > 0),
  };
}

export function bodyValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, "mi"));
  return match ? match[1].trim() : "";
}

export function sectionItems(text, heading) {
  const expected = String(heading || "").trim().toLowerCase();
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `### ${expected}`);
  if (start === -1) return [];
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{1,3}\s+/.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

export function isMissing(value) {
  return !value || value === "TBD" || value === "unknown" || value === "pending";
}

function invalidEnumIssue(label, allowedValues) {
  return `invalid ${label}. Expected: ${Array.from(allowedValues).join(", ")}`;
}

export function contractFingerprint(value) {
  const text = typeof value === "string" ? value : value?.text || "";
  const source = String(text).replace(/\r\n/g, "\n");
  const normalized = source.replace(/^---\n([\s\S]*?)\n---\n/, (_match, rawFrontmatter) => {
    const stableFrontmatter = rawFrontmatter
      .split("\n")
      .filter((line) => !/^(?:status|updated|review_status):\s*/.test(line))
      .join("\n");
    return `---\n${stableFrontmatter}\n---\n`;
  }).trimEnd();
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

function normalizedDecision(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function hasNegativeDecision(value) {
  return /\b(?:blocked|declined|denied|failed|incompatible|not|pending|provisional|rejected|revoked|tbd|unapproved|unknown|unresolved|without)\b/i.test(String(value || ""));
}

export function isRepositoryLicenseApproved(value) {
  const normalized = normalizedDecision(value);
  if (!normalized || hasNegativeDecision(normalized)) return false;
  const stopwords = new Set([
    "a", "an", "and", "approved", "accepted", "compatible", "decision",
    "is", "license", "licensed", "open", "source", "the", "with",
  ]);
  const hasIdentity = normalized
    .split(/\s+/)
    .some((token) => /[a-z]/.test(token) && token.length >= 2 && !stopwords.has(token));
  return hasIdentity && /\b(?:approved|compatible|accepted)\b/.test(normalized);
}

export function repositoryLicenseDecisionCovers(decision, license) {
  if (!isRepositoryLicenseApproved(decision)) return false;
  const normalizedLicense = String(license || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const normalizedDecision = String(decision || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (!normalizedLicense || /^(?:a|an|and|license|noassertion|unknown|unlicensed)$/.test(normalizedLicense)) return false;
  return ` ${normalizedDecision} `.includes(` ${normalizedLicense} `);
}

export function isRepositoryReviewPassed(value) {
  const normalized = normalizedDecision(value).replace(/ /g, "-");
  if (!normalized || hasNegativeDecision(normalized)) return false;
  return new Set(["approved", "accepted", "complete", "passed", "verified", "yes"]).has(normalized)
    || /^(?:security-|eval-)?(?:approved|accepted|passed|verified)$/.test(normalized);
}

export function isRepositoryPermissionsBounded(value) {
  const normalized = normalizedDecision(value);
  if (!normalized || /^(?:not applicable|pending|tbd|unknown)$/.test(normalized)) return false;
  if (/\b(?:pending|provisional|tbd|unknown|unreviewed|unresolved)\b/.test(normalized)) return false;
  if (/\b(?:not|except|enabled|false|optional)\b/.test(normalized)) return false;
  if (/^(?:none|no permissions|required permissions none|no permissions required)$/.test(normalized)) return true;
  if (normalized.includes("*") || /\b(?:all|any)\b/.test(normalized)) return false;
  const scopePattern = /\b(?:api|credential|database|deploy(?:ment)?|director(?:y|ies)|file|files|filesystem|memory|messaging|network|process|secret|secrets|shell|spend|telegram|tool|tools)\b/;
  const denyBoundaryPattern = /\b(?:denied?|disabled|none|no access)\b/;
  const positiveBoundaryPattern = /\b(?:allowlist(?:ed)?|bounded|only|read only|specific|write only)\b/;
  const concreteTargetPattern = /\b(?:github api|localhost|project folder|repository module)\b|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b|(?:^|\s)\/(?:[^\s,;]+)|\btool:[a-z0-9._-]+\b/;
  const segments = normalized.split(/[;,\n]+/).map((item) => item.trim()).filter(Boolean);
  const explicitlyBounded = segments.length > 0 && segments.every((segment) => {
    if (!scopePattern.test(segment)) return false;
    if (denyBoundaryPattern.test(segment)) return true;
    return positiveBoundaryPattern.test(segment) && concreteTargetPattern.test(segment);
  });
  return explicitlyBounded
    && !/\b(?:admin|administrator|all files|all permissions|any permission|full access|full filesystem|root|unbounded|unlimited|unrestricted)\b/.test(normalized)
    && !/\b(?:read|write|read write) all\b/.test(normalized)
    && !/(?:^|[,=:\s])(?:\*|any|all)(?:$|[,;\s])/.test(normalized);
}

export function isExplicitRepositoryApproval(value) {
  const normalized = normalizedDecision(value);
  if (!normalized || hasNegativeDecision(normalized) || /\b(?:no|pending|tbd|unknown)\b/.test(normalized)) return false;
  return normalized === "yes"
    || normalized === "explicit yes"
    || /\bexplicit(?:ly)? approved(?: by (?:the )?user)?\b/.test(normalized)
    || /\bapproved by (?:the )?user\b/.test(normalized)
    || /\buser (?:approved|confirmed)(?: adoption)?\b/.test(normalized);
}

export function isImmutableRepositoryPin(value) {
  const pin = String(value || "").trim();
  return /^(?:(?:commit|tree-sha):)?[a-f0-9]{40}$/i.test(pin);
}

export function canonicalRepositoryPin(value) {
  const pin = String(value || "").trim();
  if (!isImmutableRepositoryPin(pin)) return "";
  const sha = pin.replace(/^(?:commit|tree-sha):/i, "").toLowerCase();
  return /^tree-sha:/i.test(pin) ? `tree-sha:${sha}` : `commit:${sha}`;
}

export function printIssues(issues) {
  for (const issue of issues) console.error(`- ${issue}`);
}

export function validateContract(contractPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const print = options.print !== false;
  const fullPath = path.resolve(root, contractPath);
  const issues = [];

  if (!existsSync(fullPath)) {
    issues.push(`file not found: ${contractPath}`);
    if (print) printIssues(issues);
    return issues;
  }

  const text = readFileSync(fullPath, "utf8");
  const fm = parseFrontmatterData(text) || {};
  if (fm.type !== "agent-contract") issues.push('frontmatter "type" must be agent-contract');
  issues.push(...readAgentKind(text).issues.map(issue => `agent type: ${issue}`));
  if (authoredAgentId(fm).issue) issues.push(`agent identity: ${authoredAgentId(fm).issue}`);
  if (!STATUS_VALUES.has(fm.status)) issues.push(`status must be one of: ${Array.from(STATUS_VALUES).join(", ")}`);

  const runtime = bodyValue(text, "Runtime family");
  const runtimePlacement = bodyValue(text, "Runtime placement profile");
  const multiModelRouting = bodyValue(text, "Multi-model routing requested");
  const telegram = bodyValue(text, "Telegram mode");
  const serviceMode = bodyValue(text, "Service mode");
  const autostart = bodyValue(text, "Autostart");
  const proactiveMode = bodyValue(text, "Proactive mode");
  const skillNeeds = bodyValue(text, "Skill needs");
  const allowedSkillSources = bodyValue(text, "Allowed skill sources");
  const skillInstallMode = bodyValue(text, "Skill install mode");
  const skillMutationPolicy = bodyValue(text, "Skill mutation policy");
  const installedSkills = bodyValue(text, "Installed skills");
  const repositoryResearchPolicy = bodyValue(text, "Repository research policy");
  const repositoryResearchTopics = bodyValue(text, "Repository research topics");
  const repositoryAdoptionMode = bodyValue(text, "Repository adoption mode");
  const buildGitMode = bodyValue(text, "Build Git mode");
  const buildExecutor = bodyValue(text, "Build executor");
  const trialBackendPolicy = bodyValue(text, "Trial backend policy");
  const requiredLabels = [
    "Agent name",
    "Primary mission",
    "Target user",
    "Success criteria",
    "Runtime family",
    "Runtime placement profile",
    "Multi-model routing requested",
    "Local inference required",
    "Primary interface",
    "Telegram mode",
    "Target folder",
    "Tests/healthchecks",
    "User training guide",
  ];

  for (const label of requiredLabels) {
    if (isMissing(bodyValue(text, label))) issues.push(`missing or placeholder value: ${label}`);
  }

  if (runtime && !RUNTIME_FAMILIES.has(runtime)) {
    issues.push(invalidEnumIssue("Runtime family", RUNTIME_FAMILIES));
  }
  if (runtimePlacement && !RUNTIME_PLACEMENT_PROFILES.has(runtimePlacement)) {
    issues.push(invalidEnumIssue("Runtime placement profile", RUNTIME_PLACEMENT_PROFILES));
  }
  if (multiModelRouting && !["no", "yes", "only-if-needed"].includes(multiModelRouting)) {
    issues.push("invalid Multi-model routing requested. Expected: no, yes or only-if-needed");
  }
  if (telegram && !TELEGRAM_MODES.has(telegram)) {
    issues.push(invalidEnumIssue("Telegram mode", TELEGRAM_MODES));
  }
  if (serviceMode && !SERVICE_MODES.has(serviceMode)) {
    issues.push(invalidEnumIssue("Service mode", SERVICE_MODES));
  }
  if (autostart && !AUTOSTART_MODES.has(autostart)) {
    issues.push(invalidEnumIssue("Autostart", AUTOSTART_MODES));
  }
  if (proactiveMode && !PROACTIVE_MODES.has(proactiveMode)) {
    issues.push(invalidEnumIssue("Proactive mode", PROACTIVE_MODES));
  }
  if (skillNeeds && !SKILL_NEEDS.has(skillNeeds)) {
    issues.push(invalidEnumIssue("Skill needs", SKILL_NEEDS));
  }
  if (allowedSkillSources && !SKILL_SOURCES.has(allowedSkillSources)) {
    issues.push(invalidEnumIssue("Allowed skill sources", SKILL_SOURCES));
  }
  if (skillInstallMode && !SKILL_INSTALL_MODES.has(skillInstallMode)) {
    issues.push(invalidEnumIssue("Skill install mode", SKILL_INSTALL_MODES));
  }
  if (skillMutationPolicy && !SKILL_MUTATION_POLICIES.has(skillMutationPolicy)) {
    issues.push(invalidEnumIssue("Skill mutation policy", SKILL_MUTATION_POLICIES));
  }
  if (skillNeeds === "selected") {
    const selectedSkillNames = installedSkills
      .split(/[;,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value && !/^(?:none|not-applicable|pending|tbd)$/.test(value));
    if (selectedSkillNames.length === 0) issues.push("Skill needs selected requires explicit Installed skills names");
    if (selectedSkillNames.some((name) => !/^[a-z0-9][a-z0-9-]*$/.test(name))) {
      issues.push("Installed skills must contain canonical lowercase kebab-case names only");
    }
    if (new Set(selectedSkillNames).size !== selectedSkillNames.length) issues.push("Installed skills must not contain duplicates");
  }
  if (repositoryResearchPolicy && !REPOSITORY_RESEARCH_POLICIES.has(repositoryResearchPolicy)) {
    issues.push(invalidEnumIssue("Repository research policy", REPOSITORY_RESEARCH_POLICIES));
  }
  const parsedRepositoryTopics = parseRepositoryResearchTopics(repositoryResearchTopics);
  if (parsedRepositoryTopics.invalid.length > 0) {
    issues.push("invalid Repository research topics. Use only documented allowlisted scopes or one sentinel value");
  }
  if (parsedRepositoryTopics.ambiguous) {
    issues.push("Repository research topics must use either allowlisted scopes or one sentinel value, not both");
  }
  if (repositoryAdoptionMode && !REPOSITORY_ADOPTION_MODES.has(repositoryAdoptionMode)) {
    issues.push(invalidEnumIssue("Repository adoption mode", REPOSITORY_ADOPTION_MODES));
  }
  if (buildGitMode && !BUILD_GIT_MODES.has(buildGitMode)) {
    issues.push(invalidEnumIssue("Build Git mode", BUILD_GIT_MODES));
  }
  if (buildExecutor && !BUILD_EXECUTORS.has(buildExecutor)) {
    issues.push(invalidEnumIssue("Build executor", BUILD_EXECUTORS));
  }
  if (trialBackendPolicy && !TRIAL_BACKEND_POLICIES.has(trialBackendPolicy)) {
    issues.push(invalidEnumIssue("Trial backend policy", TRIAL_BACKEND_POLICIES));
  }
  for (const [label, minimum] of [["Build iteration budget", 1], ["Build elapsed budget ms", 60_000], ["Repeated failure threshold", 2]]) {
    const raw = bodyValue(text, label);
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum) issues.push(`${label} must be an integer >= ${minimum}`);
  }
  const rawBuildTokenBudget = bodyValue(text, "Build token budget");
  const buildTokenConfirmation = bodyValue(text, "Build token budget confirmation");
  if (rawBuildTokenBudget) {
    const value = Number(rawBuildTokenBudget);
    if (!Number.isSafeInteger(value) || value < 1) issues.push("Build token budget must be a positive JavaScript-safe integer compatible with the Codex CLI usage ledger");
    if (!new Set(["user", "pending", "legacy-default"]).has(buildTokenConfirmation)) {
      issues.push("Build token budget confirmation must be user, pending, or legacy-default");
    }
    const contractStatus = String(fm.status || "").toLowerCase();
    const autonomousBuild = (buildExecutor || "codex-cli") !== "manual";
    if (contractStatus === "accepted" && autonomousBuild && buildTokenConfirmation === "pending") {
      issues.push("Accepted autonomous contract requires user-confirmed Build token budget");
    }
  }
  if (repositoryResearchPolicy === "not-applicable" && isMissing(bodyValue(text, "Repository research waiver reason"))) {
    issues.push("Repository research policy not-applicable requires Repository research waiver reason");
  }
  const repositoryValues = bodyValue(text, "Selected GitHub repositories")
    .split(/[;,\s]+/)
    .map((value) => value.trim())
    .filter((value) => value && !/^(?:none|not-applicable)$/i.test(value));
  if (repositoryValues.length > 10) {
    issues.push("Selected GitHub repositories supports at most 10 repositories");
  }
  if (new Set(repositoryValues.map((value) => value.replace(/\/$/, "").toLowerCase())).size !== repositoryValues.length) {
    issues.push("Selected GitHub repositories must not contain duplicates");
  }
  const repositoryAdoptionModeValid = REPOSITORY_ADOPTION_MODES.has(repositoryAdoptionMode);
  if (repositoryValues.length > 0 && !["reference-only", "selected-module"].includes(repositoryAdoptionMode)) {
    issues.push("Selected GitHub repositories require Repository adoption mode reference-only or selected-module");
  }
  if (repositoryAdoptionModeValid && repositoryAdoptionMode !== "none") {
    if (!repositoryValues.length) {
      issues.push(`Repository adoption mode ${repositoryAdoptionMode} requires Selected GitHub repositories`);
    } else if (repositoryValues.some((value) => normalizeGitHubRepositoryUrl(value)?.url !== value.replace(/\/$/, ""))) {
      issues.push("Selected GitHub repositories must contain canonical https://github.com/OWNER/REPO URLs only");
    }
    if (repositoryResearchPolicy === "not-applicable") {
      issues.push(`Repository research policy not-applicable is incompatible with ${repositoryAdoptionMode} adoption`);
    }
  }
  if (
    repositoryAdoptionMode === "selected-module"
    && (isMissing(bodyValue(text, "Selected GitHub repositories")) || /^(none|not-applicable)$/i.test(bodyValue(text, "Selected GitHub repositories")))
  ) {
    issues.push("Repository adoption mode selected-module requires Selected GitHub repositories");
  }
  if (repositoryAdoptionMode === "selected-module") {
    for (const label of [
      "Selected repository module",
      "Repository pin",
      "Repository license decision",
      "Repository security review",
      "Repository permissions",
      "Repository eval status",
      "Repository user approval",
    ]) {
      if (isMissing(bodyValue(text, label)) || /^not-applicable$/i.test(bodyValue(text, label))) {
        issues.push(`Repository adoption mode selected-module requires completed ${label}`);
      }
    }
    if (repositoryValues.length !== 1) {
      issues.push("Repository adoption mode selected-module supports exactly one selected GitHub repository in the v1 contract schema");
    }
    const pin = bodyValue(text, "Repository pin");
    if (!isImmutableRepositoryPin(pin)) {
      issues.push("Repository pin must be a verified 40-hex commit SHA or tree-sha:<40-hex-sha>; tags are not immutable");
    }
    const selectedModule = bodyValue(text, "Selected repository module");
    if (normalizeRepositoryModulePath(selectedModule) !== selectedModule) {
      issues.push("Selected repository module must be a safe repository-relative path without traversal, URL syntax, whitespace or placeholders");
    }
    if (!isRepositoryLicenseApproved(bodyValue(text, "Repository license decision"))) {
      issues.push("Repository license decision must explicitly record an approved compatible license");
    }
    if (!isRepositoryReviewPassed(bodyValue(text, "Repository security review"))) {
      issues.push("Repository security review must record a passing result");
    }
    if (!isRepositoryPermissionsBounded(bodyValue(text, "Repository permissions"))) {
      issues.push("Repository permissions must be explicit and bounded");
    }
    if (!isRepositoryReviewPassed(bodyValue(text, "Repository eval status"))) {
      issues.push("Repository eval status must record a passing result");
    }
    if (!isExplicitRepositoryApproval(bodyValue(text, "Repository user approval"))) {
      issues.push("Repository user approval must record explicit positive user approval");
    }
  }
  if (telegram && telegram !== "none") {
    const secrets = bodyValue(text, "Secrets required");
    const auth = bodyValue(text, "User authorization model");
    if (!/telegram/i.test(secrets)) issues.push("Telegram mode selected but Secrets required does not mention Telegram token");
    if (!/(allowlist|user id|allowed user|telegram)/i.test(auth)) issues.push("Telegram mode selected but User authorization model does not define Telegram allowlist/user id");
  }

  if (!text.includes("## Harness inventory")) issues.push("missing Harness inventory section");
  if (!text.includes("## Security and permissions")) issues.push("missing Security and permissions section");
  if (!text.includes("## Acceptance checklist")) issues.push("missing Acceptance checklist section");

  if (print) {
    if (issues.length === 0) {
      console.log(`Contract validation passed: ${path.relative(root, fullPath)}`);
    } else {
      console.error(`Contract validation failed: ${path.relative(root, fullPath)}`);
      printIssues(issues);
    }
  }
  return issues;
}

export function contractData(contractPath, options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const fullPath = path.resolve(root, contractPath);
  if (!existsSync(fullPath)) throw new Error(`Contract not found: ${contractPath}`);
  const text = readFileSync(fullPath, "utf8");
  const fm = parseFrontmatterData(text) || {};
  return {
    root,
    fullPath,
    relPath: path.relative(root, fullPath),
    text,
    fm,
    agentKind: readAgentKind(text),
    agentId: authoredAgentId(fm).id,
    agentName: bodyValue(text, "Agent name"),
    primaryMission: bodyValue(text, "Primary mission"),
    targetUser: bodyValue(text, "Target user"),
    successCriteria: bodyValue(text, "Success criteria"),
    outOfScope: bodyValue(text, "Out of scope"),
    technicalSlug: bodyValue(text, "Technical slug"),
    runtimeFamily: bodyValue(text, "Runtime family"),
    runtimePlacementProfile: bodyValue(text, "Runtime placement profile"),
    primaryInterface: bodyValue(text, "Primary interface"),
    secondaryInterfaces: bodyValue(text, "Secondary interfaces"),
    telegramMode: bodyValue(text, "Telegram mode"),
    expectedHosting: bodyValue(text, "Expected hosting"),
    deploymentTarget: bodyValue(text, "Deployment target"),
    deploymentProfile: bodyValue(text, "Deployment profile"),
    serviceMode: bodyValue(text, "Service mode") || "none",
    autostart: bodyValue(text, "Autostart") || "disabled",
    startCommand: bodyValue(text, "Start command"),
    stopCommand: bodyValue(text, "Stop command"),
    healthcheckCommand: bodyValue(text, "Healthcheck command"),
    logPath: bodyValue(text, "Log path"),
    restartPolicy: bodyValue(text, "Restart policy"),
    proactiveMode: bodyValue(text, "Proactive mode") || "none",
    triggerSources: bodyValue(text, "Trigger sources"),
    schedule: bodyValue(text, "Schedule"),
    heartbeatInterval: bodyValue(text, "Heartbeat interval"),
    idleBehavior: bodyValue(text, "Idle behavior"),
    userInterruptionPolicy: bodyValue(text, "User interruption policy"),
    skillNeeds: bodyValue(text, "Skill needs") || "auto",
    allowedSkillSources: bodyValue(text, "Allowed skill sources") || "local-only",
    skillInstallMode: bodyValue(text, "Skill install mode") || "recommend",
    skillMutationPolicy: bodyValue(text, "Skill mutation policy") || "read-only",
    installedSkills: bodyValue(text, "Installed skills"),
    candidateSkills: bodyValue(text, "Candidate skills"),
    externalSkillApproval: bodyValue(text, "External skill approval"),
    skillTrustedCatalogs: bodyValue(text, "Skill trusted catalogs"),
    skillSourcePinning: bodyValue(text, "Skill source pinning"),
    skillEvalPolicy: bodyValue(text, "Skill eval policy"),
    mcpNeeds: bodyValue(text, "MCP needs") || "auto",
    allowedMcpSources: bodyValue(text, "Allowed MCP sources") || "local-only",
    selectedMcpConnectors: bodyValue(text, "Selected MCP connectors"),
    candidateMcpConnectors: bodyValue(text, "Candidate MCP connectors"),
    repositoryResearchPolicy: bodyValue(text, "Repository research policy") || "auto",
    repositoryResearchTopics: bodyValue(text, "Repository research topics"),
    repositoryResearchWaiverReason: bodyValue(text, "Repository research waiver reason"),
    selectedGitHubRepositories: bodyValue(text, "Selected GitHub repositories"),
    repositoryAdoptionMode: bodyValue(text, "Repository adoption mode") || "none",
    selectedRepositoryModule: bodyValue(text, "Selected repository module"),
    repositoryPin: bodyValue(text, "Repository pin"),
    repositoryLicenseDecision: bodyValue(text, "Repository license decision"),
    repositorySecurityReview: bodyValue(text, "Repository security review"),
    repositoryPermissions: bodyValue(text, "Repository permissions"),
    repositoryEvalStatus: bodyValue(text, "Repository eval status"),
    repositoryUserApproval: bodyValue(text, "Repository user approval"),
    outcomeSpecRequired: bodyValue(text, "Outcome Spec required") || "yes",
    outcomeApprovalPolicy: bodyValue(text, "Outcome approval policy") || "separate-explicit-user",
    buildGitMode: bodyValue(text, "Build Git mode") || "disposable-worktree",
    buildExecutor: ["codex-app-server", "app-server"].includes(bodyValue(text, "Build executor"))
      ? "codex-cli"
      : bodyValue(text, "Build executor") || "codex-cli",
    trialBackendPolicy: bodyValue(text, "Trial backend policy") === "app-server-required"
      ? "codex-cli-required"
      : bodyValue(text, "Trial backend policy") === "local-or-app-server"
        ? "local-or-codex-cli"
        : bodyValue(text, "Trial backend policy") || "local-or-codex-cli",
    buildIterationBudget: Number(bodyValue(text, "Build iteration budget") || 6),
    buildElapsedBudgetMs: Number(bodyValue(text, "Build elapsed budget ms") || 5_400_000),
    buildTokenBudget: Number(bodyValue(text, "Build token budget") || 1_000_000),
    buildTokenBudgetConfirmation: bodyValue(text, "Build token budget confirmation") || "legacy-default",
    buildTokenBudgetSource: bodyValue(text, "Build token budget")
      ? (bodyValue(text, "Build token budget confirmation") || "pending")
      : "legacy-default",
    repeatedFailureThreshold: Number(bodyValue(text, "Repeated failure threshold") || 3),
    autonomousEffectsDenied: bodyValue(text, "Autonomous effects denied") || "push, merge, deployment, service enablement, secret provisioning, Outcome Spec mutation, verifier mutation",
    acceptancePolicy: bodyValue(text, "Acceptance policy") || "verified is distinct from accepted; operator-judged Trials require explicit user acceptance",
    memoryModel: bodyValue(text, "Memory model"),
    indexingSearchNeeds: bodyValue(text, "Indexing/search needs"),
    toolSystem: bodyValue(text, "Tool system"),
    inputDataTypes: bodyValue(text, "Input data types"),
    untrustedInputPolicy: bodyValue(text, "Untrusted input policy") || bodyValue(text, "untrusted_input_policy"),
    storedData: bodyValue(text, "Stored data"),
    sensitiveData: bodyValue(text, "Sensitive data"),
    targetFolder: bodyValue(text, "Target folder"),
    filesToGenerate: bodyValue(text, "Files to generate"),
    dependencies: bodyValue(text, "Dependencies"),
    setupCommands: bodyValue(text, "Setup commands"),
    runCommands: bodyValue(text, "Run commands"),
    testsHealthchecks: bodyValue(text, "Tests/healthchecks"),
    userTrainingGuide: bodyValue(text, "User training guide"),
    allowedNetworkAccess: bodyValue(text, "Allowed network access"),
    secretsRequired: bodyValue(text, "Secrets required"),
    envExampleVariables: bodyValue(text, "`.env.example` variables"),
    userAuthorizationModel: bodyValue(text, "User authorization model"),
    coreFunctions: sectionItems(text, "V1 core functions"),
    criticalWorkflows: sectionItems(text, "Critical user workflows"),
    fingerprint: contractFingerprint(text),
  };
}
