import test from "node:test";
import assert from "node:assert/strict";

import {
  contractAllowsExternalResearchNotApplicable,
  normalizeResearchGateStatus,
  researchGateDecisionForReport,
  researchGateStatusForReport,
  reportReferencesContract,
} from "../scripts/agents-mother/research-gate.mjs";
import { contractFingerprint } from "../scripts/agents-mother/contract.mjs";
import { applyExternalResearchEvidence } from "../scripts/agents-mother/external-research.mjs";
import {
  repositoryResearchFrontmatter,
  repositoryResearchMarkdown,
} from "../scripts/agents-mother/github-research.mjs";
import { markdownDocumentLock } from "../scripts/lib/markdown-content-lock.mjs";

const TEST_NOW = new Date().toISOString();
const LICENSE_BLOB_SHA = "59d7f405ba78bdf4975a6df679968bcdfcaa7bbb";
const LICENSE_CONTENT_SHA256 = "f58783d38481ddcedebde2b7909d322fc272c80ce387e1d3679a29e356d6a00b";

const contract = {
  relPath: "11_agents/contracts/2026-06-22-sample-agent-contract.md",
  text: [
    "- External verification needs: Pritha memory plus current official docs before scaffold",
    "- Source freshness requirements: verify volatile platform/API choices before scaffold",
    "- Current-docs verification required: yes",
  ].join("\n"),
};

const fixtureContract = {
  relPath: "tests/fixtures/contracts/valid-agent-contract.md",
  text: [
    "- External verification needs: none for fixture.",
    "- Source freshness requirements: not-applicable.",
    "- Current-docs verification required: no-with-reason: deterministic fixture.",
  ].join("\n"),
};

