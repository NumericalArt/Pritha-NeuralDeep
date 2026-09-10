#!/usr/bin/env node
import { parseLongArgsWithEquals as parseArgs } from "./lib/cli-args.mjs";
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = resolveTechscopeRoot({ cwd: path.resolve(SCRIPT_DIR, "..") });
const LOCK_PATH = path.join("tools", "web-search", "searxng-lock.json");
const PYTHON_VERSION_PROBE =
  "import json,sys; print(json.dumps({'executable': sys.executable, 'version': '.'.join(map(str, sys.version_info[:3])), 'major': sys.version_info[0], 'minor': sys.version_info[1], 'micro': sys.version_info[2]}))";
const DEFAULT_SEARCH_QUERY = "SearXNG search API";
const DEFAULT_HTTP_TIMEOUT_MS = 6_000;
const DEFAULT_START_TIMEOUT_MS = 45_000;

function run(command, args, options = {}) {
  return runSyncProbe(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 30_000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function compactText(value, maxChars = 1600) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3).trim()}...`;
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/).find(Boolean) || "";
}

function redactSensitiveText(value, maxChars = 1600) {
  return compactText(value, maxChars)
    .replace(/\b(sk|pk|rk|sess|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\b\s*[:=]\s*[^,\s)]+/gi, "$1=[REDACTED]");
}

function rel(root, target) {
  const relative = path.relative(root, target);
  return relative || ".";
}

export function loadWebSearchToolLock(options = {}) {
  const root = options.root ? path.resolve(options.root) : ROOT;
  const lockPath = path.join(root, LOCK_PATH);
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  return { root, lockPath, lock };
}

export function searxngConfig(options = {}) {
  const { root, lockPath, lock } = loadWebSearchToolLock(options);
  const cfg = lock?.tools?.searxng;
  if (!cfg) throw new Error(`Missing searxng lock entry in ${rel(root, lockPath)}`);
  const stateRoot = resolvePrithaStateRoot({ root });
  const runtimePath = (value) => {
    if (stateRoot !== root && String(value).startsWith(".private/")) {
      return path.join(stateRoot, "private", String(value).slice(".private/".length));
    }
    return path.resolve(root, value);
  };
  return {
    ...cfg,
    root,
    lockPath,
    installPath: path.resolve(root, cfg.install_path),
    venvPath: path.resolve(root, cfg.venv_path),
    settingsPath: runtimePath(cfg.settings_path),
    pidPath: runtimePath(cfg.pid_path),
    logPath: runtimePath(cfg.log_path),
    url: process.env.PRITHA_SEARXNG_URL || process.env.SEARXNG_URL || cfg.url,
  };
}

function pythonVersionMeets(version, minimum = { major: 3, minor: 11 }) {
  if (!version) return false;
  const major = Number(version.major);
  const minor = Number(version.minor);
  return Number.isFinite(major) && Number.isFinite(minor)
    && (major > minimum.major || (major === minimum.major && minor >= minimum.minor));
}

function localPythonCandidates(root) {
  const base = path.join(root, ".tools", "python");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((entry) => entry.startsWith("cpython-"))
    .sort()
    .reverse()
    .flatMap((entry) => [
      path.join(base, entry, "bin", "python3"),
      path.join(base, entry, "bin", "python3.13"),
      path.join(base, entry, "bin", "python3.12"),
      path.join(base, entry, "bin", "python3.11"),
    ])
    .filter((candidate, index, all) => existsSync(candidate) && all.indexOf(candidate) === index);
}

export function detectPython(options = {}) {
  const root = options.root ? path.resolve(options.root) : ROOT;
  const env = options.env || process.env;
  const candidates = options.candidates || [
    env.PRITHA_SEARXNG_PYTHON,
    ...localPythonCandidates(root),
    "python3.13",
    "python3.12",
    "python3.11",
    "python3",
  ].filter(Boolean);
  const found = [];

  for (const command of candidates) {
    const result = run(command, ["-c", PYTHON_VERSION_PROBE], {
      env,
      timeoutMs: options.timeoutMs || 10_000,
    });
    if (result.status !== 0) {
      found.push({
        command,
        ok: false,
        error: firstLine(result.stderr) || result.error?.message || "not found",
      });
      continue;
    }
    try {
      const parsed = JSON.parse(result.stdout);
      const ok = pythonVersionMeets(parsed);
      const entry = {
        command,
        ok,
        executable: parsed.executable,
        version: parsed.version,
        major: parsed.major,
        minor: parsed.minor,
        micro: parsed.micro,
      };
      found.push(entry);
      if (ok) return { ok: true, selected: entry, found };
    } catch (error) {
      found.push({ command, ok: false, error: error.message });
    }
  }

  return { ok: false, selected: null, found };
}

function detectGit() {
  const result = run("git", ["--version"], { timeoutMs: 10_000 });
  return {
    ok: result.status === 0,
    version: result.status === 0 ? compactText(result.stdout, 120) : "",
    error: result.status === 0 ? "" : firstLine(result.stderr) || result.error?.message || "git not found",
  };
}

function currentGitCommit(cwd) {
  if (!existsSync(path.join(cwd, ".git"))) return "";
  const result = run("git", ["rev-parse", "HEAD"], { cwd, timeoutMs: 10_000 });
  return result.status === 0 ? result.stdout.trim() : "";
}

function venvPythonPath(cfg) {
  return path.join(cfg.venvPath, "bin", "python");
}

function runnerPath(cfg) {
  return path.join(cfg.venvPath, "bin", "searxng-run");
}

function ensureParent(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function defaultSettingsYaml(cfg) {
  let port = 8080;
  try {
    port = Number(new URL(cfg.url).port || 8080);
  } catch {
    // Keep the neutral local SearXNG default.
  }
  return `use_default_settings: true
