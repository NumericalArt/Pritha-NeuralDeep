import { createHash } from "node:crypto";
import {
  containsCredentialUrlReference,
  containsHighRiskInstruction,
  containsPrivateEndpointReference,
  containsSensitiveUrlReference,
  isPrivateNetworkHostname,
  isSensitiveUrlKey,
  redactSensitiveText,
  quarantineUntrustedInstructionText,
} from "../lib/redaction.mjs";

import { deriveExternalResearchTopics } from "./external-research-topics.mjs";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";
import { markdownDocumentLock } from "../lib/markdown-content-lock.mjs";
import { normalizeRepositoryModulePath } from "../lib/github-repository-radar.mjs";
import {
  isExplicitRepositoryApproval,
  isImmutableRepositoryPin,
  isRepositoryLicenseApproved,
  isRepositoryPermissionsBounded,
  isRepositoryReviewPassed,
  repositoryLicenseDecisionCovers,
  contractFingerprint,
} from "./contract.mjs";

const DEFAULT_BACKEND = "manual";
const MAX_EVIDENCE_ITEMS = 100;
const SYNTHESIS_RELATIONSHIPS = new Set(["confirms", "refines", "contradicts", "makes-outdated"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);
const VALID_TEMPORAL_COMPATIBILITY_STATUSES = new Set(["compatible", "incompatible", "unknown"]);
const VALID_SOURCE_TYPES = new Set([
  "changelog",
  "community",
  "github",
  "github-api",
  "github-release",
  "github-repository",
  "grounding",
  "hackernews",
  "last30days",
  "official-docs",
  "official-repository",
  "release-notes",
  "research-paper",
  "reddit",
  "security-docs",
  "social",
  "source-code",
  "specification",
  "trusted-secondary",
  "vendor-docs",
]);
const REPOSITORY_ADOPTION_DECISIONS = new Set(["reject", "reference-only", "candidate", "selected-module"]);
const PASSING_REVIEW_VALUES = new Set(["approved", "complete", "passed", "verified", "yes"]);
const PASSING_USER_APPROVAL_VALUES = new Set(["explicitly-approved", "user-confirmed", "yes"]);
const PLACEHOLDER_PATTERN = /^(?:n\/?a|none|none known|not specified|pending|tbd|unknown)$/i;
const EVIDENCE_PAYLOAD_MARKER = "pritha-external-research-evidence-v1";
const SYNTHESIS_PAYLOAD_MARKER = "pritha-external-research-synthesis-v1";

function boundedInputObject(input) {
  if (typeof input === "string") {
    const parsed = parseBoundedJson(input, { maxBytes: 1_000_000, maxDepth: 20, maxNodes: 20_000 });
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function compact(value, maxChars = 2000) {
  const text = redactSensitiveText(String(value || "").replace(/\s+/g, " ").trim());
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function compactUntrustedNarrative(value, maxChars = 2000) {
  const text = quarantineUntrustedInstructionText(String(value || "").replace(/\s+/g, " ").trim());
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function markdownText(value, maxChars = 2000) {
  return compact(value, maxChars)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasSubstantiveValue(value, options = {}) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (options.allowNone && /^none$/i.test(text)) return true;
  return !PLACEHOLDER_PATTERN.test(text);
}

function hasDetailedValue(value, minChars = 12) {
  const text = String(value || "").trim();
  return hasSubstantiveValue(text) && text.length >= minChars;
}

function normalizedEnum(value) {
  return compact(value, 80).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

function normalizedUntrustedEnum(value) {
  return compactUntrustedNarrative(value, 80).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

function normalizedList(value, maxItems = 20, maxChars = 400) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[;\n]/)
      .map((item) => item.trim());
  return items
    .map((item) => compact(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizedUntrustedList(value, maxItems = 20, maxChars = 400) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[;\n]/)
      .map((item) => item.trim());
  return items
    .map((item) => compactUntrustedNarrative(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function isValidRetrievedDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-]+Z?)?$/.test(text)) return false;
  const [year, month, day] = text.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return false;
  return Number.isFinite(Date.parse(text));
}

function normalizeHttpsUrl(value) {
  const source = String(value || "").trim();
  if (!source || source.length > 2000) return "";
  try {
    const url = new URL(source);
    if (url.protocol !== "https:"
      || url.username
      || url.password
      || isPrivateNetworkHostname(url.hostname)
      || containsCredentialUrlReference(source)
      || containsSensitiveUrlReference(url.pathname)) return "";
    for (const [key, parameterValue] of [...url.searchParams.entries()]) {
      if (containsPrivateEndpointReference(parameterValue)) return "";
      if (isSensitiveUrlKey(key)
        || containsCredentialUrlReference(parameterValue)
        || containsSensitiveUrlReference(parameterValue)) url.searchParams.set(key, "[REDACTED]");
    }
    const rawHash = url.hash.slice(1);
    if (containsPrivateEndpointReference(rawHash)) return "";
    const fragmentParams = new URLSearchParams(rawHash);
    if ([...fragmentParams.entries()].some(([key, parameterValue]) => isSensitiveUrlKey(key)
      || containsCredentialUrlReference(parameterValue)
      || containsSensitiveUrlReference(parameterValue))) url.hash = "";
    const normalized = url.toString();
    if (normalized.length > 800) return "";
    const redacted = redactSensitiveText(normalized);
    if (redacted !== normalized || !redacted.startsWith("https://")) return "";
    const verified = new URL(redacted);
    if (verified.protocol !== "https:"
      || verified.username
      || verified.password
      || isPrivateNetworkHostname(verified.hostname)) return "";
    return verified.toString();
  } catch {
    return "";
  }
}

function normalizeCanonicalGitHubRepository(value) {
  const source = compact(value, 400).replace(/^`+|`+$/g, "").trim();
  if (!source) return "";
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password || url.search || url.hash) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return "";
    const owner = parts[0];
    const repository = parts[1].replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return "";
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repository)) return "";
    return `https://github.com/${owner}/${repository}`;
  } catch {
    return "";
  }
}

function pinnedLicenseSourceReason(value, repositoryUrl, versionPin, repositoryModule) {
  const source = normalizeHttpsUrl(value);
  if (!source) return "repository_license_source_url_missing";
  try {
    const repository = new URL(repositoryUrl);
    const url = new URL(source);
    const repositoryParts = repository.pathname.split("/").filter(Boolean);
    const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    const expectedSha = String(versionPin || "").replace(/^(?:commit|tree-sha):/i, "").toLowerCase();
    if (
      url.hostname.toLowerCase() !== "github.com"
      || url.username
      || url.password
      || url.search
      || url.hash
      || parts.length < 5
      || parts[0].toLowerCase() !== String(repositoryParts[0] || "").toLowerCase()
      || parts[1].toLowerCase() !== String(repositoryParts[1] || "").toLowerCase()
      || parts[2] !== "blob"
    ) {
      return "repository_license_source_url_invalid";
    }
    if (!/^[a-f0-9]{40}$/i.test(parts[3]) || parts[3].toLowerCase() !== expectedSha) {
      return "repository_license_source_pin_mismatch";
    }
    const licensePath = parts.slice(4).join("/");
    if (!repositoryModule || !licensePath.startsWith(`${repositoryModule}/`)) {
      return "repository_license_source_module_scope_mismatch";
    }
    const filename = parts.at(-1).toLowerCase();
    if (!/^(?:licen[cs]e(?:[._-].*)?|copying(?:[._-].*)?|notice(?:[._-].*)?|package\.json|pyproject\.toml|cargo\.toml|pom\.xml|[^/]+\.gemspec)$/.test(filename)) {
      return "repository_license_source_file_invalid";
    }
    return "";
  } catch {
    return "repository_license_source_url_invalid";
  }
}

function normalizeVersionPin(item = {}) {
  let value = compact(item.version_pin || item.versionPin || item.repository_version || item.repositoryVersion || "", 160);
  if (!value && item.commit) value = `commit:${compact(item.commit, 80)}`;
  if (!value && (item.tree_sha || item.treeSha)) value = `tree-sha:${compact(item.tree_sha || item.treeSha, 80)}`;
  if (!value && item.tag) value = `tag:${compact(item.tag, 120)}`;
  if (/^[0-9a-f]{40}$/i.test(value)) value = `commit:${value.toLowerCase()}`;
  if (/^(?:commit|tree-sha):[0-9a-f]{40}$/i.test(value)) return value.toLowerCase();
  if (!value.startsWith("tag:") && /^[A-Za-z0-9][A-Za-z0-9._/+@-]{0,119}$/.test(value)) value = `tag:${value}`;
  if (isImmutableRepositoryPin(value)) return value;
  if (/^tag:[A-Za-z0-9][A-Za-z0-9._/+@-]{0,119}$/.test(value)
    && !/^tag:(?:(?:refs\/(?:heads|remotes)|origin)\/|(?:current|default|develop|head|latest|main|master|production|stable|trunk)(?:\/|$))/i.test(value)) return value;
  return "";
}

function hasValidLicense(value) {
  const text = String(value || "").trim();
  if (!hasSubstantiveValue(text) || /^(?:noassertion|unlicensed)$/i.test(text)) return false;
  if (/^(?:a|an|and|approved|compatible|license|open source)$/i.test(text)) return false;
  return text.length >= 2
    && /[A-Za-z]/.test(text)
    && /^[A-Za-z0-9][A-Za-z0-9.+() -]{1,119}$/.test(text);
}

function hasValidSourceType(value) {
  const parts = String(value || "")
    .toLowerCase()
    .split(/[,;+]/)
    .map((part) => part.trim().replace(/_/g, "-").replace(/\s+/g, "-"))
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => VALID_SOURCE_TYPES.has(part));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function deterministicLock(value) {
  const payload = JSON.stringify(canonicalize(value));
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

function sortedEvidenceItems(items) {
  return [...(items || [])].sort((left, right) => [left.topic_id, left.source_url, left.source_title]
    .join("\n")
    .localeCompare([right.topic_id, right.source_url, right.source_title].join("\n")));
}

function evidenceLockPayload(evidence) {
  return {
    schema: EVIDENCE_PAYLOAD_MARKER,
    backend: evidence.backend,
    completed_at: evidence.completedAt,
    items: sortedEvidenceItems(evidence.items),
    input_count: evidence.inputCount,
    truncated_count: evidence.truncatedCount,
    repository_adoption_mode: evidence.repositoryAdoptionMode,
  };
}

function synthesisLockPayload(synthesis) {
  const payload = {
    schema: SYNTHESIS_PAYLOAD_MARKER,
    contract_fingerprint: synthesis.contract_fingerprint,
    evidence_lock: synthesis.evidence_lock,
    required_topics: synthesis.required_topics,
    relationship: synthesis.relationship,
    memory_comparison: synthesis.memory_comparison,
    summary: synthesis.summary,
    architecture_decision: synthesis.architecture_decision,
    alternatives: synthesis.alternatives,
    tradeoffs: synthesis.tradeoffs,
  };
  if (synthesis.repository_adoption_recommendation) {
    payload.repository_adoption_recommendation = synthesis.repository_adoption_recommendation;
  }
  return payload;
}

function machinePayloadComment(marker, payload) {
  const encoded = Buffer.from(JSON.stringify(canonicalize(payload)), "utf8").toString("base64url");
  return `<!-- ${marker} ${encoded} -->`;
}

function parseMachinePayload(markdown, marker) {
  const match = String(markdown || "").match(new RegExp(`<!--\\s*${escapeRegExp(marker)}\\s+([A-Za-z0-9_-]+)\\s*-->`));
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf8");
    if (decoded.length > 1_000_000) return null;
    const payload = parseBoundedJson(decoded, { maxBytes: 1_000_000, maxDepth: 20, maxNodes: 20_000 });
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export { redactSensitiveText } from "../lib/redaction.mjs";

function normalizeEvidenceItem(item = {}, context = {}) {
  if (!item || typeof item !== "object" || Array.isArray(item)) item = {};
  const sourceUrlInput = item.source_url || item.url || item.link || "";
  const sourceUrl = normalizeHttpsUrl(sourceUrlInput);
  const sourceType = compactUntrustedNarrative(item.source_type || item.sourceType || "", 80).toLowerCase();
  const retrievedAt = compactUntrustedNarrative(item.retrieved_at || item.retrieved || "", 80);
  const confidence = normalizedUntrustedEnum(item.confidence || "");
  const topicId = compactUntrustedNarrative(item.topic_id || item.topicId || item.topic || "", 120);
  const claim = compactUntrustedNarrative(item.claim || item.finding || "", 1200);
  const evidenceSummary = compactUntrustedNarrative(item.evidence_summary || item.evidence || item.notes || item.summary || "", 1600);
  const repositoryUrl = normalizeCanonicalGitHubRepository(item.repository_url || item.repositoryUrl || item.repository || item.repo || "");
  const repositoryModule = compactUntrustedNarrative(item.repository_module || item.repositoryModule || item.module || "", 400);
  const versionPin = normalizeVersionPin(item);
  const license = compactUntrustedNarrative(item.license || item.license_spdx || item.licenseSpdx || "", 120);
  const licenseSourceUrl = normalizeHttpsUrl(item.license_source_url || item.licenseSourceUrl || "");
  const licenseSourceBlobSha = compactUntrustedNarrative(item.license_source_blob_sha || item.licenseSourceBlobSha || "", 80).toLowerCase();
  const licenseSourceContentSha256 = compactUntrustedNarrative(item.license_source_content_sha256 || item.licenseSourceContentSha256 || "", 100)
    .replace(/^sha256:/i, "")
    .toLowerCase();
  const licenseSourceSpdx = compactUntrustedNarrative(item.license_source_spdx || item.licenseSourceSpdx || "", 160);
  const licenseScope = normalizedUntrustedEnum(item.license_scope || item.licenseScope || "");
  const authority = compactUntrustedNarrative(item.authority || item.source_authority || item.sourceAuthority || item.maintainer_authority || "", 240);
  const adoptionDecision = normalizedUntrustedEnum(item.adoption_decision || item.adoptionDecision || item.decision || "");
  const securityReview = normalizedUntrustedEnum(item.security_review || item.securityReview || "");
  const permissions = normalizedUntrustedList(item.permissions || item.permission_review || item.permissionReview, 20, 300);
  const evalStatus = normalizedUntrustedEnum(item.eval_status || item.evalStatus || item.evaluation_status || "");
  const userApproval = normalizedUntrustedEnum(item.user_approval || item.userApproval || "");
  const riskNote = compactUntrustedNarrative(item.risk_note || item.risk || "", 1000);
  const versionContext = compactUntrustedNarrative(item.version_context || item.versionContext || "", 500);
  const temporalCompatibility = compactUntrustedNarrative(item.temporal_compatibility || item.temporalCompatibility || "", 800);
  const temporalCompatibilityStatus = normalizedUntrustedEnum(
    item.temporal_compatibility_status || item.temporalCompatibilityStatus || "",
  );
  const validationErrors = [];
  const sensitiveNarrativeDetected = [
    item.topic_id,
    item.topicId,
    item.topic,
    item.topic_title,
    item.topicTitle,
    item.source_title,
    item.title,
    item.source_type,
    item.sourceType,
    item.source_published,
    item.published,
    item.published_at,
    item.source_updated,
    item.updated,
    item.updated_at,
    item.retrieved_at,
    item.retrieved,
    item.confidence,
    item.claim,
    item.finding,
    item.evidence_summary,
    item.evidence,
    item.notes,
    item.summary,
    item.risk_note,
    item.risk,
    item.authority,
    item.source_authority,
    item.sourceAuthority,
    item.maintainer_authority,
    item.version_context,
    item.versionContext,
    item.temporal_compatibility,
    item.temporalCompatibility,
    item.temporal_compatibility_status,
    item.temporalCompatibilityStatus,
    item.repository_module,
    item.repositoryModule,
    item.module,
    item.license,
    item.license_spdx,
    item.licenseSpdx,
    item.license_source_blob_sha,
    item.licenseSourceBlobSha,
    item.license_source_content_sha256,
    item.licenseSourceContentSha256,
    item.license_source_spdx,
    item.licenseSourceSpdx,
    item.license_scope,
    item.licenseScope,
    item.adoption_decision,
    item.adoptionDecision,
    item.decision,
    item.security_review,
    item.securityReview,
    ...(Array.isArray(item.permissions) ? item.permissions : [item.permissions]),
    item.permission_review,
    item.permissionReview,
    item.eval_status,
    item.evalStatus,
    item.evaluation_status,
    item.user_approval,
    item.userApproval,
  ].some((value) => {
    const raw = String(value || "").replace(/\s+/g, " ").trim();
    return raw && redactSensitiveText(raw) !== raw;
  });
  const untrustedInstructionDetected = [
    item.topic_id,
    item.topicId,
    item.topic,
    item.topic_title,
    item.topicTitle,
    item.source_url,
    item.url,
    item.link,
    item.source_title,
    item.title,
    item.source_type,
    item.sourceType,
    item.source_published,
    item.published,
    item.published_at,
    item.source_updated,
    item.updated,
    item.updated_at,
    item.retrieved_at,
    item.retrieved,
    item.confidence,
    item.claim,
    item.finding,
    item.evidence_summary,
    item.evidence,
    item.notes,
    item.summary,
    item.risk_note,
    item.risk,
    item.authority,
    item.source_authority,
    item.sourceAuthority,
    item.maintainer_authority,
    item.version_context,
    item.versionContext,
    item.temporal_compatibility,
    item.temporalCompatibility,
    item.temporal_compatibility_status,
    item.temporalCompatibilityStatus,
    item.repository_url,
    item.repositoryUrl,
    item.repository,
    item.repo,
    item.repository_module,
    item.repositoryModule,
    item.module,
    item.version_pin,
    item.versionPin,
    item.repository_version,
    item.repositoryVersion,
    item.commit,
    item.tree_sha,
    item.treeSha,
    item.tag,
    item.license,
    item.license_spdx,
    item.licenseSpdx,
    item.license_source_url,
    item.licenseSourceUrl,
    item.license_source_blob_sha,
    item.licenseSourceBlobSha,
    item.license_source_content_sha256,
    item.licenseSourceContentSha256,
    item.license_source_spdx,
    item.licenseSourceSpdx,
    item.license_scope,
    item.licenseScope,
    item.adoption_decision,
    item.adoptionDecision,
    item.decision,
    item.security_review,
    item.securityReview,
    ...(Array.isArray(item.permissions) ? item.permissions : [item.permissions]),
    item.permission_review,
    item.permissionReview,
    item.eval_status,
    item.evalStatus,
    item.evaluation_status,
    item.user_approval,
    item.userApproval,
  ].some((value) => containsHighRiskInstruction(value)
    || String(value || "").includes("[QUARANTINED_UNTRUSTED_INSTRUCTION]"))
    || (Array.isArray(item.validation_errors) && item.validation_errors.includes("untrusted_instruction_quarantined"));

  if (!hasSubstantiveValue(topicId)) validationErrors.push("topic_id_missing");
  if (!sourceUrl || !sourceUrlInput) validationErrors.push("source_url_must_be_https");
  if (!hasValidSourceType(sourceType)) validationErrors.push("source_type_invalid");
  if (!hasDetailedValue(claim) && !hasDetailedValue(evidenceSummary)) validationErrors.push("claim_or_evidence_summary_missing");
  if (!isValidRetrievedDate(retrievedAt)) validationErrors.push("retrieved_at_invalid");
  if (!VALID_CONFIDENCE.has(confidence)) validationErrors.push("confidence_invalid");
  const hasTemporalMetadata = hasSubstantiveValue(versionContext) || hasSubstantiveValue(temporalCompatibility);
  if ((hasTemporalMetadata || temporalCompatibilityStatus)
    && !VALID_TEMPORAL_COMPATIBILITY_STATUSES.has(temporalCompatibilityStatus)) {
    validationErrors.push("temporal_compatibility_status_missing_or_invalid");
  }
  if (sensitiveNarrativeDetected) validationErrors.push("sensitive_material_redacted");
  if (untrustedInstructionDetected) validationErrors.push("untrusted_instruction_quarantined");

  if (topicId === "github-repository-review") {
    if (!repositoryUrl) validationErrors.push("repository_url_must_be_canonical_github_url");
    if (repositoryUrl && sourceUrl && sourceUrl !== repositoryUrl && !sourceUrl.startsWith(`${repositoryUrl}/`)) validationErrors.push("repository_source_url_mismatch");
    if (!versionPin) validationErrors.push("repository_version_pin_invalid");
    if (!hasValidLicense(license)) validationErrors.push("repository_license_invalid");
    if (!hasDetailedValue(authority, 8)) validationErrors.push("repository_authority_missing");
    if (!hasDetailedValue(riskNote)) validationErrors.push("repository_risk_missing");
    if (!REPOSITORY_ADOPTION_DECISIONS.has(adoptionDecision)) validationErrors.push("repository_adoption_decision_invalid");

    const selectedModule = adoptionDecision === "selected-module" || context.repositoryAdoptionMode === "selected-module";
    if (selectedModule) {
      if (adoptionDecision !== "selected-module") validationErrors.push("selected_module_evidence_missing");
      if (!hasSubstantiveValue(repositoryModule)) validationErrors.push("repository_module_missing");
      else if (normalizeRepositoryModulePath(repositoryModule) !== repositoryModule) validationErrors.push("repository_module_path_invalid");
      if (!isImmutableRepositoryPin(versionPin)) validationErrors.push("selected_module_pin_not_immutable");
      const licenseSourceReason = pinnedLicenseSourceReason(licenseSourceUrl, repositoryUrl, versionPin, repositoryModule);
      if (licenseSourceReason) validationErrors.push(licenseSourceReason);
      if (!/^[a-f0-9]{40}$/.test(licenseSourceBlobSha)) validationErrors.push("repository_license_source_blob_sha_invalid");
      if (!/^[a-f0-9]{64}$/.test(licenseSourceContentSha256)) validationErrors.push("repository_license_source_content_sha256_invalid");
      if (!hasValidLicense(licenseSourceSpdx) || comparableText(licenseSourceSpdx) !== comparableText(license)) {
        validationErrors.push("repository_license_source_spdx_mismatch");
      }
      if (licenseScope !== "module-local") validationErrors.push("repository_license_scope_invalid");
      if (!PASSING_REVIEW_VALUES.has(securityReview)) validationErrors.push("repository_security_review_incomplete");
      if (!permissions.some((permission) => hasSubstantiveValue(permission, { allowNone: true }))) validationErrors.push("repository_permissions_missing");
      if (!PASSING_REVIEW_VALUES.has(evalStatus)) validationErrors.push("repository_eval_incomplete");
      if (!PASSING_USER_APPROVAL_VALUES.has(userApproval)) validationErrors.push("repository_user_approval_missing");
    }
  }

  return {
    topic_id: topicId,
    topic: compactUntrustedNarrative(item.topic || item.topic_title || item.topicTitle || "", 240),
    source_url: sourceUrl,
    source_title: compactUntrustedNarrative(item.source_title || item.title || "", 240),
    source_type: sourceType,
    source_published: compactUntrustedNarrative(item.source_published || item.published || item.published_at || "unknown", 80),
    source_updated: compactUntrustedNarrative(item.source_updated || item.updated || item.updated_at || "unknown", 80),
    retrieved_at: retrievedAt,
    claim,
    evidence_summary: evidenceSummary,
    risk_note: riskNote,
    version_context: versionContext,
    temporal_compatibility: temporalCompatibility,
    temporal_compatibility_status: temporalCompatibilityStatus,
    confidence,
    repository_url: repositoryUrl,
    repository_module: repositoryModule,
    version_pin: versionPin,
    license,
    license_source_url: licenseSourceUrl,
    license_source_blob_sha: licenseSourceBlobSha,
    license_source_content_sha256: licenseSourceContentSha256,
    license_source_spdx: licenseSourceSpdx,
    license_scope: licenseScope,
    authority,
    adoption_decision: adoptionDecision,
    security_review: securityReview,
    permissions,
    eval_status: evalStatus,
    user_approval: userApproval,
    valid: validationErrors.length === 0,
    validation_errors: validationErrors,
  };
}

export function normalizeExternalResearchEvidence(input, options = {}) {
  const payload = boundedInputObject(input);
  const backend = normalizedEnum(options.backend || payload.backend || DEFAULT_BACKEND) || DEFAULT_BACKEND;
  const completedAt = compact(payload.completed_at || payload.completedAt || new Date().toISOString(), 80);
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.evidence)
      ? payload.evidence
      : [];
  const declaredInputCount = Math.max(rawItems.length, Number(payload.input_count || payload.inputCount || 0) || 0);
  const truncatedCount = Math.max(
    Number(payload.truncated_count || payload.truncatedCount || 0) || 0,
    declaredInputCount - Math.min(rawItems.length, MAX_EVIDENCE_ITEMS),
    rawItems.length - MAX_EVIDENCE_ITEMS,
  );
  const repositoryAdoptionMode = normalizedEnum(options.repositoryAdoptionMode || payload.repository_adoption_mode || payload.repositoryAdoptionMode || "none") || "none";
  const items = rawItems
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((item) => normalizeEvidenceItem(item, { repositoryAdoptionMode }));
  const validItems = items.filter((item) => item.valid);
  const topics = [...new Set(validItems.map((item) => item.topic_id).filter(Boolean))].sort();
  const evidence = {
    backend,
    completedAt,
    items,
    validItems,
    validCount: validItems.length,
    invalidCount: items.length - validItems.length + truncatedCount,
    inputCount: declaredInputCount || rawItems.length,
    truncatedCount,
    topics,
    repositoryAdoptionMode,
    truncated: truncatedCount > 0,
  };
  return {
    ...evidence,
    lock: items.length ? deterministicLock(evidenceLockPayload(evidence)) : "pending",
  };
}

export function normalizeExternalResearchSynthesis(input, context = {}) {
  const payload = boundedInputObject(input);
  const raw = payload.synthesis && typeof payload.synthesis === "object" ? payload.synthesis : payload;
  const provided = Boolean(raw && Object.keys(raw).length);
  const relationship = normalizedEnum(raw.relationship || raw.memory_relationship || raw.memoryRelationship || "");
  const memoryComparison = compactUntrustedNarrative(raw.memory_comparison || raw.memoryComparison || "", 2400);
  const summary = compactUntrustedNarrative(raw.summary || raw.synthesis_summary || raw.synthesisSummary || "", 1600);
  const architectureDecision = compactUntrustedNarrative(raw.architecture_decision || raw.architectureDecision || raw.decision || "", 1600);
  const repositoryAdoptionRecommendation = normalizedUntrustedEnum(
    raw.repository_adoption_recommendation
      || raw.repositoryAdoptionRecommendation
      || raw.scaffold_recommendation
      || raw.scaffoldRecommendation
      || "",
  );
  const alternatives = normalizedUntrustedList(raw.alternatives, 20, 600);
  const tradeoffs = normalizedUntrustedList(raw.tradeoffs || raw.trade_offs, 20, 600);
  const evidenceLock = compact(context.evidenceLock || raw.evidence_lock || raw.evidenceLock || "pending", 100);
  const linkedContractFingerprint = compact(context.contractFingerprint || raw.contract_fingerprint || raw.contractFingerprint || "pending", 100);
  const requiredTopics = [...new Set((context.requiredTopicIds || raw.required_topics || raw.requiredTopics || [])
    .map(String)
    .filter(Boolean))].sort();
  const repositoryAdoptionMode = normalizedEnum(context.repositoryAdoptionMode || "");
  const errors = [];
  const untrustedInstructionDetected = [
    raw.memory_comparison,
    raw.memoryComparison,
    raw.summary,
    raw.synthesis_summary,
    raw.architecture_decision,
    raw.architectureDecision,
    raw.decision,
    raw.repository_adoption_recommendation,
    raw.repositoryAdoptionRecommendation,
    raw.scaffold_recommendation,
    raw.scaffoldRecommendation,
    ...(Array.isArray(raw.alternatives) ? raw.alternatives : []),
    ...(Array.isArray(raw.tradeoffs) ? raw.tradeoffs : []),
    ...(Array.isArray(raw.trade_offs) ? raw.trade_offs : []),
  ].some((value) => containsHighRiskInstruction(value));
  if (!provided) errors.push("synthesis_missing");
  if (!SYNTHESIS_RELATIONSHIPS.has(relationship)) errors.push("synthesis_relationship_invalid");
  if (!hasDetailedValue(memoryComparison, 20)) errors.push("synthesis_memory_comparison_missing");
  if (!hasDetailedValue(summary, 20)) errors.push("synthesis_summary_missing");
  if (!hasDetailedValue(architectureDecision, 20)) errors.push("synthesis_architecture_decision_missing");
  if (!alternatives.some((item) => hasDetailedValue(item, 6))) errors.push("synthesis_alternatives_missing");
  if (!tradeoffs.some((item) => hasDetailedValue(item, 6))) errors.push("synthesis_tradeoffs_missing");
  if (untrustedInstructionDetected) errors.push("synthesis_untrusted_instruction_quarantined");
  if (["reference-only", "selected-module"].includes(repositoryAdoptionMode)) {
    if (!["proceed", "hold", "reject"].includes(repositoryAdoptionRecommendation)) {
      errors.push("synthesis_repository_adoption_recommendation_missing");
    }
  } else if (repositoryAdoptionRecommendation && !["proceed", "hold", "reject"].includes(repositoryAdoptionRecommendation)) {
    errors.push("synthesis_repository_adoption_recommendation_invalid");
  }
  const normalized = {
    relationship,
    memory_comparison: memoryComparison,
    summary,
    architecture_decision: architectureDecision,
    repository_adoption_recommendation: repositoryAdoptionRecommendation,
    alternatives,
    tradeoffs,
    evidence_lock: evidenceLock,
    contract_fingerprint: linkedContractFingerprint,
    required_topics: requiredTopics,
  };
  return {
    ...normalized,
    provided,
    complete: errors.length === 0,
    errors,
    lock: provided ? deterministicLock(synthesisLockPayload(normalized)) : "pending",
  };
}

export function externalEvidenceItemIsFresh(item, windowDays = 30, referenceTime = Date.now()) {
  const boundedWindowDays = Math.max(1, Math.min(Number(windowDays || 30) || 30, 365));
  const retrievedTime = Date.parse(String(item?.retrieved_at || ""));
  if (!Number.isFinite(referenceTime) || !Number.isFinite(retrievedTime)) return false;
  const retrievedAgeDays = (referenceTime - retrievedTime) / 86_400_000;
  if (retrievedAgeDays < -1 || retrievedAgeDays > boundedWindowDays) return false;
  const sourceTimes = [item?.source_updated, item?.source_published]
    .map((value) => Date.parse(String(value || "")))
    .filter(Number.isFinite);
  const sourceTime = sourceTimes.length ? Math.max(...sourceTimes) : Number.NaN;
  const sourceAgeDays = (referenceTime - sourceTime) / 86_400_000;
  const sourceDateIsCurrent = Number.isFinite(sourceTime)
    && sourceAgeDays >= -1
    && sourceAgeDays <= boundedWindowDays;
  const temporalCompatibilityStatus = normalizedEnum(item?.temporal_compatibility_status || "");
  if (["incompatible", "unknown"].includes(temporalCompatibilityStatus)) return false;
  const explicitVersionRule = temporalCompatibilityStatus === "compatible"
    && hasDetailedValue(item?.version_context, 8)
    && hasDetailedValue(item?.temporal_compatibility, 20);
  return sourceDateIsCurrent || explicitVersionRule;
}

export function externalEvidenceCoverage(topics, evidence) {
  const requiredTopics = (topics || []).filter((topic) => topic.required !== false && topic.id);
  const requiredTopicIds = [...new Set(requiredTopics.map((topic) => topic.id))];
  const checkedEvidence = normalizeExternalResearchEvidence({
    backend: evidence?.backend,
    completed_at: evidence?.completedAt,
    repository_adoption_mode: evidence?.repositoryAdoptionMode,
    input_count: evidence?.inputCount,
    truncated_count: evidence?.truncatedCount,
    items: evidence?.items || [],
  });
  const validItems = checkedEvidence.validItems;
  const referenceTime = Date.now();
  const freshItems = validItems.filter((item) => {
    const topic = requiredTopics.find((candidate) => candidate.id === item.topic_id);
    const windowDays = Math.max(1, Math.min(Number(topic?.freshnessWindowDays || 30) || 30, 365));
    return externalEvidenceItemIsFresh(item, windowDays, referenceTime);
  });
  const coveredTopicIds = new Set(freshItems.map((item) => item.topic_id).filter(Boolean));
  if (checkedEvidence.repositoryAdoptionMode === "selected-module") {
    const selectedReview = freshItems.some((item) => item.topic_id === "github-repository-review" && item.adoption_decision === "selected-module");
    if (!selectedReview) coveredTopicIds.delete("github-repository-review");
  }
  const missingTopicIds = requiredTopicIds.filter((id) => !coveredTopicIds.has(id));
  const staleTopicIds = requiredTopicIds.filter((id) => (
    validItems.some((item) => item.topic_id === id)
    && !freshItems.some((item) => item.topic_id === id)
  ));
  return {
    requiredTopicIds,
    coveredTopicIds: [...coveredTopicIds].sort(),
    missingTopicIds,
    staleTopicIds,
    invalidItems: checkedEvidence.items.filter((item) => item.valid === false),
    complete: requiredTopicIds.length > 0 && missingTopicIds.length === 0 && validItems.length > 0 && checkedEvidence.invalidCount === 0,
  };
}

function replaceFrontmatterField(markdown, key, value) {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return markdown;
  const raw = markdown.slice(4, end);
  const body = markdown.slice(end + 5);
  const lines = raw.split(/\r?\n/);
  let replaced = false;
  const nextLines = lines.map((line) => {
    if (line.match(new RegExp(`^${escapeRegExp(key)}:`))) {
      replaced = true;
      return `${key}: ${value}`;
    }
    return line;
  });
  if (!replaced) nextLines.push(`${key}: ${value}`);
  return `---\n${nextLines.join("\n")}\n---\n${body}`;
}

function replaceSection(markdown, heading, content) {
  const escaped = escapeRegExp(heading);
  const replacement = `## ${heading}\n\n${content.trim()}\n\n`;
  const pattern = new RegExp(`^## ${escaped}\\s*\\n[\\s\\S]*?(?=^##\\s|(?![\\s\\S]))`, "m");
  if (pattern.test(markdown)) return markdown.replace(pattern, replacement);
  return `${markdown.trimEnd()}\n\n${replacement}`;
}

function formatEvidenceItems(evidence) {
  if (!evidence.items.length) return "- No external evidence items were provided.";
  const comment = machinePayloadComment(EVIDENCE_PAYLOAD_MARKER, evidenceLockPayload(evidence));
  const rendered = evidence.items.map((item, index) => {
    const title = markdownText(item.source_title || item.source_url || item.topic || item.topic_id || `Evidence ${index + 1}`, 240);
    const lines = [
      `### ${index + 1}. ${title}`,
      "",
      `- Topic ID: ${markdownText(item.topic_id || "unknown", 120)}`,
      `- Backend: ${markdownText(evidence.backend, 80)}`,
      `- Validation: ${item.valid ? "valid" : `invalid (${markdownText(item.validation_errors.join(", "), 600)})`}`,
      `- Source URL: ${markdownText(item.source_url || "unknown", 800)}`,
      `- Source type: ${markdownText(item.source_type || "unknown", 80)}`,
      `- Source published: ${markdownText(item.source_published || "unknown", 80)}`,
      `- Source updated: ${markdownText(item.source_updated || "unknown", 80)}`,
      `- Retrieved: ${markdownText(item.retrieved_at || "unknown", 80)}`,
      `- Version context: ${markdownText(item.version_context || "not recorded", 500)}`,
      `- Temporal compatibility: ${markdownText(item.temporal_compatibility || "not recorded", 800)}`,
      `- Temporal compatibility status: ${markdownText(item.temporal_compatibility_status || "not recorded", 80)}`,
      `- Confidence: ${markdownText(item.confidence || "unknown", 80)}`,
      `- Claim: ${markdownText(item.claim || "not specified", 1200)}`,
      `- Evidence summary: ${markdownText(item.evidence_summary || "not specified", 1600)}`,
      `- Risk note: ${markdownText(item.risk_note || "none", 1000)}`,
    ];
    if (item.topic_id === "github-repository-review") {
      lines.push(
        `- Repository: ${markdownText(item.repository_url || "unknown", 400)}`,
        `- Repository module: ${markdownText(item.repository_module || "not-applicable", 400)}`,
        `- Version pin: ${markdownText(item.version_pin || "unknown", 160)}`,
        `- License: ${markdownText(item.license || "unknown", 120)}`,
        `- Pin-bound license source: ${markdownText(item.license_source_url || "not-applicable", 800)}`,
        `- License blob SHA: ${markdownText(item.license_source_blob_sha || "not-applicable", 120)}`,
        `- License content SHA-256: ${markdownText(item.license_source_content_sha256 || "not-applicable", 160)}`,
        `- Detected SPDX / scope: ${markdownText(`${item.license_source_spdx || "unknown"} / ${item.license_scope || "unknown"}`, 260)}`,
        `- Authority: ${markdownText(item.authority || "unknown", 240)}`,
        `- Adoption decision: ${markdownText(item.adoption_decision || "unknown", 80)}`,
        `- Security review: ${markdownText(item.security_review || "not-applicable", 80)}`,
        `- Permissions: ${markdownText(item.permissions.join("; ") || "not-applicable", 1200)}`,
        `- Eval status: ${markdownText(item.eval_status || "not-applicable", 80)}`,
        `- User approval: ${markdownText(item.user_approval || "not-applicable", 80)}`,
      );
    }
    return lines.join("\n");
  }).join("\n\n");
  return `${comment}\n\n${rendered}`;
}

function formatComparison(topics, evidence, coverage, synthesis, repositoryBindingReasons = []) {
  const topicLabels = new Map((topics || []).map((topic) => [topic.id, topic.topic]));
  const lines = [
    `- Backend used: ${markdownText(evidence.backend, 80)}.`,
    `- Valid evidence items: ${evidence.validCount}/${evidence.items.length}.`,
    `- Required topics covered: ${coverage.coveredTopicIds.filter((id) => coverage.requiredTopicIds.includes(id)).length}/${coverage.requiredTopicIds.length}.`,
  ];
  if (coverage.missingTopicIds.length) {
    lines.push(`- Missing required topics: ${markdownText(coverage.missingTopicIds.map((id) => `${id}${topicLabels.has(id) ? ` (${topicLabels.get(id)})` : ""}`).join("; "), 1600)}.`);
  }
  if (coverage.staleTopicIds.length) {
    lines.push(`- Stale evidence topics: ${markdownText(coverage.staleTopicIds.join("; "), 1200)}.`);
  }
  if (coverage.invalidItems.length) {
    lines.push(`- Invalid evidence items: ${coverage.invalidItems.length}; they do not satisfy topic coverage.`);
  }
  if (evidence.truncatedCount) {
    lines.push(`- Truncated evidence items: ${evidence.truncatedCount}; truncation keeps the gate pending.`);
  }
  if (repositoryBindingReasons.length) {
    lines.push(`- Repository contract binding: pending (${markdownText(repositoryBindingReasons.join(", "), 1600)}).`);
  }
  if (!synthesis.complete) {
    if (synthesis.provided) lines.unshift(machinePayloadComment(SYNTHESIS_PAYLOAD_MARKER, synthesisLockPayload(synthesis)));
    lines.push(`- Synthesis: pending (${markdownText(synthesis.errors.join(", ") || "synthesis_missing", 800)}).`);
    lines.push("- Scaffold gate remains pending until evidence is compared with local memory and an architecture decision is recorded.");
    return lines.join("\n");
  }
  lines.unshift(machinePayloadComment(SYNTHESIS_PAYLOAD_MARKER, synthesisLockPayload(synthesis)));
  lines.push(
    `- Relationship to local memory: ${markdownText(synthesis.relationship, 80)}.`,
    `- Memory comparison: ${markdownText(synthesis.memory_comparison, 2400)}`,
    `- Synthesis summary: ${markdownText(synthesis.summary, 1600)}`,
    `- Architecture decision: ${markdownText(synthesis.architecture_decision, 1600)}`,
    ...(synthesis.repository_adoption_recommendation
      ? [`- Repository adoption recommendation: ${markdownText(synthesis.repository_adoption_recommendation, 80)}.`]
      : []),
    `- Alternatives: ${markdownText(synthesis.alternatives.join("; "), 3000)}.`,
    `- Trade-offs: ${markdownText(synthesis.tradeoffs.join("; "), 3000)}.`,
  );
  return lines.join("\n");
}

function formatArchitectureRecommendation(synthesis) {
  if (!synthesis.complete) {
    return [
      `- Status: pending (${markdownText(synthesis.errors.join(", ") || "synthesis_missing", 800)}).`,
      "- Decision: no architecture recommendation is authorized until the locked synthesis is complete.",
    ].join("\n");
  }
  return [
    `- Decision: ${markdownText(synthesis.architecture_decision, 1600)}`,
    `- Alternatives considered: ${markdownText(synthesis.alternatives.join("; "), 3000)}.`,
    `- Trade-offs: ${markdownText(synthesis.tradeoffs.join("; "), 3000)}.`,
  ].join("\n");
}

function listFromFrontmatter(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  const text = String(value).trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // Fall through to the bounded scalar parser.
    }
  }
  return text.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
}

