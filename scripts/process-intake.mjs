#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";
import { indentedYamlList, parseFrontmatter, unique, yamlList } from "./lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import { slug as makeSlug } from "./lib/slug.mjs";
import { today } from "./lib/date.mjs";
import { createAnonymousSourceId, evidenceQualityValue, inferSourceClass, usefulnessValue } from "./lib/privacy.mjs";

const ROOT = resolveTechscopeRoot();
const REVIEWS_DIR = path.join(ROOT, "03_reviews");
const FETCH_TIMEOUT_MS = 10000;

const TECH_KEYWORDS = [
  "agent",
  "агент",
  "llm",
  "rag",
  "mcp",
  "codex",
  "claude",
  "cursor",
  "openai",
  "model",
  "модель",
  "prompt",
  "промпт",
  "architecture",
  "архитект",
  "dev",
  "разработ",
  "code",
  "код",
  "workflow",
  "automation",
  "автомат",
  "tool",
  "инструмент",
  "memory",
  "память",
  "embedding",
  "obsidian",
  "database",
  "security",
  "безопас",
];

function usage() {
  console.log(`Usage:
  node scripts/process-intake.mjs <intake-path> [--transcribe-media] [--reindex]

Creates an assessment draft in 03_reviews/ and optionally processes compatible media sources.`);
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
  return match ? match[1].trim() : fallback;
}

function extractSection(body, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const lines = body.split(/\r?\n/);
  let active = false;
  const out = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      active = wanted.has(heading[1].trim().toLowerCase());
      continue;
    }
    if (active) out.push(line);
  }
  return out.join("\n").trim();
}

function compact(text, limit = 900) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  const clipped = normalized.slice(0, limit);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 100 ? boundary : limit).trim()}...`;
}

function extractUrls(text) {
  const matches = String(text).match(/https?:\/\/[^\s<>)\]]+/g) || [];
  return unique(matches.map((url) => url.replace(/[.,;:!?]+$/g, "")));
}

function findRawTelegramPath(data, body) {
  const sources = array(data.sources);
  const candidate = sources.find((item) => item.startsWith("01_sources/raw/telegram/") && item.endsWith(".json"));
  if (candidate) return candidate;
  const bodyMatch = body.match(/Raw update:\s+`([^`]+)`/i);
  if (bodyMatch?.[1]?.startsWith("01_sources/raw/telegram/")) return bodyMatch[1];
  return "";
}

function telegramMessageFromUpdate(update) {
  return update.message || update.edited_message || update.channel_post || update.edited_channel_post || null;
}

function extensionFromFilePath(filePath, fallback = ".bin") {
  const ext = path.extname(filePath || "");
  if (ext && ext.length <= 12) return ext;
  return fallback;
}

function telegramMediaItems(message) {
  const items = [];
  if (!message) return items;
  if (message.photo?.length) {
    const photo = message.photo.at(-1);
    items.push({ kind: "photo", fileId: photo.file_id, fallbackExt: ".jpg" });
  }
  for (const kind of ["video", "document", "audio", "voice", "animation", "sticker"]) {
    const media = message[kind];
    if (media?.file_id) {
      const fallbackExt = kind === "voice" ? ".ogg" : kind === "video" || kind === "animation" ? ".mp4" : ".bin";
      items.push({
        kind,
        fileId: media.file_id,
        fileName: media.file_name || "",
        mimeType: media.mime_type || "",
        fallbackExt,
      });
    }
  }
  return items;
}

async function telegramApi(method, payload = {}) {
  const token = process.env.TECHSCOPE_TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TECHSCOPE_TELEGRAM_BOT_TOKEN is not available for media download.");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram API ${method} failed: ${data.description || response.statusText}`);
  return data.result;
}

async function downloadTelegramFile(fileId, destinationDir, basename, fallbackExt) {
  const token = process.env.TECHSCOPE_TELEGRAM_BOT_TOKEN;
  const file = await telegramApi("getFile", { file_id: fileId });
  const ext = extensionFromFilePath(file.file_path, fallbackExt);
  const outPath = path.join(destinationDir, `${basename}${ext}`);
  if (existsSync(outPath)) return outPath;
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(outPath, buffer);
  return outPath;
}