general:
  debug: false
  instance_name: "Pritha Local Search"
search:
  safe_search: 1
  autocomplete: ""
  formats:
    - html
    - json
server:
  port: ${port}
  bind_address: "127.0.0.1"
  base_url: false
  limiter: false
  public_instance: false
  image_proxy: false
  method: "GET"
  secret_key: "local-only-overridden-by-env"
valkey:
  url: false
`;
}

function ensureSettings(cfg) {
  if (existsSync(cfg.settingsPath)) return { created: false, path: cfg.settingsPath };
  ensureParent(cfg.settingsPath);
  writeFileSync(cfg.settingsPath, defaultSettingsYaml(cfg), { encoding: "utf8", mode: 0o600 });
  return { created: true, path: cfg.settingsPath };
}

function requireYes(options, action) {
  if (options.yes || options.y) return;
  throw new Error(`${action} writes local ignored runtime files. Re-run with --yes after reviewing the plan.`);
}

function runRequired(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${redactSensitiveText(result.stderr || result.stdout || result.error?.message || "unknown error")}`,
    );
  }
  return result;
}

export function installSearxng(options = {}) {
  requireYes(options, "install searxng");
  const cfg = searxngConfig(options);
  const git = detectGit();
  if (!git.ok) throw new Error(git.error || "git not available");
  const python = detectPython({ root: cfg.root });
  if (!python.ok || !python.selected) {
    throw new Error(`Python ${cfg.pythonRequirement} is required for SearXNG`);
  }

  mkdirSync(path.dirname(cfg.installPath), { recursive: true });
  const actions = [];
  if (!existsSync(cfg.installPath)) {
    runRequired("git", ["clone", cfg.repo, cfg.installPath], { timeoutMs: 900_000 });
    actions.push("cloned");
  }
  if (!existsSync(path.join(cfg.installPath, ".git"))) {
    throw new Error(`${rel(cfg.root, cfg.installPath)} exists but is not a git checkout`);
  }
  runRequired("git", ["fetch", "--depth", "1", "origin", cfg.commit], {
    cwd: cfg.installPath,
    timeoutMs: 900_000,
  });
  runRequired("git", ["checkout", "--detach", cfg.commit], {
    cwd: cfg.installPath,
    timeoutMs: 120_000,
  });
  actions.push("pinned-checkout");

  const venvPython = venvPythonPath(cfg);
  if (!existsSync(venvPython)) {
    mkdirSync(path.dirname(cfg.venvPath), { recursive: true });
    runRequired(python.selected.command, ["-m", "venv", cfg.venvPath], { timeoutMs: 300_000 });
    actions.push("created-venv");
  }
  runRequired(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], {
    timeoutMs: 600_000,
  });
  runRequired(venvPython, ["-m", "pip", "install", "-r", path.join(cfg.installPath, "requirements.txt")], {
    cwd: cfg.installPath,
    timeoutMs: 900_000,
  });
  runRequired(venvPython, ["-m", "pip", "install", "--no-build-isolation", "-e", "."], {
    cwd: cfg.installPath,
    timeoutMs: 900_000,
  });
  actions.push("installed-python-package");

  const settings = ensureSettings(cfg);
  if (settings.created) actions.push("created-private-settings");

  return {
    ok: true,
    status: "installed",
    tool: "searxng",
    actions,
    repo: cfg.repo,
    commit: cfg.commit,
    version: cfg.version,
    install_path: rel(cfg.root, cfg.installPath),
    venv_path: rel(cfg.root, cfg.venvPath),
    settings_path: rel(cfg.root, cfg.settingsPath),
  };
}

