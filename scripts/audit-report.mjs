#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_ROOT = process.env.TECHSCOPE_ROOT ? path.resolve(process.env.TECHSCOPE_ROOT) : "";
const ROOT = ENV_ROOT && existsSync(ENV_ROOT) ? ENV_ROOT : DEFAULT_ROOT;

function usage() {
  console.log(`Usage:
  node scripts/audit-report.mjs --phase 7 --title "Techscope Quality Phase 7 Report" --output 11_agents/reports/report.md [--input gate.json]

If --input is omitted, the script runs:
  node scripts/quality-gate.mjs --json`);
}

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

const phase = option("--phase");
const title = option("--title", `Techscope Quality Phase ${phase} Report`);
const output = option("--output");
const input = option("--input");

if (!phase || !output) {
  usage();
  process.exit(1);
}

function runGate() {
  const result = runSyncProbe("node", ["scripts/quality-gate.mjs", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });
  if (result.status !== 0) {
    throw new Error(`quality-gate failed:\n${result.stdout || result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

const gate = input
  ? JSON.parse(readFileSync(path.resolve(ROOT, input), "utf8"))
  : runGate();

const date = new Date().toISOString().slice(0, 10);
const phaseSlug = `phase-${phase}`;
const id = `${date}-techscope-quality-${phaseSlug}-report`;
const templatePath = path.join(ROOT, "08_templates", "techscope-audit-phase-report.md");
const template = readFileSync(templatePath, "utf8");

function renderChecks() {
  const lines = [
    `- Status: \`${gate.status}\``,
    `- Created: \`${gate.createdAt || "unknown"}\``,
    `- Failed checks: \`${gate.failed}\``,
    "",
    "| Status | Check | Command | Duration |",
    "| --- | --- | --- | --- |",
  ];
  for (const check of gate.checks || []) {
    lines.push(`| ${check.status} | ${check.name} | \`${check.command}\` | ${check.durationMs || 0}ms |`);
  }
  return lines.join("\n");
}

const replacements = {
  "{{id}}": id,
  "{{status}}": gate.status === "pass" ? "complete" : "failed",
  "{{date}}": date,
  "{{phase_slug}}": phaseSlug,
  "{{phase_label}}": `Phase ${phase}`,
  "{{title}}": title,
  "{{summary}}": `Generated from \`scripts/quality-gate.mjs --json\`. Gate status: \`${gate.status}\`.`,
  "{{gate_summary}}": renderChecks(),
  "{{verification}}": gate.status === "pass"
    ? "- `node scripts/quality-gate.mjs --json` -> pass."
    : "- `node scripts/quality-gate.mjs --json` -> failed; inspect failed checks above.",
  "{{patterns}}": "- `quality-gate-mjs`\n- `audit-report-generator`\n- `phase-report-template`",
  "{{open_questions}}": "- None recorded by generator.",
};

let content = template;
for (const [needle, value] of Object.entries(replacements)) {
  content = content.split(needle).join(value);
}

const outputPath = path.resolve(ROOT, output);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, content);
console.log(`Audit report: ${path.relative(ROOT, outputPath)}`);
