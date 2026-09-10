import { runSyncProbe } from "../lib/sync-probe.mjs";
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import path from "node:path";

import { createHash } from "node:crypto";
import { quarantineUntrustedInstructionText, redactSensitiveText } from "../lib/redaction.mjs";
import { today } from "../lib/date.mjs";
import { resolvePrithaStateRoot } from "../lib/paths.mjs";
import { parseFrontmatterData } from "../lib/frontmatter.mjs";
import { parseBoundedJson } from "../lib/bounded-json.mjs";
import { markdownBodyText, markdownDocumentLock } from "../lib/markdown-content-lock.mjs";

export const SEMANTIC_FAILURE_LOG_REL = ".private/agents-mother/semantic-memory-failures.jsonl";
const ISOLATED_SEMANTIC_FAILURE_LOG_REL = "private/agents-mother/semantic-memory-failures.jsonl";
const PATTERN_PACK_PAYLOAD_MARKER = "pritha-agent-pattern-pack-v1";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function patternPackLock(payload) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex")}`;
}

export function verifyPatternPackIntegrity(text, expectedContractFingerprint = "") {
  const normalizedText = String(text || "").replace(/\r\n?/g, "\n");
  const frontmatter = parseFrontmatterData(normalizedText) || {};
  const reasons = [];
  const documentBody = markdownBodyText(normalizedText);
  const match = documentBody.match(new RegExp(`<!--\\s*${PATTERN_PACK_PAYLOAD_MARKER}\\s+([A-Za-z0-9_-]+)\\s*-->`));
  let payload = null;
  try {
    if (match) {
      const decoded = Buffer.from(match[1], "base64url").toString("utf8");
      if (decoded.length <= 1_000_000) payload = parseBoundedJson(decoded, { maxBytes: 1_000_000, maxDepth: 20, maxNodes: 10_000 });
    }
  } catch {
    payload = null;
  }
  if (!payload || payload.schema !== PATTERN_PACK_PAYLOAD_MARKER) {
    return { ok: false, reasons: ["pattern_pack_payload_missing_or_malformed"], payload: null };
  }
  const lock = patternPackLock(payload);
  if (frontmatter.pattern_pack_lock !== lock) reasons.push("pattern_pack_lock_mismatch");
  const documentLockOccurrences = (normalizedText.match(/^pattern_pack_document_lock:/gm) || []).length;
  if (documentLockOccurrences !== 1 || !/^sha256:[a-f0-9]{64}$/i.test(String(frontmatter.pattern_pack_document_lock || ""))) {
    reasons.push("pattern_pack_document_lock_invalid");
  } else if (frontmatter.pattern_pack_document_lock !== markdownDocumentLock(normalizedText, "pattern_pack_document_lock")) {
    reasons.push("pattern_pack_document_mismatch");
  }
  if (frontmatter.contract_fingerprint !== payload.contract_fingerprint) reasons.push("pattern_pack_contract_fingerprint_mismatch");
  if (expectedContractFingerprint && payload.contract_fingerprint !== expectedContractFingerprint) reasons.push("pattern_pack_contract_stale");
  if (frontmatter.pattern_pack_status !== payload.status) reasons.push("pattern_pack_status_mismatch");
  if (Number(frontmatter.selected_pattern_count) !== payload.patterns?.length) reasons.push("pattern_pack_count_mismatch");
  if (Number(frontmatter.external_research_seed_count) !== payload.external_research_seeds?.length) reasons.push("pattern_pack_seed_count_mismatch");
  const renderedBody = documentBody.replace(match[0], "").replace(/^\s+/, "");
  const renderedBodyHash = `sha256:${createHash("sha256").update(renderedBody).digest("hex")}`;
  if (payload.body_sha256 !== renderedBodyHash) reasons.push("pattern_pack_body_mismatch");
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], payload, lock };
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "agent",
  "agents",
  "and",
  "before",
  "child",
  "codex",
  "current",
  "data",
  "from",
  "harness",
  "into",
  "memory",
  "must",
  "new",
  "not",
  "only",
  "pattern",
  "patterns",
  "project",
  "pritha",
  "report",
  "research",
  "scaffold",
  "should",
  "status",
  "task",
  "that",
  "the",
  "this",
  "tool",
  "tools",
  "use",
  "user",
  "with",
  "workflow",
  "workflows",
  "для",
  "или",
  "как",
  "при",
  "что",
  "это",
]);

