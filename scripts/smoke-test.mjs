#!/usr/bin/env node
import { executable, exists, readJson, run } from "./status-lib.mjs";

const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

for (const relPath of [
  "AGENTS.md",
  "README.md",
  ".env.example",
  "interfaces/manifest.json",
  "memory/manifest.json",
  "tools/manifest.json",
  "operations/manifest.json",
  "scripts/golden-checks.mjs",
  "scripts/validate-memory.mjs",
  "scripts/rebuild-memory.mjs",
  "scripts/query-memory.mjs",
  "scripts/telegram-bot.mjs",
  "scripts/agents-mother.mjs",
]) {
  check(relPath, exists(relPath), "required file");
}

for (const relPath of [
  "scripts/smoke-test.mjs",
  "scripts/interface-status.mjs",
  "scripts/memory-status.mjs",
  "scripts/tools-status.mjs",
  "scripts/operations-status.mjs",
  "scripts/healthcheck.mjs",
]) {
  check(relPath, exists(relPath), "status/smoke script");
}

for (const relPath of [
  "scripts/smoke-test.mjs",
  "scripts/golden-checks.mjs",
  "scripts/healthcheck.mjs",
]) {
  check(`${relPath} executable`, executable(relPath), "executable bit");
}

for (const relPath of [
  "interfaces/manifest.json",
  "memory/manifest.json",
  "tools/manifest.json",
  "operations/manifest.json",
]) {
  try {
    readJson(relPath);
    check(`${relPath} JSON`, true);
  } catch (error) {
    check(`${relPath} JSON`, false, error instanceof Error ? error.message : String(error));
  }
}

const validation = run("node", ["scripts/validate-memory.mjs"], { timeout: 60000 });
check("validate-memory", validation.ok, validation.output);

if (process.env.PORT) {
  const web = run("curl", ["-fsS", `http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT}/`], { timeout: 5000 });
  check("web health", web.ok, `PORT=${process.env.PORT}`);
}

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
}

if (checks.some((item) => !item.ok)) process.exit(1);
console.log("Smoke test passed.");
