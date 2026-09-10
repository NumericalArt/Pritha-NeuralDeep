import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("golden-checks exposes a machine-readable dry-run contract", () => {
  const output = execFileSync("node", ["scripts/golden-checks.mjs", "--dry-run", "--json"], {
    encoding: "utf8",
  });
  const payload = JSON.parse(output);
  assert.equal(payload.status, "planned");
  assert.equal(payload.failed, 0);
  assert.ok(Array.isArray(payload.checks));
  assert.ok(payload.checks.length >= 6);
  assert.ok(payload.checks.every((check) => check.status === "planned"));
  assert.ok(payload.checks.some((check) => check.name === "Privacy retention audit"));
  assert.ok(payload.checks.some((check) => check.name === "Markdown integrity"));
  assert.ok(payload.checks.some((check) => check.command === "node scripts/agents-mother.mjs test . --no-report"));
});
