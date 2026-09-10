import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generatedAgentFiles } from "../scripts/agents-mother/scaffold/index.mjs";

const minimal = { text: "", coreFunctions: [], criticalWorkflows: [], agentName: "Module fixture", memoryModel: "none", toolSystem: "none", skillNeeds: "none", untrustedInputPolicy: "none", telegramMode: "none", serviceMode: "none", proactiveMode: "none", autostart: "disabled" };
for (const adapter of [{ runtimeFamily: "cli", primaryInterface: "CLI" }, { runtimeFamily: "api", primaryInterface: "web", serviceMode: "process" }, { runtimeFamily: "codex-native", primaryInterface: "Codex project" }]) {
  test(`explicit module opt-outs produce a runnable ${adapter.runtimeFamily} scaffold`, t => {
    const files = generatedAgentFiles({ ...minimal, ...adapter });
    const root = mkdtempSync(path.join(os.tmpdir(), "pritha-modules-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const file of files) {
      assert.doesNotMatch(file.path, /^(memory|skills|tools)\/|^scripts\/(memory-status|skills-status|tools-status|redaction)\.mjs$/);
      assert.doesNotMatch(file.content, /scripts\/(memory|skills|tools)-status\.mjs|(?:memory|skills|tools)\/manifest\.json/);
      const target = path.join(root, file.path); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, file.content);
    }
    for (const command of ["smoke-test", "healthcheck"]) {
      const result = spawnSync(process.execPath, [`scripts/${command}.mjs`], { cwd: root, encoding: "utf8", timeout: 10000, killSignal: "SIGKILL" });
      assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const tests = spawnSync("npm", ["test"], { cwd: root, env, encoding: "utf8", timeout: 30000, killSignal: "SIGKILL" });
    if (adapter.runtimeFamily === "api") {
      assert.notEqual(tests.status, 0);
      assert.match(tests.stdout + tests.stderr, /implementation-required/);
    } else assert.equal(tests.status, 0, tests.stdout + tests.stderr);
    assert.equal(generatedAgentFiles({ ...minimal, ...adapter, memoryModel: "ephemeral", indexingSearchNeeds: "no SQLite/embeddings" }).some(file => file.path.startsWith("memory/")), false);
  });
}

test("Telegram and untrusted intake retain redaction even when a policy says none", () => {
  for (const patch of [{ telegramMode: "polling" }, { inputDataTypes: "untrusted intake" }, { untrustedInputPolicy: "quarantine" }]) {
    const files = generatedAgentFiles({ ...minimal, runtimeFamily: "codex-native", primaryInterface: "Codex project", ...patch });
    assert.ok(files.some(file => file.path === "scripts/redaction.mjs"));
  }
});
