import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { atomicWriteFile, withFileLock } from "../lib/atomic-file.mjs";
import { classifyNeuralDeepProviderError } from "./provider-error.mjs";

export const LIMITS_TTL_MS = 30_000;
export const PUBLIC_ACCOUNT_TTL_MS = 5 * 60_000;
const DEFAULT_API_ORIGIN = "https://api.neuraldeep.ru";
const DEFAULT_PUBLIC_ORIGIN = "https://neuraldeep.ru";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_PUBLIC_ROWS = 500;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;
const PUBLIC_RESOURCES = Object.freeze({
  walletPrices: { pathname: "/api/public/wallet-prices", normalize: normalizeWalletPrices },
  tierLimits: { pathname: "/api/public/tier-limits", normalize: normalizeTierLimits },
  freeTier: { pathname: "/api/public/free-tier", normalize: normalizeFreeTier },
  paymentsStatus: { pathname: "/api/public/payments-status", normalize: normalizePaymentsStatus },
});

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function string(value, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

function token(value, max = 192) {
  const candidate = string(value, max) || "";
  return SAFE_TOKEN.test(candidate) ? candidate : null;
}

function number(value, { minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY } = {}) {
  if (value == null || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= minimum && result <= maximum ? result : null;
}

function integer(value, options = {}) {
  const result = number(value, options);
  return Number.isSafeInteger(result) ? result : null;
}

function isoDate(value) {
  const candidate = string(value, 80);
  if (!candidate || !Number.isFinite(Date.parse(candidate))) return null;
  return new Date(candidate).toISOString();
}

function safeQuota(value) {
  const source = record(value);
  return {
    used: number(source.used, { minimum: 0 }),
    limit: number(source.limit, { minimum: 0 }),
    remaining: number(source.remaining, { minimum: 0 }),
    resetInSec: number(source.reset_in_sec, { minimum: 0 }),
    resetsAt: isoDate(source.resets_at),
    window: token(source.window, 48),
  };
}

function safeDecision(value) {
  const source = record(value);
  const blockers = Array.isArray(source.blockers) ? source.blockers : [];
  return {
    scope: token(source.scope, 48) || "chat",
    canRequest: source.can_request !== false,
    retryAfterSec: number(source.retry_after_sec, { minimum: 0 }),
    blockerCount: blockers.length,
    blockerCodes: blockers
      .map((item) => token(record(item).code || item, 80))
      .filter(Boolean)
      .slice(0, 20),
  };
}

function safeWallet(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = record(value);
  return {
    enabled: source.enabled !== false,
    balanceRub: number(source.balance_rub ?? source.balance ?? source.amount_rub),
    reservedRub: number(source.reserved_rub, { minimum: 0 }),
    spentRub: number(source.spent_rub ?? source.spent, { minimum: 0 }),
    currency: token(source.currency, 12) || "RUB",
    status: token(source.status, 48),
  };
}

function safeAllowances(value) {
  if (value == null) return null;
  const rows = Array.isArray(value) ? value : Object.entries(record(value)).map(([name, details]) => ({ name, ...record(details) }));
  return rows.slice(0, 50).map((raw) => {
    const source = record(raw);
    return {
      name: token(source.name || source.id || source.model, 96),
      used: number(source.used, { minimum: 0 }),
      limit: number(source.limit, { minimum: 0 }),
      remaining: number(source.remaining, { minimum: 0 }),
      resetsAt: isoDate(source.resets_at),
      active: source.active !== false,
    };
  }).filter((item) => item.name);
}

export function sanitizeNeuralDeepLimits(payload) {
  const source = record(payload);
  const key = record(source.key);
  const chat = record(source.chat);
  const vector = record(source.vector);
  const night = record(source.night);
  const daily = record(source.daily_capacity);
  return {
    schema: "pritha-neuraldeep-limits-v1",
    providerSchema: integer(source.schema, { minimum: 0 }),
    tier: token(source.tier, 80),
    tierExpiresAt: isoDate(source.tier_expires_at),
    billingMode: ["subscription", "wallet"].includes(String(key.billing_mode)) ? key.billing_mode : "unknown",
    keyStatus: token(key.status, 48),
    keyCapRub: number(key.cap, { minimum: 0 }),
    decision: safeDecision(source.decision),
    parallelLimit: integer(source.parallel_limit, { minimum: 0 }),
    abuseCooldownSec: number(source.abuse_cooldown_sec, { minimum: 0 }),
    unlimitedVolume: source.unlimited_volume === true,
    chat: {
      session: safeQuota(chat.session),
      week: safeQuota(chat.week),
      rpm: safeQuota(chat.rpm),
      cooldownSec: number(chat.cooldown_sec, { minimum: 0 }),
      scope: token(chat.scope, 48),
    },
    vector: {
      session: safeQuota(vector.session),
      week: safeQuota(vector.week),
      rpmLimit: number(vector.rpm_limit, { minimum: 0 }),
      inflightLimit: number(vector.inflight_limit, { minimum: 0 }),
      cooldownSec: number(vector.cooldown_sec, { minimum: 0 }),
      scope: token(vector.scope, 48),
    },
    wallet: safeWallet(source.wallet),
    night: {
      enabled: night.enabled === true,
      active: night.active === true,
      capacityFactor: number(night.capacity_factor, { minimum: 0 }),
      windowStartMsk: number(night.window_start_msk, { minimum: 0, maximum: 24 }),
      windowEndMsk: number(night.window_end_msk, { minimum: 0, maximum: 24 }),
    },
    dailyCapacity: {
      percentUsed: number(daily.pct_used, { minimum: 0 }),
      exhausted: daily.exhausted === true,
      resetsAt: isoDate(daily.resets_at),
    },
    specialAllowances: safeAllowances(source.special_allowances ?? source.kimi),
    observedAt: isoDate(source.observed_at),
  };
}

export function normalizeWalletPrices(payload) {
  const root = record(payload);
  const rows = Array.isArray(root.prices) ? root.prices : Array.isArray(root.data) ? root.data : [];
  const seen = new Set();
  return rows.slice(0, MAX_PUBLIC_ROWS).map((raw) => {
    const source = record(raw);
    const model = token(source.model || source.id);
    if (!model || seen.has(model)) return null;
    seen.add(model);
    return {
      model,
      billing: token(source.billing, 32) || "unknown",
      inputRubPerMillion: number(source.in_rub_1m, { minimum: 0 }),
      cachedInputRubPerMillion: number(source.cached_in_rub_1m, { minimum: 0 }),
      outputRubPerMillion: number(source.out_rub_1m, { minimum: 0 }),
      unitRub: number(source.unit_rub, { minimum: 0 }),
      rubPerMinute: number(source.rub_per_min, { minimum: 0 }),
      premium: source.premium === true,
      openRouter: source.or_model === true,
    };
  }).filter(Boolean);
}

export function normalizeTierLimits(payload) {
  const root = record(payload);
  const rows = Array.isArray(root.tiers) ? root.tiers : [];
  const night = record(root.night);
  return {
    gatewayTimeoutSec: number(root.gateway_timeout_sec, { minimum: 0 }),
    sessionWindowHours: number(root.session_window_hours, { minimum: 0 }),
    night: {
      enabled: night.enabled === true,
      active: night.active === true,
      capacityFactor: number(night.capacity_factor, { minimum: 0 }),
      windowStartMsk: number(night.window_start_msk, { minimum: 0, maximum: 24 }),
      windowEndMsk: number(night.window_end_msk, { minimum: 0, maximum: 24 }),
    },
    tiers: rows.slice(0, 50).map((raw) => {
      const source = record(raw);
      return {
        tier: token(source.tier, 80),
        label: string(source.label, 120),
        chatRpm: number(source.chat_rpm, { minimum: 0 }),
        vectorRpm: number(source.vector_rpm, { minimum: 0 }),
        parallel: number(source.parallel, { minimum: 0 }),
        session: number(source.session, { minimum: 0 }),
        week: number(source.week, { minimum: 0 }),
        unlimitedVolume: source.unlimited_volume === true,
      };
    }).filter((item) => item.tier),
  };
}

export function normalizeFreeTier(payload) {
  const source = record(payload);
  const promo = record(source.promo);
  return {
    maxInputTokens: number(source.max_input_tokens, { minimum: 0 }),
    chatRpm: number(source.chat_rpm, { minimum: 0 }),
    vectorRpm: number(source.vector_rpm, { minimum: 0 }),
    parallel: number(source.parallel, { minimum: 0 }),
    session: number(source.session, { minimum: 0 }),
    week: number(source.week, { minimum: 0 }),
    promo: {
      active: promo.active === true,
      model: token(promo.model),
      models: Array.isArray(promo.models) ? promo.models.map((item) => token(item)).filter(Boolean).slice(0, 50) : [],
      until: isoDate(promo.until),
    },
  };
}

export function normalizePaymentsStatus(payload) {
  const source = record(payload);
  return {
    paused: source.paused === true,
    subscriptionPaused: source.subscription_paused === true,
    walletPaused: source.wallet_paused === true,
    renewalPaused: source.renew_paused === true,
    reasonCode: token(source.reason, 96),
  };
}

function cacheFile(stateRoot) {
  return path.join(stateRoot, "private", "neuraldeep", "account-snapshot.json");
}

function readCache(stateRoot) {
  try {
    const value = JSON.parse(readFileSync(cacheFile(stateRoot), "utf8"));
    return value?.schema === "pritha-neuraldeep-account-cache-v1" ? value : null;
  } catch {
    return null;
  }
}

function writeCache(stateRoot, value) {
  const target = cacheFile(stateRoot);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(target), 0o700);
  withFileLock(target, () => atomicWriteFile(target, `${JSON.stringify(value, null, 2)}\n`));
  chmodSync(target, 0o600);
}

async function fetchJson(url, { token: credential, timeoutMs = REQUEST_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        ...(credential ? { authorization: `Bearer ${credential}` } : {}),
      },
      redirect: "error",
      signal: controller.signal,
    });
    const body = await response.text();
    let payload = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const classified = classifyNeuralDeepProviderError({
        status: response.status,
        payload,
        retryAfter: response.headers.get("retry-after"),
      });
      const error = new Error(`neuraldeep_${classified.class}`);
      Object.assign(error, classified);
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.class) throw error;
    const classified = classifyNeuralDeepProviderError({ transportCode: error?.name === "AbortError" ? "timeout" : error?.code });
    const wrapped = new Error(`neuraldeep_${classified.class}`);
    Object.assign(wrapped, classified);
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

