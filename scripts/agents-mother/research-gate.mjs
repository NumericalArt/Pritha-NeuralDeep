import path from "node:path";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot } from "../lib/paths.mjs";
import {
  canonicalRepositoryPin,
  contractFingerprint,
  isExplicitRepositoryApproval,
  isImmutableRepositoryPin,
  isRepositoryLicenseApproved,
  isRepositoryPermissionsBounded,
  isRepositoryReviewPassed,
  repositoryLicenseDecisionCovers,
} from "./contract.mjs";
import { githubRepositoryContentUrlMatches, normalizeRepositoryModulePath } from "../lib/github-repository-radar.mjs";
import { deriveExternalResearchTopics } from "./external-research-topics.mjs";
import { deriveRepositoryResearchPlan, verifyRepositoryResearchIntegrity } from "./github-research.mjs";
import { verifyExternalResearchIntegrity } from "./external-research.mjs";
import { verifyPatternPackIntegrity } from "./pattern-research.mjs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";
import { markdownDocumentLock } from "../lib/markdown-content-lock.mjs";

const VALID_GATE_STATUSES = new Set(["complete", "pending", "not-applicable", "failed"]);
const PASSING_GATE_STATUSES = new Set(["complete", "not-applicable"]);
const REQUIRED_GATE_FIELDS = [
  ["research_gate_status", "researchGate"],
  ["memory_research_status", "memoryResearch"],
  ["external_research_status", "externalResearch"],
  ["synthesis_status", "synthesis"],
];

function asArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function bodyValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`^- ${escaped}:\\s*(.*)$`, "mi"));
  return match ? match[1].trim() : "";
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") return "missing";
  if (Array.isArray(value) || typeof value === "object") return "malformed";
  const text = String(value).trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (text === "n/a" || text === "na" || text === "notapplicable") return "not-applicable";
  if (VALID_GATE_STATUSES.has(text)) return text;
  return "malformed";
}

function fieldReason(name, status) {
  if (status === "missing") return `${name}_missing`;
  if (status === "malformed") return `${name}_malformed`;
  if (status === "pending") return `${name}_pending`;
  if (status === "failed") return `${name}_failed`;
  return "";
}

function isRecentTimestamp(value, windowDays) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return false;
  const ageDays = (Date.now() - timestamp) / 86_400_000;
  return ageDays >= -1 && ageDays <= windowDays;
}

