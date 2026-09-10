import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const promoteScript = path.resolve("scripts/pritha-promote.mjs");
const auditScript = path.resolve("scripts/pre-push-audit.mjs");

function write(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function git(cwd, args) {
  const result = run("git", args, { cwd });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test("promotion rejects child-agent lifecycle documents and permits a separately authored assessment", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-promotion-guard-"));
  const root = path.join(base, "Pritha");
  const stateRoot = path.join(base, "state");
  const env = { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot };
  try {
    write(path.join(root, "README.md"), "# Fixture\n");
    write(path.join(stateRoot, "agents", "contracts", "fixture-agent.md"), `---\nid: fixture-agent\ntype: agent-contract\nstatus: accepted\nsubject:\n  kind: child-agent\n  id: fixture-agent\n---\n\n# Fixture agent\n`);
    const blocked = run("node", [promoteScript, "apply", "--source", "contracts/fixture-agent.md", "--target", "11_agents/contracts/fixture-agent.md", "--yes"], { env });
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /child-agent lifecycle artifacts are instance-local/);
    assert.equal(existsSync(path.join(root, "11_agents", "contracts", "fixture-agent.md")), false);

    write(path.join(stateRoot, "agents", "reviews", "portable-assessment.md"), `---\nid: portable-assessment\ntype: assessment\nstatus: draft\n---\n\n# Anonymized assessment\n`);
    const allowed = run("node", [promoteScript, "apply", "--source", "reviews/portable-assessment.md", "--target", "03_reviews/portable-assessment.md", "--yes"], { env });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(readFileSync(path.join(root, "03_reviews", "portable-assessment.md"), "utf8"), /Anonymized assessment/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("pre-push audit rejects modifications to historical child-agent lifecycle artifacts", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-pre-push-agent-guard-"));
  const root = path.join(base, "Pritha");
  const origin = path.join(base, "origin.git");
  try {
    mkdirSync(root, { recursive: true });
    git(base, ["init", "--bare", origin]);
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "fixture@example.com"]);
    git(root, ["config", "user.name", "Fixture"]);
    write(path.join(root, ".memory", "README.md"), "# Memory\n");
    write(path.join(root, ".memory", "schema.sql"), "CREATE TABLE fixture(id TEXT);\n");
    write(path.join(root, "11_agents", "contracts", "historical-agent.md"), `---\nid: historical-agent\ntype: agent-contract\nstatus: accepted\nsubject:\n  kind: child-agent\n  id: historical-agent\n---\n\n# Historical agent\n`);
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "baseline"]);
    git(root, ["remote", "add", "origin", origin]);
    git(root, ["push", "-u", "origin", "main"]);
    write(path.join(root, "11_agents", "contracts", "historical-agent.md"), `---\nid: historical-agent\ntype: agent-contract\nstatus: accepted\nsubject:\n  kind: child-agent\n  id: historical-agent\n---\n\n# Modified historical agent\n`);

    const audited = run("node", [auditScript, "--json"], { env: { ...process.env, TECHSCOPE_ROOT: root } });
    assert.notEqual(audited.status, 0);
    const payload = JSON.parse(audited.stdout);
    const guard = payload.checks.find((check) => check.id === "instance-local-child-agent-publication");
    assert.equal(guard.status, "fail");
    assert.match(guard.detail, /11_agents\/contracts\/historical-agent\.md/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
