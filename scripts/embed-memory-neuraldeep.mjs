#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { createHash } from "node:crypto";

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { atomicWriteFile } from "./lib/atomic-file.mjs";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";
import { billingContextForModel, loadNeuralDeepAccountSnapshot } from "./neuraldeep/account-snapshot.mjs";
import { classifyNeuralDeepProviderError } from "./neuraldeep/provider-error.mjs";
import { recordNeuralDeepRun } from "./neuraldeep/usage-ledger.mjs";

const ROOT = resolveTechscopeRoot();
loadPrithaRuntimeEnv({ root: ROOT });
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });
const DB_PATH = resolvePrithaStatePath("memory", "techscope.sqlite");
const CONFIG_PATH = resolvePrithaStatePath("config", "embeddings.json");
const STATUS_PATH = resolvePrithaStatePath("config", "neuraldeep-embeddings-status.json");
const PROVIDER = "neuraldeep";
const DEFAULT_API_BASE = "https://api.neuraldeep.ru/v1";
const DEFAULT_BATCH_SIZE = 8;
const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;

function parseArguments(argv) {
  const options = { model: "", limit: 0, batchSize: DEFAULT_BATCH_SIZE, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--model") options.model = String(argv[++index] || "").trim();
    else if (token === "--limit") options.limit = Math.max(0, Number.parseInt(argv[++index] || "0", 10) || 0);
    else if (token === "--batch-size") options.batchSize = Math.max(1, Math.min(32, Number.parseInt(argv[++index] || "8", 10) || DEFAULT_BATCH_SIZE));
    else if (token === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown_argument:${token}`);
  }
  if (!options.model && existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      options.model = String(config?.neuraldeep?.model || "").trim();
    } catch { /* a malformed private config is handled by the missing-model check */ }
  }
  if (!SAFE_MODEL.test(options.model)) throw new Error("neuraldeep_embedding_model_required");
  return options;
}

function safeApiBase() {
  const candidate = String(process.env.PRITHA_NEURALDEEP_API_BASE || process.env.NEURALDEEP_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  const parsed = new URL(candidate);
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new Error("unsafe_neuraldeep_api_base");
  return parsed.toString().replace(/\/+$/, "");
}

function readKeychainSecret() {
  const service = String(process.env.PRITHA_NEURALDEEP_KEYCHAIN_SERVICE || "pritha-neuraldeep");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(service)) throw new Error("invalid_keychain_service");
  const result = runSyncProbe("/usr/bin/security", ["find-generic-password", "-s", service, "-w"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
  });
  const key = result.status === 0 ? String(result.stdout || "").trim() : "";
  if (!key) throw new Error("neuraldeep_key_missing");
  return key;
}

function normalizedVector(value) {
  if (!Array.isArray(value) || !value.length || value.some((item) => !Number.isFinite(Number(item)))) {
    throw new Error("invalid_neuraldeep_embedding_vector");
  }
  const vector = value.map(Number);
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (!Number.isFinite(norm) || norm <= 0) throw new Error("invalid_neuraldeep_embedding_norm");
  return vector.map((item) => item / norm);
}

async function requestEmbeddings({ apiBase, key, model, texts }) {
  const response = await fetch(`${apiBase}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: texts, encoding_format: "float" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const providerError = classifyNeuralDeepProviderError({
      status: response.status,
      payload,
      retryAfter: response.headers.get("retry-after"),
    });
    const error = new Error(`neuraldeep_embeddings_${providerError.class}`);
    error.statusCode = response.status;
    error.retryAfter = response.headers.get("retry-after") || null;
    error.providerError = providerError;
    throw error;
  }
  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (rows.length !== texts.length) throw new Error("neuraldeep_embedding_count_mismatch");
  return {
    vectors: rows
      .slice()
      .sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0))
      .map((row) => normalizedVector(row?.embedding)),
    usage: payload?.usage && typeof payload.usage === "object" ? payload.usage : null,
  };
}

function embeddingId(ownerId, model) {
  return createHash("sha256").update(["chunk", ownerId, PROVIDER, model].join("|")).digest("hex");
}

