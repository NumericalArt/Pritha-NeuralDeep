import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { contractData, validateContract, SERVICE_MODES } from "../scripts/agents-mother/contract.mjs";
import { scaffoldCapability } from "../scripts/agents-mother/scaffold/capabilities.mjs";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";
import { deriveExternalResearchTopics } from "../scripts/agents-mother/external-research-topics.mjs";

const selected = { runtimeFamily: "api", primaryInterface: "web", secondaryInterfaces: "API", serviceMode: "process", autostart: "optional", proactiveMode: "none", telegramMode: "none", repositoryAdoptionMode: "none" };
function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-api-scaffold-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children");
  mkdirSync(root); mkdirSync(agentParent); mkdirSync(path.join(stateRoot, "agents/contracts"), { recursive: true });
  const target = path.join(agentParent, "api-result"), file = path.join(stateRoot, "agents/contracts/api-contract.md");
  let source = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("type: agent-contract", "type: agent-contract\ncontract_schema_version: 2\nagent_kind: service");
  for (const [label, value] of Object.entries({ "Runtime family": "api", "Primary interface": "web", "Secondary interfaces": "API", "Service mode": "process", "Autostart": "optional", "Proactive mode": "none", "Target folder": target })) {
    source = source.replace(new RegExp(`^- ${label}:.*$`, "m"), `- ${label}: ${value}`);
  }
  source = source.replace(/^- `\.env\.example` variables:.*$/m, "- `.env.example` variables: EXAMPLE_PORT=3431");
  writeFileSync(file, source);
  return { root, stateRoot, agentParent, target, file, source, env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: agentParent } };
}

test("API process is explicit, validated and narrow; legacy adapters and unsupported combinations remain distinct", () => {
  assert.ok(SERVICE_MODES.has("process"));
  assert.equal(scaffoldCapability(selected).adapter, "api-process-v1");
  for (const patch of [{ secondaryInterfaces: "Telegram" }, { primaryInterface: "CLI" }, { autostart: "launchd-on-approval" }, { proactiveMode: "heartbeat" }, { repositoryAdoptionMode: "selected-module" }])
    assert.equal(scaffoldCapability({ ...selected, ...patch }).supported, false);
  assert.equal(scaffoldCapability({ ...selected, serviceMode: "none" }).reason, "runtime-adapter-missing");
  assert.equal(scaffoldCapability({ runtimeFamily: "codex-native", primaryInterface: "Codex project" }).adapter, "codex-workspace-v1");
  assert.equal(scaffoldCapability({ runtimeFamily: "cli", primaryInterface: "CLI" }).adapter, "headless-cli-v1");
});

test("API process research requires Node HTTP evidence, never silently substitutes an Agents SDK", () => {
  const topics = deriveExternalResearchTopics(selected).map(topic => topic.id);
  assert.ok(topics.includes("node-http-runtime")); assert.ok(topics.includes("interface-runtime-security"));
  assert.equal(topics.includes("openai-agents-sdk"), false);
  assert.ok(deriveExternalResearchTopics({ ...selected, toolSystem: "OpenAI Agents SDK" }).some(topic => topic.id === "openai-agents-sdk"));
  assert.ok(deriveExternalResearchTopics({ runtimeFamily: "api" }).some(topic => topic.id === "openai-agents-sdk"));
});

test("API files preserve process contract, planned endpoints and non-running structural readiness", t => {
  const f = fixture(t), data = contractData(f.file); assert.deepEqual(validateContract(f.file, { print: false }), []);
  const files = generatedAgentFiles(data), names = files.map(file => file.path);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.some(name => /control-center-agent-service|telegram|launchd|agent-cli/.test(name)), false);
  mkdirSync(f.target);
  for (const file of files) { const target = path.join(f.target, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.content); }
  const run = argv => spawnSync(process.execPath, argv, { cwd: f.target, encoding: "utf8", timeout: 5000 });
  assert.equal(run(["scripts/smoke-test.mjs"]).status, 0);
  assert.equal(run(["scripts/healthcheck.mjs"]).status, 0);
  for (const argv of [["scripts/server.mjs"], ["scripts/service-control.mjs", "start"], ["scripts/service-control.mjs", "stop"]]) {
    const result = run(argv); assert.equal(result.status, 78); assert.match(result.stderr, /implementation-required/);
  }
  assert.equal(run(["scripts/deploy-service.mjs", "install", "--yes"]).status, 64);
  assert.equal(JSON.parse(run(["scripts/deploy-service.mjs", "status"]).stdout).mutates, false);
  const ops = JSON.parse(readFileSync(path.join(f.target, "operations/manifest.json"), "utf8"));
  assert.equal(ops.service_mode, "process"); assert.equal(ops.agent_kind, "service"); assert.equal(ops.autostart, "optional");
  assert.equal(ops.health_url, "http://127.0.0.1:3431/health"); assert.equal(ops.local_upstream_url, "http://127.0.0.1:3431");
  assert.deepEqual(ops.start_command.argv, ["node", "scripts/service-control.mjs", "start"]);
  assert.match(readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), /Harness evolution protocol/);
  assert.equal(existsSync(path.join(f.target, ".state")), false); assert.equal(readFileSync(f.file, "utf8"), f.source);
  const ephemeral = generatedAgentFiles({ ...data, memoryModel: "ephemeral", indexingSearchNeeds: "none; no SQLite/embeddings copied" });
  assert.equal(ephemeral.some(file => file.path.startsWith("memory/") || file.path === "scripts/memory-status.mjs"), false);

});

test("API scaffold CLI preserves acceptance/research gates then makes a clean baseline and truthful report", t => {
  const f = fixture(t);
  const args = ["scripts/pritha.mjs", "scaffold", f.file];
  const denied = spawnSync(process.execPath, args, { encoding: "utf8", env: f.env, timeout: 10000 });
  assert.notEqual(denied.status, 0); assert.equal(existsSync(f.target), false);
  const result = spawnSync(process.execPath, [...args, "--allow-missing-research", "--allow-pending-external-verification"], { encoding: "utf8", env: f.env, timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: f.target, encoding: "utf8" }), "");
  const reports = path.join(f.stateRoot, "agents/reports");
  const report = readFileSync(path.join(reports, readdirSync(reports).find(name => name.endsWith("-scaffold-report.md"))), "utf8");
  assert.match(report, /scaffold_adapter: api-process-v1/); assert.match(report, /Service mode: process/);
  assert.match(report, /Health URL: \[REDACTED_PRIVATE_ENDPOINT\]/);
  assert.match(report, /Control Center runtime contract \| implementation-required/);
  assert.doesNotMatch(report, /scripts\/control-center-agent-service|scripts\/control-center-runtime/);
  assert.equal(readFileSync(f.file, "utf8"), f.source);
});
