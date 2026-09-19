import path from "node:path";
import { realpathSync } from "node:fs";

export const OUTCOME_APPROVAL_SCHEMA = "pritha-outcome-approval-v1";

export function approvalEventMatchesSpec(event, {
  specId,
  specPath,
  root,
  sourceRoot,
  contractFingerprint,
  semanticLock,
  documentLock,
} = {}) {
  if (!event || event.schema !== OUTCOME_APPROVAL_SCHEMA) return false;
  if (event.spec_id !== specId) return false;
  if (event.contract_fingerprint !== contractFingerprint) return false;
  if (event.semantic_lock !== semanticLock) return false;
  if (event.document_lock !== documentLock) return false;
  if (event.approved_by !== "user") return false;
  if (typeof event.approval_id !== "string" || event.approval_id.length === 0) return false;
  const eventPath = String(event.spec_path || "").replace(/\\/g, "/");
  if (!eventPath || !specPath || !root) return false;
  const canonical = value => {
    try { return realpathSync(value); } catch { return path.resolve(value); }
  };
  const absoluteSpec = canonical(path.resolve(root, specPath));
  // sourceRoot is host-provided workspace metadata, not a path guessed from a
  // basename. It preserves legacy relative receipts after a worktree move.
  return [root, sourceRoot].filter(Boolean).some(base => canonical(path.resolve(base, eventPath)) === absoluteSpec);
}
