import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rebuildSource = readFileSync("scripts/rebuild-memory.mjs", "utf8");
const embedSource = readFileSync("scripts/embed-memory.py", "utf8");
const semanticSearchSource = readFileSync("scripts/semantic-search.py", "utf8");

test("memory rebuild preserves usable embeddings instead of clearing the table", () => {
  assert.doesNotMatch(rebuildSource, /DELETE FROM embeddings;\s*DELETE FROM relations;/);
  assert.match(rebuildSource, /preserved_embedding_chunk_hash/);
  assert.match(rebuildSource, /p\.chunk_hash != c\.hash/);
  assert.match(rebuildSource, /NOT EXISTS \(\s*SELECT 1\s*FROM chunks c\s*WHERE c\.id = embeddings\.owner_id/s);
});

test("embedding generation is non-destructive and patches local Python import compatibility", () => {
  assert.match(embedSource, /apply_runtime_compat\(\)/);
  assert.match(semanticSearchSource, /apply_runtime_compat\(\)/);
  assert.match(embedSource, /model\.encode\(/);
  assert.match(embedSource, /ON CONFLICT\(owner_type, owner_id, provider, model\) DO UPDATE SET/);
  assert.doesNotMatch(embedSource, /DELETE FROM embeddings WHERE provider = \? AND model = \?["']?,/);
});
