import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("github-release-status exposes a machine-readable external release contract", () => {
  const result = spawnSync("node", ["scripts/github-release-status.mjs", "--json", "--skip-pre-push-audit", "--skip-working-tree-check"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, "pritha-github-release-status-v1");
  assert.ok(["pass", "pending-external", "fail"].includes(payload.status));
  assert.ok(payload.checks.some((check) => check.id === "github-workflows"));
  assert.ok(payload.checks.some((check) => check.id === "live-ci-and-release"));
});

test("github-release-status strict mode fails while external release proof is incomplete", () => {
  const result = spawnSync("node", ["scripts/github-release-status.mjs", "--json", "--strict", "--skip-pre-push-audit", "--skip-working-tree-check"], {
    encoding: "utf8",
  });
  const payload = JSON.parse(result.stdout);
  if (payload.status === "pass") {
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } else {
    assert.notEqual(result.status, 0, result.stderr || result.stdout);
    assert.equal(payload.status, "pending-external");
  }
});