function requiredTopicIdsFrom(requiredTopics, frontmatter) {
  const source = requiredTopics === undefined ? frontmatter.external_research_topics : requiredTopics;
  const values = Array.isArray(source) ? source : listFromFrontmatter(source);
  return [...new Set(values.map((value) => typeof value === "object" ? value.id : String(value)).filter((value) => value && value !== "not-applicable"))];
}

function sameStringList(left, right) {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function expectedRepositoryUrls(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\s]+/);
  return [...new Set(values
    .map((candidate) => normalizeCanonicalGitHubRepository(candidate))
    .filter(Boolean)
    .map((candidate) => candidate.toLowerCase()))];
}

function comparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function samePermissionSet(expected, actual) {
  const normalize = (items) => [...new Set(items.map(comparableText).filter(Boolean))].sort();
  return JSON.stringify(normalize(expected)) === JSON.stringify(normalize(actual));
}

function authorizingRepositoryEvidence(evidence, options = {}) {
  const expectedMode = normalizedEnum(options.repositoryAdoptionMode || "");
  const freshnessWindowDays = Math.max(1, Math.min(Number(options.repositoryFreshnessWindowDays || 30) || 30, 365));
  const referenceTime = Date.now();
  return evidence.validItems.filter((item) => {
    if (item.topic_id !== "github-repository-review") return false;
    if (expectedMode === "selected-module" && item.adoption_decision !== "selected-module") return false;
    if (expectedMode === "reference-only" && item.adoption_decision !== "reference-only") return false;
    return externalEvidenceItemIsFresh(item, freshnessWindowDays, referenceTime);
  });
}

