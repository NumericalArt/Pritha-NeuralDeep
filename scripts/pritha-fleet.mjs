#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) out._.push(value);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) out[value.slice(2)] = argv[++index];
    else out[value.slice(2)] = true;
  }
  return out;
}

const options = parseArgs(process.argv.slice(2));
const root = resolveTechscopeRoot();
loadPrithaRuntimeEnv({ root });
const stateRoot = resolvePrithaStateRoot({ root });
const manifestPath = path.resolve(String(options.manifest || process.env.PRITHA_FLEET_CONFIG || path.join(stateRoot, "config", "fleet.json")));
const instanceScript = path.join(root, "scripts", "pritha-instance.mjs");

function loadManifest() {
  if (!existsSync(manifestPath)) throw new Error(`Fleet manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.instances) || !manifest.instances.length) throw new Error("Fleet manifest must contain a non-empty instances array");
  const ids = manifest.instances.map((instance) => String(instance.id || ""));
  if (ids.some((id) => !/^[a-z0-9][a-z0-9._-]*$/i.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Fleet manifest instance ids must be unique safe identifiers");
  }
  return manifest;
}

function releaseOrderedInstances(manifest) {
  const priority = new Map(["main", "dasha", "sasha", "marina"].map((id, index) => [id, index]));
  return [...manifest.instances].sort((left, right) => {
    const leftPriority = priority.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priority.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority;
  });
}

function invoke(instance, commandArgs) {
  const checkout = path.resolve(instance.checkout);
  const env = {
    ...process.env,
    TECHSCOPE_ROOT: checkout,
    PRITHA_INSTANCE_ID: instance.id,
    PRITHA_INSTANCE_ROLE: instance.role || "replica",
    PRITHA_STATE_ROOT: path.resolve(instance.state_root),
    PRITHA_AGENT_PARENT: path.resolve(instance.agent_parent),
    PRITHA_CONTROL_CENTER_PORT: String(instance.port),
    PRITHA_CONTROL_CENTER_ENV_FILE: path.join(path.resolve(instance.state_root), "config", "runtime.env"),
  };
  const result = runSyncProbe("node", [instanceScript, ...commandArgs, "--root", checkout, "--json"], {
    cwd: checkout,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 1_200_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  let payload = null;
  try { payload = JSON.parse(String(result.stdout || "")); } catch { /* reported below */ }
  return {
    id: instance.id,
    ok: result.status === 0 && Boolean(payload?.ok),
    exit_code: result.status ?? 1,
    payload,
    error: payload ? "" : String(result.stderr || result.stdout || "invalid instance output").trim(),
  };
}

function releaseCommit() {
  const requested = options["target-sha"] ? String(options["target-sha"]).trim().toLowerCase() : "";
  if (requested && !/^[a-f0-9]{40}$/.test(requested)) throw new Error("--target-sha must be a full 40-character Git commit SHA");
  if (requested) return requested;
  const result = runSyncProbe("git", ["ls-remote", "origin", "refs/heads/main"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  const commit = String(result.stdout || "").trim().split(/\s+/)[0] || "";
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Cannot resolve the pinned origin/main release commit");
  return commit;
}

function preflightIssues(result, instance) {
  const payload = result.payload || {};
  const issues = [];
  if (!result.ok) issues.push("status_failed");
  if (payload.git?.branch !== "main") issues.push("branch_not_main");
  if (payload.git?.clean !== true) issues.push("checkout_dirty");
  if (path.resolve(payload.instance?.state_root || ".") !== path.resolve(instance.state_root)) issues.push("state_root_mismatch");
  if (path.resolve(payload.instance?.agent_parent || ".") !== path.resolve(instance.agent_parent)) issues.push("agent_parent_mismatch");
  if (!payload.isolation?.agent_state?.sha256 || !payload.isolation?.protected_state?.sha256) issues.push("isolation_snapshot_missing");
  if (!Number.isSafeInteger(payload.runtime?.memory_documents) || payload.runtime.memory_documents < 1) issues.push("memory_unavailable");
  return issues;
}

function print(payload) {
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Pritha fleet: ${payload.ok ? "ok" : "attention"}`);
    for (const item of payload.instances || []) console.log(`- ${item.id}: ${item.ok ? "ok" : "failed"}`);
    if (payload.stopped_after) console.log(`Rollout stopped after: ${payload.stopped_after}`);
  }
}

try {
  const manifest = loadManifest();
  const orderedInstances = releaseOrderedInstances(manifest);
  const command = options._[0] || "status";
  const instances = [];
  let preflight = [];
  let targetCommit = null;
  if (command === "status") {
    for (const instance of orderedInstances) instances.push(invoke(instance, ["status"]));
  } else if (command === "rollout") {
    const apply = Boolean(options.apply);
    if (apply && !options.yes) throw new Error("fleet rollout --apply requires --yes");
    targetCommit = releaseCommit();
    preflight = orderedInstances.map((instance) => {
      const result = invoke(instance, ["status"]);
      const issues = preflightIssues(result, instance);
      return { ...result, ok: issues.length === 0, issues };
    });
    if (preflight.every((item) => item.ok)) {
      for (const instance of orderedInstances) {
        const result = invoke(instance, ["update", apply ? "--apply" : "--plan", "--expected-commit", targetCommit, ...(apply ? ["--yes"] : [])]);
        if (apply && result.ok) {
          const payload = result.payload || {};
          result.ok = payload.finalHead === targetCommit
            && payload.finalGitClean === true
            && payload.health?.ok === true
            && payload.isolationMatch === true
            && Number.isSafeInteger(payload.memoryDocuments)
            && payload.memoryDocuments > 0;
          if (!result.ok && !result.error) result.error = "post-rollout release invariant failed";
        }
        instances.push(result);
        if (!result.ok) break;
      }
    }
  } else {
    throw new Error("Usage: node scripts/pritha-fleet.mjs status|rollout [--apply --yes] [--target-sha commit] [--manifest path]");
  }
  const preflightOk = command !== "rollout" || preflight.every((item) => item.ok);
  const payload = {
    schema: "pritha-fleet-result-v2",
    ok: preflightOk && instances.length === orderedInstances.length && instances.every((item) => item.ok),
    command,
    manifest: manifestPath,
    target_commit: targetCommit,
    rollout_order: orderedInstances.map((instance) => instance.id),
    preflight,
    instances,
    stopped_after: preflight.find((item) => !item.ok)?.id || instances.find((item) => !item.ok)?.id || null,
  };
  print(payload);
  if (!payload.ok) process.exitCode = 1;
} catch (error) {
  const payload = { schema: "pritha-fleet-error-v1", ok: false, error: error instanceof Error ? error.message : String(error) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.error(payload.error);
  process.exitCode = 1;
}