const TECH_SEED_PATTERN = /\b(openai|realtime|webrtc|voice|speech|telegram|bot api|mcp|connector|embeddings?|semantic|vector|rag|sqlite|next\.?js|react|launchd|cron|tailscale|oauth|webhook|browser|sandbox|codex app|codex cli|agents sdk|github|repository|skill|eval|evaluation|open-source|api)\b/i;
const CANONICAL_EXTERNAL_SEEDS = Object.freeze([
  [/\bopenai\b.*\b(?:realtime|webrtc)\b|\b(?:realtime|webrtc)\b.*\bopenai\b/i, "openai realtime webrtc"],
  [/\bmcp\b.*\bconnector\b|\bconnector\b.*\bmcp\b/i, "mcp connector permissions"],
  [/\bopenai\b/i, "openai"],
  [/\b(?:realtime|webrtc)\b/i, "realtime webrtc"],
  [/\b(?:voice|speech)\b/i, "voice speech"],
  [/\b(?:telegram|bot api)\b/i, "telegram bot api"],
  [/\b(?:mcp|model context protocol|connector)\b/i, "mcp connector"],
  [/\b(?:embedding|embeddings|semantic|vector|rag)\b/i, "semantic embeddings rag"],
  [/\bsqlite\b/i, "sqlite"],
  [/\b(?:next\.?js|react)\b/i, "nextjs react"],
  [/\b(?:launchd|cron)\b/i, "launchd cron"],
  [/\btailscale\b/i, "tailscale"],
  [/\b(?:oauth|webhook)\b/i, "oauth webhook"],
  [/\b(?:browser|sandbox)\b/i, "browser sandbox"],
  [/\b(?:codex app|codex cli)\b/i, "codex"],
  [/\bagents sdk\b/i, "agents sdk"],
  [/\b(?:github|repository|open-source)\b/i, "github repository"],
  [/\b(?:skill|eval|evaluation)\b/i, "agent skills evals"],
  [/\bapi\b/i, "api"],
]);

export function canonicalPatternResearchSeed(value) {
  const text = redactSensitiveText(String(value || "")).replace(/\s+/g, " ").trim();
  return CANONICAL_EXTERNAL_SEEDS.find(([pattern]) => pattern.test(text))?.[1] || "";
}

function compact(value, maxChars = 2000) {
  const text = quarantineUntrustedInstructionText(String(value || "").replace(/\s+/g, " ").trim());
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}...`;
}

function markdownText(value, maxChars = 2000) {
  return compact(value, maxChars)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;");
}

function yamlScalar(value) {
  return JSON.stringify(markdownText(value, 1000) || "none");
}

function slug(value, fallback = "pattern") {
  const text = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return text || fallback;
}

function queryHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function domainLabel(key) {
  if (key === "agentBuildingKnowledge") return "agent-building-knowledge";
  if (key === "prithaSelf") return "pritha-self";
  if (key === "childAgents") return "child-agents";
  return key || "general";
}

export function buildAgentDevelopmentQuery(data = {}) {
  return [
    data.agentName,
    data.primaryMission,
    data.runtimeFamily,
    data.runtimePlacementProfile,
    data.primaryInterface,
    data.secondaryInterfaces,
    data.telegramMode,
    data.memoryModel,
    data.indexingSearchNeeds,
    data.toolSystem,
    data.inputDataTypes,
    data.dependencies,
    data.taskDescription,
    Array.isArray(data.coreFunctions) ? data.coreFunctions.join(" ") : data.coreFunctions,
    Array.isArray(data.criticalWorkflows) ? data.criticalWorkflows.join(" ") : data.criticalWorkflows,
    "agent harness scaffold tool memory security evaluation interface operations",
  ].filter(Boolean).join(" ");
}

export function logSemanticFailure(root, failure = {}) {
  const stateRoot = resolvePrithaStateRoot({ root });
  const relativePath = stateRoot === path.resolve(root) ? SEMANTIC_FAILURE_LOG_REL : ISOLATED_SEMANTIC_FAILURE_LOG_REL;
  const logPath = path.join(stateRoot, relativePath);
  mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(logPath), 0o700);
  const entry = {
    timestamp: new Date().toISOString(),
    status: compact(failure.status || "failed", 80),
    reason: compact(failure.reason || failure.error || "semantic_search_failed", 240),
    contract: compact(failure.contract || "", 240),
    project: compact(failure.project || "", 240),
    query_hash: queryHash(failure.query || ""),
    stderr: compact(failure.stderr || "", 1200),
  };
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  chmodSync(logPath, 0o600);
  return stateRoot === path.resolve(root) ? relativePath : path.relative(root, logPath);
}

function semanticFailureStatus(result) {
  const text = `${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
  if (result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM") return "timeout";
  if (/no embeddings found|embeddings_unavailable|run: python3 scripts\/embed-memory\.py/.test(text)) return "unavailable";
  if (/no module named|modulenotfounderror|sentence_transformers/.test(text)) return "unavailable";
  return "failed";
}

export function runSemanticPatternSearch(root, query, options = {}) {
  const mode = String(options.semanticMode || options["semantic-mode"] || "auto").trim().toLowerCase();
  if (mode === "off" || mode === "skip" || mode === "false") {
    return {
      ok: false,
      status: "skipped",
      rows: [],
      stdout: "",
      stderr: "",
      failureLog: "",
    };
  }

  const limit = Math.max(1, Math.min(Number(options.semanticLimit || options["semantic-limit"] || options.limit || 8) || 8, 20));
  const timeoutMs = Math.max(5_000, Math.min(Number(options.semanticTimeoutMs || options["semantic-timeout-ms"] || 60_000) || 60_000, 180_000));
  const result = runSyncProbe("python3", ["scripts/semantic-search.py", query, "--limit", String(limit)], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });

  if (result.status !== 0) {
    const status = semanticFailureStatus(result);
    const failureLog = logSemanticFailure(root, {
      status,
      reason: result.error?.message || result.stderr || result.stdout || "semantic search failed",
      query,
      contract: options.contract,
      project: options.project,
      stderr: result.stderr || result.stdout || "",
    });
    return {
      ok: false,
      status,
      rows: [],
      stdout: compact(result.stdout, 4_000),
      stderr: compact(result.stderr || result.error?.message || "", 4_000),
      failureLog,
    };
  }

  return {
    ok: true,
    status: "complete",
    rows: parseSemanticSearchOutput(result.stdout),
    stdout: compact(result.stdout, 8_000),
    stderr: compact(result.stderr, 2_000),
    failureLog: "",
  };
}

