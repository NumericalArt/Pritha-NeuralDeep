import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("env-doctor exposes machine-readable dependency status", () => {
  const result = spawnSync("node", ["scripts/env-doctor.mjs", "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "pass");
  assert.equal(payload.failed, 0);
  assert.ok(Array.isArray(payload.checks));
  assert.ok(payload.checks.some((check) => check.id === "node" && check.level === "critical"));
  assert.ok(payload.checks.some((check) => check.id === "git" && check.level === "critical"));
  assert.ok(payload.checks.some((check) => check.id === "sentence-transformers" && check.level === "critical"));
  assert.ok(payload.checks.some((check) => check.id === "control-center-pinned-deps" && check.level === "critical"));
});

test("env-doctor minimal profile skips install-heavy Python package checks", () => {
  const result = spawnSync("node", ["scripts/env-doctor.mjs", "--profile", "minimal", "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.profile, "minimal");
  assert.ok(payload.checks.some((check) => check.id === "git"));
  assert.equal(payload.checks.some((check) => check.id === "sentence-transformers"), false);
  assert.equal(payload.checks.some((check) => check.id === "control-center-pinned-deps"), false);
});

test("env-doctor fails with an actionable message when a critical dependency is missing", () => {
  const result = spawnSync("node", ["scripts/env-doctor.mjs", "--simulate-missing=sqlite3"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /FAIL sqlite3 CLI/);
  assert.match(result.stdout, /Install sqlite3 CLI/);
});
