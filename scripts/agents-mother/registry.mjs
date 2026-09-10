import { existsSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData, yamlList } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { slug as makeSlug } from "../lib/slug.mjs";
import { today } from "../lib/date.mjs";
import { bodyValue } from "./contract.mjs";
import { detectProject, fileExists } from "./test.mjs";
import { writeLifecycleReport } from "./lifecycle-report.mjs";
import { readAgentCatalog, findCatalogAgent, readIdentityEvidence } from "./identity.mjs";

const ROOT = resolveTechscopeRoot();
const AGENT_MEMORY_ROOT = resolvePrithaAgentMemoryRoot({ root: ROOT });
const CONTRACT_DIR = path.join(AGENT_MEMORY_ROOT, "contracts");
const REPORT_DIR = path.join(AGENT_MEMORY_ROOT, "reports");
const RESEARCH_DIR = path.join(AGENT_MEMORY_ROOT, "research");
const REGISTRY_PATH = path.join(AGENT_MEMORY_ROOT, "registry.md");
const slug = (value, fallback = "agent") => makeSlug(value, { fallback });
const readFrontmatter = (text) => parseFrontmatterData(text) || {};

function ensureDirs() {
  mkdirSync(CONTRACT_DIR, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(RESEARCH_DIR, { recursive: true });
}

function scalar(value, fallback = "TBD") {
  const text = String(value || "").trim();
  return text || fallback;
}
export function listContracts() {
  ensureDirs();
  const files = listMarkdownFilesFlat(CONTRACT_DIR)
    .filter((file) => readFrontmatter(readIdentityEvidence(file, AGENT_MEMORY_ROOT)).type === "agent-contract")
    .sort();
  if (files.length === 0) {
    console.log("No agent contracts yet.");
    return;
  }
  for (const file of files) {
    const text = readIdentityEvidence(file, AGENT_MEMORY_ROOT);
    const fm = readFrontmatter(text);
    const name = bodyValue(text, "Agent name") || path.basename(file, ".md");
    console.log(`${fm.status || "unknown"}\t${path.relative(ROOT, file)}\t${name}`);
  }
}

function listMarkdownFilesFlat(dir) {
  if (!existsSync(dir) || lstatSync(dir).isSymbolicLink() || !lstatSync(AGENT_MEMORY_ROOT).isDirectory() || lstatSync(AGENT_MEMORY_ROOT).isSymbolicLink()) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(dir, entry))
    .filter((file) => lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink())
    .sort();
}

function fileBody(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---\n", 4);
  return end === -1 ? text : text.slice(end + 5);
}