function reportFor(contractData, gate = {}, referencedPath = contractData.relPath) {
  const report = [
    "---",
    "id: sample-agent-research",
    "type: review",
    "status: draft",
    "research_gate_status: pending",
    "memory_research_status: complete",
    "external_research_status: pending",
    "synthesis_status: pending",
    `contract_fingerprint: ${contractFingerprint(contractData)}`,
    "external_evidence_count: 0",
    "external_evidence_topics: []",
    "external_research_lock: pending",
    "synthesis_lock: pending",
    "external_research_topics:",
    "  - fixture-external",
    "sources:",
    `  - ${referencedPath}`,
    "related:",
    "  agent_contracts:",
    `    - ${referencedPath}`,
    "---",
    "",
    "# Sample Agent Research",
    "",
    `Contract: ${referencedPath}`,
    "",
    "## External Research Evidence",
    "",
    "Curated evidence fixture.",
    "",
    "## Memory vs External Comparison",
    "",
    "Fixture comparison.",
    "",
    "## Architecture Recommendation",
    "",
    "Fixture recommendation.",
  ].join("\n");
  let text = applyExternalResearchEvidence(report, contractData, {
    backend: "manual",
    completed_at: TEST_NOW,
    items: [{
      topic_id: "fixture-external",
      source_url: "https://example.test/official",
      source_type: "official-docs",
      source_updated: TEST_NOW,
      retrieved_at: TEST_NOW,
      claim: "Current authoritative evidence confirms the fixture architecture decision.",
      confidence: "high",
    }],
    synthesis: {
      relationship: "confirms",
      memory_comparison: "Current external evidence confirms the relevant local memory guidance without contradiction.",
      summary: "The current architecture remains appropriate for this deterministic gate fixture.",
      architecture_decision: "Retain the current bounded architecture and its explicit verification gates.",
      alternatives: ["defer the implementation"],
      tradeoffs: ["strict evidence adds setup effort"],
    },
  }, { topics: [{ id: "fixture-external", required: true }] }).text;
  for (const [key, value] of Object.entries(gate)) {
    text = text.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`);
  }
  text = text.replace(
    /^research_content_lock:.*$/m,
    `research_content_lock: ${markdownDocumentLock(text)}`,
  );
  return text;
}

test("research gate status requires explicit machine-readable fields", () => {
  const legacy = [
    "---",
    "id: legacy-research",
    "type: review",
    "status: complete",
    "---",
    "",
    "Fixture result: local scaffold standards are sufficient; no external volatile choices.",
  ].join("\n");

  const gate = researchGateStatusForReport(legacy);
  assert.equal(gate.ok, false);
  assert.equal(gate.status, "pending");
  assert.ok(gate.reasons.includes("researchGate_missing"));
  assert.ok(gate.reasons.includes("externalResearch_missing"));
});

test("complete research gate passes for a matching contract", () => {
  const decision = researchGateDecisionForReport(contract, reportFor(contract));
  assert.equal(decision.ok, true);
  assert.equal(decision.status, "complete");
  assert.deepEqual(decision.reasons, []);
});

test("pending external research blocks scaffold readiness", () => {
  const decision = researchGateDecisionForReport(
    contract,
    reportFor(contract, { external_research_status: "pending" }),
  );
  assert.equal(decision.ok, false);
  assert.equal(decision.status, "pending");
  assert.ok(decision.reasons.includes("externalResearch_pending"));
});

test("not-applicable external research requires a contract reason", () => {
  const normalDecision = researchGateDecisionForReport(
    contract,
    reportFor(contract, { external_research_status: "not-applicable" }),
  );
  assert.equal(normalDecision.ok, false);
  assert.equal(normalDecision.status, "failed");
  assert.ok(normalDecision.reasons.includes("external_research_not_applicable_without_contract_reason"));

  const fixtureDecision = researchGateDecisionForReport(
    fixtureContract,
    reportFor(fixtureContract, {
      external_research_status: "not-applicable",
      synthesis_status: "not-applicable",
    }),
  );
  assert.equal(contractAllowsExternalResearchNotApplicable(fixtureContract), true);
  assert.equal(fixtureDecision.ok, true);
  assert.equal(fixtureDecision.status, "complete");
});

test("research gate rejects reports that do not reference the contract", () => {
  const report = reportFor(contract, {}, "11_agents/contracts/other-agent-contract.md");
  const reference = reportReferencesContract(report, contract);
  assert.equal(reference.ok, false);
  assert.deepEqual(reference.reasons, ["research_report_contract_mismatch"]);

  const decision = researchGateDecisionForReport(contract, report);
  assert.equal(decision.ok, false);
  assert.equal(decision.status, "failed");
  assert.ok(decision.reasons.includes("research_report_contract_mismatch"));
});

test("contract changes invalidate a previously completed research report", () => {
  const report = reportFor(contract);
  const changed = { ...contract, text: `${contract.text}\n- New requirement: selected external module` };
  const decision = researchGateDecisionForReport(changed, report);
  assert.equal(decision.ok, false);
  assert.ok(decision.reasons.includes("contract_fingerprint_mismatch"));
});

test("complete statuses without evidence locks fail closed", () => {
  const report = reportFor(contract)
    .replace(/^external_research_lock:.*$/m, "external_research_lock: pending")
    .replace(/^synthesis_lock:.*$/m, "synthesis_lock: pending");
  const decision = researchGateDecisionForReport(contract, report);
  assert.equal(decision.ok, false);
  assert.ok(decision.reasons.includes("external_research_lock_invalid"));
  assert.ok(decision.reasons.includes("synthesis_lock_invalid"));
});

function selectedRepositoryContract(overrides = {}) {
  const values = {
    relPath: "11_agents/contracts/selected-repository-agent-contract.md",
    runtimeFamily: "codex-native",
    repositoryResearchPolicy: "required",
    repositoryResearchTopics: "agent-harness",
    selectedGitHubRepositories: "https://github.com/example/agent-kit",
    repositoryAdoptionMode: "selected-module",
    selectedRepositoryModule: "packages/runtime-adapter",
    repositoryPin: "commit:0123456789abcdef0123456789abcdef01234567",
    repositoryLicenseDecision: "MIT compatible and approved",
    repositorySecurityReview: "passed",
    repositoryPermissions: "project folder filesystem read-only; GitHub API network only",
    repositoryEvalStatus: "passed",
    repositoryUserApproval: "explicitly approved by user",
    ...overrides,
  };
  values.text = JSON.stringify(values);
  return values;
}

function selectedRepositoryReport(contractData, evidenceOverrides = {}) {
  const repositoryResearch = {
    plan: {
      policy: "required",
      mode: "auto",
      required: true,
      scopes: ["agent-harness", "agent-evals"],
      selectedRepositories: [{ url: "https://github.com/example/agent-kit" }],
      selectedPin: "commit:0123456789abcdef0123456789abcdef01234567",
      selectedModule: "packages/runtime-adapter",
      adoptionMode: "selected-module",
      reason: "The contract selects an external repository module.",
      online: true,
      limit: 5,
    },
    status: "complete",
    completedAt: TEST_NOW,
    registry: {
      ok: true,
      relativePath: "01_sources/registries/github-agent-building-repos.md",
    },
    onlineStatus: "complete",
    queries: [],
    candidates: [{
      repository: { url: "https://github.com/example/agent-kit" },
      source: "explicit",
      discoverySource: "github-api",
      fitScopes: ["agent-harness", "agent-evals"],
      registryStatus: "explicit-verified",
      stars: 10,
      license: "MIT",
      updatedAt: TEST_NOW,
      pushedAt: TEST_NOW,
      defaultBranch: "main",
      headSha: "0123456789abcdef0123456789abcdef01234567",
      verifiedPinSha: "0123456789abcdef0123456789abcdef01234567",
      verifiedModulePath: "packages/runtime-adapter",
      verifiedModuleSha: "89abcdef0123456789abcdef0123456789abcdef",
      verifiedModuleType: "tree",
      verificationSourceUrl: "https://github.com/example/agent-kit/tree/0123456789abcdef0123456789abcdef01234567/packages/runtime-adapter",
      verifiedLicensePath: "packages/runtime-adapter/LICENSE",
      verifiedLicenseBlobSha: LICENSE_BLOB_SHA,
      verifiedLicenseContentSha256: LICENSE_CONTENT_SHA256,
      verifiedLicenseSpdx: "MIT",
      verifiedLicenseSourceUrl: "https://github.com/example/agent-kit/blob/0123456789abcdef0123456789abcdef01234567/packages/runtime-adapter/LICENSE",
      verifiedLicenseScope: "module-local",
      latestReleaseTag: "v1.2.3",
      retrievedAt: TEST_NOW,
      archived: false,
      fork: false,
      decision: "candidate",
      blockers: ["security-review", "contract-specific-eval"],
    }],
    errors: [],
  };
  const base = [
    "---",
    "id: selected-repository-agent-research",
    "type: review",
    "status: draft",
    `contract_fingerprint: ${contractFingerprint(contractData)}`,
    "research_gate_status: pending",
    "memory_research_status: complete",
    "external_research_status: pending",
    "synthesis_status: pending",
    "external_evidence_count: 0",
    "external_evidence_topics: []",
    "external_research_lock: pending",
    "synthesis_lock: pending",
    "external_research_topics:",
    "  - github-repository-review",
    ...repositoryResearchFrontmatter(repositoryResearch).split("\n"),
    "sources:",
    `  - ${contractData.relPath}`,
    "related:",
    "  agent_contracts:",
    `    - ${contractData.relPath}`,
    "---",
    "",
    "# Selected Repository Agent Research",
    "",
    repositoryResearchMarkdown(repositoryResearch),
    "",
    "## External Research Evidence",
    "",
    "- Pending.",
    "",
    "## Memory vs External Comparison",
    "",
    "- Pending.",
    "",
    "## Architecture Recommendation",
    "",
    "- Pending.",
    "",
    "## Scaffold Gate Decision",
    "",
    "- Status: pending",
  ].join("\n");
  const baseEvidence = {
    topic_id: "github-repository-review",
    source_url: "https://github.com/example/agent-kit",
    source_type: "official-repository",
    source_updated: TEST_NOW,
    retrieved_at: TEST_NOW,
    evidence_summary: "Maintainer metadata, license, pinned source tree and module boundaries were reviewed.",
    confidence: "high",
    risk_note: "Install scripts and network behavior were reviewed within the declared permission boundary.",
    repository_url: "https://github.com/example/agent-kit",
    repository_module: "packages/runtime-adapter",
    version_pin: "commit:0123456789abcdef0123456789abcdef01234567",
    license: "MIT",
    license_source_url: "https://github.com/example/agent-kit/blob/0123456789abcdef0123456789abcdef01234567/packages/runtime-adapter/LICENSE",
    license_source_blob_sha: LICENSE_BLOB_SHA,
    license_source_content_sha256: LICENSE_CONTENT_SHA256,
    license_source_spdx: "MIT",
    license_scope: "module-local",
    authority: "Official repository maintained by the project owner.",
    adoption_decision: "selected-module",
    security_review: "passed",
    permissions: ["project folder filesystem read-only", "GitHub API network only"],
    eval_status: "passed",
    user_approval: "explicitly-approved",
  };
  const evidenceItems = Array.isArray(evidenceOverrides)
    ? evidenceOverrides.map((overrides) => ({ ...baseEvidence, ...overrides }))
    : [{ ...baseEvidence, ...evidenceOverrides }];
  return applyExternalResearchEvidence(base, contractData, {
    backend: "manual",
    items: evidenceItems,
    synthesis: {
      relationship: "refines",
      memory_comparison: "The pinned module refines the local harness guidance without replacing Pritha safety gates.",
      summary: "Only the reviewed runtime adapter is selected; the repository as a whole remains untrusted.",
      architecture_decision: "Adopt the pinned adapter behind the declared least-privilege boundary and eval suite.",
      repository_adoption_recommendation: "proceed",
      alternatives: ["implement a local adapter"],
      tradeoffs: ["external code reduces build time but adds supply-chain review"],
    },
  }, {
    topics: [{ id: "github-repository-review", required: true }],
    evaluateOverallGate: (text) => researchGateDecisionForReport(contractData, text),
  }).text;
}

function referenceOnlyRepositoryContract(overrides = {}) {
  const values = {
    relPath: "11_agents/contracts/reference-repository-agent-contract.md",
    runtimeFamily: "codex-native",
    repositoryResearchPolicy: "required",
    repositoryResearchTopics: "agent-harness",
    selectedGitHubRepositories: "https://github.com/example/reference-kit",
    repositoryAdoptionMode: "reference-only",
    selectedRepositoryModule: "not-applicable",
    repositoryPin: "not-applicable",
    repositoryLicenseDecision: "not-applicable",
    repositorySecurityReview: "not-applicable",
    repositoryPermissions: "not-applicable",
    repositoryEvalStatus: "not-applicable",
    repositoryUserApproval: "not-applicable",
    ...overrides,
  };
  values.text = JSON.stringify(values);
  return values;
}

function referenceOnlyRepositoryReport(contractData, evidenceOverrides = {}) {
  const repositoryUrl = "https://github.com/example/reference-kit";
  const repositoryResearch = {
    plan: {
      policy: contractData.repositoryResearchPolicy,
      mode: "auto",
      required: true,
      scopes: ["agent-harness", "agent-evals"],
      selectedRepositories: [{ url: repositoryUrl }],
      selectedPin: "not-applicable",
      selectedModule: "not-applicable",
      adoptionMode: "reference-only",
      reason: "The contract selects a repository as architecture evidence only.",
      online: true,
      limit: 5,
    },
    status: "complete",
    completedAt: TEST_NOW,
    registry: { ok: true, relativePath: "01_sources/registries/github-agent-building-repos.md" },
    onlineStatus: "complete",
    queries: [],
    candidates: [{
      repository: { url: repositoryUrl },
      source: "explicit",
      discoverySource: "github-api",
      fitScopes: ["agent-harness", "agent-evals"],
      registryStatus: "explicit-verified",
      stars: 10,
      license: "MIT",
      updatedAt: TEST_NOW,
      pushedAt: TEST_NOW,
      defaultBranch: "main",
      headSha: "0123456789abcdef0123456789abcdef01234567",
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
      latestReleaseTag: "v1.2.3",
      retrievedAt: TEST_NOW,
      archived: false,
      fork: false,
      decision: "reference-only",
      blockers: [],
    }],
    errors: [],
  };
  const base = [
    "---",
    "id: reference-repository-agent-research",
    "type: review",
    "status: draft",
    `contract_fingerprint: ${contractFingerprint(contractData)}`,
    "research_gate_status: pending",
    "memory_research_status: complete",
    "external_research_status: pending",
    "synthesis_status: pending",
    "external_evidence_count: 0",
    "external_evidence_topics: []",
    "external_research_lock: pending",
    "synthesis_lock: pending",
    "external_research_topics:",
    "  - github-repository-review",
    ...repositoryResearchFrontmatter(repositoryResearch).split("\n"),
    "sources:",
    `  - ${contractData.relPath}`,
    "related:",
    "  agent_contracts:",
    `    - ${contractData.relPath}`,
    "---",
    "",
    "# Reference Repository Agent Research",
    "",
    repositoryResearchMarkdown(repositoryResearch),
    "",
    "## External Research Evidence",
    "",
    "- Pending.",
    "",
    "## Memory vs External Comparison",
    "",
    "- Pending.",
    "",
    "## Architecture Recommendation",
    "",
    "- Pending.",
    "",
    "## Scaffold Gate Decision",
    "",
    "- Status: pending",
  ].join("\n");
  return applyExternalResearchEvidence(base, contractData, {
    backend: "manual",
    items: [{
      topic_id: "github-repository-review",
      source_url: repositoryUrl,
      source_type: "official-repository",
      source_updated: TEST_NOW,
      retrieved_at: TEST_NOW,
      evidence_summary: "The current repository metadata and architecture were reviewed as non-executable reference evidence.",
      confidence: "high",
      risk_note: "The repository remains untrusted and is not copied, installed or executed.",
      repository_url: repositoryUrl,
      version_pin: "tag:v1.2.3",
      license: "MIT",
      authority: "Official repository maintained by the project owner.",
      adoption_decision: "reference-only",
      ...evidenceOverrides,
    }],
    synthesis: {
      relationship: "refines",
      memory_comparison: "The repository refines local architecture guidance but does not authorize code adoption.",
      summary: "The repository is retained solely as bounded architecture evidence.",
      architecture_decision: "Use the reviewed concepts only after independently validating their fit with the contract.",
      repository_adoption_recommendation: "proceed",
      alternatives: ["use local standards only"],
      tradeoffs: ["external reference material adds verification work"],
    },
  }, {
    topics: [{ id: "github-repository-review", required: true }],
    evaluateOverallGate: (text) => researchGateDecisionForReport(contractData, text),
  }).text;
}

test("selected repository adoption is fail-closed for every contract gate", () => {
  const completeContract = selectedRepositoryContract();
  const passing = researchGateDecisionForReport(completeContract, selectedRepositoryReport(completeContract));
  assert.equal(passing.ok, true, passing.reasons.join(", "));

  const cases = [
    ["repositoryPin", "main", "repository_pin_not_immutable"],
    ["repositoryLicenseDecision", "pending", "repository_license_decision_missing"],
    ["repositorySecurityReview", "pending", "repository_security_review_missing"],
    ["repositoryPermissions", "pending", "repository_permissions_missing"],
    ["repositoryEvalStatus", "pending", "repository_eval_missing"],
    ["repositoryUserApproval", "reviewed", "repository_user_approval_not_explicit"],
    ["repositoryLicenseDecision", "MIT incompatible and rejected", "repository_license_decision_not_approved"],
    ["repositorySecurityReview", "failed", "repository_security_review_not_passed"],
    ["repositoryPermissions", "unrestricted full access", "repository_permissions_not_bounded"],
    ["repositoryEvalStatus", "failed", "repository_eval_not_passed"],
    ["repositoryUserApproval", "not approved", "repository_user_approval_not_explicit"],
    ["repositoryResearchPolicy", "not-applicable", "repository_research_policy_incompatible_with_selected_module"],
  ];
  for (const [field, value, expectedReason] of cases) {
    const candidate = selectedRepositoryContract({ [field]: value });
    const decision = researchGateDecisionForReport(candidate, selectedRepositoryReport(candidate));
    assert.equal(decision.ok, false, `${field} unexpectedly passed`);
    assert.ok(decision.reasons.includes(expectedReason), `${field}: ${decision.reasons.join(", ")}`);
  }
});

test("selected repository adoption cannot waive external review evidence or synthesis", () => {
  const contractData = selectedRepositoryContract();
  contractData.text = `${contractData.text}\n- External verification needs: no-with-reason deterministic fixture`;
  const waived = selectedRepositoryReport(contractData)
    .replace(/^external_research_status: complete$/m, "external_research_status: not-applicable")
    .replace(/^synthesis_status: complete$/m, "synthesis_status: not-applicable")
    .replace(/^external_evidence_count: \d+$/m, "external_evidence_count: 0")
    .replace(/^external_evidence_topics:.*$/m, "external_evidence_topics: []")
    .replace(/^external_research_lock:.*$/m, "external_research_lock: pending")
    .replace(/^synthesis_lock:.*$/m, "synthesis_lock: pending")
    .replace(/<!-- pritha-external-research-(?:evidence|synthesis)-v1 [A-Za-z0-9_-]+ -->/g, "");
  const decision = researchGateDecisionForReport(contractData, waived);
  assert.equal(decision.ok, false);
  assert.ok(decision.reasons.includes("selected_repository_external_research_not_complete"));
  assert.ok(decision.reasons.includes("selected_repository_synthesis_not_complete"));
  assert.ok(decision.reasons.includes("selected_repository_review_evidence_missing"));
});

test("selected repository evidence is bound to the exact contract repository, module, pin and permissions", () => {
  const contractData = selectedRepositoryContract();
  const cases = [
    [{
      source_url: "https://github.com/other/agent-kit",
      repository_url: "https://github.com/other/agent-kit",
      license_source_url: "https://github.com/other/agent-kit/blob/0123456789abcdef0123456789abcdef01234567/packages/runtime-adapter/LICENSE",
    }, "repository_evidence_repository_mismatch"],
    [{
      repository_module: "packages/other-adapter",
      license_source_url: "https://github.com/example/agent-kit/blob/0123456789abcdef0123456789abcdef01234567/packages/other-adapter/LICENSE",
    }, "repository_evidence_module_mismatch"],
    [{
      version_pin: "commit:ffffffffffffffffffffffffffffffffffffffff",
      license_source_url: "https://github.com/example/agent-kit/blob/ffffffffffffffffffffffffffffffffffffffff/packages/runtime-adapter/LICENSE",
    }, "repository_evidence_pin_mismatch"],
    [{ license: "Apache-2.0", license_source_spdx: "Apache-2.0" }, "repository_evidence_license_mismatch"],
    [{ permissions: ["filesystem read-write"] }, "repository_evidence_permissions_mismatch"],
  ];
  for (const [overrides, expectedReason] of cases) {
    const report = selectedRepositoryReport(contractData, overrides);
    const decision = researchGateDecisionForReport(contractData, report);
    assert.equal(decision.ok, false, `${expectedReason} unexpectedly passed`);
    assert.ok(
      decision.reasons.includes(expectedReason)
        || (decision.reasons.includes("externalResearch_pending") && report.includes(expectedReason)),
      decision.reasons.join(", "),
    );
  }
});

test("stale exact repository evidence cannot borrow freshness from a conflicting review", () => {
  const contractData = selectedRepositoryContract();
  const freshWrongPin = "ffffffffffffffffffffffffffffffffffffffff";
  const report = selectedRepositoryReport(contractData, [
    { source_updated: "2019-01-01T00:00:00Z" },
    {
      version_pin: `commit:${freshWrongPin}`,
      license_source_url: `https://github.com/example/agent-kit/blob/${freshWrongPin}/packages/runtime-adapter/LICENSE`,
    },
  ]);
  const decision = researchGateDecisionForReport(contractData, report);
  assert.equal(decision.ok, false);
  assert.match(report, /repository_evidence_pin_mismatch/);
  assert.ok(decision.reasons.includes("externalResearch_pending"));
});

