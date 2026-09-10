import type { CatalogOptions } from "./identity.mjs";
export type ResultVerificationStatus = "unverified" | "verified" | "awaiting_operator" | "failed" | "stale" | "unknown";
export type ResultTrialCounts = { automated: number; passed: number; failed: number; operator: number; status: ResultVerificationStatus };
export type ResultReadiness = {
  schema: "pritha-result-readiness-v1"; agentId: string | null; observedAt?: string;
  verification: { status: ResultVerificationStatus; scope: "canonical-project"; reason: string; counts: ResultTrialCounts | null; head: string | null };
  candidate: { status: ResultVerificationStatus; reason: string; head: string | null };
  acceptance: { status: "not_accepted" | "accepted" | "recorded_for_other_revision" | "unknown"; at: string | null };
  run: { id: string; status: string; updatedAt: string } | null;
  evidenceIssues: number; truncated: boolean;
};
export const RESULT_READINESS_SCHEMA: "pritha-result-readiness-v1";
export function readAgentResultReadiness(target: string, options?: CatalogOptions & { runId?: string }): ResultReadiness;
