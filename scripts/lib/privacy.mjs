import { randomUUID } from "node:crypto";
import path from "node:path";

const RAW_SOURCE_PREFIX = "01_sources/raw/";

export const FORBIDDEN_RAW_PATHS = [
  "01_sources/raw/media/",
  "01_sources/raw/telegram/",
  "01_sources/raw/telegram-media/",
  "01_sources/raw/thread-media/",
];

export const FORBIDDEN_RAW_GLOBS = [
  "01_sources/raw/youtube-*",
];

const PRIVACY_TEXT_TARGETS = [
  "00_inbox/",
  "01_sources/notes/",
  "01_sources/signals/",
];

const FORBIDDEN_TEXT_PATTERNS = [
  {
    id: "raw-source-path",
    pattern: /01_sources\/raw\//i,
    description: "tracked artifacts must not point to raw source storage",
  },
  {
    id: "source-url-field",
    pattern: /\bsource_url\s*:/i,
    description: "incoming source URLs must not be retained in metadata",
  },
  {
    id: "raw-update",
    pattern: /\bRaw update\b/i,
    description: "raw platform payload breadcrumbs must not be retained",
  },
  {
    id: "media-transcript",
    pattern: /^#\s*Media Transcript\b|\bMedia Transcript\s*:/i,
    description: "raw transcript artifacts must not be retained",
  },
  {
    id: "transcript-artifact",
    pattern: /\btranscript\.(json|txt|md)\b|audio\.wav|\boriginal\.(mp4|mov|mkv|webm|mp3|m4a|wav|flac|avi|ogg|jpg|jpeg|png|pdf)\b/i,
    description: "transcript/original/audio artifact paths must not be retained",
  },
  {
    id: "telegram-identifiers",
    pattern: /\b(user_id|chat_id|message_id|file_id|file_unique_id|forwarded_from)\s*:/i,
    description: "Telegram/user/file identifiers must not be retained in tracked knowledge",
  },
  {
    id: "live-telegram-token",
    pattern: /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/,
    description: "live Telegram bot tokens must not be retained in tracked knowledge",
  },
];

const INCOMING_URL_PATTERN = /https?:\/\/[^\s<>)\]]+/i;

function normalizeRelPath(filePath) {
  return String(filePath || "").split(path.sep).join("/");
}

export function isForbiddenRawPath(relPath) {
  const normalized = normalizeRelPath(relPath);
  if (normalized === "01_sources/raw/.gitkeep") return false;
  if (normalized.startsWith(RAW_SOURCE_PREFIX)) return true;
  return FORBIDDEN_RAW_PATHS.some((prefix) => normalized.startsWith(prefix));
}

export function isPrivacyTextTarget(relPath) {
  const normalized = normalizeRelPath(relPath);
  return PRIVACY_TEXT_TARGETS.some((prefix) => normalized.startsWith(prefix))
    || /^03_reviews\/.*auto-assessment\.md$/i.test(normalized);
}

export function isTextLikePath(relPath) {
  return /\.(md|json|sql|txt|yml|yaml)$/i.test(relPath);
}

export function isMemorySnapshotPath(relPath) {
  return normalizeRelPath(relPath).startsWith(".memory/");
}

export function createAnonymousSourceId(prefix = "anon") {
  return `${prefix}-${randomUUID()}`;
}

export function valueArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

export function inferSourceClass({ relPath = "", text = "", data = {} } = {}) {
  const haystack = `${relPath}\n${text}\n${JSON.stringify(data)}`.toLowerCase();
  if (/telegram/.test(haystack)) return "telegram";
  if (/video|youtube|youtu\.be|mp4|mov|webm|mkv|media transcript/.test(haystack)) return "video";
  if (/audio|voice|podcast|mp3|m4a|wav|ogg|flac/.test(haystack)) return "audio";
  if (/image|photo|screenshot|jpg|jpeg|png|webp/.test(haystack)) return "image";
  if (/pdf|document|docx/.test(haystack)) return "document";
  if (/article|blog|html|url|link|http/.test(haystack)) return "article";
  if (/text|message|note|intake/.test(haystack)) return "text";
  return "unknown";
}

export function usefulnessValue(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (["low", "medium", "high"].includes(normalized)) return normalized;
  if (/standard|decision|review|brief|high|важн|strong/.test(normalized)) return "high";
  if (/archive|weak|noise|low/.test(normalized)) return "low";
  return "medium";
}

export function evidenceQualityValue(value = "") {
  const normalized = String(value || "").toLowerCase();
  if (["low", "medium", "high", "uncertain"].includes(normalized)) return normalized;
  if (/official|primary|verified|high/.test(normalized)) return "high";
  if (/failed|unknown|uncertain|secondary|telegram|forwarded/.test(normalized)) return "uncertain";
  return "medium";
}

export function stripProvenanceLines(text) {
  const dropLine = (line) =>
    FORBIDDEN_TEXT_PATTERNS.some(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    })
    || INCOMING_URL_PATTERN.test(line)
    || /\b(Source|Creator|Forwarded from|Telegram metadata|Source links)\b/i.test(line);

  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !dropLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function containsForbiddenText(relPath, text) {
  const findings = [];
  const scanAll = isPrivacyTextTarget(relPath) || isMemorySnapshotPath(relPath);
  const scanRawPathOnly = !scanAll;
  const lines = String(text || "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const patterns = scanRawPathOnly
      ? FORBIDDEN_TEXT_PATTERNS.filter((item) => ["raw-source-path", "live-telegram-token"].includes(item.id))
      : FORBIDDEN_TEXT_PATTERNS;
    for (const item of patterns) {
      item.pattern.lastIndex = 0;
      if (item.pattern.test(line)) {
        findings.push({
          id: item.id,
          file: relPath,
          line: index + 1,
          text: line.trim().slice(0, 220),
          description: item.description,
        });
      }
    }
    if (isPrivacyTextTarget(relPath) && INCOMING_URL_PATTERN.test(line)) {
      findings.push({
        id: "incoming-url",
        file: relPath,
        line: index + 1,
        text: line.trim().slice(0, 220),
        description: "incoming-material URLs must not be retained in intake/source/signal artifacts",
      });
    }
  }

  return findings;
}
