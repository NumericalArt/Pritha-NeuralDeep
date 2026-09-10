"use client";

import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw, ShieldCheck, TimerOff, WalletCards } from "lucide-react";
import type { NeuralDeepQuota } from "@/lib/settings/neuraldeep-account";

type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
type UsageRange = "24h" | "7d" | "30d";
type UsageAggregate = {
  runs: number;
  providerRequests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostRub: number;
  estimatedCostRuns: number;
};

type UsageSummary = {
  range: UsageRange;
  generatedAt: string;
  costIsEstimate: true;
  totals: UsageAggregate;
  bySource: Array<UsageAggregate & { source: string }>;
  byModel: Array<UsageAggregate & { model: string }>;
};

type LimitsState = {
  neuraldeep: {
    status: string;
    detail: string;
    checkedAt: string;
    source: string;
    stale: boolean;
    tier: string | null;
    tierExpiresAt: string | null;
    billingMode: "subscription" | "wallet" | "unknown";
    keyStatus: string;
    keyCapRub: number | null;
    wallet: null | { enabled: boolean; balanceRub: number | null; reservedRub: number | null; spentRub: number | null; currency: string; status: string | null };
    canRequest: boolean;
    scope: string;
    retryAfterSec: number | null;
    blockerCount: number;
    parallelLimit: number | null;
    unlimitedVolume: boolean;
    abuseCooldownSec: number | null;
    chat: null | { session: NeuralDeepQuota; week: NeuralDeepQuota; rpm: NeuralDeepQuota; cooldownSec: number | null };
    vector: null | { session: NeuralDeepQuota; week: NeuralDeepQuota; rpmLimit: number | null; inflightLimit: number | null; cooldownSec: number | null };
    night: null | { enabled: boolean; active: boolean; capacityFactor: number | null; windowStartMsk: number | null; windowEndMsk: number | null };
    dailyCapacity: null | { percentUsed: number | null; exhausted: boolean; resetsAt: string | null };
    specialAllowances: null | Array<{ name: string; used: number | null; limit: number | null; remaining: number | null; resetsAt: string | null; active: boolean }>;
    paymentsStatus: null | { paused: boolean; subscriptionPaused: boolean; walletPaused: boolean; renewalPaused: boolean; reasonCode: string | null };
    freeTier: null | {
      maxInputTokens: number | null;
      chatRpm: number | null;
      vectorRpm: number | null;
      parallel: number | null;
      session: number | null;
      week: number | null;
      promo: { active: boolean; model: string | null; models: string[]; until: string | null };
    };
    links: { spend: string; billing: string };
  };
  realtimeUsage: { status: string; detail: string; today: TokenUsage; week: TokenUsage };
  openaiVoiceBoundary: { status: string; detail: string };
  providerPausePolicy: { enabled: boolean; action: string; source: string; detail: string };
};

function formatTokens(tokens?: number | null) {
  return (tokens || 0).toLocaleString("en-US");
}