function repositoryEvidenceBindingReasons(evidence, options = {}) {
  const expectedMode = normalizedEnum(options.repositoryAdoptionMode || "");
  const reasons = [];
  const expectedUrls = expectedRepositoryUrls(options.selectedGitHubRepositories);
  if (expectedUrls.length === 0) return expectedMode === "selected-module" || expectedMode === "reference-only"
    ? ["repository_contract_selection_missing"]
    : [];
  const selectedReviews = authorizingRepositoryEvidence(evidence, options);
  if (!selectedReviews.length) reasons.push(expectedMode === "selected-module"
    ? "repository_selected_module_evidence_missing"
    : "repository_reference_evidence_missing");

  const expectedModule = compact(options.selectedRepositoryModule || "", 400);
  const expectedPin = normalizeVersionPin({ version_pin: options.repositoryPin });
  const expectedLicenseDecision = comparableText(options.repositoryLicenseDecision);
  const expectedPermissions = normalizedList(options.repositoryPermissions, 20, 300);

  for (const review of selectedReviews) {
    const repositoryUrl = String(review.repository_url || "").toLowerCase();
    if (!expectedUrls.includes(repositoryUrl)) reasons.push("repository_evidence_repository_mismatch");
  }
  for (const repositoryUrl of expectedUrls) {
    const matchingReviews = selectedReviews.filter((item) => String(item.repository_url || "").toLowerCase() === repositoryUrl);
    if (matchingReviews.length > 1) reasons.push(`repository_evidence_duplicate:${repositoryUrl}`);
    const review = matchingReviews[0];
    if (!review) {
      reasons.push(`repository_evidence_missing:${repositoryUrl}`);
      continue;
    }
    if (expectedMode !== "selected-module") continue;
    if (!expectedModule || review.repository_module !== expectedModule) reasons.push("repository_evidence_module_mismatch");
    if (!expectedPin || review.version_pin !== expectedPin) reasons.push("repository_evidence_pin_mismatch");
    const evidenceLicense = comparableText(review.license);
    if (!isRepositoryLicenseApproved(options.repositoryLicenseDecision)
      || !expectedLicenseDecision
      || !evidenceLicense
      || !repositoryLicenseDecisionCovers(options.repositoryLicenseDecision, review.license)) {
      reasons.push("repository_evidence_license_mismatch");
    }
    if (!isRepositoryReviewPassed(options.repositorySecurityReview) || !PASSING_REVIEW_VALUES.has(review.security_review)) {
      reasons.push("repository_evidence_security_review_mismatch");
    }
    if (!isRepositoryPermissionsBounded(options.repositoryPermissions)
      || !samePermissionSet(expectedPermissions, review.permissions || [])) {
      reasons.push("repository_evidence_permissions_mismatch");
    }
    if (!isRepositoryReviewPassed(options.repositoryEvalStatus) || !PASSING_REVIEW_VALUES.has(review.eval_status)) {
      reasons.push("repository_evidence_eval_mismatch");
    }
    if (!isExplicitRepositoryApproval(options.repositoryUserApproval) || !PASSING_USER_APPROVAL_VALUES.has(review.user_approval)) {
      reasons.push("repository_evidence_user_approval_mismatch");
    }
  }
  return [...new Set(reasons)];
}

