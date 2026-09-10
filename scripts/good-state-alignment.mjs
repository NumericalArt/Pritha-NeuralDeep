#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseFrontmatterData } from "./lib/frontmatter.mjs";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });
const DB_PATH = resolvePrithaStatePath("memory", "techscope.sqlite");

function usage() {
  return `Usage:
  node scripts/good-state-alignment.mjs --scope "<affected surface>" [--change "<summary>"] [--limit 3] [--json]

Examples:
  node scripts/good-state-alignment.mjs --scope "voice ducking control center"
  node scripts/good-state-alignment.mjs --scope "agents tailscale" --change "refactor agent start pipeline"`;
}

function parseArgs(argv) {
  const options = {
    scope: "",
    change: "",
    limit: 3,
    json: false,
    help: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--scope") {
      options.scope = argv[++index] || "";
    } else if (arg.startsWith("--scope=")) {
      options.scope = arg.slice("--scope=".length);
    } else if (arg === "--change") {
      options.change = argv[++index] || "";
    } else if (arg.startsWith("--change=")) {
      options.change = arg.slice("--change=".length);
    } else if (arg === "--limit") {
      options.limit = Number.parseInt(argv[++index] || "", 10);
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    } else {
      positional.push(arg);
    }
  }

  if (!options.scope && positional.length) {
    options.scope = positional.join(" ");
  }
  if (!Number.isFinite(options.limit) || options.limit < 1) {
    options.limit = 3;
  }
  options.limit = Math.min(options.limit, 10);
  options.scope = options.scope.trim();
  options.change = options.change.trim();
  return options;
}

