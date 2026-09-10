import { declaredModelInputs } from "../../../../../scripts/neuraldeep/model-input-capabilities.mjs";
export type CodexServiceTier = "standard" | "fast";
export type CodexReasoningEffort = string;

export type CodexReasoningEffortOption = {
  id: CodexReasoningEffort;
  label: string;
  description: string;
};

export type CodexModelServiceTier = {
  id: string;
  name: string;
  description: string;
};

export type CodexModelCatalogItem = {
  id: string;
  label: string;
  description: string;
  isDefault: boolean;
  provider: "neuraldeep";
  modelType: "chat";
  capabilities: {
    tools: boolean;
    reasoning: boolean;
    vision: boolean;
    streaming: boolean;
  };
  contextWindow: number | null;
  outputLimit: number | null;
  region: string | null;
  capabilitiesKnown: boolean;
  inputModalities?: string[] | null;
  visionAdvertised?: boolean | null;
  toolsAdvertised?: boolean | null;
  catalogPresence: "key_and_pricing" | "key" | "pricing";
  billingClass: "subscription" | "wallet" | "special" | "unknown";
  currentAccess: "included" | "payg" | "requires_wallet" | "requires_plan" | "unknown";
  walletPricing: null | {
    inputRubPerMillion: number | null;
    cachedInputRubPerMillion: number | null;
    outputRubPerMillion: number | null;
    premium: boolean;
    openRouter: boolean;
  };
  defaultReasoningEffort: CodexReasoningEffort;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
  serviceTiers: CodexModelServiceTier[];
};

export type CodexModelCatalog = {
  source: "neuraldeep" | "cache" | "fallback";
  refreshedAt: string;
  models: CodexModelCatalogItem[];
  warning?: string;
};

export type CodexSelection = {
  model: string;
  effort: CodexReasoningEffort;
  serviceTier: CodexServiceTier;
};

export const DEFAULT_CODEX_SELECTION: CodexSelection = {
  model: "qwen3.6-35b-a3b",
  effort: "medium",
  serviceTier: "standard",
};

export const CODEX_REASONING_EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;

const EFFORT_LABELS: Record<string, string> = {
  none: "Not applicable",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

const EFFORT_DESCRIPTIONS: Record<string, string> = {
  low: "Faster answers with light reasoning.",
  medium: "Balanced reasoning for everyday work.",
  high: "More reasoning for complex tasks.",
  xhigh: "Extra-high reasoning for difficult tasks.",
  max: "Maximum single-agent reasoning.",
  ultra: "Maximum reasoning with automatic task delegation.",
};

const SAFE_EFFORT_TOKEN = /^[a-z][a-z0-9_-]{0,31}$/;
const SAFE_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const SAFE_SERVICE_TIER_ID = /^[a-z][a-z0-9_-]{0,31}$/;

function text(value: unknown, maxLength = 400) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function isSafeCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === "string" && SAFE_EFFORT_TOKEN.test(value);
}

export function normalizeCodexReasoningEffortToken(value: unknown, fallback: CodexReasoningEffort = "medium") {
  if (value === "very_high") return "xhigh";
  return isSafeCodexReasoningEffort(value) ? value : fallback;
}

export function codexReasoningEffortLabel(effort: string) {
  if (EFFORT_LABELS[effort]) return EFFORT_LABELS[effort];
  return effort
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Custom";
}

function fallbackEffort(id: string): CodexReasoningEffortOption {
  return {
    id,
    label: codexReasoningEffortLabel(id),
    description: EFFORT_DESCRIPTIONS[id] || "Model-advertised reasoning effort.",
  };
}

