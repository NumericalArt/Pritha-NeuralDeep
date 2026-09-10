import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadVoiceSettingsModule() {
  const sourcePath = path.resolve("interfaces/control-center/src/lib/realtime/voice-settings.ts");
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-voice-settings-test-"));
  const modulePath = path.join(tmp, "voice-settings.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("Control Center voice settings normalize behavior profile and Pritha voice", async () => {
  const loaded = await loadVoiceSettingsModule();
  try {
    const mod = loaded.module;
    assert.equal(mod.normalizeVoiceBehaviorProfile("beginner"), "beginner");
    assert.equal(mod.normalizeVoiceBehaviorProfile("expert"), "expert");
    assert.equal(mod.normalizeVoiceBehaviorProfile("unsupported"), "advanced");
    assert.equal(mod.normalizePrithaVoice("marin"), "marin");
    assert.equal(mod.normalizePrithaVoice("cedar"), "marin");
    assert.equal(mod.isPrithaVoiceId("echo"), false);
    assert.equal(mod.isPrithaVoiceId("shimmer"), true);
  } finally {
    loaded.cleanup();
  }
});

test("Control Center voice behavior prompt covers depth override, feminine grammar and spoken-output hygiene", async () => {
  const loaded = await loadVoiceSettingsModule();
  try {
    const mod = loaded.module;
    const beginner = mod.buildVoiceBehaviorPromptSections("beginner");
    const expert = mod.buildVoiceBehaviorPromptSections("expert");
    assert.match(beginner, /Default mode: beginner/);
    assert.match(beginner, /Translate Codex, runtime and programming terms into ordinary concepts/);
    assert.match(expert, /Default mode: expert/);
    assert.match(expert, /runtime, sandbox, tool schema, Codex transport, memory index, approval gate/);
    assert.match(expert, /feminine grammatical self-reference/);
    assert.match(expert, /Do not read long file paths, shell commands, JSON, stack traces or code aloud/);
    assert.match(expert, /saved behavior profile is the default, not a hard lock/);
  } finally {
    loaded.cleanup();
  }
});

test("Control Center Realtime runtime uses behavior settings in instructions and selected Pritha voice in session config", () => {
  const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
  const routeSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");

  assert.match(runtimeSource, /buildVoiceBehaviorPromptSections\(settings\.voiceBehaviorProfile\)/);
  assert.match(runtimeSource, /voice:\s*runtimeSettings\.prithaVoice/);
  assert.match(routeSource, /invalid_voice_behavior_profile/);
  assert.match(routeSource, /invalid_pritha_voice/);
});
