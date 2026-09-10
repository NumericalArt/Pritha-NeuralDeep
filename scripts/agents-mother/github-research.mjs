import { createHash } from "node:crypto";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";
import {
  containsHighRiskInstruction,
  quarantineUntrustedInstructionText,
  redactSensitiveText,
} from "../lib/redaction.mjs";
import { contentSha256 } from "../lib/markdown-content-lock.mjs";
import {
  fetchGitHubRepositorySnapshot,
  githubRepositoryContentUrlMatches,
  normalizeGitHubApiRepository,
  normalizeGitHubRepositoryUrl,
  normalizeRepositoryModulePath,
  plannedGitHubRepositoryQueries,
  readGitHubRepositoryRegistry,
  searchGitHubRepositoryCandidates,
} from "../lib/github-repository-radar.mjs";
import {
  REPOSITORY_ADOPTION_MODES,
  REPOSITORY_RESEARCH_SCOPES,
  canonicalRepositoryPin,
  parseRepositoryResearchTopics,
} from "./contract.mjs";

export const REPOSITORY_RESEARCH_POLICIES = new Set(["auto", "required", "registry-only", "not-applicable"]);
export const REPOSITORY_RESEARCH_MODES = new Set(["auto", "online", "registry-only", "skip"]);
const REPOSITORY_RESEARCH_PAYLOAD_MARKER = "pritha-github-repository-research-v1";
const AUTHORITATIVE_DISCOVERY_SOURCES = new Set(["github-api", "github-fixture", "github-search", "registry"]);
const ADVISORY_REGISTRY_STATUSES = new Set(["candidate", "accepted-for-review"]);
const KNOWN_REGISTRY_STATUSES = new Set([
  ...ADVISORY_REGISTRY_STATUSES,
  "archived",
  "rejected",
  "explicit-unverified",
  "explicit-verified",
  "unregistered-candidate",
]);

const SCOPE_KEYWORDS = Object.freeze({
  "agent-harness": ["agent-harness", "harness", "agent-runtime", "runtime", "gateway", "subagents", "workflow", "agent-loops"],
  "agent-memory": ["agent-memory", "memory", "vector", "rag", "embeddings", "code-memory", "knowledge"],
  "agent-evals": ["agent-evals", "evals", "evaluation", "benchmark", "scanner", "security", "testing", "qa"],
  "mcp-tools": ["mcp-tools", "mcp", "tools", "connector", "server", "tooling"],
  "agent-skills": ["agent-skills", "skills", "skill-pack", "workflow", "procedural"],
  "agent-interface": ["agent-interface", "interface", "web", "ui", "control-center", "chat"],
  "agent-voice": ["agent-voice", "voice", "speech", "audio", "tts", "stt", "realtime"],
  "agent-operations": ["agent-operations", "operations", "deployment", "scheduler", "cron", "sandbox", "observability"],
});

const EXTERNAL_TOPIC_SCOPES = Object.freeze({
  "openai-agents-sdk": ["agent-harness", "agent-evals"],
  "local-inference-runtime": ["agent-harness", "agent-evals"],
  "platform-runtime-compatibility": ["agent-harness", "agent-evals"],
  "mcp-connectors": ["mcp-tools", "agent-evals"],
  "memory-rag-storage": ["agent-memory", "agent-evals"],
  "declared-dependencies": ["agent-harness"],
  "untrusted-input-security": ["agent-evals"],
  "interface-runtime-security": ["agent-interface", "agent-evals"],
  "openai-realtime": ["agent-voice", "agent-interface", "agent-evals"],
  "telegram-bot-api": ["agent-interface", "agent-evals"],
  "operations-deployment": ["agent-operations", "agent-evals"],
  "github-repository-review": ["agent-harness", "agent-evals"],
});

