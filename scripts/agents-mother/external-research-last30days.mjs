import { runSyncProbe } from "../lib/sync-probe.mjs";

import path from "node:path";
import { redactSensitiveText } from "./external-research.mjs";
import {
  last30DaysConfig,
  sanitizedLast30DaysEnv,
  statusForLast30Days,
} from "../external-research-tools.mjs";

const DEFAULT_SEARCH_SOURCES = "github,hackernews,reddit,grounding";
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_ITEMS_PER_TOPIC = 8;

function compact(value, maxChars = 1200) {
  const text = redactSensitiveText(String(value || "").replace(/\s+/g, " ").trim());
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function uniqueKey(item) {
  return `${item.source_url || ""}\n${item.source_title || ""}\n${item.claim || ""}`.toLowerCase();
}

function sourceRiskNote(sourceType) {
  if (/(reddit|hackernews|x|twitter|bluesky|threads|tiktok|instagram|social)/i.test(sourceType)) {
    return "Community/social evidence is a weak signal; verify with primary docs before making runtime/API decisions.";
  }
  if (/github/i.test(sourceType)) {
    return "GitHub evidence is useful for code/release signals, but final version choices still need changelog or official docs.";
  }
  return "External signal from last30days; keep volatile claims version-bound and prefer primary sources where available.";
}

function bestPublishedAt(candidate = {}) {
  const nested = Array.isArray(candidate.source_items) ? candidate.source_items : [];
  return candidate.published_at
    || candidate.source_published
    || candidate.metadata?.published_at
    || nested.find((item) => item.published_at)?.published_at
    || "unknown";
}

function evidenceFromCandidate(topic, candidate, report) {
  const sourceType = compact(candidate.source || candidate.sources?.join(", ") || "last30days", 80);
  const summary = compact(candidate.snippet || candidate.explanation || candidate.title || "", 1600);
  return {
    topic_id: topic.id,
    topic: topic.topic,
    source_url: compact(candidate.url || "", 800),
    source_title: compact(candidate.title || candidate.url || `${topic.topic} evidence`, 240),
    source_type: sourceType,
    source_published: compact(bestPublishedAt(candidate), 80),
    source_updated: "unknown",
    retrieved_at: compact(report.generated_at || new Date().toISOString(), 80),
    claim: compact(candidate.explanation || candidate.title || summary || "last30days ranked evidence item", 1200),
    evidence_summary: summary || "last30days returned a ranked evidence item without a detailed snippet.",
    risk_note: sourceRiskNote(sourceType),
    confidence: candidate.final_score || candidate.rerank_score ? "medium" : "low",
  };
}

function evidenceFromSourceItem(topic, source, item, report) {
  const sourceType = compact(item.source || source || "last30days", 80);
  const summary = compact(item.snippet || item.body || item.why_relevant || item.title || "", 1600);
  return {
    topic_id: topic.id,
    topic: topic.topic,
    source_url: compact(item.url || "", 800),
    source_title: compact(item.title || item.url || `${topic.topic} evidence`, 240),
    source_type: sourceType,
    source_published: compact(item.published_at || item.metadata?.published_at || "unknown", 80),
    source_updated: "unknown",
    retrieved_at: compact(report.generated_at || new Date().toISOString(), 80),
    claim: compact(item.why_relevant || item.title || summary || "last30days source item", 1200),
    evidence_summary: summary || "last30days returned a source item without a detailed snippet.",
    risk_note: sourceRiskNote(sourceType),
    confidence: item.relevance_hint || item.local_relevance ? "medium" : "low",
  };
}

function reportPayloads(payload) {
  if (payload?.comparison && Array.isArray(payload.reports)) {
    return payload.reports
      .map((entry) => entry.report || entry)
      .filter(Boolean);
  }
  if (payload?.report) return [payload.report];
  return payload ? [payload] : [];
}

export function last30daysJsonToEvidence(topic, payload, options = {}) {
  const items = [];
  const seen = new Set();
  for (const report of reportPayloads(payload)) {
    const candidates = Array.isArray(report.ranked_candidates) ? report.ranked_candidates : [];
    for (const candidate of candidates) {
      const item = evidenceFromCandidate(topic, candidate, report);
      const key = uniqueKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
      if (items.length >= (options.maxItems || MAX_ITEMS_PER_TOPIC)) break;
    }

    if (items.length >= (options.maxItems || MAX_ITEMS_PER_TOPIC)) break;
    const bySource = report.items_by_source && typeof report.items_by_source === "object" ? report.items_by_source : {};
    for (const [source, sourceItems] of Object.entries(bySource)) {
      if (!Array.isArray(sourceItems)) continue;
      for (const sourceItem of sourceItems) {
        const item = evidenceFromSourceItem(topic, source, sourceItem, report);
        const key = uniqueKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          items.push(item);
        }
        if (items.length >= (options.maxItems || MAX_ITEMS_PER_TOPIC)) break;
      }
      if (items.length >= (options.maxItems || MAX_ITEMS_PER_TOPIC)) break;
    }
  }
  return items;
}

export function buildLast30DaysArgs(enginePath, topic, options = {}) {
  return [
    enginePath,
    topic.query,
    "--emit",
    "json",
    "--quick",
    "--days",
    String(topic.freshnessWindowDays || 30),
    "--as-of",
    options.asOfDate || todayIsoDate(),
    "--search",
    options.searchSources || DEFAULT_SEARCH_SOURCES,
  ];
}

function parseLast30DaysJson(stdout, topic) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`last30days returned invalid JSON for ${topic.id}: ${error.message}`);
  }
}

export function runLast30DaysBackend(contractData, topics, options = {}) {
  const status = statusForLast30Days({ root: options.root, env: options.env, pythonCandidates: options.pythonCandidates });
  if (!status.ok) {
    return {
      ok: false,
      error: "last30days_backend_unavailable",
      status,
      evidence: null,
    };
  }

  const cfg = last30DaysConfig({ root: options.root });
  const python = status.python.selected.executable || status.python.selected.command;
  const env = sanitizedLast30DaysEnv(options.env || process.env, {
    allowHostTools: Boolean(options.allowHostTools),
    extra: {
      LAST30DAYS_SKIP_PREFLIGHT: "1",
      LAST30DAYS_DEFAULT_SEARCH: options.searchSources || DEFAULT_SEARCH_SOURCES,
    },
  });
  const cwd = options.cwd || path.parse(cfg.root).root;
  const requiredTopics = topics.filter((topic) => topic.required !== false);
  const items = [];
  const diagnostics = [];

  for (const topic of requiredTopics) {
    const args = buildLast30DaysArgs(cfg.enginePath, topic, options);
    const result = runSyncProbe(python, args, {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
    });
    diagnostics.push({
      topic_id: topic.id,
      status: result.status,
      signal: result.signal || "",
      stderr: compact(result.stderr, 1200),
    });
    if (result.status !== 0) {
      return {
        ok: false,
        error: "last30days_run_failed",
        status,
        diagnostics,
        evidence: null,
      };
    }
    const payload = parseLast30DaysJson(result.stdout, topic);
    items.push(...last30daysJsonToEvidence(topic, payload, { maxItems: options.maxItemsPerTopic || MAX_ITEMS_PER_TOPIC }));
  }

  return {
    ok: true,
    status,
    diagnostics,
    evidence: {
      backend: "last30days",
      completed_at: new Date().toISOString(),
      contract: contractData?.relPath || "",
      items,
    },
  };
}