function writeStatus(value) {
  mkdirSync(path.dirname(STATUS_PATH), { recursive: true, mode: 0o700 });
  atomicWriteFile(STATUS_PATH, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function ensureSchema(database) {
  const columns = database.prepare("PRAGMA table_info(embeddings)").all();
  if (!columns.some((column) => column.name === "content_hash")) {
    database.exec("ALTER TABLE embeddings ADD COLUMN content_hash TEXT");
  }
  database.exec("CREATE INDEX IF NOT EXISTS idx_embeddings_identity ON embeddings(provider, model, dimensions, content_hash)");
}

function coverage(database, model) {
  return database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM chunks c JOIN documents d ON d.id = c.document_id WHERE d.type != 'template') AS eligible,
      COUNT(e.id) AS embedded,
      COUNT(DISTINCT e.dimensions) AS dimension_count,
      MIN(e.dimensions) AS dimensions
    FROM chunks c
    JOIN documents d ON d.id = c.document_id AND d.type != 'template'
    LEFT JOIN embeddings e
      ON e.owner_type = 'chunk'
     AND e.owner_id = c.id
     AND e.provider = ?
     AND e.model = ?
     AND e.content_hash = c.hash
  `).get(PROVIDER, model);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!existsSync(DB_PATH)) throw new Error("memory_database_missing");
  const database = new DatabaseSync(DB_PATH);
  ensureSchema(database);
  const before = coverage(database, options.model);
  const limitSql = options.limit > 0 ? ` LIMIT ${options.limit}` : "";
  const pending = database.prepare(`
    SELECT c.id, c.text, c.hash
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    LEFT JOIN embeddings e
      ON e.owner_type = 'chunk'
     AND e.owner_id = c.id
     AND e.provider = ?
     AND e.model = ?
     AND e.content_hash = c.hash
    WHERE d.type != 'template' AND e.id IS NULL
    ORDER BY d.path, c.ordinal${limitSql}
  `).all(PROVIDER, options.model);
  if (options.dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, provider: PROVIDER, model: options.model, pending: pending.length, coverage: before }));
    database.close();
    return;
  }

  const startedAt = new Date().toISOString();
  const baseStatus = { schema: "pritha-neuraldeep-embeddings-status-v1", provider: PROVIDER, model: options.model, pid: process.pid, startedAt };
  writeStatus({ ...baseStatus, status: "running", totalPending: pending.length, processed: 0, coverage: before });
  if (!pending.length) {
    writeStatus({ ...baseStatus, status: "complete", completedAt: new Date().toISOString(), totalPending: 0, processed: 0, coverage: before });
    console.log(JSON.stringify({ ok: true, provider: PROVIDER, model: options.model, processed: 0, coverage: before }));
    database.close();
    return;
  }

  const key = readKeychainSecret();
  const apiBase = safeApiBase();
  const billing = await loadNeuralDeepAccountSnapshot({
    stateRoot: STATE_ROOT,
    token: key,
    apiOrigin: new URL(apiBase).origin,
  }).then((snapshot) => billingContextForModel(snapshot, options.model)).catch(() => ({
    mode: "unknown",
    tier: null,
    price: null,
    capturedAt: new Date().toISOString(),
  }));
  const dimensions = database.prepare("SELECT DISTINCT dimensions FROM embeddings WHERE provider = ? AND model = ?").all(PROVIDER, options.model).map((row) => Number(row.dimensions));
  if (dimensions.length > 1) throw new Error("mixed_neuraldeep_embedding_dimensions");
  let expectedDimensions = dimensions[0] || 0;
  const upsert = database.prepare(`
    INSERT INTO embeddings (
      id, owner_type, owner_id, provider, model, dimensions, content_hash,
      vector, vector_json, created_at
    ) VALUES (?, 'chunk', ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(owner_type, owner_id, provider, model) DO UPDATE SET
      id = excluded.id,
      dimensions = excluded.dimensions,
      content_hash = excluded.content_hash,
      vector = excluded.vector,
      vector_json = excluded.vector_json,
      created_at = excluded.created_at
  `);
  let processed = 0;
  for (let offset = 0; offset < pending.length; offset += options.batchSize) {
    const batch = pending.slice(offset, offset + options.batchSize);
    const batchStartedAt = new Date().toISOString();
    const ledgerRunId = `embedding-${process.pid}-${Date.now().toString(36)}-${offset}`;
    let embeddingResult;
    try {
      embeddingResult = await requestEmbeddings({ apiBase, key, model: options.model, texts: batch.map((row) => row.text) });
    } catch (error) {
      try {
        recordNeuralDeepRun({
          stateRoot: STATE_ROOT,
          runId: ledgerRunId,
          source: "embeddings",
          workloadId: `batch-${offset}`,
          model: options.model,
          status: "failed",
          startedAt: batchStartedAt,
          providerRequests: 1,
          usage: null,
          usageKnown: false,
          cumulative: false,
          billing,
          providerError: error?.providerError || null,
        });
      } catch { /* analytics must not replace the inference error */ }
      throw error;
    }
    const { vectors } = embeddingResult;
    try {
      recordNeuralDeepRun({
        stateRoot: STATE_ROOT,
        runId: ledgerRunId,
        source: "embeddings",
        workloadId: `batch-${offset}`,
        model: options.model,
        status: "completed",
        startedAt: batchStartedAt,
        providerRequests: 1,
        usage: embeddingResult.usage,
        usageKnown: Boolean(embeddingResult.usage),
        cumulative: false,
        billing,
      });
    } catch { /* analytics is fail-open */ }
    const batchDimensions = vectors[0]?.length || 0;
    if (!batchDimensions || vectors.some((vector) => vector.length !== batchDimensions)) throw new Error("mixed_neuraldeep_embedding_dimensions");
    if (expectedDimensions && expectedDimensions !== batchDimensions) throw new Error("neuraldeep_embedding_dimension_changed");
    expectedDimensions = batchDimensions;
    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < batch.length; index += 1) {
        const row = batch[index];
        upsert.run(
          embeddingId(row.id, options.model), row.id, PROVIDER, options.model,
          expectedDimensions, row.hash, JSON.stringify(vectors[index]), now,
        );
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    processed += batch.length;
    writeStatus({ ...baseStatus, status: "running", totalPending: pending.length, processed, dimensions: expectedDimensions, coverage: coverage(database, options.model) });
  }

  if (!options.limit) {
    database.prepare(`
      DELETE FROM embeddings
      WHERE provider = ? AND model = ? AND owner_type = 'chunk'
        AND NOT EXISTS (
          SELECT 1 FROM chunks c
          JOIN documents d ON d.id = c.document_id AND d.type != 'template'
          WHERE c.id = embeddings.owner_id AND c.hash = embeddings.content_hash
        )
    `).run(PROVIDER, options.model);
  }
  const after = coverage(database, options.model);
  database.close();
  const status = Number(after.embedded) === Number(after.eligible) && Number(after.dimension_count) === 1 ? "complete" : "partial";
  writeStatus({ ...baseStatus, status, completedAt: new Date().toISOString(), totalPending: pending.length, processed, dimensions: expectedDimensions, coverage: after });
  console.log(JSON.stringify({ ok: true, provider: PROVIDER, model: options.model, processed, dimensions: expectedDimensions, coverage: after }));
}

main().catch((error) => {
  const statusCode = Number(error?.statusCode) || null;
  const retryAfter = typeof error?.retryAfter === "string" ? error.retryAfter : null;
  const message = error instanceof Error ? error.message : String(error);
  writeStatus({
    schema: "pritha-neuraldeep-embeddings-status-v1",
    status: statusCode === 429 || (statusCode && statusCode >= 500) ? "waiting_for_provider" : "failed",
    provider: PROVIDER,
    error: message,
    statusCode,
    retryAfter,
    failedAt: new Date().toISOString(),
  });
  console.error(JSON.stringify({ ok: false, error: message, statusCode, retryAfter }));
  process.exitCode = statusCode === 429 || (statusCode && statusCode >= 500) ? 75 : 1;
});
