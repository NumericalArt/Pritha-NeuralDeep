import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadCatalogModule() {
  const sourcePath = "interfaces/control-center/src/lib/settings/codex-model-catalog.ts";
  const source = readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText.replace('"../../../../../scripts/neuraldeep/model-input-capabilities.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/model-input-capabilities.mjs")).href));
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-model-catalog-test-"));
  const modulePath = path.join(tmp, "codex-model-catalog.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("fallback catalog is a provider-safe NeuralDeep default without a branded allowlist", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    const byId = new Map(mod.FALLBACK_CODEX_MODELS.map((model) => [model.id, model]));
    assert.equal(mod.DEFAULT_CODEX_SELECTION.model, "qwen3.6-35b-a3b");
    assert.equal(mod.DEFAULT_CODEX_SELECTION.effort, "medium");
    assert.equal(mod.DEFAULT_CODEX_SELECTION.serviceTier, "standard");
    assert.deepEqual([...byId.keys()], ["qwen3.6-35b-a3b"]);
    assert.deepEqual(byId.get("qwen3.6-35b-a3b").supportedReasoningEfforts.map((item) => item.id), ["low", "medium", "high", "xhigh"]);
    assert.equal(byId.get("qwen3.6-35b-a3b").provider, "neuraldeep");
    assert.equal(mod.codexReasoningEffortLabel("xhigh"), "Extra High");
    assert.equal(mod.codexModelSupportsFast(byId.get("qwen3.6-35b-a3b")), false);
  } finally {
    loaded.cleanup();
  }
});

test("model/list normalization filters hidden or malformed entries and keeps advertised capabilities", async () => {
  const loaded = await loadCatalogModule();
  try {
    const models = loaded.module.normalizeCodexModelList({
      data: [
        {
          id: "gpt-future",
          displayName: "GPT Future",
          description: "Future model",
          hidden: false,
          supportedReasoningEfforts: [
            { reasoningEffort: "medium", description: "Balanced" },
            { reasoningEffort: "super_deep", description: "Future effort" },
            { reasoningEffort: "medium", description: "Duplicate" },
          ],
          defaultReasoningEffort: "super_deep",
          serviceTiers: [{ id: "priority", name: "Fast", description: "Faster" }],
          isDefault: true,
        },
        {
          id: "hidden-model",
          hidden: true,
          supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
        },
        {
          id: "missing-hidden-flag",
          supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
          defaultReasoningEffort: "medium",
          serviceTiers: [],
        },
        {
          id: "string-hidden-flag",
          hidden: "false",
          supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
          defaultReasoningEffort: "medium",
          serviceTiers: [],
        },
        { id: "bad model id", hidden: false, supportedReasoningEfforts: [{ reasoningEffort: "medium" }] },
        { id: "missing-efforts", hidden: false, supportedReasoningEfforts: [] },
      ],
    });
    assert.equal(models.length, 1);
    assert.equal(models[0].id, "gpt-future");
    assert.equal(models[0].defaultReasoningEffort, "super_deep");
    assert.deepEqual(models[0].supportedReasoningEfforts.map((item) => item.id), ["medium", "super_deep"]);
    assert.deepEqual(models[0].serviceTiers.map((item) => item.id), ["priority"]);
  } finally {
    loaded.cleanup();
  }
});

test("catalog loader caches live and fallback results for the configured TTL", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    let now = 0;
    let liveCalls = 0;
    const livePayload = {
      data: [{
        id: "gpt-live",
        displayName: "GPT Live",
        hidden: false,
        supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }],
        defaultReasoningEffort: "medium",
        serviceTiers: [],
        isDefault: true,
      }],
    };
    const loadLive = mod.createCodexModelCatalogLoader(async () => {
      liveCalls += 1;
      return livePayload;
    }, { ttlMs: 100, now: () => now });

    const [first, concurrent] = await Promise.all([loadLive(), loadLive()]);
    assert.equal(first.source, "neuraldeep");
    assert.equal(concurrent.source, "neuraldeep");
    assert.equal(liveCalls, 1);
    now = 99;
    assert.equal((await loadLive()).refreshedAt, first.refreshedAt);
    assert.equal(liveCalls, 1);
    now = 101;
    await loadLive();
    assert.equal(liveCalls, 2);

    let fallbackCalls = 0;
    const loadFallback = mod.createCodexModelCatalogLoader(async () => {
      fallbackCalls += 1;
      throw new Error("offline");
    }, { ttlMs: 100, now: () => 10 });
    const fallback = await loadFallback();
    assert.equal(fallback.source, "fallback");
    assert.match(fallback.warning, /fallback/i);
    await loadFallback();
    assert.equal(fallbackCalls, 1);
  } finally {
    loaded.cleanup();
  }
});

test("capability reconciliation follows the dynamic NeuralDeep capability record", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    const model = mod.FALLBACK_CODEX_MODELS[0];
    const reconciled = mod.reconcileCodexSelectionForModel(model, {
      model: "another-neuraldeep-model",
      effort: "ultra",
      serviceTier: "fast",
    });
    assert.equal(reconciled.effort, "xhigh");
    assert.equal(reconciled.serviceTier, "standard");
  } finally {
    loaded.cleanup();
  }
});

