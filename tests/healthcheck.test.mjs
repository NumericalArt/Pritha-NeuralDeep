import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

test("healthcheck skips launchd plist lint on non-macOS runners", (t) => {
  const state = mkdtempSync(path.join(os.tmpdir(), "pritha-healthcheck-test-"));
  t.after(() => rmSync(state, { recursive: true, force: true }));
  const environment = { ...process.env, PRITHA_STATE_ROOT: state, TECHSCOPE_ROOT: process.cwd(), PRITHA_AGENT_PARENT: path.join(state, "agents") };
  const index = spawnSync("node", ["scripts/rebuild-memory.mjs"], { encoding: "utf8", env: environment, timeout: 180000 });
  assert.equal(index.status, 0, index.stderr || index.stdout);
  const result = spawnSync("node", ["scripts/healthcheck.mjs"], {
    encoding: "utf8",
    env: {
      ...environment,
      TECHSCOPE_HEALTHCHECK_PLATFORM: "linux",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS plutil launchd\/com\.techscope\.web\.plist: skipped on linux/);
  assert.match(result.stdout, /PASS plutil launchd\/com\.techscope\.telegram-bot\.plist: skipped on linux/);
});
