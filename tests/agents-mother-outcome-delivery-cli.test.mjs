import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const entrypoint = path.resolve("scripts/pritha.mjs");

function run(root, stateRoot, args) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    encoding: "utf8",
    env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot },
  });
}

test("CLI carries an accepted contract through Outcome approval, scaffold, verification and user acceptance", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-delivery-cli-root-"));
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-delivery-cli-state-"));
  const contractDir = path.join(root, "11_agents", "contracts");
  const contractPath = path.join(contractDir, "fixture-agent-contract.md");
  mkdirSync(contractDir, { recursive: true });
  cpSync(path.resolve("tests/fixtures/contracts/valid-agent-contract.md"), contractPath);

  const initialized = run(root, stateRoot, ["outcome", "init", contractPath]);
  assert.equal(initialized.status, 0, `${initialized.stdout}\n${initialized.stderr}`);
  const specName = readdirSync(path.join(stateRoot, "agents", "contracts")).find((entry) => entry.endsWith("agent-outcome-spec.md"));
  assert.ok(specName);
  const specPath = path.join(stateRoot, "agents", "contracts", specName);

  const approved = run(root, stateRoot, ["outcome", "approve", specPath, "--approved-by", "user"]);
  assert.equal(approved.status, 0, `${approved.stdout}\n${approved.stderr}`);

  const projectPath = path.join(root, "generated-agent");
  const scaffolded = run(root, stateRoot, [
    "scaffold",
    contractPath,
    "--output",
    projectPath,
    "--allow-missing-research",
    "--allow-pending-external-verification",
  ]);
  assert.equal(scaffolded.status, 0, `${scaffolded.stdout}\n${scaffolded.stderr}`);
  assert.match(scaffolded.stdout, /Delivery Git baseline: initialized/);
  assert.match(scaffolded.stdout, /Outcome Spec: approved \(approval valid\)/);

  const delivered = run(root, stateRoot, [
    "deliver",
    specPath,
    "--project",
    projectPath,
    "--executor",
    "manual",
    "--run-id",
    "cli-outcome-run",
  ]);
  assert.equal(delivered.status, 0, `${delivered.stdout}\n${delivered.stderr}`);
  assert.match(delivered.stdout, /Status: awaiting_acceptance/);
  assert.match(delivered.stdout, /Branch: pritha\/build-cli-outcome-run/);

  const approvedSpec = readFileSync(specPath, "utf8");
  writeFileSync(specPath, `${approvedSpec}\n<!-- stale mutation -->\n`, "utf8");
  const staleAcceptance = run(root, stateRoot, ["delivery", "accept", "cli-outcome-run", "--accepted-by", "user"]);
  assert.notEqual(staleAcceptance.status, 0);
  assert.match(`${staleAcceptance.stdout}\n${staleAcceptance.stderr}`, /approved.*(?:stale|current)|locks.*stale/i);
  writeFileSync(specPath, approvedSpec, "utf8");

  const accepted = run(root, stateRoot, ["delivery", "accept", "cli-outcome-run", "--accepted-by", "user"]);
  assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
  assert.match(accepted.stdout, /Status: accepted/);

  const ledger = JSON.parse(readFileSync(path.join(stateRoot, "builds", "snapshot-agent", "cli-outcome-run", "build-state.json"), "utf8"));
  assert.equal(ledger.status, "accepted");
  assert.equal(ledger.accepted_by, "user");
  const runRoot = path.join(stateRoot, "builds", "snapshot-agent", "cli-outcome-run");
  const worktree = JSON.parse(readFileSync(path.join(runRoot, "delivery-worktree.json"), "utf8"));
  assert.equal(worktree.cleanup_status, "cleaned");
  assert.equal(existsSync(path.join(runRoot, "worktree")), false);
  const branch = spawnSync("git", ["branch", "--list", "pritha/build-cli-outcome-run"], { cwd: projectPath, encoding: "utf8" });
  assert.match(branch.stdout, /pritha\/build-cli-outcome-run/);
  const reports = readdirSync(path.join(stateRoot, "agents", "reports")).filter((entry) => entry.includes("agent-delivery-report"));
  assert.equal(reports.length >= 2, true);
});