export function parseSemanticSearchOutput(stdout) {
  const rows = [];
  const lines = String(stdout || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(\d+)\.\s+([0-9.]+)\s+\|\s+([^|]+)\|\s+([^|]+)\|\s+(.+)\s*$/);
    if (!match) continue;
    let heading = "";
    let snippet = "";
    const next = lines[index + 1] || "";
    if (/^\s*Heading:\s*/.test(next)) {
      heading = next.replace(/^\s*Heading:\s*/, "").trim();
      snippet = (lines[index + 2] || "").trim();
    } else {
      snippet = next.trim();
    }
    rows.push({
      rank: Number(match[1]),
      score: Number(match[2]),
      type: match[3].trim(),
      status: match[4].trim(),
      path: match[5].trim(),
      title: "",
      heading,
      snippet,
    });
  }
  return rows;
}

export function extractKeywords(value, max = 12) {
  const text = String(value || "").toLowerCase();
  const tokens = text
    .replace(/[^\p{L}\p{N}.+#-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, "").trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token));
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const phrases = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const phrase = `${tokens[index]} ${tokens[index + 1]}`;
    if (TECH_SEED_PATTERN.test(phrase)) phrases.push(phrase);
  }
  return [...new Set([
    ...phrases,
    ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([token]) => token),
  ])].slice(0, max);
}

function rowPatternKind(row, sourceKind) {
  const relPath = String(row.path || "");
  if (relPath.startsWith("04_standards/")) return "standard";
  if (relPath.startsWith("07_workflows/")) return "workflow";
  if (relPath.startsWith("05_decisions/")) return "decision";
  if (relPath.startsWith("11_agents/reports/")) return "lifecycle-evidence";
  if (relPath.startsWith("11_agents/profiles/")) return "child-agent-profile";
  if (sourceKind === "semantic") return "semantic-memory-match";
  return "memory-match";
}

function confidenceFor(row, kind, sourceKind) {
  if (kind === "standard" || kind === "workflow" || kind === "decision") return "high";
  if (sourceKind === "semantic" && Number(row.score || 0) >= 0.45) return "medium";
  if (kind === "lifecycle-evidence" || kind === "child-agent-profile") return "medium";
  return "medium";
}

