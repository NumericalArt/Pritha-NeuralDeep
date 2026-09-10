import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { contractData, validateContract } from "../scripts/agents-mother/contract.mjs";

const entrypoint = path.resolve("scripts/pritha.mjs");

function initContract(extraArgs = []) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-token-contract-root-"));
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-token-contract-state-"));
  const result = spawnSync(process.execPath, [entrypoint, "init", "--name", "Budget Fixture", "--mission", "Produce a bounded result", "--success", "A deterministic result exists", ...extraArgs], {
    env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const contractName = readdirSync(path.join(stateRoot, "agents", "contracts")).find((name) => name.endsWith("agent-contract.md"));
  return { root, stateRoot, contractPath: path.join(stateRoot, "agents", "contracts", contractName) };
}

test("non-interactive contracts default to a pending 1000000 token confirmation", () => {
  const fixture = initContract();
  try {
    const text = readFileSync(fixture.contractPath, "utf8");
    assert.match(text, /^- Build token budget: 1000000$/m);
    assert.match(text, /^- Build token budget confirmation: pending$/m);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(fixture.stateRoot, { recursive: true, force: true });
  }
});

test("non-interactive contracts record a user-confirmed custom positive safe token budget only with both flags", () => {
  const fixture = initContract(["--build-token-budget", "2000000", "--token-budget-confirmed-by", "user"]);
  try {
    const data = contractData(fixture.contractPath, { root: fixture.root });
    assert.equal(data.buildTokenBudget, 2_000_000);
    assert.equal(data.buildTokenBudgetConfirmation, "user");
    assert.equal(data.buildTokenBudgetSource, "user");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(fixture.stateRoot, { recursive: true, force: true });
  }
});

test("legacy accepted contracts receive the 1000000 default while explicit pending autonomous contracts are blocked", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-token-legacy-"));
  const contractPath = path.join(root, "contract.md");
  const legacy = readFileSync(path.resolve("tests/fixtures/contracts/valid-agent-contract.md"), "utf8");
  try {
    writeFileSync(contractPath, legacy);
    const legacyData = contractData(contractPath, { root });
    assert.equal(legacyData.buildTokenBudget, 1_000_000);
    assert.equal(legacyData.buildTokenBudgetConfirmation, "legacy-default");
    assert.equal(legacyData.buildTokenBudgetSource, "legacy-default");

    const pending = `${legacy}\n## Outcome delivery\n\n- Build executor: codex-app-server\n- Build token budget: 1000000\n- Build token budget confirmation: pending\n`;
    writeFileSync(contractPath, pending);
    const issues = validateContract(contractPath, { root, print: false });
    assert.equal(issues.some((issue) => issue.includes("requires user-confirmed Build token budget")), true);

    writeFileSync(contractPath, pending.replace("Build token budget: 1000000", "Build token budget: 9007199254740992"));
    const unsafeIssues = validateContract(contractPath, { root, print: false });
    assert.equal(unsafeIssues.some((issue) => issue.includes("positive JavaScript-safe integer")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
