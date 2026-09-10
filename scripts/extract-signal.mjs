#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, unique, yamlList } from "./lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import { slug as makeSlug } from "./lib/slug.mjs";
import { today } from "./lib/date.mjs";
import { createAnonymousSourceId, evidenceQualityValue, inferSourceClass, usefulnessValue } from "./lib/privacy.mjs";

const ROOT = resolveTechscopeRoot();
const SIGNAL_DIR = path.join(ROOT, "01_sources", "signals");

const TECH_TERMS = [
  "agent", "agents", "агент", "llm", "mcp", "rag", "codex", "claude", "cursor",
  "prompt", "промпт", "tool", "tools", "инструмент", "api", "sdk", "workflow",
  "architecture", "архитект", "security", "безопас", "eval", "test", "тест",
  "ci", "lint", "guardrail", "context", "контекст", "memory", "память",
  "database", "embedding", "oauth", "auth", "schema", "error", "ошиб",
  "retry", "timeout", "observability", "лог", "metric", "trace", "review",
  "qa", "sandbox", "browser", "devtools", "source", "standard", "decision",
];

const NOISE_PATTERNS = [
  /подписывай/i,
  /ставьте лайк/i,
  /оставьте комментар/i,
  /до скорых встреч/i,
  /scan this qr/i,
  /give it up/i,
  /welcome to the stage/i,
  /good morning/i,
  /thank you/i,
  /ссылка в описании/i,
  /залетайте/i,
  /реклам/i,
];

function usage() {
  console.log(`Usage:
  node scripts/extract-signal.mjs <artifact-path>

Creates/updates 01_sources/signals/YYYY-MM-DD-topic-signal.md`);
}

function relPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function array(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function extractTitle(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim().replace(/^(Intake|Brief|Assessment|Source Note):\s*/i, "") : fallback;
}

function compact(text, limit = 700) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  const clipped = normalized.slice(0, limit);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 100 ? boundary : limit).trim()}...`;
}

function sectionMap(body) {
  const lines = body.split(/\r?\n/);
  const sections = new Map();
  let heading = "intro";
  let buffer = [];
  function flush() {
    const text = buffer.join("\n").trim();
    if (text) sections.set(heading, text);
    buffer = [];
  }
  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function splitCandidates(body) {
  const sections = sectionMap(body);
  const candidates = [];
  for (const [heading, text] of sections.entries()) {
    const preferred = /summary|key|claim|technical|recommendation|risk|caveat|security|evidence|implication|details|source summary|takeaways|message text/i.test(heading);
    const lines = text
      .split(/\r?\n|(?<=[.!?])\s+/)
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
    for (const line of lines) {
      if (line.length < 35) continue;
      if (/https?:\/\/|01_sources\/raw\/|source_url\s*:|Raw update|Media Transcript|transcript\.(json|txt|md)|\b(user_id|chat_id|file_id|message_id)\s*:/i.test(line)) continue;
      candidates.push({ heading, text: line, preferred });
    }
  }
  return candidates;
}

function scoreCandidate(item) {
  const lower = item.text.toLowerCase();
  if (NOISE_PATTERNS.some((pattern) => pattern.test(item.text))) return -10;
  let score = item.preferred ? 2 : 0;
  for (const term of TECH_TERMS) {
    if (lower.includes(term.toLowerCase())) score += 1;
  }
  if (/[A-Z][A-Za-z0-9_-]{2,}|`[^`]+`|https?:\/\//.test(item.text)) score += 1;
  if (/must|should|нужно|долж|важн|риск|ошиб|failure|guardrail|eval|test|security/i.test(item.text)) score += 2;
  if (item.text.length > 900) score -= 1;
  return score;
}

