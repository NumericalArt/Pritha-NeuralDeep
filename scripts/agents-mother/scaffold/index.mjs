import { renderScaffoldTemplate } from "./template.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "../../lib/frontmatter.mjs";
import { normalizeGitHubRepositoryUrl, normalizeRepositoryModulePath } from "../../lib/github-repository-radar.mjs";
import { redactSensitiveText } from "../../lib/redaction.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaAgentParent, resolveTechscopeRoot } from "../../lib/paths.mjs";
import { readBoundedRegularFile } from "../../lib/safe-file-read.mjs";
import { slug as makeSlug } from "../../lib/slug.mjs";
import { today } from "../../lib/date.mjs";
import { AUTOSTART_MODES, PROACTIVE_MODES, RUNTIME_PLACEMENT_PROFILES, SERVICE_MODES, bodyValue, canonicalRepositoryPin, contractData, sectionItems, validateContract } from "../contract.mjs";
import { researchGateDecisionForReport } from "../research-gate.mjs";
import { verifyRepositoryResearchIntegrity } from "../github-research.mjs";
import { selectSkillsForContract, skillPolicyFor, skillRowForManifest } from "../skills.mjs";
import { newestArtifactPathsFirst } from "../artifact-selection.mjs";
import { writeLifecycleReport } from "../lifecycle-report.mjs";
import { latestOutcomeSpecForContract, verifyOutcomeApproval } from "../outcome-spec.mjs";
import { assertScaffoldCapability, scaffoldCapability } from "./capabilities.mjs";
import { withChildTests } from "./tests.mjs";
import { selectedScaffoldModules } from "./modules.mjs";
import { headlessCliFiles } from "./headless-cli.mjs";
import { apiProcessFiles, apiProcessManifest } from "./api-process.mjs";

const ROOT = resolveTechscopeRoot();
const AGENT_MEMORY_ROOT = resolvePrithaAgentMemoryRoot({ root: ROOT });
const REPORT_DIR = path.join(AGENT_MEMORY_ROOT, "reports");
const RESEARCH_DIR = path.join(AGENT_MEMORY_ROOT, "research");
const slug = (value, fallback = "agent") => makeSlug(value, { fallback });

function ensureDirs() {
  mkdirSync(REPORT_DIR, { recursive: true });
}

function bulletList(items) {
  const list = Array.isArray(items) && items.length > 0 ? items : ["TBD"];
  return list.map((item) => `- ${markdownValue(item, "TBD")}`).join("\n");
}

function scalar(value, fallback = "TBD") {
  const text = String(value || "").trim();
  return text || fallback;
}

function safeScalar(value, fallback = "TBD") {
  return redactSensitiveText(scalar(value, fallback));
}

function javascriptLiteral(value, fallback = "") {
  return JSON.stringify(safeScalar(value, fallback))
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function shellArgument(value, fallback = ".") {
  const text = safeScalar(value, fallback);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", `'"'"'`)}'`;
}

function xmlText(value, fallback = "") {
  return safeScalar(value, fallback)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeProjectRelativeDirectory(value, fallback = "logs/") {
  const raw = safeScalar(value, fallback).replace(/\/+$/, "");
  const segments = raw.split("/");
  if (
    !raw
    || raw.startsWith("/")
    || raw.includes("\\")
    || segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    return fallback;
  }
  return `${segments.join("/")}/`;
}

const SHELL_COMMAND_META_PATTERN = /[;&|<>`$\\'"()\n\r]/;

function commandArgvFromText(value) {
  const text = scalar(value, "");
  if (!text || SHELL_COMMAND_META_PATTERN.test(text)) return [];
  return text.split(/\s+/).filter(Boolean);
}

function yamlScalar(value) {
  return JSON.stringify(redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim() || "none");
}

function markdownValue(value, fallback = "not-applicable", max = 2000) {
  const raw = redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim() || fallback;
  const text = raw.length <= max ? raw : `${raw.slice(0, Math.max(0, max - 3)).trim()}...`;
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("|", "&#124;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;");
}

function normalizeInterfaceName(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "none") return "";
  if (/(realtime|voice|speech|microphone|audio|\u0433\u043e\u043b\u043e\u0441)/iu.test(text)) return "realtime-voice";
  if (text.includes("telegram")) return "telegram";
  if (text.includes("codex")) return "codex-project";
  if (text.includes("cli")) return "cli";
  if (text.includes("web")) return "web";
  if (text.includes("api")) return "api";
  return slug(text, "custom");
}

function selectedInterfaces(data) {
  const names = new Set(["cli"]);
  const primary = normalizeInterfaceName(data.primaryInterface);
  if (primary) names.add(primary);
  for (const item of String(data.secondaryInterfaces || "").split(/[;,]/)) {
    const name = normalizeInterfaceName(item);
    if (name) names.add(name);
  }
  if (data.telegramMode && data.telegramMode !== "none") names.add("telegram");
  if (usesRealtimeVoice(data)) names.add("realtime-voice");
  return [...names].sort();
}

function usesRealtimeVoice(data) {
  const text = [
    data.primaryInterface,
    data.secondaryInterfaces,
    data.interfaceMode,
    data.coreFunctions?.join(" "),
    data.criticalWorkflows?.join(" "),
    data.toolSystem,
  ].filter(Boolean).join(" ").toLowerCase();
  return /(realtime|voice|speech|microphone|audio|\u0433\u043e\u043b\u043e\u0441|\u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d)/iu.test(text);
}

function memoryProfileFor(data) {
  const memoryText = String(data.memoryModel || "").toLowerCase();
  if (data.runtimeFamily === "api" && data.serviceMode === "process" && memoryText.trim() === "ephemeral") return "ephemeral";
  const indexText = String(data.indexingSearchNeeds || "").toLowerCase();
  const text = `${memoryText} ${indexText}`;
  if (/(external|qdrant|lancedb|neo4j|kuzu|graph|vector)/.test(text)) return "external-or-specialized";
  if (/(embedding|semantic|\u0441\u0435\u043c\u0430\u043d\u0442\u0438\u0447\u0435\u0441|vector)/.test(text)) return "markdown-embeddings";
  if (/(sqlite|index|fts|search|\u043f\u043e\u0438\u0441\u043a)/.test(text)) return "markdown-sqlite";
  if (/(none|minimal|\u043d\u0435\u0442|\u0431\u0435\u0437 \u043f\u0430\u043c\u044f\u0442\u0438)/.test(memoryText)) return "minimal-markdown";
  return "markdown-first";
}

function memoryProfileDetails(profile) {
  const profiles = {
    ephemeral: {
      directories: [],
      description: "Bounded process-memory state only; no persistent memory, database, indexes or embeddings.",
      generated_files: ["memory/README.md", "memory/manifest.json"],
    },
    "minimal-markdown": {
      directories: ["memory/notes"],
      description: "Minimal Markdown notes. No database or embeddings by default.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep"],
    },
    "markdown-first": {
      directories: ["memory/notes", "memory/decisions"],
      description: "Markdown source of truth with lightweight notes and decisions.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/decisions/.gitkeep"],
    },
    "markdown-sqlite": {
      directories: ["memory/notes", "memory/decisions", "memory/index"],
      description: "Markdown source of truth with a documented SQLite sidecar placeholder.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/decisions/.gitkeep", "memory/index/README.md"],
    },
    "markdown-embeddings": {
      directories: ["memory/notes", "memory/decisions", "memory/index", "memory/embeddings"],
      description: "Markdown source of truth with placeholders for index and embeddings.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/decisions/.gitkeep", "memory/index/README.md", "memory/embeddings/README.md"],
    },
    "external-or-specialized": {
      directories: ["memory/notes", "memory/external"],
      description: "Markdown source of truth plus documented external/specialized memory integration.",
      generated_files: ["memory/README.md", "memory/manifest.json", "memory/notes/.gitkeep", "memory/external/README.md"],
    },
  };
  return profiles[profile] || profiles["markdown-first"];
}

function toolProfilesFor(data) {
  if (/^(none|нет|без инструментов)$/i.test(String(data.toolSystem || "").trim())) return [];
  const text = `${data.toolSystem || ""} ${data.primaryInterface || ""} ${data.telegramMode || ""}`.toLowerCase();
  const profiles = new Set(["cli-script", "workflow"]);
  const skillPolicy = skillPolicyFor(data);
  if (skillPolicy.skillNeeds !== "none") profiles.add("skill-pack");
  if (/(mcp|api|oauth|service|openai agents sdk)/.test(text)) profiles.add("mcp-api");
  if (/(browser|web|visual|rendered|manual)/.test(text)) profiles.add("browser-manual");
  if (data.telegramMode && data.telegramMode !== "none") profiles.add("telegram-adapter");
  if (usesRealtimeVoice(data)) profiles.add("realtime-voice-codex");
  return [...profiles].sort();
}

function toolProfileDetails(name) {
  const details = {
    "cli-script": {
      boundary: "CLI/script",
      purpose: "Local deterministic commands, file checks, smoke tests and repeatable project scripts.",
      risk: "Shell commands can mutate local files; keep commands narrow and documented.",
    },
    workflow: {
      boundary: "skill/workflow",
      purpose: "Project procedure and agent operating discipline.",
      risk: "Overlong workflow text can create context noise; keep rules concise.",
    },
    "skill-pack": {
      boundary: "codex-skill",
      purpose: "Reviewed reusable procedural knowledge loaded on demand from local SKILL.md files.",
      risk: "Skills can become stale or unsafe; keep provenance, hashes, candidates and mutation policy explicit.",
    },
    "mcp-api": {
      boundary: "MCP/API",
      purpose: "External services, auth-heavy integrations, SaaS APIs or remote execution.",
      risk: "Requires explicit credentials, version checks, auditability and least privilege.",
    },
    "browser-manual": {
      boundary: "browser/manual",
      purpose: "Rendered page inspection, visual QA and human judgment.",
      risk: "Can be slow or brittle; use only when rendered state matters.",
    },
    "telegram-adapter": {
      boundary: "interface adapter",
      purpose: "Telegram ingress, queueing and human-readable responses.",
      risk: "Requires token isolation, allowlist and queue/retry policy.",
    },
    "realtime-voice-codex": {
      boundary: "voice interface + server tools + Codex sidecar",
      purpose: "Live voice UX, narrow realtime tools and deep-task routing through Codex App/CLI/session transport.",
      risk: "Requires microphone/cost approval, server-side API key isolation, tool gates and failure handling.",
    },
  };
  return details[name] || {
    boundary: "custom",
    purpose: "Custom tool profile selected by contract.",
    risk: "Requires dedicated design before production use.",
  };
}

function normalizeServiceMode(value, fallback = "none") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return fallback;
  if (text.includes("launchd")) return "launchd";
  if (text.includes("external") || text.includes("systemd") || text.includes("cloud")) return "external";
  if (text.includes("manual") || text.includes("service") || text.includes("long-running")) return "manual";
  if (SERVICE_MODES.has(text)) return text;
  return fallback;
}

function normalizeAutostartMode(value, serviceMode = "none") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "disabled";
  if (text.includes("launchd") || text.includes("approval")) return "launchd-on-approval";
  if (text.includes("optional")) return "optional";
  if (text.includes("external") || serviceMode === "external") return "external";
  if (text.includes("disable") || text.includes("none") || text.includes("no")) return "disabled";
  if (AUTOSTART_MODES.has(text)) return text;
  return "disabled";
}

function normalizeProactiveMode(value) {
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

function normalizeRuntimePlacementProfile(value, runtimeFamily = "codex-native") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    if (runtimeFamily === "local-model") return "local-first";
    if (runtimeFamily === "hybrid") return "hybrid";
    return "frontier-first";
  }
  if (text.includes("determin")) return "deterministic-first";
  if (text.includes("frontier") || text.includes("codex") || text.includes("cloud")) return "frontier-first";
  if (text.includes("local")) return "local-first";
  if (text.includes("hybrid") || text.includes("mixed")) return "hybrid";
  if (RUNTIME_PLACEMENT_PROFILES.has(text)) return text;
  return "unknown";
}

function operationProfileFor(data) {
  const serviceMode = normalizeServiceMode(data.serviceMode || data.expectedHosting || "none");
  const autostart = normalizeAutostartMode(data.autostart || "disabled", serviceMode);
  const proactiveMode = normalizeProactiveMode(data.proactiveMode || "none");
  const requestedHealthcheckCommand = safeScalar(data.healthcheckCommand, "node scripts/healthcheck.mjs");
  const healthcheckCommand = "node scripts/healthcheck.mjs";
  return {
    serviceMode,
    autostart,
    deploymentTarget: safeScalar(data.deploymentTarget || data.expectedHosting, "local Mac"),
    deploymentProfile: safeScalar(data.deploymentProfile, "local-development"),
    startCommand: safeScalar(data.startCommand, "node scripts/agent-cli.mjs status"),
    stopCommand: safeScalar(data.stopCommand, serviceMode === "none" ? "not-applicable" : "manual stop; define before production"),
    healthcheckCommand,
    requestedHealthcheckCommand,
    healthcheckArgv: commandArgvFromText(healthcheckCommand),
    logPath: safeProjectRelativeDirectory(data.logPath, "logs/"),
    restartPolicy: serviceMode === "launchd" ? "launchd template only; install after explicit user approval" : "manual unless contract is updated",
    serviceLabel: `com.local.${slug(data.agentName, "agent")}`,
    proactiveMode,
    triggerSources: safeScalar(data.triggerSources, proactiveMode === "none" ? "manual user request" : "TBD"),
    schedule: safeScalar(data.schedule, proactiveMode === "scheduled" ? "TBD cron/launchd calendar interval" : "not-applicable"),
    heartbeatInterval: safeScalar(data.heartbeatInterval, proactiveMode === "heartbeat" ? "TBD" : "not-applicable"),
    idleBehavior: safeScalar(data.idleBehavior, "sleep until trigger"),
  };
}

function stableLocalPort(agentSlug) {
  let hash = 0;
  for (const char of String(agentSlug || "agent")) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  }
  return 4800 + hash;
}



const SHARED_REDACTION_SCRIPT = readFileSync(new URL("../../lib/redaction.mjs", import.meta.url), "utf8");

const SKILLS_STATUS_SCRIPT = renderScaffoldTemplate(new URL("./templates/skills_status_script.tmpl", import.meta.url));

const CONTROL_CENTER_RUNTIME_SCRIPT = renderScaffoldTemplate(new URL("./templates/control_center_runtime_script.tmpl", import.meta.url));

function resolveTargetPath(data, options = {}) {
  const explicitOutput = scalar(options.output || "", "");
  if (explicitOutput) return path.resolve(ROOT, explicitOutput);
  const contractTarget = scalar(data.targetFolder || "", "");
  if (!contractTarget || /^sibling of (?:pritha|techscope)$/i.test(contractTarget)) {
    return path.join(resolvePrithaAgentParent({ root: ROOT }), slug(data.agentName));
  }
  return path.resolve(ROOT, contractTarget);
}

function ensureWritableTarget(targetPath) {
  const requested = path.resolve(targetPath);
  if (existsSync(targetPath)) {
    const targetStat = lstatSync(targetPath);
    if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
      throw new Error(`Target folder must be a regular directory and not a symlink: ${targetPath}`);
    }
    const entries = readdirSync(targetPath).filter((entry) => entry !== ".DS_Store");
    if (entries.length > 0) {
      throw new Error(`Target folder is not empty: ${targetPath}`);
    }
  } else {
    let ancestor = path.dirname(requested);
    while (!existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    const ancestorStat = lstatSync(ancestor);
    if (!ancestorStat.isDirectory() || ancestorStat.isSymbolicLink()) {
      throw new Error(`Target folder has an unsafe nearest existing ancestor: ${ancestor}`);
    }
    mkdirSync(requested, { recursive: true });
  }
  const createdStat = lstatSync(requested);
  if (!createdStat.isDirectory() || createdStat.isSymbolicLink()) {
    throw new Error(`Target folder must remain a regular directory and not a symlink: ${targetPath}`);
  }
  return realpathSync(requested);
}

function writeProjectFile(projectRoot, relPath, content) {
  const canonicalRoot = realpathSync(projectRoot);
  const normalizedRelative = String(relPath || "").replaceAll("\\", "/");
  if (!normalizedRelative || path.posix.isAbsolute(normalizedRelative) || normalizedRelative.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe generated project path: ${relPath}`);
  }
  const fullPath = path.resolve(canonicalRoot, normalizedRelative);
  if (fullPath === canonicalRoot || !fullPath.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`Generated project path escapes target: ${relPath}`);
  }
  const parentPath = path.dirname(fullPath);
  mkdirSync(parentPath, { recursive: true });
  const parentStat = lstatSync(parentPath);
  const realParent = realpathSync(parentPath);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || (realParent !== canonicalRoot && !realParent.startsWith(`${canonicalRoot}${path.sep}`))) {
    throw new Error(`Generated project parent is unsafe: ${relPath}`);
  }
  if (existsSync(fullPath)) throw new Error(`Refusing to overwrite existing file: ${fullPath}`);
  writeFileSync(fullPath, content, { flag: "wx" });
  return relPath;
}