test("reference-only adoption cannot waive research or substitute evidence from another repository", () => {
  const contractData = referenceOnlyRepositoryContract();
  const passing = researchGateDecisionForReport(contractData, referenceOnlyRepositoryReport(contractData));
  assert.equal(passing.ok, true, passing.reasons.join(", "));

  const wrongRepository = referenceOnlyRepositoryReport(contractData, {
    source_url: "https://github.com/other/reference-kit",
    repository_url: "https://github.com/other/reference-kit",
  });
  const wrongDecision = researchGateDecisionForReport(contractData, wrongRepository);
  assert.equal(wrongDecision.ok, false);
  assert.ok(wrongDecision.reasons.includes("externalResearch_pending"));
  assert.match(wrongRepository, /repository_evidence_repository_mismatch/);
  assert.match(wrongRepository, /repository_evidence_missing:/);

  const waivedContract = referenceOnlyRepositoryContract({ repositoryResearchPolicy: "not-applicable" });
  const waivedDecision = researchGateDecisionForReport(waivedContract, referenceOnlyRepositoryReport(waivedContract));
  assert.equal(waivedDecision.ok, false);
  assert.ok(waivedDecision.reasons.includes("repository_research_policy_incompatible_with_selected_repository"));

  const externallyWaivable = referenceOnlyRepositoryContract();
  externallyWaivable.text = `${externallyWaivable.text}\n- External verification needs: no-with-reason deterministic fixture`;
  const noEvidence = referenceOnlyRepositoryReport(externallyWaivable)
    .replace(/^research_gate_status: complete$/m, "research_gate_status: not-applicable")
    .replace(/^external_research_status: complete$/m, "external_research_status: not-applicable")
    .replace(/^synthesis_status: complete$/m, "synthesis_status: not-applicable")
    .replace(/^external_evidence_count: \d+$/m, "external_evidence_count: 0")
    .replace(/^external_evidence_topics:.*$/m, "external_evidence_topics: []")
    .replace(/^external_research_lock:.*$/m, "external_research_lock: pending")
    .replace(/^synthesis_lock:.*$/m, "synthesis_lock: pending")
    .replace(/<!-- pritha-external-research-(?:evidence|synthesis)-v1 [A-Za-z0-9_-]+ -->/g, "");
  const noEvidenceDecision = researchGateDecisionForReport(externallyWaivable, noEvidence);
  assert.equal(noEvidenceDecision.ok, false);
  assert.ok(noEvidenceDecision.reasons.includes("reference_repository_external_research_not_complete"));
  assert.ok(noEvidenceDecision.reasons.includes("reference_repository_synthesis_not_complete"));
  assert.ok(noEvidenceDecision.reasons.includes("reference_repository_review_evidence_missing"));
  assert.ok(noEvidenceDecision.reasons.includes("repository_adoption_requires_external_evidence"));
});

test("research gate status values are strict", () => {
  assert.equal(normalizeResearchGateStatus("complete"), "complete");
  assert.equal(normalizeResearchGateStatus("not_applicable"), "not-applicable");
  assert.equal(normalizeResearchGateStatus("verified"), "malformed");
  assert.equal(normalizeResearchGateStatus(""), "missing");
});
