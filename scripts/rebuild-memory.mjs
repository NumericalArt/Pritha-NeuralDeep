#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { resolvePrithaAgentMemoryRoot, resolvePrithaStatePath, resolveTechscopeRoot } from "./lib/paths.mjs";
import { slug } from "./lib/slug.mjs";

const ROOT = resolveTechscopeRoot();
loadPrithaRuntimeEnv({ root: ROOT });
const AGENT_MEMORY_ROOT = resolvePrithaAgentMemoryRoot({ root: ROOT });
const MEMORY_DIR = resolvePrithaStatePath("memory");
const DB_PATH = path.join(MEMORY_DIR, "techscope.sqlite");
const SCHEMA_PATH = path.join(ROOT, ".memory", "schema.sql");

const INCLUDE_DIRS = [
  "00_inbox",
  "01_sources/notes",
  "01_sources/signals",
  "02_briefs",
  "03_reviews",
  "04_standards",
  "05_decisions",
  "06_subagents",
  "07_workflows",
  "08_templates",
  "10_wiki",
  "11_agents",
  "12_marketing",
];

const RELATION_TYPES = new Set([
  "assessments",
  "intakes",
  "briefs",
  "reviews",
  "decisions",
  "standards",
  "workflows",
  "sources",
  "signals",
  "wiki_pages",
  "templates",
  "agent_contracts",
  "scaffold_reports",
  "agent_test_reports",
  "agent_handoff_reports",
  "agent_operations_reports",
  "agent_deployment_reports",
  "agent_post_creation_reviews",
  "agent_registries",
  "supersedes",
  "superseded_by",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "NULL";
  return String(Number(value));
}

function runSql(sql) {
  execFileSync("sqlite3", [DB_PATH], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
  });
}

function querySqlJson(sql) {
  const output = execFileSync("sqlite3", ["-json", DB_PATH, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
  return output.trim() ? JSON.parse(output) : [];
}

function migrateEmbeddingSchema() {
  if (!existsSync(DB_PATH)) return;
  const columns = querySqlJson("PRAGMA table_info(embeddings);");
  if (columns.length > 0 && !columns.some((column) => column.name === "content_hash")) {
    runSql("ALTER TABLE embeddings ADD COLUMN content_hash TEXT;");
  }
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      out.push(...listMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      out.push(fullPath);
    }
  }
  return out;
}

function documentIdForFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const { data } = parseFrontmatter(raw);
  return data.id || path.relative(ROOT, filePath).replace(/\.md$/, "").replaceAll(path.sep, "/");
}

function canonicalMarkdownFiles() {
  const byDocumentId = new Map();
  const trackedAgentRoot = path.join(ROOT, "11_agents");
  const isInside = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  const chooseCandidate = (candidate, existing) => candidate.modifiedAt > existing.modifiedAt
    || (candidate.modifiedAt === existing.modifiedAt && candidate.file.localeCompare(existing.file) > 0);
  const addFiles = (sourceFiles, sourceName, precedence) => {
    for (const file of sourceFiles) {
      const id = documentIdForFile(file);
      const candidate = { file, sourceName, precedence, modifiedAt: statSync(file).mtimeMs };
      const existing = byDocumentId.get(id);
      if (sourceName === "instance-agent-state" && existing?.sourceName === "tracked" && !isInside(trackedAgentRoot, existing.file)) {
        throw new Error(`Instance-local agent document id collides with tracked platform knowledge: ${id}`);
      }
      if (sourceName === "instance-agent-state" && existing?.sourceName === "instance-agent-state") {
        const selected = chooseCandidate(candidate, existing) ? candidate : existing;
        console.warn(`Warning: duplicate instance-local document id "${id}"; selected ${path.basename(selected.file)} by mtime/path precedence.`);
      }
      if (!existing
        || candidate.precedence > existing.precedence
        || (candidate.precedence === existing.precedence && chooseCandidate(candidate, existing))) {
        byDocumentId.set(id, candidate);
      }
    }
  };

  const trackedFiles = INCLUDE_DIRS.flatMap((dir) => listMarkdownFiles(path.join(ROOT, dir))).sort();
  addFiles(trackedFiles, "tracked", 1);

  if (path.resolve(AGENT_MEMORY_ROOT) !== path.resolve(trackedAgentRoot)) {
    const instanceAgentFiles = listMarkdownFiles(AGENT_MEMORY_ROOT).sort();
    addFiles(instanceAgentFiles, "instance-agent-state", 2);
  }

  return [...byDocumentId.values()]
    .map((entry) => entry.file)
    .sort((left, right) => path.relative(ROOT, left).localeCompare(path.relative(ROOT, right)));
}