export function verifyExternalResearchIntegrity(reportText, requiredTopics, options = {}) {
  const frontmatter = parseFrontmatterData(String(reportText || "")) || {};
  const reasons = [];
  const reportedContentLock = String(frontmatter.research_content_lock || "");
  const contentLockOccurrences = (String(reportText || "").match(/^research_content_lock:/gm) || []).length;
  if (contentLockOccurrences !== 1 || !/^sha256:[a-f0-9]{64}$/i.test(reportedContentLock)) {
    reasons.push("research_content_lock_invalid");
  } else if (reportedContentLock !== markdownDocumentLock(reportText)) {
    reasons.push("research_content_document_mismatch");
  }
  const evidencePayload = parseMachinePayload(reportText, EVIDENCE_PAYLOAD_MARKER);
  const synthesisPayload = parseMachinePayload(reportText, SYNTHESIS_PAYLOAD_MARKER);
  const requiredTopicIds = requiredTopicIdsFrom(requiredTopics, frontmatter);
  let evidence = normalizeExternalResearchEvidence({ items: [] });
  let coverage = externalEvidenceCoverage(requiredTopicIds.map((id) => ({ id, required: true })), evidence);

  if (!evidencePayload || evidencePayload.schema !== EVIDENCE_PAYLOAD_MARKER) {
    reasons.push("external_evidence_payload_missing_or_malformed");
  } else {
    const expectedAdoptionMode = normalizedEnum(options.repositoryAdoptionMode || "");
    const payloadAdoptionMode = normalizedEnum(evidencePayload.repository_adoption_mode || "none") || "none";
    if (expectedAdoptionMode && payloadAdoptionMode !== expectedAdoptionMode) {
      reasons.push("repository_adoption_mode_mismatch");
    }
    evidence = normalizeExternalResearchEvidence({
      backend: evidencePayload.backend,
      completed_at: evidencePayload.completed_at,
      repository_adoption_mode: evidencePayload.repository_adoption_mode,
      input_count: evidencePayload.input_count,
      truncated_count: evidencePayload.truncated_count,
      items: evidencePayload.items,
    }, {
      repositoryAdoptionMode: expectedAdoptionMode || payloadAdoptionMode,
    });
    coverage = externalEvidenceCoverage(requiredTopicIds.map((id) => ({ id, required: true })), evidence);
    reasons.push(...repositoryEvidenceBindingReasons(evidence, options));
  }

  const expectedEvidenceLock = evidencePayload ? deterministicLock(evidenceLockPayload(evidence)) : "pending";
  const frontmatterEvidenceLock = String(frontmatter.external_research_lock || "pending");
  const frontmatterCount = Number(frontmatter.external_evidence_count);
  const frontmatterTopics = listFromFrontmatter(frontmatter.external_evidence_topics);
  if (frontmatterEvidenceLock !== expectedEvidenceLock || expectedEvidenceLock === "pending") reasons.push("external_research_lock_mismatch");
  if (!Number.isInteger(frontmatterCount) || frontmatterCount !== evidence.validCount) reasons.push("external_evidence_count_mismatch");
  if (!sameStringList(frontmatterTopics, evidence.topics)) reasons.push("external_evidence_topics_mismatch");
  if (evidence.invalidCount > 0) reasons.push("external_evidence_invalid_items");
  if (!coverage.complete) reasons.push("external_evidence_coverage_incomplete");
  if (String(frontmatter.external_research_status || "") !== "complete") reasons.push("external_research_status_not_complete");

  let synthesis = normalizeExternalResearchSynthesis(null);
  if (!synthesisPayload || synthesisPayload.schema !== SYNTHESIS_PAYLOAD_MARKER) {
    reasons.push("synthesis_payload_missing_or_malformed");
  } else {
    const expectedContractFingerprint = compact(options.contractFingerprint || synthesisPayload.contract_fingerprint || "pending", 100);
    synthesis = normalizeExternalResearchSynthesis(synthesisPayload, {
      evidenceLock: evidence.lock,
      contractFingerprint: expectedContractFingerprint,
      requiredTopicIds,
      repositoryAdoptionMode: options.repositoryAdoptionMode,
    });
    if (synthesisPayload.evidence_lock !== evidence.lock) reasons.push("synthesis_evidence_lock_mismatch");
    if (synthesisPayload.contract_fingerprint !== expectedContractFingerprint) reasons.push("synthesis_contract_fingerprint_mismatch");
    if (!sameStringList(synthesisPayload.required_topics || [], requiredTopicIds)) reasons.push("synthesis_required_topics_mismatch");
  }
  const expectedRepositoryMode = normalizedEnum(options.repositoryAdoptionMode || "");
  if (["reference-only", "selected-module"].includes(expectedRepositoryMode)
    && synthesis.complete
    && synthesis.repository_adoption_recommendation !== "proceed") {
    reasons.push(`synthesis_repository_adoption_${synthesis.repository_adoption_recommendation || "missing"}`);
  }
  const expectedSynthesisLock = synthesisPayload ? deterministicLock(synthesisLockPayload(synthesis)) : "pending";
  if (String(frontmatter.synthesis_lock || "pending") !== expectedSynthesisLock || expectedSynthesisLock === "pending") reasons.push("synthesis_lock_mismatch");
  if (!synthesis.complete) reasons.push(...synthesis.errors);
  if (String(frontmatter.synthesis_status || "") !== "complete") reasons.push("synthesis_status_not_complete");

  const uniqueReasons = [...new Set(reasons)];
  const evidenceReasons = new Set([
    "external_evidence_payload_missing_or_malformed",
    "external_research_lock_mismatch",
    "external_evidence_count_mismatch",
    "external_evidence_topics_mismatch",
    "external_evidence_invalid_items",
    "external_evidence_coverage_incomplete",
    "external_research_status_not_complete",
  ]);
  const evidenceOk = !uniqueReasons.some((reason) => evidenceReasons.has(reason));
  const synthesisOk = !uniqueReasons.some((reason) => reason.startsWith("synthesis_"));
  return {
    ok: uniqueReasons.length === 0,
    evidenceOk: evidenceOk && !uniqueReasons.some((reason) => reason.startsWith("repository_")),
    synthesisOk,
    reasons: uniqueReasons,
    count: evidence.validCount,
    topicIds: evidence.topics,
    requiredTopicIds,
    coverage,
    repositoryEvidence: authorizingRepositoryEvidence(evidence, options),
  };
}

