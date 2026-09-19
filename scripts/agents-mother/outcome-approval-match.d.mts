export const OUTCOME_APPROVAL_SCHEMA: "pritha-outcome-approval-v1";

export function approvalEventMatchesSpec(event: Record<string, unknown> | null | undefined, options?: {
  specId?: string | null;
  specPath?: string;
  root?: string;
  sourceRoot?: string;
  contractFingerprint?: string | null;
  semanticLock?: string | null;
  documentLock?: string | null;
}): boolean;