function compact(value, max = 800) {
  const text = redactSensitiveText(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function compactUntrusted(value, max = 800) {
  const text = quarantineUntrustedInstructionText(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function untrustedPayloadStrings(value) {
  const strings = [];
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === "string") {
      strings.push(current);
    } else if (Array.isArray(current)) {
      stack.push(...current);
    } else if (current && typeof current === "object") {
      stack.push(...Object.values(current));
    }
  }
  return strings;
}

function untrustedPayloadTextIsSafe(value) {
  const text = String(value || "");
  return redactSensitiveText(text) === text && !containsHighRiskInstruction(text);
}

function repositoryLicense(value) {
  const text = compact(value, 120);
  if (!text || /^(?:a|an|and|license|noassertion|none|unknown|unlicensed)$/i.test(text)) return "unknown";
  if (text.length < 2 || !/[A-Za-z]/.test(text) || !/^[A-Za-z0-9][A-Za-z0-9.+() -]{1,119}$/.test(text)) return "unknown";
  return text;
}

function yamlScalar(value) {
  const text = compact(value, 1000);
  return text || "none";
}

function markdownCell(value) {
  return quarantineUntrustedInstructionText(compact(value, 280))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ") || "none";
}

function listValue(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function repositoryResearchPayload(research) {
  return {
    schema: REPOSITORY_RESEARCH_PAYLOAD_MARKER,
    render_sha256: contentSha256(repositoryResearchRenderedMarkdown(research)),
    plan: {
      policy: research.plan.policy,
      mode: research.plan.mode,
      required: Boolean(research.plan.required),
      scopes: [...research.plan.scopes],
      selected_repositories: [...(research.plan.selectedRepositories || [])].map((repository) => repository.url),
      selected_pin: compact(research.plan.selectedPin, 160),
      selected_module: compact(research.plan.selectedModule, 400),
      adoption_mode: research.plan.adoptionMode,
      limit: research.plan.limit,
    },
    status: research.status,
    completed_at: research.completedAt,
    online_status: research.onlineStatus,
    registry: {
      ok: Boolean(research.registry.ok),
      path: compact(research.registry.relativePath, 400),
    },
    queries: [...research.queries].map((query) => compact(query, 300)),
    candidates: research.candidates.map((candidate) => ({
      repository: candidate.repository?.url || "",
      source: compactUntrusted(candidate.source, 40),
      discovery_source: compactUntrusted(candidate.discoverySource || candidate.source, 40),
      fit_scopes: [...(candidate.fitScopes || [])],
      registry_status: compactUntrusted(candidate.registryStatus, 80),
      stars: Number(candidate.stars || 0),
      license: compactUntrusted(candidate.license, 120),
      updated_at: compactUntrusted(candidate.updatedAt, 80),
      pushed_at: compactUntrusted(candidate.pushedAt, 80),
      default_branch: compactUntrusted(candidate.defaultBranch, 120),
      head_sha: compactUntrusted(candidate.headSha, 120),
      verified_pin_sha: compactUntrusted(candidate.verifiedPinSha, 120),
      verified_module_path: compactUntrusted(candidate.verifiedModulePath, 400),
      verified_module_sha: compactUntrusted(candidate.verifiedModuleSha, 120),
      verified_module_type: compactUntrusted(candidate.verifiedModuleType, 40),
      verification_source_url: compactUntrusted(candidate.verificationSourceUrl, 600),
      verified_license_path: compactUntrusted(candidate.verifiedLicensePath, 500),
      verified_license_blob_sha: compactUntrusted(candidate.verifiedLicenseBlobSha, 120),
      verified_license_content_sha256: compactUntrusted(candidate.verifiedLicenseContentSha256, 120),
      verified_license_spdx: compactUntrusted(candidate.verifiedLicenseSpdx, 160),
      verified_license_source_url: compactUntrusted(candidate.verifiedLicenseSourceUrl, 700),
      verified_license_scope: compactUntrusted(candidate.verifiedLicenseScope, 80),
      latest_release_tag: compactUntrusted(candidate.latestReleaseTag, 120),
      retrieved_at: compactUntrusted(candidate.retrievedAt, 80),
      archived: Boolean(candidate.archived),
      fork: Boolean(candidate.fork),
      decision: compactUntrusted(candidate.decision, 40),
      blockers: [...(candidate.blockers || [])].map((blocker) => compactUntrusted(blocker, 120)),
    })),
    errors: research.errors.map((error) => compactUntrusted(error, 300)),
  };
}

function repositoryResearchLock(research) {
  if (research.status === "not-applicable") return "not-applicable";
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(repositoryResearchPayload(research)))).digest("hex")}`;
}

function repositoryResearchMachineComment(research) {
  if (research.status === "not-applicable") return "";
  const encoded = Buffer.from(JSON.stringify(canonicalize(repositoryResearchPayload(research))), "utf8").toString("base64url");
  return `<!-- ${REPOSITORY_RESEARCH_PAYLOAD_MARKER} ${encoded} -->`;
}

function frontmatterList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

export function verifyRepositoryResearchIntegrity(reportText) {
  const frontmatter = parseFrontmatterData(String(reportText || "")) || {};
  const reasons = [];
  const match = String(reportText || "").match(new RegExp(`<!--\\s*${REPOSITORY_RESEARCH_PAYLOAD_MARKER}\\s+([A-Za-z0-9_-]+)\\s*-->`));
  let payload = null;
  try {
    if (match) {
      const decoded = Buffer.from(match[1], "base64url").toString("utf8");
      if (decoded.length <= 1_000_000) payload = parseBoundedJson(decoded, { maxBytes: 1_000_000, maxDepth: 20, maxNodes: 10_000 });
    }
  } catch {
    payload = null;
  }
  if (!payload || payload.schema !== REPOSITORY_RESEARCH_PAYLOAD_MARKER) {
    reasons.push("repository_research_payload_missing_or_malformed");
    return { ok: false, reasons, payload: null };
  }
  const renderedSection = String(reportText || "").match(/^## GitHub Repository Research\s*\n[\s\S]*?(?=^##\s|(?![\s\S]))/m)?.[0] || "";
  if (!/^sha256:[a-f0-9]{64}$/i.test(String(payload.render_sha256 || ""))) {
    reasons.push("repository_research_render_lock_invalid");
  } else if (payload.render_sha256 !== contentSha256(renderedSection)) {
    reasons.push("repository_research_render_mismatch");
  }
  const payloadPlan = payload.plan && typeof payload.plan === "object" && !Array.isArray(payload.plan)
    ? payload.plan
    : {};
  if (payloadPlan !== payload.plan) reasons.push("repository_research_plan_invalid");
  const rawPayloadScopes = Array.isArray(payloadPlan.scopes) ? payloadPlan.scopes : [];
  const payloadScopes = rawPayloadScopes.map((scope) => typeof scope === "string" ? scope : "");
  const payloadCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const payloadQueries = Array.isArray(payload.queries) ? payload.queries : [];
  const untrustedStrings = untrustedPayloadStrings({
    candidates: payloadCandidates,
    errors: Array.isArray(payload.errors) ? payload.errors : [],
  });
  if (untrustedStrings.some((value) => !untrustedPayloadTextIsSafe(value))) {
    reasons.push("repository_research_untrusted_payload_not_quarantined");
  }
  const rawSelectedRepositories = Array.isArray(payloadPlan.selected_repositories)
    ? payloadPlan.selected_repositories
    : [];
  const selectedRepositories = Array.isArray(payloadPlan.selected_repositories)
    ? rawSelectedRepositories.map((repository) => typeof repository === "string" ? repository : "")
    : [];
  const expectedLock = `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex")}`;
  if (frontmatter.repository_research_lock !== expectedLock) reasons.push("repository_research_lock_mismatch");
  if (String(frontmatter.repository_research_status || "") !== String(payload.status || "")) reasons.push("repository_research_status_mismatch");
  if (String(frontmatter.repository_research_policy || "") !== String(payloadPlan.policy || "")) reasons.push("repository_research_policy_mismatch");
  if (String(frontmatter.repository_research_mode || "") !== String(payloadPlan.mode || "")) reasons.push("repository_research_mode_mismatch");
  if (String(frontmatter.repository_research_online_status || "") !== String(payload.online_status || "")) reasons.push("repository_research_online_status_mismatch");
  if (String(frontmatter.repository_research_completed_at || "") !== String(payload.completed_at || "")) reasons.push("repository_research_completed_at_mismatch");
  if (String(frontmatter.repository_research_required || "") !== String(Boolean(payloadPlan.required))) reasons.push("repository_research_required_mismatch");
  if (typeof payloadPlan.required !== "boolean") reasons.push("repository_research_required_invalid");
  const expectedAdoptionStatus = payloadPlan.adoption_mode === "selected-module" ? "pending-review" : payloadPlan.adoption_mode;
  if (String(frontmatter.repository_adoption_status || "") !== String(expectedAdoptionStatus || "none")) reasons.push("repository_adoption_status_mismatch");
  if (Number(frontmatter.repository_candidate_count) !== payloadCandidates.length) reasons.push("repository_candidate_count_mismatch");
  const frontmatterScopes = frontmatterList(frontmatter.repository_research_scopes).filter((scope) => scope !== "not-applicable").sort();
  if (JSON.stringify(frontmatterScopes) !== JSON.stringify([...payloadScopes].sort())) reasons.push("repository_research_scopes_mismatch");
  if (!Array.isArray(payloadPlan.scopes)
    || rawPayloadScopes.length > Object.keys(SCOPE_KEYWORDS).length
    || rawPayloadScopes.some((scope) => typeof scope !== "string" || !Object.hasOwn(SCOPE_KEYWORDS, scope))
    || new Set(rawPayloadScopes).size !== rawPayloadScopes.length) {
    reasons.push("repository_research_scopes_invalid");
  }
  if (!Array.isArray(payloadPlan.selected_repositories)
    || rawSelectedRepositories.some((repository) => typeof repository !== "string")) {
    reasons.push("repository_selected_repositories_invalid");
  }
  if (selectedRepositories.length > 10) reasons.push("repository_selected_repositories_limit_exceeded");
  if (typeof payloadPlan.selected_pin !== "string") reasons.push("repository_selected_pin_invalid");
  if (typeof payloadPlan.selected_module !== "string") reasons.push("repository_selected_module_invalid");
  if (selectedRepositories.some((repository) => normalizeGitHubRepositoryUrl(repository)?.url !== repository)) {
    reasons.push("repository_selected_repository_url_invalid");
  }
  if (new Set(selectedRepositories.map((repository) => repository.toLowerCase())).size !== selectedRepositories.length) {
    reasons.push("repository_selected_repositories_duplicate");
  }
  if (!Number.isInteger(payloadPlan.limit) || payloadPlan.limit < 1 || payloadPlan.limit > 10) {
    reasons.push("repository_research_limit_invalid");
  } else if (payloadPlan.limit < selectedRepositories.length) {
    reasons.push("repository_research_limit_below_selected_count");
  }
  if (!REPOSITORY_RESEARCH_POLICIES.has(payloadPlan.policy)) reasons.push("repository_research_policy_invalid");
  if (!REPOSITORY_RESEARCH_MODES.has(payloadPlan.mode)) reasons.push("repository_research_mode_invalid");
  if (!REPOSITORY_ADOPTION_MODES.has(payloadPlan.adoption_mode)) reasons.push("repository_research_adoption_mode_invalid");
  if (payloadPlan.adoption_mode === "reference-only" && selectedRepositories.length < 1) {
    reasons.push("repository_reference_selection_count_invalid");
  }
  if (payloadPlan.adoption_mode === "selected-module") {
    if (selectedRepositories.length !== 1) reasons.push("repository_selected_module_selection_count_invalid");
    if (canonicalRepositoryPin(payloadPlan.selected_pin) !== payloadPlan.selected_pin) reasons.push("repository_selected_pin_not_canonical");
    if (normalizeRepositoryModulePath(payloadPlan.selected_module) !== payloadPlan.selected_module) reasons.push("repository_selected_module_path_invalid");
  }
  if (!Array.isArray(payload.candidates) || payloadCandidates.length > 10) reasons.push("repository_candidate_count_invalid");
  const allowedQueries = new Set(payloadScopes.flatMap((scope) => plannedGitHubRepositoryQueries(scope)));
  if (!Array.isArray(payload.queries)
    || payloadQueries.length > 30
    || payloadQueries.some((query) => typeof query !== "string" || !allowedQueries.has(query))) {
    reasons.push("repository_research_query_not_allowlisted");
  }
  if (!Array.isArray(payload.errors)
    || payload.errors.length > 100
    || payload.errors.some((error) => typeof error !== "string" || error.length > 300)) {
    reasons.push("repository_research_errors_invalid");
  }
  if (!payload.registry || typeof payload.registry !== "object" || Array.isArray(payload.registry)
    || typeof payload.registry.ok !== "boolean" || typeof payload.registry.path !== "string") {
    reasons.push("repository_research_registry_invalid");
  }
  if (typeof payload.status !== "string" || typeof payload.completed_at !== "string" || typeof payload.online_status !== "string") {
    reasons.push("repository_research_status_fields_invalid");
  }
  if (!new Set(["complete", "fixture", "registry-only", "not-applicable", "skipped", "failed"]).has(payload.online_status)) {
    reasons.push("repository_research_online_status_invalid");
  }
  for (const candidate of payloadCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      reasons.push("repository_candidate_invalid");
      continue;
    }
    if (normalizeGitHubRepositoryUrl(candidate.repository)?.url !== candidate.repository) reasons.push("repository_candidate_url_invalid");
    if (!["explicit", "github-fixture", "github-search", "registry"].includes(candidate.source)) reasons.push("repository_candidate_source_invalid");
    if (candidate.discovery_source !== "explicit-unverified" && !AUTHORITATIVE_DISCOVERY_SOURCES.has(candidate.discovery_source)) reasons.push("repository_candidate_discovery_source_invalid");
    if (!KNOWN_REGISTRY_STATUSES.has(candidate.registry_status)) reasons.push("repository_candidate_registry_status_invalid");
    if (!Array.isArray(candidate.fit_scopes)
      || candidate.fit_scopes.length > Object.keys(SCOPE_KEYWORDS).length
      || candidate.fit_scopes.some((scope) => typeof scope !== "string" || !Object.hasOwn(SCOPE_KEYWORDS, scope))
      || new Set(candidate.fit_scopes).size !== candidate.fit_scopes.length) {
      reasons.push("repository_candidate_scope_invalid");
    }
    if (!["candidate", "reference-only", "reject", "selected"].includes(candidate.decision)) reasons.push("repository_candidate_decision_invalid");
    if (typeof candidate.stars !== "number" || !Number.isSafeInteger(candidate.stars) || candidate.stars < 0) reasons.push("repository_candidate_stars_invalid");
    if (typeof candidate.archived !== "boolean" || typeof candidate.fork !== "boolean") reasons.push("repository_candidate_boolean_fields_invalid");
    if (!Array.isArray(candidate.blockers)
      || candidate.blockers.length > 100
      || candidate.blockers.some((blocker) => typeof blocker !== "string" || blocker.length > 120)) {
      reasons.push("repository_candidate_blockers_invalid");
    }
    for (const field of ["license", "updated_at", "pushed_at", "default_branch", "head_sha", "latest_release_tag", "retrieved_at"]) {
      if (typeof candidate[field] !== "string") reasons.push(`repository_candidate_${field}_invalid`);
    }
    if (candidate.archived === true && candidate.decision !== "reject") reasons.push("repository_archived_candidate_not_rejected");
    if (typeof candidate.verified_pin_sha !== "string") reasons.push("repository_candidate_verified_pin_invalid");
    if (typeof candidate.verified_module_path !== "string") reasons.push("repository_candidate_verified_module_path_invalid");
    if (typeof candidate.verified_module_sha !== "string") reasons.push("repository_candidate_verified_module_sha_invalid");
    if (typeof candidate.verified_module_type !== "string") reasons.push("repository_candidate_verified_module_type_invalid");
    if (typeof candidate.verification_source_url !== "string") reasons.push("repository_candidate_verification_source_invalid");
    if (typeof candidate.verified_license_path !== "string") reasons.push("repository_candidate_verified_license_path_invalid");
    if (typeof candidate.verified_license_blob_sha !== "string") reasons.push("repository_candidate_verified_license_blob_sha_invalid");
    if (typeof candidate.verified_license_content_sha256 !== "string") reasons.push("repository_candidate_verified_license_content_sha256_invalid");
    if (typeof candidate.verified_license_spdx !== "string") reasons.push("repository_candidate_verified_license_spdx_invalid");
    if (typeof candidate.verified_license_source_url !== "string") reasons.push("repository_candidate_verified_license_source_invalid");
    if (typeof candidate.verified_license_scope !== "string") reasons.push("repository_candidate_verified_license_scope_invalid");
    if (candidate.verified_module_path && normalizeRepositoryModulePath(candidate.verified_module_path) !== candidate.verified_module_path) {
      reasons.push("repository_candidate_verified_module_path_unsafe");
    }
    if (candidate.verified_module_sha && candidate.verified_module_sha !== "unknown" && !/^[a-f0-9]{40}$/i.test(candidate.verified_module_sha)) {
      reasons.push("repository_candidate_verified_module_sha_malformed");
    }
    if (candidate.verified_module_type && candidate.verified_module_type !== "unknown" && !["blob", "tree"].includes(candidate.verified_module_type)) {
      reasons.push("repository_candidate_verified_module_type_unsafe");
    }
  }
  if (payloadPlan.adoption_mode === "reference-only") {
    for (const repository of selectedRepositories) {
      const candidate = payloadCandidates.find((item) => String(item?.repository || "").toLowerCase() === repository.toLowerCase());
      if (!candidate
        || candidate.archived
        || candidate.decision === "reject"
        || (candidate.discovery_source === "registry" && !ADVISORY_REGISTRY_STATUSES.has(candidate.registry_status))
        || !AUTHORITATIVE_DISCOVERY_SOURCES.has(candidate.discovery_source)) {
        reasons.push(`repository_reference_candidate_unverified:${repository}`);
      }
    }
  }
  if (payloadPlan.adoption_mode === "selected-module") {
    const expectedPinSha = String(payloadPlan.selected_pin || "").replace(/^(?:commit|tree-sha):/, "");
    const expectedDiscoverySource = payload.online_status === "fixture"
      ? "github-fixture"
      : payload.online_status === "complete"
        ? "github-api"
        : "";
    for (const repository of selectedRepositories) {
      const candidate = payloadCandidates.find((item) => String(item?.repository || "").toLowerCase() === repository.toLowerCase());
      if (!candidate) {
        reasons.push("repository_selected_module_candidate_missing");
        continue;
      }
      if (candidate.archived || candidate.decision === "reject") {
        reasons.push("repository_selected_module_candidate_unavailable");
      }
      if (!expectedDiscoverySource || candidate.discovery_source !== expectedDiscoverySource) {
        reasons.push("repository_selected_module_discovery_source_invalid");
      }
      if (String(candidate.verified_pin_sha || "").toLowerCase() !== expectedPinSha) reasons.push("repository_selected_pin_unverified");
      if (candidate.verified_module_path !== payloadPlan.selected_module
        || !/^[a-f0-9]{40}$/i.test(String(candidate.verified_module_sha || ""))
        || candidate.verified_module_type !== "tree"
        || !githubRepositoryContentUrlMatches(
          candidate.verification_source_url,
          candidate.repository,
          "tree",
          expectedPinSha,
          payloadPlan.selected_module,
        )) {
        reasons.push("repository_selected_module_unverified");
      }
      const verifiedLicensePath = typeof candidate.verified_license_path === "string" ? candidate.verified_license_path : "";
      const verifiedLicenseBlobSha = typeof candidate.verified_license_blob_sha === "string" ? candidate.verified_license_blob_sha : "";
      if (!verifiedLicensePath.startsWith(`${payloadPlan.selected_module}/`)
        || !/^[a-f0-9]{40}$/i.test(verifiedLicenseBlobSha)
        || !/^sha256:[a-f0-9]{64}$/i.test(`sha256:${String(candidate.verified_license_content_sha256 || "").replace(/^sha256:/i, "")}`)
        || !candidate.verified_license_spdx
        || candidate.verified_license_scope !== "module-local"
        || !githubRepositoryContentUrlMatches(
          candidate.verified_license_source_url,
          candidate.repository,
          "blob",
          expectedPinSha,
          verifiedLicensePath,
        )) {
        reasons.push("repository_selected_module_license_unverified");
      }
    }
  }
  if (payload.status !== "complete") reasons.push("repository_research_payload_not_complete");
  if (payload.online_status === "failed") reasons.push("repository_research_online_failed");
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], payload };
}

