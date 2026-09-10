#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";
import { commitMessageWarnings } from "./lib/commit-hygiene.mjs";

import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadPrithaRuntimeEnv({ root: DEFAULT_ROOT });
const ROOT = resolveTechscopeRoot({ cwd: DEFAULT_ROOT });

const argv = process.argv.slice(2);
const args = new Set(argv);
const jsonMode = args.has("--json");
const markdownMode = args.has("--markdown");
const dryRun = args.has("--dry-run");
const strictEnv = args.has("--strict-env");
const githubAnnotations = args.has("--github-annotations") || process.env.GITHUB_ACTIONS === "true";
const profileIndex = argv.indexOf("--profile");
const profile = profileIndex >= 0 ? argv[profileIndex + 1] || "full" : "full";
const simulatedFailures = new Set(
  argv
    .filter((arg) => arg.startsWith("--simulate-fail="))
    .flatMap((arg) => arg.slice("--simulate-fail=".length).split(","))
    .map((item) => item.trim())
    .filter(Boolean),
);

function listTestFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const name of readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTestFiles(fullPath));
    } else if (name.endsWith(".test.mjs")) {
      files.push(path.relative(ROOT, fullPath));
    }
  }
  return files.sort();
}

function commandString(command, commandArgs) {
  return [command, ...commandArgs].join(" ");
}

function run(id, name, command, commandArgs, options = {}) {
  const started = Date.now();
  if (simulatedFailures.has(id)) {
    return {
      id,
      name,
      command: commandString(command, commandArgs),
      status: "fail",
      exitCode: 1,
      durationMs: 0,
      stdout: "",
      stderr: `simulated failure for ${id}`,
      notes: "simulated failure",
    };
  }

  if (dryRun) {
    return {
      id,
      name,
      command: commandString(command, commandArgs),
      status: "planned",
      exitCode: 0,
      durationMs: 0,
      stdout: "",
      stderr: "",
      notes: "dry-run",
    };
  }

  const childEnv = { ...process.env, TECHSCOPE_ROOT: ROOT, ...(options.env || {}) };
  for (const key of options.unsetEnv || []) delete childEnv[key];
  const result = runSyncProbe(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 120000,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: childEnv,
  });

  return {
    id,
    name,
    command: commandString(command, commandArgs),
    status: result.status === 0 ? "pass" : "fail",
    exitCode: result.status ?? 1,
    durationMs: Date.now() - started,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? result.error.message : undefined,
  };
}

const unitTestFiles = listTestFiles(path.join(ROOT, "tests"));
const allCheckSpecs = [
  ["env-doctor", "Environment doctor", "node", ["scripts/env-doctor.mjs", ...(strictEnv ? ["--strict"] : [])]],
  ["privacy-audit", "Privacy retention audit", "node", ["scripts/privacy-audit.mjs", "--strict"]],
  ["validate-memory", "Markdown memory validation", "node", ["scripts/validate-memory.mjs"]],
  ["rebuild-memory", "Memory rebuild", "node", ["scripts/rebuild-memory.mjs"], { timeoutMs: 180000 }],
  ["smoke-test", "Smoke test", "node", ["scripts/smoke-test.mjs"]],
  ["unit-tests", "Unit tests", "node", ["--test", "--test-concurrency=1", ...unitTestFiles], {
    timeoutMs: 900000,
    env: { PRITHA_QUALITY_GATE_CHILD: "1" },
    unsetEnv: [
      "PRITHA_STATE_ROOT",
      "PRITHA_AGENT_PARENT",
      "PRITHA_INSTANCE_ID",
      "PRITHA_INSTANCE_ROLE",
      "PRITHA_CONTROL_CENTER_PORT",
      "PRITHA_CONTROL_CENTER_ENV_FILE",
      "PRITHA_SEARXNG_URL",
      "PRITHA_NEURALDEEP_CODEX_HOME",
    ],
  }],
  ["agents-mother-test", "Agents Mother self-inspection", "node", ["scripts/agents-mother.mjs", "test", ".", "--no-report"]],
  ["telegram-dry-run", "Telegram dry-run", "node", ["scripts/telegram-bot.mjs", "poll-once", "--dry-run"]],
];

const profileChecks = {
  full: allCheckSpecs.map((spec) => spec[0]),
  "self-test": ["env-doctor", "privacy-audit", "validate-memory", "rebuild-memory", "smoke-test", "unit-tests", "telegram-dry-run"],
};

if (!profileChecks[profile]) {
  console.error(`Unknown quality gate profile: ${profile}`);
  process.exit(1);
}

const checks = allCheckSpecs
  .filter((spec) => profileChecks[profile].includes(spec[0]))
  .map((spec) => run(...spec));

