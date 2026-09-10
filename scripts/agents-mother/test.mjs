import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { yamlList } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { readBoundedRegularFile } from "../lib/safe-file-read.mjs";
import { slug as makeSlug } from "../lib/slug.mjs";
import { today } from "../lib/date.mjs";
import { writeLifecycleReport } from "./lifecycle-report.mjs";

const ROOT = resolveTechscopeRoot();
const REPORT_DIR = path.join(resolvePrithaAgentMemoryRoot({ root: ROOT }), "reports");

const slug = (value, fallback = "agent") => makeSlug(value, { fallback });

export function fileExists(projectRoot, relPath) {
  return existsSync(path.join(projectRoot, relPath));
}

export function readJsonIfExists(projectRoot, relPath) {
  const canonicalRoot = path.resolve(projectRoot);
  const fullPath = path.resolve(canonicalRoot, String(relPath || ""));
  if (fullPath !== canonicalRoot && !fullPath.startsWith(`${canonicalRoot}${path.sep}`)) return null;
  try {
    return JSON.parse(readBoundedRegularFile(fullPath, {
      maxBytes: 1_000_000,
      allowedRoots: [canonicalRoot],
    }).text);
  } catch {
    return null;
  }
}

export function readProjectText(projectRoot, relPath, maxChars = 1400) {
  const canonicalRoot = path.resolve(projectRoot);
  const fullPath = path.resolve(canonicalRoot, String(relPath || ""));
  if (fullPath !== canonicalRoot && !fullPath.startsWith(`${canonicalRoot}${path.sep}`)) return "";
  try {
    return readBoundedRegularFile(fullPath, {
      maxBytes: 256_000,
      allowedRoots: [canonicalRoot],
    }).text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  } catch {
    return "";
  }
}

