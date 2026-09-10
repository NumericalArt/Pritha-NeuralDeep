#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(ROOT, "scripts", "neuraldeep-codex.mjs");
const MODEL = String(process.env.PRITHA_NEURALDEEP_ACCEPTANCE_MODEL || "qwen3.6-35b-a3b");
const MAX_OUTPUT = 12 * 1024 * 1024;

function environment() {
  const value = { ...process.env, TECHSCOPE_ROOT: ROOT };
  for (const key of Object.keys(value)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete value[key];
  }
  return value;
}

if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(MODEL)) throw new Error("invalid_research_acceptance_model");
const prompt = [
  "This is a live acceptance task for Pritha NeuralDeep. Use local shell/network tools; do not rely on model memory for current facts.",
  "1. Fetch the official OpenAI Codex changelog at https://developers.openai.com/codex/changelog and identify its newest dated documentation/update entry visible today.",
  "2. Fetch one month of BTC-USD daily market data from https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=1mo&interval=1d (or another named public market-data source if that endpoint fails).",
  "3. Compute the first and last available closes, percentage change, highest daily high and lowest daily low for the returned period. State the exact data dates and retrieval date.",
  "4. Answer in Russian with two compact sections, direct source links, and a short limitations note. Distinguish publication date from retrieval date.",
  "Do not modify project files.",
].join("\n");

const result = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    RUNNER,
    "exec-json",
    "--model", MODEL,
    "--sandbox", "workspace-write",
    "--cwd", ROOT,
    "--network", "enabled",
    "--ephemeral",
  ], { cwd: ROOT, env: environment(), stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${chunk}`;
    if (Buffer.byteLength(stdout) > MAX_OUTPUT) child.kill("SIGTERM");
  });
  child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
  child.once("error", reject);
  child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  child.stdin.end(prompt);
});

let sessionId = null;
let finalText = "";
let commandCount = 0;
let usage = null;
for (const line of result.stdout.split("\n")) {
  try {
    const event = JSON.parse(line);
    if (event?.type === "thread.started") sessionId = String(event.thread_id || "") || null;
    if (event?.type === "item.completed" && event?.item?.type === "agent_message") finalText = String(event.item.text || "");
    if (event?.type === "item.completed" && event?.item?.type === "command_execution" && Number(event.item.exit_code) === 0) commandCount += 1;
    if (event?.type === "turn.completed") usage = event.usage || null;
  } catch {
    // The acceptance checks below fail closed for malformed JSONL.
  }
}
const containsSources = /https?:\/\//i.test(finalText) && /openai/i.test(finalText) && /bitcoin|btc/i.test(finalText);
const containsComputedMarketData = /\b20\d{2}-\d{2}-\d{2}\b/.test(finalText) && /%/.test(finalText) && /(?:USD|\$)/i.test(finalText);
const reportsFetchFailure = /retrieval failed|network access is fully blocked|cannot fetch|не удалось (?:получить|загрузить)|сеть заблокирована/i.test(finalText);
const ok = result.code === 0 && Boolean(sessionId) && commandCount > 0 && containsSources && containsComputedMarketData && !reportsFetchFailure;
console.log(JSON.stringify({
  ok,
  provider: "neuraldeep",
  model: MODEL,
  sessionId,
  commandCount,
  sourceLinksObserved: containsSources,
  computedMarketDataObserved: containsComputedMarketData,
  fetchFailureReported: reportsFetchFailure,
  usage,
  answer: finalText.slice(0, 20_000),
  errorClass: result.code === 0 ? null : /429|rate.?limit/i.test(result.stderr) ? "rate_limited" : "runtime_failed",
}, null, 2));
if (!ok) process.exitCode = 1;