function contractStatus(data) {
  return String(data.fm?.status || "").trim().toLowerCase();
}

function asList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function frontmatterReferencesContract(frontmatter, relPath) {
  const related = frontmatter?.related && typeof frontmatter.related === "object" ? frontmatter.related : {};
  return [...asList(frontmatter?.sources), ...asList(related.agent_contracts)].includes(relPath);
}

export function researchReportStatus(data) {
  if (!existsSync(RESEARCH_DIR)) return { status: "missing", path: "" };
  let files;
  try {
    const directoryStat = lstatSync(RESEARCH_DIR);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return { status: "missing", path: "" };
    const memoryRoot = realpathSync(AGENT_MEMORY_ROOT);
    const researchRoot = realpathSync(RESEARCH_DIR);
    if (researchRoot !== memoryRoot && !researchRoot.startsWith(`${memoryRoot}${path.sep}`)) {
      return { status: "missing", path: "" };
    }
    files = newestArtifactPathsFirst(readdirSync(researchRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".md"))
      .map((entry) => path.join(researchRoot, entry.name)));
  } catch {
    return { status: "missing", path: "" };
  }
  let newestFingerprintMismatch = null;
  for (const filePath of files) {
    let text;
    try {
      text = readBoundedRegularFile(filePath, {
        maxBytes: 1_000_000,
        allowedRoots: [AGENT_MEMORY_ROOT],
      }).text;
    } catch {
      continue;
    }
    const frontmatter = parseFrontmatterData(text);
    if (
      frontmatter?.type === "review"
      && frontmatter.research_gate_status !== undefined
      && frontmatterReferencesContract(frontmatter, data.relPath)
    ) {
      const result = {
        status: "found",
        path: path.relative(ROOT, filePath),
        gate: researchGateDecisionForReport(data, text),
        repositoryPayload: verifyRepositoryResearchIntegrity(text).payload,
        repositoryLock: String(frontmatter.repository_research_lock || ""),
      };
      if (frontmatter.contract_fingerprint === data.fingerprint) return result;
      if (!newestFingerprintMismatch) newestFingerprintMismatch = result;
    }
  }
  return newestFingerprintMismatch || { status: "missing", path: "" };
}

