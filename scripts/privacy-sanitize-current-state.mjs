#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { today } from "./lib/date.mjs";
import { parseFrontmatter, yamlString } from "./lib/frontmatter.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import {
  createAnonymousSourceId,
  evidenceQualityValue,
  inferSourceClass,
  isPrivacyTextTarget,
  stripProvenanceLines,
  usefulnessValue,
  valueArray,
} from "./lib/privacy.mjs";

const ROOT = resolveTechscopeRoot();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const jsonMode = args.has("--json");

function git(commandArgs) {
  const result = spawnSync("git", commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || `git ${commandArgs.join(" ")} failed`);
  return String(result.stdout || "");
}

function trackedMarkdownFiles() {
  return git(["ls-files", "*.md", "-z"]).split("\0").filter(Boolean);
}

function needsSanitize(relPath, raw) {
  if (isPrivacyTextTarget(relPath)) return true;
  return false;
}

function yamlList(values, indent = 0) {
  const list = valueArray(values);
  if (!list.length) return "[]";
  const pad = " ".repeat(indent);
  return `\n${list.map((item) => `${pad}- ${yamlString(item)}`).join("\n")}`;
}

function yamlValue(value, indent = 0) {
  if (Array.isArray(value)) return yamlList(value, indent + 2);
  if (value && typeof value === "object") {
    const lines = [];
    for (const [key, nested] of Object.entries(value)) {
      if (Array.isArray(nested)) {
        lines.push(`${" ".repeat(indent + 2)}${key}:${yamlList(nested, indent + 4)}`);
      } else if (nested && typeof nested === "object") {
        lines.push(`${" ".repeat(indent + 2)}${key}:${yamlValue(nested, indent + 2)}`);
      } else {
        lines.push(`${" ".repeat(indent + 2)}${key}: ${yamlString(nested)}`);
      }
    }
    return lines.length ? `\n${lines.join("\n")}` : " {}";
  }
  return ` ${yamlString(value)}`;
}

function serializeFrontmatter(data) {
  const ordered = [
    "id", "type", "status", "created", "updated", "topics", "tools", "sources", "related",
    "supersedes", "superseded_by", "source_type", "source_class", "ingested_at", "processed_at",
    "retention_status", "usefulness", "evidence_quality", "anonymous_source_id",
    "generated_from", "signal_quality", "extraction_mode", "refinement_status", "harness",
    "recommendation",
  ];
  const seen = new Set();
  const lines = [];
  for (const key of ordered) {
    if (!(key in data)) continue;
    seen.add(key);
    lines.push(`${key}:${yamlValue(data[key])}`);
  }
  for (const [key, value] of Object.entries(data)) {
    if (seen.has(key)) continue;
    lines.push(`${key}:${yamlValue(value)}`);
  }
  return `---\n${lines.join("\n")}\n---\n\n`;
}

function removeProvenanceFields(data) {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (/^(source_url|source_path|raw|raw_path|raw_update|telegram|media|transcript|file_id|chat_id|user_id|message_id)$/i.test(key)) {
      delete out[key];
    }
  }
  return out;
}

function sanitizeBodySections(body) {
  const lines = String(body || "").split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      const name = heading[1].trim();
      skipping = /Source links|Raw material|Telegram metadata|Message text|Link processing|Media transcription|Telegram media|Extracted material/i.test(name);
      if (!skipping) out.push(line);
      continue;
    }
    if (!skipping) out.push(line);
  }
  return stripProvenanceLines(out.join("\n"));
}

function neutralBody({ type, anonId, sourceClass, created, status }) {
  return `# Intake: ${anonId}

Date: ${created}
Status: ${status || "processed"}
Source class: ${sourceClass}
Retention: source-purged

## Processed status

- Raw source content and direct provenance were removed from tracked memory.
- The durable memory record keeps only neutral metadata and processed knowledge.
- Curated ideas, patterns, standards, decisions and assessments remain in related authored artifacts when available.

## Follow-up

- Use processed briefs, reviews, decisions and standards as the durable evidence layer.
- Do not reconstruct or request the original source unless a separate secure storage decision exists.
`;
}

