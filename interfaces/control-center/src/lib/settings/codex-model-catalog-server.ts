import { spawn } from "node:child_process";
import { declaredModelInputs } from "../../../../../scripts/neuraldeep/model-input-capabilities.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { atomicWritePrivateJson } from "@/lib/private-json";
import {
  FALLBACK_CODEX_MODELS,
  mergeNeuralDeepModelCatalog,
  normalizeNeuralDeepModelList,
  type CodexModelCatalog,
} from "./codex-model-catalog";
import { getNeuralDeepAccountSnapshot } from "./neuraldeep-account-server";

const MODEL_CATALOG_TTL_MS = 5 * 60_000;
const MODEL_REQUEST_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

type NeuralDeepServiceModel = {
  id: string;
  type: string;
  capabilities: { tools: boolean; reasoning: boolean; vision: boolean; streaming: boolean };
  modalities: { input: string[]; output: string[] };
  visionAdvertised: boolean | null;
  toolsAdvertised: boolean | null;
  limit: { context?: number; output?: number };
  region: string | null;
};

type CachedCatalog = {
  version: 1;
  refreshedAt: string;
  models: NeuralDeepServiceModel[];
};

let memoryCache: { expiresAt: number; value: { catalog: CodexModelCatalog; services: CachedCatalog } } | null = null;
let inFlight: Promise<{ catalog: CodexModelCatalog; services: CachedCatalog }> | null = null;

function cachePath() {
  const root = resolveTechscopeRoot();
  return path.join(resolvePrithaStateRoot(root), "codex-chat", "neuraldeep-models-cache.json");
}

function safeToken(value: unknown, max = 192) {
  const token = typeof value === "string" ? value.trim().slice(0, max) : "";
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(token) ? token : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => safeToken(item, 32)).filter(Boolean).slice(0, 12) : [];
}

function sanitizeServiceModels(payload: unknown): NeuralDeepServiceModel[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root?.data) ? root.data : Array.isArray(root?.models) ? root.models : [];
  const seen = new Set<string>();
  const models: NeuralDeepServiceModel[] = [];
  for (const raw of rows.slice(0, 200)) {
    const value = asRecord(raw);
    const id = safeToken(value?.id);
    const type = safeToken(value?.type, 32);
    if (!id || !type || seen.has(`${type}:${id}`)) continue;
    seen.add(`${type}:${id}`);
    const capabilities = asRecord(value?.capabilities) || {};
    const declared = declaredModelInputs(value);
    const modalities = asRecord(value?.modalities) || {};
    const limit = asRecord(value?.limit) || {};
    const context = Number(limit.context);
    const output = Number(limit.output);
    models.push({
      id,
      type,
      capabilities: {
        tools: capabilities.tools === true || value?.tool_call === true,
        reasoning: capabilities.reasoning === true || value?.reasoning === true,
        vision: capabilities.vision === true,
        streaming: capabilities.streaming !== false,
      },
      modalities: {
        input: declared.inputModalities || [],
        output: safeStringList(modalities.output),
      },
      visionAdvertised: declared.visionAdvertised,
      toolsAdvertised: declared.toolsAdvertised,
      limit: {
        ...(Number.isSafeInteger(context) && context > 0 ? { context } : {}),
        ...(Number.isSafeInteger(output) && output > 0 ? { output } : {}),
      },
      region: safeToken(value?.region, 80) || null,
    });
  }
  return models;
}

async function runNeuralDeepCatalogCommand() {
  const root = resolveTechscopeRoot();
  const runner = path.join(root, "scripts", "neuraldeep-codex.mjs");
  const environment: NodeJS.ProcessEnv = { ...process.env, TECHSCOPE_ROOT: root };
  for (const key of Object.keys(environment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
  }
  const child = spawn(process.execPath, [runner, "models"], {
    cwd: root,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let overflow = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (Buffer.byteLength(stdout) + Buffer.byteLength(chunk) > MAX_OUTPUT_BYTES) {
      overflow = true;
      child.kill("SIGKILL");
      return;
    }
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2_000); });
  const timer = setTimeout(() => child.kill("SIGKILL"), MODEL_REQUEST_TIMEOUT_MS);
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timer));
  if (overflow) throw new Error("neuraldeep_model_catalog_too_large");
  if (result.code !== 0) {
    if (/neuraldeep_key_missing/i.test(stderr)) throw new Error("neuraldeep_key_missing");
    throw new Error("neuraldeep_model_catalog_unavailable");
  }
  return JSON.parse(stdout) as unknown;
}

