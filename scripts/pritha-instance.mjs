#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { createHash } from "node:crypto";

import {
  chmodSync,
  copyFileSync,
  cpSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { loadEnvFile, loadPrithaRuntimeEnv } from "./lib/env.mjs";
import { ND_STORAGE_COMPATIBILITY, compatibleBuild, readBuildIdentity, sealBuildIdentity, verifyRollbackArtifact, buildTreeDigest } from "./lib/release-artifact.mjs";
import {
  PRITHA_STATE_LAYOUT,
  isPrithaCodeCheckout,
  prithaInstanceConfig,
  resolvePrithaStatePath,
  resolveTechscopeRoot,
} from "./lib/paths.mjs";

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const [rawKey, inline] = value.slice(2).split("=", 2);
    if (inline !== undefined) options[rawKey] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) options[rawKey] = argv[++index];
    else options[rawKey] = true;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.root) process.env.TECHSCOPE_ROOT = path.resolve(String(options.root));

loadEnvFile(String(options.env || process.env.PRITHA_CONTROL_CENTER_ENV_FILE || ""));
loadPrithaRuntimeEnv({ root: resolveTechscopeRoot() });

const config = prithaInstanceConfig({
  root: process.env.TECHSCOPE_ROOT,
  stateRoot: options["state-root"],
  agentParent: options["agent-parent"],
  instanceId: options["instance-id"],
  instanceRole: options.role,
  controlCenterPort: options.port,
});
process.env.TECHSCOPE_ROOT = config.codeRoot;
process.env.PRITHA_STATE_ROOT = config.stateRoot;
process.env.PRITHA_AGENT_PARENT = config.agentParent;
process.env.PRITHA_INSTANCE_ID = config.instanceId;
process.env.PRITHA_INSTANCE_ROLE = config.instanceRole;
process.env.PRITHA_CONTROL_CENTER_PORT = String(config.controlCenterPort);