export function generatedAgentFiles(data, options = {}) {
  const agentName = safeScalar(data.agentName, "New Agent");
  const agentSlug = slug(agentName);
  const voiceCopyTarget = safeScalar(options.voiceCopyTarget, `sibling:${agentSlug}`);
  const voiceCopyCommand = `node scripts/voice-control-kit.mjs copy --target ${shellArgument(voiceCopyTarget)}`;
  const telegramEnabled = data.telegramMode && data.telegramMode !== "none";
  const repositoryModuleSelected = String(data.repositoryAdoptionMode || "none").toLowerCase() === "selected-module";
  const selectedRepositoryUrl = String(data.selectedGitHubRepositories || "").trim().replace(/\/$/, "");
  const repositoryResearchPayload = options.research?.repositoryPayload || null;
  const repositoryResearchCandidate = Array.isArray(repositoryResearchPayload?.candidates)
    ? repositoryResearchPayload.candidates.find((candidate) => String(candidate?.repository || "").toLowerCase() === selectedRepositoryUrl.toLowerCase())
    : null;
  const repositoryVerificationAuthorized = Boolean(options.research?.gate?.ok && repositoryResearchCandidate);
  const scaffoldExperimental = Boolean(options.experimental || !repositoryVerificationAuthorized);
  const selectedRepositoryUrls = String(data.selectedGitHubRepositories || "")
    .split(/[;,\s]+/)
    .map((value) => value.trim())
    .map((value) => normalizeGitHubRepositoryUrl(value)?.url || "")
    .filter(Boolean);
  const repositoryManifest = repositoryModuleSelected ? {
    version: 1,
    generated_by: "Pritha",
    adoption_mode: "selected-module",
    repositories: selectedRepositoryUrls,
    module: normalizeRepositoryModulePath(data.selectedRepositoryModule) || "pending",
    immutable_pin: canonicalRepositoryPin(data.repositoryPin) || "pending",
    verified_pin_sha: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_pin_sha || "") : "",
    verified_module_path: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_module_path || "") : "",
    verified_module_sha: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_module_sha || "") : "",
    verified_module_type: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_module_type || "") : "",
    verification_source_url: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verification_source_url || "") : "",
    repository_research_lock: repositoryVerificationAuthorized ? String(options.research?.repositoryLock || "") : "",
    verified_license_path: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_path || "") : "",
    verified_license_blob_sha: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_blob_sha || "") : "",
    verified_license_content_sha256: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_content_sha256 || "") : "",
    verified_license_spdx: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_spdx || "") : "",
    verified_license_source_url: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_source_url || "") : "",
    verified_license_scope: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_scope || "") : "",
    license_evidence_source_url: repositoryVerificationAuthorized ? String(repositoryResearchCandidate.verified_license_source_url || "") : "",
    verification_status: repositoryVerificationAuthorized ? "verified-by-pritha-research-gate" : "experimental-unverified",
    experimental_scaffold: scaffoldExperimental,
    license_decision: safeScalar(data.repositoryLicenseDecision, "pending"),
    security_review: safeScalar(data.repositorySecurityReview, "pending"),
    permissions: safeScalar(data.repositoryPermissions, "pending"),
    eval_status: safeScalar(data.repositoryEvalStatus, "pending"),
    user_approval: safeScalar(data.repositoryUserApproval, "pending"),
    installation_status: "not-installed",
    trust_boundary: "Only the reviewed module at the immutable pin is approved; all other repository content remains untrusted.",
  } : null;
  const repositoryManifestContent = repositoryManifest ? `${JSON.stringify(repositoryManifest, null, 2)}\n` : "";
  const repositoryManifestSha256 = repositoryManifestContent
    ? `sha256:${createHash("sha256").update(repositoryManifestContent).digest("hex")}`
    : "";
  const repositoryProvenanceCheck = repositoryModuleSelected ? renderScaffoldTemplate(new URL("./templates/repository-provenance-check.tmpl", import.meta.url), {
    value0: JSON.stringify(repositoryManifestSha256),
    value1: JSON.stringify(repositoryManifest?.repository_research_lock || "")
  }) : "";
  const interfaces = selectedInterfaces(data);
  const memoryProfile = memoryProfileFor(data);
  const memoryDetails = memoryProfileDetails(memoryProfile);
  const toolProfiles = toolProfilesFor(data);
  const operationProfile = operationProfileFor(data);
  const controlCenterPort = stableLocalPort(agentSlug);
  const controlCenterLocalUrl = `http://127.0.0.1:${controlCenterPort}`;
  const controlCenterHealthUrl = `${controlCenterLocalUrl}/api/health`;
  const controlCenterServiceMode = operationProfile.serviceMode === "none" ? "manual" : operationProfile.serviceMode;
  const jsAgentName = javascriptLiteral(agentName, "New Agent");
  const jsRuntimeFamily = javascriptLiteral(data.runtimeFamily, "codex-native");
  const jsPrimaryInterface = javascriptLiteral(data.primaryInterface, "Codex project");
  const jsTelegramMode = javascriptLiteral(data.telegramMode, "none");
  const jsControlCenterLocalUrl = javascriptLiteral(controlCenterLocalUrl);
  const jsServiceLabel = javascriptLiteral(operationProfile.serviceLabel);
  const skillSelection = selectSkillsForContract(data);
  const selected = selectedScaffoldModules(data, { toolProfiles, skills: skillSelection, telegram: telegramEnabled });
  const skillPolicy = skillSelection.policy;
  const installedSkillRows = skillSelection.installed.map((row) => skillRowForManifest(row, "installed"));
  const candidateSkillRows = [
    ...skillSelection.candidates.map((row) => skillRowForManifest(row, "not-installed")),
    ...skillSelection.blocked.map((row) => skillRowForManifest(row, "blocked")),
  ];
  const interfaceManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    primary_interface: safeScalar(data.primaryInterface, "Codex project"),
    telegram_mode: safeScalar(data.telegramMode, "none"),
    adapters: interfaces.map((name) => ({
      name,
      enabled: true,
      required_secrets: name === "telegram"
        ? ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USER_IDS"]
        : name === "realtime-voice"
          ? ["OPENAI_API_KEY"]
          : [],
      status_command: name === "telegram"
        ? "node scripts/telegram-bot.mjs queue-status"
        : name === "realtime-voice"
          ? "node scripts/interface-status.mjs # plus realtime transport readiness"
          : "node scripts/interface-status.mjs",
    })),
  };
  const memoryManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    profile: memoryProfile,
    description: memoryDetails.description,
    source_of_truth: memoryProfile === "ephemeral" ? "ephemeral process memory" : "Markdown",
    directories: memoryDetails.directories,
    indexing_search_needs: safeScalar(data.indexingSearchNeeds, "none for v1 unless contract is updated"),
    rules: [
      "Do not store secrets in memory files.",
      "Keep raw source material separate from curated notes.",
      "Add database, embeddings or graph storage only after the contract requires it.",
    ],
  };
  const toolsManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    profiles: toolProfiles.map((name) => ({ name, ...toolProfileDetails(name) })),
    default_rule: "Choose the narrowest reliable tool boundary before adding capabilities.",
  };
  const skillsManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    policy: {
      skill_needs: skillPolicy.skillNeeds,
      external_skills: skillPolicy.allowedSkillSources === "local-only"
        ? "disabled"
        : "candidate-only-pending-pinned-bundle-workflow",
      install_mode: skillPolicy.skillInstallMode,
      agent_mutation: skillPolicy.skillMutationPolicy,
      generated_wiki_allowed: false,
    },
    installed: installedSkillRows,
    candidates: candidateSkillRows,
  };
  const skillsLock = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    installed: installedSkillRows.map((row) => ({
      name: row.name,
      version: row.version,
      source: row.source,
      trust_level: row.trust_level,
      review_status: row.review_status,
      risk_level: row.risk_level,
      requires_toolsets: row.requires_toolsets,
      hash: row.hash,
      source_paths: row.source_paths,
    })),
  };
  const operationsManifest = {
    version: 1,
    generated_by: "Pritha",
    agent: agentName,
    deployment_target: operationProfile.deploymentTarget,
    deployment_profile: operationProfile.deploymentProfile,
    service_mode: controlCenterServiceMode,
    autostart: operationProfile.autostart,
    control_center_managed: true,
    autostart_policy: "configurable; never install or enable autostart from scaffold without explicit user approval",
    control_center_contract: {
      version: 1,
      command_shape: "structured-argv",
      executor: "scripts/control-center-runtime.mjs",
      default_execution: "control-center-managed-local-runtime",
      legacy_strings_executable: false,
      confirmation_required: false,
      managed_runtime: "detached-node-process",
      planned_start_command: "node scripts/control-center-agent-service.mjs",
      planned_stop_command: "node scripts/control-center-runtime.mjs stop",
    },
    control_center_runtime: {
      manager: "detached-node-process",
      service_boundary: "project-local-control-center-runtime",
      pid_file: ".state/control-center-runtime.pid",
      prestart_argv: [],
      start_argv: ["node", "scripts/control-center-agent-service.mjs"],
      env: {
        CONTROL_CENTER_AGENT_PORT: String(controlCenterPort),
      },
      fallback_stop_process: {
        port: controlCenterPort,
        cwd: ".",
        command_contains: ["node", "scripts/control-center-agent-service.mjs"],
        signal: "SIGTERM",
        timeout_ms: 10000,
        reason: "Stops an orphaned project-local Control Center runtime only when it is listening on this agent's managed port from this project folder.",
      },
      health_url: controlCenterHealthUrl,
      readiness_timeout_ms: 10000,
      stop_timeout_ms: 10000,
    },
    start_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "start"],
      cwd: ".",
      control_center_managed: true,
      background: true,
      timeout_ms: 30000,
      success_exit_codes: [0],
      readiness: {
        kind: "health_url",
        url: controlCenterHealthUrl,
        timeout_ms: 10000,
      },
      description: "Control Center start for the project-local child-agent runtime.",
    },
    stop_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "stop"],
      cwd: ".",
      control_center_managed: true,
      timeout_ms: 30000,
      success_exit_codes: [0],
      description: "Control Center stop for the project-local child-agent runtime.",
    },
    healthcheck_command: operationProfile.healthcheckCommand,
    requested_healthcheck_command: operationProfile.requestedHealthcheckCommand,
    healthcheck_argv: operationProfile.healthcheckArgv,
    healthcheck_command_executable: operationProfile.healthcheckArgv.length > 0,
    local_upstream_url: controlCenterLocalUrl,
    health_url: controlCenterHealthUrl,
    log_path: operationProfile.logPath,
    restart_policy: operationProfile.restartPolicy,
    service_label: operationProfile.serviceLabel,
    launch_agent_path: `~/Library/LaunchAgents/${operationProfile.serviceLabel}.plist`,
    deploy_script: "scripts/deploy-service.mjs",
    launchd_template: operationProfile.serviceMode === "launchd" || operationProfile.autostart === "launchd-on-approval"
      ? `operations/launchd/com.local.${agentSlug}.plist.template`
      : null,
    proactivity: {
      mode: operationProfile.proactiveMode,
      trigger_sources: operationProfile.triggerSources,
      schedule: operationProfile.schedule,
      heartbeat_interval: operationProfile.heartbeatInterval,
      idle_behavior: operationProfile.idleBehavior,
      user_interruption_policy: safeScalar(data.userInterruptionPolicy, "do not interrupt unless configured by user"),
    },
  };
  const files = [];
  const outcome = options.outcome || null;

  files.push({
    path: "delivery/outcome-lineage.json",
    content: renderScaffoldTemplate(new URL("./templates/delivery-outcome-lineage.json.tmpl", import.meta.url), {
    value0: JSON.stringify({
      schema: "pritha-child-outcome-lineage-v1",
      outcome_spec_id: outcome?.id || null,
      outcome_spec_path: outcome?.relPath || null,
      outcome_spec_status: outcome?.status || "missing",
      outcome_semantic_lock: outcome?.semanticLock || null,
      outcome_document_lock: outcome?.documentLock || null,
      approval_evidence_valid: outcome?.approvalValid === true,
      contract_fingerprint: data.fingerprint,
      delivery_status: "not-started",
      source_of_truth: "Pritha host; this file is lineage metadata and is not an editable Outcome Spec",
    }, null, 2)
  }),
  });
  files.push({
    path: "delivery/README.md",
    content: `# Outcome delivery\n\nThe approved Outcome Spec, Trial plan, approval evidence and delivery ledger remain host-owned by Pritha.\n\nThis project may be changed by the bounded build executor, but it must not treat \`delivery/outcome-lineage.json\` as permission to rewrite the goal or verifier. Run delivery from Pritha with \`node scripts/pritha.mjs deliver <outcome-spec> --project <this-project>\`. Machine verification, user acceptance, merge and deployment are separate states.\n`,
  });

  files.push({
    path: "AGENTS.md",
    content: renderScaffoldTemplate(new URL("./templates/agents.md.tmpl", import.meta.url), {
    value0: markdownValue(agentName, "New Agent", 300),
    value1: markdownValue(data.primaryMission, "TBD"),
    value2: markdownValue(data.targetUser, "TBD"),
    value3: markdownValue(data.successCriteria, "TBD"),
    value4: markdownValue(bodyValue(data.text, "Out of scope"), "TBD"),
    value5: markdownValue(data.runtimeFamily, "codex-native"),
    value6: markdownValue(data.primaryInterface, "Codex project"),
    value7: interfaces.join(", "),
    value8: markdownValue(data.telegramMode, "none"),
    value9: markdownValue(data.expectedHosting, "local Mac"),
    value10: markdownValue(operationProfile.deploymentTarget, "local Mac"),
    value11: markdownValue(operationProfile.deploymentProfile, "local-development"),
    value12: controlCenterServiceMode,
    value13: operationProfile.autostart,
    value14: operationProfile.proactiveMode,
    value15: markdownValue(data.memoryModel, "Markdown-first"),
    value16: selected.memory ? memoryProfile : "no persistent module",
    value17: toolProfiles.join(", "),
    value18: telegramEnabled ? "Telegram is enabled by contract. Use the adapter only with TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_IDS set in .env." : "Telegram is not part of v1 unless the contract is updated.",
    value19: selected.memory ? `- Memory profile is documented in \`memory/manifest.json\`.` : "",
    value20: selected.tools ? `- Tool boundaries are documented in \`tools/manifest.json\`.` : "",
    value21: selected.skills ? `## Skills

- Skill policy and provenance live in \`skills/manifest.json\`.
- Before reading or using an installed skill, run \`node scripts/skills-status.mjs\` and require a successful deterministic audit.
- After that audit succeeds, read only the exact audited \`skills/<name>/SKILL.md\`, check \`When to Use\`, follow \`Pitfalls\` and complete \`Verification\`.
- Fail closed on hash, provenance or security-metadata drift; do not read the changed skill as instructions.
- Do not use entries from \`skills/candidates.json\` as active instructions.
- Do not modify skills unless the contract allows skill mutation.
- External skills remain inactive candidates until Pritha implements a dedicated pinned-bundle verification and approval workflow; approval text alone is insufficient.` : ""
  }),
  });

  files.push({
    path: "README.md",
    content: renderScaffoldTemplate(new URL("./templates/readme.md.tmpl", import.meta.url), {
    value0: markdownValue(agentName, "New Agent", 300),
    value1: markdownValue(data.primaryMission, "TBD"),
    value2: selected.memory ? `node scripts/memory-status.mjs` : "",
    value3: selected.tools ? `node scripts/tools-status.mjs` : "",
    value4: selected.skills ? `node scripts/skills-status.mjs` : "",
    value5: telegramEnabled ? `## Telegram

Keep \`.env\` mode at \`0600\`, fill \`TELEGRAM_BOT_TOKEN\` and \`TELEGRAM_ALLOWED_USER_IDS\`, then run:

\`\`\`sh
node scripts/telegram-bot.mjs healthcheck
\`\`\`
` : "",
    value6: selected.memory ? `- \`memory/manifest.json\`: memory profile and boundaries.` : "",
    value7: selected.tools ? `- \`tools/manifest.json\`: tool profiles and boundaries.` : "",
    value8: selected.skills ? `- \`skills/manifest.json\`: reviewed installed skills, candidate skills, hashes and mutation policy.` : "",
    value9: markdownValue(data.runtimeFamily, "codex-native"),
    value10: markdownValue(data.primaryInterface, "Codex project"),
    value11: interfaces.join(", "),
    value12: markdownValue(data.telegramMode, "none"),
    value13: markdownValue(data.memoryModel, "Markdown-first"),
    value14: selected.memory ? memoryProfile : "none",
    value15: toolProfiles.join(", "),
    value16: skillPolicy.skillNeeds,
    value17: skillPolicy.allowedSkillSources,
    value18: skillPolicy.skillInstallMode,
    value19: skillPolicy.skillMutationPolicy,
    value20: markdownValue(operationProfile.deploymentTarget, "local Mac"),
    value21: markdownValue(operationProfile.deploymentProfile, "local-development"),
    value22: controlCenterServiceMode,
    value23: operationProfile.autostart,
    value24: operationProfile.proactiveMode
  }),
  });

  files.push({
    path: ".env.example",
    content: renderScaffoldTemplate(new URL("./templates/.env.example.tmpl", import.meta.url), {
    value0: telegramEnabled ? "TELEGRAM_BOT_TOKEN=\nTELEGRAM_ALLOWED_USER_IDS=\n" : "",
    value1: agentSlug
  }),
  });

  files.push({
    path: "package.json",
    content: renderScaffoldTemplate(new URL("./templates/package.json.tmpl", import.meta.url), {
    value0: agentSlug,
    value1: selected.memory ? '    "memory": "node scripts/memory-status.mjs",' : "",
    value2: selected.tools ? '    "tools": "node scripts/tools-status.mjs",' : "",
    value3: selected.skills ? '    "skills": "node scripts/skills-status.mjs",' : "",
    value4: telegramEnabled ? ',\n    "telegram:healthcheck": "node scripts/telegram-bot.mjs healthcheck",\n    "telegram:queue": "node scripts/telegram-bot.mjs queue-status",\n    "telegram:poll:dry": "node scripts/telegram-bot.mjs poll-once --dry-run"' : ""
  }),
  });

  files.push({
    path: "interfaces/manifest.json",
    content: renderScaffoldTemplate(new URL("./templates/interfaces-manifest.json.tmpl", import.meta.url), {
    value0: JSON.stringify(interfaceManifest, null, 2)
  }),
  });

  files.push({
    path: "interfaces/README.md",
    content: renderScaffoldTemplate(new URL("./templates/interfaces-readme.md.tmpl", import.meta.url), {
    value0: interfaces.map((name) => `- \`${name}\``).join("\n"),
    value1: telegramEnabled ? "node scripts/telegram-bot.mjs queue-status\nnode scripts/telegram-bot.mjs poll-once --dry-run" : ""
  }),
  });

  for (const name of interfaces) {
    files.push({
      path: `interfaces/${name}/README.md`,
      content: renderScaffoldTemplate(new URL("./templates/generated-agent-files.tmpl", import.meta.url), {
    value0: name,
    value1: name === "telegram" ? "generated" : name === "cli" ? "generated" : "documented-placeholder",
    value2: name === "cli"
  ? "Local maintenance and smoke-test interface."
  : name === "telegram"
    ? `Telegram adapter selected by contract as ${markdownValue(data.telegramMode, "none")}.`
    : "Adapter placeholder selected by contract. Implement runtime behavior only after a dedicated design step.",
    value3: markdownValue(data.primaryInterface, "Codex project"),
    value4: markdownValue(data.telegramMode, "none"),
    value5: markdownValue(data.runtimeFamily, "codex-native")
  }),
    });
  }

  if (usesRealtimeVoice(data)) {
    files.push({
      path: "interfaces/realtime-voice/pattern-manifest.json",
      content: renderScaffoldTemplate(new URL("./templates/interfaces-realtime-voice-pattern-manifest.json.tmpl", import.meta.url), {
    value0: JSON.stringify({
        profile: "realtime-voice-codex",
        status: "documented-placeholder",
        selected_by_contract: true,
        pritha_reference: "11_agents/reference-implementations/fespa26-voice-control",
        workflow: "07_workflows/realtime-voice-control-kit.md",
        standard: "04_standards/realtime-voice-control-for-codex-agents.md",
        copy_command_from_pritha_root: voiceCopyCommand,
        required_readiness: [
          "realtime credentials",
          "server-side tool route",
          "memory/search tool if selected",
          "Codex App/CLI/session transport if selected",
          "operator confirmation gates",
        ],
      }, null, 2)
  }),
    });
    files.push({
      path: "interfaces/realtime-voice/FESPA26_REFERENCE.md",
      content: renderScaffoldTemplate(new URL("./templates/interfaces-realtime-voice-fespa26_reference.md.tmpl", import.meta.url), {
    value0: voiceCopyCommand
  }),
    });
  }

  if (selected.memory) {
  files.push({
    path: "memory/manifest.json",
    content: renderScaffoldTemplate(new URL("./templates/memory-manifest.json.tmpl", import.meta.url), {
    value0: JSON.stringify(memoryManifest, null, 2)
  }),
  });

  files.push({
    path: "memory/README.md",
    content: renderScaffoldTemplate(new URL("./templates/memory-readme.md.tmpl", import.meta.url), {
    value0: memoryProfile,
    value1: memoryDetails.description,
    value2: memoryDetails.directories.map((dir) => `- \`${dir}\``).join("\n"),
    value3: selected.memory ? `node scripts/memory-status.mjs` : ""
  }),
  });

  for (const dir of memoryDetails.directories) {
    if (dir.endsWith("/index")) {
      files.push({
        path: `${dir}/README.md`,
        content: renderScaffoldTemplate(new URL("./templates/generated-agent-files-1.tmpl", import.meta.url)),
      });
    } else if (dir.endsWith("/embeddings")) {
      files.push({
        path: `${dir}/README.md`,
        content: renderScaffoldTemplate(new URL("./templates/generated-agent-files-2.tmpl", import.meta.url)),
      });
    } else if (dir.endsWith("/external")) {
      files.push({
        path: `${dir}/README.md`,
        content: renderScaffoldTemplate(new URL("./templates/generated-agent-files-3.tmpl", import.meta.url)),
      });
    } else {
      files.push({ path: `${dir}/.gitkeep`, content: "" });
    }
  }

  }

  if (selected.tools) {
  files.push({
    path: "tools/manifest.json",
    content: renderScaffoldTemplate(new URL("./templates/tools-manifest.json.tmpl", import.meta.url), {
    value0: JSON.stringify(toolsManifest, null, 2)
  }),
  });

  files.push({
    path: "tools/README.md",
    content: renderScaffoldTemplate(new URL("./templates/tools-readme.md.tmpl", import.meta.url), {
    value0: toolProfiles.map((name) => {
  const detail = toolProfileDetails(name);
  return `### ${name}

- Boundary: ${detail.boundary}
- Purpose: ${detail.purpose}
- Risk: ${detail.risk}`;
}).join("\n\n")
  }),
  });

  for (const profile of toolProfiles) {
    const detail = toolProfileDetails(profile);
    files.push({
      path: `tools/${profile}/README.md`,
      content: renderScaffoldTemplate(new URL("./templates/generated-agent-files-4.tmpl", import.meta.url), {
    value0: profile,
    value1: detail.boundary,
    value2: detail.purpose,
    value3: detail.risk
  }),
    });
  }

  }

  if (selected.skills) {
  files.push({
    path: "skills/manifest.json",
    content: renderScaffoldTemplate(new URL("./templates/skills-manifest.json.tmpl", import.meta.url), {
    value0: JSON.stringify(skillsManifest, null, 2)
  }),
  });

  files.push({
    path: "skills/candidates.json",
    content: renderScaffoldTemplate(new URL("./templates/skills-candidates.json.tmpl", import.meta.url), {
    value0: JSON.stringify({
      version: 1,
      generated_by: "Pritha",
      policy: skillsManifest.policy,
      candidates: candidateSkillRows,
    }, null, 2)
  }),
  });

  files.push({
    path: "skills/lock.json",
    content: renderScaffoldTemplate(new URL("./templates/skills-lock.json.tmpl", import.meta.url), {
    value0: JSON.stringify(skillsLock, null, 2)
  }),
  });

  files.push({
    path: "skills/README.md",
    content: renderScaffoldTemplate(new URL("./templates/skills-readme.md.tmpl", import.meta.url), {
    value0: skillPolicy.skillNeeds,
    value1: skillPolicy.allowedSkillSources,
    value2: skillPolicy.skillInstallMode,
    value3: skillPolicy.skillMutationPolicy,
    value4: selected.skills ? `node scripts/skills-status.mjs` : ""
  }),
  });

  for (const row of skillSelection.installed) {
    files.push({
      path: `skills/${row.skill.name}/SKILL.md`,
      content: row.skill.text,
    });
  }

  }

  files.push({
    path: "operations/manifest.json",
    content: renderScaffoldTemplate(new URL("./templates/operations-manifest.json.tmpl", import.meta.url), {
    value0: JSON.stringify(operationsManifest, null, 2)
  }),
  });

  files.push({
    path: "operations/README.md",
    content: renderScaffoldTemplate(new URL("./templates/operations-readme.md.tmpl", import.meta.url), {
    value0: markdownValue(operationProfile.deploymentTarget, "local Mac"),
    value1: markdownValue(operationProfile.deploymentProfile, "local-development"),
    value2: operationProfile.serviceMode,
    value3: operationProfile.autostart,
    value4: operationProfile.proactiveMode,
    value5: operationProfile.healthcheckArgv.length > 0 ? operationProfile.healthcheckArgv.join(" ") : "# Define operations/manifest.json healthcheck_argv before deployment install",
    value6: markdownValue(operationProfile.startCommand, "not configured"),
    value7: markdownValue(operationProfile.stopCommand, "not configured"),
    value8: operationProfile.healthcheckArgv.length > 0 ? operationProfile.healthcheckArgv.join(" ") : "not configured",
    value9: operationProfile.healthcheckCommand,
    value10: markdownValue(operationProfile.logPath, "logs/"),
    value11: operationProfile.restartPolicy,
    value12: operationProfile.serviceLabel,
    value13: operationProfile.proactiveMode,
    value14: markdownValue(operationProfile.triggerSources, "manual user request"),
    value15: markdownValue(operationProfile.schedule, "not-applicable"),
    value16: markdownValue(operationProfile.heartbeatInterval, "not-applicable"),
    value17: markdownValue(operationProfile.idleBehavior, "sleep until trigger"),
    value18: markdownValue(data.userInterruptionPolicy, "do not interrupt unless configured by user"),
    value19: operationsManifest.launchd_template ? `## launchd

A launchd plist template is available at \`${operationsManifest.launchd_template}\`.

Review and customize it before copying it to \`~/Library/LaunchAgents/\`. Do not install it until the user explicitly approves autostart for this agent.
` : "## launchd\n\nNo launchd template is generated for the current service mode.\n"
  }),
  });

  if (operationsManifest.launchd_template) {
    files.push({
      path: operationsManifest.launchd_template,
      content: renderScaffoldTemplate(new URL("./templates/generated-agent-files-5.tmpl", import.meta.url), {
    value0: xmlText(operationProfile.serviceLabel),
    value1: operationProfile.autostart === "launchd-on-approval" ? "true" : "false",
    value2: xmlText(operationProfile.logPath.replace(/\/$/, ""), "logs"),
    value3: xmlText(operationProfile.logPath.replace(/\/$/, ""), "logs")
  }),
    });
  }

  files.push({
    path: "07_workflows/agent-operating-workflow.md",
    content: renderScaffoldTemplate(new URL("./templates/07_workflows-agent-operating-workflow.md.tmpl", import.meta.url), {
    value0: markdownValue(agentName, "New Agent", 300)
  }),
  });

  files.push({
    path: "docs/user-training-guide.md",
    content: renderScaffoldTemplate(new URL("./templates/docs-user-training-guide.md.tmpl", import.meta.url), {
    value0: bulletList(data.coreFunctions),
    value1: bulletList(sectionItems(data.text, "Deferred functions"))
  }),
  });

  files.push({
    path: "scripts/control-center-agent-service.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-control-center-agent-service.mjs.tmpl", import.meta.url), {
    value0: jsControlCenterLocalUrl,
    value1: controlCenterPort,
    value2: jsAgentName,
    value3: jsAgentName
  }),
  });

  files.push({
    path: "scripts/agent-cli.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-agent-cli.mjs.tmpl", import.meta.url), {
    value0: jsAgentName,
    value1: jsRuntimeFamily,
    value2: jsPrimaryInterface,
    value3: jsTelegramMode
  }),
  });

  files.push({
    path: "scripts/interface-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-interface-status.mjs.tmpl", import.meta.url)),
  });

  if (selected.memory) {
  files.push({
    path: "scripts/memory-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-memory-status.mjs.tmpl", import.meta.url)),
  });
  }

  if (selected.tools) {
  files.push({
    path: "scripts/tools-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-tools-status.mjs.tmpl", import.meta.url)),
  });
  }

  if (selected.skills) {
  files.push({
    path: "scripts/skills-status.mjs",
    content: SKILLS_STATUS_SCRIPT,
  });
  }

  if (selected.redaction) {
  files.push({
    path: "scripts/redaction.mjs",
    content: SHARED_REDACTION_SCRIPT,
  });
  }

  files.push({
    path: "scripts/control-center-runtime.mjs",
    content: CONTROL_CENTER_RUNTIME_SCRIPT,
  });

  files.push({
    path: "scripts/operations-status.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-operations-status.mjs.tmpl", import.meta.url)),
  });

  files.push({
    path: "scripts/deploy-service.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-deploy-service.mjs.tmpl", import.meta.url), {
    value0: jsServiceLabel
  }),
  });

  files.push({
    path: "scripts/healthcheck.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-healthcheck.mjs.tmpl", import.meta.url), {
    value0: selected.memory ? '  "memory/manifest.json",' : "",
    value1: selected.tools ? '  "tools/manifest.json",' : "",
    value2: selected.skills ? '  "skills/manifest.json",' : "",
    value3: selected.skills ? '  "scripts/skills-status.mjs",' : "",
    value4: selected.redaction ? '  "scripts/redaction.mjs",' : "",
    value5: repositoryModuleSelected ? 'requiredPaths.push("sources/repository-modules.json"); requiredPaths.push("sources/README.md");' : "",
    value6: repositoryProvenanceCheck
  }),
  });

  files.push({
    path: "scripts/smoke-test.mjs",
    content: renderScaffoldTemplate(new URL("./templates/scripts-smoke-test.mjs.tmpl", import.meta.url), {
    value0: selected.memory ? '  "memory/manifest.json",' : "",
    value1: selected.memory ? '  "memory/README.md",' : "",
    value2: selected.tools ? '  "tools/manifest.json",' : "",
    value3: selected.tools ? '  "tools/README.md",' : "",
    value4: selected.skills ? '  "skills/manifest.json",' : "",
    value5: selected.skills ? '  "skills/candidates.json",' : "",
    value6: selected.skills ? '  "skills/lock.json",' : "",
    value7: selected.skills ? '  "skills/README.md",' : "",
    value8: selected.memory ? '  "scripts/memory-status.mjs",' : "",
    value9: selected.tools ? '  "scripts/tools-status.mjs",' : "",
    value10: selected.skills ? '  "scripts/skills-status.mjs",' : "",
    value11: selected.redaction ? '  "scripts/redaction.mjs",' : "",
    value12: telegramEnabled ? 'required.push("scripts/telegram-bot.mjs");' : "",
    value13: telegramEnabled ? 'required.push("data/telegram-queue/inbox/.gitkeep"); required.push("scripts/process-telegram-queue.mjs");' : "",
    value14: repositoryModuleSelected ? 'required.push("sources/repository-modules.json"); required.push("sources/README.md");' : "",
    value15: repositoryProvenanceCheck,
    value16: telegramEnabled ? `if (!envExample.includes("TELEGRAM_BOT_TOKEN=")) issues.push("missing TELEGRAM_BOT_TOKEN in .env.example");
if (!envExample.includes("TELEGRAM_ALLOWED_USER_IDS=")) issues.push("missing TELEGRAM_ALLOWED_USER_IDS in .env.example");` : ""
  }),
  });

  if (telegramEnabled) {
    files.push({
      path: "scripts/telegram-bot.mjs",
      content: renderScaffoldTemplate(new URL("./templates/scripts-telegram-bot.mjs.tmpl", import.meta.url)),
    });

    files.push({
      path: "scripts/process-telegram-queue.mjs",
      content: renderScaffoldTemplate(new URL("./templates/scripts-process-telegram-queue.mjs.tmpl", import.meta.url)),
    });

    files.push({ path: "data/telegram-queue/inbox/.gitkeep", content: "" });
  }

  if (String(data.repositoryAdoptionMode || "none").toLowerCase() === "selected-module") {
    files.push({
      path: "sources/repository-modules.json",
      content: repositoryManifestContent,
    });
    files.push({
      path: "sources/README.md",
      content: renderScaffoldTemplate(new URL("./templates/sources-readme.md.tmpl", import.meta.url)),
    });
  }

  files.push({
    path: ".gitignore",
    content: renderScaffoldTemplate(new URL("./templates/.gitignore.tmpl", import.meta.url)),
  });
  files.push({ path: "logs/.gitkeep", content: "" });
  const capability = scaffoldCapability(data);
  if (capability.adapter === "headless-cli-v1") return withChildTests(headlessCliFiles(files, data, capability, selected), capability);
  if (capability.adapter === "api-process-v1") return withChildTests(apiProcessFiles(files, data, capability, selected), capability);
  return withChildTests(files, capability);
}