const LOW_TO_XHIGH = CODEX_REASONING_EFFORT_ORDER.slice(0, 4).map(fallbackEffort);
const LOW_TO_MAX = CODEX_REASONING_EFFORT_ORDER.slice(0, 5).map(fallbackEffort);
const LOW_TO_ULTRA = CODEX_REASONING_EFFORT_ORDER.map(fallbackEffort);
const FAST_TIER: CodexModelServiceTier[] = [
  {
    id: "priority",
    name: "Fast",
    description: "About 1.5x faster with increased Codex usage.",
  },
];

function fallbackModel(
  id: string,
  label: string,
  description: string,
  efforts: CodexReasoningEffortOption[],
  fast: boolean,
  isDefault = false,
): CodexModelCatalogItem {
  return {
    id,
    label,
    description,
    isDefault,
    provider: "neuraldeep",
    modelType: "chat",
    capabilities: { tools: true, reasoning: true, vision: false, streaming: true },
    contextWindow: null,
    outputLimit: null,
    region: null,
    capabilitiesKnown: false,
    catalogPresence: "key",
    billingClass: "unknown",
    currentAccess: "unknown",
    walletPricing: null,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: efforts.map((effort) => ({ ...effort })),
    serviceTiers: fast ? FAST_TIER.map((tier) => ({ ...tier })) : [],
  };
}

export const FALLBACK_CODEX_MODELS: CodexModelCatalogItem[] = [
  fallbackModel("qwen3.6-35b-a3b", "Qwen 3.6 35B A3B", "Configured NeuralDeep default; live catalog is temporarily unavailable.", LOW_TO_XHIGH, false, true),
];

export function fallbackCodexModelCatalog(now = new Date()): CodexModelCatalog {
  return {
    source: "fallback",
    refreshedAt: now.toISOString(),
    models: FALLBACK_CODEX_MODELS.map((model) => ({
      ...model,
      supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({ ...effort })),
      serviceTiers: model.serviceTiers.map((tier) => ({ ...tier })),
    })),
    warning: "Live Codex catalog unavailable; built-in fallback is active.",
  };
}

export function normalizeCodexModelList(payload: unknown): CodexModelCatalogItem[] {
  const root = record(payload);
  const rawModels = Array.isArray(root?.data) ? root.data : [];
  const models: CodexModelCatalogItem[] = [];

  for (const rawModel of rawModels.slice(0, 100)) {
    const value = record(rawModel);
    if (!value || value.hidden !== false) continue;
    const id = text(value.id || value.model, 128);
    if (!SAFE_MODEL_ID.test(id)) continue;

    const effortRows = Array.isArray(value.supportedReasoningEfforts) ? value.supportedReasoningEfforts : [];
    const supportedReasoningEfforts = uniqueById(
      effortRows
        .map((row) => record(row))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => {
          const effort = normalizeCodexReasoningEffortToken(row.reasoningEffort, "");
          if (!isSafeCodexReasoningEffort(effort)) return null;
          return {
            id: effort,
            label: codexReasoningEffortLabel(effort),
            description: text(row.description) || EFFORT_DESCRIPTIONS[effort] || "Model-advertised reasoning effort.",
          };
        })
        .filter((row): row is CodexReasoningEffortOption => Boolean(row)),
    );
    if (!supportedReasoningEfforts.length) continue;

    const tierRows = Array.isArray(value.serviceTiers) ? value.serviceTiers : [];
    const serviceTiers = uniqueById(
      tierRows
        .map((row) => record(row))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => {
          const tierId = text(row.id, 32).toLowerCase();
          if (!SAFE_SERVICE_TIER_ID.test(tierId)) return null;
          return {
            id: tierId,
            name: text(row.name, 80) || tierId,
            description: text(row.description) || "Model-advertised service tier.",
          };
        })
        .filter((row): row is CodexModelServiceTier => Boolean(row)),
    );

    const advertisedDefault = normalizeCodexReasoningEffortToken(value.defaultReasoningEffort, "");
    const defaultReasoningEffort = supportedReasoningEfforts.some((effort) => effort.id === advertisedDefault)
      ? advertisedDefault
      : supportedReasoningEfforts.find((effort) => effort.id === "medium")?.id || supportedReasoningEfforts[0].id;

    models.push({
      id,
      label: text(value.displayName, 120) || id,
      description: text(value.description) || "Available from the local Codex catalog.",
      isDefault: value.isDefault === true,
      provider: "neuraldeep",
      modelType: "chat",
      capabilities: { tools: true, reasoning: true, vision: false, streaming: true },
      contextWindow: null,
      outputLimit: null,
      region: null,
      capabilitiesKnown: true,
      catalogPresence: "key",
      billingClass: "unknown",
      currentAccess: "unknown",
      walletPricing: null,
      defaultReasoningEffort,
      supportedReasoningEfforts,
      serviceTiers,
    });
  }

  return uniqueById(models);
}

