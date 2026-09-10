import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FunctionBuildExecutor } from "../../scripts/agents-mother/build-executors.mjs";
import { runDeliveryLoop } from "../../scripts/agents-mother/delivery-loop.mjs";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec } from "../../scripts/agents-mother/outcome-spec.mjs";
import { readAgentResultReadiness } from "../../scripts/agents-mother/result-readiness.mjs";
export const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
export async function resultReadinessFixture(t, prepare = {}) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-result-readiness-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), project = path.join(agentParent, "product"), contracts = path.join(stateRoot, "agents/contracts");
  const options = { root, stateRoot, agentParent };
  for (const directory of [root, contracts, path.join(project, "scripts")]) mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(project, "AGENTS.md"), "# Synthetic agent\n");
  writeFileSync(path.join(project, "scripts/smoke-test.mjs"), "console.log('synthetic result');\n");
  prepare.project?.(project);
  git(project, ["init"]); git(project, ["config", "user.name", "Pritha Tests"]); git(project, ["config", "user.email", "tests@pritha.local"]);
  git(project, ["add", "."]); git(project, ["commit", "-m", "synthetic fixture"]);
  const contractPath = path.join(contracts, "contract.md");
  writeFileSync(contractPath, (prepare.contract || (source => source))(readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("type: agent-contract", "type: agent-contract\ncontract_schema_version: 2\nagent_kind: one-shot-cli\nagent_id: readiness-fixture")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${project}`)));
  const specPath = createOutcomeSpec(contractPath, options).path;
  approveOutcomeSpec(specPath, { ...options, approvedBy: "user" });
  const compiled = compileOutcomeSpec(specPath, { ...options, runId: "readiness-run" });
  const executor = new FunctionBuildExecutor(async () => { throw new Error("A read-only readiness fixture must never call a build model"); });
  const result = await runDeliveryLoop({ ...options, ...compiled, projectPath: project, hostOnly: true, buildExecutor: executor, trialBackend: "local" });
  assert.ok(["verified", "awaiting_acceptance"].includes(result.state.status), JSON.stringify(result.state.blockers));
  return { ...options, options, ...compiled, project, contractPath, specPath, read: () => readAgentResultReadiness("readiness-fixture", options) };
}
