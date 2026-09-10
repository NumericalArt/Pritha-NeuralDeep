import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { atomicWritePrivateJson } from "@/lib/private-json";

export const LOCAL_EMBEDDING_PROVIDER = "sentence-transformers";
export const LOCAL_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
export const LOCAL_EMBEDDING_DIMENSIONS = 384;

type ActiveProvider = "local" | "neuraldeep";

export type EmbeddingsSettings = {
  version: 1;
  activeProvider: ActiveProvider;
  local: { provider: typeof LOCAL_EMBEDDING_PROVIDER; model: typeof LOCAL_EMBEDDING_MODEL; dimensions: number };
  neuraldeep: { provider: "neuraldeep"; model: string | null; dimensions: number | null };
  updatedAt: string;
};

export type EmbeddingCoverage = {
  ok: boolean;
  provider: string;
  model: string;
  eligible: number;
  embedded: number;
  missing: number;
  dimensions: number | null;
  dimensionCount: number;
  complete: boolean;
  error?: string;
};

const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/;

function configPath() {
  return resolvePrithaStatePath("config", "embeddings.json");
}

function indexStatusPath() {
  return resolvePrithaStatePath("config", "neuraldeep-embeddings-status.json");
}

function defaultSettings(): EmbeddingsSettings {
  return {
    version: 1,
    activeProvider: "local",
    local: { provider: LOCAL_EMBEDDING_PROVIDER, model: LOCAL_EMBEDDING_MODEL, dimensions: LOCAL_EMBEDDING_DIMENSIONS },
    neuraldeep: { provider: "neuraldeep", model: null, dimensions: null },
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizedSettings(value: unknown): EmbeddingsSettings {
  const fallback = defaultSettings();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  const remote = raw.neuraldeep && typeof raw.neuraldeep === "object" && !Array.isArray(raw.neuraldeep)
    ? raw.neuraldeep as Record<string, unknown>
    : {};
  const model = typeof remote.model === "string" && SAFE_MODEL.test(remote.model) ? remote.model : null;
  const dimensions = Number(remote.dimensions);
  const activeProvider = raw.activeProvider === "neuraldeep" && model ? "neuraldeep" : "local";
  return {
    ...fallback,
    activeProvider,
    neuraldeep: { provider: "neuraldeep", model, dimensions: Number.isSafeInteger(dimensions) && dimensions > 0 ? dimensions : null },
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt,
  };
}

export function readEmbeddingsSettings() {
  try {
    return normalizedSettings(JSON.parse(readFileSync(configPath(), "utf8")));
  } catch {
    return defaultSettings();
  }
}

export function readEmbeddingsRuntimeSelection() {
  const settings = readEmbeddingsSettings();
  return settings.activeProvider === "neuraldeep" && settings.neuraldeep.model
    ? { kind: "neuraldeep" as const, provider: "neuraldeep", model: settings.neuraldeep.model, dimensions: settings.neuraldeep.dimensions }
    : { kind: "local" as const, ...settings.local };
}

async function writeSettings(settings: EmbeddingsSettings) {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  await atomicWritePrivateJson({ stateRoot, filePath: configPath(), resourceKey: "embeddings-settings", value: settings });
  return settings;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function embeddingCoverage(provider: string, model: string): EmbeddingCoverage {
  const database = resolvePrithaStatePath("memory", "techscope.sqlite");
  if (!existsSync(database)) {
    return { ok: false, provider, model, eligible: 0, embedded: 0, missing: 0, dimensions: null, dimensionCount: 0, complete: false, error: "memory_database_missing" };
  }
  const columns = spawnSync("sqlite3", ["-json", database, "PRAGMA table_info(embeddings);"], { encoding: "utf8", timeout: 5_000 });
  if (columns.status !== 0 || !String(columns.stdout || "").includes('"content_hash"')) {
    return { ok: false, provider, model, eligible: 0, embedded: 0, missing: 0, dimensions: null, dimensionCount: 0, complete: false, error: "embedding_schema_upgrade_required" };
  }
  const sql = `
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
     AND e.provider = ${sqlLiteral(provider)}
     AND e.model = ${sqlLiteral(model)}
     AND e.content_hash = c.hash;`;
  const result = spawnSync("sqlite3", ["-json", database, sql], { encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) {
    return { ok: false, provider, model, eligible: 0, embedded: 0, missing: 0, dimensions: null, dimensionCount: 0, complete: false, error: "embedding_coverage_unavailable" };
  }
  try {
    const row = (JSON.parse(result.stdout || "[]") as Array<Record<string, unknown>>)[0] || {};
    const eligible = Number(row.eligible) || 0;
    const embedded = Number(row.embedded) || 0;
    const dimensionCount = Number(row.dimension_count) || 0;
    const dimensions = Number(row.dimensions) || null;
    return { ok: true, provider, model, eligible, embedded, missing: Math.max(0, eligible - embedded), dimensions, dimensionCount, complete: eligible > 0 && embedded === eligible && dimensionCount === 1 };
  } catch {
    return { ok: false, provider, model, eligible: 0, embedded: 0, missing: 0, dimensions: null, dimensionCount: 0, complete: false, error: "embedding_coverage_invalid" };
  }
}

function readIndexStatus() {
  try {
    const value = JSON.parse(readFileSync(indexStatusPath(), "utf8"));
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function getEmbeddingsSettingsStatus() {
  const settings = readEmbeddingsSettings();
  const local = embeddingCoverage(settings.local.provider, settings.local.model);
  const neuraldeep = settings.neuraldeep.model
    ? embeddingCoverage(settings.neuraldeep.provider, settings.neuraldeep.model)
    : null;
  return { settings, coverage: { local, neuraldeep }, indexing: readIndexStatus() };
}

export async function configureNeuralDeepEmbeddingModel(model: string) {
  const selected = String(model || "").trim();
  if (!SAFE_MODEL.test(selected)) throw new Error("invalid_neuraldeep_embedding_model");
  const current = readEmbeddingsSettings();
  return writeSettings({
    ...current,
    activeProvider: current.activeProvider === "neuraldeep" && current.neuraldeep.model !== selected ? "local" : current.activeProvider,
    neuraldeep: { provider: "neuraldeep", model: selected, dimensions: current.neuraldeep.model === selected ? current.neuraldeep.dimensions : null },
    updatedAt: new Date().toISOString(),
  });
}

export async function activateLocalEmbeddings() {
  const current = readEmbeddingsSettings();
  return writeSettings({ ...current, activeProvider: "local", updatedAt: new Date().toISOString() });
}

export async function activateNeuralDeepEmbeddings() {
  const current = readEmbeddingsSettings();
  const model = current.neuraldeep.model;
  if (!model) throw new Error("neuraldeep_embedding_model_required");
  const coverage = embeddingCoverage("neuraldeep", model);
  if (!coverage.complete || !coverage.dimensions) throw new Error("neuraldeep_embedding_index_incomplete");
  return writeSettings({
    ...current,
    activeProvider: "neuraldeep",
    neuraldeep: { ...current.neuraldeep, dimensions: coverage.dimensions },
    updatedAt: new Date().toISOString(),
  });
}

function processIsAlive(value: unknown) {
  const pid = Number(value);
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function startNeuralDeepEmbeddingIndex(model: string) {
  const selected = String(model || "").trim();
  if (!SAFE_MODEL.test(selected)) throw new Error("invalid_neuraldeep_embedding_model");
  const current = readIndexStatus();
  if (current?.status === "running" && processIsAlive(current.pid)) return { started: false, status: "already_running", pid: Number(current.pid) };
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  const logDirectory = resolvePrithaStatePath("logs", "embeddings");
  mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  const stdout = openSync(path.join(logDirectory, "neuraldeep-index.stdout.log"), "a", 0o600);
  const stderr = openSync(path.join(logDirectory, "neuraldeep-index.stderr.log"), "a", 0o600);
  const environment: NodeJS.ProcessEnv = { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot };
  for (const key of Object.keys(environment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
  }
  const child = spawn(process.execPath, [path.join(root, "scripts", "embed-memory-neuraldeep.mjs"), "--model", selected], {
    cwd: root,
    env: environment,
    detached: false,
    stdio: ["ignore", stdout, stderr],
  });
  closeSync(stdout);
  closeSync(stderr);
  child.unref();
  return { started: true, status: "running", pid: child.pid || null };
}