function run(command, args, runOptions = {}) {
  const result = runSyncProbe(command, args, {
    cwd: runOptions.cwd || config.codeRoot,
    env: { ...process.env, ...(runOptions.env || {}) },
    encoding: "utf8",
    stdio: runOptions.stdio || ["ignore", "pipe", "pipe"],
    timeout: runOptions.timeoutMs || 120_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function git(args, runOptions = {}) {
  return run("git", args, runOptions);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const stat = statSync(directory);
  if (stat.isFile()) return [directory];
  return readdirSync(directory).flatMap((entry) => walkFiles(path.join(directory, entry)));
}

const CHILD_PROJECT_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".logs",
  ".next",
  ".queue",
  ".state",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const PROTECTED_STATE_EXCLUDED_DIRECTORIES = new Set([
  "audit",
  "cache",
  "codex-chat",
  "logs",
  "memory",
  "private",
  "queue",
  "releases",
  "setup",
  "snapshots",
  "tmp",
  "voice-drafts",
]);

function canonicalExistingPath(value) {
  const resolved = path.resolve(value);
  try { return realpathSync(resolved); } catch { return resolved; }
}

async function fileDigest(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function directoryFingerprint(directory, excludedDirectories = new Set()) {
  const root = path.resolve(directory);
  const entries = [];
  const excluded = new Set();
  async function visit(current, relative = "") {
    if (!existsSync(current)) return;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      entries.push({ path: relative || ".", type: "symlink", target: readlinkSync(current) });
      return;
    }
    if (stat.isFile()) {
      entries.push({ path: relative || ".", type: "file", bytes: stat.size, sha256: await fileDigest(current) });
      return;
    }
    if (!stat.isDirectory()) return;
    for (const name of readdirSync(current).sort((a, b) => a.localeCompare(b))) {
      const childRelative = relative ? `${relative}/${name}` : name;
      const child = path.join(current, name);
      const childStat = lstatSync(child);
      if (childStat.isDirectory() && !childStat.isSymbolicLink() && excludedDirectories.has(name)) {
        excluded.add(childRelative);
        continue;
      }
      await visit(child, childRelative);
    }
  }
  await visit(root);
  const payload = entries.map((entry) => JSON.stringify(entry)).join("\n");
  return {
    sha256: createHash("sha256").update(payload).digest("hex"),
    entries: entries.length,
    excluded: [...excluded].sort((a, b) => a.localeCompare(b)),
  };
}

async function isolationSnapshot() {
  const stateAgents = path.join(config.stateRoot, "agents");
  const registryPath = path.join(stateAgents, "registry.md");
  const folders = [];
  for (const entry of childAgentFolders()) {
    folders.push({
      name: entry.name,
      directory: canonicalExistingPath(entry.directory),
      fingerprint: await directoryFingerprint(entry.directory, CHILD_PROJECT_EXCLUDED_DIRECTORIES),
    });
  }
  return {
    schema: "pritha-instance-isolation-snapshot-v1",
    state_root: canonicalExistingPath(config.stateRoot),
    agent_parent: canonicalExistingPath(config.agentParent),
    protected_state: await directoryFingerprint(config.stateRoot, PROTECTED_STATE_EXCLUDED_DIRECTORIES),
    agent_state: await directoryFingerprint(stateAgents),
    registry_sha256: existsSync(registryPath) ? sha256(registryPath) : null,
    child_agent_folders: folders,
  };
}

function isolationSnapshotMatches(before, after) {
  return Boolean(before && after)
    && before.state_root === after.state_root
    && before.agent_parent === after.agent_parent
    && before.protected_state.sha256 === after.protected_state.sha256
    && before.agent_state.sha256 === after.agent_state.sha256
    && before.registry_sha256 === after.registry_sha256
    && JSON.stringify(before.child_agent_folders) === JSON.stringify(after.child_agent_folders);
}

function childAgentFolders() {
  if (!existsSync(config.agentParent)) return [];
  return readdirSync(config.agentParent)
    .map((name) => ({ name, directory: path.join(config.agentParent, name) }))
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => path.resolve(entry.directory) !== path.resolve(config.codeRoot))
    .filter((entry) => {
      try {
        return statSync(entry.directory).isDirectory()
          && existsSync(path.join(entry.directory, "AGENTS.md"))
          && !isPrithaCodeCheckout(entry.directory);
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function memoryDocuments() {
  const database = resolvePrithaStatePath("memory", "techscope.sqlite");
  if (!existsSync(database)) return null;
  const result = run("sqlite3", [database, "SELECT COUNT(*) FROM documents;"], { timeoutMs: 10_000 });
  return result.ok ? Number(result.stdout || 0) : null;
}

async function httpStatus(options = {}) {
  try {
    const response = await fetch(`http://127.0.0.1:${config.controlCenterPort}/api/health`, {
      signal: AbortSignal.timeout(Number(options.timeoutMs || 2_000)),
      cache: "no-store",
    });
    const text = (await response.text()).slice(0, 64 * 1024);
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* normalized below */ }
    const instanceMatch = payload?.schema === "pritha-control-center-health-v2"
      && payload?.instance?.id === config.instanceId
      && payload?.instance?.port === config.controlCenterPort;
    return {
      ok: response.ok && payload?.ok === true && (!options.requireIdentity || instanceMatch),
      status: response.status,
      instanceMatch,
      release: payload?.release || null,
      error: payload ? null : "invalid_health_response",
    };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function instanceStatus() {
  const head = git(["rev-parse", "HEAD"]);
  const branch = git(["branch", "--show-current"]);
  const dirty = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  const origin = git(["rev-parse", "origin/main"]);
  const [health, isolation] = await Promise.all([httpStatus(), isolationSnapshot()]);
  return {
    schema: "pritha-instance-status-v1",
    ok: head.ok,
    instance: {
      id: config.instanceId,
      role: config.instanceRole,
      code_root: config.codeRoot,
      state_root: config.stateRoot,
      agent_parent: config.agentParent,
      control_center_port: config.controlCenterPort,
    },
    git: {
      branch: branch.stdout,
      head: head.stdout,
      origin_main: origin.stdout || null,
      clean: !dirty.stdout,
      dirty: dirty.stdout ? dirty.stdout.split(/\r?\n/).filter(Boolean) : [],
      matches_origin_main: Boolean(head.stdout && origin.stdout && head.stdout === origin.stdout),
    },
    runtime: {
      health,
      memory_documents: memoryDocuments(),
      state_exists: existsSync(config.stateRoot),
    },
    isolation,
    child_agents: childAgentFolders().map((entry) => ({ name: entry.name, directory: entry.directory })),
  };
}

function migrationOperations() {
  const operations = [];
  const add = (source, destination, kind = "state") => {
    if (existsSync(source)) operations.push({ source, destination, kind });
  };
  add(path.join(config.codeRoot, ".private"), path.join(config.stateRoot, "private"));
  add(path.join(config.codeRoot, ".queue"), path.join(config.stateRoot, "queue"));
  add(path.join(config.codeRoot, ".logs"), path.join(config.stateRoot, "logs"));
  add(path.join(config.codeRoot, ".memory-private"), path.join(config.stateRoot, "private", "memory-private"));
  add(path.join(config.codeRoot, ".memory", "techscope.sqlite"), path.join(config.stateRoot, "memory", "techscope.sqlite"));
  add(path.join(config.codeRoot, ".memory", "last-self-test.json"), path.join(config.stateRoot, "memory", "last-self-test.json"));
  add(path.join(config.codeRoot, ".techscope-setup.json"), path.join(config.stateRoot, "setup", "setup.json"));
  add(path.join(config.codeRoot, ".snapshots", "audit"), path.join(config.stateRoot, "audit"));
  add(path.join(config.codeRoot, ".snapshots", "child-agents"), path.join(config.stateRoot, "snapshots", "child-agents"));

  const reviewDir = path.join(config.codeRoot, "03_reviews");
  if (existsSync(reviewDir)) {
    for (const file of readdirSync(reviewDir).filter((name) => name.endsWith("-voice-session-memory.md"))) {
      add(path.join(reviewDir, file), path.join(config.stateRoot, "voice-drafts", file), "voice-draft");
    }
  }

  return operations;
}

function copyOperation(operation) {
  mkdirSync(path.dirname(operation.destination), { recursive: true });
  if (statSync(operation.source).isDirectory()) {
    cpSync(operation.source, operation.destination, { recursive: true, force: true, preserveTimestamps: true });
  } else {
    copyFileSync(operation.source, operation.destination);
  }
}

function envAssignments(text) {
  const entries = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

function writeRuntimeEnv() {
  const sourceEnv = path.join(config.codeRoot, ".env.local");
  const target = path.join(config.stateRoot, "config", "runtime.env");
  const sourceText = existsSync(sourceEnv) ? readFileSync(sourceEnv, "utf8") : existsSync(target) ? readFileSync(target, "utf8") : "";
  const entries = envAssignments(sourceText);
  entries.set("TECHSCOPE_ROOT", JSON.stringify(config.codeRoot));
  entries.set("PRITHA_INSTANCE_ID", JSON.stringify(config.instanceId));
  entries.set("PRITHA_INSTANCE_ROLE", JSON.stringify(config.instanceRole));
  entries.set("PRITHA_STATE_ROOT", JSON.stringify(config.stateRoot));
  entries.set("PRITHA_AGENT_PARENT", JSON.stringify(config.agentParent));
  entries.set("PRITHA_CONTROL_CENTER_PORT", String(config.controlCenterPort));
  const searchUrl = process.env.PRITHA_SEARXNG_URL || entries.get("PRITHA_SEARXNG_URL");
  if (searchUrl) entries.set("PRITHA_SEARXNG_URL", searchUrl);
  entries.set("PRITHA_CONTROL_CENTER_ENV_FILE", JSON.stringify(target));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${[...entries].map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(target, 0o600);
  return target;
}

function writeLocalRegistry() {
  const folders = childAgentFolders();
  const rows = folders.map((folder) => [
    folder.name,
    "Local sibling child agent",
    "local project",
    "project-defined",
    "local",
    "manual",
    "local sibling scan",
  ]);
  const registryPath = path.join(config.stateRoot, "agents", "registry.md");
  mkdirSync(path.dirname(registryPath), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const markdown = [
    "---",
    `id: ${config.instanceId}-local-agent-registry`,
    "type: agent-registry",
    "status: local",
    `created: ${date}`,
    `updated: ${date}`,
    "topics:",
    "  - child-agents",
    "  - instance-isolation",
    "tools: []",
    "sources: []",
    "related: {}",
    "privacy: local-private",
    "retention: indefinite",
    "review_status: local",
    "confidence: high",
    "---",
    "",
    `# Local Agent Registry: ${config.instanceId}`,
    "",
    "## Agents",
    "",
    "| Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.slice(0, 7).join(" | ")} |`),
    "",
  ].join("\n");
  writeFileSync(registryPath, markdown, "utf8");
  return registryPath;
}

function migrationPlan() {
  const operations = migrationOperations();
  return {
    schema: "pritha-instance-migration-plan-v1",
    ok: true,
    mode: options.apply ? "apply" : "plan",
    instance: config,
    writes: options.apply ? operations.length + 3 : 0,
    operations,
    retains_sources: true,
  };
}

async function migrate() {
  const plan = migrationPlan();
  if (!options.apply) return plan;
  if (!options.yes) throw new Error("migrate --apply requires --yes");
  if (config.stateRoot === config.codeRoot) throw new Error("PRITHA_STATE_ROOT must be outside the checkout for migration");
  for (const directory of Object.values(PRITHA_STATE_LAYOUT)) mkdirSync(path.join(config.stateRoot, directory), { recursive: true });
  for (const operation of plan.operations) copyOperation(operation);
  const runtimeEnv = writeRuntimeEnv();
  const registry = writeLocalRegistry();
  const checksums = plan.operations.flatMap((operation) => walkFiles(operation.destination))
    .filter((file) => path.resolve(file) !== path.resolve(runtimeEnv))
    .map((file) => ({ path: path.relative(config.stateRoot, file), sha256: sha256(file), bytes: statSync(file).size }));
  const inventory = await instanceStatus();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifestPath = path.join(config.stateRoot, "releases", `migration-${stamp}.json`);
  writeFileSync(manifestPath, `${JSON.stringify({
    schema: "pritha-instance-migration-result-v1",
    created_at: new Date().toISOString(),
    instance: config,
    runtime_env: path.relative(config.stateRoot, runtimeEnv),
    registry: path.relative(config.stateRoot, registry),
    checksums,
    inventory,
    sources_retained: true,
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { ...plan, applied: true, runtime_env: runtimeEnv, registry, manifest: manifestPath, checksums: checksums.length };
}

function controlCenterRuntime(action) {
  const result = run(process.execPath, [
    "scripts/control-center-runtime.mjs",
    action,
    ...(action === "status" ? [] : ["--yes"]),
    "--json",
  ], { timeoutMs: action === "stop" ? 45_000 : 30_000 });
  let payload = null;
  try { payload = result.stdout ? JSON.parse(result.stdout) : null; } catch { /* normalized below */ }
  return {
    ok: result.ok && payload?.ok === true,
    action,
    payload,
    error: result.ok && payload?.ok === true ? null : payload?.error || result.stderr || (payload ? "runtime_action_failed" : "invalid_runtime_manager_response"),
  };
}

async function stopControlCenter() {
  const first = controlCenterRuntime("stop");
  if (first.ok || first.payload?.error !== "control_center_did_not_stop_within_grace_period") return first;
  // Re-check only a delayed verified stop, never an ownership or protocol failure.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  return { ...controlCenterRuntime("stop"), previousAttempt: first };
}

function startControlCenter() {
  return controlCenterRuntime("start");
}

function controlCenterProcessIdentity() {
  const result = controlCenterRuntime("status");
  return {
    result,
    wrapperPid: result.payload?.process?.wrapperPid || null,
    childPid: result.payload?.process?.childPid || null,
  };
}

async function waitForHealth(timeoutMs = 45_000) {
  const started = Date.now();
  let last = null;
  const requestTimeoutMs = Number(process.env.PRITHA_UPDATE_HEALTH_REQUEST_TIMEOUT_MS || 8_000);
  while (Date.now() - started < timeoutMs) {
    last = await httpStatus({ requireIdentity: true, timeoutMs: requestTimeoutMs });
    if (last.ok) return last;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return last || { ok: false, status: 0, error: "health_timeout" };
}

function strictReleaseHealth(target, buildId) {
  const configuredTimeout = Number(process.env.PRITHA_UPDATE_HEALTH_REQUEST_TIMEOUT_MS || 8_000);
  const requestTimeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout >= 100 && configuredTimeout <= 60_000
    ? configuredTimeout : 8_000;
  const result = run(process.execPath, ["scripts/control-center-health.mjs", "--strict", "--json", "--timeout-ms", String(requestTimeoutMs), "--page", "/voice,/agents,/task-chat,/codex,/settings,/dev"], { timeoutMs: 180_000 });
  let payload = null;
  try { payload = JSON.parse(result.stdout); } catch { /* fail closed */ }
  const release = payload?.checks?.find((item) => item.id === "health-contract")?.release;
  const releaseMatch = release?.commit === target.slice(0, 12) && Boolean(buildId) && release?.buildId === buildId;
  return { ok: result.ok && payload?.status === "pass" && releaseMatch, releaseMatch, payload, error: result.ok ? null : result.stderr.slice(-2_000) };
}

function copyNext(source, destination) {
  if (!existsSync(source)) return false;
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true, force: true, preserveTimestamps: true });
  return true;
}

function restorePreviousNext(liveNext, displacedNext, previousNext, hadPreviousBuild, compatibleNext = null) {
  if (compatibleNext) return copyNext(compatibleNext, liveNext);
  rmSync(liveNext, { recursive: true, force: true });
  if (existsSync(displacedNext)) {
    renameSync(displacedNext, liveNext);
    return true;
  }
  return hadPreviousBuild ? copyNext(previousNext, liveNext) : false;
}

function writePrivateJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function commandEvidence(result) {
  return {
    ok: result.ok,
    status: result.status,
    stdout: result.stdout.slice(-2_000),
    stderr: result.stderr.slice(-4_000),
  };
}

function runInstanceBootstrap() {
  const steps = [];
  const execute = (id, command, args, timeoutMs) => {
    const result = run(command, args, { timeoutMs });
    steps.push({ id, ...commandEvidence(result) });
    return result.ok;
  };
  if (existsSync(path.join(config.codeRoot, "package-lock.json")) && !execute("search-runtime-dependencies", "npm", ["ci", "--ignore-scripts"], 900_000)) return { ok: false, steps };
  if (!execute("control-center-dependencies", "npm", ["--prefix", "interfaces/control-center", "ci", "--ignore-scripts"], 900_000)) return { ok: false, steps };
  if (!execute("environment", "node", ["scripts/env-doctor.mjs", "--profile", "control-center", "--json"], 120_000)) return { ok: false, steps };
  if (!execute("memory-rebuild", "node", ["scripts/rebuild-memory.mjs"], 300_000)) return { ok: false, steps };
  if (!execute("memory-embeddings", "python3", ["scripts/embed-memory.py"], 900_000)) return { ok: false, steps };
  if (!execute("memory-validation", "node", ["scripts/validate-memory.mjs"], 240_000)) return { ok: false, steps };
  return { ok: true, steps, memory_documents: memoryDocuments() };
}

async function updateInstance() {
  const source = options.source || "origin";
  if (!["origin", "local"].includes(source)) throw new Error("--source must be origin or local");
  const expectedCommit = options["expected-commit"] ? String(options["expected-commit"]).trim().toLowerCase() : null;
  if (expectedCommit && !/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error("--expected-commit must be a full 40-character Git commit SHA");
  const status = await instanceStatus();
  const requiredStorage = existsSync(path.join(config.codeRoot, "scripts/neuraldeep/coordination-store.mjs")) ? ND_STORAGE_COMPATIBILITY : {};
  const rollbackArtifact = options["rollback-artifact"] ? verifyRollbackArtifact(String(options["rollback-artifact"]), requiredStorage) : null;
  const currentBuild = readBuildIdentity(path.join(config.codeRoot, "interfaces/control-center/.next"));
  const rollbackCompatible = !Object.keys(requiredStorage).length || compatibleBuild(rollbackArtifact?.identity || currentBuild, requiredStorage);
  const remote = source === "origin" ? git(["ls-remote", "origin", "refs/heads/main"], { timeoutMs: 30_000 }) : null;
  const candidate = source === "local" ? status.git.head : (remote.ok ? remote.stdout.split(/\s+/)[0] || null : null);
  const plan = {
    schema: "pritha-instance-update-plan-v2",
    ok: status.git.clean
      && status.git.branch === "main"
      && Boolean(candidate)
      && rollbackCompatible
      && (source !== "local" || Boolean(expectedCommit))
      && (!expectedCommit || expectedCommit === candidate),
    mode: options.apply ? "apply" : "plan",
    source,
    instance: config,
    current: status.git.head,
    target: candidate,
    expected_commit: expectedCommit,
    branch: status.git.branch,
    clean: status.git.clean,
    pre_isolation: status.isolation,
    rollback: { compatible: rollbackCompatible, identity: rollbackArtifact?.identity || currentBuild, artifact: rollbackArtifact?.root || null },
    steps: [...(source === "local" ? ["verify pinned local main without remote access"] : ["fetch pinned origin main", "fast-forward only"]), "instance-scoped dependencies and memory rebuild", "verify agent-state fingerprints", "save previous .next", "build staged .next", "bootout verified instance service", "atomic build swap", "start verified launchd service", "strict identity and chunk healthcheck", "verify final fingerprints", "rollback build and service state on failure"],
  };
  if (!options.apply) return plan;
  if (!options.yes) throw new Error("update --apply requires --yes");
  if (!rollbackCompatible) throw new Error("Refusing schema upgrade without a verified compatible rollback artifact");
  if (rollbackArtifact && !git(["merge-base", "--is-ancestor", rollbackArtifact.identity.commit, candidate]).ok) throw new Error("Rollback source must be a verified ancestor of the candidate");
  if (!status.git.clean) throw new Error("Refusing update: checkout has uncommitted or untracked changes");
  if (status.git.branch !== "main") throw new Error(`Refusing update: expected branch main, got ${status.git.branch || "detached"}`);
  let target = status.git.head;
  if (source === "local") {
    if (!expectedCommit) throw new Error("Refusing local update: --expected-commit is required");
    if (target !== expectedCommit) throw new Error("Refusing local update: main does not match the pinned release commit");
  } else {
    const fetch = git(["fetch", "origin", "main"], { timeoutMs: 120_000 });
    if (!fetch.ok) throw new Error(fetch.stderr || "git fetch failed");
    target = git(["rev-parse", "origin/main"]).stdout;
    if (expectedCommit && target !== expectedCommit) throw new Error("Refusing update: origin/main does not match the pinned release commit");
    const ancestor = git(["merge-base", "--is-ancestor", status.git.head, target]);
    if (!ancestor.ok) throw new Error("Refusing update: local main diverged or cannot fast-forward to origin/main");
    const ff = git(["merge", "--ff-only", "origin/main"], { timeoutMs: 120_000 });
    if (!ff.ok) throw new Error(ff.stderr || "fast-forward failed");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const releaseDir = resolvePrithaStatePath("releases", stamp);
  mkdirSync(releaseDir, { recursive: true });
  const manifest = path.join(releaseDir, "release.json");
  const bootstrap = runInstanceBootstrap();
  const releaseBase = {
    schema: "pritha-instance-release-v2",
    created_at: new Date().toISOString(),
    instance: config.instanceId,
    source,
    previous_commit: status.git.head,
    target_commit: target,
    expected_commit: expectedCommit,
    pre_isolation: status.isolation,
    bootstrap,
  };
  if (!bootstrap.ok || !Number.isSafeInteger(bootstrap.memory_documents) || bootstrap.memory_documents < 1) {
    writePrivateJson(manifest, { ...releaseBase, status: "bootstrap-or-memory-failed-running-previous-release" });
    return { ...plan, ok: false, applied: true, status: "bootstrap-or-memory-failed", bootstrap, manifest };
  }
  const afterBootstrapIsolation = await isolationSnapshot();
  const bootstrapIsolationMatch = isolationSnapshotMatches(status.isolation, afterBootstrapIsolation);
  if (!bootstrapIsolationMatch) {
    writePrivateJson(manifest, { ...releaseBase, status: "instance-isolation-changed-before-swap", after_bootstrap_isolation: afterBootstrapIsolation });
    return { ...plan, ok: false, applied: true, status: "instance-isolation-changed", isolationMatch: false, manifest };
  }
  const liveNext = path.join(config.codeRoot, "interfaces", "control-center", ".next");
  const previousNext = path.join(releaseDir, "previous.next");
  const compatibleNext = rollbackArtifact ? path.join(releaseDir, "compatible-rollback.next") : null;
  if (compatibleNext) {
    copyNext(rollbackArtifact.build, compatibleNext);
    if (JSON.stringify(buildTreeDigest(compatibleNext)) !== JSON.stringify(rollbackArtifact.digest)) throw new Error("Rollback artifact changed while copying");
  }
  const stagedName = ".next-pritha-staging";
  const stagedNext = path.join(config.codeRoot, "interfaces", "control-center", stagedName);
  const displacedNext = path.join(config.codeRoot, "interfaces", "control-center", ".next-pritha-previous");
  const buildMetadataPaths = [
    path.join(config.codeRoot, "interfaces", "control-center", "next-env.d.ts"),
    path.join(config.codeRoot, "interfaces", "control-center", "tsconfig.json"),
  ];
  const buildMetadata = buildMetadataPaths.map((file) => ({
    file,
    existed: existsSync(file),
    content: existsSync(file) ? readFileSync(file) : null,
  }));
  const hadPreviousBuild = copyNext(liveNext, previousNext);
  rmSync(stagedNext, { recursive: true, force: true });
  const build = run("npm", ["--prefix", "interfaces/control-center", "run", "build"], {
    timeoutMs: 900_000,
    env: { PRITHA_CONTROL_CENTER_DIST_DIR: stagedName },
  });
  for (const item of buildMetadata) {
    if (item.existed && item.content) writeFileSync(item.file, item.content);
    else if (!item.existed) rmSync(item.file, { force: true });
  }
  const release = {
    ...releaseBase,
    had_previous_build: hadPreviousBuild,
    staged_build: stagedName,
    build: { ok: build.ok, status: build.status, stderr: build.stderr.slice(-4_000) },
    after_bootstrap_isolation: afterBootstrapIsolation,
    build_id: existsSync(path.join(stagedNext, "BUILD_ID")) ? readFileSync(path.join(stagedNext, "BUILD_ID"), "utf8").trim() : null,
    rollback_identity: rollbackArtifact?.identity || currentBuild,
    compatible_rollback_build: compatibleNext,
  };
  if (!build.ok) {
    rmSync(stagedNext, { recursive: true, force: true });
    writePrivateJson(manifest, { ...release, status: "build-failed-running-previous-release" });
    return { ...plan, ok: false, applied: true, status: "build-failed", manifest };
  }
  sealBuildIdentity(stagedNext, target, requiredStorage);

  async function rollbackHealthCheck(started, timeout) {
    if (!started?.ok) return { ok: false, status: 0 };
    const basic = await waitForHealth(timeout);
    const identity = rollbackArtifact?.identity || currentBuild;
    if (!basic.ok) return { ...basic, stopped: await stopControlCenter() };
    if (!identity) return basic;
    const strict = strictReleaseHealth(identity.commit, identity.buildId);
    return { ...basic, ok: strict.ok, strict, ...(!strict.ok ? { stopped: await stopControlCenter() } : {}) };
  }

  const postBuildDirty = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  const postBuildHead = git(["rev-parse", "HEAD"]);
  if (!postBuildDirty.ok || postBuildDirty.stdout || postBuildHead.stdout !== target) {
    rmSync(stagedNext, { recursive: true, force: true });
    writePrivateJson(manifest, { ...release, status: "post-build-git-invariant-failed", git_dirty: postBuildDirty.stdout.split(/\r?\n/).filter(Boolean), head: postBuildHead.stdout });
    return { ...plan, ok: false, applied: true, status: "post-build-git-invariant-failed", manifest };
  }

  const stopped = await stopControlCenter();
  if (!stopped.ok) {
    writePrivateJson(manifest, { ...release, status: "service-stop-failed-running-previous-release", stopped });
    return { ...plan, ok: false, applied: true, status: "service-stop-failed", stopped, manifest };
  }
  try {
    rmSync(displacedNext, { recursive: true, force: true });
    if (existsSync(liveNext)) renameSync(liveNext, displacedNext);
    renameSync(stagedNext, liveNext);
  } catch (error) {
    restorePreviousNext(liveNext, displacedNext, previousNext, hadPreviousBuild, compatibleNext);
    const rollbackStart = hadPreviousBuild || compatibleNext ? startControlCenter() : null;
    const rollbackHealth = await rollbackHealthCheck(rollbackStart, 30_000);
    const rollbackProcess = hadPreviousBuild ? controlCenterProcessIdentity() : null;
    const rollbackPid = rollbackProcess?.childPid || null;
    writePrivateJson(manifest, {
      ...release,
      status: "swap-failed-rolled-back",
      stopped,
      error: error instanceof Error ? error.message : String(error),
      rollback_pid: rollbackPid,
      rollback_start: rollbackStart,
      rollback_health: rollbackHealth,
    });
    return { ...plan, ok: false, applied: true, status: "swap-failed-rolled-back", rollbackPid, rollbackHealth, manifest };
  }
  const started = startControlCenter();
  const healthTimeout = Number(process.env.PRITHA_UPDATE_HEALTH_TIMEOUT_MS || 45_000);
  const rollbackHealthTimeout = Number(process.env.PRITHA_UPDATE_ROLLBACK_HEALTH_TIMEOUT_MS || 30_000);
  let health = started.ok ? await waitForHealth(healthTimeout) : { ok: false, status: 0, error: started.error };
  if (health.ok) {
    const strict = strictReleaseHealth(target, release.build_id);
    health = { ...health, ok: strict.ok, strict };
  }
  const deployedProcess = controlCenterProcessIdentity();
  const pid = deployedProcess.childPid;
  function blockedRollback(failedStop, reason, evidence = {}) {
    writePrivateJson(manifest, { ...release, status: "rollback-stop-failed", failure_reason: reason, stopped, started, failed_stop: failedStop, failed_pid: pid, health, rollback_performed: false, ...evidence });
    return { ...plan, ok: false, applied: true, status: "rollback-stop-failed", failureReason: reason, failedStop, health, rollbackPerformed: false, manifest };
  }
  if (!health.ok) {
    const failedStop = await stopControlCenter();
    if (!failedStop.ok) return blockedRollback(failedStop, "health-failed");
    restorePreviousNext(liveNext, displacedNext, previousNext, hadPreviousBuild, compatibleNext);
    const rollbackStart = hadPreviousBuild || compatibleNext ? startControlCenter() : null;
    const rollbackHealth = await rollbackHealthCheck(rollbackStart, rollbackHealthTimeout);
    const rollbackProcess = hadPreviousBuild ? controlCenterProcessIdentity() : null;
    const rollbackPid = rollbackProcess?.childPid || null;
    writePrivateJson(manifest, { ...release, status: "health-failed-rolled-back", stopped, started, failed_stop: failedStop, failed_pid: pid, health, rollback_start: rollbackStart, rollback_pid: rollbackPid, rollback_health: rollbackHealth });
    return {
      ...plan,
      ok: false,
      applied: true,
      status: "health-failed-rolled-back",
      health,
      rollbackPid,
      rollbackHealth,
      manifest,
    };
  }
  const postIsolation = await isolationSnapshot();
  const isolationMatch = isolationSnapshotMatches(status.isolation, postIsolation);
  if (!isolationMatch) {
    const failedStop = await stopControlCenter();
    if (!failedStop.ok) return blockedRollback(failedStop, "instance-isolation-changed", { post_isolation: postIsolation });
    restorePreviousNext(liveNext, displacedNext, previousNext, hadPreviousBuild, compatibleNext);
    const rollbackStart = hadPreviousBuild || compatibleNext ? startControlCenter() : null;
    const rollbackHealth = await rollbackHealthCheck(rollbackStart, rollbackHealthTimeout);
    const rollbackProcess = hadPreviousBuild ? controlCenterProcessIdentity() : null;
    const rollbackPid = rollbackProcess?.childPid || null;
    writePrivateJson(manifest, { ...release, status: "instance-isolation-changed-rolled-back", stopped, started, failed_stop: failedStop, failed_pid: pid, health, post_isolation: postIsolation, rollback_start: rollbackStart, rollback_pid: rollbackPid, rollback_health: rollbackHealth });
    return { ...plan, ok: false, applied: true, status: "instance-isolation-changed-rolled-back", isolationMatch, rollbackPid, rollbackHealth, manifest };
  }
  const finalHead = git(["rev-parse", "HEAD"]).stdout;
  const finalDirty = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  const finalGitClean = finalDirty.ok && !finalDirty.stdout;
  const releaseOk = finalHead === target && finalGitClean;
  if (!releaseOk) {
    const failedStop = await stopControlCenter();
    if (!failedStop.ok) return blockedRollback(failedStop, "final-git-invariant-failed", { final_head: finalHead, final_git_clean: finalGitClean, final_git_dirty: finalDirty.stdout });
    restorePreviousNext(liveNext, displacedNext, previousNext, hadPreviousBuild, compatibleNext);
    const rollbackStart = hadPreviousBuild || compatibleNext ? startControlCenter() : null;
    const rollbackHealth = await rollbackHealthCheck(rollbackStart, rollbackHealthTimeout);
    const rollbackProcess = hadPreviousBuild ? controlCenterProcessIdentity() : null;
    const rollbackPid = rollbackProcess?.childPid || null;
    writePrivateJson(manifest, { ...release, status: "final-git-invariant-failed-rolled-back", stopped, started, failed_stop: failedStop, failed_pid: pid, health, post_isolation: postIsolation, isolation_match: isolationMatch, final_head: finalHead, final_git_clean: finalGitClean, final_git_dirty: finalDirty.stdout.split(/\r?\n/).filter(Boolean), memory_documents: bootstrap.memory_documents, rollback_start: rollbackStart, rollback_pid: rollbackPid, rollback_health: rollbackHealth });
    return { ...plan, ok: false, applied: true, status: "final-git-invariant-failed-rolled-back", stopped, health, isolationMatch, postIsolation, finalHead, finalGitClean, memoryDocuments: bootstrap.memory_documents, rollbackPid, rollbackHealth, manifest };
  }
  rmSync(displacedNext, { recursive: true, force: true });
  writePrivateJson(manifest, { ...release, status: "deployed", stopped, started, pid, health, post_isolation: postIsolation, isolation_match: isolationMatch, final_head: finalHead, final_git_clean: finalGitClean, final_git_dirty: [], memory_documents: bootstrap.memory_documents });
  return { ...plan, ok: true, applied: true, status: "deployed", stopped, pid, health, isolationMatch, postIsolation, finalHead, finalGitClean, memoryDocuments: bootstrap.memory_documents, manifest };
}

function print(payload) {
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Pritha instance ${config.instanceId}: ${payload.status || payload.mode || (payload.ok ? "ok" : "attention")}`);
    console.log(`Code: ${config.codeRoot}`);
    console.log(`State: ${config.stateRoot}`);
    if (payload.manifest) console.log(`Manifest: ${payload.manifest}`);
    if (payload.operations) console.log(`Planned copies: ${payload.operations.length}`);
  }
}

function usage() {
  console.log(`Usage:
  node scripts/pritha-instance.mjs status [--json]
  node scripts/pritha-instance.mjs migrate --plan [--json]
  node scripts/pritha-instance.mjs migrate --apply --yes [--json]
  node scripts/pritha-instance.mjs update --plan [--json]
  node scripts/pritha-instance.mjs update --apply --yes [--json]
  node scripts/pritha-instance.mjs update --source local --expected-commit <full-sha> --plan [--json]
  node scripts/pritha-instance.mjs update --source local --expected-commit <full-sha> --apply --yes [--json]

Environment: TECHSCOPE_ROOT, PRITHA_INSTANCE_ID, PRITHA_INSTANCE_ROLE,
PRITHA_STATE_ROOT, PRITHA_AGENT_PARENT, PRITHA_CONTROL_CENTER_PORT,
PRITHA_CONTROL_CENTER_ENV_FILE and PRITHA_SEARXNG_URL.`);
}

try {
  const command = options._[0] || "status";
  let result;
  if (command === "status") result = await instanceStatus();
  else if (command === "migrate") result = await migrate();
  else if (command === "update") result = await updateInstance();
  else {
    usage();
    process.exitCode = command === "help" ? 0 : 1;
    process.exit();
  }
  print(result);
  if (result.ok === false) process.exitCode = 1;
} catch (error) {
  const payload = { schema: "pritha-instance-error-v1", ok: false, error: error instanceof Error ? error.message : String(error) };
  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else console.error(`Pritha instance error: ${payload.error}`);
  process.exitCode = 1;
}