function extractTitle(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function extractSummary(body) {
  const summaryMatch = body.match(/## Summary\s+([\s\S]*?)(?:\n## |\n# |$)/);
  if (!summaryMatch) return "";
  return summaryMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
}

function chunkMarkdown(body) {
  const lines = body.split(/\r?\n/);
  const chunks = [];
  let heading = "";
  let buffer = [];

  function flush() {
    const text = buffer.join("\n").trim();
    if (text) chunks.push({ heading, text });
    buffer = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = headingMatch[2].trim();
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();

  if (chunks.length === 0 && body.trim()) {
    chunks.push({ heading: "", text: body.trim() });
  }

  return chunks;
}

function tokenEstimate(text) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);
}

function entityId(type, name) {
  const cleanSlug = slug(name, { allowCyrillic: true, fallback: "" });
  const suffix = sha256(`${type}:${name}`).slice(0, 10);
  return `${type}:${cleanSlug ? `${cleanSlug}-` : ""}${suffix}`;
}

function relationId(sourceType, sourceId, relationType, targetType, targetId) {
  return sha256([sourceType, sourceId, relationType, targetType, targetId].join("|"));
}

function upsertEntitySql(type, name, now) {
  const id = entityId(type, name);
  return `
INSERT INTO entities (id, type, name, canonical_name, created_at, updated_at)
VALUES (${sqlString(id)}, ${sqlString(type)}, ${sqlString(name)}, ${sqlString(String(name).toLowerCase())}, ${sqlString(now)}, ${sqlString(now)})
ON CONFLICT(type, name) DO UPDATE SET
  canonical_name = excluded.canonical_name,
  updated_at = excluded.updated_at;
`;
}

function upsertRelationSql(sourceType, sourceId, relationType, targetType, targetId, evidenceDocumentId, now) {
  const id = relationId(sourceType, sourceId, relationType, targetType, targetId);
  return `
INSERT INTO relations (
  id, source_type, source_id, relation_type, target_type, target_id, confidence,
  evidence_document_id, evidence_chunk_id, created_at, updated_at
)
VALUES (
  ${sqlString(id)}, ${sqlString(sourceType)}, ${sqlString(sourceId)}, ${sqlString(relationType)},
  ${sqlString(targetType)}, ${sqlString(targetId)}, ${sqlNumber(1)},
  ${sqlString(evidenceDocumentId)}, NULL, ${sqlString(now)}, ${sqlString(now)}
)
ON CONFLICT(id) DO UPDATE SET
  confidence = excluded.confidence,
  evidence_document_id = excluded.evidence_document_id,
  updated_at = excluded.updated_at;
`;
}

function indexDocument(filePath, now) {
  const relPath = path.relative(ROOT, filePath);
  const raw = readFileSync(filePath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const id = data.id || relPath.replace(/\.md$/, "").replaceAll(path.sep, "/");
  const type = data.type || "note";
  const status = data.status || "";
  const title = extractTitle(body, path.basename(filePath, ".md"));
  const summary = extractSummary(body);
  const hash = sha256(raw);
  const created = data.created || data["date added"] || "";
  const updated = data.updated || "";
  const chunks = chunkMarkdown(body);

  let sql = `
INSERT INTO documents (id, path, type, status, title, summary, hash, created_at, updated_at, indexed_at)
VALUES (
  ${sqlString(id)}, ${sqlString(relPath)}, ${sqlString(type)}, ${sqlString(status)}, ${sqlString(title)},
  ${sqlString(summary)}, ${sqlString(hash)}, ${sqlString(created)}, ${sqlString(updated)}, ${sqlString(now)}
)
ON CONFLICT(id) DO UPDATE SET
  path = excluded.path,
  type = excluded.type,
  status = excluded.status,
  title = excluded.title,
  summary = excluded.summary,
  hash = excluded.hash,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  indexed_at = excluded.indexed_at;

DELETE FROM chunks WHERE document_id = ${sqlString(id)};
DELETE FROM chunks_fts WHERE document_id = ${sqlString(id)};
`;

  chunks.forEach((chunk, index) => {
    const chunkId = `${id}#${index + 1}`;
    const chunkHash = sha256(chunk.text);
    sql += `
INSERT INTO chunks (id, document_id, ordinal, heading, text, hash, token_count)
VALUES (
  ${sqlString(chunkId)}, ${sqlString(id)}, ${index + 1}, ${sqlString(chunk.heading)},
  ${sqlString(chunk.text)}, ${sqlString(chunkHash)}, ${tokenEstimate(chunk.text)}
);
INSERT INTO chunks_fts (text, heading, document_id, chunk_id)
VALUES (${sqlString(chunk.text)}, ${sqlString(chunk.heading)}, ${sqlString(id)}, ${sqlString(chunkId)});
`;
  });

  const topics = Array.isArray(data.topics) ? data.topics : [];
  const tools = Array.isArray(data.tools) ? data.tools : [];
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const domains = [
    ...(data.memory_domain ? [data.memory_domain] : []),
    ...(Array.isArray(data.memory_domains) ? data.memory_domains : []),
  ].filter(Boolean);
  const privacy = data.privacy || "";
  const reviewStatus = data.review_status || "";
  const subjectKind = data.subject && typeof data.subject === "object" && !Array.isArray(data.subject) ? data.subject.kind : "";
  const subjectId = data.subject && typeof data.subject === "object" && !Array.isArray(data.subject) ? data.subject.id : "";

  for (const topic of topics) {
    sql += upsertEntitySql("topic", topic, now);
    sql += upsertRelationSql("document", id, "MENTIONS", "topic", entityId("topic", topic), id, now);
  }

  for (const tool of tools) {
    sql += upsertEntitySql("tool", tool, now);
    sql += upsertRelationSql("document", id, "MENTIONS", "tool", entityId("tool", tool), id, now);
  }

  for (const source of sources) {
    sql += upsertEntitySql("source", source, now);
    sql += upsertRelationSql("document", id, "DERIVED_FROM", "source", entityId("source", source), id, now);
  }

  for (const domain of [...new Set(domains.map(String))]) {
    sql += upsertEntitySql("memory-domain", domain, now);
    sql += upsertRelationSql("document", id, "IN_DOMAIN", "memory-domain", entityId("memory-domain", domain), id, now);
  }

  if (privacy) {
    sql += upsertEntitySql("privacy", privacy, now);
    sql += upsertRelationSql("document", id, "HAS_PRIVACY", "privacy", entityId("privacy", privacy), id, now);
  }

  if (reviewStatus) {
    sql += upsertEntitySql("review-status", reviewStatus, now);
    sql += upsertRelationSql("document", id, "HAS_REVIEW_STATUS", "review-status", entityId("review-status", reviewStatus), id, now);
  }

  if (subjectKind && subjectId) {
    const subjectName = `${subjectKind}:${subjectId}`;
    sql += upsertEntitySql("subject", subjectName, now);
    sql += upsertRelationSql("document", id, "ABOUT_SUBJECT", "subject", entityId("subject", subjectName), id, now);
  }

  if (data.related && typeof data.related === "object" && !Array.isArray(data.related)) {
    for (const [key, values] of Object.entries(data.related)) {
      if (!RELATION_TYPES.has(key)) continue;
      const list = Array.isArray(values) ? values : [values];
      for (const value of list.filter(Boolean)) {
        sql += upsertRelationSql("document", id, "RELATES_TO", key.replace(/s$/, ""), String(value), id, now);
      }
    }
  }

  return { sql, changed: true, chunks: chunks.length };
}

function main() {
  mkdirSync(MEMORY_DIR, { recursive: true });
  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`Missing schema: ${SCHEMA_PATH}`);
  }
  migrateEmbeddingSchema();
  runSql(readFileSync(SCHEMA_PATH, "utf8"));

  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const files = canonicalMarkdownFiles();

  let documentsChanged = 0;
  let chunksChanged = 0;
  let sql = "BEGIN;\n";
  sql += `
CREATE TEMP TABLE IF NOT EXISTS preserved_embedding_chunk_hash AS
SELECT e.id AS embedding_id, c.hash AS chunk_hash
FROM embeddings e
JOIN chunks c ON e.owner_type = 'chunk' AND c.id = e.owner_id;

DELETE FROM relations;
DELETE FROM entities;
DELETE FROM chunks_fts;
DELETE FROM chunks;
DELETE FROM documents;

INSERT INTO index_runs (id, started_at, status, documents_scanned)
VALUES (${sqlString(runId)}, ${sqlString(startedAt)}, 'running', ${files.length});
`;

  for (const file of files) {
    const result = indexDocument(file, startedAt);
    sql += result.sql;
    documentsChanged += result.changed ? 1 : 0;
    chunksChanged += result.chunks;
  }

  sql += `
DELETE FROM embeddings
WHERE owner_type = 'chunk'
  AND (
    NOT EXISTS (
      SELECT 1
      FROM chunks c
      WHERE c.id = embeddings.owner_id
    )
    OR EXISTS (
      SELECT 1
      FROM preserved_embedding_chunk_hash p
      JOIN chunks c ON c.id = embeddings.owner_id
      WHERE p.embedding_id = embeddings.id
        AND p.chunk_hash != c.hash
    )
  );

UPDATE embeddings
SET content_hash = (
  SELECT c.hash
  FROM chunks c
  WHERE c.id = embeddings.owner_id
)
WHERE owner_type = 'chunk';

DROP TABLE IF EXISTS preserved_embedding_chunk_hash;

UPDATE index_runs
SET finished_at = ${sqlString(new Date().toISOString())},
    status = 'success',
    documents_scanned = ${files.length},
    documents_changed = ${documentsChanged},
    chunks_changed = ${chunksChanged}
WHERE id = ${sqlString(runId)};
COMMIT;
`;

  const tmpSql = path.join(MEMORY_DIR, "last-rebuild.sql");
  writeFileSync(tmpSql, sql);
  runSql(sql);
  runSql("VACUUM;");

  console.log(`Indexed ${files.length} documents, ${chunksChanged} chunks.`);
  console.log(`Database: ${path.relative(ROOT, DB_PATH)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