function markdownTitle(text, fallback) {
  return fileBody(text).match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function contractSummaryFromFile(file) {
  const text = readIdentityEvidence(file, AGENT_MEMORY_ROOT);
  const fm = readFrontmatter(text);
  const name = (bodyValue(text, "Agent name") || markdownTitle(text, path.basename(file, ".md"))).replace(/[.;]+$/, "");
  const subjectId = typeof fm.subject === "object" && fm.subject ? String(fm.subject.id || "").trim() : "";
  const technicalSlug = bodyValue(text, "Technical slug");
  return {
    kind: "contract",
    path: path.relative(ROOT, file),
    id: fm.id || path.basename(file, ".md"),
    status: fm.status || "unknown",
    slug: slug(subjectId || technicalSlug || name),
    aliases: [...new Set([name, technicalSlug, subjectId].filter(Boolean).map((value) => slug(value)))],
    name,
    mission: bodyValue(text, "Primary mission") || "unknown",
    runtime: bodyValue(text, "Runtime family") || "unknown",
    interface: bodyValue(text, "Primary interface") || "unknown",
    telegram: bodyValue(text, "Telegram mode") || "unknown",
    deploymentTarget: bodyValue(text, "Deployment target") || bodyValue(text, "Expected hosting") || "unknown",
    proactiveMode: bodyValue(text, "Proactive mode") || "unknown",
    created: fm.created || "unknown",
  };
}

function outcomeSummaryFromFile(file) {
  const text = readIdentityEvidence(file, AGENT_MEMORY_ROOT);
  const fm = readFrontmatter(text);
  const agentSlug = scalar(fm.agent_slug, slug(markdownTitle(text, path.basename(file, ".md")).replace(/^Agent Outcome Spec:\s*/i, "")));
  return {
    kind: "outcome",
    path: path.relative(ROOT, file),
    id: fm.id || path.basename(file, ".md"),
    status: fm.outcome_spec_status || fm.status || "unknown",
    slug: slug(agentSlug),
    contractPath: String(fm.contract_path || "").trim(),
    created: fm.created || "unknown",
    approvedBy: fm.approved_by || "pending",
  };
}

function reportSummaryFromFile(file) {
  const text = readIdentityEvidence(file, AGENT_MEMORY_ROOT);
  const fm = readFrontmatter(text);
  const title = markdownTitle(text, path.basename(file, ".md"));
  const relPath = path.relative(ROOT, file);
  const projectPath = bodyValue(text, "Project path") || bodyValue(text, "Target folder") || "";
  const agentName = bodyValue(text, "Agent name");
  const nameFromTitle = title.replace(/^Agent\s+(Scaffold|Test|Handoff|Operations|Deployment|Delivery)\s+Report:\s*/i, "").trim();
  const name = agentName || nameFromTitle || path.basename(file, ".md");
  return {
    kind: "report",
    path: relPath,
    id: fm.id || path.basename(file, ".md"),
    type: fm.type || "unknown",
    status: fm.status || "unknown",
    subjectKind: typeof fm.subject === "object" && fm.subject ? fm.subject.kind || "" : "",
    subjectId: typeof fm.subject === "object" && fm.subject ? String(fm.subject.id || "").trim() : "",
    agentName,
    slug: slug(name || projectPath || relPath),
    name,
    projectPath,
    created: fm.created || "unknown",
    result: bodyValue(text, "Result") || fm.status || "unknown",
  };
}

function collectAgentLifecycle() {
  const catalog = readAgentCatalog({ root: ROOT, fresh: true });
  const contracts = listMarkdownFilesFlat(CONTRACT_DIR)
    .filter((file) => readFrontmatter(readIdentityEvidence(file, AGENT_MEMORY_ROOT)).type === "agent-contract").map(contractSummaryFromFile);
  const outcomes = listMarkdownFilesFlat(CONTRACT_DIR)
    .filter((file) => readFrontmatter(readIdentityEvidence(file, AGENT_MEMORY_ROOT)).type === "agent-outcome-spec").map(outcomeSummaryFromFile);
  const reports = listMarkdownFilesFlat(REPORT_DIR).map(reportSummaryFromFile);
  const research = listMarkdownFilesFlat(RESEARCH_DIR).map((file) => ({ path: path.relative(ROOT, file) }));
  const match = (items, agent) => items.filter((item) => agent.artifacts.some((artifact) => artifact.path === path.resolve(ROOT, item.path)));
  const agents = catalog.agents.filter((agent) => agent.artifacts.length).map((agent) => ({
    ...agent, slug: agent.agentId || agent.id, telegram: "contract-defined",
    deploymentTarget: agent.deployment, proactiveMode: agent.proactivity,
    contracts: match(contracts, agent), outcomes: match(outcomes, agent), reports: match(reports, agent),
  }));
  return { agents, contracts, outcomes, reports, research, diagnostics: catalog.diagnostics };
}

function reportTypeCount(reports, type) {
  return reports.filter((report) => report.type === type).length;
}

function registryMarkdown(lifecycle) {
  const date = today();
  const sources = [
    path.relative(ROOT, CONTRACT_DIR),
    path.relative(ROOT, RESEARCH_DIR),
    path.relative(ROOT, REPORT_DIR),
    "07_workflows/agents-mother.md",
    "07_workflows/agents-mother-roadmap.md",
  ];
  return `---
id: agents-mother-registry
type: agent-registry
identity_schema_version: 1
status: active
created: 2026-05-18
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - registry
tools:
  - Codex
  - AGENTS.md
  - Pritha
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - scripts
portability: codex-native
sources:
${sources.map((source) => `  - ${source}`).join("\n")}
related:
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  agent_contracts: []
  outcome_specs: []
  scaffold_reports: []
  agent_delivery_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  agent_operations_reports: []
  agent_deployment_reports: []
  agent_post_creation_reviews: []
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: ${date}
source_version: generated registry ${date}
retrieved: ${date}
verified: ${date}
valid_for: current Pritha lifecycle
temporal_status: current
---

# Pritha Registry

Date: ${date}
Status: active

## Summary

- Agents tracked: ${lifecycle.agents.length}
- Contracts: ${lifecycle.contracts.length}
- Outcome specs: ${lifecycle.outcomes.length}
- Reports: ${lifecycle.reports.length}
- Research reports: ${lifecycle.research.length}

## Agents

| Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
${lifecycle.agents.map((agent) => {
  const evidence = [
    `contracts:${agent.contracts.length}`,
    `outcome:${agent.outcomes.length}`,
    `scaffold:${reportTypeCount(agent.reports, "scaffold-report")}`,
    `delivery:${reportTypeCount(agent.reports, "agent-delivery-report")}`,
    `test:${reportTypeCount(agent.reports, "agent-test-report")}`,
    `handoff:${reportTypeCount(agent.reports, "agent-handoff-report")}`,
    `ops:${reportTypeCount(agent.reports, "agent-operations-report")}`,
    `deploy:${reportTypeCount(agent.reports, "agent-deployment-report")}`,
    `evolve:${reportTypeCount(agent.reports, "agent-post-creation-review")}`,
  ].join(" ");
  return `| ${agent.name.replace(/\|/g, "/")} | ${agent.mission.replace(/\|/g, "/").slice(0, 120)} | ${agent.runtime} | ${agent.interface} / Telegram ${agent.telegram} | ${agent.deploymentTarget} | ${agent.proactiveMode} | ${evidence} |`;
}).join("\n")}

## Agent Identities

| Agent ID | Instance key | Attribution | Status |
| --- | --- | --- | --- |
${lifecycle.agents.map((agent) => `| ${agent.agentId || agent.id} | ${agent.instanceKey} | ${agent.source} | ${agent.identityStatus} |`).join("\n")}

## Identity Diagnostics

${lifecycle.agents.filter((agent) => agent.diagnostics.length).map((agent) => `- ${agent.id}: ${agent.diagnostics.join(", ")}`).join("\n") || "- No agent identity diagnostics."}
${lifecycle.diagnostics.map((diagnostic) => `- ${diagnostic.code}: ${path.relative(ROOT, diagnostic.path || AGENT_MEMORY_ROOT)}`).join("\n")}

## Recent Reports

${lifecycle.reports.slice(-30).reverse().map((report) => `- ${report.created} ${report.type}/${report.status}: ${report.path}`).join("\n") || "- No reports yet."}

## Evolution Rules

- Registry is generated from contracts and reports; do not use it as the sole source for standards.
- Promote a pattern to \`04_standards/\` only after a post-creation review shows repeated successful evidence.
- Failed or superseded patterns remain visible in reports and reviews.
`;
}

export function rebuildRegistry() {
  ensureDirs();
  const lifecycle = collectAgentLifecycle();
  writeFileSync(REGISTRY_PATH, registryMarkdown(lifecycle));
  console.log(`Registry: ${path.relative(ROOT, REGISTRY_PATH)}`);
  console.log(`Agents tracked: ${lifecycle.agents.length}`);
  console.log(`Reports indexed: ${lifecycle.reports.length}`);
}

function relatedReportsForProject(projectRoot, projectName) {
  const catalog = readAgentCatalog({ root: ROOT, fresh: true });
  const matches = catalog.agents.filter((agent) => agent.projectPath === path.resolve(projectRoot));
  const agent = matches.length === 1 ? matches[0] : findCatalogAgent(catalog, projectName);
  if (!agent || agent.identityStatus === "conflict" || (agent.projectPath && agent.projectPath !== path.resolve(projectRoot))) return [];
  return agent.artifacts.filter((artifact) => artifact.type.endsWith("report"))
    .map((artifact) => reportSummaryFromFile(artifact.path)).sort((a, b) => a.path.localeCompare(b.path));
}

function inferLessonsFromProject(projectRoot, detection, reports) {
  const useful = [];
  const failed = [];
  const standards = [];
  const outdated = [];

  if (fileExists(projectRoot, "interfaces/manifest.json")) useful.push("Interface choices are explicit and inspectable through `interfaces/manifest.json`.");
  if (fileExists(projectRoot, "memory/manifest.json")) useful.push("Memory profile is separated from agent instructions and can evolve without rewriting `AGENTS.md`.");
  if (fileExists(projectRoot, "tools/manifest.json")) useful.push("Tool boundaries are documented before adding external capabilities.");
  if (fileExists(projectRoot, "operations/manifest.json")) useful.push("Deployment, proactivity and service behavior are represented as an operations manifest.");
  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) useful.push("Smoke test gives a cheap acceptance gate for scaffold changes.");
  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) useful.push("Deployment automation is separated from scaffold and mutation requires explicit confirmation.");

  if (detection.classification === "project-without-agent-harness") failed.push("Project still lacks an agent harness; create an agent-contract before applying Pritha patterns.");
  if (!fileExists(projectRoot, "scripts/smoke-test.mjs")) failed.push("No smoke test found, so readiness claims are weak.");
  if (!fileExists(projectRoot, "operations/manifest.json")) failed.push("No operations manifest found, so deployment and proactivity are not governed.");
  if (reports.length === 0) failed.push("No lifecycle reports found for this project yet.");

  if (useful.length >= 3 && reports.some((report) => report.type === "agent-test-report" && report.status === "complete")) {
    standards.push("Consider promoting generated manifest triad plus smoke test as a reusable minimum scaffold pattern after one more successful agent.");
  }
  if (reports.some((report) => report.type === "agent-deployment-report" && report.status === "complete")) {
    standards.push("Consider promoting explicit deploy plan/status/install/uninstall gates as a service-agent deployment standard after repeated use.");
  }

  if (reports.some((report) => report.status === "failed")) outdated.push("Some lifecycle reports failed; do not promote patterns until failures are reviewed.");
  if (outdated.length === 0) outdated.push("No outdated scaffold pattern identified from current evidence.");

  return { useful, failed, standards, outdated };
}

