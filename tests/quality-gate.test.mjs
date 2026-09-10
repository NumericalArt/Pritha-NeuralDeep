import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("quality-gate exposes a serialized dry-run contract", () => {
  const result = spawnSync("node", ["scripts/quality-gate.mjs", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, "techscope-quality-gate-v1");
  assert.equal(payload.status, "planned");
  assert.equal(payload.failed, 0);
  assert.deepEqual(
    payload.checks.map((check) => check.id),
    [
      "env-doctor",
      "privacy-audit",
      "validate-memory",
      "rebuild-memory",
      "smoke-test",
      "unit-tests",
      "agents-mother-test",
      "telegram-dry-run",
    ],
  );
  assert.ok(payload.checks.every((check) => check.status === "planned"));
});

test("quality-gate simulated failure returns a clear failing check", () => {
  const result = spawnSync("node", ["scripts/quality-gate.mjs", "--dry-run", "--json", "--simulate-fail=smoke-test"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "fail");
  assert.equal(payload.failed, 1);
  const failed = payload.checks.find((check) => check.id === "smoke-test");
  assert.equal(failed.status, "fail");
  assert.match(failed.stderr, /simulated failure for smoke-test/);
});

test("quality-gate emits GitHub annotations without breaking JSON output", () => {
  const result = spawnSync("node", [
    "scripts/quality-gate.mjs",
    "--dry-run",
    "--json",
    "--github-annotations",
    "--simulate-fail=smoke-test",
  ], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.failed, 1);
  assert.match(result.stderr, /::error title=Quality gate failed%3A Smoke test::/);
  assert.match(result.stderr, /Command: node scripts\/smoke-test\.mjs/);
});

test("quality-gate markdown output includes a summary table", () => {
  const result = spawnSync("node", ["scripts/quality-gate.mjs", "--dry-run", "--markdown"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /# Techscope Quality Gate: planned/);
  assert.match(result.stdout, /\| Status \| Check \| Command \| Duration \|/);
});

test("quality-gate self-test profile omits heavier Agents Mother inspection", () => {
  const result = spawnSync("node", ["scripts/quality-gate.mjs", "--profile", "self-test", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.profile, "self-test");
  assert.deepEqual(
    payload.checks.map((check) => check.id),
    ["env-doctor", "privacy-audit", "validate-memory", "rebuild-memory", "smoke-test", "unit-tests", "telegram-dry-run"],
  );
});