export function extractGitHubRepositoryUrls(value) {
  const matches = String(value || "").match(/(?:https?:\/\/github\.com\/[^\s,;`]+|git@github\.com:[^\s,;`]+)/gi) || [];
  const repositories = matches.map(normalizeGitHubRepositoryUrl).filter(Boolean);
  const seen = new Set();
  return repositories.filter((repository) => {
    const key = repository.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nontrivial(value) {
  const text = String(value || "").trim().replace(/[.\s]+$/g, "");
  return Boolean(text && !/^(none|minimal|unknown|tbd|not-applicable|auto)$/i.test(text));
}

function recentDate(value, windowDays = 30) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return false;
  const ageDays = (Date.now() - timestamp) / 86_400_000;
  return ageDays >= -1 && ageDays <= windowDays;
}

function normalizedPolicy(data = {}) {
  const policy = String(data.repositoryResearchPolicy || "auto").trim().toLowerCase();
  if (!REPOSITORY_RESEARCH_POLICIES.has(policy)) {
    throw new Error("Invalid repository research policy. Expected auto, required, registry-only or not-applicable.");
  }
  return policy;
}

function normalizedMode(policy, options = {}) {
  const requested = String(options.githubMode || options["github-mode"] || "auto").trim().toLowerCase();
  if (!REPOSITORY_RESEARCH_MODES.has(requested)) {
    throw new Error("Invalid GitHub repository research mode. Expected auto, online, registry-only or skip.");
  }
  if (policy === "not-applicable") return "skip";
  if (policy === "registry-only") return "registry-only";
  return requested;
}

function normalizedAdoptionMode(data = {}) {
  const mode = String(data.repositoryAdoptionMode || "none").trim().toLowerCase();
  if (!REPOSITORY_ADOPTION_MODES.has(mode)) {
    throw new Error("Invalid repository adoption mode. Expected none, reference-only or selected-module.");
  }
  return mode;
}

function addScope(scopes, value) {
  if (REPOSITORY_RESEARCH_SCOPES.has(value) && Object.hasOwn(SCOPE_KEYWORDS, value)) scopes.add(value);
}

export function deriveRepositoryResearchPlan(data = {}, externalTopics = [], options = {}) {
  const policy = normalizedPolicy(data);
  const mode = normalizedMode(policy, options);
  const adoptionMode = normalizedAdoptionMode(data);
  const scopes = new Set();
  const explicitTopics = parseRepositoryResearchTopics(data.repositoryResearchTopics);
  if (explicitTopics.invalid.length > 0 || explicitTopics.ambiguous) {
    throw new Error("Invalid repository research topics. Use only documented allowlisted scopes or one sentinel value.");
  }
  for (const scope of explicitTopics.scopes) addScope(scopes, scope);
  for (const topic of externalTopics || []) {
    for (const scope of EXTERNAL_TOPIC_SCOPES[topic.id] || []) addScope(scopes, scope);
    if (String(topic.id || "").startsWith("pattern-")) {
      const patternText = [topic.topic, topic.query, topic.reason].filter(Boolean).join(" ").toLowerCase();
      for (const [scope, keywords] of Object.entries(SCOPE_KEYWORDS)) {
        if (keywords.some((keyword) => patternText.includes(keyword))) addScope(scopes, scope);
      }
    }
  }

  const text = [
    data.runtimeFamily,
    data.memoryModel,
    data.indexingSearchNeeds,
    data.toolSystem,
    data.skillNeeds,
    data.allowedSkillSources,
    data.mcpNeeds,
    data.allowedMcpSources,
    data.selectedMcpConnectors,
    data.candidateMcpConnectors,
  ].filter(Boolean).join(" ").toLowerCase();

  if (data.runtimeFamily && data.runtimeFamily !== "codex-native") addScope(scopes, "agent-harness");
  if (/\b(vector|rag|embedding|semantic|graph|memory)\b/.test(text)) addScope(scopes, "agent-memory");
  if (/\b(mcp|connector|tool server)\b/.test(text)) addScope(scopes, "mcp-tools");
  if (/\b(eval|evaluation|benchmark|scanner|security framework)\b/.test(text)) addScope(scopes, "agent-evals");
  if (/\b(skill|workflow|procedure|procedural)\b/.test(text)) addScope(scopes, "agent-skills");
  if (/\b(interface|web|ui|control center|chat|telegram)\b/.test(text)) addScope(scopes, "agent-interface");
  if (/\b(voice|speech|audio|realtime|tts|stt)\b/.test(text)) addScope(scopes, "agent-voice");
  if (/\b(operation|deploy|scheduler|cron|sandbox|observability|gateway)\b/.test(text)) addScope(scopes, "agent-operations");
  if (data.skillNeeds === "selected" && data.allowedSkillSources === "external-with-approval") {
    addScope(scopes, "agent-skills");
    addScope(scopes, "agent-evals");
  }
  if (data.mcpNeeds === "selected" && data.allowedMcpSources !== "local-only") addScope(scopes, "mcp-tools");
  if (nontrivial(data.dependencies)) addScope(scopes, "agent-harness");

  // Only an explicit contract field may select a repository. Other GitHub URLs in
  // standards/sources are evidence links and must never become adoption inputs.
  const selectedRepositories = extractGitHubRepositoryUrls(data.selectedGitHubRepositories);
  if (selectedRepositories.length > 10) {
    throw new Error("Selected GitHub repositories supports at most 10 repositories.");
  }
  if (selectedRepositories.length && scopes.size === 0) addScope(scopes, "agent-harness");
  if (policy === "required" && scopes.size === 0) addScope(scopes, "agent-harness");

  const required = policy === "required" || selectedRepositories.length > 0 || adoptionMode === "selected-module";
  if (policy === "not-applicable" && !required) scopes.clear();
  const reason = policy === "not-applicable"
    ? compact(data.repositoryResearchWaiverReason || "No repository research reason recorded.")
    : required
      ? "The contract selects or requires an external repository/module decision."
      : scopes.size
        ? "The contract or external research topics contain repository-relevant capability choices."
        : "No repository-relevant external architecture choice was derived.";

  const requestedLimit = Math.max(1, Math.min(Number(options.githubLimit || options["github-limit"] || 5) || 5, 10));
  return {
    policy,
    mode,
    required,
    scopes: [...scopes],
    selectedRepositories,
    selectedPin: adoptionMode === "selected-module" ? canonicalRepositoryPin(data.repositoryPin) : compact(data.repositoryPin, 160),
    selectedModule: adoptionMode === "selected-module" ? (normalizeRepositoryModulePath(data.selectedRepositoryModule) || compact(data.selectedRepositoryModule, 400)) : compact(data.selectedRepositoryModule, 400),
    adoptionMode,
    reason,
    online: ["auto", "online"].includes(mode) && policy !== "not-applicable",
    limit: Math.max(requestedLimit, selectedRepositories.length),
  };
}

function registryCandidateScore(row, scopes) {
  const haystack = [row.repo, row.topics, row.why, row.notes].join(" ").toLowerCase();
  let score = 0;
  const matchedScopes = [];
  for (const scope of scopes) {
    const keywords = SCOPE_KEYWORDS[scope] || [scope];
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      matchedScopes.push(scope);
      score += 4;
    }
  }
  const status = String(row.status || "").trim().toLowerCase().replace(/_/g, "-");
  if (status === "accepted-for-review") score += 2;
  if (!ADVISORY_REGISTRY_STATUSES.has(status)) score -= 10;
  score += Math.min(Math.log10(Math.max(row.stars, 1)), 5) / 10;
  return { score, matchedScopes };
}

function normalizedRegistryStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-").slice(0, 80) || "unknown";
}