export function runSmoke(projectRoot) {
  try {
    const outputText = execFileSync("node", ["scripts/smoke-test.mjs"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return { ok: true, output: outputText };
  } catch (error) {
    return {
      ok: false,
      output: [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim(),
    };
  }
}

export function runHealthcheck(projectRoot) {
  try {
    const outputText = execFileSync("node", ["scripts/healthcheck.mjs"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return { ok: true, output: outputText };
  } catch (error) {
    return {
      ok: false,
      output: [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim(),
    };
  }
}

export function initializeDeliveryGit(projectRoot, data) {
  if ((data.buildGitMode || "disposable-worktree") !== "disposable-worktree") {
    return { ok: true, status: "not-selected", revision: null };
  }
  try {
    if (existsSync(path.join(projectRoot, ".git"))) throw new Error("Generated scaffold unexpectedly already contains .git");
    execFileSync("git", ["init"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("git", ["add", "-A"], { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    execFileSync(
      "git",
      ["-c", "user.name=Pritha", "-c", "user.email=pritha@local.invalid", "commit", "-m", "Pritha scaffold baseline"],
      { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (status) throw new Error("Scaffold Git baseline is not clean after commit");
    return { ok: true, status: "initialized", revision };
  } catch (error) {
    return { ok: false, status: "failed", revision: null, error: redactSensitiveText(String(error?.message || error)).slice(0, 1_000) };
  }
}

function externalVerificationStatus(research) {
  return research?.gate?.fields?.externalResearch || "pending";
}

function researchGateStatusLabel(research) {
  return research?.gate?.status || "pending";
}

function researchGateResultLabel(research) {
  if (research?.status !== "found") return "missing";
  if (research.gate?.ok) return "pass";
  return research.gate?.status || "pending";
}

function researchGateReasons(research) {
  const reasons = research?.gate?.reasons || [];
  return reasons.length ? reasons.join(", ") : "none";
}

function scaffoldReportMarkdown(data, projectRoot, createdFiles, smokeResult, options = {}) {
  const date = today();
  const agentSlug = slug(data.agentName);
  const telegramApplicable = data.telegramMode && data.telegramMode !== "none";
  const operationProfile = operationProfileFor(data);
  const capability = options.capability || scaffoldCapability(data);
  const headless = capability.adapter === "headless-cli-v1";
  const apiProcess = capability.adapter === "api-process-v1";
  const apiManifest = apiProcess ? apiProcessManifest(data) : null;
  const controlCenterServiceMode = headless ? "none" : operationProfile.serviceMode === "none" ? "manual" : operationProfile.serviceMode;
  const controlCenterPort = stableLocalPort(agentSlug);
  const controlCenterLocalUrl = headless ? "not-applicable" : apiProcess ? apiManifest.local_upstream_url : `http://127.0.0.1:${controlCenterPort}`;
  const controlCenterHealthUrl = headless ? "not-applicable" : apiProcess ? apiManifest.health_url : `${controlCenterLocalUrl}/api/health`;
  const research = options.research || researchReportStatus(data);
  const healthResult = options.healthResult || smokeResult;
  const deliveryGit = options.deliveryGit || { ok: true, status: "not-requested", revision: null };
  const scaffoldOk = smokeResult.ok && healthResult.ok && deliveryGit.ok;
  const externalVerification = externalVerificationStatus(research);
  const gateFields = research.gate?.fields || {};
  const researchFrontmatter = research.gate?.frontmatter || {};
  const repositoryScopes = asList(researchFrontmatter.repository_research_scopes);
  const evidenceTopics = asList(researchFrontmatter.external_evidence_topics);
  const repositoryLicenseEvidence = Array.isArray(research.gate?.externalIntegrity?.repositoryEvidence)
    ? research.gate.externalIntegrity.repositoryEvidence.find((item) => String(item?.repository_url || "").toLowerCase() === String(data.selectedGitHubRepositories || "").replace(/\/$/, "").toLowerCase())
    : null;
  const repositoryResearchCandidate = Array.isArray(research.repositoryPayload?.candidates)
    ? research.repositoryPayload.candidates.find((item) => String(item?.repository || "").toLowerCase() === String(data.selectedGitHubRepositories || "").replace(/\/$/, "").toLowerCase())
    : null;
  const experimentalOverrides = options.experimentalOverrides || [];
  const experimental = experimentalOverrides.length > 0;
  const effectiveGateStatus = research.gate?.status || "pending";
  const enumValue = (value, allowed, fallback) => allowed.includes(String(value || "")) ? String(value) : fallback;
  const repositoryPolicy = enumValue(researchFrontmatter.repository_research_policy || data.repositoryResearchPolicy, ["auto", "required", "registry-only", "not-applicable"], "auto");
  const repositoryMode = enumValue(researchFrontmatter.repository_research_mode, ["auto", "online", "registry-only", "skip"], "pending");
  const repositoryStatus = enumValue(researchFrontmatter.repository_research_status, ["complete", "pending", "not-applicable", "failed"], "pending");
  const repositoryOnlineStatus = enumValue(researchFrontmatter.repository_research_online_status, ["complete", "fixture", "registry-only", "not-applicable", "skipped", "failed"], "pending");
  const productionReady = scaffoldOk && research.gate?.ok === true && !experimental;
  const repositoryAdoptionStatus = data.repositoryAdoptionMode === "selected-module"
    ? (productionReady ? "selected-module" : "pending-review")
    : enumValue(researchFrontmatter.repository_adoption_status || data.repositoryAdoptionMode, ["none", "reference-only"], "none");
  const reportStatus = scaffoldOk ? (productionReady ? "complete" : "draft") : "failed";
  const targetFolder = path.relative(ROOT, projectRoot) || ".";
  const outcome = options.outcome || null;
  return renderScaffoldTemplate(new URL("./templates/scaffold-report-markdown.tmpl", import.meta.url), {
    value0: yamlScalar(options.artifactId || `${date}-${agentSlug}-scaffold-report`),
    value1: yamlScalar(data.agentId || slug(data.agentName)),
    value2: yamlScalar(path.relative(ROOT, projectRoot)),
    value3: capability.adapter || "unknown",
    value4: reportStatus,
    value5: date,
    value6: date,
    value7: agentSlug,
    value8: telegramApplicable ? "Telegram" : "CLI",
    value9: controlCenterServiceMode === "launchd" ? "launchd" : "operations",
    value10: yamlScalar(data.runtimeFamily || "codex-native"),
    value11: headless ? "adapter-needed" : "codex-native",
    value12: yamlScalar(data.relPath),
    value13: research.path ? `  - ${yamlScalar(research.path)}\n` : "",
    value14: yamlScalar(data.relPath),
    value15: date,
    value16: date,
    value17: date,
    value18: productionReady ? date : "pending",
    value19: productionReady ? "initial production-ready scaffold" : "experimental or failed scaffold only",
    value20: productionReady ? "current" : "pending",
    value21: data.fingerprint,
    value22: effectiveGateStatus,
    value23: gateFields.researchGate || "pending",
    value24: gateFields.memoryResearch || "pending",
    value25: gateFields.externalResearch || "pending",
    value26: gateFields.synthesis || "pending",
    value27: yamlScalar(researchFrontmatter.pattern_pack || "pending"),
    value28: yamlScalar(researchFrontmatter.pattern_pack_lock || "pending"),
    value29: yamlScalar(researchFrontmatter.pattern_pack_contract_fingerprint || "pending"),
    value30: String(researchFrontmatter.repository_research_required || "false").toLowerCase() === "true" ? "true" : "false",
    value31: repositoryPolicy,
    value32: repositoryMode,
    value33: repositoryStatus,
    value34: yamlScalar(researchFrontmatter.repository_research_completed_at || "pending"),
    value35: repositoryOnlineStatus,
    value36: yamlScalar(researchFrontmatter.repository_research_lock || (researchFrontmatter.repository_research_status === "not-applicable" ? "not-applicable" : "pending")),
    value37: Number(researchFrontmatter.repository_candidate_count || 0) || 0,
    value38: repositoryAdoptionStatus,
    value39: repositoryScopes.length ? repositoryScopes.map((scope) => `  - ${yamlScalar(scope)}`).join("\n") : "  - not-applicable",
    value40: researchFrontmatter.external_evidence_count || 0,
    value41: JSON.stringify(evidenceTopics),
    value42: yamlScalar(researchFrontmatter.external_research_lock || "pending"),
    value43: yamlScalar(researchFrontmatter.synthesis_lock || "pending"),
    value44: yamlScalar(researchFrontmatter.research_content_lock || "pending"),
    value45: experimental ? "true" : "false",
    value46: experimentalOverrides.length ? `\n${experimentalOverrides.map((item) => `  - ${yamlScalar(item)}`).join("\n")}` : " []",
    value47: outcome?.status || "missing",
    value48: yamlScalar(outcome?.id || "missing"),
    value49: yamlScalar(outcome?.semanticLock || "pending"),
    value50: yamlScalar(outcome?.documentLock || "pending"),
    value51: outcome?.approvalValid ? "valid" : "pending",
    value52: deliveryGit.status,
    value53: deliveryGit.revision || "pending",
    value54: headless ? "pending-live-check" : "pending-registry",
    value55: headless ? "  - interfaces/manifest.json\n  - scripts/agent-cli.mjs\n  - scripts/healthcheck.mjs" : apiProcess ? "  - operations/manifest.json\n  - scripts/service-control.mjs\n  - scripts/server.mjs\n  - scripts/healthcheck.mjs" : "  - operations/manifest.json\n  - scripts/control-center-runtime.mjs\n  - scripts/control-center-agent-service.mjs\n  - scripts/healthcheck.mjs",
    value56: headless ? " []" : "\n  - Registry must be rebuilt after scaffold before the card appears in Agents.",
    value57: headless ? "  - Inspect the own-instance identity catalog and current result readiness." : "  - node scripts/pritha.mjs registry",
    value58: agentSlug,
    value59: markdownValue(data.agentName || agentSlug, "agent", 300),
    value60: date,
    value61: reportStatus,
    value62: markdownValue(data.agentName || "unknown", "unknown", 300),
    value63: markdownValue(targetFolder, ".", 500),
    value64: markdownValue(data.relPath, "missing", 500),
    value65: markdownValue(outcome ? `${outcome.status} (${outcome.relPath})` : "missing; create a proposal before outcome delivery", "missing", 700),
    value66: outcome?.approvalValid ? "valid" : "pending",
    value67: deliveryGit.status,
    value68: deliveryGit.revision ? ` (${deliveryGit.revision})` : "",
    value69: markdownValue(data.runtimeFamily || "unknown", "unknown", 120),
    value70: capability.adapter || "unknown",
    value71: markdownValue(data.primaryInterface || "unknown", "unknown", 500),
    value72: markdownValue(data.telegramMode || "none", "none", 120),
    value73: markdownValue(operationProfile.deploymentTarget, "unknown", 500),
    value74: markdownValue(operationProfile.deploymentProfile, "unknown", 300),
    value75: memoryProfileFor(data),
    value76: toolProfilesFor(data).join(", "),
    value77: skillPolicyFor(data).skillNeeds,
    value78: skillPolicyFor(data).allowedSkillSources,
    value79: skillPolicyFor(data).skillInstallMode,
    value80: skillPolicyFor(data).skillMutationPolicy,
    value81: markdownValue(`${research.status}${research.path ? ` (${research.path})` : ""}`, "missing", 700),
    value82: researchGateStatusLabel(research),
    value83: externalVerification,
    value84: research.gate?.frontmatter?.repository_research_status || "not-applicable",
    value85: data.repositoryAdoptionMode || "none",
    value86: data.repositoryAdoptionMode === "selected-module" ? "provenance recorded; code not installed" : "not-applicable",
    value87: controlCenterServiceMode,
    value88: operationProfile.autostart,
    value89: controlCenterLocalUrl,
    value90: controlCenterHealthUrl,
    value91: operationProfile.proactiveMode,
    value92: productionReady
  ? "scaffold created; structural and research gates passed; Outcome verification and user acceptance remain separate"
  : scaffoldOk
    ? "scaffold created; structural checks passed, but production gates are pending or failed"
    : "scaffold created, but structural checks failed",
    value93: experimental ? "yes" : "no",
    value94: markdownValue(experimentalOverrides.join(", ") || "none", "none", 500),
    value95: experimental ? "## Experimental Override Warning\n\nThis scaffold bypassed one or more production gates. It is not evidence of production readiness, dependency approval or repository adoption. Resolve every override and create a fresh verified scaffold report before production use.\n" : "",
    value96: createdFiles.map((file) => `- ${markdownValue(file, "unknown", 500)}`).join("\n"),
    value97: markdownValue(data.secretsRequired || (telegramApplicable ? "Telegram bot token and allowed user ids" : "none known yet"), "none known yet", 600),
    value98: controlCenterServiceMode,
    value99: operationProfile.autostart,
    value100: smokeResult.ok ? "pass" : "fail",
    value101: smokeResult.ok ? "pass" : "fail",
    value102: markdownValue(smokeResult.output, "no output", 1200),
    value103: healthResult.ok ? "pass" : "fail",
    value104: markdownValue(healthResult.output, "no output", 1200),
    value105: telegramApplicable ? "pending" : "not-applicable",
    value106: telegramApplicable ? "Fill .env and run npm run telegram:healthcheck" : "Telegram not selected",
    value107: apiProcess ? "node scripts/deploy-service.mjs status (scaffold-only)" : "node scripts/operations-status.mjs",
    value108: research.status,
    value109: research.path || "Run `node scripts/pritha.mjs research <contract>` before production scaffold decisions",
    value110: markdownValue(researchGateResultLabel(research), "pending", 80),
    value111: markdownValue(researchGateReasons(research), "none", 1200),
    value112: gateFields.memoryResearch || "pending",
    value113: externalVerification,
    value114: gateFields.synthesis || "pending",
    value115: research.gate?.frontmatter?.repository_research_status || "not-applicable",
    value116: data.repositoryAdoptionMode === "reference-only" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable",
    value117: data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable",
    value118: markdownValue(data.repositoryPin),
    value119: data.repositoryAdoptionMode === "selected-module" ? (repositoryResearchCandidate?.verified_module_type === "tree" ? "pass" : "pending") : "not-applicable",
    value120: markdownValue(`${repositoryResearchCandidate?.verified_module_path || "not-applicable"}; tree ${repositoryResearchCandidate?.verified_module_sha || "not-applicable"}; ${repositoryResearchCandidate?.verification_source_url || "not-applicable"}`, "not-applicable", 1200),
    value121: data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable",
    value122: markdownValue(data.repositoryLicenseDecision),
    value123: data.repositoryAdoptionMode === "selected-module" ? (repositoryLicenseEvidence?.license_source_url ? "pass" : "pending") : "not-applicable",
    value124: markdownValue(repositoryLicenseEvidence?.license_source_url, "not-applicable", 900),
    value125: data.repositoryAdoptionMode === "selected-module" ? (repositoryLicenseEvidence?.license_source_blob_sha && repositoryLicenseEvidence?.license_source_content_sha256 ? "pass" : "pending") : "not-applicable",
    value126: markdownValue(repositoryLicenseEvidence?.license_source_blob_sha, "not-applicable", 160),
    value127: markdownValue(repositoryLicenseEvidence?.license_source_content_sha256, "not-applicable", 200),
    value128: markdownValue(repositoryLicenseEvidence?.license_source_spdx, "not-applicable", 120),
    value129: markdownValue(repositoryLicenseEvidence?.license_scope, "not-applicable", 120),
    value130: data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable",
    value131: markdownValue(`${data.repositorySecurityReview || ""}; ${data.repositoryPermissions || ""}`),
    value132: data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable",
    value133: markdownValue(`${data.repositoryEvalStatus || ""}; ${data.repositoryUserApproval || ""}`),
    value134: data.repositoryAdoptionMode === "selected-module" ? (research.gate?.ok ? "pass" : "pending") : "not-applicable",
    value135: evidenceTopics.includes("github-repository-review") ? "present" : "missing",
    value136: gateFields.synthesis || "pending",
    value137: headless ? "not-applicable" : apiProcess ? "implementation-required" : healthResult.ok ? "pass" : "fail",
    value138: headless ? "No persistent service or Control Center server selected" : apiProcess ? "Process operations metadata only; lifecycle implementation and live verification remain" : `Managed structured start/stop plus ${controlCenterHealthUrl}`,
    value139: headless ? "pending-live-check" : "pending-registry",
    value140: headless ? "Own-instance catalog discovers authored lineage; check configuration and Outcome separately" : "Rebuild registry and check live card",
    value141: agentSlug,
    value142: outcome ? "recorded" : "missing",
    value143: markdownValue(research.path, "missing"),
    value144: markdownValue(data.fingerprint, "missing"),
    value145: markdownValue(gateFields.memoryResearch, "pending"),
    value146: markdownValue(gateFields.externalResearch, "pending"),
    value147: Number(researchFrontmatter.external_evidence_count || 0),
    value148: markdownValue(evidenceTopics.join(", "), "none"),
    value149: markdownValue(researchFrontmatter.external_research_lock, "pending"),
    value150: markdownValue(gateFields.synthesis, "pending"),
    value151: markdownValue(researchFrontmatter.synthesis_lock, "pending"),
    value152: markdownValue(researchFrontmatter.repository_research_required, "false"),
    value153: markdownValue(`${researchFrontmatter.repository_research_policy || data.repositoryResearchPolicy || "auto"}; ${researchFrontmatter.repository_research_mode || "pending"}; ${repositoryScopes.join(", ") || "none"}`),
    value154: markdownValue(`${researchFrontmatter.repository_research_status || "pending"}; ${researchFrontmatter.repository_research_online_status || "pending"}`),
    value155: markdownValue(researchFrontmatter.repository_research_lock, "pending"),
    value156: Number(researchFrontmatter.repository_candidate_count || 0),
    value157: markdownValue(`${data.repositoryAdoptionMode || "none"}; ${repositoryAdoptionStatus}`),
    value158: markdownValue(`${data.selectedGitHubRepositories || "none"}; ${data.selectedRepositoryModule || "not-applicable"}`),
    value159: markdownValue(data.repositoryPin),
    value160: markdownValue(data.repositoryLicenseDecision),
    value161: markdownValue(repositoryLicenseEvidence?.license_source_url, "not-applicable", 900),
    value162: markdownValue(repositoryLicenseEvidence?.license_source_blob_sha, "not-applicable", 160),
    value163: markdownValue(repositoryLicenseEvidence?.license_source_content_sha256, "not-applicable", 200),
    value164: markdownValue(repositoryLicenseEvidence?.license_source_spdx, "not-applicable", 120),
    value165: markdownValue(repositoryLicenseEvidence?.license_scope, "not-applicable", 120),
    value166: markdownValue(`${data.repositorySecurityReview || "not-applicable"}; ${data.repositoryPermissions || "not-applicable"}`),
    value167: markdownValue(data.repositoryEvalStatus),
    value168: evidenceTopics.includes("github-repository-review") ? "present" : "not-applicable-or-missing",
    value169: markdownValue(gateFields.synthesis, "pending"),
    value170: markdownValue(data.repositoryUserApproval),
    value171: data.repositoryAdoptionMode === "selected-module" ? "not-installed" : "not-applicable",
    value172: headless ? "pending-live-check" : "pending-registry",
    value173: headless ? "CLI interface manifest and healthcheck; no service manifest is required" : "operations manifest, managed runtime scripts and healthcheck",
    value174: headless ? "discoverable from own authored lineage, runtime not-applicable, Outcome still unverified" : "visible in Agents after registry rebuild; Start Plan should be available for the generated project-local runtime",
    value175: headless ? "Check live card availability separately; scaffold alone does not establish Outcome readiness." : "Registry must be rebuilt after scaffold.",
    value176: headless ? "Use the shared own-instance identity catalog." : "From Pritha root, rebuild the registry.",
    value177: agentSlug,
    value178: apiProcess ? "node scripts/server.mjs (exits 78 until implemented)" : "node scripts/agent-cli.mjs status",
    value179: headless ? "not-applicable; use the on-demand CLI" : apiProcess ? "node scripts/service-control.mjs start (implementation-required)" : "node scripts/control-center-runtime.mjs start",
    value180: headless ? "not-applicable; a command exits after its result" : apiProcess ? "node scripts/service-control.mjs stop (implementation-required)" : "node scripts/control-center-runtime.mjs stop",
    value181: headless ? "no service or schedule selected" : apiProcess ? "read operations/manifest.json; plan/status via scripts/deploy-service.mjs" : "node scripts/operations-status.mjs",
    value182: headless ? "Ctrl+C interrupts an explicitly running foreground command" : "no long-running process is started during scaffold; use the Control Center stop action after starting it",
    value183: headless ? "read command stdout/stderr and the private host Trial receipts" : "see logs/",
    value184: apiProcess ? "workflows/user-training.md" : "docs/user-training-guide.md",
    value185: markdownValue(targetFolder, ".", 500)
  });
}

export function planScaffoldContract(contractPath) {
  const data = contractData(contractPath);
  const issues = validateContract(data.fullPath, { print: false });
  return { schema: "pritha-scaffold-preflight-v1", readinessScope: "scaffold-capability-only", contractFingerprint: data.fingerprint,
    contractStatus: contractStatus(data), issues, capability: scaffoldCapability(data) };
}

export function scaffoldContract(contractPath, options = {}) {
  const data = contractData(contractPath);
  const capability = assertScaffoldCapability(data);
  const outcomeCandidate = latestOutcomeSpecForContract(data.fullPath, { root: ROOT });
  const outcomeApproval = outcomeCandidate?.status === "approved"
    ? verifyOutcomeApproval(outcomeCandidate.path, { root: ROOT })
    : { ok: false };
  const outcome = outcomeCandidate ? { ...outcomeCandidate, approvalValid: outcomeApproval.ok } : null;
  const issues = validateContract(data.fullPath, { print: false });
  if (issues.length > 0) {
    throw new Error(`Contract is not ready for scaffold:\n- ${issues.join("\n- ")}`);
  }
  if (contractStatus(data) !== "accepted" && !options["allow-draft-scaffold"]) {
    throw new Error(`Contract status must be accepted before scaffold. Current status: ${contractStatus(data) || "unknown"}. Use --allow-draft-scaffold only for an explicit experimental scaffold.`);
  }
  const research = researchReportStatus(data);
  if (research.status !== "found" && !options["allow-missing-research"]) {
    throw new Error("Pritha memory research must be completed before scaffold. Run `node scripts/pritha.mjs research <contract>` or use --allow-missing-research only for an explicit experimental scaffold.");
  }
  const researchGate = research.gate || {
    ok: false,
    status: "pending",
    reasons: ["research_report_missing"],
  };
  if (!researchGate.ok && !options["allow-pending-external-verification"]) {
    throw new Error(`External research gate is ${researchGate.status}. Complete Pritha memory research, external evidence and synthesis before scaffold. Reasons: ${researchGate.reasons.join(", ") || "unknown"}. Use --allow-pending-external-verification only for an explicit experimental scaffold.`);
  }
  const experimentalOverrides = [
    ...(contractStatus(data) !== "accepted" && options["allow-draft-scaffold"] ? ["allow-draft-scaffold"] : []),
    ...(research.status !== "found" && options["allow-missing-research"] ? ["allow-missing-research"] : []),
    ...(!researchGate.ok && options["allow-pending-external-verification"] ? ["allow-pending-external-verification"] : []),
  ];
  const requestedTargetPath = resolveTargetPath(data, options);
  const targetPath = ensureWritableTarget(requestedTargetPath);
  ensureDirs();
  const logicalSiblingTarget = !scalar(options.output || "", "")
    && (!scalar(data.targetFolder || "", "") || /^sibling of (?:pritha|techscope)$/i.test(scalar(data.targetFolder || "", "")));
  const voiceCopyTarget = logicalSiblingTarget
    ? `sibling:${slug(data.agentName)}`
    : (path.relative(ROOT, targetPath) || ".");

  const createdFiles = [];
  for (const file of generatedAgentFiles(data, {
    research,
    experimental: experimentalOverrides.length > 0,
    voiceCopyTarget,
    outcome,
  })) {
    createdFiles.push(writeProjectFile(targetPath, file.path, file.content));
  }

  const smokeResult = runSmoke(targetPath);
  const healthResult = runHealthcheck(targetPath);
  const deliveryGit = smokeResult.ok && healthResult.ok
    ? initializeDeliveryGit(targetPath, data)
    : { ok: false, status: "skipped-structural-failure", revision: null };
  const writtenReport = writeLifecycleReport(
    path.join(REPORT_DIR, `${today()}-${slug(data.agentName)}-scaffold-report.md`),
    ({ artifactId }) => scaffoldReportMarkdown(data, targetPath, createdFiles, smokeResult, {
      research,
      healthResult,
      deliveryGit,
      experimentalOverrides,
      outcome,
      artifactId,
      capability,
    }),
    { projectRoot: targetPath, stateRoot: process.env.PRITHA_STATE_ROOT, root: ROOT },
  );
  const reportPath = writtenReport.path;

  console.log(`Scaffold: ${targetPath}`);
  console.log(`Created files: ${createdFiles.length}`);
  console.log(`Smoke test: ${smokeResult.ok ? "pass" : "fail"}`);
  console.log(`Healthcheck: ${healthResult.ok ? "pass" : "fail"}`);
  console.log(`Delivery Git baseline: ${deliveryGit.status}`);
  console.log(`Scaffold report: ${path.relative(ROOT, reportPath)}`);
  console.log(`Outcome Spec: ${outcome ? `${outcome.status}${outcome.approvalValid ? " (approval valid)" : " (approval pending)"}` : "missing; run outcome init"}`);
  if (contractStatus(data) !== "accepted") {
    console.log(`Warning: scaffold created from ${contractStatus(data) || "unknown"} contract because --allow-draft-scaffold was set.`);
  }
  if (experimentalOverrides.length) {
    console.log(`Warning: experimental scaffold overrides: ${experimentalOverrides.join(", ")}. This is not production readiness evidence.`);
  }
  if (!smokeResult.ok || !healthResult.ok || !deliveryGit.ok) {
    console.log([smokeResult.ok ? "" : smokeResult.output, healthResult.ok ? "" : healthResult.output, deliveryGit.ok ? "" : deliveryGit.error].filter(Boolean).join("\n"));
    process.exitCode = 1;
  }
  return { targetPath, reportPath, createdFiles, smokeResult, healthResult, deliveryGit, outcome, experimentalOverrides, capability };
}
