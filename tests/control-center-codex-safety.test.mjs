import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadTsModule(sourcePath, outputName) {
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-safety-test-"));
  const modulePath = path.join(tmp, outputName);
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("Control Center Codex write flag is read-only unless explicitly enabled", async () => {
  const loaded = await loadTsModule("interfaces/control-center/src/lib/realtime/codex-safety.ts", "codex-safety.mjs");
  try {
    const mod = loaded.module;

    assert.equal(mod.codexWriteFlagFromValues("", ""), "0");
    assert.equal(mod.codexWriteFlagFromValues(undefined, undefined), "0");
    assert.equal(mod.codexWriteFlagFromValues("", "1"), "1");
    assert.equal(mod.codexWriteFlagFromValues("workspace_write", "0"), "workspace-write");

    for (const value of ["", "0", "false", "disabled", "read-only", "explicit", "unexpected"]) {
      assert.equal(mod.codexWorkspaceWriteAllowedFromFlag(value), false, `${value} should not allow workspace writes`);
    }

    for (const value of ["1", "true", "yes", "enabled", "enable", "workspace-write", "workspace_write", "write"]) {
      assert.equal(mod.codexWorkspaceWriteAllowedFromFlag(value), true, `${value} should allow workspace writes`);
    }
  } finally {
    loaded.cleanup();
  }
});

test("Control Center Realtime runtime gates every effective workspace-write task", () => {
  const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");

  assert.match(runtimeSource, /codexWriteFlagFromValues\(env\("PRITHA_REALTIME_CODEX_WRITE_ENABLED", ""\), env\("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", ""\)\)/);
  assert.doesNotMatch(runtimeSource, /CODEX_WRITE_ENABLED",\s*"explicit"/);
  assert.match(runtimeSource, /sandbox === "workspace-write"\) reasons\.push\("workspace_write_requested"\)/);
  assert.match(runtimeSource, /reasons\.includes\("workspace_write_requested"\)[\s\S]*\? "workspace_write"/);
  assert.match(runtimeSource, /reasons\.push\("control_center_runtime_change"\)/);
  assert.match(runtimeSource, /reasons\.includes\("control_center_runtime_change"\)[\s\S]*\? "control_center_runtime_change"/);
});

test("Control Center approval decisions create non-duplicating Realtime feedback", () => {
  const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");

  assert.match(runtimeSource, /phase: "approval_approved"/);
  assert.match(runtimeSource, /phase: "approval_rejected"/);
  assert.match(runtimeSource, /priority: "high"/);
  assert.match(runtimeSource, /speakable: false/);
  assert.match(runtimeSource, /Approve получен в UI/);
  assert.match(runtimeSource, /Reject получен в UI/);
});