function consolidateRepositoryRegistryRows(rows) {
  const grouped = new Map();
  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const repository = row.repository || normalizeGitHubRepositoryUrl(row.repo);
    if (!repository) continue;
    const key = repository.url.toLowerCase();
    const group = grouped.get(key) || [];
    group.push({ ...row, repository, repo: repository.url, _registryIndex: index });
    grouped.set(key, group);
  }

  return [...grouped.values()].map((group) => {
    const rowsByPreference = [...group].sort((a, b) => {
      const aChecked = Date.parse(String(a.lastChecked || ""));
      const bChecked = Date.parse(String(b.lastChecked || ""));
      const checkedDifference = (Number.isFinite(bChecked) ? bChecked : 0) - (Number.isFinite(aChecked) ? aChecked : 0);
      return checkedDifference || Number(b.stars || 0) - Number(a.stars || 0) || a._registryIndex - b._registryIndex;
    });
    const representative = rowsByPreference[0];
    const statuses = [...new Set(group.map((row) => normalizedRegistryStatus(row.status)))].sort();
    const statusConflict = statuses.length > 1;
    const topicList = [...new Set(group.flatMap((row) => row.topicList || listValue(row.topics)))];
    return {
      ...representative,
      repo: representative.repository.url,
      topics: topicList.join("; "),
      topicList,
      stars: Math.max(...group.map((row) => Number(row.stars || 0))),
      status: statusConflict ? "rejected" : statuses[0],
      registryStatusConflict: statusConflict ? statuses : [],
      registryContainsArchivedStatus: statuses.includes("archived"),
    };
  });
}