function readPid(cfg) {
  if (!existsSync(cfg.pidPath)) return null;
  const raw = readFileSync(cfg.pidPath, "utf8").trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PrithaWebSearchTools/0.1 (+local searxng healthcheck)",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const elapsed_ms = Date.now() - started;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        elapsed_ms,
        error: "http_error",
        body_preview: compactText(text, 800),
      };
    }
    try {
      return { ok: true, status: response.status, elapsed_ms, json: JSON.parse(text) };
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        elapsed_ms,
        error: "invalid_json",
        detail: error instanceof Error ? error.message : String(error),
        body_preview: compactText(text, 800),
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error && error.name === "AbortError" ? "timeout" : "fetch_failed",
      detail: redactSensitiveText(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function searchHealthUrl(cfg, query = DEFAULT_SEARCH_QUERY) {
  const url = new URL(cfg.url);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("safesearch", "1");
  return url;
}

export async function searxngHealth(options = {}) {
  const cfg = searxngConfig(options);
  const response = await fetchJson(searchHealthUrl(cfg, options.query), options.timeoutMs || DEFAULT_HTTP_TIMEOUT_MS);
  if (!response.ok) {
    return {
      ok: false,
      status: "unreachable",
      url: cfg.url,
      error: response.error,
      detail: response.detail,
      elapsed_ms: response.elapsed_ms,
      body_preview: response.body_preview,
    };
  }
  const json = response.json || {};
  const resultCount = Array.isArray(json.results) ? json.results.length : 0;
  const unresponsive = Array.isArray(json.unresponsive_engines) ? json.unresponsive_engines.length : 0;
  return {
    ok: true,
    status: "healthy",
    url: cfg.url,
    result_count: resultCount,
    unresponsive_engines: unresponsive,
    elapsed_ms: response.elapsed_ms,
  };
}

export async function searxngStatus(options = {}) {
  const cfg = searxngConfig(options);
  const python = detectPython({ root: cfg.root });
  const git = detectGit();
  const installPathExists = existsSync(cfg.installPath);
  const checkoutInstalled = installPathExists && existsSync(path.join(cfg.installPath, ".git"));
  const currentCommit = checkoutInstalled ? currentGitCommit(cfg.installPath) : "";
  const venvPython = venvPythonPath(cfg);
  const runner = runnerPath(cfg);
  const pid = readPid(cfg);
  const pidAlive = processAlive(pid);
  const health = await searxngHealth({ ...options, timeoutMs: options.timeoutMs || 2_500 });
  const issues = [];

  if (!git.ok) issues.push("git not available");
  if (!python.ok) issues.push(`Python ${cfg.pythonRequirement} not found`);
  if (!checkoutInstalled) issues.push("pinned checkout not installed");
  if (checkoutInstalled && currentCommit !== cfg.commit) issues.push(`installed checkout is ${currentCommit}, expected ${cfg.commit}`);
  if (!existsSync(venvPython)) issues.push("venv python not installed");
  if (!existsSync(runner)) issues.push("searxng-run not installed");
  if (!existsSync(cfg.settingsPath)) issues.push("private settings missing");
  if (!health.ok) issues.push("local SearXNG HTTP API not reachable");

  let status = "ready";
  if (checkoutInstalled && currentCommit && currentCommit !== cfg.commit) {
    status = "failed-pin-mismatch";
  } else if (!checkoutInstalled || !existsSync(venvPython) || !existsSync(runner) || !existsSync(cfg.settingsPath)) {
    status = "pending-install";
  } else if (!health.ok) {
    status = "installed-stopped";
  }

  return {
    ok: status === "ready",
    status,
    tool: "searxng",
    repo: cfg.repo,
    commit: cfg.commit,
    version: cfg.version,
    python_requirement: cfg.pythonRequirement,
    install_path: rel(cfg.root, cfg.installPath),
    venv_path: rel(cfg.root, cfg.venvPath),
    settings_path: rel(cfg.root, cfg.settingsPath),
    pid_path: rel(cfg.root, cfg.pidPath),
    log_path: rel(cfg.root, cfg.logPath),
    url: cfg.url,
    installed: checkoutInstalled,
    current_commit: currentCommit || null,
    venv_python_exists: existsSync(venvPython),
    runner_exists: existsSync(runner),
    settings_exists: existsSync(cfg.settingsPath),
    pid,
    pid_alive: pidAlive,
    git,
    python,
    health,
    issues,
  };
}

export async function startSearxng(options = {}) {
  requireYes(options, "start searxng");
  if (!options["skip-install"]) {
    await Promise.resolve(installSearxng(options));
  }
  const cfg = searxngConfig(options);
  const status = await searxngStatus(options);
  if (status.ok) return { ok: true, status: "already-running", tool: "searxng", pid: status.pid, url: cfg.url };

  const runner = runnerPath(cfg);
  if (!existsSync(runner)) throw new Error(`Missing ${rel(cfg.root, runner)}. Run install first.`);
  ensureSettings(cfg);
  ensureParent(cfg.logPath);
  ensureParent(cfg.pidPath);
  const logFd = openSync(cfg.logPath, "a", 0o600);
  const child = spawn(runner, [], {
    cwd: cfg.installPath,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      TECHSCOPE_ROOT: cfg.root,
      SEARXNG_SETTINGS_PATH: cfg.settingsPath,
      SEARXNG_SECRET: randomBytes(32).toString("base64url"),
    },
  });
  child.unref();
  closeSync(logFd);
  writeFileSync(cfg.pidPath, `${child.pid}\n`, { encoding: "utf8", mode: 0o600 });

  const timeoutMs = Number(options.timeoutMs || options["timeout-ms"] || DEFAULT_START_TIMEOUT_MS);
  const deadline = Date.now() + Math.max(5_000, timeoutMs);
  let health = await searxngHealth(options);
  while (!health.ok && Date.now() < deadline) {
    await sleep(750);
    health = await searxngHealth(options);
  }
  if (!health.ok) {
    return {
      ok: false,
      status: "start-timeout",
      tool: "searxng",
      pid: child.pid,
      url: cfg.url,
      log_path: rel(cfg.root, cfg.logPath),
      health,
    };
  }
  return {
    ok: true,
    status: "started",
    tool: "searxng",
    pid: child.pid,
    url: cfg.url,
    log_path: rel(cfg.root, cfg.logPath),
    health,
  };
}

export async function stopSearxng(options = {}) {
  requireYes(options, "stop searxng");
  const cfg = searxngConfig(options);
  const pid = readPid(cfg);
  if (!pid || !processAlive(pid)) return { ok: true, status: "already-stopped", tool: "searxng", pid };
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 20; i += 1) {
    if (!processAlive(pid)) break;
    await sleep(250);
  }
  return {
    ok: !processAlive(pid),
    status: processAlive(pid) ? "stop-timeout" : "stopped",
    tool: "searxng",
    pid,
  };
}