function fresh(timestamp, ttlMs, now) {
  const parsed = Date.parse(timestamp || "");
  return Number.isFinite(parsed) && now - parsed < ttlMs;
}

function safeFailure(error) {
  return {
    class: token(error?.class, 48) || "outage",
    code: token(error?.code, 96) || "provider_unavailable",
    status: Number.isInteger(error?.status) ? error.status : null,
    retryAfter: error?.retryAfter == null ? null : String(error.retryAfter).slice(0, 80),
  };
}

function publicCacheEntries(value) {
  const source = record(value);
  const entries = record(source.entries);
  const legacy = record(source.value);
  const result = {};
  for (const key of Object.keys(PUBLIC_RESOURCES)) {
    const current = record(entries[key]);
    if (typeof current.fetchedAt === "string" && Object.hasOwn(current, "value")) {
      result[key] = { fetchedAt: current.fetchedAt, value: current.value };
    } else if (typeof source.fetchedAt === "string" && Object.hasOwn(legacy, key)) {
      result[key] = { fetchedAt: source.fetchedAt, value: legacy[key] };
    }
  }
  return result;
}

function oldestPublicFetch(entries) {
  const timestamps = Object.values(entries)
    .map((entry) => Date.parse(entry?.fetchedAt || ""))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
}

export async function loadNeuralDeepAccountSnapshot(options = {}) {
  const stateRoot = path.resolve(options.stateRoot);
  const credential = String(options.token || "").trim();
  const apiOrigin = new URL(options.apiOrigin || DEFAULT_API_ORIGIN).origin;
  const publicOrigin = new URL(options.publicOrigin || DEFAULT_PUBLIC_ORIGIN).origin;
  const nowMs = options.now ? Number(options.now()) : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cached = readCache(stateRoot) || {};
  const failures = [];

  let limitsEntry = cached.limits || null;
  if (!fresh(limitsEntry?.fetchedAt, LIMITS_TTL_MS, nowMs)) {
    if (!credential) {
      failures.push({ class: "credentials", code: "neuraldeep_key_missing", status: null, retryAfter: null });
    } else {
      try {
        limitsEntry = {
          fetchedAt: nowIso,
          value: sanitizeNeuralDeepLimits(await fetchJson(new URL("/v1/limits", apiOrigin), { ...options, token: credential })),
        };
      } catch (error) {
        failures.push(safeFailure(error));
      }
    }
  }

  const publicEntries = publicCacheEntries(cached.public);
  await Promise.all(Object.entries(PUBLIC_RESOURCES).map(async ([key, resource]) => {
    if (fresh(publicEntries[key]?.fetchedAt, PUBLIC_ACCOUNT_TTL_MS, nowMs)) return;
    try {
      publicEntries[key] = {
        fetchedAt: nowIso,
        value: resource.normalize(await fetchJson(new URL(resource.pathname, publicOrigin), options)),
      };
    } catch (error) {
      failures.push(safeFailure(error));
    }
  }));

  const publicKeys = Object.keys(PUBLIC_RESOURCES);
  const publicAvailable = publicKeys.some((key) => Object.hasOwn(publicEntries[key] || {}, "value"));
  const publicFresh = publicKeys.every((key) => fresh(publicEntries[key]?.fetchedAt, PUBLIC_ACCOUNT_TTL_MS, nowMs));
  const publicValues = {
    walletPrices: publicEntries.walletPrices?.value || [],
    tierLimits: publicEntries.tierLimits?.value || null,
    freeTier: publicEntries.freeTier?.value || null,
    paymentsStatus: publicEntries.paymentsStatus?.value || null,
  };

  if (limitsEntry?.value || publicAvailable) {
    try {
      writeCache(stateRoot, {
        schema: "pritha-neuraldeep-account-cache-v1",
        limits: limitsEntry?.value ? limitsEntry : null,
        public: publicAvailable ? { entries: publicEntries } : null,
      });
    } catch {
      // A read-only account view must remain usable if local cache persistence fails.
    }
  }

  const limitsStale = Boolean(limitsEntry?.value) && !fresh(limitsEntry.fetchedAt, LIMITS_TTL_MS, nowMs);
  const publicStale = publicAvailable && !publicFresh;
  const hasLiveLimits = Boolean(limitsEntry?.value) && !limitsStale;
  const hasLivePublic = publicAvailable && publicFresh;
  return {
    schema: "pritha-neuraldeep-account-snapshot-v1",
    checkedAt: nowIso,
    source: hasLiveLimits && hasLivePublic ? "live" : limitsEntry?.value || publicAvailable ? "mixed_or_cache" : "unavailable",
    stale: limitsStale || publicStale,
    sections: {
      limits: { available: Boolean(limitsEntry?.value), stale: limitsStale, fetchedAt: limitsEntry?.fetchedAt || null },
      public: { available: publicAvailable, stale: publicStale, fetchedAt: oldestPublicFetch(publicEntries) },
    },
    limits: limitsEntry?.value || null,
    walletPrices: publicValues.walletPrices,
    tierLimits: publicValues.tierLimits,
    freeTier: publicValues.freeTier,
    paymentsStatus: publicValues.paymentsStatus,
    failures: failures.slice(0, 5),
  };
}

export function billingContextForModel(snapshot, modelId) {
  const model = token(modelId);
  const price = snapshot?.walletPrices?.find((item) => item.model === model) || null;
  const mode = snapshot?.limits?.billingMode || "unknown";
  return {
    mode,
    tier: snapshot?.limits?.tier || null,
    price: price ? { ...price } : null,
    capturedAt: snapshot?.checkedAt || new Date().toISOString(),
  };
}

export function neuralDeepAccountCachePath(stateRoot) {
  return cacheFile(path.resolve(stateRoot));
}