function runJsonSql(sql) {
  const output = execFileSync("sqlite3", ["-json", DB_PATH, sql], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
  return output ? JSON.parse(output) : [];
}

function extractSection(markdown, heading) {
  const lines = String(markdown || "").split(/\r?\n/);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##\s+(.+?)\s*$/);
    if (match && match[1].trim().toLowerCase() === heading.toLowerCase()) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return "";

  const section = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section.join("\n").trim();
}

function excerpt(value, maxLength = 900) {
  const text = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function extractTag(markdown) {
  const tagLine = markdown.match(/^\s*-\s*Baseline tag:\s*`?([^`\n]+)`?/im);
  if (tagLine) return tagLine[1].trim();
  const tag = markdown.match(/\bpritha-good-state-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\b/i);
  return tag ? tag[0] : "";
}

function enrichBaseline(row, relevance) {
  const fullPath = path.join(ROOT, row.path);
  const markdown = existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
  const frontmatter = parseFrontmatterData(markdown) || {};
  return {
    id: row.id,
    path: row.path,
    title: row.title || frontmatter.title || "",
    status: row.status || frontmatter.status || "",
    updated: row.updated_at || frontmatter.updated || "",
    tag: extractTag(markdown),
    relevance,
    accepted_behavior: excerpt(extractSection(markdown, "Accepted Behavior")),
    protected_invariants: excerpt(extractSection(markdown, "Protected Baseline Invariants")),
    regression_signals: excerpt(extractSection(markdown, "Regression Signals")),
    known_warnings: excerpt(extractSection(markdown, "Known Acceptable Warnings"), 500),
    recovery_notes: excerpt(extractSection(markdown, "Recovery Notes"), 500),
  };
}

function latestAcceptedBaselines(limit) {
  return runJsonSql(`
SELECT id, type, status, path, title, updated_at
FROM documents
WHERE lower(status) = 'accepted'
  AND (
    path LIKE '11_agents/reports/%good-state-baseline%.md'
    OR title LIKE '%Good State Baseline%'
  )
ORDER BY COALESCE(NULLIF(updated_at, ''), indexed_at) DESC, path DESC
LIMIT ${Number(limit)};
`);
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scopeTerms(scope) {
  const stopwords = new Set(["the", "and", "for", "with", "good", "state", "baseline"]);
  return normalizeSearchText(scope)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && !stopwords.has(term));
}

function baselineSearchText(row) {
  const fullPath = path.join(ROOT, row.path);
  const markdown = existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
  return normalizeSearchText(`${row.path}\n${row.title || ""}\n${markdown}`);
}

function scoreBaseline(row, terms) {
  if (!terms.length) return 0;
  const text = baselineSearchText(row);
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function isPathInsideOrSame(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function privateGoodStateSignalDirs() {
  const root = resolvePrithaStatePath("private", "interface-lab", "pritha-control-center", "realtime", "good-state");
  return [path.join(root, "signals"), path.join(root, "pending")];
}

function voiceSignalSearchText(record) {
  return normalizeSearchText(
    [
      record.id,
      record.status,
      record.scope,
      record.operator_signal_preview,
      record.confidence,
      ...(Array.isArray(record.reasons) ? record.reasons : []),
    ].join("\n"),
  );
}

function scoreVoiceSignal(record, terms) {
  if (!terms.length) return 0;
  const text = voiceSignalSearchText(record);
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function latestVoiceSignals(limit, terms) {
  const files = privateGoodStateSignalDirs()
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => path.join(dir, entry))
        .filter((filePath) => isPathInsideOrSame(dir, filePath)),
    )
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  const seen = new Set();
  const records = [];
  for (const filePath of files) {
    try {
      const record = JSON.parse(readFileSync(filePath, "utf8"));
      if (!record.id || seen.has(record.id)) continue;
      seen.add(record.id);
      records.push({
        id: record.id,
        status: record.status || "",
        created_at: record.created_at || "",
        scope: record.scope || "",
        operator_signal_preview: excerpt(record.operator_signal_preview || "", 240),
        reasons: Array.isArray(record.reasons) ? record.reasons.map((reason) => excerpt(reason, 160)).slice(0, 4) : [],
        confidence: record.confidence || "",
        git: {
          branch: record.git?.branch || "",
          head: record.git?.head || "",
        },
        alignment_status: record.alignment?.status || "",
        path: path.relative(ROOT, filePath).replace(/\\/g, "/"),
      });
    } catch {
      continue;
    }
  }

  const scored = records
    .map((record) => ({ record, score: scoreVoiceSignal(record, terms) }))
    .sort((a, b) => b.score - a.score || String(b.record.created_at || "").localeCompare(String(a.record.created_at || "")));
  const matched = scored.filter((item) => item.score > 0);
  return (matched.length ? matched : scored).slice(0, Math.max(1, Math.min(Number(limit) || 3, 10))).map((item) => ({
    ...item.record,
    relevance: matched.length ? "scope-match" : "fallback-latest",
    match_score: item.score,
  }));
}

function buildPayload(options) {
  if (!existsSync(DB_PATH)) {
    return {
      ok: false,
      scope: options.scope,
      change: options.change,
      limit: options.limit,
      status: "memory-index-missing",
      baselines: [],
      message: "Missing state-root/memory/techscope.sqlite. Run node scripts/rebuild-memory.mjs before Good State Alignment.",
    };
  }

  const candidates = latestAcceptedBaselines(Math.max(options.limit * 6, 12));
  const terms = scopeTerms(options.scope);
  const scored = candidates
    .map((row) => ({ row, score: scoreBaseline(row, terms) }))
    .sort((a, b) => b.score - a.score || String(b.row.updated_at || "").localeCompare(String(a.row.updated_at || "")));
  const matched = scored.filter((item) => item.score > 0);
  const selected = (matched.length ? matched : scored).slice(0, options.limit);
  const relevance = matched.length ? "scope-match" : "fallback-latest";
  const voiceSignals = latestVoiceSignals(options.limit, terms);

  return {
    ok: true,
    scope: options.scope,
    change: options.change,
    limit: options.limit,
    status: matched.length ? "review-relevant-baselines" : "no-direct-scope-match-review-latest",
    baselines: selected.map((item) => ({
      ...enrichBaseline(item.row, relevance),
      match_score: item.score,
    })),
    voice_signals: voiceSignals,
    guidance: {
      default_depth: "latest 3 relevant accepted baselines",
      proceed_without_confirmation: [
        "aligned change preserving accepted behavior",
        "additive capability that keeps the baseline path intact",
        "tests, docs, reports or rebuildable memory indexes",
        "unrelated scope with no relevant recent baseline",
      ],
      require_user_confirmation: [
        "removes or disables accepted behavior",
        "weakens privacy/security/runtime guardrails",
        "changes accepted start/stop/access/port assumptions",
        "bypasses checks that made the baseline trustworthy",
        "stores runtime/private state in tracked Git artifacts",
        "makes the baseline tag or recovery path unusable",
      ],
    },
  };
}

function printText(payload) {
  console.log("Good State Alignment");
  console.log(`Scope: ${payload.scope}`);
  if (payload.change) console.log(`Change: ${payload.change}`);
  console.log(`Status: ${payload.status}`);

  if (!payload.ok) {
    console.log(payload.message);
    return;
  }

  if (!payload.baselines.length) {
    console.log("No accepted Good State Baseline reports found.");
  } else {
    console.log(`Baselines: ${payload.baselines.length}`);
    payload.baselines.forEach((baseline, index) => {
      console.log("");
      console.log(`${index + 1}. ${baseline.title || baseline.path}`);
      console.log(`   Path: ${baseline.path}`);
      if (baseline.tag) console.log(`   Tag: ${baseline.tag}`);
      console.log(`   Relevance: ${baseline.relevance}`);
      if (baseline.accepted_behavior) {
        console.log("   Accepted Behavior:");
        console.log(indent(baseline.accepted_behavior, "     "));
      }
      if (baseline.protected_invariants) {
        console.log("   Protected Baseline Invariants:");
        console.log(indent(baseline.protected_invariants, "     "));
      }
      if (baseline.regression_signals) {
        console.log("   Regression Signals:");
        console.log(indent(baseline.regression_signals, "     "));
      }
      if (baseline.known_warnings) {
        console.log("   Known Acceptable Warnings:");
        console.log(indent(baseline.known_warnings, "     "));
      }
      if (baseline.recovery_notes) {
        console.log("   Recovery Notes:");
        console.log(indent(baseline.recovery_notes, "     "));
      }
    });
  }

  if (payload.voice_signals?.length) {
    console.log("");
    console.log(`Voice Good State Signals: ${payload.voice_signals.length}`);
    payload.voice_signals.forEach((signal, index) => {
      console.log("");
      console.log(`${index + 1}. ${signal.scope || "pritha"} (${signal.status || "recorded"})`);
      console.log(`   ID: ${signal.id}`);
      console.log(`   Created: ${signal.created_at}`);
      if (signal.git?.head) console.log(`   Git: ${signal.git.branch || "unknown"} ${signal.git.head}`);
      if (signal.operator_signal_preview) {
        console.log("   Signal:");
        console.log(indent(signal.operator_signal_preview, "     "));
      }
      if (signal.reasons?.length) {
        console.log("   Reasons:");
        console.log(indent(signal.reasons.map((reason) => `- ${reason}`).join("\n"), "     "));
      }
    });
  }

  console.log("");
  console.log("Classify before editing or committing:");
  console.log("- aligned: proceed without asking the operator.");
  console.log("- no-relevant-baseline: proceed without asking, but keep scope explicit.");
  console.log("- needs-user-confirmation: pause and ask because the change materially conflicts with a listed baseline.");
}

function indent(value, prefix) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(usage());
  process.exit(0);
}

if (!options.scope) {
  console.error("Missing --scope.");
  console.error(usage());
  process.exit(1);
}

const payload = buildPayload(options);
if (options.json) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  printText(payload);
}

process.exit(payload.ok ? 0 : 2);