function sameNormalizedList(left, right) {
  const normalize = (values) => [...new Set((values || []).map((value) => String(value).toLowerCase()))].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function normalizeResearchGateStatus(value) {
  return normalizeValue(value);
}

export function parseResearchGateFrontmatter(text) {
  return parseFrontmatterData(String(text || "")) || {};
}

export function researchGateStatusForReport(text) {
  const frontmatter = parseResearchGateFrontmatter(text);
  const fields = {};
  const reasons = [];

  for (const [frontmatterKey, fieldKey] of REQUIRED_GATE_FIELDS) {
    fields[fieldKey] = normalizeValue(frontmatter[frontmatterKey]);
    const reason = fieldReason(fieldKey, fields[fieldKey]);
    if (reason) reasons.push(reason);
  }

  const values = Object.values(fields);
  let status = "pending";
  if (values.some((value) => value === "failed" || value === "malformed")) {
    status = "failed";
  } else if (values.some((value) => value === "missing" || value === "pending")) {
    status = "pending";
  } else if (values.every((value) => value === "not-applicable")) {
    status = "not-applicable";
  } else if (PASSING_GATE_STATUSES.has(fields.researchGate)) {
    status = "complete";
  }

  const ok = PASSING_GATE_STATUSES.has(status);
  return {
    ok,
    status,
    fields,
    frontmatter,
    reasons,
  };
}

export function reportReferencesContract(reportText, contractData = {}) {
  const relPath = String(contractData.relPath || "").trim();
  if (!relPath) return { ok: true, reasons: [] };

  const frontmatter = parseResearchGateFrontmatter(String(reportText || ""));
  const sources = asArray(frontmatter.sources);
  const related = frontmatter.related && typeof frontmatter.related === "object" ? frontmatter.related : {};
  const relatedContracts = asArray(related.agent_contracts);
  const references = [...sources, ...relatedContracts];

  if (references.includes(relPath)) {
    return { ok: true, reasons: [] };
  }

  return {
    ok: false,
    reasons: ["research_report_contract_mismatch"],
  };
}

export function contractAllowsExternalResearchNotApplicable(contractData = {}) {
  const text = String(contractData.text || "");
  const values = [
    bodyValue(text, "External verification needs"),
    bodyValue(text, "Source freshness requirements"),
    bodyValue(text, "Current-docs verification required"),
    bodyValue(text, "Current-docs verification status"),
    bodyValue(text, "External research policy"),
    bodyValue(text, "External research status"),
  ].join("\n").toLowerCase();

  if (/\bnone for fixture\b/.test(values)) return true;
  if (/\btests only\b/.test(values)) return true;
  if (/\bno-with-reason\b/.test(values)) return true;
  if (/\bnot-applicable\b/.test(values) && /\b(no|none|fixture|test|tests)\b/.test(values)) return true;
  return false;
}

export function isExternalResearchNotApplicable(contractData, gate) {
  const status = gate?.fields?.externalResearch || "missing";
  return status === "not-applicable" && contractAllowsExternalResearchNotApplicable(contractData);
}

export function researchGateDecisionForReport(contractData, reportText) {
  const gate = researchGateStatusForReport(reportText);
  const reference = reportReferencesContract(reportText, contractData);
  const reasons = [...gate.reasons, ...reference.reasons];
  const frontmatter = gate.frontmatter || {};
  const reportedContentLock = String(frontmatter.research_content_lock || "");
  if (gate.fields.researchGate === "complete" || reportedContentLock) {
    const contentLockOccurrences = (String(reportText || "").match(/^research_content_lock:/gm) || []).length;
    if (contentLockOccurrences !== 1 || !/^sha256:[a-f0-9]{64}$/i.test(reportedContentLock)) {
      reasons.push("research_content_lock_invalid");
    } else if (reportedContentLock !== markdownDocumentLock(reportText)) {
      reasons.push("research_content_document_mismatch");
    }
  }

  const expectedFingerprint = String(contractData.fingerprint || contractFingerprint(contractData));
  const reportFingerprint = String(frontmatter.contract_fingerprint || "").trim();
  if (!reportFingerprint) {
    reasons.push("contract_fingerprint_missing");
  } else if (reportFingerprint !== expectedFingerprint) {
    reasons.push("contract_fingerprint_mismatch");
  }

  const patternPackReference = String(frontmatter.pattern_pack || "").trim();
  const patternPackRequired = Boolean(contractData.root && contractData.fullPath);
  let verifiedPatternPackPayload = null;
  if (patternPackRequired && (!patternPackReference || patternPackReference === "pending")) {
    reasons.push("pattern_pack_missing_or_pending");
  } else if (patternPackReference && patternPackReference !== "pending") {
    const reportedPatternLock = String(frontmatter.pattern_pack_lock || "").trim();
    if (!/^sha256:[a-f0-9]{64}$/i.test(reportedPatternLock)) reasons.push("pattern_pack_lock_invalid");
    if (String(frontmatter.pattern_pack_contract_fingerprint || "") !== expectedFingerprint) {
      reasons.push("pattern_pack_report_contract_fingerprint_mismatch");
    }
    const root = contractData.root || "";
    if (!root) {
      reasons.push("pattern_pack_root_unavailable");
    } else {
      const fullPath = path.resolve(root, patternPackReference);
      const allowedRoots = [path.resolve(root), path.resolve(resolvePrithaAgentMemoryRoot({ root }))];
      const allowed = allowedRoots.some((allowedRoot) => fullPath === allowedRoot || fullPath.startsWith(`${allowedRoot}${path.sep}`));
      if (!allowed) {
        reasons.push("pattern_pack_path_outside_allowed_roots");
      } else {
        try {
          const text = readBoundedRegularFile(fullPath, { maxBytes: 1_000_000, allowedRoots }).text;
          const integrity = verifyPatternPackIntegrity(text, expectedFingerprint);
          if (!integrity.ok) reasons.push(...integrity.reasons);
          if (integrity.lock !== reportedPatternLock) reasons.push("pattern_pack_report_lock_mismatch");
          if (integrity.ok && integrity.lock === reportedPatternLock) verifiedPatternPackPayload = integrity.payload;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          reasons.push(message.includes("ENOENT") ? "pattern_pack_missing" : "pattern_pack_unsafe_or_unreadable");
        }
      }
    }
  }

  const externalNotApplicable = gate.fields.externalResearch === "not-applicable";
  if (externalNotApplicable && !contractAllowsExternalResearchNotApplicable(contractData)) {
    reasons.push("external_research_not_applicable_without_contract_reason");
  }

  const researchGateNotApplicable = gate.fields.researchGate === "not-applicable";
  if (researchGateNotApplicable && !contractAllowsExternalResearchNotApplicable(contractData)) {
    reasons.push("research_gate_not_applicable_without_contract_reason");
  }

  const requiredTopics = deriveExternalResearchTopics(contractData, {
    patternPack: verifiedPatternPackPayload
      ? { externalResearchSeeds: verifiedPatternPackPayload.external_research_seeds || [] }
      : undefined,
  });
  const declaredTopics = asArray(frontmatter.external_research_topics).filter((topic) => topic !== "not-applicable");
  const derivedTopicIds = [...new Set(requiredTopics.map((topic) => topic.id).filter(Boolean))];
  if (patternPackRequired && verifiedPatternPackPayload && !sameNormalizedList(declaredTopics, derivedTopicIds)) {
    reasons.push("external_research_topics_pattern_pack_mismatch");
  }
  const requiredTopicIds = patternPackRequired && verifiedPatternPackPayload
    ? requiredTopics.filter((topic) => topic.required).map((topic) => topic.id)
    : [...new Set([...requiredTopics.filter((topic) => topic.required).map((topic) => topic.id), ...declaredTopics])];
  let externalIntegrity = null;
  let repositoryIntegrityResult = null;
  const repositoryAdoptionMode = String(contractData.repositoryAdoptionMode || "none").toLowerCase();
  const selectedModuleAdoption = repositoryAdoptionMode === "selected-module";
  const referenceOnlyAdoption = repositoryAdoptionMode === "reference-only";
  const repositoryAdoptionRequiresEvidence = selectedModuleAdoption || referenceOnlyAdoption;
  if (selectedModuleAdoption) {
    if (gate.fields.researchGate !== "complete") reasons.push("selected_repository_overall_gate_not_complete");
    if (gate.fields.memoryResearch !== "complete") reasons.push("selected_repository_memory_research_not_complete");
    if (gate.fields.externalResearch !== "complete") reasons.push("selected_repository_external_research_not_complete");
    if (gate.fields.synthesis !== "complete") reasons.push("selected_repository_synthesis_not_complete");
    if (!asArray(frontmatter.external_evidence_topics).includes("github-repository-review")) {
      reasons.push("selected_repository_review_evidence_missing");
    }
  }
  if (referenceOnlyAdoption) {
    if (gate.fields.researchGate !== "complete") reasons.push("reference_repository_overall_gate_not_complete");
    if (gate.fields.memoryResearch !== "complete") reasons.push("reference_repository_memory_research_not_complete");
    if (gate.fields.externalResearch !== "complete") reasons.push("reference_repository_external_research_not_complete");
    if (gate.fields.synthesis !== "complete") reasons.push("reference_repository_synthesis_not_complete");
    if (!asArray(frontmatter.external_evidence_topics).includes("github-repository-review")) {
      reasons.push("reference_repository_review_evidence_missing");
    }
  }
  if (repositoryAdoptionRequiresEvidence && (externalNotApplicable || researchGateNotApplicable)) {
    reasons.push("repository_adoption_requires_external_evidence");
  }
  if (gate.fields.externalResearch === "complete") {
    const evidenceCount = Number(frontmatter.external_evidence_count);
    const evidenceTopics = asArray(frontmatter.external_evidence_topics);
    if (!Number.isInteger(evidenceCount) || evidenceCount < 1) reasons.push("external_evidence_count_invalid");
    for (const topicId of requiredTopicIds) {
      if (!evidenceTopics.includes(topicId)) reasons.push(`external_evidence_topic_missing:${topicId}`);
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(frontmatter.external_research_lock || ""))) {
      reasons.push("external_research_lock_invalid");
    }
    if (!String(reportText).includes("## External Research Evidence")) reasons.push("external_research_evidence_section_missing");
    const freshnessWindowDays = Math.max(1, Math.min(Number(frontmatter.external_research_freshness_window_days || 30) || 30, 365));
    if (!isRecentTimestamp(frontmatter.external_research_completed_at, freshnessWindowDays)) {
      reasons.push("external_research_stale_or_invalid");
    }
  }
  if (gate.fields.synthesis === "complete") {
    if (!/^sha256:[a-f0-9]{64}$/i.test(String(frontmatter.synthesis_lock || ""))) {
      reasons.push("synthesis_lock_invalid");
    }
    if (!String(reportText).includes("## Memory vs External Comparison")) reasons.push("synthesis_section_missing");
    if (!String(reportText).includes("## Architecture Recommendation")) reasons.push("architecture_recommendation_section_missing");
  }
  if (gate.fields.externalResearch === "complete" && gate.fields.synthesis === "complete") {
    const integrity = verifyExternalResearchIntegrity(reportText, requiredTopicIds, {
      repositoryAdoptionMode: contractData.repositoryAdoptionMode,
      selectedGitHubRepositories: contractData.selectedGitHubRepositories,
      selectedRepositoryModule: contractData.selectedRepositoryModule,
      repositoryPin: contractData.repositoryPin,
      repositoryLicenseDecision: contractData.repositoryLicenseDecision,
      repositorySecurityReview: contractData.repositorySecurityReview,
      repositoryPermissions: contractData.repositoryPermissions,
      repositoryEvalStatus: contractData.repositoryEvalStatus,
      repositoryUserApproval: contractData.repositoryUserApproval,
      contractFingerprint: expectedFingerprint,
      repositoryFreshnessWindowDays: requiredTopics.find((topic) => topic.id === "github-repository-review")?.freshnessWindowDays || 30,
    });
    externalIntegrity = integrity;
    if (!integrity.ok) reasons.push(...integrity.reasons);
  }

  const repositoryPlan = deriveRepositoryResearchPlan(contractData, requiredTopics, { githubMode: "auto" });
  const declaredRepositoryScopes = asArray(frontmatter.repository_research_scopes).filter((scope) => scope !== "not-applicable");
  const repositoryDeclared = String(frontmatter.repository_research_required || "").toLowerCase() === "true"
    || declaredRepositoryScopes.length > 0;
  const repositoryPolicyConflict = repositoryPlan.policy === "not-applicable"
    && (repositoryPlan.required || repositoryPlan.selectedRepositories.length > 0 || repositoryPlan.adoptionMode !== "none");
  const repositoryExpected = repositoryPolicyConflict || repositoryPlan.required || repositoryPlan.scopes.length > 0 || repositoryDeclared;
  if (repositoryPolicyConflict) {
    reasons.push(repositoryPlan.adoptionMode === "selected-module"
      ? "repository_research_policy_incompatible_with_selected_module"
      : "repository_research_policy_incompatible_with_selected_repository");
  }
  if (repositoryExpected) {
    const repositoryStatus = normalizeValue(frontmatter.repository_research_status);
    if (repositoryStatus !== "complete") {
      reasons.push(`repository_research_${repositoryStatus === "missing" ? "missing" : repositoryStatus}`);
    }
    if (!String(reportText).includes("## GitHub Repository Research")) {
      reasons.push("repository_research_section_missing");
    }
    if (repositoryStatus === "complete" && !isRecentTimestamp(frontmatter.repository_research_completed_at, 30)) {
      reasons.push("repository_research_stale_or_invalid");
    }
    if (repositoryStatus === "complete") {
      const repositoryIntegrity = verifyRepositoryResearchIntegrity(reportText);
      repositoryIntegrityResult = repositoryIntegrity;
      if (!repositoryIntegrity.ok) reasons.push(...repositoryIntegrity.reasons);
      const payloadPlan = repositoryIntegrity.payload?.plan || {};
      if (payloadPlan.policy !== repositoryPlan.policy) reasons.push("repository_research_contract_policy_mismatch");
      if (Boolean(payloadPlan.required) !== Boolean(repositoryPlan.required)) reasons.push("repository_research_contract_required_mismatch");
      if (payloadPlan.adoption_mode !== repositoryPlan.adoptionMode) reasons.push("repository_research_contract_adoption_mismatch");
      if (repositoryPlan.adoptionMode === "selected-module") {
        const expectedPin = canonicalRepositoryPin(contractData.repositoryPin);
        const expectedModule = normalizeRepositoryModulePath(contractData.selectedRepositoryModule) || "";
        if (payloadPlan.selected_pin !== expectedPin) reasons.push("repository_research_contract_pin_mismatch");
        if (payloadPlan.selected_module !== expectedModule) reasons.push("repository_research_contract_module_mismatch");
        if (repositoryIntegrity.payload?.online_status === "fixture") {
          reasons.push("repository_research_fixture_not_authoritative_for_selected_module");
        }
      }
      const payloadScopes = Array.isArray(payloadPlan.scopes) ? payloadPlan.scopes : [];
      for (const scope of repositoryPlan.scopes) {
        if (!payloadScopes.includes(scope)) reasons.push(`repository_research_scope_missing:${scope}`);
      }
      const expectedRepositories = repositoryPlan.selectedRepositories.map((repository) => repository.url);
      const payloadRepositories = Array.isArray(payloadPlan.selected_repositories) ? payloadPlan.selected_repositories : [];
      if (!sameNormalizedList(payloadRepositories, expectedRepositories)) {
        reasons.push("repository_research_contract_repositories_mismatch");
      }
      for (const repositoryUrl of expectedRepositories) {
        const candidate = Array.isArray(repositoryIntegrity.payload?.candidates)
          ? repositoryIntegrity.payload.candidates.find((item) => String(item?.repository || "").toLowerCase() === repositoryUrl.toLowerCase())
          : null;
        if (!candidate) {
          reasons.push(`repository_research_selected_candidate_missing:${repositoryUrl}`);
        } else if (candidate.archived || candidate.decision === "reject") {
          reasons.push(`repository_research_selected_candidate_rejected:${repositoryUrl}`);
        } else if (repositoryPlan.adoptionMode === "selected-module") {
          const expectedPinSha = canonicalRepositoryPin(contractData.repositoryPin).replace(/^(?:commit|tree-sha):/, "");
          const expectedModule = normalizeRepositoryModulePath(contractData.selectedRepositoryModule) || "";
          if (String(candidate.verified_pin_sha || "").toLowerCase() !== expectedPinSha) {
            reasons.push(`repository_research_selected_pin_unverified:${repositoryUrl}`);
          }
          if (candidate.verified_module_path !== expectedModule
            || !/^[a-f0-9]{40}$/i.test(String(candidate.verified_module_sha || ""))
            || candidate.verified_module_type !== "tree") {
            reasons.push(`repository_research_selected_module_unverified:${repositoryUrl}`);
          }
          if (!githubRepositoryContentUrlMatches(candidate.verification_source_url, repositoryUrl, "tree", expectedPinSha, expectedModule)) {
            reasons.push(`repository_research_selected_verification_source_invalid:${repositoryUrl}`);
          }
          const review = externalIntegrity?.repositoryEvidence?.find(
            (item) => String(item.repository_url || "").toLowerCase() === repositoryUrl.toLowerCase(),
          );
          if (!review) {
            reasons.push(`repository_license_external_evidence_missing:${repositoryUrl}`);
          } else {
            if (!repositoryLicenseDecisionCovers(contractData.repositoryLicenseDecision, candidate.verified_license_spdx)) {
              reasons.push("repository_license_decision_does_not_cover_verified_module_license");
            }
            if (review.license !== candidate.verified_license_spdx
              || review.license_source_spdx !== candidate.verified_license_spdx
              || review.license_source_blob_sha !== candidate.verified_license_blob_sha
              || review.license_source_content_sha256 !== candidate.verified_license_content_sha256
              || review.license_scope !== candidate.verified_license_scope
              || review.license_source_url !== candidate.verified_license_source_url
              || !githubRepositoryContentUrlMatches(
                review.license_source_url,
                repositoryUrl,
                "blob",
                expectedPinSha,
                candidate.verified_license_path,
              )) {
              reasons.push("repository_license_evidence_not_bound_to_verified_module_content");
            }
          }
        }
      }
    }
  }

  if (selectedModuleAdoption) {
    if (repositoryPlan.selectedRepositories.length !== 1) {
      reasons.push("repository_selected_repository_count_invalid");
    }
    const selectedFields = [
      ["selected_repository_missing", contractData.selectedGitHubRepositories],
      ["repository_module_missing", contractData.selectedRepositoryModule],
      ["repository_pin_missing", contractData.repositoryPin],
      ["repository_license_decision_missing", contractData.repositoryLicenseDecision],
      ["repository_security_review_missing", contractData.repositorySecurityReview],
      ["repository_permissions_missing", contractData.repositoryPermissions],
      ["repository_eval_missing", contractData.repositoryEvalStatus],
      ["repository_user_approval_missing", contractData.repositoryUserApproval],
    ];
    for (const [reason, value] of selectedFields) {
      if (!value || /^(none|unknown|pending|tbd|not-applicable)$/i.test(String(value).trim())) reasons.push(reason);
    }
    if (!isImmutableRepositoryPin(contractData.repositoryPin)) {
      reasons.push("repository_pin_not_immutable");
    }
    if (!isRepositoryLicenseApproved(contractData.repositoryLicenseDecision)) {
      reasons.push("repository_license_decision_not_approved");
    }
    if (!isRepositoryReviewPassed(contractData.repositorySecurityReview)) {
      reasons.push("repository_security_review_not_passed");
    }
    if (!isRepositoryPermissionsBounded(contractData.repositoryPermissions)) {
      reasons.push("repository_permissions_not_bounded");
    }
    if (!isRepositoryReviewPassed(contractData.repositoryEvalStatus)) {
      reasons.push("repository_eval_not_passed");
    }
    if (!isExplicitRepositoryApproval(contractData.repositoryUserApproval)) {
      reasons.push("repository_user_approval_not_explicit");
    }
    if (!requiredTopicIds.includes("github-repository-review")) {
      reasons.push("github_repository_review_topic_missing");
    }
  }

  const ok = gate.ok && reference.ok && reasons.length === 0;
  const status = ok ? gate.status : gate.status === "pending" ? "pending" : "failed";
  return {
    ...gate,
    ok,
    status,
    referencesContract: reference.ok,
    externalIntegrity,
    repositoryIntegrity: repositoryIntegrityResult,
    reasons,
  };
}
