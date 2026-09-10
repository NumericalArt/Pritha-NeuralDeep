import type { CatalogOptions } from "./identity.mjs";
import type { ResultReadiness } from "./result-readiness.mjs";
export function unavailableResultReadiness(reason?: string): ResultReadiness;
export function readAgentResultReadinessAsync(target: string, options?: CatalogOptions & { codeRoot?: string; timeoutMs?: number }): Promise<ResultReadiness>;
