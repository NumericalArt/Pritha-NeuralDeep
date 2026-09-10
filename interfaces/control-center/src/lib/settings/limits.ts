import { getOpenAICredentialsStatus } from "./openai-credentials";
import { getNeuralDeepCredentialStatus } from "./neuraldeep-credentials";
import { getNeuralDeepAccountSnapshot } from "./neuraldeep-account-server";

function finiteNumber(value: unknown) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function getSettingsLimitsState() {
  const [account, credentials] = await Promise.all([
    getNeuralDeepAccountSnapshot(),
    Promise.resolve(getOpenAICredentialsStatus()),
  ]);
  const limits = account.limits;
  const credentialsStatus = getNeuralDeepCredentialStatus();
  const primaryFailure = account.failures[0] || null;
  const status = !credentialsStatus.configured || primaryFailure?.class === "credentials"
    ? "auth_required"
    : primaryFailure?.class === "billing"
      ? "billing_required"
      : limits?.decision.canRequest === false
        ? "rate_limited"
        : account.source === "unavailable"
          ? "unavailable"
          : "available";
  const canRequest = limits?.decision.canRequest === true && status === "available";
  return {
    neuraldeep: {
      status,
      detail: status === "available"
        ? account.stale
          ? "Showing the last-known-good NeuralDeep account snapshot."
          : "Live read-only account and limits data from NeuralDeep."
        : status === "auth_required"
          ? "NeuralDeep rejected the configured key. Replace it in Settings."
          : status === "billing_required"
            ? "NeuralDeep requires a compatible tariff or wallet balance for this request."
          : status === "rate_limited"
            ? "NeuralDeep is rate limited. Unstarted work waits without provider fallback."
            : "NeuralDeep account data is temporarily unavailable.",
      checkedAt: account.checkedAt,
      source: account.source,
      stale: account.stale,
      sections: account.sections,
      failures: account.failures,
      tier: limits?.tier || null,
      tierExpiresAt: limits?.tierExpiresAt || null,
      billingMode: limits?.billingMode || "unknown",
      keyStatus: limits?.keyStatus || (credentialsStatus.configured ? "configured" : "missing"),
      keyCapRub: limits?.keyCapRub ?? null,
      wallet: limits?.wallet || null,
      walletPrices: account.walletPrices,
      canRequest,
      scope: limits?.decision.scope || "chat",
      retryAfterSec: finiteNumber(limits?.decision.retryAfterSec),
      blockerCount: Math.max(0, finiteNumber(limits?.decision.blockerCount) || 0),
      blockerCodes: limits?.decision.blockerCodes || [],
      parallelLimit: finiteNumber(limits?.parallelLimit),
      unlimitedVolume: limits?.unlimitedVolume === true,
      abuseCooldownSec: limits?.abuseCooldownSec ?? null,
      chat: limits?.chat || null,
      vector: limits?.vector || null,
      night: limits?.night || null,
      dailyCapacity: limits?.dailyCapacity || null,
      specialAllowances: limits?.specialAllowances || null,
      observedAt: limits?.observedAt || null,
      paymentsStatus: account.paymentsStatus,
      tierLimits: account.tierLimits,
      freeTier: account.freeTier,
      links: {
        spend: "https://neuraldeep.ru/app/spend",
        billing: "https://neuraldeep.ru/app/billing",
      },
    },
    realtimeUsage: {
      status: "collecting",
      detail: "OpenAI Realtime response.done usage is retained locally for Voice Control estimates; no Admin API telemetry is used.",
      today: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      week: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    },
    openaiVoiceBoundary: {
      status: credentials.openaiApiKey.configured ? "ready" : "missing",
      detail: credentials.openaiApiKey.configured
        ? "OpenAI API key is configured for Realtime Voice Control only."
        : "Voice Control is disabled until an OpenAI API key is configured; NeuralDeep chat remains available.",
    },
    providerPausePolicy: {
      enabled: true,
      action: "wait_without_fallback",
      source: "codex_chat_gateway",
      detail: "429, transient 5xx and network outages pause unstarted NeuralDeep work; tool-active turns require an explicit recovery decision.",
    },
  };
}
