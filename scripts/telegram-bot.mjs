#!/usr/bin/env node

import {
  spawnSync,
} from "node:child_process";

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";
import { yamlList, yamlString } from "./lib/frontmatter.mjs";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";
import { slug as makeSlug } from "./lib/slug.mjs";
import { now, today } from "./lib/date.mjs";
import { createAnonymousSourceId, inferSourceClass } from "./lib/privacy.mjs";

const ROOT = resolveTechscopeRoot();
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });
const INBOX_DIR = path.join(ROOT, "00_inbox", "telegram");
const QUEUE_DIR = resolvePrithaStatePath("queue", "telegram-intake");
const CODEX_REVIEW_DIR = resolvePrithaStatePath("queue", "codex-media-review");
const DEFAULT_ALLOWED_USER_IDS = [];
const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = Number(process.env.TECHSCOPE_TELEGRAM_RETRY_INITIAL_MS || 3000);
const MAX_RETRY_DELAY_MS = Number(process.env.TECHSCOPE_TELEGRAM_RETRY_MAX_MS || 60000);
const RETRY_JITTER_RATIO = Number(process.env.TECHSCOPE_TELEGRAM_RETRY_JITTER_RATIO || 0.25);
const ERROR_LOG_INTERVAL_MS = Number(process.env.TECHSCOPE_TELEGRAM_ERROR_LOG_INTERVAL_MS || 60000);
const MAX_JOB_ATTEMPTS = 2;
const QUEUE_STATUSES = ["pending", "processing", "awaiting_codex", "complete", "done", "failed"];
let workerRunning = false;

function usage() {
  console.log(`Usage:
  node scripts/telegram-bot.mjs poll
  node scripts/telegram-bot.mjs poll-once [--dry-run]
  node scripts/telegram-bot.mjs getme
  node scripts/telegram-bot.mjs worker
  node scripts/telegram-bot.mjs queue-status
  node scripts/telegram-bot.mjs full-status
  node scripts/telegram-bot.mjs enqueue-existing
  node scripts/telegram-bot.mjs codex-review-status
  node scripts/telegram-bot.mjs codex-review-report
  node scripts/telegram-bot.mjs codex-review-done <job-id>

Environment:
  TECHSCOPE_TELEGRAM_BOT_TOKEN=<telegram bot token>
  TECHSCOPE_TELEGRAM_ALLOWED_USER_IDS=<telegram-user-id>`);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed${output ? `:\n${output}` : ""}`);
  }
  return output;
}

class TelegramApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "TelegramApiError";
    this.retryAfterSeconds = options.retryAfterSeconds || 0;
    this.status = options.status || 0;
    this.method = options.method || "";
  }
}

function requireToken() {
  const token = process.env.TECHSCOPE_TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TECHSCOPE_TELEGRAM_BOT_TOKEN. Put it in .env.local or export it before running.");
  }
  return token;
}

function allowedUserIds() {
  const raw = process.env.TECHSCOPE_TELEGRAM_ALLOWED_USER_IDS || DEFAULT_ALLOWED_USER_IDS.join(",");
  return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
}

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function compact(value, limit = 900) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}...`;
}

function messageText(message) {
  return cleanText(message.text || message.caption || "");
}

function titleFromText(text, message) {
  if (text) return makeSlug(text.split(/\r?\n/)[0], { stripUrls: true, allowCyrillic: true, maxLength: 60, fallback: "telegram-message" });
  if (message.photo) return "telegram-photo";
  if (message.video) return "telegram-video";
  if (message.document) return `telegram-document-${message.document.file_name || message.document.file_unique_id || message.message_id}`;
  if (message.audio) return "telegram-audio";
  if (message.voice) return "telegram-voice";
  return `telegram-message-${message.message_id}`;
}