export function matchRepositoryRegistryCandidates(rows, plan) {
  const explicitlySelected = new Set((plan.selectedRepositories || []).map((repository) => repository.url.toLowerCase()));
  return consolidateRepositoryRegistryRows(rows)
    .map((row) => ({ ...row, ...registryCandidateScore(row, plan.scopes) }))
    .filter((row) => explicitlySelected.has(String(row.repo || "").toLowerCase()) || (row.score > 0 && row.matchedScopes.length > 0))
    .sort((a, b) => {
      const aSelected = explicitlySelected.has(String(a.repo || "").toLowerCase());
      const bSelected = explicitlySelected.has(String(b.repo || "").toLowerCase());
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return b.score - a.score || b.stars - a.stars || a.repo.localeCompare(b.repo);
    })
    .slice(0, plan.limit)
    .map((row) => {
      const registryStatus = normalizedRegistryStatus(row.status);
      const advisory = ADVISORY_REGISTRY_STATUSES.has(registryStatus);
      const conflictingStatuses = Array.isArray(row.registryStatusConflict) ? row.registryStatusConflict : [];
      return {
        source: "registry",
        repository: row.repository || normalizeGitHubRepositoryUrl(row.repo),
        description: row.why,
        notes: row.notes,
        stars: row.stars,
        license: repositoryLicense(row.license),
        updatedAt: row.lastChecked,
        pushedAt: "unknown",
        defaultBranch: "unknown",
        headSha: "unknown",
        verifiedPinSha: "unknown",
        verifiedModulePath: "unknown",
        verifiedModuleSha: "unknown",
        verifiedModuleType: "unknown",
        verificationSourceUrl: "unknown",
        verifiedLicensePath: "unknown",
        verifiedLicenseBlobSha: "unknown",
        verifiedLicenseContentSha256: "unknown",
        verifiedLicenseSpdx: "unknown",
        verifiedLicenseSourceUrl: "unknown",
        verifiedLicenseScope: "unknown",
        latestReleaseTag: "unknown",
        retrievedAt: new Date().toISOString(),
        archived: registryStatus === "archived" || row.registryContainsArchivedStatus === true,
        fork: false,
        topics: row.topicList || listValue(row.topics),
        fitScopes: row.matchedScopes,
        registryStatus: registryStatus || "unknown",
        decision: advisory && conflictingStatuses.length === 0 ? "candidate" : "reject",
        blockers: [
          ...(conflictingStatuses.length ? [`conflicting-registry-status:${conflictingStatuses.join("+")}`] : []),
          ...(!advisory ? [`registry-status-not-advisory:${registryStatus}`] : []),
          ...(!KNOWN_REGISTRY_STATUSES.has(registryStatus) ? ["invalid-registry-status"] : []),
          "verify-current-head",
          ...(repositoryLicense(row.license) === "unknown" ? ["verify-license"] : []),
          "security-review",
          "contract-specific-eval",
        ],
      };
    });
}