export function normalizeNeuralDeepModelList(payload: unknown): CodexModelCatalogItem[] {
  const root = record(payload);
  const rawModels = Array.isArray(root?.data) ? root.data : Array.isArray(root?.models) ? root.models : [];
  const models: CodexModelCatalogItem[] = [];

  for (const rawModel of rawModels.slice(0, 200)) {
    const value = record(rawModel);
    if (!value || text(value.type, 32) !== "chat") continue;
    const id = text(value.id, 192);
    if (!SAFE_MODEL_ID.test(id)) continue;
    const advertised = record(value.capabilities) || {};
    const { inputModalities, visionAdvertised, toolsAdvertised } = declaredModelInputs(value);
    const limits = record(value.limit) || {};
    const reasoning = advertised.reasoning === true || value.reasoning === true;
    const tools = advertised.tools === true || value.tool_call === true;
    const vision = advertised.vision === true;
    const streaming = advertised.streaming !== false;
    const supportedReasoningEfforts = reasoning
      ? LOW_TO_XHIGH.map((effort) => ({ ...effort }))
      : [{ id: "none", label: "Not applicable", description: "This model does not advertise reasoning controls." }];
    const contextWindowValue = Number(limits.context);
    const contextWindow = Number.isSafeInteger(contextWindowValue) && contextWindowValue > 0 ? contextWindowValue : null;
    const outputLimitValue = Number(limits.output);
    const outputLimit = Number.isSafeInteger(outputLimitValue) && outputLimitValue > 0 ? outputLimitValue : null;
    const capabilityLabels = [tools ? "tools" : "chat only", reasoning ? "reasoning" : "no reasoning control", vision ? "vision" : null]
      .filter(Boolean)
      .join(", ");
    models.push({
      id,
      label: text(value.name || value.display_name, 120) || id,
      description: `${capabilityLabels}${contextWindow ? ` · ${contextWindow.toLocaleString("en-US")} context` : ""}`,
      isDefault: id === DEFAULT_CODEX_SELECTION.model,
      provider: "neuraldeep",
      modelType: "chat",
      capabilities: { tools, reasoning, vision, streaming },
      inputModalities,
      visionAdvertised,
      toolsAdvertised,
      contextWindow,
      outputLimit,
      region: text(value.region, 80) || null,
      capabilitiesKnown: true,
      catalogPresence: "key",
      billingClass: "unknown",
      currentAccess: "unknown",
      walletPricing: null,
      defaultReasoningEffort: reasoning ? "medium" : "none",
      supportedReasoningEfforts,
      serviceTiers: [],
    });
  }

  return uniqueById(models);
}

type WalletPriceInput = {
  model: string;
  billing?: string;
  inputRubPerMillion?: number | null;
  cachedInputRubPerMillion?: number | null;
  outputRubPerMillion?: number | null;
  premium?: boolean;
  openRouter?: boolean;
};

type ModelBillingContext = {
  mode?: "subscription" | "wallet" | "unknown";
  tier?: string | null;
};