async function readCachedCatalog(): Promise<CachedCatalog | null> {
  try {
    const value = JSON.parse(await readFile(cachePath(), "utf8")) as CachedCatalog;
    if (value.version !== 1 || !Array.isArray(value.models)) return null;
    return { version: 1, refreshedAt: String(value.refreshedAt || new Date(0).toISOString()), models: sanitizeServiceModels({ data: value.models }) };
  } catch {
    return null;
  }
}

async function persistCatalog(value: CachedCatalog) {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  await atomicWritePrivateJson({
    stateRoot,
    filePath: cachePath(),
    resourceKey: "neuraldeep-model-catalog",
    value,
  });
}

function fallbackCatalog(now = new Date()): CodexModelCatalog {
  return {
    source: "fallback",
    refreshedAt: now.toISOString(),
    models: FALLBACK_CODEX_MODELS.map((model) => ({
      ...model,
      capabilities: { ...model.capabilities },
      supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({ ...effort })),
      serviceTiers: [],
    })),
    warning: "NeuralDeep catalog is unavailable and no last-known-good cache exists.",
  };
}

async function loadCatalogBundle(force = false) {
  if (!force && memoryCache && Date.now() < memoryCache.expiresAt) return memoryCache.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const raw = await runNeuralDeepCatalogCommand();
      const models = sanitizeServiceModels(raw);
      const chatModels = normalizeNeuralDeepModelList({ data: models });
      if (!chatModels.length) throw new Error("neuraldeep_chat_catalog_empty");
      const services: CachedCatalog = { version: 1, refreshedAt: new Date().toISOString(), models };
      await persistCatalog(services);
      return {
        services,
        catalog: { source: "neuraldeep" as const, refreshedAt: services.refreshedAt, models: chatModels },
      };
    } catch {
      const services = await readCachedCatalog();
      if (services) {
        const models = normalizeNeuralDeepModelList({ data: services.models });
        if (models.length) {
          return {
            services,
            catalog: {
              source: "cache" as const,
              refreshedAt: services.refreshedAt,
              models,
              warning: "NeuralDeep is temporarily unavailable; showing the last successful catalog.",
            },
          };
        }
      }
      return {
        services: { version: 1 as const, refreshedAt: new Date(0).toISOString(), models: [] },
        catalog: fallbackCatalog(),
      };
    }
  })();
  try {
    const value = await inFlight;
    memoryCache = { expiresAt: Date.now() + MODEL_CATALOG_TTL_MS, value };
    return value;
  } finally {
    inFlight = null;
  }
}

export async function getCodexModelCatalog(options: { force?: boolean } = {}) {
  const [bundle, account] = await Promise.all([
    loadCatalogBundle(options.force),
    getNeuralDeepAccountSnapshot(),
  ]);
  const models = mergeNeuralDeepModelCatalog(bundle.catalog.models, account.walletPrices, {
    mode: account.limits?.billingMode || "unknown",
    tier: account.limits?.tier || null,
  });
  if (!models.length) return bundle.catalog;
  return {
    source: bundle.catalog.source,
    refreshedAt: bundle.services.refreshedAt,
    models,
    ...(bundle.catalog.warning ? { warning: bundle.catalog.warning } : {}),
  } satisfies CodexModelCatalog;
}

export async function getNeuralDeepServiceCatalog() {
  const bundle = await loadCatalogBundle();
  return {
    source: bundle.catalog.source,
    refreshedAt: bundle.services.refreshedAt,
    chat: bundle.services.models.filter((model) => model.type === "chat"),
    embeddings: bundle.services.models.filter((model) => model.type === "embedding"),
    other: bundle.services.models.filter((model) => model.type !== "chat" && model.type !== "embedding"),
    warning: bundle.catalog.warning,
  };
}