function formatScaffoldDecision(status, coverage, synthesis, repositoryBindingReasons = [], overallGateReasons = []) {
  if (status === "complete") {
    return [
      "- Status: complete",
      "- Decision: scaffold may proceed if all other contract checks pass.",
      "- Required next action: preserve evidence and synthesis locks while keeping volatile choices version-bound.",
    ].join("\n");
  }
  if (status === "failed") {
    return [
      "- Status: failed",
      "- Decision: do not scaffold without an explicit experimental override.",
      `- Blocking gate reasons: ${markdownText(overallGateReasons.join(", ") || "overall research integrity or repository verification failed", 1600)}.`,
      "- Required next action: repair the failed evidence/repository gate and rerun the overall gate evaluation.",
    ].join("\n");
  }
  return [
    "- Status: pending",
    "- Decision: do not scaffold without explicit experimental override.",
    `- Missing required topics: ${markdownText(coverage.missingTopicIds.join(", ") || "none", 1200)}.`,
    `- Synthesis status: ${synthesis.complete ? "complete" : `pending (${markdownText(synthesis.errors.join(", "), 800)})`}.`,
    `- Repository contract binding: ${repositoryBindingReasons.length ? `pending (${markdownText(repositoryBindingReasons.join(", "), 1200)})` : "complete-or-not-applicable"}.`,
    "- Required next action: add valid evidence for every topic and an explicit memory comparison/architecture decision.",
  ].join("\n");
}

