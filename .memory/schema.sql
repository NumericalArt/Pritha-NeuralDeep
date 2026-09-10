-- Techscope memory sidecar schema.
-- Authored Markdown is canonical. This committed database is rebuildable and
-- is part of Pritha's portable memory snapshot.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  status TEXT,
  title TEXT,
  summary TEXT,
  hash TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  indexed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  heading TEXT,
  text TEXT NOT NULL,
  hash TEXT NOT NULL,
  token_count INTEGER,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
USING fts5(
  text,
  heading,
  document_id UNINDEXED,
  chunk_id UNINDEXED
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  canonical_name TEXT,
  description TEXT,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE(type, name)
);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  confidence REAL,
  evidence_document_id TEXT,
  evidence_chunk_id TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_relations_source
ON relations(source_type, source_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_relations_target
ON relations(target_type, target_id, relation_type);

CREATE TABLE IF NOT EXISTS embeddings (
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

CREATE INDEX IF NOT EXISTS idx_embeddings_identity
ON embeddings(provider, model, dimensions, content_hash);

CREATE TABLE IF NOT EXISTS index_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  documents_scanned INTEGER DEFAULT 0,
  documents_changed INTEGER DEFAULT 0,
  chunks_changed INTEGER DEFAULT 0,
  error TEXT
);
