#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolveTechscopeRoot({ cwd: DEFAULT_ROOT });
loadPrithaRuntimeEnv({ root: ROOT });
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });

const argv = process.argv.slice(2);
const args = new Set(argv);
const jsonMode = args.has("--json");
const dryRun = args.has("--dry-run");
const noWrite = args.has("--no-write") || dryRun;
const baselinePath = resolvePrithaStatePath("memory", "last-self-test.json");

function runJson(command, commandArgs, options = {}) {
  const result = runSyncProbe(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 180000,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  let parsed = null;
  let parseError = "";
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      status: result.status || 1,
      stdout,
      stderr: stderr || parseError,
      json: parsed,
    };
  }
  if (!parsed) {
    return {
      ok: false,
      status: 1,
      stdout,
      stderr: parseError || "command returned no JSON output",
      json: null,
    };
  }
  return {
    ok: true,
    status: 0,
    stdout,
    stderr,
    json: parsed,
  };
}

function runCommand(command, commandArgs, options = {}) {
  const result = runSyncProbe(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 180000,
    maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function stats() {
  if (dryRun) {
    return { documents: 0, chunks: 0, entities: 0, relations: 0, embeddings: 0 };
  }
  const result = runSyncProbe("node", ["scripts/query-memory.mjs", "stats"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "query-memory stats failed");
  }
  const out = String(result.stdout || "");
  const values = {};
  for (const line of out.split(/\r?\n/)) {
    const match = line.trim().match(/^(documents|chunks|entities|relations|embeddings)\s+(\d+)$/);
    if (match) values[match[1]] = Number(match[2]);
  }
  return values;
}

function previousBaseline() {
  if (!existsSync(baselinePath)) return null;
  try {
    return JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    return null;
  }
}

function sanitizeText(value) {
  let text = value;
  if (ROOT) text = text.split(ROOT).join("<TECHSCOPE_ROOT>");
  if (process.env.HOME) text = text.split(process.env.HOME).join("<USER_HOME>");
  return text;
}

function sanitizePayload(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizePayload(item)]));
  }
  return value;
}