export function evolveProject(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }
  const projectName = path.basename(projectRoot);
  const detection = detectProject(projectRoot);
  const reports = relatedReportsForProject(projectRoot, projectName);
  const lessons = inferLessonsFromProject(projectRoot, detection, reports);
  const identity = findCatalogAgent(readAgentCatalog({ root: ROOT, stateRoot: process.env.PRITHA_STATE_ROOT, fresh: true }), projectRoot);
  const authoredIdentity = identity?.agentId && identity.identityStatus !== "conflict" ? identity : null;
  const reportPath = writeLifecycleReport(
    path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-post-creation-review.md`),
    ({ artifactId }) => agentPostCreationReviewMarkdown(projectRoot, projectName, detection, reports, lessons, { ...options, artifactId, identity: authoredIdentity }),
    { projectRoot, stateRoot: process.env.PRITHA_STATE_ROOT, root: ROOT, ...(authoredIdentity ? { instanceKey: authoredIdentity.instanceKey } : {}) },
  ).path;
  rebuildRegistry();
  console.log(`Post-creation review: ${path.relative(ROOT, reportPath)}`);
}

function agentPostCreationReviewMarkdown(projectRoot, projectName, detection, reports, lessons, options = {}) {
  const date = today();
  const tools = ["Codex", "AGENTS.md", "Pritha"];
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) tools.push("Telegram");
  if (fileExists(projectRoot, "operations/manifest.json")) tools.push("operations");
  return `---
id: ${options.artifactId || `${date}-${slug(projectName)}-agent-post-creation-review`}
type: agent-post-creation-review
${options.identity ? `agent_id: ${options.identity.agentId}\ninstance_key: ${options.identity.instanceKey}\ncontract_path: ${path.relative(ROOT, options.identity.contractSource)}\nproject_path: ${path.relative(ROOT, projectRoot)}\n` : ""}status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - lessons-learned
  - ${slug(projectName)}
tools:${yamlList(tools)}
agent_platforms:
  - Codex
model_context:
  - unknown
runtime_environment:
  - local-project
config_surfaces:
  - AGENTS.md
  - scripts
portability: codex-native
sources:
  - ${projectRoot}
${reports.map((report) => `  - ${report.path}`).join("\n")}
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  agent_operations_reports: []
  agent_deployment_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: post-creation review ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Post-Creation Review: ${projectName}

Date: ${date}
Status: draft

## Summary

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Related lifecycle reports: ${reports.length}
- User notes: ${scalar(options.notes, "none")}

## Evidence

${reports.length > 0 ? reports.map((report) => `- ${report.type}/${report.status}: ${report.path}`).join("\n") : "- No lifecycle reports found yet."}

## Useful Scaffold Patterns

${lessons.useful.map((item) => `- ${item}`).join("\n") || "- No reusable pattern identified yet."}

## Failed Assumptions

${lessons.failed.map((item) => `- ${item}`).join("\n") || "- No failed assumptions identified yet."}

## Reusable Standard Candidates

${lessons.standards.map((item) => `- ${item}`).join("\n") || "- No standard candidate yet. Keep gathering evidence."}

## Outdated Or Risky Patterns

${lessons.outdated.map((item) => `- ${item}`).join("\n")}

## Promotion Path

- Do not update \`04_standards/\` from a single successful run.
- Require at least two comparable agents or one production deployment with clean test, handoff, operations and deployment evidence.
- If a pattern is promoted, create or update a standard and link this review as evidence.

## Next Steps

- Discuss this review with the user before promoting any pattern.
- Run \`node scripts/agents-mother.mjs registry\` after future lifecycle reports.
`;
}