export async function ensureSearxng(options = {}) {
  requireYes(options, "ensure searxng");
  const before = await searxngStatus(options);
  const actions = [];
  if (before.status !== "ready" && before.status !== "installed-stopped") {
    const install = installSearxng(options);
    actions.push({ action: "install", ...install });
  }
  const start = await startSearxng({ ...options, "skip-install": true });
  actions.push({ action: "start", ...start });
  const after = await searxngStatus(options);
  return {
    ok: after.ok,
    status: after.ok ? "ready" : "failed",
    tool: "searxng",
    actions,
    before,
    after,
  };
}

function printPayload(payload, options) {
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Pritha web search: ${payload.status}`);
  if (payload.tool) console.log(`Tool: ${payload.tool}`);
  if (payload.url) console.log(`URL: ${payload.url}`);
  if (payload.install_path) console.log(`Install: ${payload.install_path}`);
  if (payload.issues?.length) {
    console.log("Issues:");
    for (const issue of payload.issues) console.log(`- ${issue}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  node scripts/web-search-tools.mjs status [--json] [--require-installed]
  node scripts/web-search-tools.mjs diagnose searxng [--json]
  node scripts/web-search-tools.mjs install searxng --yes [--json]
  node scripts/web-search-tools.mjs start searxng --yes [--json]
  node scripts/web-search-tools.mjs stop searxng --yes [--json]
  node scripts/web-search-tools.mjs ensure searxng --yes [--json]

The SearXNG checkout and venv are installed under ignored .tools/.private paths.
The service binds to 127.0.0.1 by default and is not exposed publicly.`);
    return;
  }

  const command = options._[0] || "status";
  const target = options._[1] || "searxng";
  if (target !== "searxng") throw new Error(`Unknown web search tool: ${target}`);

  let payload;
  if (command === "status") {
    payload = await searxngStatus(options);
    if (options["require-installed"] && payload.status === "pending-install") process.exitCode = 1;
  } else if (command === "diagnose") {
    payload = await searxngHealth({ ...options, query: options.query || DEFAULT_SEARCH_QUERY });
    process.exitCode = payload.ok ? 0 : 1;
  } else if (command === "install") {
    payload = installSearxng(options);
  } else if (command === "start") {
    payload = await startSearxng(options);
    process.exitCode = payload.ok ? 0 : 1;
  } else if (command === "stop") {
    payload = await stopSearxng(options);
    process.exitCode = payload.ok ? 0 : 1;
  } else if (command === "ensure") {
    payload = await ensureSearxng(options);
    process.exitCode = payload.ok ? 0 : 1;
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
  printPayload(payload, options);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSensitiveText(message));
  process.exit(1);
});
