import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { requirePrithaInstanceEnv } from "../scripts/lib/env.mjs";

test("requirePrithaInstanceEnv throws when the checkout has no instance pointer or id", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-instance-missing-"));
  const target = {};
  assert.throws(
    () => requirePrithaInstanceEnv({ root, target }),
    (error) => error instanceof Error && error.message === "instance_env_missing",
  );
});

test("requirePrithaInstanceEnv reads .pritha-instance.json into env", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-instance-pointer-"));
  const stateRoot = path.join(root, "state");
  mkdirSync(stateRoot);
  writeFileSync(path.join(root, ".pritha-instance.json"), JSON.stringify({
    schema: "pritha-instance-v1",
    id: "nd-test",
    stateRoot,
    agentParent: path.join(root, "agents"),
    port: 3520,
    keychainService: "pritha-neuraldeep:nd-test",
  }));
  const target = {};
  const loaded = requirePrithaInstanceEnv({ root, target });
  assert.equal(loaded.target.PRITHA_INSTANCE_ID, "nd-test");
  assert.equal(loaded.target.PRITHA_CONTROL_CENTER_PORT, "3520");
  assert.equal(loaded.target.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE, "pritha-neuraldeep:nd-test");
});

test("deliver --dry-run in a clean shell prints the instance id from the pointer", () => {
  // A clean checkout (CI, ZIP) has no pointer, so the test owns a synthetic one.
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-instance-deliver-"));
  const stateRoot = path.join(root, "state");
  mkdirSync(stateRoot);
  writeFileSync(path.join(root, ".pritha-instance.json"), JSON.stringify({
    schema: "pritha-instance-v1",
    id: "nd-deliver-test",
    stateRoot,
    agentParent: path.join(root, "agents"),
    port: 3520,
    keychainService: "pritha-neuraldeep:nd-deliver-test",
  }));
  const pointer = JSON.parse(readFileSync(path.join(root, ".pritha-instance.json"), "utf8"));
  const result = spawnSync(process.execPath, [path.resolve("scripts/pritha.mjs"), "deliver", "--dry-run"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TECHSCOPE_ROOT: root,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, new RegExp(`instanceId: ${pointer.id}`));
});