const failed = checks.filter((check) => check.status === "fail");
const payload = {
  schema: "techscope-quality-gate-v1",
  root: ROOT,
  profile,
  status: failed.length > 0 ? "fail" : dryRun ? "planned" : "pass",
  createdAt: new Date().toISOString(),
  dryRun,
  failed: failed.length,
  checks,
  warnings: dryRun ? [] : commitMessageWarnings(ROOT, process.env.PRITHA_COMMIT_BASE || "main"),
};

function compact(text, max = 360) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function compactTail(text, max = 1400) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `...${clean.slice(-(max - 3)).trim()}`;
}

function failureContext(text, maxLines = 18) {
  const lines = String(text || "").split(/\r?\n/);
  const indexes = [];
  lines.forEach((line, index) => {
    if (/^\s*not ok\b/.test(line)
      || /AssertionError|Error \[|ERR_|failureType|✖/.test(line)) {
      indexes.push(index);
    }
  });
  if (indexes.length === 0) return "";

  const selected = [];
  const seen = new Set();
  for (const index of indexes.slice(0, 3)) {
    const start = Math.max(0, index - 3);
    const end = Math.min(lines.length, index + maxLines);
    for (let i = start; i < end; i += 1) {
      if (seen.has(i)) continue;
      seen.add(i);
      selected.push(lines[i]);
    }
  }
  return selected.join("\n").trim();
}

function githubEscape(value, property = false) {
  let text = String(value || "")
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  if (property) {
    text = text.replaceAll(":", "%3A").replaceAll(",", "%2C");
  }
  return text;
}

function failureText(check) {
  const lines = [
    `${check.name} failed with exit code ${check.exitCode}.`,
    `Command: ${check.command}`,
  ];
  const stderrContext = failureContext(check.stderr);
  const stdoutContext = failureContext(check.stdout);
  if (stderrContext) lines.push(`stderr failure context: ${compactTail(stderrContext, 2000)}`);
  else if (check.stderr) lines.push(`stderr tail: ${compactTail(check.stderr)}`);
  if (stdoutContext) lines.push(`stdout failure context: ${compactTail(stdoutContext, 2600)}`);
  else if (check.stdout) lines.push(`stdout tail: ${compactTail(check.stdout)}`);
  if (check.error) lines.push(`error: ${check.error}`);
  return lines.join("\n");
}

function printGitHubAnnotations() {
  if (!githubAnnotations) return;
  for (const warning of payload.warnings) console.error(`::warning title=Commit hygiene::${githubEscape(warning)}`);
  for (const check of failed) {
    const title = githubEscape(`Quality gate failed: ${check.name}`, true);
    const message = githubEscape(failureText(check));
    console.error(`::error title=${title}::${message}`);
  }
}

function printMarkdown() {
  console.log(`# Techscope Quality Gate: ${payload.status}`);
  console.log();
  console.log(`- Root: \`${payload.root}\``);
  console.log(`- Created: \`${payload.createdAt}\``);
  console.log(`- Failed checks: \`${payload.failed}\``);
  for (const warning of payload.warnings) console.log(`- Warning: ${warning}`);
  console.log();
  console.log("| Status | Check | Command | Duration |");
  console.log("| --- | --- | --- | --- |");
  for (const check of checks) {
    console.log(`| ${check.status} | ${check.name} | \`${check.command}\` | ${check.durationMs}ms |`);
  }
  const failedChecks = checks.filter((check) => check.status === "fail");
  if (failedChecks.length > 0) {
    console.log();
    console.log("## Failures");
    for (const check of failedChecks) {
      console.log();
      console.log(`### ${check.name}`);
      if (check.stderr) console.log(`- stderr: ${compact(check.stderr)}`);
      if (check.stdout) console.log(`- stdout: ${compact(check.stdout)}`);
      if (check.error) console.log(`- error: ${check.error}`);
    }
  }
}

function printHuman() {
  console.log(`Techscope quality gate: ${payload.status}`);
  console.log(`Root: ${payload.root}`);
  for (const warning of payload.warnings) console.log(`- WARNING ${warning}`);
  for (const check of checks) {
    const suffix = check.status === "planned" ? ` (${check.notes})` : ` (${check.durationMs}ms)`;
    console.log(`- ${check.status.toUpperCase()} ${check.name}${suffix}`);
    if (check.status === "fail") {
      console.log(`  command: ${check.command}`);
      console.log(`  exit: ${check.exitCode}`);
      if (check.stderr) console.log(`  stderr: ${check.stderr.split("\n").slice(-4).join(" | ")}`);
      if (check.stdout) console.log(`  stdout: ${check.stdout.split("\n").slice(-4).join(" | ")}`);
      if (check.error) console.log(`  error: ${check.error}`);
    }
  }
}

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else if (markdownMode) {
  printMarkdown();
} else {
  printHuman();
}

if (failed.length > 0) {
  printGitHubAnnotations();
  process.exitCode = 1;
}