function formatRub(value?: number | null) {
  return value == null ? "Unavailable" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} ₽`;
}

function statusClass(status?: string) {
  if (["ready", "available", "collecting"].includes(String(status))) return "alive";
  if (["rate_limited", "unavailable", "billing_required", "access_denied"].includes(String(status))) return "unknown";
  return "missing";
}

function checkedAt(value?: string) {
  if (!value) return "";
  return `Checked ${new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function resetLabel(value?: string | null) {
  if (!value) return "reset unavailable";
  return `resets ${new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

function quotaValue(quota?: NeuralDeepQuota | null) {
  if (!quota) return "Unavailable";
  if (quota.limit == null) return quota.used == null ? "Unlimited" : `${formatTokens(quota.used)} used`;
  return `${formatTokens(quota.used)} / ${formatTokens(quota.limit)}`;
}

function sourceLabel(source: string) {
  return ({ "codex-chat": "Codex Chat", "agent-mother": "Agent Mother", "child-agent": "Child agents", "voice-dialogue": "Voice dialogue", embeddings: "Embeddings", unmetered: "Legacy / unmetered" } as Record<string, string>)[source] || source;
}

export function LimitsSettingsSection() {
  const [limits, setLimits] = useState<LimitsState | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [range, setRange] = useState<UsageRange>("24h");
  const [statusText, setStatusText] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadLimits(selectedRange: UsageRange = range) {
    setLoading(true);
    setStatusText("");
    try {
      const [limitsResponse, usageResponse] = await Promise.all([
        fetch("/api/settings/limits", { cache: "no-store" }).catch(() => null),
        fetch(`/api/settings/neuraldeep-usage?range=${selectedRange}`, { cache: "no-store" }).catch(() => null),
      ]);
      const limitsPayload = limitsResponse?.ok ? await limitsResponse.json().catch(() => null) as { limits?: LimitsState } | null : null;
      const usagePayload = usageResponse?.ok ? await usageResponse.json().catch(() => null) as { usage?: UsageSummary } | null : null;
      if (limitsPayload?.limits) {
        setLimits(limitsPayload.limits);
        setStatusText(checkedAt(limitsPayload.limits.neuraldeep.checkedAt));
      } else {
        setStatusText("NeuralDeep account status unavailable");
      }
      setUsage(usagePayload?.usage || null);
    } finally {
      setLoading(false);
    }
  }

  function selectRange(value: UsageRange) {
    setRange(value);
    setUsage(null);
    void loadLimits(value);
  }

  useEffect(() => { void loadLimits("24h"); }, []);

  const neuraldeep = limits?.neuraldeep;
  const isSubscription = neuraldeep?.billingMode === "subscription";
  const usageRows = usage?.bySource || [];
  const localCostLabel = isSubscription
    ? "Included"
    : !usage
      ? "Unavailable"
      : usage.totals.estimatedCostRuns > 0
        ? `~${formatRub(usage.totals.estimatedCostRub)}`
        : usage.totals.runs === 0
          ? formatRub(0)
          : "Unavailable";
  const localCostDetail = isSubscription
    ? "Subscription mode"
    : usage && usage.totals.estimatedCostRuns > 0 && usage.totals.estimatedCostRuns < usage.totals.runs
      ? `${usage.totals.estimatedCostRuns} of ${usage.totals.runs} runs priced`
      : "Estimated local cost";

  return (
    <section className="settings-section">
      <div className="settings-section-row settings-billing-heading">
        <div className="section-header">
          <span className="section-icon"><WalletCards size={22} /></span>
          <div><h2>Usage &amp; Billing</h2><p>NeuralDeep account limits and private local usage estimates</p></div>
        </div>
        <div className="settings-billing-actions">
          {neuraldeep ? (
            <>
              <a className="outline-button" href={neuraldeep.links.spend} target="_blank" rel="noreferrer">Expenses <ExternalLink size={14} /></a>
              <a className="outline-button" href={neuraldeep.links.billing} target="_blank" rel="noreferrer">Plan &amp; payment <ExternalLink size={14} /></a>
            </>
          ) : null}
          <button className="outline-button" type="button" onClick={() => loadLimits()} disabled={loading}>
            <RefreshCw size={16} /> {loading ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>

      {!limits || !neuraldeep ? (
        <div className="info-note"><BarChart3 size={17} />{statusText || "Loading NeuralDeep account data..."}</div>
      ) : (
        <>
          {neuraldeep.stale ? <div className="info-note settings-warning-note"><TimerOff size={17} />NeuralDeep is temporarily unavailable. Values marked here are last-known-good cached data.</div> : null}
          {neuraldeep.paymentsStatus && (neuraldeep.paymentsStatus.paused || neuraldeep.paymentsStatus.subscriptionPaused || neuraldeep.paymentsStatus.walletPaused) ? <div className="info-note settings-warning-note"><TimerOff size={17} />NeuralDeep reports a payment-mode pause{neuraldeep.paymentsStatus.reasonCode ? ` (${neuraldeep.paymentsStatus.reasonCode})` : ""}.</div> : null}
          {neuraldeep.freeTier?.promo.active ? <div className="info-note"><BarChart3 size={17} />Free-tier promotion active{neuraldeep.freeTier.promo.models.length ? ` for ${neuraldeep.freeTier.promo.models.join(", ")}` : neuraldeep.freeTier.promo.model ? ` for ${neuraldeep.freeTier.promo.model}` : ""}{neuraldeep.freeTier.promo.until ? ` until ${new Date(neuraldeep.freeTier.promo.until).toLocaleString()}` : ""}.</div> : null}

          <div className="settings-rowline settings-limits-row">
            <div className="settings-limits-copy">
              <strong>NeuralDeep account</strong>
              <span>{neuraldeep.detail}</span>
              <div className="settings-mini-metrics" aria-label="NeuralDeep account status">
                <span>Plan {neuraldeep.tier || "unknown"}</span>
                <span>{neuraldeep.billingMode === "subscription" ? "Subscription" : neuraldeep.billingMode === "wallet" ? "Wallet" : "Billing unknown"}</span>
                <span>Key {neuraldeep.keyStatus}</span>
                <span>Parallel {neuraldeep.parallelLimit ?? "unknown"}</span>
                {neuraldeep.abuseCooldownSec ? <span>Cooldown {neuraldeep.abuseCooldownSec}s</span> : null}
                {neuraldeep.tierExpiresAt ? <span>{resetLabel(neuraldeep.tierExpiresAt).replace("resets", "expires")}</span> : null}
              </div>
            </div>
            <span className={`settings-status-chip ${statusClass(neuraldeep.status)}`}>{neuraldeep.status}</span>
          </div>

          <div className="settings-limit-stack" aria-label="NeuralDeep provider limits">
            <div className="settings-limit-card">
              <div className="settings-limit-card-head"><strong>Chat capacity</strong><span>{neuraldeep.chat?.cooldownSec ? `Cooldown ${neuraldeep.chat.cooldownSec}s` : "Ready"}</span></div>
              <div className="settings-limit-metrics">
                <span>{quotaValue(neuraldeep.chat?.session)}<small>Session · {resetLabel(neuraldeep.chat?.session.resetsAt)}</small></span>
                <span>{quotaValue(neuraldeep.chat?.week)}<small>Week · {resetLabel(neuraldeep.chat?.week.resetsAt)}</small></span>
                <span>{quotaValue(neuraldeep.chat?.rpm)}<small>Requests per minute</small></span>
                <span>{neuraldeep.dailyCapacity?.percentUsed == null ? "Unavailable" : `${neuraldeep.dailyCapacity.percentUsed.toLocaleString()}%`}<small>Daily capacity · {resetLabel(neuraldeep.dailyCapacity?.resetsAt)}</small></span>
              </div>
            </div>
            <div className="settings-limit-card">
              <div className="settings-limit-card-head"><strong>Embeddings capacity</strong><span>NeuralDeep optional index</span></div>
              <div className="settings-limit-metrics">
                <span>{quotaValue(neuraldeep.vector?.session)}<small>Session · {resetLabel(neuraldeep.vector?.session.resetsAt)}</small></span>
                <span>{quotaValue(neuraldeep.vector?.week)}<small>Week · {resetLabel(neuraldeep.vector?.week.resetsAt)}</small></span>
                <span>{neuraldeep.vector?.rpmLimit ?? "Unavailable"}<small>Vector RPM</small></span>
                <span>{neuraldeep.vector?.inflightLimit ?? "Unavailable"}<small>Concurrent vector requests</small></span>
              </div>
            </div>
          </div>

          <div className="settings-rowline">
            <div>
              <strong>{isSubscription ? "Included in subscription" : "Wallet balance"}</strong>
              <span>{isSubscription ? "Token prices are reference prices for a future switch to wallet mode; they are not presented as current charges." : "NeuralDeep balance is authoritative. Local run costs below are estimates from the current public RUB price snapshot."}</span>
            </div>
            <div className="settings-balance-value">
              {isSubscription ? "No per-token charge" : formatRub(neuraldeep.wallet?.balanceRub)}
              {neuraldeep.keyCapRub != null ? <small>Key cap {formatRub(neuraldeep.keyCapRub)}</small> : null}
            </div>
          </div>

          {neuraldeep.night?.enabled ? (
            <div className="settings-rowline">
              <div><strong>Night capacity</strong><span>{neuraldeep.night.windowStartMsk ?? 0}:00–{neuraldeep.night.windowEndMsk ?? 6}:00 MSK · capacity multiplier ×{neuraldeep.night.capacityFactor ?? 1}</span></div>
              <span className={`settings-status-chip ${neuraldeep.night.active ? "alive" : "unknown"}`}>{neuraldeep.night.active ? "active" : "scheduled"}</span>
            </div>
          ) : null}

          {neuraldeep.specialAllowances?.length ? (
            <div className="settings-rowline settings-limits-row">
              <div className="settings-limits-copy"><strong>Special allowances</strong><span>Provider-reported model or campaign capacity.</span></div>
              <div className="settings-mini-metrics">{neuraldeep.specialAllowances.map((item) => <span key={item.name}>{item.name}: {item.remaining ?? "unknown"} remaining</span>)}</div>
            </div>
          ) : null}

          <div className="settings-usage-header">
            <div><strong>Local NeuralDeep ledger</strong><span>Metadata only: no prompts, responses, secrets, or file contents.</span></div>
            <div className="settings-segmented-control compact" role="radiogroup" aria-label="Usage range">
              {(["24h", "7d", "30d"] as UsageRange[]).map((item) => <button key={item} type="button" role="radio" aria-checked={range === item} className={range === item ? "active" : ""} onClick={() => selectRange(item)}>{item}</button>)}
            </div>
          </div>
          {usage ? (
            <>
              <div className="settings-limit-metrics settings-usage-totals">
                <span>{formatTokens(usage.totals.totalTokens)}<small>Measured tokens</small></span>
                <span>{formatTokens(usage.totals.providerRequests)}<small>Provider requests</small></span>
                <span>{formatTokens(usage.totals.runs)}<small>Recorded runs</small></span>
                <span>{localCostLabel}<small>{localCostDetail}</small></span>
              </div>
              {usageRows.length ? (
                <div className="settings-usage-groups">
                  <div><strong>By source</strong><div className="settings-usage-breakdown">
                    {usageRows.map((row) => (
                      <div key={row.source}><span>{sourceLabel(row.source)}</span><strong>{formatTokens(row.totalTokens)} tokens</strong><small>{row.runs} runs{!isSubscription && row.estimatedCostRuns ? ` · ~${formatRub(row.estimatedCostRub)}` : ""}</small></div>
                    ))}
                  </div></div>
                  <div><strong>By model</strong><div className="settings-usage-breakdown">
                    {usage.byModel.slice(0, 12).map((row) => (
                      <div key={row.model}><span>{row.model}</span><strong>{formatTokens(row.totalTokens)} tokens</strong><small>{row.runs} runs{!isSubscription && row.estimatedCostRuns ? ` · ~${formatRub(row.estimatedCostRub)}` : ""}</small></div>
                    ))}
                  </div></div>
                </div>
              ) : <div className="info-note"><BarChart3 size={17} />No NeuralDeep runs have been recorded in this range yet.</div>}
            </>
          ) : <div className="info-note"><TimerOff size={17} />{loading ? "Loading local NeuralDeep usage..." : "Local NeuralDeep usage is temporarily unavailable."}</div>}

          <div className="settings-rowline">
            <div><strong>OpenAI Realtime Voice Control</strong><span>{limits.openaiVoiceBoundary.detail}</span></div>
            <span className={`settings-status-chip ${statusClass(limits.openaiVoiceBoundary.status)}`}>{limits.openaiVoiceBoundary.status}</span>
          </div>
          <div className="settings-rowline">
            <div><strong>Provider outage policy</strong><span>{limits.providerPausePolicy.detail}</span></div>
            <div className="settings-pause-policy"><TimerOff size={16} /><span className="settings-status-chip alive">Enabled</span></div>
          </div>
          <div className="info-note"><ShieldCheck size={17} />NeuralDeep is authoritative for access and wallet balance. Local RUB totals are estimates; subscription runs store cost as unavailable rather than 0 ₽.</div>
        </>
      )}
      {statusText ? <div className="settings-action-row">{statusText}</div> : null}
    </section>
  );
}
