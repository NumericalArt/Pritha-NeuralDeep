import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadCatalogModule() {
  const source = readFileSync("interfaces/control-center/src/lib/settings/codex-model-catalog.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText.replace('"../../../../../scripts/neuraldeep/model-input-capabilities.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/model-input-capabilities.mjs")).href));
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-model-transport-test-"));
  const modulePath = path.join(tmp, "codex-model-catalog.mjs");
  writeFileSync(modulePath, output, "utf8");
  return { module: await import(pathToFileURL(modulePath).href), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

test("NeuralDeep CLI config omits reasoning controls when a model does not support them", async () => {
  const loaded = await loadCatalogModule();
  try {
    assert.deepEqual(
      loaded.module.codexCliConfigEntries({ model: "chat-only", effort: "none", serviceTier: "standard" }),
      [],
    );
  } finally {
    loaded.cleanup();
  }
});

test("Codex CLI config sends only the model-advertised reasoning effort", async () => {
  const loaded = await loadCatalogModule();
  try {
    assert.deepEqual(
      loaded.module.codexCliConfigEntries({ model: "qwen3.6-35b-a3b", effort: "xhigh", serviceTier: "standard" }),
      ['model_reasoning_effort="xhigh"'],
    );
    assert.deepEqual(
      loaded.module.codexCliConfigEntries({ model: "qwen3.6-35b-a3b", effort: "xhigh", serviceTier: "fast" }),
      ['model_reasoning_effort="xhigh"'],
    );
  } finally {
    loaded.cleanup();
  }
});

test("runtime and API enforce the NeuralDeep catalog-backed Codex CLI contract", () => {
  const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
  const routeSource = readFileSync("interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts", "utf8");
  const runnerSource = readFileSync("scripts/neuraldeep-codex.mjs", "utf8");

  assert.match(runtimeSource, /"qwen3\.6-35b-a3b"/);
  assert.match(runtimeSource, /normalizeCodexReasoningEffortToken\(value, fallback\)/);
  assert.match(runtimeSource, /scripts", "neuraldeep-codex\.mjs"/);
  assert.match(routeSource, /validateCodexSelection/);
  assert.match(routeSource, /error: validation\.error/);
  assert.match(routeSource, /patch\.codexModel = model/);
  assert.match(routeSource, /patch\.codexReasoningEffort = normalizeCodexReasoningEffort\(rawEffort\)/);
  assert.match(routeSource, /patch\.codexServiceTier = serviceTier/);
  assert.match(routeSource, /ultra_requires_inline_execution/);
  assert.ok(routeSource.indexOf("validateCodexSelection(") < routeSource.indexOf("await updatePrithaRuntimeSettings(patch)"));
  assert.match(routeSource, /neuraldeep_codex_cli_required/);
  assert.match(runnerSource, /model_provider = "neuraldeep"/);
  assert.match(runnerSource, /wire_api = "responses"/);
  assert.match(runnerSource, /\^\(\?:OPENAI\|AZURE_OPENAI\|CHATGPT\)_/);
});