async function downloadTelegramMedia(data, body, intakeRel) {
  return {
    downloaded: [],
    skipped: "Tracked Telegram media download is disabled by privacy-preserving intake policy.",
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { killSignal: "SIGKILL",
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    timeout: options.timeout || 0,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
  }
  return output;
}

async function inspectUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "TechscopeBot/0.1 (+local knowledge intake)",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    let title = "";
    if (contentType.includes("text/html")) {
      const html = await response.text();
      title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
    }
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType,
      finalUrl: response.url,
      title,
      error: "",
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: "",
      contentType: "",
      finalUrl: "",
      title: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function inferScores(text, urls) {
  const lower = text.toLowerCase();
  const keywordHits = TECH_KEYWORDS.filter((keyword) => lower.includes(keyword)).length;
  const hasLinks = urls.length > 0;
  const relevance = Math.min(5, keywordHits >= 6 ? 5 : keywordHits >= 3 ? 4 : keywordHits >= 1 ? 3 : hasLinks ? 2 : 1);
  const agentFit = Math.min(5, /agent|агент|llm|rag|mcp|codex|cursor|claude|prompt|промпт|memory|память/i.test(text) ? 4 : relevance >= 4 ? 3 : 1);
  const evidence = hasLinks ? 3 : 1;
  const practicality = relevance >= 4 ? 3 : 2;
  const leverage = agentFit >= 4 ? 4 : relevance >= 4 ? 3 : 2;
  const risk = hasLinks ? 2 : 1;
  const total = relevance + agentFit + evidence + practicality + leverage;
  const recommendation = total >= 20 ? "review" : total >= 14 ? "brief" : "archive";
  return { relevance, agentFit, evidence, practicality, leverage, risk, recommendation };
}

function candidateMediaSources(urls) {
  return unique(urls);
}

function parseJsonPayload(output) {
  const text = String(output || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("No JSON payload found in command output.");
  }
}

function inferMediaLanguage(text) {
  return /[а-яё]/iu.test(text) ? "ru" : "en";
}

function transcribeMediaSources(sources, options = {}) {
  const processed = [];
  const language = options.language || inferMediaLanguage(options.text || "");
  for (const source of sources) {
    try {
      const output = run("node", ["scripts/transcribe-media.mjs", source, "--language", language, "--json"], { timeout: 30 * 60 * 1000 });
      const payload = parseJsonPayload(output);
      processed.push({
        ok: true,
        output,
        anonymous_source_id: payload.anonymous_source_id || "",
        source_class: payload.source_class || "unknown",
        retention_status: payload.retention_status || "source-purged",
        language,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No compatible media adapter found for this source.")) continue;
      processed.push({ ok: false, output: message, anonymous_source_id: "", source_class: "unknown", retention_status: "source-purged" });
    }
  }
  return processed;
}

function extractSignal(artifactPath) {
  const output = run("node", ["scripts/extract-signal.mjs", artifactPath], { timeout: 60 * 1000 });
  return output.match(/Signal:\s+(.+)$/m)?.[1]?.trim() || "";
}

function assessmentPath(intakeData) {
  const anon = intakeData.anonymous_source_id || createAnonymousSourceId("source");
  const base = `${today()}-${anon.replace(/^source-/, "source-").slice(0, 28)}-auto-assessment`;
  return path.join(REVIEWS_DIR, `${base}.md`);
}

function memorySearch(text, excludeRel = "") {
  const query = unique(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9а-яё]+/iu)
      .filter((item) => item.length >= 4)
      .filter((item) => TECH_KEYWORDS.some((keyword) => item.includes(keyword) || keyword.includes(item)))
      .slice(0, 5),
  ).join(" ");
  if (!query) return "No strong Techscope search terms detected yet.";
  try {
    const output = run("node", ["scripts/query-memory.mjs", "search", query], { timeout: 30 * 1000 });
    const filtered = output
      .split(/\r?\n/)
      .filter((line) => !excludeRel || !line.includes(excludeRel))
      .join("\n")
      .trim();
    return filtered || "No related memory results.";
  } catch (error) {
    return `Memory search unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function renderAssessment({ outPath, intakeRel, intakeData, body, urls, urlInspections, mediaProcessed, telegramMedia, signalPaths, scores, relatedMemory }) {
  const artifactId = path.basename(outPath, ".md");
  const anonId = intakeData.anonymous_source_id || createAnonymousSourceId("source");
  const sourceClass = intakeData.source_class || inferSourceClass({ relPath: intakeRel, text: body, data: intakeData });
  const sources = unique([
    anonId,
    ...signalPaths,
  ]);

  const mediaLines = mediaProcessed.length
    ? mediaProcessed.map((item) => item.ok
      ? `- Media source class ${item.source_class || "unknown"} was transcribed transiently and purged. Anonymous source: ${item.anonymous_source_id || "not retained"}.`
      : `- Media transcription failed during transient processing: ${compact(item.output, 240)}`).join("\n")
    : "- No compatible media sources processed.";

  return `---
id: ${artifactId}
type: assessment
status: draft
created: ${today()}
updated: ${today()}
topics: [assessment, intake-processing, telegram, media-intake, llm-agents]
tools: [telegram-bot, process-intake, markdown]
sources:${yamlList(sources)}
related:
  signals:${indentedYamlList(signalPaths)}
  workflows:
    - 07_workflows/expert-information-assessment.md
    - 07_workflows/media-intake-processing.md
    - 07_workflows/privacy-preserving-intake.md
recommendation: ${scores.recommendation}
source_class: ${sourceClass}
processed_at: ${new Date().toISOString()}
retention_status: source-purged
usefulness: ${usefulnessValue(scores.recommendation)}
evidence_quality: ${evidenceQualityValue(urls.length ? "uncertain" : "low")}
anonymous_source_id: ${anonId}
---

# Assessment: ${anonId}

Date: ${today()}
Status: draft
Recommendation: ${scores.recommendation}
Source class: ${sourceClass}
Retention: source-purged

## One-paragraph read

Автоматическая первичная экспертная оценка intake-материала в privacy-preserving режиме. Raw content, direct source URLs, original filenames, Telegram identifiers and transcript artifacts are not retained in tracked memory. Эта оценка является draft: перед стандартом или решением нужен человеческий/агентный консилиум по expert lenses.

## Why it matters

- Материал попал во входящий поток Techscope и должен быть оценен относительно миссии: программирование, LLM agents, coding agents, agent workflows, tooling и технологические стандарты.
- Автоматический pass создает processed knowledge draft без сохранения raw/provenance breadcrumbs.
- Если материал содержит media sources или внешние ссылки, они используются только transiently; durable memory keeps neutral metadata and processed conclusions.

## Media transcription

${mediaLines}

## Signal extraction

${signalPaths.length ? signalPaths.map((item) => `- ${item}`).join("\n") : "- No signal artifact created."}

## Codex-assisted refinement

${signalPaths.length ? "- Required. The created signal artifacts are heuristic drafts and must be refined in this Techscope Codex thread with `07_workflows/prompts/signal-extraction-harness.md` before promotion to brief, review, decision or standard." : "- Required after a signal artifact is created."}

For Telegram and other forwarded media this step is especially important: forwarded text often mixes useful signal, commentary, ads, missing context and privacy-sensitive provenance.

## Related Techscope memory

\`\`\`text
${compact(relatedMemory, 2400)}
\`\`\`

## Technical claims

- Требует ручного или агентного извлечения claims из исходного материала.
- Если ссылки были доступны transiently, первоисточники нужно проверять отдельно перед рекомендацией \`decision\` или \`standard\`, не сохраняя incoming provenance.
- Если media transcript создан transiently, анализировать нужно derived brief/assessment, а не вставлять полный transcript в индексируемую память.

## Programming relevance

Score: ${scores.relevance}/5

Автоматическая эвристика по ключевым словам, ссылкам и контексту intake. Требует подтверждения консилиумом.

## Agent engineering relevance

Score: ${scores.agentFit}/5

Оценка повышается при признаках agent workflows, LLM, RAG, memory, prompts, coding agents или related tooling.

## DX impact

Score: ${scores.practicality}/5

Пока оценено как потенциальное влияние на workflow. Нужно уточнить, упрощает ли это работу разработчика или добавляет эксплуатационную сложность.

## Evidence quality

Score: ${scores.evidence}/5

Ссылки и транскрипции повышают evidence score, но не заменяют проверку первоисточников.

## Practicality

Score: ${scores.practicality}/5

Практичность определяется после сравнения с существующими стандартами и решениями Techscope.

## Leverage

Score: ${scores.leverage}/5

Потенциальный leverage связан с переносимостью идеи в будущие проекты или настройки агентов.

## Risk

Score: ${scores.risk}/5

Риски: вторичный источник, неполный контекст, возможная недоступность ссылок, hype, privacy/supply-chain вопросы.

## Expert lenses

### Programming

Проверить применимость к архитектуре, коду, тестам, CI/CD, локальной среде или библиотекам.

### Agent Engineering

Проверить, помогает ли материал создавать, настраивать, проверять или улучшать LLM/coding agents.

### DX

Оценить, делает ли идея workflow проще, быстрее и воспроизводимее.

### Security

Проверить приватность, секреты, доступы, supply chain и риск отправки чувствительных данных внешним сервисам.

### Evidence

Найти первоисточник, дату, официальную документацию, репозиторий, changelog, benchmark или issue.

### Product Pragmatism

Решить, стоит ли тратить время на brief/review/experiment сейчас.

## Decision

Автоматический draft создан. Следующий шаг: консилиумная экспертная оценка по ролям и, при достаточной пользе, brief/review/experiment.

## Next artifact

${scores.recommendation}
`;
}

async function processIntake(inputPath, options) {
  const fullPath = path.resolve(ROOT, inputPath);
  if (!fullPath.startsWith(ROOT + path.sep)) throw new Error("Input path must be inside workspace.");
  if (!existsSync(fullPath)) throw new Error(`Input file not found: ${inputPath}`);
  const intakeRel = relPath(fullPath);
  if (!intakeRel.startsWith("00_inbox/") && !intakeRel.startsWith("01_sources/notes/")) {
    throw new Error("process-intake accepts only intake or source-note Markdown files.");
  }

  const raw = readFileSync(fullPath, "utf8");
  const { data, body } = parseFrontmatter(raw);
  if (!data.id || !data.type) throw new Error("Input must have YAML frontmatter with id and type.");
  data.anonymous_source_id = data.anonymous_source_id || createAnonymousSourceId("source");
  const urls = extractUrls(`${raw}\n${array(data.sources).join("\n")}\n${data.source_url || ""}`);
  const urlInspections = [];
  for (const url of urls.slice(0, 12)) {
    urlInspections.push(await inspectUrl(url));
  }
  const mediaProcessed = options.transcribeMedia ? transcribeMediaSources(candidateMediaSources(urls), {
    text: `${raw}\n${urlInspections.map((item) => item.title).join(" ")}`,
  }) : [];
  const telegramMedia = await downloadTelegramMedia(data, body, intakeRel);
  const signalPaths = unique([
    extractSignal(intakeRel),
    ...mediaProcessed
      .filter((item) => item.ok && item.anonymous_source_id)
      .map(() => ""),
  ]);
  mkdirSync(REVIEWS_DIR, { recursive: true });
  const title = extractTitle(body, data.id || path.basename(intakeRel, ".md"));
  const outPath = assessmentPath(data, title);
  const outRel = relPath(outPath);
  const scores = inferScores(`${raw}\n${urlInspections.map((item) => item.title).join(" ")}`, urls);
  const relatedMemory = memorySearch(`${raw}\n${urlInspections.map((item) => item.title).join(" ")}`, outRel);
  const assessment = renderAssessment({
    outPath,
    intakeRel,
    intakeData: data,
    body,
    urls,
    urlInspections,
    mediaProcessed,
    telegramMedia,
    signalPaths,
    scores,
    relatedMemory,
  });
  writeFileSync(outPath, assessment);

  if (options.reindex) {
    run("node", ["scripts/validate-memory.mjs"]);
    run("node", ["scripts/rebuild-memory.mjs"]);
    run("python3", ["scripts/embed-memory.py"]);
  }

  console.log(`Assessment: ${relPath(outPath)}`);
  if (signalPaths.length) {
    for (const signalPath of signalPaths) console.log(`Signal draft: ${signalPath}`);
    console.log("Codex refinement required: 07_workflows/prompts/signal-extraction-harness.md");
  }
  if (mediaProcessed.length) {
    for (const item of mediaProcessed) {
      console.log(`${item.ok ? "Media processed" : "Media failed"}: ${item.anonymous_source_id || "anonymous"}`);
    }
  }
  if (telegramMedia.downloaded.length) {
    for (const item of telegramMedia.downloaded) {
      console.log(`${item.ok ? "Telegram media saved" : "Telegram media failed"}: ${item.kind}${item.path ? ` -> ${item.path}` : ""}`);
    }
  }
  return outPath;
}

function parseArgs(argv) {
  const args = { inputPath: "", transcribeMedia: false, reindex: false };
  for (const arg of argv) {
    if (arg === "--transcribe-media") args.transcribeMedia = true;
    else if (arg === "--reindex") args.reindex = true;
    else if (!args.inputPath) args.inputPath = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.inputPath) throw new Error("Missing intake path.");
  return args;
}

try {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  await processIntake(args.inputPath, args);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
