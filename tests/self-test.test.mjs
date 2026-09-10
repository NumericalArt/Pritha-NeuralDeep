import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

test("self-test exposes a dry-run JSON contract without writing baseline", () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-self-test-"));
  let result;
  try {
    result = spawnSync("node", ["scripts/self-test.mjs", "--dry-run", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PRITHA_STATE_ROOT: stateRoot,
        PRITHA_INSTANCE_ID: "self-test",
        PRITHA_CONTROL_CENTER_PORT: "9",
        PRITHA_CONTROL_CENTER_SERVICE_REQUIRED: "0",
      },
    });
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, "techscope-self-test-v1");
  assert.equal(payload.status, "pass");
  assert.equal(payload.dry_run, true);
  assert.equal(payload.quality_gate.profile, "self-test");
});