function candidateFromApi(candidate, scope, source = "github-search") {
  const license = repositoryLicense(candidate.license);
  return {
    source,
    repository: candidate.repo,
    description: compact(candidate.description, 400),
    notes: "Untrusted GitHub metadata; review README, LICENSE, manifests and scripts before adoption.",
    stars: candidate.stars,
    license,
    updatedAt: candidate.updatedAt || "unknown",
    pushedAt: candidate.pushedAt || "unknown",
    defaultBranch: candidate.defaultBranch || "unknown",
    headSha: candidate.headSha || "unknown",
    verifiedPinSha: candidate.verifiedPinSha || "unknown",
    verifiedModulePath: candidate.verifiedModulePath || "unknown",
    verifiedModuleSha: candidate.verifiedModuleSha || "unknown",
    verifiedModuleType: candidate.verifiedModuleType || "unknown",
    verificationSourceUrl: candidate.verificationSourceUrl || "unknown",
    verifiedLicensePath: candidate.verifiedLicensePath || "unknown",
    verifiedLicenseBlobSha: candidate.verifiedLicenseBlobSha || "unknown",
    verifiedLicenseContentSha256: candidate.verifiedLicenseContentSha256 || "unknown",
    verifiedLicenseSpdx: candidate.verifiedLicenseSpdx || "unknown",
    verifiedLicenseSourceUrl: candidate.verifiedLicenseSourceUrl || "unknown",
    verifiedLicenseScope: candidate.verifiedLicenseScope || "unknown",
    latestReleaseTag: candidate.latestReleaseTag || "none-found",
    retrievedAt: candidate.retrievedAt || new Date().toISOString(),
    archived: Boolean(candidate.archived),
    fork: Boolean(candidate.fork),
    topics: candidate.topics || [],
    fitScopes: [scope],
    registryStatus: "unregistered-candidate",
    decision: candidate.archived ? "reject" : "candidate",
    blockers: [
      ...(candidate.archived ? ["archived"] : []),
      ...(license === "unknown" ? ["unknown-license"] : []),
      ...((candidate.snapshotErrors || []).map((error) => `snapshot-error:${compact(error, 100)}`)),
      ...(!candidate.verifiedPinSha ? ["pin-exact-version"] : []),
      ...(candidate.verifiedPinSha && !candidate.verifiedModulePath ? ["verify-selected-module-path"] : []),
      "security-review",
      "contract-specific-eval",
    ],
  };
}

function mergeCandidates(candidates, limit) {
  const byRepository = new Map();
  for (const candidate of candidates) {
    const key = candidate.repository?.url?.toLowerCase();
    if (!key) continue;
    const previous = byRepository.get(key);
    if (!previous) {
      byRepository.set(key, candidate);
      continue;
    }
    const preferred = candidate.source === "explicit"
      || (["github-search", "github-fixture"].includes(candidate.source) && previous.source === "registry")
      ? candidate
      : previous;
    const secondary = preferred === candidate ? previous : candidate;
    const registryReviewBlocked = [previous, candidate].some((item) => {
      const discoverySource = item.discoverySource || item.source;
      return (discoverySource === "registry" && !ADVISORY_REGISTRY_STATUSES.has(item.registryStatus))
        || (item.blockers || []).some((blocker) => blocker.startsWith("conflicting-registry-status:") || blocker.startsWith("registry-status-not-advisory:"));
    });
    const merged = {
      ...secondary,
      ...preferred,
      fitScopes: [...new Set([...(previous.fitScopes || []), ...(candidate.fitScopes || [])])],
      topics: [...new Set([...(previous.topics || []), ...(candidate.topics || [])])],
      blockers: [...new Set([...(previous.blockers || []), ...(candidate.blockers || [])])],
      registryStatus: previous.registryStatus !== "unregistered-candidate" ? previous.registryStatus : candidate.registryStatus,
    };
    if (registryReviewBlocked) {
      merged.decision = "reject";
      merged.blockers = [...new Set([...merged.blockers, "registry-review-blocked"])];
    }
    if (merged.headSha && merged.headSha !== "unknown") {
      merged.blockers = merged.blockers.filter((blocker) => blocker !== "verify-current-head");
    }
    if (merged.verifiedPinSha && merged.verifiedPinSha !== "unknown") {
      merged.blockers = merged.blockers.filter((blocker) => blocker !== "pin-exact-version");
    }
    if (merged.verifiedModulePath && merged.verifiedModulePath !== "unknown") {
      merged.blockers = merged.blockers.filter((blocker) => blocker !== "verify-selected-module-path");
    }
    byRepository.set(key, merged);
  }
  return [...byRepository.values()]
    .sort((a, b) => {
      if (a.source === "explicit" && b.source !== "explicit") return -1;
      if (b.source === "explicit" && a.source !== "explicit") return 1;
      if (a.decision === "reject" && b.decision !== "reject") return 1;
      if (b.decision === "reject" && a.decision !== "reject") return -1;
      return (b.stars || 0) - (a.stars || 0);
    })
    .slice(0, limit);
}

