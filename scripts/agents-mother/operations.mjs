import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { yamlList } from "../lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolveTechscopeRoot } from "../lib/paths.mjs";
import { slug as makeSlug } from "../lib/slug.mjs";
import { today } from "../lib/date.mjs";
import { AUTOSTART_MODES, PROACTIVE_MODES, SERVICE_MODES } from "./contract.mjs";
import { checkResult, detectProject, fileExists, readJsonIfExists, runProjectCommand } from "./test.mjs";
import { writeLifecycleReport } from "./lifecycle-report.mjs";

const ROOT = resolveTechscopeRoot();
const REPORT_DIR = path.join(resolvePrithaAgentMemoryRoot({ root: ROOT }), "reports");
const slug = (value, fallback = "agent") => makeSlug(value, { fallback });

function argvSummary(value) {
  return Array.isArray(value) ? value.map((part) => String(part || "")).filter(Boolean).join(" ") : "";
}

function ensureDirs() {
  mkdirSync(REPORT_DIR, { recursive: true });
}

export function operationsProject(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }

  const detection = detectProject(projectRoot);
  const manifest = readJsonIfExists(projectRoot, "operations/manifest.json");
  const checks = [];

  checks.push(checkResult(
    "Operations manifest",
    manifest ? "pass" : "missing",
    manifest ? "operations/manifest.json found." : "No operations/manifest.json found.",
  ));

  if (manifest) {
    checks.push(checkResult(
      "Deployment target",
      manifest.deployment_target ? "pass" : "warning",
      manifest.deployment_target || "No deployment target documented.",
    ));
    checks.push(checkResult(
      "Deployment profile",
      manifest.deployment_profile ? "pass" : "warning",
      manifest.deployment_profile || "No deployment profile documented.",
    ));
    checks.push(checkResult(
      "Service mode",
      SERVICE_MODES.has(manifest.service_mode) ? "pass" : "fail",
      manifest.service_mode || "missing",
    ));
    checks.push(checkResult(
      "Autostart mode",
      AUTOSTART_MODES.has(manifest.autostart) ? "pass" : "fail",
      `${manifest.autostart || "missing"}; ${manifest.autostart_policy || "no policy text"}`,
    ));
    checks.push(checkResult(
      "Start command",
      manifest.start_command ? "pass" : "missing",
      manifest.start_command || "No start command documented.",
    ));
    checks.push(checkResult(
      "Stop command",
      manifest.stop_command ? "pass" : "warning",
      manifest.stop_command || "No stop command documented.",
    ));
    checks.push(checkResult(
      "Healthcheck argv",
      argvSummary(manifest.healthcheck_argv) ? "pass" : "missing",
      argvSummary(manifest.healthcheck_argv) || "No healthcheck_argv documented.",
    ));
    checks.push(checkResult(
      "Legacy healthcheck command",
      manifest.healthcheck_command ? "pass" : "warning",
      manifest.healthcheck_command ? `${manifest.healthcheck_command}; display/planning only.` : "No legacy healthcheck command documented.",
    ));
    checks.push(checkResult(
      "Log path",
      manifest.log_path ? "pass" : "warning",
      manifest.log_path || "No log path documented.",
    ));
    checks.push(checkResult(
      "Proactive mode",
      PROACTIVE_MODES.has(manifest.proactivity?.mode) ? "pass" : "warning",
      manifest.proactivity?.mode || "No proactive mode documented.",
    ));
    if (manifest.launchd_template) {
      checks.push(checkResult(
        "launchd template",
        fileExists(projectRoot, manifest.launchd_template) ? "pass" : "missing",
        manifest.launchd_template,
      ));
    } else {
      checks.push(checkResult("launchd template", "not-applicable", "No launchd template selected by service profile."));
    }
  }

  if (fileExists(projectRoot, "scripts/operations-status.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/operations-status.mjs"]);
    checks.push(checkResult("Operations status", result.result, result.output));
  } else {
    checks.push(checkResult("Operations status", "missing", "No scripts/operations-status.mjs command found."));
  }

  if (fileExists(projectRoot, "scripts/deploy-service.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/deploy-service.mjs", "plan"]);
    checks.push(checkResult("Deployment plan", result.result, result.output));
  } else {
    checks.push(checkResult("Deployment plan", "missing", "No scripts/deploy-service.mjs command found."));
  }

  if (fileExists(projectRoot, "scripts/smoke-test.mjs")) {
    const result = runProjectCommand(projectRoot, "node", ["scripts/smoke-test.mjs"]);
    checks.push(checkResult("Smoke healthcheck", result.result, result.output));
  } else {
    checks.push(checkResult("Smoke healthcheck", "warning", "No smoke test found; document a service-safe healthcheck before deployment."));
  }

  const failed = checks.filter((item) => item.result === "fail").length;
  const missing = checks.filter((item) => item.result === "missing").length;
  const warnings = checks.filter((item) => item.result === "warning").length;
  const status = failed > 0 ? "failed" : missing > 0 || warnings > 0 ? "partial" : "complete";
  const projectName = path.basename(projectRoot);
  const reportPath = writeLifecycleReport(
    path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-operations-report.md`),
    ({ artifactId }) => agentOperationsReportMarkdown(projectRoot, projectName, detection, manifest, checks, status, artifactId),
    { projectRoot, stateRoot: process.env.PRITHA_STATE_ROOT, root: ROOT },
  ).path;

  console.log(`Project: ${projectRoot}`);
  console.log(`Operations: ${status}`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
  if (failed > 0) process.exitCode = 1;
}

function agentOperationsReportMarkdown(projectRoot, projectName, detection, manifest, checks, status, artifactId) {
  const date = today();
  const tools = ["Codex", "AGENTS.md", "operations"];
  if (manifest?.service_mode === "launchd" || manifest?.launchd_template) tools.push("launchd");
  return `---
id: ${artifactId || `${date}-${slug(projectName)}-agent-operations-report`}
type: agent-operations-report
status: ${status}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - operations
  - service-readiness
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
  - operations/manifest.json
  - scripts
portability: codex-native
sources:
  - ${projectRoot}
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - 04_standards/agent-creation-harness.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
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
source_version: operations inspection ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Operations Report: ${projectName}

Date: ${date}
Status: ${status}

## Summary

- Project path: ${projectRoot}
- Classification: ${detection.classification}
- Deployment target: ${manifest?.deployment_target || "unknown"}
- Deployment profile: ${manifest?.deployment_profile || "unknown"}
- Service mode: ${manifest?.service_mode || "unknown"}
- Autostart: ${manifest?.autostart || "unknown"}
- Proactive mode: ${manifest?.proactivity?.mode || "unknown"}
- Autostart policy: ${manifest?.autostart_policy || "missing"}
- Result: ${status}

## Checks

| Check | Result | Notes |
| --- | --- | --- |
${checks.map((item) => `| ${item.name} | ${item.result} | ${item.notes.replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 260)} |`).join("\n")}

## Service Commands

- Start: \`${manifest?.start_command || "not documented"}\`
- Stop: \`${manifest?.stop_command || "not documented"}\`
- Healthcheck argv: \`${argvSummary(manifest?.healthcheck_argv) || "not documented"}\`
- Legacy healthcheck command: \`${manifest?.healthcheck_command || "not documented"}\`
- Logs: \`${manifest?.log_path || "not documented"}\`

## Proactivity

- Mode: \`${manifest?.proactivity?.mode || "unknown"}\`
- Trigger sources: ${manifest?.proactivity?.trigger_sources || "unknown"}
- Schedule: ${manifest?.proactivity?.schedule || "unknown"}
- Heartbeat interval: ${manifest?.proactivity?.heartbeat_interval || "unknown"}
- Idle behavior: ${manifest?.proactivity?.idle_behavior || "unknown"}

## Autostart Decision

- Current mode: \`${manifest?.autostart || "unknown"}\`
- Autostart is configurable, but scaffold and operations inspection do not install it.
- If launchd is selected, review the plist template and get explicit user approval before copying it to \`~/Library/LaunchAgents/\` or calling \`launchctl\`.

## Next Steps

- Fix any failed or missing checks before treating this agent as a service.
- Run \`node scripts/agents-mother.mjs test "${projectRoot}"\` after operations changes.
- Create or update the agent contract if service mode or autostart policy changes.
`;
}

