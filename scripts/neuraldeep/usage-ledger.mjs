import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { neuralDeepRuntimeIdentity } from "./runtime-identity.mjs";

const SOURCES = new Set(["codex-chat", "agent-mother", "child-agent", "voice-dialogue", "embeddings", "unmetered"]);
const RANGES = Object.freeze({ "24h": 24 * 60 * 60_000, "7d": 7 * 24 * 60 * 60_000, "30d": 30 * 24 * 60 * 60_000 });
const MAX_LEGACY_PROVENANCE_BYTES = 4 * 1024 * 1024;

function count(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function money(value) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function safeToken(value, fallback = null, max = 192) {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text) ? text : fallback;
}

export function normalizeNeuralDeepUsage(value = {}) {
  value = value && typeof value === "object" ? value : {};
  const input = count(value.input_tokens ?? value.inputTokens ?? value.prompt_tokens);
  const cached = Math.min(input, count(value.cached_input_tokens ?? value.cachedInputTokens ?? value.input_tokens_details?.cached_tokens ?? value.prompt_tokens_details?.cached_tokens));
  const output = count(value.output_tokens ?? value.outputTokens ?? value.completion_tokens);
  const reasoning = Math.min(output, count(value.reasoning_tokens ?? value.reasoningTokens ?? value.reasoning_output_tokens ?? value.output_tokens_details?.reasoning_tokens ?? value.completion_tokens_details?.reasoning_tokens));
  const total = count(value.total_tokens ?? value.totalTokens) || input + output;
  return { inputTokens: input, cachedInputTokens: cached, outputTokens: output, reasoningTokens: reasoning, totalTokens: total };
}

export function neuralDeepUsageKnown(value) {
  if (!value || typeof value !== "object") return false;
  const input = value.input_tokens ?? value.inputTokens ?? value.prompt_tokens;
  const output = value.output_tokens ?? value.outputTokens ?? value.completion_tokens;
  if (![input, output].every(v => Number.isSafeInteger(v) && v >= 0) || !Number.isSafeInteger(input + output)) return false;
  const total = value.total_tokens ?? value.totalTokens;
  return total === undefined || Number.isSafeInteger(total) && total === input + output;
}

export function estimateWalletCost(usageValue, price) {
  const usage = normalizeNeuralDeepUsage(usageValue);
  const inputRate = money(price?.inputRubPerMillion);
  const cachedRate = money(price?.cachedInputRubPerMillion);
  const outputRate = money(price?.outputRubPerMillion);
  if (inputRate == null || outputRate == null) return null;
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const effectiveCachedRate = cachedRate == null ? inputRate : cachedRate;
  return ((uncachedInput * inputRate) + (usage.cachedInputTokens * effectiveCachedRate) + (usage.outputTokens * outputRate)) / 1_000_000;
}

export function neuralDeepUsageLedgerPath(stateRoot) {
  return path.join(path.resolve(stateRoot), "private", "neuraldeep", "neuraldeep-usage.sqlite");
}

function openLedger(stateRoot) {
  const file = neuralDeepUsageLedgerPath(stateRoot);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(file), 0o700);
  const db = new DatabaseSync(file);
  // Install the busy handler before WAL/schema initialization so concurrent
  // Codex processes wait rather than losing usage rows during first-open races.
  db.exec("PRAGMA busy_timeout=5000;");
  try {
    db.exec("PRAGMA journal_mode=WAL;");
  } catch (error) {
    if (error?.errcode !== 5 && !/database is locked/i.test(String(error?.message || ""))) throw error;
    // Another first-open process is selecting WAL. Its setting is persistent;
    // this connection can safely continue after the busy handler is installed.
  }
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec("BEGIN IMMEDIATE");
  try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO ledger_meta(key, value) VALUES ('schema_version', '2');
    CREATE TABLE IF NOT EXISTS session_totals (
      session_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(session_id, model)
    );
    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      source TEXT NOT NULL,
      workload_id TEXT,
      model TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      provider_requests INTEGER NOT NULL,
      usage_known INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      cumulative_input_tokens INTEGER NOT NULL,
      cumulative_cached_input_tokens INTEGER NOT NULL,
      cumulative_output_tokens INTEGER NOT NULL,
      cumulative_reasoning_tokens INTEGER NOT NULL,
      cumulative_total_tokens INTEGER NOT NULL,
      cumulative_reset INTEGER NOT NULL DEFAULT 0,
      billing_mode TEXT NOT NULL,
      tier TEXT,
      price_snapshot_json TEXT,
      estimated_cost_rub REAL,
      cost_status TEXT NOT NULL,
      provider_error_class TEXT,
      provider_error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS runs_finished_at_idx ON runs(finished_at);
    CREATE INDEX IF NOT EXISTS runs_source_idx ON runs(source, finished_at);
    CREATE INDEX IF NOT EXISTS runs_model_idx ON runs(model, finished_at);
  `);
  const runColumns = db.prepare("PRAGMA table_info(runs)").all();
  if (!runColumns.some((column) => column.name === "usage_known")) {
    db.exec("ALTER TABLE runs ADD COLUMN usage_known INTEGER NOT NULL DEFAULT 0");
  }
  if (!runColumns.some((column) => column.name === "profile_identity")) {
    db.exec("ALTER TABLE runs ADD COLUMN profile_identity TEXT");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS profile_session_totals (
    profile_identity TEXT NOT NULL, session_id TEXT NOT NULL, model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL, cached_input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL, reasoning_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_identity, session_id, model));
    CREATE INDEX IF NOT EXISTS runs_profile_session_idx ON runs(profile_identity,session_id);
  `);
  db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  chmodSync(file, 0o600);
  return db;
}

