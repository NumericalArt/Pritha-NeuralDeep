import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadNeuralDeepAccountSnapshot,
  neuralDeepAccountCachePath,
  normalizeWalletPrices,
  sanitizeNeuralDeepLimits,
} from "../scripts/neuraldeep/account-snapshot.mjs";

function limitsFixture() {
  return {
    schema: 1,
    tier: "free",
    tier_expires_at: null,
    key: { name: "secret-key-name", id: "key-private-id", status: "ok", billing_mode: "subscription", cap: null },
    decision: { scope: "chat", can_request: true, blockers: [], retry_after_sec: null },
    parallel_limit: 3,
    chat: {
      session: { used: 2, limit: 400, remaining: 398, reset_in_sec: 10, resets_at: "2026-09-04T00:00:00Z", window: "3h" },
      week: { used: 10, limit: 2000, remaining: 1990, resets_at: "2026-09-07T00:00:00Z", window: "iso-week" },
      rpm: { used: 1, limit: 20, remaining: 19, reset_in_sec: 2 },
      cooldown_sec: 0,
      scope: "account",
    },
    vector: { session: { used: 0, limit: 5000 }, week: { used: 0, limit: 40000 }, rpm_limit: 30, inflight_limit: 8 },
    wallet: null,
    night: { enabled: true, active: false, capacity_factor: 2, window_start_msk: 0, window_end_msk: 6 },
    daily_capacity: { pct_used: 12.5, exhausted: false, resets_at: "2026-09-04T00:00:00Z" },
    observed_at: "2026-09-03T12:00:00Z",
  };
}

function publicFixture(pathname) {
  if (pathname.endsWith("wallet-prices")) return { prices: [
    { model: "qwen3.6-35b-a3b", billing: "token", in_rub_1m: 7.14, cached_in_rub_1m: 0.714, out_rub_1m: 40.8, premium: false, or_model: false },
    { model: "premium-model", billing: "token", in_rub_1m: 50, cached_in_rub_1m: 5, out_rub_1m: 100, premium: true, or_model: true },
  ] };
  if (pathname.endsWith("tier-limits")) return { session_window_hours: 3, tiers: [{ tier: "free", label: "Free", chat_rpm: 20, parallel: 3, session: 400, week: 2000 }] };
  if (pathname.endsWith("free-tier")) return { session: 400, week: 2000, promo: { active: true, model: "qwen3.6-35b-a3b", models: ["qwen3.6-35b-a3b"], until: "2026-09-08T00:00:00Z" } };
  return { paused: false, subscription_paused: false, wallet_paused: false, renew_paused: false };
}

test("limits sanitizer never exposes key names or identifiers", () => {
  const sanitized = sanitizeNeuralDeepLimits(limitsFixture());
  assert.equal(sanitized.tier, "free");
  assert.equal(sanitized.billingMode, "subscription");
  assert.equal(sanitized.chat.session.remaining, 398);
  assert.equal(sanitized.night.capacityFactor, 2);
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /secret-key-name|key-private-id/);
  assert.doesNotMatch(serialized, /"name"/);
});

test("wallet price normalization keeps only bounded safe pricing metadata", () => {
  const prices = normalizeWalletPrices(publicFixture("wallet-prices"));
  assert.equal(prices.length, 2);
  assert.deepEqual(prices[0], {
    model: "qwen3.6-35b-a3b",
    billing: "token",
    inputRubPerMillion: 7.14,
    cachedInputRubPerMillion: 0.714,
    outputRubPerMillion: 40.8,
    unitRub: null,
    rubPerMinute: null,
    premium: false,
    openRouter: false,
  });
});

test("account snapshot honors independent TTLs and falls back to private last-known-good data", async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-account-snapshot-"));
  let now = Date.parse("2026-09-03T12:00:00Z");
  const calls = [];
  let offline = false;
  const fetchImpl = async (url) => {
    calls.push(new URL(url).pathname);
    if (offline) throw Object.assign(new Error("offline"), { code: "ECONNRESET" });
    const pathname = new URL(url).pathname;
    const payload = pathname === "/v1/limits" ? limitsFixture() : publicFixture(pathname);
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const first = await loadNeuralDeepAccountSnapshot({ stateRoot, token: "test-token", now: () => now, fetchImpl });
    assert.equal(first.source, "live");
    assert.equal(calls.length, 5);
    now += 20_000;
    await loadNeuralDeepAccountSnapshot({ stateRoot, token: "test-token", now: () => now, fetchImpl });
    assert.equal(calls.length, 5);
    now += 11_000;
    await loadNeuralDeepAccountSnapshot({ stateRoot, token: "test-token", now: () => now, fetchImpl });
    assert.equal(calls.filter((item) => item === "/v1/limits").length, 2);
    assert.equal(calls.length, 6);

    offline = true;
    now += 5 * 60_000;
    const stale = await loadNeuralDeepAccountSnapshot({ stateRoot, token: "test-token", now: () => now, fetchImpl });
    assert.equal(stale.stale, true);
    assert.equal(stale.source, "mixed_or_cache");
    assert.equal(stale.limits.tier, "free");
    assert.equal(stale.failures[0].class, "outage");
    const cacheText = readFileSync(neuralDeepAccountCachePath(stateRoot), "utf8");
    assert.doesNotMatch(cacheText, /secret-key-name|test-token|authorization/i);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("missing credentials are reported safely while public pricing remains available", async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-account-public-"));
  try {
    const snapshot = await loadNeuralDeepAccountSnapshot({
      stateRoot,
      token: "",
      fetchImpl: async (url) => new Response(JSON.stringify(publicFixture(new URL(url).pathname)), { status: 200 }),
    });
    assert.equal(snapshot.limits, null);
    assert.equal(snapshot.walletPrices.length, 2);
    assert.equal(snapshot.failures[0].class, "credentials");
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("a partial public endpoint failure preserves successful account sections and marks the snapshot stale", async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-account-partial-"));
  try {
    const snapshot = await loadNeuralDeepAccountSnapshot({
      stateRoot,
      token: "test-token",
      fetchImpl: async (url) => {
        const pathname = new URL(url).pathname;
        if (pathname === "/v1/limits") return new Response(JSON.stringify(limitsFixture()), { status: 200 });
        if (pathname.endsWith("payments-status")) return new Response(JSON.stringify({ error: { code: "maintenance" } }), { status: 503 });
        return new Response(JSON.stringify(publicFixture(pathname)), { status: 200 });
      },
    });
    assert.equal(snapshot.walletPrices.length, 2);
    assert.equal(snapshot.tierLimits.tiers[0].tier, "free");
    assert.equal(snapshot.freeTier.promo.active, true);
    assert.equal(snapshot.paymentsStatus, null);
    assert.equal(snapshot.stale, true);
    assert.equal(snapshot.source, "mixed_or_cache");
    assert.equal(snapshot.failures[0].class, "outage");
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
