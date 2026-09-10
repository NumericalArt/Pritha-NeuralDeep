import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";

function generatedFile(files, relPath) {
  const file = files.find((entry) => entry.path === relPath);
  assert.ok(file, `${relPath} should be generated`);
  return file.content;
}

function generatedManifest(data) {
  const files = generatedAgentFiles({
    agentName: "Healthcheck Test Agent",
    text: "",
    runtimeFamily: "codex-native",
    primaryMission: "Test healthcheck argv generation.",
    primaryInterface: "Codex project",
    telegramMode: "none",
    serviceMode: "launchd",
    autostart: "launchd-on-approval",
    ...data,
  });
  return {
    manifest: JSON.parse(generatedFile(files, "operations/manifest.json")),
    deployService: generatedFile(files, "scripts/deploy-service.mjs"),
  };
}

function runHealthcheckSource(deployService) {
  const start = deployService.indexOf("function runHealthcheck()");
  const end = deployService.indexOf('if (command === "plan")', start);
  assert.notEqual(start, -1, "deploy-service should define runHealthcheck");
  assert.notEqual(end, -1, "runHealthcheck boundary should be stable");
  return deployService.slice(start, end);
}

test("generated operations manifest stores executable healthcheck as argv", () => {
  const { manifest } = generatedManifest({ healthcheckCommand: "node scripts/healthcheck.mjs" });
  assert.equal(manifest.healthcheck_command, "node scripts/healthcheck.mjs");
  assert.deepEqual(manifest.healthcheck_argv, ["node", "scripts/healthcheck.mjs"]);
  assert.equal(manifest.healthcheck_command_executable, true);
});

test("generated healthcheck argv canonicalizes shell-shaped contract strings", () => {
  const { manifest } = generatedManifest({ healthcheckCommand: "node scripts/smoke-test.mjs; rm -rf /" });
  assert.equal(manifest.healthcheck_command, "node scripts/healthcheck.mjs");
  assert.equal(manifest.requested_healthcheck_command, "node scripts/smoke-test.mjs; rm -rf /");
  assert.deepEqual(manifest.healthcheck_argv, ["node", "scripts/healthcheck.mjs"]);
  assert.equal(manifest.healthcheck_command_executable, true);
});

test("generated deploy-service healthcheck does not invoke a shell", () => {
  const { deployService } = generatedManifest({ healthcheckCommand: "node scripts/smoke-test.mjs" });
  const runHealthcheck = runHealthcheckSource(deployService);

  assert.match(runHealthcheck, /healthcheckArgv\(\)/);
  assert.match(runHealthcheck, /run\(argv\[0\], argv\.slice\(1\)/);
  assert.match(runHealthcheck, /No healthcheck_argv \(array\)/);
  assert.doesNotMatch(runHealthcheck, /\/bin\/sh/);
  assert.doesNotMatch(runHealthcheck, /"-lc"/);
});

test("scaffold source marks legacy healthcheck_command as non-executable", () => {
  const source = readFileSync("scripts/agents-mother/scaffold/index.mjs", "utf8");
  assert.match(source, /SHELL_COMMAND_META_PATTERN/);
  assert.match(source, /healthcheck_argv: operationProfile\.healthcheckArgv/);
  assert.match(source, /healthcheck_command_executable: operationProfile\.healthcheckArgv\.length > 0/);
  assert.doesNotMatch(source, /run\("\/bin\/sh", \["-lc", manifest\.healthcheck_command\]/);
});
