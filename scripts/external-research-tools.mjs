#!/usr/bin/env node
import { parseLongArgs as parseArgs } from "./lib/cli-args.mjs";
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolvePrithaStatePath, resolveTechscopeRoot } from "./lib/paths.mjs";

const LOCK_PATH = path.join("tools", "external-research", "last30days-lock.json");
const PYTHON_VERSION_PROBE = "import json,sys; print(json.dumps({'executable': sys.executable, 'version': '.'.join(map(str, sys.version_info[:3])), 'major': sys.version_info[0], 'minor': sys.version_info[1], 'micro': sys.version_info[2]}))";
const DEFAULT_RECENT_SEARCH_SOURCES = "reddit,hackernews,polymarket,grounding";
const DEFAULT_RECENT_TIMEOUT_MS = 95_000;
const RECENT_SOURCE_ALLOWLIST = new Set([
  "reddit",
  "hackernews",
  "polymarket",
  "grounding",
  "github",
  "jobs",
]);

const SECRET_ENV_PATTERNS = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /COOKIE/i,
  /AUTH/i,
  /API[_-]?KEY/i,
  /^CT0$/i,
  /^OPENAI_API_KEY$/i,
  /^SCRAPECREATORS_API_KEY$/i,
  /^PERPLEXITY_API_KEY$/i,
  /^OPENROUTER_API_KEY$/i,
  /^XAI_API_KEY$/i,
  /^APIFY_API_TOKEN$/i,
  /^BRAVE_API_KEY$/i,
  /^SERPER_API_KEY$/i,
  /^PARALLEL_API_KEY$/i,
  /^BSKY_APP_PASSWORD$/i,
  /^TRUTHSOCIAL_TOKEN$/i,
];

function run(command, args, options = {}) {
  return runSyncProbe(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 30_000,
  });
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}

function compactText(value, maxChars = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function redactSensitiveText(value, maxChars = 4000) {
  return compactText(value, maxChars)
    .replace(/\b(sk|pk|rk|ak|sess|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(AUTH_TOKEN|CT0|API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*[^,\s)]+/gi, "$1=[REDACTED]")
    .replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\b\s*[:=]\s*[^,\s)]+/gi, "$1=[REDACTED]");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function clampInteger(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(Math.round(numeric), max));
}

export function loadExternalResearchToolLock(options = {}) {
  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const lockPath = path.join(root, LOCK_PATH);
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  return { root, lockPath, lock };
}

export function last30DaysConfig(options = {}) {
  const { root, lockPath, lock } = loadExternalResearchToolLock(options);
  const cfg = lock?.tools?.last30days;
  if (!cfg) throw new Error(`Missing last30days lock entry in ${path.relative(root, lockPath)}`);
  const installPath = path.resolve(root, cfg.install_path);
  const enginePath = path.resolve(installPath, cfg.engine_path);
  return {
    ...cfg,
    root,
    lockPath,
    installPath,
    enginePath,
  };
}

export function pythonVersionMeets(version, minimum = { major: 3, minor: 12 }) {
  if (!version) return false;
  const major = Number(version.major);
  const minor = Number(version.minor);
  return Number.isFinite(major) && Number.isFinite(minor)
    && (major > minimum.major || (major === minimum.major && minor >= minimum.minor));
}

export function localPythonCandidates(root) {
  const base = path.join(root, ".tools", "python");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((entry) => entry.startsWith("cpython-"))
    .sort()
    .reverse()
    .flatMap((entry) => [
      path.join(base, entry, "bin", "python3"),
      path.join(base, entry, "bin", "python3.13"),
      path.join(base, entry, "bin", "python3.12"),
    ])
    .filter((candidate, index, all) => existsSync(candidate) && all.indexOf(candidate) === index);
}

export function detectPython(options = {}) {
  const env = options.env || process.env;
  const candidates = options.candidates || [
    env.PRITHA_LAST30DAYS_PYTHON,
    "python3.13",
    "python3.12",
    "python3",
  ].filter(Boolean);
  const found = [];

  for (const command of candidates) {
    const result = run(command, ["-c", PYTHON_VERSION_PROBE], {
      env,
      timeoutMs: options.timeoutMs || 10_000,
    });
    if (result.status !== 0) {
      found.push({
        command,
        ok: false,
        error: firstLine(result.stderr) || result.error?.message || "not found",
      });
      continue;
    }
    try {
      const parsed = JSON.parse(result.stdout);
      const ok = pythonVersionMeets(parsed);
      const entry = {
        command,
        ok,
        executable: parsed.executable,
        version: parsed.version,
        major: parsed.major,
        minor: parsed.minor,
        micro: parsed.micro,
      };
      found.push(entry);
      if (ok) return { ok: true, selected: entry, found };
    } catch (error) {
      found.push({ command, ok: false, error: error.message });
    }
  }

  return { ok: false, selected: null, found };
}

