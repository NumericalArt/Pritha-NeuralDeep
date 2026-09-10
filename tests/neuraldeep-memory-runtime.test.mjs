import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const remoteIndexerSource = readFileSync("scripts/embed-memory-neuraldeep.mjs", "utf8");
const semanticSearchSource = readFileSync("scripts/semantic-search.py", "utf8");
const settingsSource = readFileSync("interfaces/control-center/src/lib/settings/embeddings-settings.ts", "utf8");
const privateContextSource = readFileSync("interfaces/control-center/src/lib/private-user-context.ts", "utf8");

function fixtureState() {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-neuraldeep-memory-"));
  mkdirSync(path.join(stateRoot, "memory"), { recursive: true });
  mkdirSync(path.join(stateRoot, "config"), { recursive: true });
  const database = path.join(stateRoot, "memory", "techscope.sqlite");
  execFileSync("sqlite3", [database], {
    input: `
      CREATE TABLE documents (id TEXT PRIMARY KEY, type TEXT NOT NULL, path TEXT NOT NULL);
      CREATE TABLE chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE embeddings (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        content_hash TEXT,
        vector BLOB,
        vector_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(owner_type, owner_id, provider, model)
      );
      INSERT INTO documents VALUES ('doc-public', 'standard', '04_standards/example.md');
      INSERT INTO documents VALUES ('doc-template', 'template', 'templates/example.md');
      INSERT INTO chunks VALUES ('chunk-public', 'doc-public', 0, 'public memory', 'hash-public');
      INSERT INTO chunks VALUES ('chunk-template', 'doc-template', 0, 'template memory', 'hash-template');
    `,
  });
  return { stateRoot, database };
}

test("NeuralDeep embeddings dry-run counts only eligible missing chunks", () => {
  const { stateRoot, database } = fixtureState();
  const environment = { ...process.env, PRITHA_STATE_ROOT: stateRoot, TECHSCOPE_ROOT: process.cwd() };
  const first = spawnSync(process.execPath, ["scripts/embed-memory-neuraldeep.mjs", "--model", "fixture-embed", "--dry-run"], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr);
  const firstPayload = JSON.parse(first.stdout);
  assert.equal(firstPayload.pending, 1);
  assert.equal(Number(firstPayload.coverage.eligible), 1);

  execFileSync("sqlite3", [database], {
    input: `
      INSERT INTO embeddings VALUES (
        'remote-id', 'chunk', 'chunk-public', 'neuraldeep', 'fixture-embed', 3,
        'hash-public', NULL, '[0.1,0.2,0.3]', '2026-08-31T00:00:00.000Z'
      );
    `,
  });
  const second = spawnSync(process.execPath, ["scripts/embed-memory-neuraldeep.mjs", "--model", "fixture-embed", "--dry-run"], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
  });
  assert.equal(second.status, 0, second.stderr);
  const secondPayload = JSON.parse(second.stdout);
  assert.equal(secondPayload.pending, 0);
  assert.equal(Number(secondPayload.coverage.embedded), 1);
  assert.equal(Number(secondPayload.coverage.dimension_count), 1);
});

test("local and NeuralDeep embeddings remain independently addressable", () => {
  assert.match(remoteIndexerSource, /PROVIDER = "neuraldeep"/);
  assert.match(remoteIndexerSource, /content_hash = c\.hash/);
  assert.match(remoteIndexerSource, /mixed_neuraldeep_embedding_dimensions/);
  assert.match(settingsSource, /activeProvider: "local"/);
  assert.match(settingsSource, /if \(!coverage\.complete \|\| !coverage\.dimensions\) throw new Error\("neuraldeep_embedding_index_incomplete"\)/);
  assert.match(semanticSearchSource, /return "local", LOCAL_PROVIDER, LOCAL_MODEL/);
  assert.match(semanticSearchSource, /using retained local index/);
});

test("private user model is retrieved from a bounded separate store", () => {
  assert.match(privateContextSource, /"private", "user-memory"/);
  assert.match(privateContextSource, /const MAX_FRAGMENTS = 4/);
  assert.match(privateContextSource, /const MAX_FRAGMENT_CHARS = 900/);
  assert.match(privateContextSource, /do not quote or reveal this block/);
  assert.doesNotMatch(privateContextSource, /techscope\.sqlite/);
});
