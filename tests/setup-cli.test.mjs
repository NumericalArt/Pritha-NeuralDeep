import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runSetup(dir) {
  return spawnSync(
    "node",
    [
      "scripts/setup.mjs",
      "--non-interactive",
      "--config",
      "tests/fixtures/setup-minimal.json",
      "--state",
      path.join(dir, ".techscope-setup.json"),
      "--env",
      path.join(dir, ".env.local"),
      "--skip-quality",
      "--json",
    ],
    { encoding: "utf8" },
  );
}

function runSetupWithConfig(dir, config) {
  const configPath = path.join(dir, "setup-config.json");
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return spawnSync(
    "node",
    [
      "scripts/setup.mjs",
      "--non-interactive",
      "--config",
      configPath,
      "--state",
      path.join(dir, ".techscope-setup.json"),
      "--env",
      path.join(dir, ".env.local"),
      "--skip-quality",
      "--json",
    ],
    { encoding: "utf8" },
  );
}

test("setup CLI writes private env and idempotent state", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "techscope-setup-cli-"));
  try {
    const first = runSetup(dir);
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstPayload = JSON.parse(first.stdout);
    assert.equal(firstPayload.schema, "techscope-setup-state-v1");
    assert.equal(firstPayload.status, "completed");
    assert.equal(firstPayload.sections.codex.status, "configured");
    assert.equal(firstPayload.modules.harness.status, "configured");
    assert.equal(firstPayload.sections["module.harness"].status, "configured");

    const envPath = path.join(dir, ".env.local");
    assert.match(readFileSync(envPath, "utf8"), /^TECHSCOPE_ROOT=/m);
    assert.equal((statSync(envPath).mode & 0o777), 0o600);

    const second = runSetup(dir);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondPayload = JSON.parse(second.stdout);
    assert.equal(secondPayload.status, "completed");
    assert.equal(existsSync(`${envPath}.bak`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup CLI configures default realtime tools when voice is selected", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "techscope-setup-realtime-"));
  try {
    const result = runSetupWithConfig(dir, {
      interfaces: {
        realtime: true,
      },
      realtime: {
        mode: "push-to-talk",
        confirmedCostPrivacy: true,
      },
      qualityGate: false,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.ok(["completed", "completed-with-warnings"].includes(payload.status));
    assert.equal(payload.realtime.enabled, true);
    assert.equal(payload.realtime.mode, "push-to-talk");
    assert.deepEqual(payload.realtime.tools, {
      internet: true,
      memory: true,
      codexCli: true,
    });
    assert.equal(payload.sections["realtime.tool.internet"].status, "configured");
    assert.equal(payload.sections["realtime.tool.memory"].status, "configured");
    assert.ok(["configured", "failed"].includes(payload.sections["realtime.tool.codexCli"].status));
    assert.match(readFileSync(path.join(dir, ".env.local"), "utf8"), /^TECHSCOPE_REALTIME_TOOLS=internet,memory,codex-cli$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