function fixtureCandidates(fixturePath, scope, limit) {
  let payload;
  try {
    payload = parseBoundedJson(readBoundedRegularFile(fixturePath, { maxBytes: 2_000_000 }).text, {
      maxBytes: 2_000_000,
      maxDepth: 16,
      maxNodes: 30_000,
      maxArrayLength: 5_000,
    });
  } catch (error) {
    const reason = /limit_exceeded/.test(error instanceof Error ? error.message : "") ? "too large or deeply nested" : "unreadable, unsafe or invalid JSON";
    throw new Error(`GitHub fixture is ${reason}`);
  }
  const items = Array.isArray(payload) ? payload : payload.items || [];
  return items
    .map(normalizeGitHubApiRepository)
    .filter(Boolean)
    .slice(0, limit)
    .map((candidate) => candidateFromApi(candidate, scope, "github-fixture"));
}

export async function runRepositoryResearch(root, data, externalTopics, options = {}) {
  const plan = deriveRepositoryResearchPlan(data, externalTopics, options);
  const registry = readGitHubRepositoryRegistry(root);
  const registryCandidates = matchRepositoryRegistryCandidates(registry.rows, plan);
  const candidates = [...registryCandidates];
  const errors = [];
  const queries = [];
  let onlineStatus = "not-applicable";
  const totalTimeoutMs = Math.max(5_000, Math.min(Number(options.githubTotalTimeoutMs || options["github-total-timeout-ms"] || 45_000) || 45_000, 60_000));
  const deadline = Date.now() + totalTimeoutMs;
  const requestTimeout = () => {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) throw new Error(`GitHub research exceeded ${totalTimeoutMs}ms total timeout`);
    const configured = Number(options.githubTimeoutMs || options["github-timeout-ms"] || 15_000) || 15_000;
    return Math.max(1_000, Math.min(configured, remaining, 60_000));
  };

  if (plan.mode === "skip") {
    const expected = plan.required || plan.scopes.length > 0 || plan.selectedRepositories.length > 0;
    return {
      plan,
      status: expected ? "failed" : "not-applicable",
      completedAt: expected ? "pending" : new Date().toISOString(),
      registry,
      onlineStatus: "skipped",
      queries,
      candidates: mergeCandidates(candidates, plan.limit),
      errors: expected ? ["repository_research_expected_but_skipped"] : [],
    };
  }

  if (plan.scopes.length === 0 && plan.selectedRepositories.length === 0) {
    return {
      plan,
      status: "not-applicable",
      completedAt: new Date().toISOString(),
      registry,
      onlineStatus,
      queries,
      candidates: [],
      errors,
    };
  }

  if (plan.online) {
    const fixturePath = options.githubFixture || options["github-fixture"] || process.env.PRITHA_GITHUB_RADAR_FIXTURE;
    onlineStatus = fixturePath ? "fixture" : "complete";
    for (const scope of plan.scopes) {
      const scopeQueries = plannedGitHubRepositoryQueries(scope);
      queries.push(...scopeQueries);
      try {
        if (fixturePath) {
          candidates.push(...fixtureCandidates(fixturePath, scope, plan.limit));
        } else {
          const result = await searchGitHubRepositoryCandidates({
            topic: scope,
            queries: scopeQueries,
            limit: plan.limit,
            timeoutMs: requestTimeout(),
            deadline,
          });
          candidates.push(...result.candidates.map((candidate) => candidateFromApi(candidate, scope)));
        }
      } catch (error) {
        onlineStatus = "failed";
        errors.push(`${scope}: ${compact(error instanceof Error ? error.message : String(error), 300)}`);
      }
    }

    if (!fixturePath) {
      for (const repository of plan.selectedRepositories) {
        try {
          const candidate = await fetchGitHubRepositorySnapshot(repository.url, {
            timeoutMs: requestTimeout(),
            deadline,
            pin: plan.adoptionMode === "selected-module" ? plan.selectedPin : "",
            module: plan.adoptionMode === "selected-module" ? plan.selectedModule : "",
          });
          if (candidate) {
            const selectedCandidate = candidateFromApi(candidate, "agent-harness", "explicit");
            selectedCandidate.discoverySource = "github-api";
            candidates.push(selectedCandidate);
            if (candidate.snapshotErrors?.length) {
              onlineStatus = "failed";
              errors.push(`${repository.url}: ${compact(candidate.snapshotErrors.join("; "), 300)}`);
            }
          }
        } catch (error) {
          onlineStatus = "failed";
          errors.push(`${repository.url}: ${compact(error instanceof Error ? error.message : String(error), 300)}`);
        }
      }
    }
  } else {
    onlineStatus = "registry-only";
  }

  for (const repository of plan.selectedRepositories) {
    const matches = candidates.filter((candidate) => candidate.repository?.url?.toLowerCase() === repository.url.toLowerCase());
    const existing = matches.find((candidate) => candidate.source === "explicit")
      || matches.find((candidate) => ["github-fixture", "github-search"].includes(candidate.source))
      || matches[0];
    if (!existing) {
      candidates.push({
        source: "explicit",
        discoverySource: "explicit-unverified",
        repository,
        description: "Explicitly selected by the contract; current metadata is unavailable.",
        notes: "Requires current GitHub verification before scaffold.",
        stars: 0,
        license: "unknown",
        updatedAt: "unknown",
        pushedAt: "unknown",
        defaultBranch: "unknown",
        headSha: "unknown",
        verifiedPinSha: "unknown",
        verifiedModulePath: "unknown",
        verifiedModuleSha: "unknown",
        verifiedModuleType: "unknown",
        verificationSourceUrl: "unknown",
        verifiedLicensePath: "unknown",
        verifiedLicenseBlobSha: "unknown",
        verifiedLicenseContentSha256: "unknown",
        verifiedLicenseSpdx: "unknown",
        verifiedLicenseSourceUrl: "unknown",
        verifiedLicenseScope: "unknown",
        latestReleaseTag: "unknown",
        retrievedAt: new Date().toISOString(),
        archived: false,
        fork: false,
        topics: [],
        fitScopes: plan.scopes.length ? plan.scopes : ["agent-harness"],
        registryStatus: "explicit-unverified",
        decision: "candidate",
        blockers: ["current-metadata-unavailable", "pin-exact-version", "verify-license", "security-review", "contract-specific-eval"],
      });
    } else {
      existing.discoverySource ||= existing.source;
      existing.source = "explicit";
    }
  }

  const shortlist = mergeCandidates(candidates, plan.limit);
  const requiredSelectedMissing = plan.selectedRepositories.some((repository) => {
    const candidate = shortlist.find((item) => item.repository?.url?.toLowerCase() === repository.url.toLowerCase());
    const expectedPinSha = String(plan.selectedPin || "").replace(/^(?:commit|tree-sha):/i, "").toLowerCase();
    const discoverySource = candidate?.discoverySource || candidate?.source || "";
    const unavailable = !candidate
      || candidate.archived
      || candidate.decision === "reject"
      || !AUTHORITATIVE_DISCOVERY_SOURCES.has(discoverySource);
    if (plan.adoptionMode === "reference-only") return unavailable;
    const expectedSelectedModuleDiscoverySource = onlineStatus === "fixture"
      ? "github-fixture"
      : onlineStatus === "complete"
        ? "github-api"
        : "";
    const baseMissing = unavailable
      || (plan.adoptionMode === "selected-module"
        && (!expectedSelectedModuleDiscoverySource || discoverySource !== expectedSelectedModuleDiscoverySource))
      || (plan.adoptionMode !== "selected-module" && repositoryLicense(candidate.license) === "unknown")
      || candidate.updatedAt === "unknown"
      || candidate.headSha === "unknown";
    if (baseMissing || plan.adoptionMode !== "selected-module") return baseMissing;
    return !/^[a-f0-9]{40}$/.test(expectedPinSha)
      || String(candidate.verifiedPinSha || "").toLowerCase() !== expectedPinSha
      || candidate.verifiedModulePath !== plan.selectedModule
      || !/^[a-f0-9]{40}$/i.test(String(candidate.verifiedModuleSha || ""))
      || candidate.verifiedModuleType !== "tree"
      || !githubRepositoryContentUrlMatches(candidate.verificationSourceUrl, repository.url, "tree", expectedPinSha, plan.selectedModule)
      || !String(candidate.verifiedLicensePath || "").startsWith(`${plan.selectedModule}/`)
      || !/^[a-f0-9]{40}$/i.test(String(candidate.verifiedLicenseBlobSha || ""))
      || !/^[a-f0-9]{64}$/i.test(String(candidate.verifiedLicenseContentSha256 || ""))
      || !candidate.verifiedLicenseSpdx
      || candidate.verifiedLicenseScope !== "module-local"
      || !githubRepositoryContentUrlMatches(candidate.verifiedLicenseSourceUrl, repository.url, "blob", expectedPinSha, candidate.verifiedLicensePath);
  });
  const staleRegistryOnly = plan.mode === "registry-only"
    && shortlist.some((candidate) => (candidate.discoverySource || candidate.source) === "registry" && !recentDate(candidate.updatedAt));
  if (staleRegistryOnly) {
    errors.push(plan.adoptionMode === "reference-only"
      ? "warning: registry-only shortlist contains metadata older than 30 days; exact fresh external review remains required"
      : "registry-only shortlist contains metadata older than 30 days");
  }
  const staleRegistryBlocking = staleRegistryOnly && plan.adoptionMode !== "reference-only";
  const incomplete = onlineStatus === "failed" || !registry.ok && !plan.online || requiredSelectedMissing || staleRegistryBlocking;
  const status = incomplete ? "pending" : "complete";

  return {
    plan,
    status,
    completedAt: status === "complete" ? new Date().toISOString() : "pending",
    registry,
    onlineStatus,
    queries: [...new Set(queries)],
    candidates: shortlist,
    errors,
  };
}

