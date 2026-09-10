import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const entrypoint = path.resolve("scripts/agents-mother.mjs");

function write(root, relPath, content) {
  const fullPath = path.join(root, relPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function makeProject() {
  const root = mkdtemp();
  const project = path.join(root, "sample-agent");
  mkdirSync(project, { recursive: true });
  write(project, "AGENTS.md", "# Sample Agent\n");
  write(project, "README.md", "# Sample Agent\n");
  write(project, ".env.example", "AGENT_NAME=sample-agent\n");
  write(project, "interfaces/manifest.json", JSON.stringify({ generated_by: "Pritha", agent: "Sample Agent", adapters: [] }, null, 2));
  write(project, "memory/manifest.json", JSON.stringify({ generated_by: "Pritha", agent: "Sample Agent", directories: ["memory/notes"] }, null, 2));
  write(project, "tools/manifest.json", JSON.stringify({ generated_by: "Pritha", agent: "Sample Agent", profiles: [] }, null, 2));
  write(project, "operations/manifest.json", JSON.stringify({
    generated_by: "Pritha",
    agent: "Sample Agent",
    deployment_target: "local-test",
    deployment_profile: "test",
    service_mode: "none",
    autostart: "disabled",
    start_command: "node scripts/agent-cli.mjs status",
    stop_command: "not-applicable",
    healthcheck_command: "node scripts/smoke-test.mjs",
    healthcheck_argv: ["node", "scripts/smoke-test.mjs"],
    healthcheck_command_executable: false,
    log_path: "logs/",
    proactivity: { mode: "none" },
  }, null, 2));
  write(project, "scripts/smoke-test.mjs", "console.log('Smoke test passed.');\n");
  write(project, "scripts/interface-status.mjs", "console.log('interfaces ok');\n");
  write(project, "scripts/memory-status.mjs", "console.log('memory ok');\n");
  write(project, "scripts/tools-status.mjs", "console.log('tools ok');\n");
  write(project, "scripts/operations-status.mjs", "console.log('operations ok');\n");
  write(project, "scripts/deploy-service.mjs", "console.log('deployment plan ok');\n");
  return { root, project };
}

function mkdtemp() {
  return path.join(os.tmpdir(), `techscope-agents-mother-modules-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function run(root, args) {
  return spawnSync("node", [entrypoint, ...args], {
    encoding: "utf8",
    env: { ...process.env, TECHSCOPE_ROOT: root },
  });
}

test("remaining Agents Mother command modules run against an isolated root", () => {
  const { root, project } = makeProject();

  for (const args of [
    ["handoff", project],
    ["operations", project],
    ["deploy", project, "plan"],
    ["evolve", project, "--notes", "module extraction smoke"],
    ["registry"],
  ]) {
    const result = run(root, args);
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }

  const reportsDir = path.join(root, "11_agents", "reports");
  assert.ok(existsSync(path.join(root, "11_agents", "registry.md")));
  const reports = readdirSync(reportsDir).filter((entry) => entry.endsWith(".md"));
  assert.ok(reports.some((entry) => entry.includes("agent-handoff-report")));
  assert.ok(reports.some((entry) => entry.includes("agent-operations-report")));
  assert.ok(reports.some((entry) => entry.includes("agent-deployment-report")));
  assert.ok(reports.some((entry) => entry.includes("agent-post-creation-review")));
});

test("registry does not promote roadmap phase reports to agents", () => {
  const root = mkdtemp();
  write(
    root,
    "11_agents/reports/2026-06-21-pritha-github-install-reproducibility-baseline-report.md",
    `---
id: 2026-06-21-pritha-github-install-reproducibility-baseline-report
type: agent-operations-report
status: complete
created: 2026-06-21
subject:
  kind: roadmap-phase
---

# Agent Operations Report: Pritha GitHub Install Reproducibility Baseline

Date: 2026-06-21
Status: complete
Phase: 0 - Baseline And Acceptance
`,
  );

  const result = run(root, ["registry"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const registry = readFileSync(path.join(root, "11_agents", "registry.md"), "utf8");
  assert.match(registry, /Agents tracked: 0/);
  assert.match(registry, /Reports: 1/);
  assert.doesNotMatch(registry, /Pritha GitHub Install Reproducibility Baseline \| unknown/);
});

test("registry classifies Outcome Specs separately from agent contracts", () => {
  const root = mkdtemp();
  write(
    root,
    "11_agents/contracts/2026-08-16-alpha-agent-contract.md",
    `---
id: 2026-08-16-alpha-agent-contract
type: agent-contract
status: accepted
created: 2026-08-16
---

# Agent Project Contract: Alpha Agent

- Agent name: Alpha Agent
- Primary mission: Complete the alpha outcome
- Runtime family: codex-native
- Primary interface: Codex project
- Telegram mode: none
- Deployment target: local Mac
- Proactive mode: manual
`,
  );
  write(
    root,
    "11_agents/contracts/2026-08-16-alpha-agent-outcome-spec.md",
    `---
id: 2026-08-16-alpha-agent-outcome-spec
type: agent-outcome-spec
status: approved
outcome_spec_status: approved
agent_slug: alpha-agent
approved_by: user
created: 2026-08-16
---

# Agent Outcome Spec: Alpha Agent
`,
  );
  write(
    root,
    "11_agents/reports/2026-08-16-alpha-agent-delivery-report.md",
    `---
id: 2026-08-16-alpha-agent-delivery-report
type: agent-delivery-report
status: verified
created: 2026-08-16
subject:
  kind: child-agent
  id: alpha-agent
---

# Agent delivery report: Alpha Agent

- Agent name: Alpha Agent
`,
  );

  const result = run(root, ["registry"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const registry = readFileSync(path.join(root, "11_agents", "registry.md"), "utf8");
  assert.match(registry, /Agents tracked: 1/);
  assert.match(registry, /Contracts: 1/);
  assert.match(registry, /Outcome specs: 1/);
  assert.match(registry, /contracts:1 outcome:1 scaffold:0 delivery:1/);
});

test("registry joins display names, technical slugs and contract-bound revisions into one lineage", () => {
  const root = mkdtemp();
  for (const [date, revision] of [["2026-08-14", 3], ["2026-08-19", 4]]) {
    write(
      root,
      `11_agents/contracts/${date}-fixture-executive-agent-contract.md`,
      `---
id: ${date}-fixture-executive-agent-contract-revision-${revision}
type: agent-contract
status: accepted
created: ${date}
subject:
  kind: child-agent
  id: fixture-executive-agent
---

# Agent Project Contract: Fixture Executive Agent

- Agent name: Fixture Executive Agent
- Technical slug: fixture-executive-agent
- Primary mission: Revision ${revision} mission
- Runtime family: codex-native
- Primary interface: Codex project
- Telegram mode: none
- Deployment target: Mac mini
- Proactive mode: scheduled
`,
    );
  }
  write(
    root,
    "11_agents/contracts/2026-08-19-fixture-executive-agent-outcome-spec.md",
    `---
id: 2026-08-19-fixture-executive-agent-outcome-spec
type: agent-outcome-spec
status: approved
outcome_spec_status: approved
agent_slug: fixture-executive-agent
contract_path: 11_agents/contracts/2026-08-19-fixture-executive-agent-contract.md
approved_by: user
created: 2026-08-19
---

# Agent Outcome Spec: Fixture Executive Agent
`,
  );
  write(
    root,
    "11_agents/reports/2026-08-19-fixture-executive-agent-handoff-report.md",
    `---
id: 2026-08-19-fixture-executive-agent-handoff-report
type: agent-handoff-report
status: complete
created: 2026-08-19
subject:
  kind: child-agent
  id: fixture-executive-agent
---

# Agent Handoff Report: Fixture Executive Agent

- Agent name: Fixture Executive Agent
- Project path: /tmp/fixture-executive-agent
`,
  );

  const result = run(root, ["registry"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const registry = readFileSync(path.join(root, "11_agents", "registry.md"), "utf8");
  assert.match(registry, /Agents tracked: 1/);
  assert.match(registry, /\| Fixture Executive Agent \| Revision 4 mission/);
  assert.match(registry, /contracts:2 outcome:1 scaffold:0 delivery:0 test:0 handoff:1/);
});