export function deployProject(projectPath, options = {}) {
  ensureDirs();
  const projectRoot = path.resolve(ROOT, projectPath);
  if (!existsSync(projectRoot) || !statSync(projectRoot).isDirectory()) {
    throw new Error(`Project folder not found: ${projectPath}`);
  }

  const action = options._[1] || "plan";
  const allowed = new Set(["plan", "status", "install", "uninstall"]);
  if (!allowed.has(action)) {
    throw new Error(`Unknown deploy action: ${action}. Expected: ${Array.from(allowed).join(", ")}`);
  }
  if ((action === "install" || action === "uninstall") && !options.yes) {
    throw new Error(`Deploy action "${action}" mutates system service state and requires --yes.`);
  }
  if (!fileExists(projectRoot, "scripts/deploy-service.mjs")) {
    throw new Error("Project does not have scripts/deploy-service.mjs. Re-scaffold or add Layer 9 deployment automation first.");
  }

  const args = ["scripts/deploy-service.mjs", action];
  if (options.yes) args.push("--yes");
  const result = runProjectCommand(projectRoot, "node", args);
  const manifest = readJsonIfExists(projectRoot, "operations/manifest.json");
  const status = result.result === "pass" ? "complete" : "failed";
  const projectName = path.basename(projectRoot);
  const reportPath = writeLifecycleReport(
    path.join(REPORT_DIR, `${today()}-${slug(projectName)}-agent-deployment-report.md`),
    ({ artifactId }) => agentDeploymentReportMarkdown(projectRoot, projectName, manifest, action, result, status, artifactId),
    { projectRoot, stateRoot: process.env.PRITHA_STATE_ROOT, root: ROOT },
  ).path;

  console.log(`Project: ${projectRoot}`);
  console.log(`Deploy action: ${action}`);
  console.log(`Result: ${status}`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
  if (result.output) console.log(result.output);
  if (result.result !== "pass") process.exitCode = 1;
}

function agentDeploymentReportMarkdown(projectRoot, projectName, manifest, action, result, status, artifactId) {
  const date = today();
  const tools = ["Codex", "AGENTS.md", "operations"];
  if (manifest?.service_mode === "launchd" || manifest?.launchd_template) tools.push("launchd");
  return `---
id: ${artifactId || `${date}-${slug(projectName)}-agent-deployment-report`}
type: agent-deployment-report
status: ${status}
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - deployment
  - service-automation
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
  - operations/manifest.json
  - scripts
portability: codex-native
sources:
  - ${projectRoot}
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
related:
  agent_contracts: []
  scaffold_reports: []
  agent_test_reports: []
  agent_handoff_reports: []
  agent_operations_reports: []
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: unknown
source_version: deployment ${date}
retrieved: ${date}
verified: ${date}
valid_for: current local project state
temporal_status: current
---

# Agent Deployment Report: ${projectName}

Date: ${date}
Status: ${status}

## Summary

- Project path: ${projectRoot}
- Action: ${action}
- Deployment target: ${manifest?.deployment_target || "unknown"}
- Deployment profile: ${manifest?.deployment_profile || "unknown"}
- Service mode: ${manifest?.service_mode || "unknown"}
- Autostart: ${manifest?.autostart || "unknown"}
- Proactive mode: ${manifest?.proactivity?.mode || "unknown"}
- Service label: ${manifest?.service_label || "unknown"}
- Result: ${status}

## Command Output

\`\`\`text
${result.output || "no output"}
\`\`\`

## Safety Notes

- \`plan\` and \`status\` are read-only.
- \`install\` and \`uninstall\` require \`--yes\`.
- \`install\` is allowed only when the agent manifest explicitly selects \`service_mode: launchd\` and \`autostart: launchd-on-approval\`.
`;
}