function applicabilityFor(kind, sourceKind) {
  if (kind === "standard") return "Use as a normative Pritha pattern unless the task has a recorded exception.";
  if (kind === "workflow") return "Use as process guidance for sequencing, gates and reports.";
  if (kind === "decision") return "Use as prior decision evidence and recheck if the technology changed.";
  if (kind === "lifecycle-evidence") return "Use as evidence of successful or failed child-agent patterns; do not clone blindly.";
  if (sourceKind === "semantic") return "Use as semantic memory evidence and confirm against primary files before implementation.";
  return "Use as candidate reusable context after checking fit with the current task.";
}

export function extractPatternCandidates(inputs = {}, options = {}) {
  const rows = [];
  for (const row of inputs.memoryResults || []) rows.push({ ...row, sourceKind: "fts", domain: "general" });
  for (const [key, values] of Object.entries(inputs.domainResults || {})) {
    for (const row of values || []) rows.push({ ...row, sourceKind: "domain", domain: domainLabel(key) });
  }
  for (const row of inputs.semantic?.rows || []) rows.push({ ...row, sourceKind: "semantic", domain: "semantic" });

  const seen = new Set();
  const candidates = [];
  for (const row of rows) {
    const key = [row.path, row.heading, compact(row.snippet, 120)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = rowPatternKind(row, row.sourceKind);
    const safePath = compact(row.path || "unknown", 500);
    const safeTitle = compact(row.title || row.path || "Memory pattern", 240);
    const safeHeading = compact(row.heading || "n/a", 240);
    const safeSnippet = compact(row.snippet || "", 500);
    const text = [safePath, safeTitle, safeHeading, safeSnippet].filter(Boolean).join(" ");
    const keywords = extractKeywords(text, 10);
    candidates.push({
      id: `pattern-${String(candidates.length + 1).padStart(2, "0")}`,
      status: "selected",
      sourceKind: row.sourceKind,
      memoryDomain: row.domain || "general",
      kind,
      confidence: confidenceFor(row, kind, row.sourceKind),
      path: safePath,
      title: safeTitle,
      heading: safeHeading,
      snippet: safeSnippet,
      score: row.score,
      applicability: applicabilityFor(kind, row.sourceKind),
      keywords,
      rationale: "Selected because it matched the agent-development task through memory, domain or semantic retrieval.",
    });
  }

  const max = Math.max(1, Math.min(Number(options.maxPatterns || options["max-patterns"] || 24) || 24, 60));
  return candidates.slice(0, max);
}

export function externalResearchSeedsForPatterns(patterns, max = 16) {
  const seeds = [];
  for (const pattern of patterns || []) {
    for (const keyword of pattern.keywords || []) {
      if (!TECH_SEED_PATTERN.test(keyword)) continue;
      const seed = canonicalPatternResearchSeed(keyword);
      if (seed) seeds.push(seed);
    }
  }
  return [...new Set(seeds.map((seed) => seed.trim()).filter(Boolean))].slice(0, max);
}

function formatPattern(pattern) {
  return [
    `### ${markdownText(pattern.id, 80)}: ${markdownText(pattern.title, 240)}`,
    "",
    `- Status: ${pattern.status}`,
    `- Source kind: ${markdownText(pattern.sourceKind, 80)}`,
    `- Memory domain: ${markdownText(pattern.memoryDomain, 120)}`,
    `- Pattern kind: ${markdownText(pattern.kind, 80)}`,
    `- Confidence: ${markdownText(pattern.confidence, 40)}`,
    `- Path: ${markdownText(pattern.path, 500)}`,
    `- Heading: ${markdownText(pattern.heading || "n/a", 240)}`,
    `- Applicability: ${markdownText(pattern.applicability, 500)}`,
    `- Rationale: ${markdownText(pattern.rationale, 500)}`,
    `- Keywords: ${markdownText((pattern.keywords || []).join(", ") || "none", 500)}`,
    pattern.score === undefined ? "" : `- Semantic score: ${pattern.score}`,
    `- Evidence snippet: ${markdownText(pattern.snippet || "n/a", 500)}`,
  ].filter(Boolean).join("\n");
}

export function patternPackMarkdown(data = {}, inputs = {}, options = {}) {
  const date = today();
  const agentSlug = slug(data.agentName, "agent");
  const query = inputs.query || buildAgentDevelopmentQuery(data);
  const semantic = inputs.semantic || { status: "skipped", rows: [], failureLog: "" };
  const patterns = extractPatternCandidates(inputs, options);
  const seeds = externalResearchSeedsForPatterns(patterns);
  const status = patterns.length > 0 ? "complete" : "memory-insufficient";
  const sources = [
    data.relPath,
    ...patterns.map((pattern) => pattern.path),
  ].filter(Boolean);
  const uniqueSources = [...new Set(sources)].slice(0, 60);
  const body = `# Agent Pattern Pack: ${markdownText(data.agentName || agentSlug, 240)}

Date: ${date}
Status: draft

## Task Basis

- Contract/project: ${markdownText(data.relPath || data.projectPath || "unknown", 500)}
- Agent/task: ${markdownText(data.agentName || "unknown", 240)}
- Query: ${markdownText(query, 1200)}
- Development task type: ${markdownText(data.developmentTaskType || "creation-or-improvement", 120)}

## Semantic/Embedding Search Status

- Status: ${markdownText(semantic.status || "skipped", 80)}
- Rows: ${semantic.rows?.length || 0}
- Failure log: ${markdownText(semantic.failureLog || "none", 500)}
- Behavior on failure: continue with warning, FTS/domain memory and external discovery; review the failure log later.

## Selected Patterns

${patterns.length ? patterns.map(formatPattern).join("\n\n") : "- No reusable local patterns were found. Broaden memory queries and use external discovery before implementation."}

## External Research Seeds

${seeds.length ? seeds.map((seed) => `- ${seed}`).join("\n") : "- No technology-specific seeds were extracted from local patterns. Use the contract/task text for external discovery."}

## Implementation Guidance

- Codex must read this pattern pack before scaffold or agent improvement implementation.
- Apply selected standards/workflows directly when they fit the task.
- Treat child-agent reports as evidence, not as templates to clone.
- Use external research to confirm, update or reject these patterns before changing harness, memory, tools, skills, MCP, interfaces or operations.
`;
  const payload = {
    schema: PATTERN_PACK_PAYLOAD_MARKER,
    contract_fingerprint: data.fingerprint || "pending",
    status,
    query: compact(query, 1200),
    semantic_status: semantic.status || "skipped",
    body_sha256: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    patterns: patterns.map((pattern) => ({
      id: pattern.id,
      path: pattern.path,
      heading: pattern.heading || "",
      kind: pattern.kind,
      status: pattern.status,
      confidence: pattern.confidence,
      score: pattern.score ?? null,
    })),
    external_research_seeds: seeds,
  };
  const lock = patternPackLock(payload);
  const machineComment = `<!-- ${PATTERN_PACK_PAYLOAD_MARKER} ${Buffer.from(JSON.stringify(canonicalize(payload)), "utf8").toString("base64url")} -->`;

  let text = `---
id: ${yamlScalar(options.artifactId || `${date}-${agentSlug}-agent-pattern-pack`)}
type: review
status: draft
created: ${date}
updated: ${date}
topics:
  - agent-engineering
  - agent-factory
  - pattern-research
  - ${agentSlug}
tools:
  - Codex
  - Pritha memory
sources:
${uniqueSources.map((source) => `  - ${yamlScalar(source)}`).join("\n") || "  - unknown"}
related:
  agent_contracts:
    - ${yamlScalar(data.relPath || "unknown")}
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
pattern_pack_status: ${status}
contract_fingerprint: ${data.fingerprint || "pending"}
pattern_pack_lock: ${lock}
pattern_pack_document_lock: pending
semantic_memory_status: ${semantic.status || "skipped"}
semantic_failure_log: ${semantic.failureLog || "none"}
selected_pattern_count: ${patterns.length}
external_research_seed_count: ${seeds.length}
verified: pending
---

${machineComment}

${body}`;
  text = text.replace(
    /^pattern_pack_document_lock:.*$/m,
    `pattern_pack_document_lock: ${markdownDocumentLock(text, "pattern_pack_document_lock")}`,
  );

  return {
    text,
    status,
    semantic,
    patterns,
    selectedPatterns: patterns,
    externalResearchSeeds: seeds,
    lock,
    contractFingerprint: data.fingerprint || "pending",
  };
}

export function parsePatternPackSeeds(patternPack) {
  if (!patternPack) return [];
  if (Array.isArray(patternPack.externalResearchSeeds)) return patternPack.externalResearchSeeds;
  const text = typeof patternPack === "string" ? patternPack : String(patternPack.text || "");
  const match = text.match(/^## External Research Seeds\s*\n([\s\S]*?)(?:\n## |$)/m);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, "").trim())
    .filter((line) => line && !/^no technology-specific/i.test(line));
}