function topSignals(body, limit = 14) {
  return splitCandidates(body)
    .map((item) => ({ ...item, score: scoreCandidate(item) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => compact(item.text, 420));
}

function extractTools(data, body) {
  const explicit = array(data.tools);
  const found = TECH_TERMS
    .filter((term) => /^[a-z0-9-]+$/i.test(term))
    .filter((term) => body.toLowerCase().includes(term.toLowerCase()));
  return unique([...explicit, ...found]).slice(0, 20);
}

function candidateRules(signals) {
  return signals
    .filter((line) => /must|should|нужно|долж|prefer|require|avoid|необходимо|важно/i.test(line))
    .slice(0, 8);
}

function verificationTasks(data, body) {
  const tasks = [];
  if (/https?:\/\//i.test(body) || array(data.sources).some((source) => source.startsWith("http"))) {
    tasks.push("Проверить первоисточники и даты публикации transiently, не сохраняя incoming provenance в durable memory.");
  }
  if (/mcp/i.test(body)) tasks.push("Сверить claims с official MCP specification and client docs.");
  if (/openai|codex/i.test(body)) tasks.push("Сверить claims с official OpenAI docs/source materials.");
  if (/security|безопас|oauth|auth|prompt injection/i.test(body)) tasks.push("Проверить security implications отдельно перед стандартом.");
  return unique(tasks).slice(0, 8);
}

function outputPath(data, title) {
  const anon = data.anonymous_source_id || createAnonymousSourceId("source");
  const base = `${today()}-${anon.replace(/^source-/, "source-").slice(0, 28)}-signal`;
  return path.join(SIGNAL_DIR, `${base}.md`);
}

function renderSignal({ data, body, inputRel, title, outPath }) {
  const signals = topSignals(body);
  const tools = extractTools(data, body);
  const rules = candidateRules(signals);
  const verifications = verificationTasks(data, body);
  const topics = unique([...array(data.topics), "signal-extraction"]).slice(0, 20);
  const anonId = data.anonymous_source_id || createAnonymousSourceId("source");
  const sourceClass = data.source_class || inferSourceClass({ relPath: inputRel, text: body, data });
  const sourceLinks = unique([anonId]);
  const quality = signals.length >= 8 ? "high" : signals.length >= 4 ? "medium" : "low";

  return `---
id: ${path.basename(outPath, ".md")}
type: signal
status: extracted
created: ${today()}
updated: ${today()}
topics:${yamlList(topics)}
tools:${yamlList(tools)}
sources:${yamlList(sourceLinks)}
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
generated_from:
  - ${anonId}
signal_quality: ${quality}
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
source_class: ${sourceClass}
processed_at: ${new Date().toISOString()}
retention_status: source-purged
usefulness: ${usefulnessValue(quality)}
evidence_quality: ${evidenceQualityValue(data.evidence_quality || data.evidence || "")}
anonymous_source_id: ${anonId}
---

# Signal: ${anonId}

Date: ${today()}
Status: extracted
Signal quality: ${quality}
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement
Source class: ${sourceClass}
Retention: source-purged

## Core signal

${signals.length ? signals.slice(0, 10).map((item) => `- ${item}`).join("\n") : "- Signal is weak; manual extraction required."}

## Technical details

${signals.slice(10, 16).length ? signals.slice(10, 16).map((item) => `- ${item}`).join("\n") : "- No additional technical details extracted automatically."}

## Agent design implications

- Проверить, можно ли превратить signal в правила для \`AGENTS.md\`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review; raw/provenance sources are not retained in durable memory.

## Candidate rules

${rules.length ? rules.map((item) => `- ${item}`).join("\n") : "- Candidate rules require manual review."}

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.
- Full source text/transcript is not copied into this signal.

## Verification required

${verifications.length ? verifications.map((item) => `- ${item}`).join("\n") : "- Проверить исходный материал перед promotion to standard."}

## Codex refinement required

- Пройти harness \`07_workflows/prompts/signal-extraction-harness.md\` в этом Techscope thread.
- Удалить случайные фразы, вопросы без пользы и source metadata, если они не являются technical signal.
- Добавить missing technical details, agent-design implications, risks, verification tasks and candidate rules.
- После ручного Codex-pass обновить \`status: refined\`, \`extraction_mode: codex-assisted\`, \`refinement_status: codex-refined\`.
`;
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Missing artifact path.");
  const fullPath = path.resolve(ROOT, input);
  if (!fullPath.startsWith(ROOT + path.sep)) throw new Error("Input path must be inside workspace.");
  if (!existsSync(fullPath)) throw new Error(`Input not found: ${input}`);
  const inputRel = relPath(fullPath);
  const raw = readFileSync(fullPath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  data.anonymous_source_id = data.anonymous_source_id || createAnonymousSourceId("source");
  const title = extractTitle(body, data.id || path.basename(inputRel, ".md"));
  mkdirSync(SIGNAL_DIR, { recursive: true });
  const outPath = outputPath(data, title);
  writeFileSync(outPath, renderSignal({ data, body, inputRel, title, outPath }));
  console.log(`Signal: ${relPath(outPath)}`);
  console.log("Codex refinement required: 07_workflows/prompts/signal-extraction-harness.md");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
