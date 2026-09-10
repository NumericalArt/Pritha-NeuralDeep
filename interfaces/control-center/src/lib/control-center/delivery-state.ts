import type { ControlCenterAgent } from "./types";

export type DeliveryBudgetView = {
  scope: "build-executor";
  usageStatus: "complete" | "unknown" | "legacy-unknown";
  tokensUsed: number | null;
  tokenBudget: number | null;
  tokensReserved: number | null;
  tokensAvailable: number | null;
  amendments: number;
};

const statuses = new Set(["created", "preparing", "building", "verifying", "correcting", "paused", "blocked", "verified", "awaiting_acceptance", "accepted", "failed", "abandoned", "cancelled"]);
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function count(value: unknown, minimum = 0): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : null;
}

// Read-only projection: legacy or incomplete counters are never filled with 0.
export function deliveryStateView(value: unknown) {
  const state = object(value);
  if (!state || !["pritha-delivery-ledger-v1", "pritha-delivery-ledger-v2"].includes(String(state.schema))) return null;
  const budget = object(state.budget) || {};
  const tokensUsed = count(budget.tokens_used);
  const tokenBudget = count(budget.max_tokens, 1);
  const attempts = Array.isArray(budget.unaccounted_attempts) ? budget.unaccounted_attempts : null;
  const turns = Array.isArray(budget.accounted_turns) ? budget.accounted_turns : null;
  const sum = turns?.reduce<number | null>((total, row) => {
    const tokens = count(object(row)?.tokens_used);
    return total !== null && tokens !== null && Number.isSafeInteger(total + tokens) ? total + tokens : null;
  }, 0) ?? null;
  const keys = turns?.map(row => object(row)?.key);
  const validTurns = Boolean(keys && keys.every(key => typeof key === "string" && key.length) && new Set(keys).size === keys.length && sum === tokensUsed);
  const legacy = budget.accounting_version === undefined || budget.legacy_usage_unverified === true;
  const complete = !legacy && budget.accounting_version === 1 && budget.usage_scope === "build-executor"
    && budget.legacy_usage_unverified === false && attempts?.length === 0 && validTurns && tokensUsed !== null && tokenBudget !== null;
  const reserved = attempts?.reduce<number | null>((total, row) => {
    const tokens = count(object(row)?.reserved_tokens);
    return total !== null && tokens !== null && Number.isSafeInteger(total + tokens) ? total + tokens : null;
  }, 0) ?? null;
  const budgetView: DeliveryBudgetView = {
    scope: "build-executor",
    usageStatus: legacy ? "legacy-unknown" : complete ? "complete" : "unknown",
    tokensUsed, tokenBudget, tokensReserved: reserved,
    tokensAvailable: complete ? Math.max(0, tokenBudget! - tokensUsed!) : null,
    amendments: Array.isArray(budget.amendments) ? budget.amendments.length : 0,
  };
  return {
    status: (statuses.has(String(state.status)) ? state.status : "unknown") as ControlCenterAgent["lifecycle"]["delivery"]["status"],
    runId: typeof state.run_id === "string" ? state.run_id : "",
    phase: typeof state.phase === "string" ? state.phase : undefined,
    updatedAt: typeof state.updated_at === "string" ? state.updated_at : undefined,
    blockerCount: Array.isArray(state.blockers) ? state.blockers.length : 0,
    budget: budgetView,
  };
}

export function deliveryBudgetText(budget: DeliveryBudgetView) {
  const number = (value: number | null) => value === null ? "unknown" : value.toLocaleString("en-US");
  return `Build tokens ${number(budget.tokensUsed)} / ${number(budget.tokenBudget)} · available ${number(budget.tokensAvailable)} · reserved ${number(budget.tokensReserved)} · accounting ${budget.usageStatus} · extensions ${budget.amendments}`;
}
