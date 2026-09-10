import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("queue-health reports stale queue items without failing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "techscope-queue-health-"));
  const staleDir = path.join(root, ".queue", "telegram-intake", "pending");
  mkdirSync(staleDir, { recursive: true });
  writeFileSync(path.join(staleDir, "old.json"), JSON.stringify({
    id: "old",
    status: "pending",
    created_at: "2020-01-01T00:00:00.000Z",
    updated_at: "2020-01-01T00:00:00.000Z",
  }));

  const result = spawnSync("node", ["scripts/queue-health.mjs", "--json", "--stale-days", "1"], {
    cwd: process.cwd(),
    env: { ...process.env, TECHSCOPE_ROOT: root },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, "techscope-queue-health-v1");
  assert.equal(payload.status, "pass");
  assert.equal(payload.stale.length, 1);
  assert.equal(payload.stale[0].id, "old");
});
