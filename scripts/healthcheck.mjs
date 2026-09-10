#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import process from "node:process";
import { resolvePrithaStatePathFrom, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const root = resolveTechscopeRoot({ cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") });
loadPrithaRuntimeEnv({ root });
const stateRoot = resolvePrithaStateRoot({ root });
const platform = process.env.TECHSCOPE_HEALTHCHECK_PLATFORM || process.platform;
const isDarwin = platform === "darwin";
const checks = [];

function add(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

function jsonFile(relPath) {
  const fullPath = path.join(root, relPath);
  if (!existsSync(fullPath)) {
    add(relPath, false, "missing");
    return;
  }
  try {
    JSON.parse(readFileSync(fullPath, "utf8"));
    add(relPath, true, "valid JSON");
  } catch (error) {
    add(relPath, false, error instanceof Error ? error.message : String(error));
  }
}

function scriptExists(relPath) {
  add(relPath, existsSync(path.join(root, relPath)), existsSync(path.join(root, relPath)) ? "present" : "missing");
}

function run(name, command, args, options = {}) {
  const result = runSyncProbe(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TECHSCOPE_ROOT: root },
    timeout: options.timeoutMs || 60000,
  });
  const detail = (result.stdout || result.stderr || "").trim();
  if (options.nonBlocking) {
    add(name, true, result.status === 0 ? detail : `non-blocking warning: ${detail}`);
    return;
  }
  add(name, result.status === 0, detail);
}

add("TECHSCOPE_ROOT", existsSync(root), root);
add("git root", existsSync(path.join(root, ".git")), path.join(root, ".git"));
add("memory sqlite", existsSync(resolvePrithaStatePathFrom({ root }, "memory", "techscope.sqlite")), "state-root/memory/techscope.sqlite");

for (const relPath of [
  "interfaces/manifest.json",
  "memory/manifest.json",
  "tools/manifest.json",
  "operations/manifest.json",
]) {
  jsonFile(relPath);
}

for (const relPath of [
  "scripts/golden-checks.mjs",
  "scripts/validate-memory.mjs",
  "scripts/rebuild-memory.mjs",
  "scripts/query-memory.mjs",
  "scripts/telegram-bot.mjs",
  "scripts/agents-mother.mjs",
  "scripts/run-techscope-web.sh",
  "scripts/run-techscope-telegram-bot.sh",
]) {
  scriptExists(relPath);
}

run("memory stats", "node", ["scripts/query-memory.mjs", "stats"]);
run("env doctor", "node", ["scripts/env-doctor.mjs"], { nonBlocking: true });
run("telegram dry-run", "node", ["scripts/telegram-bot.mjs", "poll-once", "--dry-run"]);

for (const relPath of [
  "launchd/com.techscope.web.plist",
  "launchd/com.techscope.telegram-bot.plist",
]) {
  if (isDarwin) {
    run(`plutil ${relPath}`, "plutil", ["-lint", path.join(root, relPath)]);
  } else {
    add(`plutil ${relPath}`, true, `skipped on ${platform}; launchd plist lint is macOS-specific`);
  }
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const prefix = check.ok ? "PASS" : "FAIL";
  console.log(`${prefix} ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
}

if (failed.length > 0) {
  process.exit(1);
}