export function sanitizedLast30DaysEnv(baseEnv = process.env, options = {}) {
  const keep = {};
  const keepPath = options.allowHostTools !== false;
  for (const key of ["HOME", "TMPDIR", "LANG", "LC_ALL", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"]) {
    if (baseEnv[key]) keep[key] = baseEnv[key];
  }
  if (keepPath && baseEnv.PATH) keep.PATH = baseEnv.PATH;
  if (!keepPath) keep.PATH = "";
  for (const [key, value] of Object.entries(options.extra || {})) {
    if (value !== undefined && value !== null) keep[key] = String(value);
  }
  for (const key of Object.keys(keep)) {
    if (SECRET_ENV_PATTERNS.some((pattern) => pattern.test(key))) delete keep[key];
  }
  keep.PYTHONIOENCODING = "utf-8";
  keep.CODEX_AUTH_FILE = "/dev/null";
  keep.LAST30DAYS_CONFIG_DIR = "";
  keep.LAST30DAYS_MEMORY_DIR = "";
  keep.LAST30DAYS_STORE = "";
  keep.FROM_BROWSER = "off";
  keep.SETUP_COMPLETE = "true";
  return keep;
}

function sanitizeRecentSearchSources(value) {
  const requested = String(value || DEFAULT_RECENT_SEARCH_SOURCES)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const sources = [...new Set(requested)].filter((source) => RECENT_SOURCE_ALLOWLIST.has(source));
  return sources.length ? sources : DEFAULT_RECENT_SEARCH_SOURCES.split(",");
}

function rejectedRecentSearchSources(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((source) => !RECENT_SOURCE_ALLOWLIST.has(source));
}

function inferRecentResearchIntent(query) {
  const text = String(query || "").toLowerCase();
  if (/\b(vs|versus|compare|comparison|сравн)\b/.test(text)) return "comparison";
  if (/\b(how to|tutorial|workflow|use case|use cases|как|воркфлоу|сценари)\b/.test(text)) return "how_to";
  if (/\b(opinion|reaction|review|отзыв|мнен|реакци)\b/.test(text)) return "opinion";
  if (/\b(odds|forecast|prediction|прогноз|ставк)\b/.test(text)) return "prediction";
  if (/\b(launch|release|breaking|incident|новост|релиз|инцидент)\b/.test(text)) return "breaking_news";
  if (/\b(api|sdk|tool|app|product|model|agent|codex|mcp|runtime|инструмент|агент|модель)\b/.test(text)) return "product";
  return "concept";
}

function stripTemporalSearchTerms(query) {
  return compactText(query, 180)
    .replace(/\b(last|past)\s+\d+\s+(day|days|week|weeks|month|months)\b/gi, " ")
    .replace(/\b(recent|latest|current|today|yesterday|this week|this month|последн\w*|свеж\w*|нов\w*)\b/gi, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRecentResearchPlan(query, sources) {
  const intent = inferRecentResearchIntent(query);
  const searchQuery = stripTemporalSearchTerms(query) || compactText(query, 180);
  const weight = sources.length ? Number((1 / sources.length).toFixed(4)) : 1;
  return {
    intent,
    freshness_mode: intent === "prediction" || intent === "breaking_news" ? "strict_recent" : "balanced_recent",
    cluster_mode:
      intent === "comparison" || intent === "opinion"
        ? "debate"
        : intent === "prediction"
          ? "market"
          : intent === "how_to"
            ? "workflow"
            : "none",
    source_weights: Object.fromEntries(sources.map((source) => [source, weight])),
    subqueries: [
      {
        label: "primary",
        search_query: searchQuery,
        ranking_query: `What recent evidence from the selected sources matters for ${compactText(query, 220)}?`,
        sources,
        weight: 1,
      },
    ],
    notes: ["Generated by Pritha recent_external_research voice adapter."],
  };
}

function reportPayloads(payload) {
  if (payload?.comparison && Array.isArray(payload.reports)) {
    return payload.reports.map((entry) => entry.report || entry).filter(Boolean);
  }
  if (payload?.report) return [payload.report];
  return payload ? [payload] : [];
}

function evidenceScore(item) {
  return Number(item.final_score || item.rerank_score || item.local_rank_score || item.relevance_hint || item.local_relevance || item.engagement_score || 0);
}

function confidenceForItem(item) {
  const score = evidenceScore(item);
  if (score >= 35 || Number(item.final_score || 0) >= 0.65) return "high";
  if (score > 0 || Number(item.relevance_hint || 0) > 0) return "medium";
  return "low";
}

function itemPublishedAt(item) {
  const nested = Array.isArray(item.source_items) ? item.source_items : [];
  return item.published_at
    || item.source_published
    || item.metadata?.published_at
    || nested.find((entry) => entry.published_at)?.published_at
    || "unknown";
}

function isLowValueResearchText(value) {
  return /^(fallback-local-score|heuristic-fallback|last30days ranked evidence item|last30days source item)$/i.test(String(value || "").trim());
}

function firstUsefulResearchText(...values) {
  for (const value of values) {
    const text = compactText(value, 900);
    if (text && !isLowValueResearchText(text)) return text;
  }
  return compactText(values.find(Boolean) || "External research signal", 900);
}

function evidenceFromCandidate(candidate = {}) {
  const nested = Array.isArray(candidate.source_items) ? candidate.source_items : [];
  const firstNested = nested[0] || {};
  const source = compactText(candidate.source || candidate.sources?.join(", ") || firstNested.source || "last30days", 80);
  const title = compactText(candidate.title || firstNested.title || candidate.url || "External research signal", 220);
  const claim = firstUsefulResearchText(
    candidate.why_relevant,
    candidate.snippet,
    firstNested.why_relevant,
    firstNested.snippet,
    candidate.explanation,
    title,
  );
  return {
    title,
    url: compactText(candidate.url || firstNested.url || "", 800),
    source,
    published_at: compactText(itemPublishedAt(candidate), 80),
    claim,
    confidence: confidenceForItem(candidate),
    score: evidenceScore(candidate),
  };
}

function evidenceFromSourceItem(source, item = {}) {
  const title = compactText(item.title || item.url || "External research signal", 220);
  return {
    title,
    url: compactText(item.url || "", 800),
    source: compactText(item.source || source || "last30days", 80),
    published_at: compactText(item.published_at || item.metadata?.published_at || "unknown", 80),
    claim: firstUsefulResearchText(item.why_relevant, item.snippet, item.body, title),
    confidence: confidenceForItem(item),
    score: evidenceScore(item),
  };
}

export function last30daysPayloadToVoiceBrief(query, payload, options = {}) {
  const maxResults = clampInteger(options.maxResults, 8, 1, 20);
  const requestedSources = sanitizeRecentSearchSources(options.searchSources);
  const allEvidence = [];
  const seen = new Set();
  const sourcesWithItems = new Set();

  for (const report of reportPayloads(payload)) {
    for (const candidate of Array.isArray(report.ranked_candidates) ? report.ranked_candidates : []) {
      const evidence = evidenceFromCandidate(candidate);
      const key = `${evidence.url}\n${evidence.title}\n${evidence.claim}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (evidence.source) sourcesWithItems.add(String(evidence.source).toLowerCase());
      allEvidence.push(evidence);
    }

    const bySource = report.items_by_source && typeof report.items_by_source === "object" ? report.items_by_source : {};
    for (const [source, sourceItems] of Object.entries(bySource)) {
      if (!Array.isArray(sourceItems) || !sourceItems.length) continue;
      sourcesWithItems.add(String(source).toLowerCase());
      for (const sourceItem of sourceItems) {
        const evidence = evidenceFromSourceItem(source, sourceItem);
        const key = `${evidence.url}\n${evidence.title}\n${evidence.claim}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        allEvidence.push(evidence);
      }
    }

    const grounding = Array.isArray(report.artifacts?.grounding) ? report.artifacts.grounding : [];
    for (const item of grounding) {
      if (Number(item.resultCount || item.result_count || 0) > 0) sourcesWithItems.add("grounding");
    }
  }

  const positive = allEvidence.filter((item) => item.score > 0 || item.confidence !== "low");
  const selected = (positive.length ? positive : allEvidence)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, maxResults)
    .map(({ score, ...item }) => item);
  const usedSources = [...new Set(selected.map((item) => item.source.toLowerCase()).concat([...sourcesWithItems]))]
    .filter(Boolean)
    .sort();
  const missingSources = requestedSources.filter((source) => !usedSources.includes(source));
  const quality = selected.length >= 5 && usedSources.length >= 3
    ? "high"
    : selected.length >= 2 && usedSources.length >= 2
      ? "medium"
      : "low";
  const keyFindings = selected.slice(0, Math.min(7, Math.max(3, selected.length))).map((item) => {
    const source = item.source ? ` (${item.source})` : "";
    return compactText(`${item.claim || item.title}${source}`, 360);
  });
  const warnings = [];
  if (!selected.length) warnings.push("last30days did not return usable evidence for the requested query.");
  if (missingSources.length) warnings.push(`No usable evidence from requested sources: ${missingSources.join(", ")}.`);
  if (quality === "low") warnings.push("Coverage is low; treat this as a weak signal and verify primary sources before changing Pritha standards or code.");

  return {
    summary: selected.length
      ? `Найдено ${selected.length} релевантных сигналов по теме "${compactText(query, 140)}". Покрытие: ${usedSources.join(", ") || "none"}. Надежность: ${quality}.`
      : `По теме "${compactText(query, 140)}" не найдено достаточно надежных сигналов в выбранных источниках.`,
    key_findings: keyFindings,
    coverage: {
      sources_used: usedSources,
      missing_sources: missingSources,
      quality,
    },
    warnings,
    evidence_items: selected,
    open_questions: quality === "high" ? [] : ["Нужна проверка первоисточников или более широкий Codex research task, если вывод повлияет на решение."],
    next_actions: [
      "Use this as an external signal, not curated Pritha memory.",
      "Run a Codex research task for primary-source verification before updating standards, decisions or implementation.",
    ],
  };
}

export function runRecentLast30DaysResearch(options = {}) {
  const query = compactText(options.query, 300);
  if (!query) {
    return { ok: false, status: "failed", error: "missing_query", summary: "recent_external_research requires a non-empty query." };
  }
  const rejectedSources = rejectedRecentSearchSources(options.searchSources);
  if (rejectedSources.length) {
    return {
      ok: false,
      status: "failed",
      error: "unsupported_sources",
      rejected_sources: rejectedSources,
      allowed_sources: [...RECENT_SOURCE_ALLOWLIST].sort(),
      summary: "Requested sources are outside the default public no-secret allowlist.",
    };
  }

  const root = options.root ? path.resolve(options.root) : resolveTechscopeRoot();
  const status = statusForLast30Days({ root, env: options.env, pythonCandidates: options.pythonCandidates });
  if (!status.ok) {
    return {
      ok: false,
      status: "failed",
      error: "last30days_backend_unavailable",
      backend_status: status,
      summary: `last30days backend is not ready: ${status.status}. ${status.issues.join("; ")}`,
    };
  }

  const cfg = last30DaysConfig({ root });
  const python = status.python.selected.executable || status.python.selected.command;
  const days = clampInteger(options.days, 30, 1, 90);
  const maxResults = clampInteger(options.maxResults, 8, 1, 20);
  const mode = options.mode === "deep" ? "deep" : "quick";
  const searchSources = sanitizeRecentSearchSources(options.searchSources);
  const runId = `l30-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const artifactRoot = resolvePrithaStatePath("private", "voice-research", runId);
  mkdirSync(artifactRoot, { recursive: true });
  const planPath = path.join(artifactRoot, "plan.json");
  const stdoutPath = path.join(artifactRoot, "stdout.json");
  const stderrPath = path.join(artifactRoot, "stderr.log");
  const resultPath = path.join(artifactRoot, "result.json");
  const plan = buildRecentResearchPlan(query, searchSources);
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  const env = sanitizedLast30DaysEnv(options.env || process.env, {
    allowHostTools: Boolean(options.allowHostTools),
    extra: {
      LAST30DAYS_SKIP_PREFLIGHT: "1",
      LAST30DAYS_DEFAULT_SEARCH: searchSources.join(","),
    },
  });
  const args = [
    cfg.enginePath,
    query,
    "--emit",
    "json",
    mode === "deep" ? "--deep" : "--quick",
    "--days",
    String(days),
    "--as-of",
    options.asOfDate || todayIsoDate(),
    "--search",
    searchSources.join(","),
    "--no-browser-cookies",
    "--plan",
    planPath,
  ];
  const runResult = run(python, args, {
    cwd: options.cwd || path.parse(root).root,
    env,
    timeoutMs: options.timeoutMs || (mode === "deep" ? 180_000 : DEFAULT_RECENT_TIMEOUT_MS),
  });
  writeFileSync(stdoutPath, runResult.stdout || "", "utf8");
  writeFileSync(stderrPath, redactSensitiveText(runResult.stderr || ""), "utf8");

  if (runResult.status !== 0) {
    const failed = {
      ok: false,
      run_id: runId,
      status: "failed",
      error: "last30days_run_failed",
      exit_code: runResult.status,
      signal: runResult.signal || "",
      summary: `last30days failed for "${query}".`,
      stderr: redactSensitiveText(runResult.stderr || runResult.error?.message || "", 1600),
      artifact_path: path.relative(root, artifactRoot).replace(/\\/g, "/"),
      backend_status: status,
    };
    writeFileSync(resultPath, `${JSON.stringify(failed, null, 2)}\n`, "utf8");
    return failed;
  }

  let payload;
  try {
    payload = JSON.parse(runResult.stdout || "{}");
  } catch (error) {
    const failed = {
      ok: false,
      run_id: runId,
      status: "failed",
      error: "invalid_last30days_json",
      summary: `last30days returned invalid JSON for "${query}".`,
      detail: error.message,
      artifact_path: path.relative(root, artifactRoot).replace(/\\/g, "/"),
      backend_status: status,
    };
    writeFileSync(resultPath, `${JSON.stringify(failed, null, 2)}\n`, "utf8");
    return failed;
  }

  const brief = last30daysPayloadToVoiceBrief(query, payload, {
    searchSources: searchSources.join(","),
    maxResults,
  });
  const output = {
    ok: true,
    run_id: runId,
    status: "complete",
    query,
    days,
    mode,
    search_sources: searchSources,
    backend: "last30days",
    backend_status: {
      status: status.status,
      version: status.version,
      commit: status.commit,
      python: status.python?.selected?.version || "",
    },
    ...brief,
    artifact_path: path.relative(root, artifactRoot).replace(/\\/g, "/"),
  };
  writeFileSync(resultPath, `${JSON.stringify({ ...output, raw_payload: payload }, null, 2)}\n`, "utf8");
  return output;
}

function gitAvailable(env = process.env) {
  const result = run("git", ["--version"], { env, timeoutMs: 10_000 });
  return {
    ok: result.status === 0,
    version: result.status === 0 ? firstLine(result.stdout) : "",
    error: result.status === 0 ? "" : firstLine(result.stderr) || result.error?.message || "git unavailable",
  };
}

function checkoutCommit(installPath, env = process.env) {
  if (!existsSync(path.join(installPath, ".git"))) return "";
  const result = run("git", ["rev-parse", "HEAD"], { cwd: installPath, env, timeoutMs: 10_000 });
  return result.status === 0 ? firstLine(result.stdout).trim() : "";
}

export function statusForLast30Days(options = {}) {
  const cfg = last30DaysConfig(options);
  const env = options.env || process.env;
  const pythonCandidates = options.pythonCandidates || [
    env.PRITHA_LAST30DAYS_PYTHON,
    ...localPythonCandidates(cfg.root),
    "python3.13",
    "python3.12",
    "python3",
  ].filter(Boolean);
  const python = detectPython({ env, candidates: pythonCandidates });
  const git = gitAvailable(env);
  const installPathExists = existsSync(cfg.installPath);
  const enginePathExists = existsSync(cfg.enginePath);
  const installed = installPathExists && enginePathExists;
  const currentCommit = installPathExists ? checkoutCommit(cfg.installPath, env) : "";
  const issues = [];

  if (!python.ok) issues.push("python>=3.12 not found");
  if (!git.ok) issues.push("git not available");
  if (!installed) issues.push("pinned checkout not installed");
  if (installed && currentCommit && currentCommit !== cfg.commit) {
    issues.push(`installed checkout is ${currentCommit}, expected ${cfg.commit}`);
  }

  let status = "ready";
  if (installed && currentCommit && currentCommit !== cfg.commit) {
    status = "failed-pin-mismatch";
  } else if (!python.ok) {
    status = "pending-runtime";
  } else if (!installed) {
    status = "pending-install";
  } else if (!git.ok) {
    status = "pending-runtime";
  }

  return {
    name: "last30days",
    status,
    ok: status === "ready",
    repo: cfg.repo,
    commit: cfg.commit,
    version: cfg.version,
    pythonRequirement: cfg.python,
    installPath: path.relative(cfg.root, cfg.installPath),
    enginePath: path.relative(cfg.root, cfg.enginePath),
    installed,
    installPathExists,
    enginePathExists,
    currentCommit,
    git,
    python,
    issues,
  };
}

function installLast30Days(options = {}) {
  if (!options.yes) {
    throw new Error("Installing last30days is a mutating action. Re-run with `--yes` to create/update the pinned checkout.");
  }
  const cfg = last30DaysConfig(options);
  const env = sanitizedLast30DaysEnv(process.env, { allowHostTools: true });
  const parent = path.dirname(cfg.installPath);
  mkdirSync(parent, { recursive: true });

  if (existsSync(cfg.installPath)) {
    const stat = statSync(cfg.installPath);
    if (!stat.isDirectory()) throw new Error(`Install path exists and is not a directory: ${cfg.installPath}`);
    if (!existsSync(path.join(cfg.installPath, ".git"))) {
      throw new Error(`Install path exists but is not a git checkout: ${cfg.installPath}`);
    }
    const fetch = run("git", ["fetch", "--tags", "origin"], { cwd: cfg.installPath, env, stdio: "inherit", timeoutMs: 120_000 });
    if (fetch.status !== 0) throw new Error(`git fetch failed in ${cfg.installPath}`);
  } else {
    const clone = run("git", ["clone", cfg.repo, cfg.installPath], { env, stdio: "inherit", timeoutMs: 240_000 });
    if (clone.status !== 0) throw new Error(`git clone failed for ${cfg.repo}`);
  }

  const checkout = run("git", ["checkout", "--detach", cfg.commit], { cwd: cfg.installPath, env, stdio: "inherit", timeoutMs: 120_000 });
  if (checkout.status !== 0) throw new Error(`git checkout failed for ${cfg.commit}`);
  return statusForLast30Days(options);
}

function diagnoseLast30Days(options = {}) {
  const status = statusForLast30Days(options);
  if (!status.ok) return { ...status, diagnose: "skipped", diagnoseError: "backend is not ready" };
  const cfg = last30DaysConfig(options);
  const env = sanitizedLast30DaysEnv(process.env);
  const python = status.python.selected.command;
  const result = run(python, [cfg.enginePath, "--help"], { env, timeoutMs: 30_000 });
  return {
    ...status,
    diagnose: result.status === 0 ? "ok" : "failed",
    diagnoseOutput: firstLine(result.stdout),
    diagnoseError: firstLine(result.stderr) || result.error?.message || "",
  };
}

function usage() {
  console.log(`Usage:
  node scripts/external-research-tools.mjs status [--json]
  node scripts/external-research-tools.mjs install last30days --yes
  node scripts/external-research-tools.mjs diagnose last30days [--json]
  node scripts/external-research-tools.mjs recent last30days --query <topic> [--days 30] [--mode quick|deep]

Notes:
  status is read-only.
  install writes only to the ignored .tools/ directory and checks out the pinned commit.
  diagnose runs the pinned local engine with a sanitized environment.
  recent runs a no-secret public-source last30days query and returns a bounded voice-ready brief.`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function main() {
  const command = process.argv[2] || "status";
  const options = parseArgs(process.argv.slice(3));
  try {
    if (command === "help" || command === "--help") {
      usage();
      return;
    }
    if (command === "status") {
      printJson(statusForLast30Days());
      return;
    }
    if (command === "install") {
      const tool = options._[0] || "last30days";
      if (tool !== "last30days") throw new Error(`Unknown external research tool: ${tool}`);
      printJson(installLast30Days({ yes: Boolean(options.yes) }));
      return;
    }
    if (command === "diagnose") {
      const tool = options._[0] || "last30days";
      if (tool !== "last30days") throw new Error(`Unknown external research tool: ${tool}`);
      printJson(diagnoseLast30Days());
      return;
    }
    if (command === "recent") {
      const tool = options._[0] || "last30days";
      if (tool !== "last30days") throw new Error(`Unknown external research tool: ${tool}`);
      printJson(runRecentLast30DaysResearch({
        query: options.query || options._.slice(1).join(" "),
        days: options.days,
        mode: options.mode,
        searchSources: options["search-sources"] || options.search_sources || options.sources,
        maxResults: options["max-results"] || options.max_results,
        timeoutMs: options.timeout ? Number(options.timeout) : undefined,
        allowHostTools: Boolean(options["allow-host-tools"]),
      }));
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