function telegramSourceUrl(message) {
  const origin = message.forward_origin;
  if (origin?.type === "channel" && origin.chat?.username && origin.message_id) {
    return `https://t.me/${origin.chat.username}/${origin.message_id}`;
  }
  if (message.chat?.username && message.message_id) {
    return `https://t.me/${message.chat.username}/${message.message_id}`;
  }
  return "";
}

function forwardDescription(message) {
  const origin = message.forward_origin;
  if (!origin) return "";
  if (origin.type === "channel") {
    return `${origin.chat?.title || origin.chat?.username || "channel"}${origin.message_id ? ` #${origin.message_id}` : ""}`;
  }
  if (origin.type === "chat") {
    return origin.sender_chat?.title || origin.sender_chat?.username || "chat";
  }
  if (origin.type === "user") {
    const user = origin.sender_user;
    return [user?.first_name, user?.last_name, user?.username ? `@${user.username}` : ""].filter(Boolean).join(" ");
  }
  if (origin.type === "hidden_user") return origin.sender_user_name || "hidden user";
  return origin.type;
}

function mediaSummary(message) {
  const items = [];
  if (message.photo) items.push(`photo: ${message.photo.at(-1)?.file_id || "present"}`);
  if (message.video) items.push(`video: ${message.video.file_id}`);
  if (message.document) items.push(`document: ${message.document.file_name || message.document.file_id}`);
  if (message.audio) items.push(`audio: ${message.audio.file_name || message.audio.file_id}`);
  if (message.voice) items.push(`voice: ${message.voice.file_id}`);
  if (message.animation) items.push(`animation: ${message.animation.file_id}`);
  if (message.sticker) items.push(`sticker: ${message.sticker.emoji || message.sticker.file_id}`);
  return items;
}

function artifactPaths(message, text) {
  const date = today();
  const opaque = randomUUID().replace(/-/g, "").slice(0, 16);
  const base = `${date}-telegram-${opaque}`;
  return {
    mdPath: path.join(INBOX_DIR, `${base}.md`),
  };
}

