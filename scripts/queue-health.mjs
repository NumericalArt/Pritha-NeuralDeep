#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolveTechscopeRoot({ cwd: DEFAULT_ROOT });
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });

const argv = process.argv.slice(2);
const args = new Set(argv);
const jsonMode = args.has("--json");
const staleDaysIndex = argv.indexOf("--stale-days");
const staleDays = staleDaysIndex >= 0 ? Number(argv[staleDaysIndex + 1] || 7) : 7;
const nowMs = Date.now();
const staleMs = staleDays * 24 * 60 * 60 * 1000;

const queues = [
  {
    id: "telegram-intake",
    root: resolvePrithaStatePath("queue", "telegram-intake"),
    statuses: ["pending", "processing", "awaiting_codex", "complete", "done", "failed"],
    staleStatuses: ["pending", "awaiting_codex"],
  },
  {
    id: "codex-media-review",
    root: resolvePrithaStatePath("queue", "codex-media-review"),
    statuses: ["pending", "done"],
    staleStatuses: ["pending"],
  },
];

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function timestampMs(filePath, job) {
  const raw = job.updated_at || job.created_at || job.completed_at || "";
  const parsed = raw ? Date.parse(raw) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return statSync(filePath).mtimeMs;
}

function listStatus(queue, status) {
  const dir = path.join(queue.root, status);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const filePath = path.join(dir, name);
      const job = readJson(filePath);
      const ageMs = Math.max(0, nowMs - timestampMs(filePath, job));
      return {
        queue: queue.id,
        status,
        id: job.id || path.basename(name, ".json"),
        path: path.relative(STATE_ROOT, filePath).split(path.sep).join("/"),
        updated_at: job.updated_at || "",
        created_at: job.created_at || "",
        age_days: Number((ageMs / (24 * 60 * 60 * 1000)).toFixed(2)),
      };
    });
}

const queueResults = [];
const stale = [];
const failedJobs = [];

for (const queue of queues) {
  const counts = {};
  for (const status of queue.statuses) {
    const jobs = listStatus(queue, status);
    counts[status] = jobs.length;
    if (status === "failed") failedJobs.push(...jobs);
    if (queue.staleStatuses.includes(status)) {
      stale.push(...jobs.filter((job) => job.age_days * 24 * 60 * 60 * 1000 >= staleMs));
    }
  }
  queueResults.push({ id: queue.id, counts });
}

const payload = {
  schema: "techscope-queue-health-v1",
  root: ROOT,
  state_root: STATE_ROOT,
  status: "pass",
  stale_days_threshold: staleDays,
  created_at: new Date().toISOString(),
  queues: queueResults,
  stale,
  failed: failedJobs,
};

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log("Techscope queue health: pass");
  console.log(`Root: ${ROOT}`);
  console.log(`Stale threshold: ${staleDays} day(s)`);
  for (const queue of payload.queues) {
    const counts = Object.entries(queue.counts)
      .map(([status, count]) => `${status}:${count}`)
      .join(" ");
    console.log(`- ${queue.id}: ${counts}`);
  }
  console.log(`- stale actionable items: ${payload.stale.length}`);
  for (const item of payload.stale.slice(0, 10)) {
    console.log(`  ${item.queue}/${item.status}: ${item.id} (${item.age_days}d)`);
  }
  console.log(`- failed jobs: ${payload.failed.length}`);
  for (const item of payload.failed.slice(0, 10)) {
    console.log(`  ${item.queue}/${item.status}: ${item.id}`);
  }
}
