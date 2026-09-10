import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseFrontmatterData } from "../scripts/lib/frontmatter.mjs";
import { contractData, contractFingerprint } from "../scripts/agents-mother/contract.mjs";
import { deriveExternalResearchTopics } from "../scripts/agents-mother/external-research-topics.mjs";
import { applyExternalResearchEvidence } from "../scripts/agents-mother/external-research.mjs";
import {
  repositoryResearchFrontmatter,
  repositoryResearchMarkdown,
  runRepositoryResearch,
} from "../scripts/agents-mother/github-research.mjs";
import { researchGateDecisionForReport } from "../scripts/agents-mother/research-gate.mjs";

const ENTRYPOINT = path.resolve("scripts/pritha.mjs");
const TEST_NOW = new Date().toISOString();
const LICENSE_BLOB_SHA = "59d7f405ba78bdf4975a6df679968bcdfcaa7bbb";
const LICENSE_CONTENT_SHA256 = "f58783d38481ddcedebde2b7909d322fc272c80ce387e1d3679a29e356d6a00b";

function run(root, args) {
  return execFileSync("node", [ENTRYPOINT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TECHSCOPE_ROOT: root,
      PRITHA_AGENT_PARENT: path.join(root, "children"),
      GITHUB_TOKEN: "",
      GH_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function selectedContract() {
  return readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replaceAll("Snapshot Agent", "E2E Repository Agent")
    .replace("provide a stable minimal fixture for Agents Mother scaffold tests.", "use one reviewed repository module behind a bounded adapter.")
    .replace("- Repository research policy: not-applicable", "- Repository research policy: required")
    .replace("- Repository research topics: none", "- Repository research topics: agent-harness, agent-evals")
    .replace("- Selected GitHub repositories: none", "- Selected GitHub repositories: https://github.com/example/agent-kit")
    .replace("- Repository adoption mode: none", "- Repository adoption mode: selected-module")
    .replace("- Selected repository module: not-applicable", "- Selected repository module: packages/runtime-adapter")
    .replace("- Repository pin: not-applicable", "- Repository pin: commit:0123456789abcdef0123456789abcdef01234567")
    .replace("- Repository license decision: not-applicable", "- Repository license decision: MIT compatible and approved")
    .replace("- Repository security review: not-applicable", "- Repository security review: passed")
    .replace("- Repository permissions: not-applicable", "- Repository permissions: project folder filesystem read-only; GitHub API network only")
    .replace("- Repository eval status: not-applicable", "- Repository eval status: passed")
    .replace("- Repository user approval: not-applicable", "- Repository user approval: explicitly approved by user");
}

function evidenceForTopics(topicIds) {
  const generic = topicIds
    .filter((id) => id !== "github-repository-review")
    .map((id) => ({
      topic_id: id,
      source_url: `https://example.test/official/${encodeURIComponent(id)}`,
      source_type: "official-docs",
      source_updated: TEST_NOW,
      retrieved_at: TEST_NOW,
      claim: `Current authoritative material verifies the ${id} architecture choice for this test contract.`,
      confidence: "high",
    }));
  return {
    backend: "manual",
    completed_at: TEST_NOW,
    repository_adoption_mode: "selected-module",
    items: [
      ...generic,
      {
        topic_id: "github-repository-review",
        source_url: "https://github.com/example/agent-kit",
        source_type: "official-repository",
        source_updated: TEST_NOW,
        retrieved_at: TEST_NOW,
        evidence_summary: "Maintainer metadata, license, exact source pin and selected module boundaries were reviewed.",
        confidence: "high",
        risk_note: "Install scripts, dependency manifests and network behavior were reviewed against the contract boundary.",
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
      },
    ],
    synthesis: {
      relationship: "refines",
      memory_comparison: "The reviewed pinned adapter refines local Pritha harness guidance without replacing its safety boundaries.",
      summary: "Only the selected adapter is approved; all other repository content remains untrusted and uninstalled.",
      architecture_decision: "Record the pinned adapter provenance in scaffold while keeping installation a separate explicit step.",
      repository_adoption_recommendation: "proceed",
      alternatives: ["implement an equivalent local adapter"],
      tradeoffs: ["external code saves implementation time but adds supply-chain maintenance"],
    },
  };
}

test("registry-only reference adoption reaches the full gate through fresh exact evidence", async () => {
  const repositoryUrl = "https://github.com/bytedance/deer-flow";
  const contract = {
    relPath: "11_agents/contracts/registry-reference-agent-contract.md",
    runtimeFamily: "codex-native",
    repositoryResearchPolicy: "registry-only",
    repositoryResearchTopics: "agent-harness",
    selectedGitHubRepositories: repositoryUrl,
    repositoryAdoptionMode: "reference-only",
    selectedRepositoryModule: "not-applicable",
    repositoryPin: "not-applicable",
    repositoryLicenseDecision: "not-applicable",
    repositorySecurityReview: "not-applicable",
    repositoryPermissions: "not-applicable",
    repositoryEvalStatus: "not-applicable",
    repositoryUserApproval: "not-applicable",
  };
  contract.text = JSON.stringify(contract);
  contract.fingerprint = contractFingerprint(contract);
  const topics = deriveExternalResearchTopics(contract);
  const repositoryResearch = await runRepositoryResearch(
    path.resolve("."),
    contract,
    topics,
    { githubMode: "registry-only", githubLimit: 5 },
  );

  assert.equal(repositoryResearch.status, "complete");
  assert.equal(repositoryResearch.onlineStatus, "registry-only");
  const selectedCandidate = repositoryResearch.candidates.find(
    (candidate) => candidate.repository.url.toLowerCase() === repositoryUrl.toLowerCase(),
  );
  assert.ok(selectedCandidate);
  assert.equal(selectedCandidate.discoverySource, "registry");
  assert.equal(selectedCandidate.headSha, "unknown");

  const report = [
    "---",
    "id: registry-reference-agent-research",
    "type: review",
    "status: draft",
    `contract_fingerprint: ${contract.fingerprint}`,
    "research_gate_status: pending",
    "memory_research_status: complete",
    "external_research_status: pending",
    "synthesis_status: pending",
    "external_evidence_count: 0",
    "external_evidence_topics: []",
    "external_research_lock: pending",
    "synthesis_lock: pending",
    "research_content_lock: pending",
    "external_research_topics:",
    ...topics.map((topic) => `  - ${topic.id}`),
    ...repositoryResearchFrontmatter(repositoryResearch).split("\n"),
    "sources:",
    `  - ${contract.relPath}`,
    "related:",
    "  agent_contracts:",
    `    - ${contract.relPath}`,
    "---",
    "",
    "# Registry-only Reference Agent Research",
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
  const updated = applyExternalResearchEvidence(report, contract, {
    backend: "manual",
    completed_at: TEST_NOW,
    repository_adoption_mode: "reference-only",
    items: [{
      topic_id: "github-repository-review",
      source_url: repositoryUrl,
      source_type: "official-repository",
      source_updated: TEST_NOW,
      retrieved_at: TEST_NOW,
      evidence_summary: "The current repository architecture and maintainer metadata were independently reviewed.",
      confidence: "high",
      risk_note: "The repository remains untrusted reference material and no code is executed.",
      repository_url: repositoryUrl,
      version_pin: "tag:v1.0.0",
      license: "MIT",
      authority: "Official repository maintained by the project owner.",
      adoption_decision: "reference-only",
    }],
    synthesis: {
      relationship: "refines",
      memory_comparison: "The external repository refines local architecture guidance without changing Pritha safety boundaries.",
      summary: "The repository is retained as reference-only evidence and no repository code is executed.",
      architecture_decision: "Use this repository only as reviewed architecture reference material.",
      repository_adoption_recommendation: "proceed",
      alternatives: ["keep only local architecture notes"],
      tradeoffs: ["external reference material adds recurring freshness review work"],
    },
  }, {
    topics,
    evaluateOverallGate: (text) => researchGateDecisionForReport(contract, text),
  });
  const gate = researchGateDecisionForReport(contract, updated.text);
  const frontmatter = parseFrontmatterData(updated.text);

  assert.equal(updated.status, "complete");
  assert.equal(gate.ok, true, gate.reasons.join(", "));
  assert.equal(gate.status, "complete");
  assert.match(String(frontmatter.repository_research_lock), /^sha256:[a-f0-9]{64}$/);
  assert.match(String(frontmatter.external_research_lock), /^sha256:[a-f0-9]{64}$/);
  assert.match(String(frontmatter.synthesis_lock), /^sha256:[a-f0-9]{64}$/);
  assert.match(String(frontmatter.research_content_lock), /^sha256:[a-f0-9]{64}$/);
});

test("contract-aware GitHub research reaches scaffold through verified gates without network or code adoption", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-github-e2e-"));
  try {
    const memoryDir = path.join(root, ".memory");
    const contractDir = path.join(root, "11_agents", "contracts");
    const registryDir = path.join(root, "01_sources", "registries");
    mkdirSync(memoryDir, { recursive: true });
    mkdirSync(contractDir, { recursive: true });
    mkdirSync(registryDir, { recursive: true });
    execFileSync("sqlite3", [path.join(memoryDir, "techscope.sqlite")], {
      input: readFileSync(".memory/schema.sql", "utf8"),
      encoding: "utf8",
    });
    cpSync(
      "01_sources/registries/github-agent-building-repos.md",
      path.join(registryDir, "github-agent-building-repos.md"),
    );
    const registryBefore = readFileSync(path.join(registryDir, "github-agent-building-repos.md"), "utf8");

    const contractPath = path.join(contractDir, "e2e-repository-agent-contract.md");
    writeFileSync(contractPath, selectedContract());
    const fixturePath = path.join(root, "github-fixture.json");
    writeFileSync(fixturePath, JSON.stringify({
      items: [{
        html_url: "https://github.com/example/agent-kit",
        description: "A bounded runtime adapter reference.",
        stargazers_count: 123,
        updated_at: TEST_NOW,
        pushed_at: TEST_NOW,
        default_branch: "main",
        head_sha: "0123456789abcdef0123456789abcdef01234567",
        verified_pin_sha: "0123456789abcdef0123456789abcdef01234567",
        verified_module_path: "packages/runtime-adapter",
        verified_module_sha: "89abcdef0123456789abcdef0123456789abcdef",
        verified_module_type: "tree",
        verification_source_url: "https://github.com/example/agent-kit/tree/0123456789abcdef0123456789abcdef01234567/packages/runtime-adapter",
        verified_license_path: "packages/runtime-adapter/LICENSE",
        verified_license_blob_sha: LICENSE_BLOB_SHA,
        verified_license_content_sha256: LICENSE_CONTENT_SHA256,
        verified_license_spdx: "MIT",
        verified_license_source_url: "https://github.com/example/agent-kit/blob/0123456789abcdef0123456789abcdef01234567/packages/runtime-adapter/LICENSE",
        verified_license_scope: "module-local",
        latest_release_tag: "v1.2.3",
        license: { spdx_id: "MIT" },
        topics: ["agent-harness", "evals"],
      }],
    }));

    const researchArgs = [
      "research",
      contractPath,
      "--semantic-mode",
      "skip",
      "--github-mode",
      "online",
      "--github-fixture",
      fixturePath,
      "--github-limit",
      "5",
    ];
    const researchOutput = run(root, researchArgs);
    assert.match(researchOutput, /GitHub repository research: complete/);
    const repeatedResearchOutput = run(root, researchArgs);
    assert.match(repeatedResearchOutput, /agent-research-2\.md/);

    const researchDir = path.join(root, "11_agents", "research");
    const researchFiles = readdirSync(researchDir).filter((name) => /-agent-research(?:-\d+)?\.md$/.test(name));
    assert.equal(researchFiles.length, 2);
    const researchFile = researchFiles.find((name) => name.endsWith("-agent-research-2.md"));
    assert.ok(researchFile);
    const researchPath = path.join(researchDir, researchFile);
    const initialResearch = readFileSync(researchPath, "utf8");
    const initialFrontmatter = parseFrontmatterData(initialResearch);
    const firstResearch = readFileSync(path.join(researchDir, researchFiles.find((name) => name.endsWith("-agent-research.md"))), "utf8");
    assert.notEqual(parseFrontmatterData(firstResearch).id, initialFrontmatter.id);
    assert.match(initialFrontmatter.id, /-agent-research-2$/);
    assert.equal(initialFrontmatter.repository_research_status, "complete");
    assert.match(String(initialFrontmatter.research_content_lock), /^sha256:[a-f0-9]{64}$/);
    const initialDecision = researchGateDecisionForReport(contractData(contractPath, { root }), initialResearch);
    assert.ok(!initialDecision.reasons.includes("research_content_lock_invalid"));
    assert.ok(!initialDecision.reasons.includes("research_content_document_mismatch"));
    assert.ok(Number(initialFrontmatter.repository_candidate_count) >= 1);
    assert.match(initialResearch, /https:\/\/github\.com\/example\/agent-kit/);
    assert.match(initialResearch, /0123456789abcdef0123456789abcdef01234567/);
    assert.match(initialResearch, /Discovery never clones, installs, executes, vendors or registers/);

    const topicIds = Array.isArray(initialFrontmatter.external_research_topics)
      ? initialFrontmatter.external_research_topics
      : [initialFrontmatter.external_research_topics].filter(Boolean);
    assert.ok(topicIds.includes("github-repository-review"));
    const evidencePath = path.join(root, "evidence.json");
    writeFileSync(evidencePath, JSON.stringify(evidenceForTopics(topicIds)));
    const evidenceOutput = run(root, [
      "external-research",
      contractPath,
      "--backend",
      "manual",
      "--input",
      evidencePath,
    ]);
    assert.match(evidenceOutput, /Research gate: failed/);

    const completedResearch = readFileSync(researchPath, "utf8");
    const completedFrontmatter = parseFrontmatterData(completedResearch);
    assert.equal(completedFrontmatter.research_gate_status, "failed");
    assert.equal(completedFrontmatter.external_synthesis_gate_status, "complete");
    assert.match(String(completedFrontmatter.external_research_lock), /^sha256:[a-f0-9]{64}$/);
    assert.match(String(completedFrontmatter.synthesis_lock), /^sha256:[a-f0-9]{64}$/);
    const missingDeclaredPatternTopic = completedResearch.replace(/(external_research_topics:\n)  - [^\n]+\n/, "$1");
    const missingTopicDecision = researchGateDecisionForReport(
      contractData(contractPath, { root }),
      missingDeclaredPatternTopic,
    );
    assert.ok(missingTopicDecision.reasons.includes("external_research_topics_pattern_pack_mismatch"));

    const outputDir = path.join(root, "children", "e2e-repository-agent");
    assert.throws(
      () => run(root, ["scaffold", contractPath, "--output", outputDir]),
      /repository_research_fixture_not_authoritative_for_selected_module/,
    );
    const scaffoldOutput = run(root, [
      "scaffold",
      contractPath,
      "--output",
      outputDir,
      "--allow-pending-external-verification",
    ]);
    assert.match(scaffoldOutput, /Smoke test: pass/);
    assert.equal(existsSync(path.join(outputDir, "sources", "repository-modules.json")), true);
    const manifest = JSON.parse(readFileSync(path.join(outputDir, "sources", "repository-modules.json"), "utf8"));
    assert.equal(manifest.installation_status, "not-installed");
    assert.equal(manifest.immutable_pin, "commit:0123456789abcdef0123456789abcdef01234567");
    assert.equal(manifest.verification_status, "experimental-unverified");
    assert.equal(manifest.experimental_scaffold, true);
    assert.equal(existsSync(path.join(outputDir, ".git")), true);
    assert.equal(execFileSync("git", ["remote"], { cwd: outputDir, encoding: "utf8" }).trim(), "");
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: outputDir, encoding: "utf8" }).trim(), "");
    assert.equal(existsSync(path.join(outputDir, "node_modules")), false);
    assert.equal(readFileSync(path.join(registryDir, "github-agent-building-repos.md"), "utf8"), registryBefore);

    const reportsDir = path.join(root, "11_agents", "reports");
    const scaffoldReport = readFileSync(
      path.join(reportsDir, readdirSync(reportsDir).find((name) => name.endsWith("-scaffold-report.md"))),
      "utf8",
    );
    const scaffoldFrontmatter = parseFrontmatterData(scaffoldReport);
    assert.equal(scaffoldFrontmatter.status, "draft");
    assert.equal(scaffoldFrontmatter.verified, "pending");
    assert.equal(scaffoldFrontmatter.research_gate_status, "failed");
    assert.equal(scaffoldFrontmatter.research_gate_source_status, "failed");
    assert.equal(scaffoldFrontmatter.repository_adoption_status, "pending-review");
    assert.match(scaffoldReport, /repository_research_status: complete/);
    assert.match(String(scaffoldFrontmatter.repository_research_lock), /^sha256:[a-f0-9]{64}$/);
    assert.match(scaffoldReport, /structural checks passed, but production gates are pending or failed/);
    assert.match(scaffoldReport, /## Research and repository gate/);
    assert.match(scaffoldReport, /Exact immutable pin: commit:0123456789abcdef0123456789abcdef01234567/);
    assert.match(scaffoldReport, /github-repository-review evidence: present/);
    assert.match(scaffoldReport, /Installation status: not-installed/);
    assert.match(scaffoldReport, /experimental_scaffold: true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