export function repositoryResearchFrontmatter(research) {
  return [
    `repository_research_required: ${research.plan.required ? "true" : "false"}`,
    `repository_research_policy: ${yamlScalar(research.plan.policy)}`,
    `repository_research_mode: ${yamlScalar(research.plan.mode)}`,
    `repository_research_status: ${yamlScalar(research.status)}`,
    `repository_research_completed_at: ${yamlScalar(research.completedAt)}`,
    `repository_research_online_status: ${yamlScalar(research.onlineStatus)}`,
    `repository_research_lock: ${repositoryResearchLock(research)}`,
    `repository_candidate_count: ${research.candidates.length}`,
    `repository_adoption_status: ${yamlScalar(research.plan.adoptionMode === "selected-module" ? "pending-review" : research.plan.adoptionMode)}`,
    "repository_research_scopes:",
    ...(research.plan.scopes.length ? research.plan.scopes.map((scope) => `  - ${yamlScalar(scope)}`) : ["  - not-applicable"]),
  ].join("\n");
}

function repositoryResearchRenderedMarkdown(research) {
  const candidates = research.candidates.length
    ? [
      "| Repository | Source / discovery source | Fit | Registry status | Stars | HEAD license metadata (advisory) | Updated/pushed | Checked HEAD | Verified pin SHA | Verified module | Pin/module license evidence | Verification source | Release | Retrieved | Decision | Blockers |",
      "| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...research.candidates.map((candidate) => `| ${markdownCell(candidate.repository.url)} | ${markdownCell(`${candidate.source} / ${candidate.discoverySource || candidate.source}`)} | ${markdownCell(candidate.fitScopes.join(", "))} | ${markdownCell(candidate.registryStatus)} | ${candidate.stars || 0} | ${markdownCell(candidate.license)} | ${markdownCell(`${candidate.updatedAt} / ${candidate.pushedAt}`)} | ${markdownCell(candidate.headSha)} | ${markdownCell(candidate.verifiedPinSha)} | ${markdownCell(`${candidate.verifiedModulePath} (${candidate.verifiedModuleType}:${candidate.verifiedModuleSha})`)} | ${markdownCell(`${candidate.verifiedLicenseSpdx} ${candidate.verifiedLicensePath} blob:${candidate.verifiedLicenseBlobSha} sha256:${candidate.verifiedLicenseContentSha256}`)} | ${markdownCell(candidate.verificationSourceUrl)} | ${markdownCell(candidate.latestReleaseTag)} | ${markdownCell(candidate.retrievedAt)} | ${markdownCell(candidate.decision)} | ${markdownCell(candidate.blockers.join(", "))} |`),
    ].join("\n")
    : "- No contract-relevant repository candidates were found.";

  return `## GitHub Repository Research

- Policy: ${research.plan.policy}
- Mode: ${research.plan.mode}
- Required for scaffold: ${research.plan.required ? "yes" : "no"}
- Status: ${research.status}
- Reason: ${markdownCell(research.plan.reason)}
- Capability scopes: ${research.plan.scopes.join(", ") || "none"}
- Contract-selected pin: ${markdownCell(research.plan.selectedPin || "not-applicable")}
- Contract-selected module path: ${markdownCell(research.plan.selectedModule || "not-applicable")}
- Registry: ${research.registry.relativePath} (${research.registry.ok ? "read" : "unavailable"})
- Online discovery: ${research.onlineStatus}
- Queries: ${research.queries.join("; ") || "none"}
- Errors: ${research.errors.map(markdownCell).join("; ") || "none"}

### Curated shortlist

${candidates}

### Trust boundary and adoption decision

- Repository descriptions, README files, issues, PRs, manifests and scripts are untrusted input.
- Discovery never clones, installs, executes, vendors or registers repository code.
- GitHub API license metadata describes current repository metadata only and never proves the license at a selected immutable pin.
- A candidate or accepted-for-review entry is advisory only.
- Before selecting a module, update the contract with its exact repository, module, pin, pin-bound LICENSE/manifest source, license decision, security/permission review, eval result and explicit user approval.
- A selected external module keeps the scaffold gate pending until the dedicated \`github-repository-review\` evidence topic and synthesis are complete.
`;
}

export function repositoryResearchMarkdown(research) {
  const machineComment = repositoryResearchMachineComment(research);
  const rendered = repositoryResearchRenderedMarkdown(research);
  return `${machineComment ? `${machineComment}\n\n` : ""}${rendered}`;
}