test("merged NeuralDeep catalog keeps every priced chat model selectable with billing guidance", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    const live = mod.normalizeNeuralDeepModelList({ data: [
      { id: "qwen3.6-35b-a3b", type: "chat", capabilities: { tools: true, reasoning: true, vision: true, streaming: true }, limit: { context: 262144 } },
      { id: "tool-model", type: "chat", capabilities: { tools: true, reasoning: false, streaming: true }, limit: { context: 1000 } },
    ] });
    const prices = [
      { model: "qwen3.6-35b-a3b", billing: "token", inputRubPerMillion: 7, cachedInputRubPerMillion: 0.7, outputRubPerMillion: 40, premium: false, openRouter: false },
      { model: "premium-public-only", billing: "token", inputRubPerMillion: 50, cachedInputRubPerMillion: 5, outputRubPerMillion: 100, premium: true, openRouter: true },
      { model: "embedding-with-zero-output", billing: "token", inputRubPerMillion: 3, outputRubPerMillion: 0 },
    ];
    const subscription = mod.mergeNeuralDeepModelCatalog(live, prices, { mode: "subscription", tier: "free" });
    assert.deepEqual(subscription.map((model) => model.id), ["qwen3.6-35b-a3b", "tool-model", "premium-public-only"]);
    assert.equal(subscription.find((model) => model.id === "qwen3.6-35b-a3b").currentAccess, "included");
    const premium = subscription.find((model) => model.id === "premium-public-only");
    assert.equal(premium.currentAccess, "requires_wallet");
    assert.equal(premium.billingClass, "special");
    assert.equal(premium.capabilitiesKnown, false);
    assert.equal(premium.capabilities.tools, false);
    assert.equal(premium.supportedReasoningEfforts[0].id, "none");
    assert.equal(Object.hasOwn(premium, "disabled"), false);

    const wallet = mod.mergeNeuralDeepModelCatalog(live, prices, { mode: "wallet" });
    assert.equal(wallet.find((model) => model.id === "premium-public-only").currentAccess, "payg");

    const withoutQwen = mod.mergeNeuralDeepModelCatalog(live.filter((model) => model.id !== "qwen3.6-35b-a3b"), prices, { mode: "subscription" });
    assert.equal(withoutQwen.find((model) => model.isDefault).id, "tool-model");
  } finally {
    loaded.cleanup();
  }
});

test("selection validation rejects unsupported combinations but preserves an unchanged custom model", async () => {
  const loaded = await loadCatalogModule();
  try {
    const mod = loaded.module;
    assert.equal(mod.validateCodexSelection({ model: "qwen3.6-35b-a3b", effort: "xhigh", serviceTier: "standard" }, mod.FALLBACK_CODEX_MODELS).ok, true);
    assert.equal(mod.validateCodexSelection({ model: "qwen3.6-35b-a3b", effort: "ultra", serviceTier: "standard" }, mod.FALLBACK_CODEX_MODELS).error, "unsupported_codex_reasoning_effort");
    assert.equal(mod.validateCodexSelection({ model: "qwen3.6-35b-a3b", effort: "xhigh", serviceTier: "fast" }, mod.FALLBACK_CODEX_MODELS).error, "unsupported_codex_service_tier");
    assert.equal(
      mod.validateCodexSelection({ model: "qwen3.6-35b-a3b", effort: "medium", serviceTier: "priority" }, mod.FALLBACK_CODEX_MODELS).error,
      "invalid_codex_service_tier",
    );

    const custom = { model: "company-custom-model", effort: "custom_effort", serviceTier: "fast" };
    assert.deepEqual(mod.validateCodexSelection(custom, mod.FALLBACK_CODEX_MODELS, custom), { ok: true, custom: true });
    assert.equal(
      mod.validateCodexSelection({ ...custom, effort: "medium" }, mod.FALLBACK_CODEX_MODELS, custom).error,
      "unavailable_codex_model",
    );
    assert.equal(mod.normalizeCodexReasoningEffortToken("very_high"), "xhigh");
  } finally {
    loaded.cleanup();
  }
});

test("catalog server uses authenticated NeuralDeep models with bounded cache and sanitized child environment", () => {
  const serverSource = readFileSync("interfaces/control-center/src/lib/settings/codex-model-catalog-server.ts", "utf8");
  const routeSource = readFileSync("interfaces/control-center/src/app/api/settings/codex-models/route.ts", "utf8");
  assert.match(serverSource, /MODEL_REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(serverSource, /MODEL_CATALOG_TTL_MS = 5 \* 60_000/);
  assert.match(serverSource, /\[runner, "models"\]/);
  assert.match(serverSource, /neuraldeep-models-cache\.json/);
  assert.match(serverSource, /sanitizeServiceModels/);
  assert.match(serverSource, /\^\(\?:OPENAI\|AZURE_OPENAI\|CHATGPT\)_/);
  assert.match(serverSource, /model\.type === "embedding"/);
  assert.match(routeSource, /getCodexModelCatalog/);
  assert.match(routeSource, /Cache-Control.*no-store/);
});
