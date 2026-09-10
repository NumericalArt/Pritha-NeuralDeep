#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";


import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const DEFAULT_LABELS = ["com.techscope.web-dasha", "com.techscope.telegram-bot-dasha"];
const args = process.argv.slice(2);
const command = args[0] || "status";
const jsonMode = args.includes("--json");
const yes = args.includes("--yes");
const root = resolveTechscopeRoot();
const oldRoot = process.env.PRITHA_LAUNCHD_OLD_ROOT || path.join(path.dirname(root), "Techscope");
const OLD_ROOT_PATTERN = new RegExp(oldRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
const platform = process.env.PRITHA_LAUNCHD_AUDIT_PLATFORM || process.platform;
const isDarwin = platform === "darwin";
const uid = typeof process.getuid === "function" ? process.getuid() : Number(process.env.UID || 0);
const agentDir = process.env.PRITHA_LAUNCHD_AGENT_DIR || path.join(os.homedir(), "Library", "LaunchAgents");
const explicitlyRequired = Boolean(process.env.PRITHA_LAUNCHD_LABELS?.trim());
const labels = (process.env.PRITHA_LAUNCHD_LABELS?.trim() || DEFAULT_LABELS.join(","))
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function runLaunchctl(commandArgs) {
  const result = runSyncProbe("launchctl", commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitUntilNotLoaded(label, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  let state = loadedState(label);
  while (state.status !== "not-loaded" && Date.now() < deadline) {
    sleep(250);
    state = loadedState(label);
  }
  return { ok: state.status === "not-loaded", state };
}

function bootstrapWithRetry(plistPath, attempts = 4) {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = runLaunchctl(["bootstrap", `gui/${uid}`, plistPath]);
    if (result.ok) return { ...result, attempt };
    if (attempt < attempts) sleep(350 * attempt);
  }
  return { ...result, attempt: attempts };
}

function plistPathFor(label) {
  return path.join(agentDir, `${label}.plist`);
}

function diskState(label) {
  const plistPath = plistPathFor(label);
  if (!existsSync(plistPath)) {
    return { status: "missing", path: plistPath, contains_expected_root: false, contains_old_root: false };
  }
  const text = readFileSync(plistPath, "utf8");
  const containsOldRoot = OLD_ROOT_PATTERN.test(text);
  OLD_ROOT_PATTERN.lastIndex = 0;
  return {
    status: containsOldRoot ? "disk-stale" : text.includes(root) ? "ok" : "disk-root-mismatch",
    path: plistPath,
    contains_expected_root: text.includes(root),
    contains_old_root: containsOldRoot,
  };
}

function loadedState(label) {
  const result = runLaunchctl(["print", `gui/${uid}/${label}`]);
  if (!result.ok) {
    const detail = (result.stderr || result.stdout || "launchctl query failed").trim();
    const absent = result.status === 113 && /could not find (?:specified )?service|not loaded|no such process/i.test(detail);
    return {
      status: absent ? "not-loaded" : "query-failed",
      contains_expected_root: false,
      contains_old_root: false,
      detail,
    };
  }
  const text = result.stdout;
  const containsOldRoot = text.includes(oldRoot);
  return {
    status: containsOldRoot ? "loaded-stale" : text.includes(root) ? "ok" : "loaded-root-mismatch",
    contains_expected_root: text.includes(root),
    contains_old_root: containsOldRoot,
    excerpt: text
      .split(/\r?\n/)
      .filter((line) => /path =|working directory|stdout path|stderr path/.test(line) || line.includes(oldRoot) || line.includes(root))
      .slice(0, 16),
  };
}

export function auditLaunchdRoot() {
  if (!isDarwin) {
    return {
      ok: true,
      skipped: true,
      platform,
      root,
      domain: `gui/${uid}`,
      agent_dir: agentDir,
      jobs: [],
      stale_jobs: [],
    };
  }
  const jobs = labels.map((label) => {
    const disk = diskState(label);
    const loaded = loadedState(label);
    const applicable = explicitlyRequired || disk.status !== "missing" || loaded.status !== "not-loaded";
    let status = "ok";
    if (!applicable) status = "not-installed";
    else if (loaded.status === "query-failed") status = "query-failed";
    else if (disk.status === "missing") status = "disk-missing";
    else if (disk.status === "disk-stale") status = "disk-stale";
    else if (disk.status === "disk-root-mismatch") status = "disk-root-mismatch";
    else if (loaded.status === "loaded-stale") status = "disk-fixed-loaded-stale";
    else if (loaded.status === "loaded-root-mismatch") status = "loaded-root-mismatch";
    else if (loaded.status === "not-loaded") status = "not-loaded";
    return { label, status, applicable, required: explicitlyRequired, disk, loaded };
  });
  return {
    ok: jobs.every((job) => !job.applicable || job.status === "ok"),
    applicable: jobs.some((job) => job.applicable),
    root,
    domain: `gui/${uid}`,
    agent_dir: agentDir,
    jobs,
    stale_jobs: jobs.filter((job) => job.applicable && job.status !== "ok").map((job) => job.label),
  };
}

function reloadLaunchdJobs() {
  const before = auditLaunchdRoot();
  if (before.skipped) {
    return {
      ok: false,
      skipped: true,
      platform,
      root,
      before,
      after: null,
      actions: [],
      errors: [`launchd reload is only available on macOS; current platform is ${platform}`],
    };
  }
  const blockers = before.jobs.filter((job) => job.applicable && (job.disk.status !== "ok" || job.loaded.status === "query-failed" || job.loaded.status === "loaded-root-mismatch"));
  if (blockers.length) {
    return {
      ok: false,
      root,
      before,
      after: null,
      actions: [],
      errors: blockers.map((job) => `${job.label}: ${job.status}; resolve the audit finding before reload`),
    };
  }

  const targets = before.jobs.filter((job) => job.status === "disk-fixed-loaded-stale" || job.status === "not-loaded");
  const actions = [];
  const errors = [];
  if (!yes) {
    return {
      ok: false,
      root,
      before,
      after: null,
      actions: targets.map((job) => ({ label: job.label, planned: ["bootout-if-loaded", "bootstrap"] })),
      errors: ["reload requires --yes"],
    };
  }

  for (const job of targets) {
    if (job.loaded.status !== "not-loaded") {
      const bootout = runLaunchctl(["bootout", `gui/${uid}/${job.label}`]);
      actions.push({ label: job.label, action: "bootout", ok: bootout.ok, status: bootout.status, stderr: bootout.stderr.trim() });
      const wait = waitUntilNotLoaded(job.label);
      actions.push({ label: job.label, action: "wait-not-loaded", ok: wait.ok, status: wait.state.status });
    } else {
      actions.push({ label: job.label, action: "bootout", ok: true, status: "already-not-loaded", stderr: "" });
    }
    const bootstrap = bootstrapWithRetry(job.disk.path);
    actions.push({
      label: job.label,
      action: "bootstrap",
      ok: bootstrap.ok,
      status: bootstrap.status,
      attempt: bootstrap.attempt,
      stderr: bootstrap.stderr.trim(),
    });
    if (!bootstrap.ok) errors.push(`${job.label}: bootstrap failed: ${bootstrap.stderr.trim() || bootstrap.stdout.trim()}`);
  }

  const after = auditLaunchdRoot();
  if (!after.ok) errors.push(...after.jobs.filter((job) => job.applicable && job.status !== "ok").map((job) => `${job.label}: still ${job.status}`));
  return { ok: errors.length === 0, root, before, after, actions, errors };
}

function print(value) {
  if (jsonMode) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(`Pritha launchd root audit: ${value.ok ? "ok" : "attention"}`);
  console.log(`Root: ${value.root}`);
  for (const job of value.jobs || value.after?.jobs || []) {
    console.log(`- ${job.label}: ${job.status}`);
    console.log(`  disk: ${job.disk.path}`);
    if (job.loaded?.excerpt?.length) for (const line of job.loaded.excerpt) console.log(`  ${line.trim()}`);
  }
  if (value.errors?.length) {
    console.log("Errors:");
    for (const error of value.errors) console.log(`- ${error}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (command === "status") {
    const result = auditLaunchdRoot();
    print(result);
    process.exitCode = result.ok ? 0 : 1;
  } else if (command === "reload") {
    const result = reloadLaunchdJobs();
    print(result);
    process.exitCode = result.ok ? 0 : 1;
  } else {
    console.error("Usage: node scripts/launchd-root-audit.mjs status|reload [--json] [--yes]");
    process.exitCode = 2;
  }
}
