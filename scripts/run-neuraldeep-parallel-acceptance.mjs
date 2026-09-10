#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(ROOT, "scripts", "neuraldeep-codex.mjs");
const DEFAULT_MODELS = ["qwen3.6-35b-a3b", "qwen3.8-27b"];
const MAX_OUTPUT = 4 * 1024 * 1024;

function safeModel(value) {
  const model = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/.test(model)) throw new Error("invalid_parallel_acceptance_model");
  return model;
}

function sanitizedEnvironment() {
  const environment = { ...process.env, TECHSCOPE_ROOT: ROOT };
  for (const key of Object.keys(environment)) {
    if (/^(?:OPENAI|AZURE_OPENAI|CHATGPT)_/i.test(key)) delete environment[key];
  }
  return environment;
}

function runModel(model, index) {
  const marker = `PRITHA_NEURALDEEP_PARALLEL_${index + 1}_OK`;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      RUNNER,
      "exec-json",
      "--model", model,
      "--sandbox", "read-only",
      "--cwd", ROOT,
      "--network", "disabled",
      "--ephemeral",
    ], {
      cwd: ROOT,
      env: sanitizedEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
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
    child.once("close", (code, signal) => {
      let sessionId = null;
      let finalText = "";
      let usage = null;
      for (const line of stdout.split("\n")) {
        try {
          const event = JSON.parse(line);
          if (event?.type === "thread.started") sessionId = String(event.thread_id || "") || null;
          if (event?.type === "item.completed" && event?.item?.type === "agent_message") finalText = String(event.item.text || "");
          if (event?.type === "turn.completed") usage = event.usage || null;
        } catch {
          // Exit status and marker checks below fail closed for malformed JSONL.
        }
      }
      resolve({
        model,
        provider: "neuraldeep",
        code,
        signal,
        sessionId,
        markerObserved: finalText.includes(marker),
        durationMs: Date.now() - startedAt,
        usage,
        stderrClass: code === 0 ? null : /429|rate.?limit/i.test(stderr) ? "rate_limited" : "runtime_failed",
      });
    });
    child.stdin.end(`Respond exactly ${marker}. Do not call tools.`);
  });
}

const requested = process.argv.slice(2).map(safeModel);
const models = requested.length ? requested : DEFAULT_MODELS;
if (models.length !== 2 || models[0] === models[1]) throw new Error("parallel_acceptance_requires_two_distinct_models");
const results = await Promise.all(models.map(runModel));
const ok = results.every((result) => result.code === 0 && result.markerObserved && result.sessionId);
console.log(JSON.stringify({ ok, concurrent: true, provider: "neuraldeep", results }, null, 2));
if (!ok) process.exitCode = 1;
