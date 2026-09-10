import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scaffoldCapability } from "../scripts/agents-mother/scaffold/capabilities.mjs";
import { contractData } from "../scripts/agents-mother/contract.mjs";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";
import { readAgentCatalog } from "../scripts/agents-mother/identity.mjs";

const selected = { runtimeFamily: "cli", primaryInterface: "CLI", secondaryInterfaces: "none", serviceMode: "none", autostart: "disabled", proactiveMode: "none", telegramMode: "none" };
function fixture(t, runtime = "cli") {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-cli-scaffold-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children");
  mkdirSync(root); mkdirSync(agentParent); mkdirSync(path.join(stateRoot, "agents/contracts"), { recursive: true });
  const file = path.join(stateRoot, "agents/contracts/cli-contract.md"), target = path.join(agentParent, "cli-result");
  const text = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace(/^- Runtime family:.*$/m, `- Runtime family: ${runtime}`)
    .replace(/^- Primary interface:.*$/m, "- Primary interface: CLI")
    .replace(/^- Secondary interfaces:.*$/m, "- Secondary interfaces: none")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${target}`)
    .replace(/^- Service mode:.*$/m, "- Service mode: none")
    .replace(/^- Autostart:.*$/m, "- Autostart: disabled")
    .replace(/^- Proactive mode:.*$/m, "- Proactive mode: none");
  writeFileSync(file, text);
  const env = { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: agentParent };
  return { root, stateRoot, agentParent, file, target, env, text };
}

test("capability selection distinguishes headless CLI from selected service and unsupported adapters", () => {
  for (const runtimeFamily of ["cli", "codex-native"]) assert.equal(scaffoldCapability({ ...selected, runtimeFamily }).adapter, "headless-cli-v1");
  const service = scaffoldCapability({ ...selected, serviceMode: "launchd", autostart: "launchd-on-approval" });
  assert.equal(service.supported, false); assert.equal(service.reason, "cli-combination-adapter-missing");
  assert.equal(scaffoldCapability({ ...selected, runtimeFamily: "api" }).reason, "runtime-adapter-missing");
  assert.equal(scaffoldCapability({ ...selected, secondaryInterfaces: "web" }).supported, false);
  for (const primaryInterface of ["CLI, Telegram", "CLI + Web", "CLI / API", "CLI and Web", "CLI и Telegram"]) {
    assert.equal(scaffoldCapability({ ...selected, primaryInterface }).supported, false, primaryInterface);
  }
  assert.equal(scaffoldCapability({ ...selected, secondaryInterfaces: "CLI + Web" }).supported, false);
  assert.equal(scaffoldCapability({ ...selected, primaryInterface: "CLI / headless" }).adapter, "headless-cli-v1");
  assert.equal(scaffoldCapability({ ...selected, repositoryAdoptionMode: "selected-module" }).supported, false);
  assert.equal(scaffoldCapability({ runtimeFamily: "codex-native", primaryInterface: "Codex project" }).adapter, "codex-workspace-v1");
});

test("headless files preserve runtime, selected modules and a command that cannot claim an implemented outcome", t => {
  const f = fixture(t), data = { ...contractData(f.file), ...selected }, files = generatedAgentFiles(data);
  const names = files.map(file => file.path);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.some(name => name.startsWith("operations/") || /control-center|deploy-service|telegram|launchd/.test(name)), false);
  for (const required of ["AGENTS.md", "README.md", ".env.example", "memory/manifest.json", "skills/manifest.json", "tools/manifest.json", "delivery/outcome-lineage.json"]) assert.ok(names.includes(required), required);
  mkdirSync(f.target);
  for (const file of files) { const target = path.join(f.target, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.content); }
  const run = args => spawnSync(process.execPath, args, { cwd: f.target, encoding: "utf8", timeout: 15_000 });
  assert.equal(run(["scripts/smoke-test.mjs"]).status, 0);
  assert.equal(run(["scripts/healthcheck.mjs"]).status, 0);
  const result = run(["scripts/agent-cli.mjs", "run"]); assert.equal(result.status, 78); assert.match(result.stderr, /implementation-required/);
  assert.equal(run(["scripts/agent-cli.mjs", "invalid"]).status, 64);
  const status = JSON.parse(run(["scripts/agent-cli.mjs", "status"]).stdout);
  assert.equal(status.runtime, "cli"); assert.equal(status.readiness, "scaffold-only");
  assert.match(readFileSync(path.join(f.target, "AGENTS.md"), "utf8"), /Harness evolution protocol/);
  assert.equal(readFileSync(f.file, "utf8"), f.text);
});

test("unsupported CLI preflight makes no project or report writes and preserves the accepted contract", t => {
  const f = fixture(t, "local-model");
  const preview = JSON.parse(execFileSync(process.execPath, ["scripts/pritha.mjs", "scaffold-plan", f.file], { encoding: "utf8", env: f.env }));
  assert.equal(preview.capability.supported, false); assert.equal(preview.contractStatus, "accepted");
  const result = spawnSync(process.execPath, ["scripts/pritha.mjs", "scaffold", f.file], { encoding: "utf8", env: f.env });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /local-model scaffold adapter/);
  assert.equal(existsSync(f.target), false);
  assert.equal(existsSync(path.join(f.stateRoot, "agents/reports")), false);
  assert.equal(readFileSync(f.file, "utf8"), f.text);
});

test("CLI scaffold completes structural checks and a local Git baseline without rewriting runtime", t => {
  const f = fixture(t);
  const preview = JSON.parse(execFileSync(process.execPath, ["scripts/pritha.mjs", "scaffold-plan", f.file], { encoding: "utf8", env: f.env }));
  assert.deepEqual(preview.issues, []); assert.equal(preview.capability.adapter, "headless-cli-v1");
  const result = spawnSync(process.execPath, ["scripts/pritha.mjs", "scaffold", f.file, "--allow-missing-research", "--allow-pending-external-verification"], { encoding: "utf8", env: f.env, timeout: 30_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /experimental scaffold overrides/);
  assert.equal(readFileSync(f.file, "utf8"), f.text);
  assert.equal(existsSync(path.join(f.target, "operations")), false);
  const reports = path.join(f.stateRoot, "agents/reports");
  const report = readFileSync(path.join(reports, readdirSync(reports).find(name => name.endsWith("-scaffold-report.md"))), "utf8");
  assert.match(report, /scaffold_adapter: headless-cli-v1/);
  assert.match(report, /Control Center runtime contract \| not-applicable/);
  assert.doesNotMatch(report, /http:\/\/127\.0\.0\.1|scripts\/control-center-runtime/);
  const agent = readAgentCatalog({ root: f.root, stateRoot: f.stateRoot, agentParent: f.agentParent, fresh: true }).agents.find(row => row.projectPath === f.target);
  assert.ok(agent); assert.equal(agent.identityStatus === "conflict", false);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: f.target, encoding: "utf8" }), "");
  assert.match(execFileSync("git", ["rev-parse", "HEAD"], { cwd: f.target, encoding: "utf8" }), /^[a-f0-9]{40}/);
});