function queueSubdir(name) {
  const dir = path.join(QUEUE_DIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureQueueDirs() {
  for (const name of QUEUE_STATUSES) queueSubdir(name);
}

function jobIdForIntake(intakeRel) {
  return path.basename(intakeRel, ".md");
}

function jobPath(status, jobId) {
  return path.join(queueSubdir(status), `${jobId}.json`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function findJobFile(jobId) {
  for (const status of QUEUE_STATUSES) {
    const candidate = jobPath(status, jobId);
    if (existsSync(candidate)) return { status, path: candidate };
  }
  return null;
}

function enqueueIntake(mdPath, chatId, reason = "telegram-intake", force = false) {
  ensureQueueDirs();
  const intakeRel = path.relative(ROOT, mdPath).split(path.sep).join("/");
  const jobId = jobIdForIntake(intakeRel);
  const existing = findJobFile(jobId);
  if (existing && !force) {
    return { status: existing.status, jobId, intakeRel };
  }
  if (existing && force) rmSync(existing.path, { force: true });
  const nowIso = now();
  const job = {
    id: jobId,
    type: "telegram-intake-processing",
    status: "pending",
    reason,
    intake: intakeRel,
    chat_id: chatId || "",
    attempts: 0,
    created_at: nowIso,
    updated_at: nowIso,
  };
  writeJson(jobPath("pending", jobId), job);
  return { status: "pending", jobId, intakeRel };
}

function listJobs(status) {
  ensureQueueDirs();
  return readdirSync(queueSubdir(status))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(queueSubdir(status), name));
}

function queueStats() {
  ensureQueueDirs();
  const stats = {};
  for (const status of QUEUE_STATUSES) stats[status] = listJobs(status).length;
  return stats;
}

function codexReviewSubdir(name) {
  const dir = path.join(CODEX_REVIEW_DIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureCodexReviewDirs() {
  for (const name of ["pending", "done"]) codexReviewSubdir(name);
}

function codexReviewPath(status, jobId) {
  return path.join(codexReviewSubdir(status), `${jobId}.json`);
}

function listCodexReviewJobs(status) {
  ensureCodexReviewDirs();
  return readdirSync(codexReviewSubdir(status))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(codexReviewSubdir(status), name));
}

function codexReviewStats() {
  ensureCodexReviewDirs();
  return {
    pending: listCodexReviewJobs("pending").length,
    done: listCodexReviewJobs("done").length,
  };
}

function fullPipelineStatus() {
  const intake = queueStats();
  const codex = codexReviewStats();
  const blocking = intake.pending + intake.processing + intake.awaiting_codex + intake.failed + codex.pending;
  return {
    complete: blocking === 0,
    blocking,
    telegram_intake: intake,
    codex_media_review: codex,
  };
}

function parseProcessingOutput(output) {
  const lines = String(output || "").split(/\r?\n/);
  const assessment = lines.find((line) => line.startsWith("Assessment:"))?.replace(/^Assessment:\s*/, "").trim() || "";
  const signals = lines
    .filter((line) => line.startsWith("Signal draft:"))
    .map((line) => line.replace(/^Signal draft:\s*/, "").trim());
  const transcriptions = lines.filter((line) => line.startsWith("Media processed:")).length;
  const transcriptionFailed = lines.filter((line) => line.startsWith("Media failed:")).length;
  const media = lines.filter((line) => line.startsWith("Telegram media saved:")).length;
  const mediaFailed = lines.filter((line) => line.startsWith("Telegram media failed:")).length;
  const mediaItems = lines
    .filter((line) => line.startsWith("Telegram media saved:"))
    .map((line) => {
      const match = line.match(/^Telegram media saved:\s+(.+?)\s+->\s+(.+)$/);
      return match ? { kind: match[1].trim(), path: match[2].trim() } : null;
    })
    .filter(Boolean);
  return { assessment, signals, transcriptions, transcriptionFailed, media, mediaFailed, mediaItems };
}

function enqueueCodexMediaReview(job, parsed) {
  const mediaItems = parsed.mediaItems || [];
  if (mediaItems.length === 0) return null;
  ensureCodexReviewDirs();
  const reviewJob = {
    id: job.id,
    type: "codex-assisted-media-review",
    status: "pending",
    created_at: now(),
    updated_at: now(),
    source: "telegram",
    chat_id: job.chat_id || "",
    intake: job.intake,
    assessment: parsed.assessment || "",
    signals: parsed.signals || [],
    media: mediaItems,
    instruction: "Open media files in the current Techscope Codex thread, extract technical signal, update/refine signal/assessment, and create source-note/brief/review if useful.",
  };
  writeJson(codexReviewPath("pending", reviewJob.id), reviewJob);
  return reviewJob;
}

function humanSummary(parsed, job) {
  const parts = [];
  if (parsed.transcriptions) parts.push(`медиа-транскрипция: ${parsed.transcriptions} готово`);
  if (parsed.transcriptionFailed) parts.push(`ошибки транскрибации: ${parsed.transcriptionFailed}`);
  if (parsed.media) parts.push(`медиа: ${parsed.media} файл`);
  if (parsed.mediaFailed) parts.push(`медиа: ${parsed.mediaFailed} ошибка`);
  if (parsed.signals.length) parts.push(`сигналы: ${parsed.signals.length}`);
  if (parsed.assessment) parts.push("оценка: готова");
  const detail = parts.length ? parts.join(", ") : "оценка создана";
  if (parsed.media) {
    return `Автоэтап завершён, материал ещё не финализирован.\n\n${detail}.\n\nЕсть медиа: я поставил его в Codex-разбор. После просмотра или извлечения содержимого разберу смысл, проверю контекст и обновлю индекс.\n\nИсточник: ${job.intake}`;
  }
  return `Материал полностью обработан и проиндексирован.\n\n${detail}.\n\nСоздана экспертная оценка и signal draft. Если он окажется важным для агентов или стандартов, следующим шагом будет Codex-refinement и review.\n\nИсточник: ${job.intake}`;
}

function codexReviewReport() {
  ensureCodexReviewDirs();
  const jobs = listCodexReviewJobs("pending").map((filePath) => readJson(filePath));
  if (jobs.length === 0) return "Codex media review queue is empty.";
  const blocks = [];
  for (const job of jobs) {
    blocks.push([
      `## ${job.id}`,
      "",
      `- Intake: ${job.intake}`,
      job.assessment ? `- Assessment: ${job.assessment}` : "",
      ...(job.signals || []).map((signal) => `- Signal: ${signal}`),
      ...(job.media || []).map((item) => `- Media: ${item.kind} -> ${item.path}`),
      "- Action: открыть media в Codex, извлечь technical signal, обновить/refine artifacts, затем переместить job в done.",
    ].filter(Boolean).join("\n"));
  }
  return `# Codex Media Review Queue\n\n${blocks.join("\n\n")}`;
}

function completeCodexReview(jobId) {
  ensureCodexReviewDirs();
  const pendingPath = codexReviewPath("pending", jobId);
  if (!existsSync(pendingPath)) throw new Error(`Codex media review job not found in pending: ${jobId}`);
  const job = readJson(pendingPath);
  job.status = "done";
  job.updated_at = now();
  job.completed_at = now();
  writeJson(codexReviewPath("done", jobId), job);
  rmSync(pendingPath, { force: true });
  const intakeJob = findJobFile(jobId);
  if (intakeJob?.status === "awaiting_codex") {
    const original = readJson(intakeJob.path);
    original.status = "complete";
    original.updated_at = now();
    original.completed_at = original.completed_at || now();
    original.media_review_completed_at = job.completed_at;
    writeJson(jobPath("complete", jobId), original);
    rmSync(intakeJob.path, { force: true });
  }
  return job;
}

async function sendShortFailure(chatId, job, message) {
  if (!chatId) return;
  await reply(chatId, `Не смог завершить обработку материала.\n\nСохранил вход без потерь, но задача ушла в failed queue. Причина: ${compact(message, 900)}\n\nИсточник: ${job.intake}`);
}

function renderIntake(message, rawUpdate) {
  const text = messageText(message);
  const { mdPath } = artifactPaths(message, text);
  const artifactId = path.basename(mdPath, ".md");
  const anonymousSourceId = createAnonymousSourceId("source");
  const sourceClass = inferSourceClass({
    relPath: "telegram",
    text: `${message.photo ? "image" : ""} ${message.video ? "video" : ""} ${message.audio || message.voice ? "audio" : ""} ${message.document ? "document" : ""} ${text ? "text" : ""}`,
    data: {},
  });

  const body = `---
id: ${artifactId}
type: intake
status: new
created: ${today()}
updated: ${today()}
topics: [telegram, inbox]
tools: [telegram-bot]
source_type: telegram
sources:
  - ${anonymousSourceId}
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_class: ${sourceClass}
ingested_at: ${now()}
processed_at: ${now()}
retention_status: source-purged
usefulness: medium
evidence_quality: uncertain
anonymous_source_id: ${anonymousSourceId}
---

# Intake: ${anonymousSourceId}

Date added: ${today()}
Type: telegram
Status: new
Source class: ${sourceClass}
Retention: source-purged

## Why this may matter

- Forwarded to Techscope for later expert assessment.

## Neutral intake facts

- Source class: ${sourceClass}
- Ingested at: ${now()}
- Raw payload, text, source URL, Telegram identifiers, file identifiers and original filenames are not retained in tracked memory.

## Initial questions

- Насколько это полезно для программирования, LLM-агентов, coding agents или agent workflows?
- Нужна ли проверка первоисточника?
- Стоит ли превратить это в brief, review, experiment или archive?

## Expected output

brief | review | experiment | archive
`;

  return { mdPath, body };
}

async function telegram(method, payload = {}) {
  const token = requireToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new TelegramApiError(`Telegram API ${method} failed: ${response.status} ${response.statusText}`, {
      method,
      status: response.status,
    });
  }
  if (!data.ok) {
    throw new TelegramApiError(`Telegram API ${method} failed: ${data.description || response.statusText}`, {
      method,
      status: response.status,
      retryAfterSeconds: Number(data.parameters?.retry_after || 0),
    });
  }
  return data.result;
}

async function reply(chatId, text) {
  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

async function saveMessage(update, message) {
  mkdirSync(INBOX_DIR, { recursive: true });

  const rendered = renderIntake(message, update);
  if (existsSync(rendered.mdPath)) {
    return { status: "exists", mdPath: rendered.mdPath };
  }
  writeFileSync(rendered.mdPath, rendered.body);
  return { status: "saved", mdPath: rendered.mdPath };
}

async function reindex(chatId) {
  await reply(chatId, "Reindex started.");
  runCommand("node", ["scripts/validate-memory.mjs"]);
  runCommand("node", ["scripts/rebuild-memory.mjs"]);
  runCommand("python3", ["scripts/embed-memory.py"]);
  const stats = runCommand("node", ["scripts/query-memory.mjs", "stats"]);
  await reply(chatId, `Reindex done.\n\n${stats}`);
}

async function processSavedIntake(chatId, mdPath) {
  const rel = path.relative(ROOT, mdPath).split(path.sep).join("/");
  const job = enqueueIntake(mdPath, chatId);
  if (job.status === "pending") {
    await reply(chatId, `Принял материал и поставил в очередь полного разбора.\n\nСделаю: ссылки, доступные медиа-транскрипции при наличии совместимых источников, первичную оценку, signal draft, индексацию. Если есть медиа, оно не считается готовым до Codex-разбора.\n\nИсточник: ${rel}`);
  } else if (job.status === "complete") {
    await reply(chatId, `Этот материал уже полностью обработан.\n\nИсточник: ${rel}`);
  } else if (job.status === "awaiting_codex") {
    await reply(chatId, `Этот материал уже прошёл автоэтап и ждёт Codex-разбор медиа.\n\nИсточник: ${rel}`);
  } else if (job.status === "done") {
    await reply(chatId, `Этот материал уже прошёл старый автоэтап обработки. При необходимости проверю его через полный пайплайн.\n\nИсточник: ${rel}`);
  } else {
    await reply(chatId, `Материал уже есть в очереди: ${job.status}.\n\nИсточник: ${rel}`);
  }
  kickQueueWorker();
}

async function handleUpdate(update, users) {
  const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
  if (!message) return;

  const fromId = String(message.from?.id || "");
  const chatId = message.chat?.id;
  if (!users.has(fromId)) {
    if (chatId) await reply(chatId, "Access denied.");
    return;
  }

  const text = messageText(message);
  if (text === "/start" || text === "/help") {
    await reply(chatId, "Techscope готов принимать материалы.\n\nПрисылай пост, ссылку, фото, видео или голосовое. Я проведу privacy-preserving intake: raw/provenance не сохраняются в Git-памяти, durable layer получает только processed knowledge и neutral metadata.\n\nКоманды:\n/help\n/queue\n/reindex");
    return;
  }
  if (text === "/reindex") {
    await reindex(chatId);
    return;
  }
  if (text === "/queue") {
    const stats = queueStats();
    const reviewStats = codexReviewStats();
    const full = fullPipelineStatus();
    await reply(chatId, `Очередь Techscope:\n\nполностью готово: ${stats.complete}\nждёт автоэтап: ${stats.pending}\nв работе: ${stats.processing}\nждёт Codex-разбор медиа: ${stats.awaiting_codex + reviewStats.pending}\nошибок: ${stats.failed}\nlegacy auto-done: ${stats.done}\n\nСтатус полного пайплайна: ${full.complete ? "чисто" : "есть незакрытые задачи"}`);
    return;
  }

  const result = await saveMessage(update, message);
  const rel = path.relative(ROOT, result.mdPath).split(path.sep).join("/");
  if (result.status === "saved") {
    await processSavedIntake(chatId, result.mdPath);
  } else {
    await reply(chatId, `Already saved: ${rel}`);
  }
}

async function poll() {
  const users = allowedUserIds();
  let offset = Number(process.env.TECHSCOPE_TELEGRAM_OFFSET || 0);
  let failureCount = 0;
  let lastErrorMessage = "";
  let suppressedErrors = 0;
  let lastErrorLogAt = 0;
  try {
    await telegram("deleteWebhook", { drop_pending_updates: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Telegram deleteWebhook warning: ${message}; continuing with long polling retry loop.`);
  }
  console.log(`Techscope Telegram bot polling. Allowed users: ${[...users].join(", ")}`);
  recoverProcessingJobs();
  kickQueueWorker();

  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update, users);
      }
      if (failureCount > 0) {
        console.error(`Telegram polling recovered after ${failureCount} failed attempt(s).`);
      }
      failureCount = 0;
      lastErrorMessage = "";
      suppressedErrors = 0;
      lastErrorLogAt = 0;
    } catch (error) {
      failureCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      const nowMs = Date.now();
      const shouldLog =
        message !== lastErrorMessage ||
        lastErrorLogAt === 0 ||
        nowMs - lastErrorLogAt >= ERROR_LOG_INTERVAL_MS;
      if (shouldLog) {
        const suffix = suppressedErrors > 0 ? `; suppressed ${suppressedErrors} repeated error(s)` : "";
        console.error(`Telegram polling error: ${message}${suffix}`);
        lastErrorMessage = message;
        suppressedErrors = 0;
        lastErrorLogAt = nowMs;
      } else {
        suppressedErrors += 1;
      }

      const retryAfterMs = Number(error?.retryAfterSeconds || 0) * 1000;
      const exponentialMs = Math.min(MAX_RETRY_DELAY_MS, RETRY_DELAY_MS * (2 ** Math.min(failureCount - 1, 8)));
      const baseDelayMs = retryAfterMs || exponentialMs;
      const jitterMs = Math.floor(Math.random() * Math.max(0, baseDelayMs * RETRY_JITTER_RATIO));
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
    }
  }
}

function recoverProcessingJobs() {
  ensureQueueDirs();
  for (const filePath of listJobs("processing")) {
    const job = readJson(filePath);
    job.status = "pending";
    job.updated_at = now();
    const pendingPath = jobPath("pending", job.id);
    writeJson(pendingPath, job);
    rmSync(filePath, { force: true });
  }
}

async function processJobFile(filePath, { reindex = true } = {}) {
  const job = readJson(filePath);
  const processingPath = jobPath("processing", job.id);
  job.status = "processing";
  job.attempts = Number(job.attempts || 0) + 1;
  job.updated_at = now();
  writeJson(processingPath, job);
  rmSync(filePath, { force: true });

  try {
    const output = runCommand("node", [
      "scripts/process-intake.mjs",
      job.intake,
      "--transcribe-media",
      ...(reindex ? ["--reindex"] : []),
    ]);
    const parsed = parseProcessingOutput(output);
    const reviewJob = enqueueCodexMediaReview(job, parsed);
    job.status = reviewJob ? "awaiting_codex" : "complete";
    job.updated_at = now();
    job.auto_completed_at = now();
    if (!reviewJob) job.completed_at = now();
    job.output = output;
    writeJson(jobPath(job.status, job.id), job);
    rmSync(processingPath, { force: true });
    if (job.chat_id) await reply(job.chat_id, humanSummary(parsed, job));
    return { ok: true, job };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.error = message;
    job.updated_at = now();
    if (job.attempts < MAX_JOB_ATTEMPTS) {
      job.status = "pending";
      writeJson(jobPath("pending", job.id), job);
      rmSync(processingPath, { force: true });
    } else {
      job.status = "failed";
      writeJson(jobPath("failed", job.id), job);
      rmSync(processingPath, { force: true });
      await sendShortFailure(job.chat_id, job, message);
    }
    return { ok: false, job };
  }
}

async function processQueueOnce() {
  recoverProcessingJobs();
  while (true) {
    const jobs = listJobs("pending");
    if (jobs.length === 0) return;
    const batchMode = jobs.length > 1;
    for (const jobPath of jobs) {
      if (!existsSync(jobPath)) continue;
      await processJobFile(jobPath, { reindex: !batchMode });
    }
    if (batchMode) {
      runCommand("node", ["scripts/validate-memory.mjs"]);
      runCommand("node", ["scripts/rebuild-memory.mjs"]);
      runCommand("python3", ["scripts/embed-memory.py"]);
    }
  }
}

function kickQueueWorker() {
  if (workerRunning) return;
  workerRunning = true;
  setTimeout(async () => {
    try {
      await processQueueOnce();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      workerRunning = false;
    }
  }, 10);
}

function enqueueExistingIntakes() {
  ensureQueueDirs();
  let count = 0;
  if (!existsSync(INBOX_DIR)) return count;
  for (const name of readdirSync(INBOX_DIR).filter((item) => item.endsWith(".md")).sort()) {
    const mdPath = path.join(INBOX_DIR, name);
    const result = enqueueIntake(mdPath, "", "enqueue-existing", true);
    if (result.status === "pending") count += 1;
  }
  return count;
}

async function getMe() {
  const me = await telegram("getMe");
  console.log(`Bot: @${me.username || me.first_name} (${me.id})`);
}

async function pollOnce({ dryRun = false } = {}) {
  mkdirSync(INBOX_DIR, { recursive: true });
  ensureQueueDirs();
  ensureCodexReviewDirs();
  if (dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run",
      root: ROOT,
      allowed_users: [...allowedUserIds()],
      telegram_intake: queueStats(),
      codex_media_review: codexReviewStats(),
    }, null, 2));
    return;
  }
  recoverProcessingJobs();
  await processQueueOnce();
}

async function main() {
  loadEnv();
  const command = process.argv[2] || "help";
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
  } else if (command === "getme") {
    await getMe();
  } else if (command === "poll") {
    await poll();
  } else if (command === "poll-once") {
    await pollOnce({ dryRun: process.argv.includes("--dry-run") });
  } else if (command === "worker") {
    recoverProcessingJobs();
    await processQueueOnce();
  } else if (command === "queue-status") {
    const stats = queueStats();
    console.log(JSON.stringify({ telegram_intake: stats, codex_media_review: codexReviewStats() }, null, 2));
  } else if (command === "full-status") {
    console.log(JSON.stringify(fullPipelineStatus(), null, 2));
  } else if (command === "enqueue-existing") {
    const count = enqueueExistingIntakes();
    console.log(`Queued existing Telegram intakes: ${count}`);
  } else if (command === "codex-review-status") {
    console.log(JSON.stringify(codexReviewStats(), null, 2));
  } else if (command === "codex-review-report") {
    console.log(codexReviewReport());
  } else if (command === "codex-review-done") {
    const jobId = process.argv[3];
    if (!jobId) throw new Error("Missing job id.");
    const job = completeCodexReview(jobId);
    if (job.chat_id) {
      await reply(job.chat_id, `Codex-разбор медиа завершён.\n\nМатериал теперь считается полностью обработанным: смысл извлечён, артефакты обновлены, индекс можно использовать для поиска и дальнейших решений.\n\nИсточник: ${job.intake}`);
    }
    console.log(`Codex media review done: ${job.id}`);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
