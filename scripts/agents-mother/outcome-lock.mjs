import { createHash } from "node:crypto";

// One canonical algorithm for CLI approval, protected Trials and UI readback.
const MUTABLE_DOCUMENT_FIELDS = new Set([
  "status",
  "outcome_spec_status",
  "updated",
  "outcome_semantic_lock",
  "outcome_document_lock",
  "approved_by",
  "approved_at",
  "review_status",
  "superseded_by",
]);
export function canonicalOutcomeDocument(value) {
  const source = String(value || "").replace(/\r\n?/g, "\n");
  if (!source.startsWith("---\n")) return source.trimEnd();
  const end = source.indexOf("\n---\n", 4);
  if (end === -1) return source.trimEnd();
  let mutableBlock = false;
  const frontmatter = source.slice(4, end).split("\n").flatMap((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):/);
    if (match) {
      mutableBlock = MUTABLE_DOCUMENT_FIELDS.has(match[1]);
      return mutableBlock ? [`${match[1]}: [MUTABLE]`] : [line];
    }
    if (mutableBlock && /^\s+/.test(line)) return [];
    mutableBlock = false;
    return [line];
  }).join("\n");
  return `---\n${frontmatter}\n---\n${source.slice(end + 5)}`.trimEnd();
}

export function outcomeDocumentLock(value) {
  return `sha256:${createHash("sha256").update(canonicalOutcomeDocument(value)).digest("hex")}`;
}