export function applyExternalResearchEvidence(reportMarkdown, contractData, input, options = {}) {
  const topics = options.topics || deriveExternalResearchTopics(contractData, options);
  const payload = boundedInputObject(input);
  const evidence = normalizeExternalResearchEvidence(payload, {
    ...options,
    repositoryAdoptionMode: options.repositoryAdoptionMode || contractData?.repositoryAdoptionMode,
  });
  const coverage = externalEvidenceCoverage(topics, evidence);
  const repositoryBindingReasons = repositoryEvidenceBindingReasons(evidence, contractData || {});
  const requiredTopicIds = [...new Set((topics || []).filter((topic) => topic.required !== false && topic.id).map((topic) => topic.id))].sort();
  const synthesis = normalizeExternalResearchSynthesis(options.synthesis || payload.synthesis, {
    evidenceLock: evidence.lock,
    contractFingerprint: contractData?.fingerprint || contractFingerprint(contractData || {}),
    requiredTopicIds,
    repositoryAdoptionMode: options.repositoryAdoptionMode || contractData?.repositoryAdoptionMode,
  });
  const externalComplete = coverage.complete && repositoryBindingReasons.length === 0;
  const repositoryAdoptionMode = normalizedEnum(options.repositoryAdoptionMode || contractData?.repositoryAdoptionMode || "");
  const repositoryRecommendationAllowsScaffold = !["reference-only", "selected-module"].includes(repositoryAdoptionMode)
    || synthesis.repository_adoption_recommendation === "proceed";
  const complete = externalComplete && synthesis.complete && repositoryRecommendationAllowsScaffold;
  const externalStatus = externalComplete ? "complete" : "pending";
  const synthesisStatus = synthesis.complete ? "complete" : "pending";
  const externalSynthesisGateStatus = complete
    ? "complete"
    : synthesis.complete && synthesis.repository_adoption_recommendation === "reject"
      ? "failed"
      : "pending";
  const completedAt = externalComplete ? evidence.completedAt : "pending";
  const verified = complete ? todayIsoDate() : "pending";
  const sourceFrontmatter = parseFrontmatterData(String(reportMarkdown || "")) || {};
  const repositoryGateDeclared = sourceFrontmatter.repository_research_status !== undefined
    && String(sourceFrontmatter.repository_research_status) !== "not-applicable";

  let next = String(reportMarkdown || "");
  for (const [key, value] of [
    ["updated", todayIsoDate()],
    // This is a provisional overall status. When repository research is present,
    // the orchestrator evaluates the complete report before this value is persisted.
    ["research_gate_status", externalSynthesisGateStatus],
    ["external_synthesis_gate_status", externalSynthesisGateStatus],
    ["memory_research_status", "complete"],
    ["external_research_status", externalStatus],
    ["external_research_backend", evidence.backend],
    ["external_research_completed_at", completedAt],
    ["synthesis_status", synthesisStatus],
    ["external_evidence_count", String(evidence.validCount)],
    ["external_evidence_topics", JSON.stringify(evidence.topics)],
    ["external_research_lock", evidence.lock],
    ["synthesis_lock", synthesis.lock],
    ["verified", verified],
  ]) {
    next = replaceFrontmatterField(next, key, value);
  }

  next = replaceSection(next, "External Research Evidence", formatEvidenceItems(evidence));
  next = replaceSection(next, "Memory vs External Comparison", formatComparison(topics, evidence, coverage, synthesis, repositoryBindingReasons));
  next = replaceSection(next, "Architecture Recommendation", formatArchitectureRecommendation(synthesis));
  next = replaceFrontmatterField(next, "research_content_lock", markdownDocumentLock(next));
  let researchGateStatus = repositoryGateDeclared && typeof options.evaluateOverallGate !== "function"
    ? "pending"
    : externalSynthesisGateStatus;
  let overallGateReasons = [];
  if (typeof options.evaluateOverallGate === "function") {
    const evaluated = options.evaluateOverallGate(next);
    if (evaluated && ["complete", "pending", "failed", "not-applicable"].includes(evaluated.status)) {
      researchGateStatus = evaluated.status;
      overallGateReasons = Array.isArray(evaluated.reasons) ? evaluated.reasons : [];
    }
  }
  next = replaceFrontmatterField(next, "research_gate_status", researchGateStatus);
  next = replaceFrontmatterField(next, "verified", researchGateStatus === "complete" ? verified : "pending");
  next = replaceSection(next, "Scaffold Gate Decision", formatScaffoldDecision(researchGateStatus, coverage, synthesis, repositoryBindingReasons, overallGateReasons));
  next = replaceFrontmatterField(next, "research_content_lock", markdownDocumentLock(next));

  return {
    text: next,
    status: researchGateStatus,
    externalSynthesisGateStatus,
    externalStatus,
    synthesisStatus,
    evidence,
    synthesis,
    coverage,
    repositoryBindingReasons,
    complete,
  };
}