function positiveMoney(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

/** Merge confirmed key capabilities with the complete public token-price list. */
export function mergeNeuralDeepModelCatalog(
  liveModels: CodexModelCatalogItem[],
  priceRows: WalletPriceInput[],
  account: ModelBillingContext = {},
) {
  const live = new Map(liveModels.map((model) => [model.id, model]));
  const prices = new Map(
    priceRows
      .filter((row) => row?.billing === "token" && Number(row.outputRubPerMillion) > 0 && SAFE_MODEL_ID.test(String(row.model || "")))
      .map((row) => [row.model, row]),
  );
  const ids = uniqueById([
    ...liveModels.map((model) => ({ id: model.id })),
    ...[...prices.keys()].map((id) => ({ id })),
  ]).map((item) => item.id);
  const mode = account.mode || "unknown";
  const merged = ids.map((id) => {
    const confirmed = live.get(id) || null;
    const keyConfirmed = confirmed?.capabilitiesKnown === true;
    const price = prices.get(id) || null;
    const special = price?.premium === true || price?.openRouter === true;
    const catalogPresence = keyConfirmed && price ? "key_and_pricing" : keyConfirmed ? "key" : price ? "pricing" : "key";
    const currentAccess = keyConfirmed
      ? mode === "subscription" ? "included" : mode === "wallet" ? "payg" : "unknown"
      : price
        ? mode === "wallet" ? "payg" : mode === "subscription" ? special ? "requires_wallet" : "requires_plan" : "unknown"
        : "unknown";
    const billingClass = special
      ? "special"
      : keyConfirmed && mode === "subscription"
        ? "subscription"
        : price
          ? "wallet"
          : "unknown";
    const base: CodexModelCatalogItem = confirmed || {
      id,
      label: id,
      description: "Listed in NeuralDeep public token pricing; capabilities are not confirmed for the current API key.",
      isDefault: false,
      provider: "neuraldeep",
      modelType: "chat",
      capabilities: { tools: false, reasoning: false, vision: false, streaming: true },
      contextWindow: null,
      outputLimit: null,
      region: null,
      capabilitiesKnown: false,
      catalogPresence: "pricing",
      billingClass: "unknown",
      currentAccess: "unknown",
      walletPricing: null,
      defaultReasoningEffort: "none",
      supportedReasoningEfforts: [{ id: "none", label: "Not applicable", description: "Capabilities are not confirmed for the current API key." }],
      serviceTiers: [],
    };
    return {
      ...base,
      isDefault: false,
      catalogPresence,
      billingClass,
      currentAccess,
      walletPricing: price ? {
        inputRubPerMillion: positiveMoney(price.inputRubPerMillion),
        cachedInputRubPerMillion: positiveMoney(price.cachedInputRubPerMillion),
        outputRubPerMillion: positiveMoney(price.outputRubPerMillion),
        premium: price.premium === true,
        openRouter: price.openRouter === true,
      } : null,
    } satisfies CodexModelCatalogItem;
  });
  const preferred = merged.find((model) => model.id === DEFAULT_CODEX_SELECTION.model && model.capabilitiesKnown)
    || merged.find((model) => model.capabilitiesKnown && model.capabilities.tools && model.walletPricing?.premium !== true)
    || merged.find((model) => model.capabilitiesKnown)
    || merged.find((model) => model.id === DEFAULT_CODEX_SELECTION.model)
    || merged[0];
  return merged.map((model) => ({ ...model, isDefault: model.id === preferred?.id }));
}

export function codexModelSupportsEffort(model: CodexModelCatalogItem, effort: string) {
  return model.supportedReasoningEfforts.some((option) => option.id === effort);
}

export function codexModelSupportsFast(model: CodexModelCatalogItem) {
  return model.serviceTiers.some((tier) => tier.id === "priority" || tier.id === "fast");
}

export function closestSupportedCodexReasoningEffort(model: CodexModelCatalogItem, effort: string) {
  if (codexModelSupportsEffort(model, effort)) return effort;
  const requestedIndex = CODEX_REASONING_EFFORT_ORDER.indexOf(effort as (typeof CODEX_REASONING_EFFORT_ORDER)[number]);
  if (requestedIndex >= 0) {
    for (let index = requestedIndex - 1; index >= 0; index -= 1) {
      const candidate = CODEX_REASONING_EFFORT_ORDER[index];
      if (codexModelSupportsEffort(model, candidate)) return candidate;
    }
  }
  return model.defaultReasoningEffort;
}

export function reconcileCodexSelectionForModel(model: CodexModelCatalogItem, selection: CodexSelection) {
  const effort = closestSupportedCodexReasoningEffort(model, selection.effort);
  const serviceTier: CodexServiceTier = selection.serviceTier === "fast" && !codexModelSupportsFast(model) ? "standard" : selection.serviceTier;
  return {
    model: model.id,
    effort,
    serviceTier,
    effortChanged: effort !== selection.effort,
    serviceTierChanged: serviceTier !== selection.serviceTier,
  };
}

export function validateCodexSelection(selection: CodexSelection, models: CodexModelCatalogItem[], current?: CodexSelection) {
  if (selection.serviceTier !== "standard" && selection.serviceTier !== "fast") {
    return { ok: false as const, error: "invalid_codex_service_tier" as const };
  }
  const model = models.find((item) => item.id === selection.model);
  if (!model) {
    const unchangedCustom = Boolean(
      current
      && selection.model === current.model
      && selection.effort === current.effort
      && selection.serviceTier === current.serviceTier,
    );
    return unchangedCustom
      ? { ok: true as const, custom: true as const }
      : { ok: false as const, error: "unavailable_codex_model" as const };
  }
  if (!isSafeCodexReasoningEffort(selection.effort) || !codexModelSupportsEffort(model, selection.effort)) {
    return { ok: false as const, error: "unsupported_codex_reasoning_effort" as const };
  }
  if (selection.serviceTier === "fast" && !codexModelSupportsFast(model)) {
    return { ok: false as const, error: "unsupported_codex_service_tier" as const };
  }
  return { ok: true as const, custom: false as const };
}

export function codexCliServiceTier(serviceTier: CodexServiceTier) {
  return serviceTier === "fast" ? "fast" : "default";
}

export function codexCliConfigEntries(selection: CodexSelection) {
  return selection.effort === "none" ? [] : [`model_reasoning_effort="${selection.effort}"`];
}

export function createCodexModelCatalogLoader(
  fetchLiveCatalog: () => Promise<unknown>,
  options: { ttlMs?: number; now?: () => number; fallbackModels?: CodexModelCatalogItem[] } = {},
) {
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  const fallbackModels = options.fallbackModels ?? FALLBACK_CODEX_MODELS;
  let cached: { expiresAt: number; value: CodexModelCatalog } | null = null;
  let inFlight: Promise<CodexModelCatalog> | null = null;

  return async function loadCodexModelCatalog() {
    const currentTime = now();
    if (cached && currentTime < cached.expiresAt) return cached.value;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      let value: CodexModelCatalog;
      try {
        const models = normalizeCodexModelList(await fetchLiveCatalog());
        if (!models.length) throw new Error("empty_codex_model_catalog");
        value = {
          source: "neuraldeep",
          refreshedAt: new Date(now()).toISOString(),
          models,
        };
      } catch {
        value = {
          source: "fallback",
          refreshedAt: new Date(now()).toISOString(),
          models: fallbackModels.map((model) => ({
            ...model,
            supportedReasoningEfforts: model.supportedReasoningEfforts.map((effort) => ({ ...effort })),
            serviceTiers: model.serviceTiers.map((tier) => ({ ...tier })),
          })),
          warning: "Live Codex catalog unavailable; built-in fallback is active.",
        };
      }
      cached = { expiresAt: now() + ttlMs, value };
      return value;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
}