function deltaUsage(current, previous, cumulative) {
  if (!cumulative || !previous) return { usage: current, reset: false };
  const keys = ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "totalTokens"];
  const reset = keys.some((key) => current[key] < previous[key]);
  if (reset) return { usage: current, reset: true };
  return {
    usage: Object.fromEntries(keys.map((key) => [key, Math.max(0, current[key] - previous[key])])),
    reset: false,
  };
}

export function recordNeuralDeepRun(options) {
  const runId = safeToken(options.runId, null, 160);
  const model = safeToken(options.model, "unknown");
  if (!runId) throw new Error("invalid_neuraldeep_usage_run_id");
  const source = SOURCES.has(options.source) ? options.source : "unmetered";
  const sessionId = safeToken(options.sessionId, null, 160);
  const profile = options.profileIdentity || neuralDeepRuntimeIdentity(options.stateRoot).profileIdentity;
  if (!/^[a-f0-9]{64}$/.test(profile)) throw new Error("neuraldeep_usage_profile_invalid");
  const cumulative = options.cumulative === true && Boolean(sessionId);
  const observationKnown = options.usageKnown !== false && neuralDeepUsageKnown(options.usage);
  let usageKnown = observationKnown;
  const current = normalizeNeuralDeepUsage(options.usage);
  const billing = options.billing || {};
  const billingMode = ["subscription", "wallet"].includes(billing.mode) ? billing.mode : "unknown";
  const price = billing.price || null;
  const db = openLedger(options.stateRoot);
  try {
    db.exec("BEGIN IMMEDIATE");
    const existing = db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId);
    if (existing) {
      db.exec("ROLLBACK");
      if (existing.model !== model || existing.session_id !== sessionId || existing.source !== source || (existing.profile_identity && existing.profile_identity !== profile)) throw new Error("neuraldeep_usage_identity_conflict");
      return { inserted: false, duplicate: true, runId, usageKnown: Boolean(existing.usage_known),
        usage: { inputTokens: existing.input_tokens, outputTokens: existing.output_tokens, cachedInputTokens: existing.cached_input_tokens,
          reasoningTokens: existing.reasoning_tokens, totalTokens: existing.total_tokens },
        estimatedCostRub: existing.estimated_cost_rub, costStatus: existing.cost_status, cumulativeReset: Boolean(existing.cumulative_reset) };
    }
    const previous = cumulative
      ? db.prepare("SELECT * FROM profile_session_totals WHERE profile_identity = ? AND session_id = ? AND model = ?").get(profile, sessionId, model)
      : null;
    // Legacy rows did not record the home/provider identity. Retain them and
    // establish a new scoped baseline without pretending this transition delta
    // is known or billing the whole historical cumulative counter again.
    const legacyBaseline = cumulative && !previous
      && db.prepare("SELECT 1 FROM session_totals WHERE session_id=? AND model=?").get(sessionId, model);
    if (legacyBaseline) usageKnown = false;
    const previousUsage = previous ? {
      inputTokens: count(previous.input_tokens),
      cachedInputTokens: count(previous.cached_input_tokens),
      outputTokens: count(previous.output_tokens),
      reasoningTokens: count(previous.reasoning_tokens),
      totalTokens: count(previous.total_tokens),
    } : null;
    const delta = usageKnown
      ? deltaUsage(current, previousUsage, cumulative)
      : { usage: current, reset: false };
    const estimatedCostRub = billingMode === "wallet" && usageKnown ? estimateWalletCost(delta.usage, price) : null;
    const costStatus = billingMode === "subscription"
      ? "included_in_subscription"
      : billingMode === "wallet"
        ? !usageKnown ? "usage_unavailable" : estimatedCostRub == null ? "unknown_price" : "estimated"
        : "unknown_billing_mode";
    const startedAt = new Date(options.startedAt || Date.now()).toISOString();
    const finishedAt = new Date(options.finishedAt || Date.now()).toISOString();
    db.prepare(`INSERT INTO runs (
      run_id, schema_version, source, workload_id, model, session_id, status, started_at, finished_at,
      provider_requests, usage_known, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
      cumulative_input_tokens, cumulative_cached_input_tokens, cumulative_output_tokens,
      cumulative_reasoning_tokens, cumulative_total_tokens, cumulative_reset, billing_mode, tier,
      price_snapshot_json, estimated_cost_rub, cost_status, provider_error_class, provider_error_code
    ) VALUES (?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        runId, source, safeToken(options.workloadId, null, 160), model, sessionId,
        safeToken(options.status, "unknown", 48), startedAt, finishedAt, count(options.providerRequests), usageKnown ? 1 : 0,
        delta.usage.inputTokens, delta.usage.cachedInputTokens, delta.usage.outputTokens,
        delta.usage.reasoningTokens, delta.usage.totalTokens,
        current.inputTokens, current.cachedInputTokens, current.outputTokens, current.reasoningTokens,
        current.totalTokens, delta.reset ? 1 : 0, billingMode, safeToken(billing.tier, null, 80),
        price ? JSON.stringify(price) : null, estimatedCostRub, costStatus,
        safeToken(options.providerError?.class, null, 48), safeToken(options.providerError?.code, null, 96),
      );
    if (cumulative && observationKnown) {
      db.prepare(`INSERT INTO profile_session_totals (
        profile_identity, session_id, model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_identity, session_id, model) DO UPDATE SET
        input_tokens=excluded.input_tokens,
        cached_input_tokens=excluded.cached_input_tokens,
        output_tokens=excluded.output_tokens,
        reasoning_tokens=excluded.reasoning_tokens,
        total_tokens=excluded.total_tokens,
        updated_at=excluded.updated_at`)
        .run(profile, sessionId, model, current.inputTokens, current.cachedInputTokens, current.outputTokens, current.reasoningTokens, current.totalTokens, finishedAt);
    }
    db.prepare("UPDATE runs SET profile_identity=? WHERE run_id=?").run(profile, runId);
    db.exec("COMMIT");
    return { inserted: true, duplicate: false, runId, usageKnown, usage: delta.usage, estimatedCostRub, costStatus, cumulativeReset: delta.reset };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction may not have started */ }
    throw error;
  } finally {
    db.close();
  }
}

/** Read the existing provider ledger, never a second additive Task Chat counter. */
export function readNeuralDeepSessionUsage({ stateRoot, profileIdentity, sessionId }) {
  if (!/^[a-f0-9]{64}$/.test(profileIdentity || "") || !safeToken(sessionId)) throw new Error("neuraldeep_usage_identity_invalid");
  const file = neuralDeepUsageLedgerPath(stateRoot);
  if (!existsSync(file)) return { observedTokens: null, measuredRuns: 0, unknownRuns: 0, legacyRuns: 0 };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=1000");
    const columns = db.prepare("PRAGMA table_info(runs)").all();
    if (!columns.some(column => column.name === "profile_identity")) return { observedTokens: null, measuredRuns: 0, unknownRuns: 0, legacyRuns: Number(db.prepare("SELECT COUNT(*) n FROM runs WHERE session_id=?").get(sessionId).n) };
    const row = db.prepare(`SELECT SUM(CASE WHEN usage_known=1 THEN total_tokens END) observedTokens,
      SUM(CASE WHEN usage_known=1 THEN 1 ELSE 0 END) measuredRuns,
      SUM(CASE WHEN usage_known=0 THEN 1 ELSE 0 END) unknownRuns
      FROM runs WHERE profile_identity=? AND session_id=?`).get(profileIdentity, sessionId);
    const legacy = db.prepare("SELECT COUNT(*) n FROM runs WHERE session_id=? AND profile_identity IS NULL").get(sessionId);
    return { observedTokens: row.observedTokens ?? null, measuredRuns: row.measuredRuns || 0, unknownRuns: row.unknownRuns || 0, legacyRuns: Number(legacy.n) };
  } finally { db.close(); }
}

function aggregateRows(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const id = String(row[key] || "unknown");
    const current = groups.get(id) || { id, runs: 0, providerRequests: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostRub: 0, estimatedCostRuns: 0 };
    current.runs += 1;
    current.providerRequests += count(row.provider_requests);
    if (row.usage_known) {
      current.inputTokens += count(row.input_tokens);
      current.cachedInputTokens += count(row.cached_input_tokens);
      current.outputTokens += count(row.output_tokens);
      current.totalTokens += count(row.total_tokens);
    }
    if (row.estimated_cost_rub != null) {
      current.estimatedCostRub += Number(row.estimated_cost_rub);
      current.estimatedCostRuns += 1;
    }
    groups.set(id, current);
  }
  return [...groups.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.id.localeCompare(b.id));
}

function legacyProvenanceRows(stateRoot, since, knownRunIds) {
  const file = path.join(path.resolve(stateRoot), "logs", "neuraldeep-runtime.jsonl");
  if (!existsSync(file)) return [];
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - MAX_LEGACY_PROVENANCE_BYTES);
    const buffer = Buffer.alloc(size - start);
    const descriptor = openSync(file, "r");
    try {
      readSync(descriptor, buffer, 0, buffer.length, start);
    } finally {
      closeSync(descriptor);
    }
    const lines = buffer.toString("utf8").split("\n");
    if (start > 0) lines.shift();
    return lines.map((line) => {
      if (!line.trim()) return null;
      let event;
      try { event = JSON.parse(line); } catch { return null; }
      const runId = safeToken(event?.run_id, null, 160);
      const timestamp = Date.parse(String(event?.timestamp || event?.finished_at || ""));
      if (!Number.isFinite(timestamp)) return null;
      const finishedAt = new Date(timestamp).toISOString();
      if (event?.event !== "run_finished" || !runId || knownRunIds.has(runId) || finishedAt < since) return null;
      return {
        run_id: runId,
        source: "unmetered",
        model: safeToken(event?.model, "unknown"),
        status: Number(event?.exit_code) === 0 ? "completed" : "failed",
        finished_at: finishedAt,
        provider_requests: 0,
        usage_known: 0,
        input_tokens: 0,
        cached_input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        billing_mode: "unknown",
        estimated_cost_rub: null,
        cost_status: "legacy_unmetered",
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function summarizeNeuralDeepUsage({ stateRoot, range = "24h", now = Date.now() }) {
  if (!Object.hasOwn(RANGES, range)) throw new Error("invalid_neuraldeep_usage_range");
  const since = new Date(Number(now) - RANGES[range]).toISOString();
  let db;
  try {
    db = openLedger(stateRoot);
    const meteredRows = db.prepare("SELECT * FROM runs WHERE finished_at >= ? ORDER BY finished_at DESC").all(since);
    const rows = [...meteredRows, ...legacyProvenanceRows(stateRoot, since, new Set(meteredRows.map((row) => row.run_id)))]
      .sort((left, right) => String(right.finished_at).localeCompare(String(left.finished_at)));
    const totals = aggregateRows(rows, "__all")[0] || { id: "unknown", runs: 0, providerRequests: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostRub: 0, estimatedCostRuns: 0 };
    return {
      schema: "pritha-neuraldeep-usage-summary-v1",
      range,
      since,
      generatedAt: new Date(Number(now)).toISOString(),
      authoritativeBalance: false,
      costIsEstimate: true,
      totals: { ...totals, id: undefined },
      bySource: aggregateRows(rows, "source").map(({ id, ...rest }) => ({ source: id, ...rest })),
      byModel: aggregateRows(rows, "model").map(({ id, ...rest }) => ({ model: id, ...rest })),
      recent: rows.slice(0, 50).map((row) => ({
        runId: row.run_id,
        source: row.source,
        model: row.model,
        status: row.status,
        finishedAt: row.finished_at,
        providerRequests: row.provider_requests,
        usageKnown: row.usage_known === 1,
        inputTokens: row.input_tokens,
        cachedInputTokens: row.cached_input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        billingMode: row.billing_mode,
        estimatedCostRub: row.estimated_cost_rub,
        costStatus: row.cost_status,
      })),
    };
  } finally {
    db?.close();
  }
}