function runSelfTest() {
  const quality = dryRun
    ? runJson("node", ["scripts/quality-gate.mjs", "--profile", "self-test", "--dry-run", "--json"])
    : runJson("node", ["scripts/quality-gate.mjs", "--profile", "self-test", "--json"], { timeoutMs: 1200000 });
  const embeddingsRestore = !dryRun
    ? runCommand("python3", ["scripts/embed-memory.py"], { timeoutMs: 600000 })
    : { ok: true, status: 0, stdout: "", stderr: "", skipped: true };
  const queue = runJson("node", ["scripts/queue-health.mjs", "--json"]);
  const launchdRoot = runCommand("node", ["scripts/launchd-root-audit.mjs", "status", "--json"], { timeoutMs: 60000 });
  const controlCenterRuntime = runJson("node", ["scripts/control-center-runtime.mjs", "status", "--json"], { timeoutMs: 60000 });
  const serviceRequired = /^(?:1|true|yes)$/i.test(String(process.env.PRITHA_CONTROL_CENTER_SERVICE_REQUIRED || ""))
    || controlCenterRuntime.json?.service?.installed === true;
  const controlCenterHealth = runJson(
    "node",
    [
      "scripts/control-center-health.mjs",
      "--json",
      "--retries",
      "1",
      ...(serviceRequired ? ["--strict"] : []),
    ],
    { timeoutMs: 60000 },
  );
  const currentStats = stats();
  const previous = previousBaseline();

  const regressions = [];
  const warnings = [];
  let launchdRootAudit = null;
  if (launchdRoot.stdout) {
    try {
      launchdRootAudit = JSON.parse(launchdRoot.stdout);
    } catch {
      launchdRootAudit = { ok: false, error: "launchd root audit returned invalid JSON", stderr: launchdRoot.stderr };
    }
  } else {
    launchdRootAudit = { ok: false, error: launchdRoot.stderr || "launchd root audit returned no output" };
  }
  if (!launchdRootAudit?.ok) {
    warnings.push({
      id: "launchd-root-drift",
      severity: "warning",
      message: "launchd loaded state or plist root differs from the current Pritha root",
      detail: launchdRootAudit,
    });
  }
  if (!controlCenterHealth.json) {
    warnings.push({
      id: "control-center-health-unavailable",
      severity: "warning",
      message: "Control Center live UI chunk health returned no machine-readable result",
      detail: { stdout: controlCenterHealth.stdout, stderr: controlCenterHealth.stderr },
    });
  } else if (controlCenterHealth.json.status === "fail") {
    regressions.push({
      id: "control-center-live-ui",
      severity: "critical",
      message: "running Control Center failed live UI chunk health; restart the stale process before trusting the UI",
      detail: controlCenterHealth.json,
    });
  } else if (controlCenterHealth.json.status === "pass-with-warnings") {
    warnings.push({
      id: "control-center-live-ui-warning",
      severity: "warning",
      message: "Control Center live UI chunk health passed with warnings",
      detail: controlCenterHealth.json,
    });
  }
  if (!controlCenterRuntime.json) {
    warnings.push({
      id: "control-center-runtime-status-unavailable",
      severity: "warning",
      message: "Control Center runtime manager returned no machine-readable status",
      detail: { stdout: controlCenterRuntime.stdout, stderr: controlCenterRuntime.stderr },
    });
  } else if (serviceRequired && controlCenterRuntime.json.service?.running !== true) {
    regressions.push({
      id: "control-center-service-required",
      severity: "critical",
      message: "Control Center service is required for this instance but is not running",
      detail: controlCenterRuntime.json,
    });
  }
  const expectedQualityStatus = dryRun ? "planned" : "pass";
  if (!quality.ok || quality.json?.status !== expectedQualityStatus) {
    regressions.push({
      id: "quality-gate",
      severity: "critical",
      message: "self-test quality-gate profile failed",
    });
  }
  if (!embeddingsRestore.ok) {
    regressions.push({
      id: "embeddings-restore",
      severity: "critical",
      message: "self-test rebuilt memory but failed to restore embeddings",
    });
  }
  if (!dryRun && previous?.memory_stats?.documents != null && currentStats.documents < previous.memory_stats.documents) {
    regressions.push({
      id: "document-count-drop",
      severity: "critical",
      message: `document count dropped from ${previous.memory_stats.documents} to ${currentStats.documents}`,
    });
  }
  const failedJobs = queue.json?.failed || [];
  if (failedJobs.length > 0) {
    regressions.push({
      id: "queue-failed-jobs",
      severity: "critical",
      message: `queue has ${failedJobs.length} failed job(s)`,
    });
  }

  const payload = sanitizePayload({
    schema: "techscope-self-test-v1",
    root: ROOT,
    status: regressions.length === 0 ? "pass" : "fail",
    created_at: new Date().toISOString(),
    dry_run: dryRun,
    memory_stats: currentStats,
    previous_memory_stats: previous?.memory_stats || null,
    quality_gate: quality.json || { status: "fail", stdout: quality.stdout, stderr: quality.stderr },
    embeddings_restore: embeddingsRestore,
    queue_health: queue.json || { status: "fail", stdout: queue.stdout, stderr: queue.stderr },
    launchd_root_audit: launchdRootAudit,
    control_center_runtime: controlCenterRuntime.json || { status: "unknown", stdout: controlCenterRuntime.stdout, stderr: controlCenterRuntime.stderr },
    control_center_service_required: serviceRequired,
    control_center_health: controlCenterHealth.json || { status: "unknown", stdout: controlCenterHealth.stdout, stderr: controlCenterHealth.stderr },
    warnings,
    regressions,
  });

  if (!noWrite) {
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`);
  }
  return payload;
}

const payload = runSelfTest();

if (jsonMode) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Techscope self-test: ${payload.status}`);
  console.log(`Root: ${payload.root}`);
  console.log(`Quality profile: ${payload.quality_gate.profile || "self-test"} / ${payload.quality_gate.status}`);
  console.log(`Memory documents: ${payload.memory_stats.documents}`);
  console.log(`Queue failed jobs: ${(payload.queue_health.failed || []).length}`);
  console.log(`Queue stale items: ${(payload.queue_health.stale || []).length}`);
  console.log(`Control Center live UI: ${payload.control_center_health.status}`);
  if (payload.previous_memory_stats) {
    console.log(`Previous documents: ${payload.previous_memory_stats.documents}`);
  } else {
    console.log("Previous baseline: none");
  }
  for (const regression of payload.regressions) {
    console.log(`- FAIL ${regression.id}: ${regression.message}`);
  }
  if (!noWrite) {
    console.log(`Baseline written: ${path.relative(ROOT, baselinePath)}`);
  }
}

if (payload.status !== "pass") {
  process.exitCode = 1;
}
