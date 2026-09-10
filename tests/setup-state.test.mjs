import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("setup-status reports a missing setup state without failing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "techscope-setup-state-"));
  try {
    const missingState = path.join(dir, ".techscope-setup.json");
    const result = spawnSync("node", ["scripts/setup-status.mjs", "--state", missingState, "--json"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "techscope-setup-state-v1");
    assert.equal(payload.status, "not-configured");
    assert.equal(payload.statePath, missingState);
    assert.equal(payload.modules.harness.status, "configured");
    assert.equal(payload.modules.memory.status, "configured");
    assert.equal(payload.modules.data.status, "configured");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup manifest schema describes the v1 state contract", () => {
  const schema = JSON.parse(readFileSync("setup/manifest.schema.json", "utf8"));
  assert.equal(schema.properties.schema.const, "techscope-setup-state-v1");
  assert.ok(schema.required.includes("sections"));
  assert.ok(schema.properties.status.enum.includes("completed-with-warnings"));
  assert.ok(schema.properties.realtime.properties.tools.properties.codexCli);
  assert.ok(schema.properties.modules.properties.harness);
});
