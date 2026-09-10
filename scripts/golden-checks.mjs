#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolveTechscopeRoot({ cwd: DEFAULT_ROOT });
loadPrithaRuntimeEnv({ root: ROOT });
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });

const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const dryRun = args.has("--dry-run");
const withEmbeddings = args.has("--with-embeddings") || process.env.TECHSCOPE_GOLDEN_EMBEDDINGS === "1";

function run(name, command, commandArgs, options = {}) {
  const started = Date.now();
  if (dryRun || options.skip) {
    return {
      name,
      command: [command, ...commandArgs].join(" "),
      status: dryRun ? "planned" : "skipped",
      exitCode: 0,
      durationMs: 0,
      stdout: "",
      stderr: "",
      notes: dryRun ? "dry-run" : options.reason || "skipped",
    };
  }

  const result = runSyncProbe(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 120000,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });

  return {
    name,
    command: [command, ...commandArgs].join(" "),
    status: result.status === 0 ? "pass" : options.nonBlocking ? "warning" : "fail",
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? result.error.message : undefined,
  };
}

const checks = [
  run("Privacy retention audit", "node", ["scripts/privacy-audit.mjs", "--strict"]),
  run("Markdown integrity", "node", ["scripts/validate-memory.mjs"]),
  run("Memory rebuild", "node", ["scripts/rebuild-memory.mjs"]),
  run("Memory stats", "node", ["scripts/query-memory.mjs", "stats"]),
  run("Environment doctor", "node", ["scripts/env-doctor.mjs"], { nonBlocking: true }),
  run("Agents Mother self-inspection", "node", ["scripts/agents-mother.mjs", "test", ".", "--no-report"]),
  run("Telegram dry-run", "node", ["scripts/telegram-bot.mjs", "poll-once", "--dry-run"]),
  run("Telegram queue status", "node", ["scripts/telegram-bot.mjs", "queue-status"]),
];

checks.push(run(
  "Embeddings rebuild",
  "python3",
  ["scripts/embed-memory.py"],
  {
    skip: !withEmbeddings,
    reason: "optional; pass --with-embeddings or TECHSCOPE_GOLDEN_EMBEDDINGS=1",
    timeoutMs: 600000,
  },
));

checks.push(run(
  "Semantic search sanity",
  "node",
  ["scripts/query-memory.mjs", "semantic", "agent factory"],
  {
    skip: !withEmbeddings || !existsSync(resolvePrithaStatePath("memory", "techscope.sqlite")),
    reason: "optional; requires embeddings rebuild",
    timeoutMs: 120000,
  },
));

const failed = checks.filter((check) => check.status === "fail");
const warnings = checks.filter((check) => check.status === "warning");
const payload = {
  root: ROOT,
  status: dryRun ? "planned" : failed.length === 0 ? "pass" : "fail",
  failed: failed.length,
  warnings: warnings.length,
  checks,
};

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Techscope golden checks: ${payload.status}`);
  console.log(`Root: ${ROOT}`);
  for (const check of checks) {
    const suffix = check.status === "skipped" || check.status === "planned" ? ` (${check.notes})` : ` (${check.durationMs}ms)`;
    console.log(`- ${check.status.toUpperCase()} ${check.name}${suffix}`);
    if (check.status === "fail" || check.status === "warning") {
      if (check.stdout) console.log(`  stdout: ${check.stdout.split("\n").slice(-4).join(" | ")}`);
      if (check.stderr) console.log(`  stderr: ${check.stderr.split("\n").slice(-4).join(" | ")}`);
      if (check.error) console.log(`  error: ${check.error}`);
    }
  }
}

if (failed.length > 0) {
  process.exitCode = 1;
}
