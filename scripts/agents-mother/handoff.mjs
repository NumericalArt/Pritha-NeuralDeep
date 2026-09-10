import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { yamlList } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { slug as makeSlug } from "../lib/slug.mjs";
import { today } from "../lib/date.mjs";
import { checkResult, detectProject, fileExists, recommendationForProject } from "./test.mjs";
import { writeLifecycleReport } from "./lifecycle-report.mjs";
import { readAgentTestResult, runAgentCommandProbe } from "./command-probe.mjs";
import { prepareAuthoredHandoff } from "./authored-handoff.mjs";

const ROOT = resolveTechscopeRoot();
const REPORT_DIR = path.join(resolvePrithaAgentMemoryRoot({ root: ROOT }), "reports");
const slug = (value, fallback = "agent") => makeSlug(value, { fallback });

function ensureDirs() {
  mkdirSync(REPORT_DIR, { recursive: true });
}

function scalar(value, fallback = "TBD") {
  const text = String(value || "").trim();
  return text || fallback;
}
export async function handoffProject(projectPath, options = {}) {
  if (options["run-tests"]) {
    const input = { ...options, root: ROOT, purpose: "test", timeoutMs: options["timeout-ms"], approvedBy: options["approved-by"], planLock: options["plan-lock"] };
    const prior = readAgentTestResult(path.resolve(ROOT, projectPath), input);
    if (prior.planLock !== input.planLock || !prior.at) {
      try { await runAgentCommandProbe(path.resolve(ROOT, projectPath), input); }
      catch { console.warn("Child test warning: the reviewed command could not run; handoff continues without verification credit."); }
    }
  }
  const authored = prepareAuthoredHandoff(path.resolve(ROOT, projectPath), { ...options, root: ROOT });
  if (authored) {
    console.log(`Handoff: ${authored.status}\nProfile: ${authored.profilePath}\nReport: ${authored.reportPath}\nUnchanged: ${authored.unchanged}`);
    return authored;
  }
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }

  const detection = detectProject(projectRoot);
  const checks = [checkResult("npm test", readAgentTestResult(projectRoot, { ...options, root: ROOT }).status, "Child engineering tests are separate from Outcome verification.")];
  const scripts = detection.scripts;

  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) {
    checks.push(checkResult("Smoke test", "available", "node scripts/smoke-test.mjs"));
  } else if (scripts.smoke) {
    checks.push(checkResult("Smoke test", "available", "npm run smoke"));
  } else {
    checks.push(checkResult("Smoke test", "missing", "No smoke test command detected."));
  }

  if (fileExists(projectRoot, "scripts/interface-status.mjs")) {
    checks.push(checkResult("Interface status", "available", "node scripts/interface-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/memory-status.mjs")) {
    checks.push(checkResult("Memory status", "available", "node scripts/memory-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/tools-status.mjs")) {
    checks.push(checkResult("Tools status", "available", "node scripts/tools-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/operations-status.mjs")) {
    checks.push(checkResult("Operations status", "available", "node scripts/operations-status.mjs"));
  }
  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) {
    checks.push(checkResult("Deployment plan", "available", "node scripts/deploy-service.mjs plan"));
  }
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) {
    checks.push(checkResult("Telegram queue", "available", "node scripts/telegram-bot.mjs queue-status"));
  }

  const projectName = path.basename(projectRoot);
  const status = "partial";
  const reportPath = writeLifecycleReport(
    path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-handoff-report.md`),
    ({ artifactId }) => agentHandoffReportMarkdown(projectRoot, projectName, detection, checks, status, artifactId),
    { projectRoot, stateRoot: process.env.PRITHA_STATE_ROOT, root: ROOT },
  ).path;

  console.log(`Project: ${projectRoot}`);
  console.log(`Classification: ${detection.classification}`);
  console.log(`Handoff: ${status}`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
}

function commandListForHandoff(projectRoot, detection) {
  const commands = [];
  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) commands.push("node scripts/smoke-test.mjs");
  if (fileExists(projectRoot, "scripts/agent-cli.mjs")) commands.push("node scripts/agent-cli.mjs status");
  if (fileExists(projectRoot, "scripts/interface-status.mjs")) commands.push("node scripts/interface-status.mjs");
  if (fileExists(projectRoot, "scripts/memory-status.mjs")) commands.push("node scripts/memory-status.mjs");
  if (fileExists(projectRoot, "scripts/tools-status.mjs")) commands.push("node scripts/tools-status.mjs");
  if (fileExists(projectRoot, "scripts/operations-status.mjs")) commands.push("node scripts/operations-status.mjs");
  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) commands.push("node scripts/deploy-service.mjs plan");
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) {
    commands.push("node scripts/telegram-bot.mjs queue-status");
    commands.push("node scripts/telegram-bot.mjs poll-once --dry-run");
  }
  if (commands.length === 0 && fileExists(projectRoot, "package.json")) commands.push("npm test");
  return commands;
}

function envNeedsForHandoff(projectRoot) {
  const needs = [];
  if (fileExists(projectRoot, ".env.example")) {
    const text = readFileSync(path.join(projectRoot, ".env.example"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (match) needs.push(match[1]);
    }
  }
  return [...new Set(needs)];
}

function firstExerciseForHandoff(projectRoot, detection) {
  if (fileExists(projectRoot, "docs/user-training-guide.md")) {
    return [
      "Open docs/user-training-guide.md.",
      "Run the Quick Start commands below.",
      "Ask the agent to explain its mission and v1 scope.",
      "Confirm the response against README.md and AGENTS.md.",
    ];
  }
  if (detection.classification === "project-without-agent-harness") {
    return [
      "Discuss what kind of agent should be added to this project.",
      "Create an agent-contract before modifying the project.",
      "Run agents-mother test again after adding a harness.",
    ];
  }
  return [
    "Read the project's agent instruction file.",
    "Run the available smoke/status command.",
    "Ask what the agent can safely do today and what is out of scope.",
  ];
}

function agentHandoffReportMarkdown(projectRoot, projectName, detection, checks, status, artifactId) {
  const date = today();
  const commands = commandListForHandoff(projectRoot, detection);
  const envNeeds = envNeedsForHandoff(projectRoot);
  const exercise = firstExerciseForHandoff(projectRoot, detection);
  const tools = ["Codex", "AGENTS.md"];
  if (fileExists(projectRoot, "scripts/telegram-bot.mjs")) tools.push("Telegram");
  if (fileExists(projectRoot, "operations/manifest.json")) tools.push("operations");
  return `---
id: ${artifactId || `${date}-${slug(projectName)}-agent-handoff-report`}
type: agent-handoff-report
status: ${status}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - handoff
  - user-training
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
  - README.md
  - .env.example
  - scripts
  - operations/manifest.json
portability: codex-native
sources:
  - ${projectRoot}
  - 07_workflows/agents-mother.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
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
source_version: handoff ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Handoff Report: ${projectName}

Date: ${date}
Status: ${status}

## Quick Start

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Open the folder in Codex.
- Run:

\`\`\`sh
${commands.length > 0 ? commands.join("\n") : "# No local run command detected yet."}
\`\`\`

## What Is Ready

${checks.length > 0 ? checks.map((item) => `- ${item.name}: ${item.result} (${item.notes})`).join("\n") : "- No ready commands detected yet."}

## What Needs Configuration

${envNeeds.length > 0 ? envNeeds.map((name) => `- ${name}: set in .env, never commit real value`).join("\n") : "- No .env.example variables detected."}

## First Exercise

${exercise.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Operating Notes

- Do not copy secrets into Pritha reports.
- Use test reports for diagnostics and this handoff report for user-facing operation.
- If the project lacks an agent harness, create an agent-contract before changing files.
- If Telegram is enabled, test dry-run queueing before using real updates.
- If operations/autostart is enabled in the contract, inspect \`operations/manifest.json\`; do not install launchd without explicit approval.

## Risks And Limits

${recommendationForProject(detection, [
  checkResult("Agent instructions", fileExists(projectRoot, "AGENTS.md") || fileExists(projectRoot, "CLAUDE.md") || fileExists(projectRoot, "GEMINI.md") ? "pass" : "missing", ""),
  checkResult("Interface manifest", fileExists(projectRoot, "interfaces/manifest.json") ? "pass" : "missing", ""),
  checkResult("Memory manifest", fileExists(projectRoot, "memory/manifest.json") ? "pass" : "missing", ""),
  checkResult("Tool manifest", fileExists(projectRoot, "tools/manifest.json") ? "pass" : "missing", ""),
  checkResult("Operations manifest", fileExists(projectRoot, "operations/manifest.json") ? "pass" : "missing", ""),
  checkResult("Smoke test", fileExists(projectRoot, "scripts/smoke-test.mjs") ? "pass" : "missing", ""),
]).map((item) => `- ${item}`).join("\n")}

## Next Steps

- Run \`node scripts/pritha.mjs test "${projectRoot}"\` from Pritha when the project changes.
- Discuss whether the next improvement should target interface, memory, tools, evals, operations or user training.
`;
}