export function projectAgentData(projectRoot, taskDescription) {
  const projectName = path.basename(projectRoot);
  const relPath = path.relative(ROOT, projectRoot);
  const readme = readProjectText(projectRoot, "README.md");
  const agents = readProjectText(projectRoot, "AGENTS.md");
  const packageJson = readJsonIfExists(projectRoot, "package.json") || {};
  const interfaces = readJsonIfExists(projectRoot, "interfaces/manifest.json") || {};
  const memory = readJsonIfExists(projectRoot, "memory/manifest.json") || {};
  const tools = readJsonIfExists(projectRoot, "tools/manifest.json") || {};
  const operations = readJsonIfExists(projectRoot, "operations/manifest.json") || {};
  const adapters = Array.isArray(interfaces.adapters)
    ? interfaces.adapters.map((item) => item?.name || item?.id || item).filter(Boolean).join(", ")
    : "";
  return {
    agentName: projectName,
    relPath,
    projectPath: relPath,
    text: `${readme}\n${agents}\n${taskDescription}`,
    primaryMission: readme.match(/#\s+([^#]+)/)?.[1]?.trim() || taskDescription,
    targetUser: "existing agent operator",
    runtimeFamily: "codex-native",
    runtimePlacementProfile: "hybrid",
    primaryInterface: adapters || interfaces.primary || "Codex project",
    secondaryInterfaces: adapters,
    telegramMode: adapters.toLowerCase().includes("telegram") ? "operator-control" : "none",
    expectedHosting: operations.deployment_target || "existing local project",
    deploymentTarget: operations.deployment_target || "existing local project",
    deploymentProfile: operations.deployment_profile || "existing",
    serviceMode: operations.service_mode || "none",
    autostart: operations.autostart || "disabled",
    proactiveMode: operations.proactivity?.mode || operations.proactive_mode || "none",
    memoryModel: memory.profile || memory.description || "existing project memory",
    indexingSearchNeeds: memory.indexing || memory.search || "",
    toolSystem: tools.description || "existing project tools",
    inputDataTypes: "existing project inputs plus operator task",
    dependencies: packageJson.dependencies ? Object.keys(packageJson.dependencies).slice(0, 12).join(", ") : "none",
    coreFunctions: [taskDescription],
    criticalWorkflows: [taskDescription],
    taskDescription,
    developmentTaskType: "improve",
  };
}

export function runProjectCommand(projectRoot, command, args) {
  try {
    const out = execFileSync(command, args, { killSignal: "SIGKILL",
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    }).trim();
    return { result: "pass", output: out || "ok" };
  } catch (error) {
    const outputText = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    return { result: "fail", output: outputText || "command failed" };
  }
}

export function packageScripts(projectRoot) {
  const pkg = readJsonIfExists(projectRoot, "package.json");
  return pkg && pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
}

export function detectProject(projectRoot) {
  const signals = [];
  const manifests = {
    interfaces: readJsonIfExists(projectRoot, "interfaces/manifest.json"),
    memory: readJsonIfExists(projectRoot, "memory/manifest.json"),
    tools: readJsonIfExists(projectRoot, "tools/manifest.json"),
    operations: readJsonIfExists(projectRoot, "operations/manifest.json"),
  };

  const checks = [
    ["AGENTS.md", "Codex instructions"],
    ["CLAUDE.md", "Claude Code instructions"],
    ["GEMINI.md", "Gemini instructions"],
    [".cursor/rules", "Cursor rules"],
    [".github/copilot-instructions.md", "Copilot instructions"],
    ["interfaces/manifest.json", "Interface manifest"],
    ["memory/manifest.json", "Memory manifest"],
    ["tools/manifest.json", "Tools manifest"],
    ["operations/manifest.json", "Operations manifest"],
    ["scripts/smoke-test.mjs", "Smoke test"],
    ["scripts/operations-status.mjs", "Operations status"],
    ["scripts/deploy-service.mjs", "Deployment automation"],
    ["scripts/telegram-bot.mjs", "Telegram adapter"],
  ];

  for (const [relPath, label] of checks) {
    if (fileExists(projectRoot, relPath)) signals.push(`${label}: ${relPath}`);
  }

  let classification = "project-without-agent-harness";
  const generatedByValues = [
    manifests.interfaces?.generated_by,
    manifests.memory?.generated_by,
    manifests.tools?.generated_by,
    manifests.operations?.generated_by,
  ].filter(Boolean).map((value) => String(value).trim());
  const generatedBy = generatedByValues.join(" ");

  if (generatedByValues.some((value) => /^(Pritha|TechScope Agents Mother)$/i.test(value))) {
    classification = "techscope-generated-agent";
  } else if (fileExists(projectRoot, "AGENTS.md") || fileExists(projectRoot, "CLAUDE.md") || fileExists(projectRoot, "GEMINI.md")) {
    classification = "agent-project";
  } else if (signals.length > 0) {
    classification = "project-with-agent-signals";
  }

  return { classification, signals, manifests, scripts: packageScripts(projectRoot) };
}

export function checkResult(name, result, notes) {
  return { name, result, notes: String(notes || "") };
}

export function testProject(projectPath, options = {}) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }

  const detection = detectProject(projectRoot);
  const checks = [];

  checks.push(checkResult(
    "Structure",
    fileExists(projectRoot, "README.md") || fileExists(projectRoot, "package.json") ? "pass" : "warning",
    "README.md or package.json should exist for a maintainable project.",
  ));
  checks.push(checkResult(
    "Agent instructions",
    fileExists(projectRoot, "AGENTS.md") || fileExists(projectRoot, "CLAUDE.md") || fileExists(projectRoot, "GEMINI.md") ? "pass" : "missing",
    "Expected AGENTS.md, CLAUDE.md, GEMINI.md or another explicit agent instruction surface.",
  ));
  checks.push(checkResult(
    "Interface manifest",
    fileExists(projectRoot, "interfaces/manifest.json") ? "pass" : "missing",
    "Pritha-generated agents should document selected interface adapters.",
  ));
  checks.push(checkResult(
    "Memory manifest",
    fileExists(projectRoot, "memory/manifest.json") ? "pass" : "missing",
    "Pritha-generated agents should document memory profile and source of truth.",
  ));
  checks.push(checkResult(
    "Tool manifest",
    fileExists(projectRoot, "tools/manifest.json") ? "pass" : "missing",
    "Pritha-generated agents should document tool boundaries.",
  ));
  checks.push(checkResult(
    "Operations manifest",
    fileExists(projectRoot, "operations/manifest.json") ? "pass" : "missing",
    "Pritha-generated agents should document service mode, autostart policy, healthcheck and logs.",
  ));
  checks.push(checkResult(
    "Env example",
    fileExists(projectRoot, ".env.example") ? "pass" : "warning",
    ".env.example should document required secrets without storing values.",
  ));

  if (fileExists(projectRoot, ".env")) {
    checks.push(checkResult("Env secrets", "warning", ".env exists. Do not copy secrets into Pritha reports or generated files."));
  } else {
    checks.push(checkResult("Env secrets", "pass", "No .env file detected."));
  }

  let smoke = { result: "not-applicable", output: "No smoke test found." };
  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) {
    smoke = runProjectCommand(projectRoot, "node", ["scripts/smoke-test.mjs"]);
  } else if (detection.scripts.smoke) {
    smoke = runProjectCommand(projectRoot, "npm", ["run", "smoke", "--silent"]);
  }
  checks.push(checkResult("Smoke test", smoke.result, smoke.output));

  if (fileExists(projectRoot, "scripts/interface-status.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/interface-status.mjs"]);
    checks.push(checkResult("Interface status", result.result, result.output));
  } else {
    checks.push(checkResult("Interface status", "not-applicable", "No interface-status command found."));
  }

  if (fileExists(projectRoot, "scripts/memory-status.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/memory-status.mjs"]);
    checks.push(checkResult("Memory status", result.result, result.output));
  } else {
    checks.push(checkResult("Memory status", "not-applicable", "No memory-status command found."));
  }

  if (fileExists(projectRoot, "scripts/tools-status.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/tools-status.mjs"]);
    checks.push(checkResult("Tools status", result.result, result.output));
  } else {
    checks.push(checkResult("Tools status", "not-applicable", "No tools-status command found."));
  }

  if (fileExists(projectRoot, "scripts/operations-status.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/operations-status.mjs"]);
    checks.push(checkResult("Operations status", result.result, result.output));
  } else {
    checks.push(checkResult("Operations status", "not-applicable", "No operations-status command found."));
  }

  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/deploy-service.mjs", "plan"]);
    checks.push(checkResult("Deployment plan", result.result, result.output));
  } else {
    checks.push(checkResult("Deployment plan", "not-applicable", "No deploy-service command found."));
  }

  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) {
    const queueStatus = runProjectCommand(projectRoot, "node", ["scripts/telegram-bot.mjs", "queue-status"]);
    checks.push(checkResult("Telegram queue status", queueStatus.result, queueStatus.output));
    const dryRun = runProjectCommand(projectRoot, "node", ["scripts/telegram-bot.mjs", "poll-once", "--dry-run"]);
    checks.push(checkResult("Telegram dry-run", dryRun.result, dryRun.output));
  } else {
    checks.push(checkResult("Telegram dry-run", "not-applicable", "Telegram adapter not detected."));
  }

  const failed = checks.filter((item) => item.result === "fail").length;
  const missing = checks.filter((item) => item.result === "missing").length;
  const warnings = checks.filter((item) => item.result === "warning").length;
  const status = failed > 0 ? "failed" : missing > 0 || warnings > 0 ? "partial" : "complete";
  const projectName = path.basename(projectRoot);
  let reportPath = null;
  if (!options["no-report"]) {
    reportPath = writeLifecycleReport(
      path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-test-report.md`),
      ({ artifactId }) => agentTestReportMarkdown(projectRoot, projectName, detection, checks, status, artifactId),
      { projectRoot, stateRoot: process.env.PRITHA_STATE_ROOT, root: ROOT },
    ).path;
  }

  console.log(`Project: ${projectRoot}`);
  console.log(`Classification: ${detection.classification}`);
  console.log(`Result: ${status}`);
  if (reportPath) {
    console.log(`Report: ${path.relative(ROOT, reportPath)}`);
  } else {
    console.log("Report: skipped (--no-report)");
  }
  if (failed > 0) process.exitCode = 1;
}

export function recommendationForProject(detection, checks) {
  const items = [];
  const hasAgentInstructions = checks.find((item) => item.name === "Agent instructions")?.result === "pass";
  const hasInterfaceManifest = checks.find((item) => item.name === "Interface manifest")?.result === "pass";
  const hasMemoryManifest = checks.find((item) => item.name === "Memory manifest")?.result === "pass";
  const hasToolManifest = checks.find((item) => item.name === "Tool manifest")?.result === "pass";
  const hasOperationsManifest = checks.find((item) => item.name === "Operations manifest")?.result === "pass";
  const hasSmoke = checks.find((item) => item.name === "Smoke test")?.result === "pass";

  if (detection.classification === "project-without-agent-harness") {
    items.push("No agent harness detected. Discuss with the user whether to add a Codex-native agent layer, and create an agent-contract before modifying the project.");
  }
  if (!hasAgentInstructions) items.push("Add an explicit instruction surface such as AGENTS.md before treating this as an agent project.");
  if (!hasInterfaceManifest) items.push("Add interfaces/manifest.json when the user chooses CLI, Telegram, web, API or another interface.");
  if (!hasMemoryManifest) items.push("Add memory/manifest.json to document whether the project uses minimal Markdown, Markdown-first, SQLite, embeddings or external memory.");
  if (!hasToolManifest) items.push("Add tools/manifest.json to document tool boundaries before exposing more capabilities.");
  if (!hasOperationsManifest) items.push("Add operations/manifest.json before treating the project as a service or enabling any autostart path.");
  if (!hasSmoke) items.push("Add or fix a smoke test so future improvements are quickly checkable.");
  if (items.length === 0) items.push("Project has the basic Pritha agent harness. Discuss feature improvements, evals and operations next.");
  return items;
}

function agentTestReportMarkdown(projectRoot, projectName, detection, checks, status, artifactId) {
  const date = today();
  const signals = detection.signals.length > 0 ? detection.signals : ["No explicit agent signals detected."];
  const tools = ["Codex", "AGENTS.md"];
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) tools.push("Telegram");
  if (fileExists(projectRoot, "operations/manifest.json")) tools.push("operations");
  return `---
id: ${artifactId || `${date}-${slug(projectName)}-agent-test-report`}
type: agent-test-report
status: ${status}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-testing
  - observability
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
  - interfaces/manifest.json
  - memory/manifest.json
  - tools/manifest.json
  - operations/manifest.json
portability: codex-native
sources:
  - ${projectRoot}
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts: []
  scaffold_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: project inspection ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Test Report: ${projectName}

Date: ${date}
Status: ${status}

## Summary

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Agent detected: ${detection.classification !== "project-without-agent-harness" ? "yes" : "no"}
- Generated by Pritha: ${detection.classification === "techscope-generated-agent" ? "yes" : "no"}
- Result: ${status}

## Detection

${signals.map((item) => `- ${item}`).join("\n")}

## Checks

| Check | Result | Notes |
| --- | --- | --- |
${checks.map((item) => `| ${item.name} | ${item.result} | ${item.notes.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 260)} |`).join("\n")}

## Recommendations

${recommendationForProject(detection, checks).map((item) => `- ${item}`).join("\n")}

## Next discussion

- If no agent harness exists, ask the user what kind of agent should be added and create an agent-contract.
- If a harness exists, discuss which layer to improve next: interface, memory, tools, evals, operations or user handoff.
`;
}
