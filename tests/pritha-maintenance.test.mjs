import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PROJECT_ROOT = path.resolve(".");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(options.env || {}) },
  });
  if (options.check !== false) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return result;
}

function runJson(args, root, options = {}) {
  const result = run("node", ["scripts/pritha-maintenance.mjs", ...args, "--json"], {
    check: options.check,
    env: { TECHSCOPE_ROOT: root, ...(options.env || {}) },
  });
  return {
    status: result.status,
    payload: JSON.parse(result.stdout),
    stderr: result.stderr,
  };
}

function write(root, relativePath, text) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text);
}

function git(cwd, args) {
  return run("git", args, { cwd });
}

function setupGitFixture() {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-maintenance-"));
  const origin = path.join(base, "origin.git");
  const seed = path.join(base, "seed");
  const workUpdate = path.join(base, "work-update");
  const workDirty = path.join(base, "work-dirty");
  const other = path.join(base, "other");

  git(base, ["init", "--bare", origin]);
  mkdirSync(seed);
  git(seed, ["init", "-b", "main"]);
  git(seed, ["config", "user.email", "test@example.com"]);
  git(seed, ["config", "user.name", "Pritha Test"]);
  write(seed, "AGENTS.md", "# Test\n");
  write(seed, "11_agents/registry.md", "# Registry\n");
  write(seed, "README.md", "v1\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-m", "initial"]);
  git(seed, ["remote", "add", "origin", origin]);
  git(seed, ["push", "-u", "origin", "main"]);
  run("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"]);

  git(base, ["clone", origin, workUpdate]);
  git(base, ["clone", origin, workDirty]);
  git(base, ["clone", origin, other]);
  git(other, ["config", "user.email", "test@example.com"]);
  git(other, ["config", "user.name", "Pritha Test"]);
  write(other, "README.md", "v2\n");
  git(other, ["add", "README.md"]);
  git(other, ["commit", "-m", "remote update"]);
  git(other, ["push", "origin", "main"]);

  return {
    base,
    workUpdate,
    workDirty,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

test("github update check allows only clean fast-forward main", () => {
  const fixture = setupGitFixture();
  try {
    const check = runJson(["github-check"], fixture.workUpdate);
    assert.equal(check.status, 0, JSON.stringify(check.payload, null, 2));
    assert.equal(check.payload.status, "update_available");
    assert.equal(check.payload.safeToUpdate, true);
    assert.equal(check.payload.behind, 1);

    write(fixture.workDirty, "README.md", "local dirty edit\n");
    const dirty = runJson(["github-update", "--yes"], fixture.workDirty, { check: false });
    assert.equal(dirty.status, 2);
    assert.equal(dirty.payload.status, "blocked");
    assert.equal(dirty.payload.github.safeToUpdate, false);
  } finally {
    fixture.cleanup();
  }
});

test("github update creates a backup branch before fast-forward pull", () => {
  const fixture = setupGitFixture();
  try {
    const update = runJson(["github-update", "--yes"], fixture.workUpdate);
    assert.equal(update.payload.status, "updated", JSON.stringify(update.payload, null, 2));
    assert.ok(update.payload.backupBranch.startsWith("backup/pritha-pre-github-update-"));
    assert.equal(readFileSync(path.join(fixture.workUpdate, "README.md"), "utf8"), "v2\n");
    const branches = git(fixture.workUpdate, ["branch", "--list", update.payload.backupBranch]).stdout;
    assert.match(branches, /backup\/pritha-pre-github-update-/);
  } finally {
    fixture.cleanup();
  }
});

test("rebuild from GitHub remains plan-only even with --yes", () => {
  const fixture = setupGitFixture();
  try {
    const plan = runJson(["rebuild-from-github"], fixture.workUpdate);
    assert.equal(plan.payload.status, "plan_only");
    assert.equal(plan.payload.actionEnabled, false);

    const blocked = runJson(["rebuild-from-github", "--yes"], fixture.workUpdate, { check: false });
    assert.equal(blocked.status, 2);
    assert.equal(blocked.payload.status, "blocked");
    assert.equal(blocked.payload.actionEnabled, false);
  } finally {
    fixture.cleanup();
  }
});

test("refresh self knowledge creates a draft artifact without editing standards", () => {
  const fixture = setupGitFixture();
  try {
    const result = runJson(["refresh-self-knowledge"], fixture.workUpdate);
    assert.equal(result.payload.status, "created");
    assert.match(result.payload.artifactPath, /^03_reviews\/\d{4}-\d{2}-\d{2}-pritha-self-knowledge-refresh/);
    assert.equal(existsSync(path.join(fixture.workUpdate, result.payload.artifactPath)), true);
  } finally {
    fixture.cleanup();
  }
});

test("refresh self knowledge writes to external instance state when isolation is configured", () => {
  const fixture = setupGitFixture();
  const stateRoot = path.join(fixture.base, "state");
  try {
    const result = runJson(["refresh-self-knowledge"], fixture.workUpdate, {
      env: { PRITHA_STATE_ROOT: stateRoot },
    });
    assert.equal(result.payload.status, "created");
    assert.match(result.payload.artifactPath, /^agents\/reports\/\d{4}-\d{2}-\d{2}-pritha-self-knowledge-refresh/);
    assert.equal(existsSync(path.join(stateRoot, result.payload.artifactPath)), true);
    assert.equal(existsSync(path.join(fixture.workUpdate, "03_reviews")), false);
  } finally {
    fixture.cleanup();
  }
});
