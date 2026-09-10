export type NeuralDeepBillingMode = "subscription" | "wallet" | "unknown";

export type NeuralDeepWalletPrice = {
  model: string;
  billing: string;
  inputRubPerMillion: number | null;
  cachedInputRubPerMillion: number | null;
  outputRubPerMillion: number | null;
  unitRub: number | null;
  rubPerMinute: number | null;
  premium: boolean;
  openRouter: boolean;
};

export type NeuralDeepQuota = {
  used: number | null;
  limit: number | null;
  remaining: number | null;
  resetInSec: number | null;
  resetsAt: string | null;
  window: string | null;
};

export type NeuralDeepAccountSnapshot = {
  schema: "pritha-neuraldeep-account-snapshot-v1";
  checkedAt: string;
  source: "live" | "mixed_or_cache" | "unavailable";
  stale: boolean;
  sections: {
    limits: { available: boolean; stale: boolean; fetchedAt: string | null };
    public: { available: boolean; stale: boolean; fetchedAt: string | null };
  };
  limits: null | {
    tier: string | null;
    tierExpiresAt: string | null;
    billingMode: NeuralDeepBillingMode;
    keyStatus: string | null;
    keyCapRub: number | null;
    decision: {
      scope: string;
      canRequest: boolean;
      retryAfterSec: number | null;
      blockerCount: number;
      blockerCodes: string[];
    };
    parallelLimit: number | null;
    abuseCooldownSec: number | null;
    unlimitedVolume: boolean;
    chat: {
      session: NeuralDeepQuota;
      week: NeuralDeepQuota;
      rpm: NeuralDeepQuota;
      cooldownSec: number | null;
      scope: string | null;
    };
    vector: {
      session: NeuralDeepQuota;
      week: NeuralDeepQuota;
      rpmLimit: number | null;
      inflightLimit: number | null;
      cooldownSec: number | null;
      scope: string | null;
    };
    wallet: null | {
      enabled: boolean;
      balanceRub: number | null;
      reservedRub: number | null;
      spentRub: number | null;
      currency: string;
      status: string | null;
    };
    night: {
      enabled: boolean;
      active: boolean;
      capacityFactor: number | null;
      windowStartMsk: number | null;
      windowEndMsk: number | null;
    };
    dailyCapacity: { percentUsed: number | null; exhausted: boolean; resetsAt: string | null };
    specialAllowances: null | Array<{
      name: string;
      used: number | null;
      limit: number | null;
      remaining: number | null;
      resetsAt: string | null;
      active: boolean;
    }>;
    observedAt: string | null;
  };
  walletPrices: NeuralDeepWalletPrice[];
  tierLimits: null | {
    gatewayTimeoutSec: number | null;
    sessionWindowHours: number | null;
    night: {
      enabled: boolean;
      active: boolean;
      capacityFactor: number | null;
      windowStartMsk: number | null;
      windowEndMsk: number | null;
    };
    tiers: Array<{
      tier: string;
      label: string | null;
      chatRpm: number | null;
      vectorRpm: number | null;
      parallel: number | null;
      session: number | null;
      week: number | null;
      unlimitedVolume: boolean;
    }>;
  };
  freeTier: null | {
    maxInputTokens: number | null;
    chatRpm: number | null;
    vectorRpm: number | null;
    parallel: number | null;
    session: number | null;
    week: number | null;
    promo: { active: boolean; model: string | null; models: string[]; until: string | null };
  };
  paymentsStatus: null | {
    paused: boolean;
    subscriptionPaused: boolean;
    walletPaused: boolean;
    renewalPaused: boolean;
    reasonCode: string | null;
  };
  failures: Array<{ class: string; code: string; status: number | null; retryAfter: string | null }>;
};