function sanitizeMarkdown(relPath, raw) {
  const { data, body } = parseFrontmatter(raw);
  const type = String(data.type || (relPath.startsWith("00_inbox/") ? "intake" : "artifact"));
  const created = data.created || data.ingested_at || today();
  const anonId = data.anonymous_source_id || createAnonymousSourceId("source");
  const sourceClass = data.source_class || inferSourceClass({ relPath, text: raw, data });
  const usefulness = usefulnessValue(data.usefulness || data.recommendation || data.status);
  const evidence = evidenceQualityValue(data.evidence_quality || data.evidence || data.sources);

  const next = removeProvenanceFields(data);
  next.id = data.id || path.basename(relPath, ".md");
  next.type = type;
  next.status = data.status || "processed";
  next.created = created;
  next.updated = today();
  next.topics = valueArray(data.topics).length ? valueArray(data.topics) : ["privacy-preserving-intake"];
  next.tools = valueArray(data.tools).filter((item) => !/telegram file|raw|transcript/i.test(item));
  next.sources = [anonId];
  next.related = { workflows: ["07_workflows/privacy-preserving-intake.md"] };
  next.source_type = sourceClass;
  next.source_class = sourceClass;
  next.ingested_at = data.ingested_at || created;
  next.processed_at = new Date().toISOString();
  next.retention_status = "source-purged";
  next.usefulness = usefulness;
  next.evidence_quality = evidence;
  next.anonymous_source_id = anonId;

  if (type === "signal") {
    next.generated_from = [anonId];
    next.harness = data.harness || "07_workflows/prompts/signal-extraction-harness.md";
    next.signal_quality = data.signal_quality || "uncertain";
    next.extraction_mode = data.extraction_mode || "privacy-sanitized";
    next.refinement_status = data.refinement_status || "needs-codex-refinement";
  }
  if (type === "assessment") {
    next.recommendation = data.recommendation || "review";
  }

  let nextBody;
  if (relPath.startsWith("00_inbox/") || relPath.startsWith("01_sources/notes/")) {
    nextBody = neutralBody({ type, anonId, sourceClass, created, status: next.status });
  } else {
    const stripped = sanitizeBodySections(body);
    const heading = type === "assessment" ? `# Assessment: ${anonId}` : type === "signal" ? `# Signal: ${anonId}` : `# Artifact: ${anonId}`;
    nextBody = `${heading}

Date: ${created}
Status: ${next.status}
Source class: ${sourceClass}
Retention: source-purged

${stripped.replace(/^#\s+.+$/m, "").trim() || neutralBody({ type, anonId, sourceClass, created, status: next.status }).replace(/^#.+\n+/, "")}
`;
  }

  return serializeFrontmatter(next) + `${nextBody.trim()}\n`;
}

function main() {
  const changed = [];
  const skipped = [];
  for (const relPath of trackedMarkdownFiles()) {
    const fullPath = path.join(ROOT, relPath);
    if (!existsSync(fullPath)) continue;
    const raw = readFileSync(fullPath, "utf8");
    if (!needsSanitize(relPath, raw)) {
      skipped.push(relPath);
      continue;
    }
    const sanitized = sanitizeMarkdown(relPath, raw);
    if (sanitized !== raw) {
      changed.push(relPath);
      if (!dryRun) writeFileSync(fullPath, sanitized);
    }
  }
  const payload = {
    schema: "pritha-privacy-sanitize-current-state-v1",
    root: ROOT,
    dryRun,
    changed: changed.length,
    skipped: skipped.length,
    files: changed,
  };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Privacy sanitize current state${dryRun ? " (dry-run)" : ""}: ${changed.length} changed, ${skipped.length} skipped`);
    for (const file of changed.slice(0, 80)) console.log(`- ${file}`);
    if (changed.length > 80) console.log(`- ... ${changed.length - 80} more`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
