#!/usr/bin/env node
import { runSyncProbe } from "./lib/sync-probe.mjs";

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isPrithaCodeCheckout, resolvePrithaAgentParent, resolvePrithaStateRoot, resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot({ cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") });
const STATE_ROOT = resolvePrithaStateRoot({ root: ROOT });
const DEFAULT_STATE_PATH = STATE_ROOT === ROOT ? path.join(ROOT, ".techscope-setup.json") : path.join(STATE_ROOT, "setup", "setup.json");
const INSTALL_URL = "https://tailscale.com/download/mac";
const DOCS = {
  macInstall: "https://tailscale.com/docs/install/mac",
  serve: "https://tailscale.com/docs/reference/tailscale-cli/serve",
  up: "https://tailscale.com/docs/reference/tailscale-cli/up",
  authKeys: "https://tailscale.com/docs/features/access-control/auth-keys",
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        out[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function commandString(command, args) {
  return [command, ...args].join(" ");
}

function tailscaleBin() {
  return process.env.PRITHA_TAILSCALE_BIN?.trim() || "tailscale";
}

function run(command, args, options = {}) {
  const result = runSyncProbe(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || 30000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, TECHSCOPE_ROOT: ROOT },
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error ? result.error.message : undefined,
  };
}

function runTailscale(args, options = {}) {
  return run(tailscaleBin(), args, options);
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function candidateControlCenterPorts() {
  const seen = new Set();
  const ports = [];
  const add = (value) => {
    const port = Number(value);
    if (!Number.isInteger(port) || port <= 0 || port > 65535 || seen.has(port)) return;
    seen.add(port);
    ports.push(port);
  };

  add(process.env.PRITHA_CONTROL_CENTER_PORT);
  const state = readJsonIfExists(DEFAULT_STATE_PATH);
  if (state?.tailscale?.app === "control-center") add(state.tailscale.port);
  const interfacesManifest = readJsonIfExists(path.join(ROOT, "interfaces", "manifest.json"));
  for (const item of interfacesManifest?.interfaces || []) {
    if (item?.name !== "pritha-control-center" || !item?.url) continue;
    const url = localHttpUrl(item.url);
    if (url) add(url.port);
  }
  add(3420);
  add(3420);
  add(5420);
  return ports;
}

function localControlCenterStatus(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/status`, { timeout: 900 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
        if (body.length > 256 * 1024) req.destroy(new Error("response_too_large"));
      });
      res.on("end", () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) {
          resolve(null);
          return;
        }
        resolve(parseJson(body));
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", () => {
      resolve(null);
    });
  });
}

async function detectedControlCenterPortForRoot() {
  for (const port of candidateControlCenterPorts()) {
    const status = await localControlCenterStatus(port);
    if (path.resolve(String(status?.root || "")) === path.resolve(ROOT)) return port;
  }
  return 0;
}

async function appConfig(options = {}) {
  const app = String(options.app || "control-center").trim() || "control-center";
  const explicitPort = options.port !== undefined && options.port !== true && String(options.port).trim() !== "";
  let port = Number(options.port || (app === "control-center" ? process.env.PRITHA_CONTROL_CENTER_PORT || 3420 : 3000));
  if (!explicitPort && app === "control-center" && !process.env.PRITHA_CONTROL_CENTER_PORT) {
    port = (await detectedControlCenterPortForRoot()) || port;
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid port: ${options.port}`);
  const healthPath = String(options["health-path"] || (app === "control-center" ? "/api/health" : "/")).trim() || "/";
  return {
    app,
    port,
    healthPath: healthPath.startsWith("/") ? healthPath : `/${healthPath}`,
    localUrl: `http://127.0.0.1:${port}`,
    localHealthUrl: `http://127.0.0.1:${port}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`}`,
  };
}

function localHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:") return null;
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return null;
    const port = Number(url.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
    return url;
  } catch {
    return null;
  }
}

function healthPathForLocalUrl(localUrl, healthUrl) {
  const local = localHttpUrl(localUrl);
  const health = localHttpUrl(healthUrl);
  if (local && health && local.port === health.port) return `${health.pathname || "/"}${health.search || ""}`;
  return "/api/health";
}

function siblingAgentApps() {
  const parent = resolvePrithaAgentParent({ root: ROOT });
  const items = [];
  let folders = [];
  try {
    folders = readdirSync(parent)
      .map((name) => ({ name, absolutePath: path.join(parent, name) }))
      .filter((entry) => {
        try {
          return statSync(entry.absolutePath).isDirectory()
            && !entry.name.startsWith(".")
            && !isPrithaCodeCheckout(entry.absolutePath);
        } catch {
          return false;
        }
      });
  } catch {
    return items;
  }

  for (const folder of folders) {
    if (path.resolve(folder.absolutePath) === path.resolve(ROOT)) continue;
    const manifestPath = path.join(folder.absolutePath, "operations", "manifest.json");
    const manifest = readJsonIfExists(manifestPath);
    const local = localHttpUrl(manifest?.local_upstream_url);
    if (!local) continue;
    items.push({
      app: folder.name,
      folder: folder.name,
      manifestPath,
      port: Number(local.port),
      healthPath: healthPathForLocalUrl(manifest.local_upstream_url, manifest.health_url),
    });
  }

  return items.sort((a, b) => a.app.localeCompare(b.app));
}

function normalizeDnsName(value) {
  return String(value || "").trim().replace(/\.$/, "");
}

function statusJson() {
  const result = runTailscale(["status", "--json"]);
  return { result, json: result.ok ? parseJson(result.stdout) : null };
}

function serveStatusJson() {
  const result = runTailscale(["serve", "status", "--json"]);
  return { result, json: result.ok ? parseJson(result.stdout) : null };
}

function serveStatusText() {
  const result = runTailscale(["serve", "status"]);
  return result.ok ? result.stdout : "";
}

function installedStatus() {
  const result = runTailscale(["version"], { timeoutMs: 10000 });
  return {
    installed: result.ok,
    version: result.ok ? result.stdout.split(/\r?\n/)[0] : "",
    detail: result.ok ? result.stdout.split(/\r?\n/)[0] : result.stderr || result.error || "tailscale not found",
  };
}

function authenticatedFromStatus(json) {
  const backend = String(json?.BackendState || "").toLowerCase();
  return Boolean(json?.Self) && !["stopped", "needslogin", "needs_login", "no_state"].includes(backend);
}

function urlFromStatus(json, port) {
  const dnsName = normalizeDnsName(json?.Self?.DNSName);
  return dnsName ? `https://${dnsName}:${port}` : "";
}

function recursiveStringIncludes(value, pattern) {
  if (value == null) return false;
  if (typeof value === "string") return value.includes(pattern);
  if (typeof value === "number" || typeof value === "boolean") return String(value).includes(pattern);
  if (Array.isArray(value)) return value.some((item) => recursiveStringIncludes(item, pattern));
  if (typeof value === "object") {
    return Object.entries(value).some(([key, item]) => key.includes(pattern) || recursiveStringIncludes(item, pattern));
  }
  return false;
}

function serveConfigured(app, status, serveJson, serveText) {
  const target = app.localUrl;
  if (serveJson && recursiveStringIncludes(serveJson, target)) return true;
  if (serveText && serveText.includes(target)) return true;
  const url = status.tailscale_url;
  if (url && serveText) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = serveText.match(new RegExp(`${escaped}(?: \\(tailnet only\\))?\\n[\\s\\S]*?(?=\\n\\n|$)`))?.[0] || "";
    if (block.includes(target)) return true;
  }
  return false;
}

function checkLocalHealth(app) {
  return new Promise((resolve) => {
    const req = http.get(app.localHealthUrl, { timeout: 2500 }, (res) => {
      res.resume();
      resolve({
        status: res.statusCode && res.statusCode >= 200 && res.statusCode < 400 ? "ready" : "failed",
        url: app.localHealthUrl,
        http_status: res.statusCode || 0,
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      resolve({
        status: "unavailable",
        url: app.localHealthUrl,
        detail: error.message,
      });
    });
  });
}

async function readiness(options = {}) {
  const app = await appConfig(options);
  const installed = installedStatus();
  const statusProbe = installed.installed ? statusJson() : { result: { ok: false, stderr: "tailscale not installed" }, json: null };
  const authenticated = installed.installed && authenticatedFromStatus(statusProbe.json);
  const status = {
    installed: installed.installed,
    authenticated,
    serve_configured: false,
    tailscale_url: authenticated ? urlFromStatus(statusProbe.json, app.port) : "",
    local_upstream_health: await checkLocalHealth(app),
    identity_headers_required: true,
    tailnet_hostname_configured: Boolean(process.env.PRITHA_TAILNET_HOSTNAME || process.env.PRITHA_CONTROL_CENTER_TAILSCALE_HOST),
    allowed_logins_configured: Boolean(process.env.PRITHA_TAILSCALE_ALLOWED_LOGINS),
    peer_access_not_tested: true,
  };
  const serveProbe = authenticated ? serveStatusJson() : { result: { ok: false }, json: null };
  const serveText = authenticated && !serveProbe.result.ok ? serveStatusText() : "";
  status.serve_configured = authenticated && serveConfigured(app, status, serveProbe.json, serveText || serveProbe.result.stdout || "");
  return {
    schema: "pritha-tailscale-setup-v1",
    app: app.app,
    port: app.port,
    local_url: app.localUrl,
    local_health_url: app.localHealthUrl,
    docs: DOCS,
    install_url: INSTALL_URL,
    status,
    checks: {
      tailscale_version: installed,
      tailscale_status: {
        ok: Boolean(statusProbe.result.ok),
        backend_state: statusProbe.json?.BackendState || "",
        self_dns_name: normalizeDnsName(statusProbe.json?.Self?.DNSName),
        detail: statusProbe.result.ok ? "tailscale status --json ok" : statusProbe.result.stderr || statusProbe.result.error || "",
      },
      tailscale_serve_status: {
        ok: Boolean(serveProbe.result.ok),
        detail: serveProbe.result.ok ? "tailscale serve status --json ok" : serveProbe.result?.stderr || serveProbe.result?.error || "not checked",
      },
    },
  };
}

function statusLabel(payload) {
  if (!payload.status.installed) return "not-installed";
  if (!payload.status.authenticated) return "pending-auth";
  if (!payload.status.serve_configured) return "pending-serve";
  if (payload.status.local_upstream_health.status !== "ready") return "upstream-not-ready";
  return "ready";
}

function planSteps(payload) {
  const app = { port: payload.port, localUrl: payload.local_url, localHealthUrl: payload.local_health_url };
  return [
    {
      id: "install-client",
      status: payload.status.installed ? "complete" : "pending-user-install",
      command: "open official Tailscale macOS install URL",
      detail: payload.status.installed ? payload.checks.tailscale_version.version : INSTALL_URL,
    },
    {
      id: "authenticate",
      status: payload.status.authenticated ? "complete" : "pending-user-auth",
      command: "tailscale up",
      detail: "Authenticate through the Tailscale app or run tailscale up. Pritha does not request auth keys by default.",
    },
    {
      id: "start-local-upstream",
      status: payload.status.local_upstream_health.status === "ready" ? "complete" : "pending-upstream",
      command: payload.app === "control-center" ? "node scripts/bootstrap.mjs --profile local --start control-center" : `start local upstream on ${app.localUrl}`,
      detail: payload.status.local_upstream_health.status === "ready" ? app.localHealthUrl : payload.status.local_upstream_health.detail || app.localHealthUrl,
    },
    {
      id: "serve-private-tailnet",
      status: payload.status.serve_configured ? "complete" : "pending-operator-approval",
      command: `node scripts/tailscale-setup.mjs serve --app ${payload.app} --port ${payload.port} --yes`,
      detail: `Will run: tailscale serve --yes --bg --https=${payload.port} ${app.localUrl}`,
    },
    {
      id: "identity-headers",
      status: payload.status.allowed_logins_configured ? "configured" : "pending-operator-config",
      command: "set PRITHA_TAILNET_HOSTNAME and PRITHA_TAILSCALE_ALLOWED_LOGINS in an ignored local env file",
      detail: "Control Center API access through Tailscale fails closed without a Tailscale-User-Login identity that matches the allowed login list.",
    },
    {
      id: "peer-access",
      status: "not-tested",
      command: "open the Tailscale HTTPS URL from the phone or trusted peer device",
      detail: "Host self-access is only a hairpin check; peer access must be confirmed from the target device.",
    },
  ];
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tempPath, filePath);
}

function updateSetupState(payload, statePath = DEFAULT_STATE_PATH) {
  const current = readJsonIfExists(statePath) || {
    schema: "techscope-setup-state-v1",
    version: 1,
    status: "completed-with-warnings",
    updated: new Date().toISOString(),
    root: ROOT,
    sections: {},
    warnings: [],
  };
  current.updated = new Date().toISOString();
  current.tailscale = {
    app: payload.app,
    port: payload.port,
    installed: payload.status.installed,
    authenticated: payload.status.authenticated,
    serve_configured: payload.status.serve_configured,
    tailscale_url: payload.status.tailscale_url || "",
    local_upstream_health: payload.status.local_upstream_health.status,
    peer_access_not_tested: payload.status.peer_access_not_tested,
    updated: current.updated,
  };
  current.sections = {
    ...(current.sections || {}),
    tailscale: {
      status: payload.status.installed
        ? payload.status.authenticated
          ? payload.status.serve_configured
            ? "configured"
            : "pending"
          : "pending-auth"
        : "pending",
      detail: payload.status.tailscale_url || payload.install_url,
    },
  };
  writeJsonAtomic(statePath, current);
}

function printHuman(payload, options = {}) {
  if (payload.schema === "pritha-tailscale-agent-fleet-v1") {
    console.log(`Pritha Tailscale agent fleet: ${payload.summary.readyToServe} ready / ${payload.summary.alreadyServed} served / ${payload.summary.total} total`);
    for (const item of payload.agents) {
      console.log(`- ${item.status_label} ${item.app}: ${item.local_url}`);
      console.log(`  health=${item.local_upstream_health.status}; serve=${item.serve_configured ? "configured" : "missing"}`);
      if (!item.serve_configured) console.log(`  approve: ${item.serve_command}`);
    }
    return;
  }
  console.log(`Pritha Tailscale setup: ${statusLabel(payload)}`);
  console.log(`App: ${payload.app}`);
  console.log(`Local upstream: ${payload.local_url}`);
  console.log(`Local health: ${payload.status.local_upstream_health.status}`);
  console.log(`Installed: ${payload.status.installed ? "yes" : "no"}`);
  console.log(`Authenticated: ${payload.status.authenticated ? "yes" : "no"}`);
  console.log(`Serve configured: ${payload.status.serve_configured ? "yes" : "no"}`);
  console.log(`Identity headers required: ${payload.status.identity_headers_required ? "yes" : "no"}`);
  console.log(`Allowed logins configured: ${payload.status.allowed_logins_configured ? "yes" : "no"}`);
  if (payload.status.tailscale_url) console.log(`Tailscale URL: ${payload.status.tailscale_url}`);
  if (options.plan) {
    for (const item of planSteps(payload)) {
      console.log(`- ${item.status} ${item.id}: ${item.command}`);
      console.log(`  ${item.detail}`);
    }
  }
}

function requireYes(options, action) {
  if (options.yes) return;
  throw new Error(`${action} requires --yes. Run plan/status first, then repeat with --yes after operator approval.`);
}

async function commandPlan(options) {
  const payload = await readiness(options);
  payload.status_label = statusLabel(payload);
  payload.steps = planSteps(payload);
  return payload;
}

async function commandPlanAgents(options) {
  const agents = siblingAgentApps();
  const payloads = [];
  for (const agent of agents) {
    const payload = await readiness({
      ...options,
      app: agent.app,
      port: agent.port,
      "health-path": agent.healthPath,
    });
    const label = statusLabel(payload);
    payloads.push({
      app: agent.app,
      folder: agent.folder,
      manifest_path: path.relative(ROOT, agent.manifestPath).startsWith("..") ? agent.manifestPath : path.relative(ROOT, agent.manifestPath),
      port: agent.port,
      local_url: payload.local_url,
      local_health_url: payload.local_health_url,
      local_upstream_health: payload.status.local_upstream_health,
      installed: payload.status.installed,
      authenticated: payload.status.authenticated,
      serve_configured: payload.status.serve_configured,
      status_label: label,
      eligible_for_serve:
        payload.status.installed &&
        payload.status.authenticated &&
        payload.status.local_upstream_health.status === "ready" &&
        !payload.status.serve_configured,
      serve_command: `node scripts/tailscale-setup.mjs serve --app ${agent.app} --port ${agent.port} --health-path ${agent.healthPath} --yes`,
      off_command: `node scripts/tailscale-setup.mjs off --app ${agent.app} --port ${agent.port} --health-path ${agent.healthPath} --yes`,
    });
  }
  return {
    schema: "pritha-tailscale-agent-fleet-v1",
    root: ROOT,
    generated_at: new Date().toISOString(),
    summary: {
      total: payloads.length,
      alreadyServed: payloads.filter((item) => item.serve_configured).length,
      readyToServe: payloads.filter((item) => item.eligible_for_serve).length,
      upstreamNotReady: payloads.filter((item) => item.local_upstream_health.status !== "ready").length,
    },
    agents: payloads,
    warnings: [
      "plan-agents is read-only and never runs Tailscale Serve.",
      "serve-agents --yes is a mutating host-network action and requires explicit operator approval.",
      "Real Tailscale hostnames are derived from local Tailscale state and should not be committed to tracked files.",
    ],
  };
}

async function commandServeAgents(options) {
  requireYes(options, "serve-agents");
  const before = await commandPlanAgents(options);
  const targets = before.agents.filter((item) => item.eligible_for_serve);
  const results = [];
  for (const target of targets) {
    const args = ["serve", "--yes", "--bg", `--https=${target.port}`, target.local_url];
    const result = runTailscale(args, { timeoutMs: 60000 });
    results.push({
      app: target.app,
      port: target.port,
      local_url: target.local_url,
      command: commandString(tailscaleBin(), args),
      status: result.ok ? "configured" : "failed",
      error: result.ok ? undefined : result.stderr || result.error || `tailscale ${args.join(" ")} failed`,
    });
    if (!result.ok) break;
  }
  const after = await commandPlanAgents(options);
  const payload = {
    ...after,
    action: "serve-agents",
    action_status: results.every((item) => item.status === "configured") ? "configured" : "failed",
    configured: results.filter((item) => item.status === "configured").length,
    results,
  };
  updateSetupState(
    {
      app: "child-agent-fleet",
      port: 0,
      status: {
        installed: after.agents.every((item) => item.installed),
        authenticated: after.agents.every((item) => item.authenticated),
        serve_configured: after.summary.readyToServe === 0,
        tailscale_url: "",
        local_upstream_health: { status: after.summary.upstreamNotReady ? "partial" : "ready" },
        peer_access_not_tested: true,
      },
      install_url: INSTALL_URL,
    },
    options.state,
  );
  if (payload.action_status === "failed") {
    const failed = results.find((item) => item.status === "failed");
    if (failed?.error) payload.warnings.push(`Stopped after failed Serve command for ${failed.app}: ${failed.error}`);
  }
  return payload;
}

async function commandInstall(options) {
  requireYes(options, "install");
  const before = await readiness(options);
  if (before.status.installed) {
    updateSetupState(before, options.state);
    return { ...before, action: "install", action_status: "already-installed" };
  }
  const payload = {
    ...before,
    action: "install",
    action_status: "pending-user-install",
    message: process.platform === "darwin"
      ? `Install the Tailscale Standalone macOS client from ${INSTALL_URL}.`
      : `Install Tailscale for this platform using official docs: ${DOCS.macInstall}`,
  };
  updateSetupState(payload, options.state);
  return payload;
}

async function commandServe(options) {
  requireYes(options, "serve");
  const before = await readiness(options);
  if (!before.status.installed) throw new Error(`Tailscale is not installed. Install from ${INSTALL_URL}.`);
  if (!before.status.authenticated) throw new Error("Tailscale is not authenticated. Use the Tailscale app or run `tailscale up`.");
  if (before.status.local_upstream_health.status !== "ready") {
    throw new Error(`Local upstream is not ready at ${before.local_health_url}. Start the app before configuring Tailscale Serve.`);
  }
  const args = ["serve", "--yes", "--bg", `--https=${before.port}`, before.local_url];
  const result = runTailscale(args, { timeoutMs: 60000 });
  if (!result.ok) throw new Error(result.stderr || result.error || `tailscale ${args.join(" ")} failed`);
  const after = await readiness(options);
  after.action = "serve";
  after.action_status = "configured";
  after.command = commandString(tailscaleBin(), args);
  updateSetupState(after, options.state);
  return after;
}

async function commandOff(options) {
  requireYes(options, "off");
  const before = await readiness(options);
  if (!before.status.installed) throw new Error(`Tailscale is not installed. Install from ${INSTALL_URL}.`);
  if (!before.status.authenticated) throw new Error("Tailscale is not authenticated. Use the Tailscale app or run `tailscale up`.");
  const args = ["serve", "--yes", `--https=${before.port}`, "off"];
  const result = runTailscale(args, { timeoutMs: 60000 });
  if (!result.ok) throw new Error(result.stderr || result.error || `tailscale ${args.join(" ")} failed`);
  const after = await readiness(options);
  after.action = "off";
  after.action_status = "disabled";
  after.command = commandString(tailscaleBin(), args);
  updateSetupState(after, options.state);
  return after;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0] || "plan";
  if (options.help) {
    console.log(`Usage:
  node scripts/tailscale-setup.mjs plan --app control-center
  node scripts/tailscale-setup.mjs plan-agents
  node scripts/tailscale-setup.mjs status --json
  node scripts/tailscale-setup.mjs auth-status
  node scripts/tailscale-setup.mjs install --yes
  node scripts/tailscale-setup.mjs serve --app control-center --port <control-center-port> --yes
  node scripts/tailscale-setup.mjs serve-agents --yes
  node scripts/tailscale-setup.mjs off --app control-center --port <control-center-port> --yes

Safety: plan/plan-agents/status/auth-status are read-only. install/serve/serve-agents/off require --yes.
Codex/operator protocol: do not run install --yes, serve --yes, serve-agents --yes, off --yes,
tailscale up, auth-key commands, Funnel, launchd, cron, or service changes
without separate explicit user approval. Peer access is not accepted until the
private URL opens from the phone or trusted peer device.
Tailscale Funnel and auth-key setup are intentionally out of scope.`);
    return;
  }

  let payload;
  if (command === "plan") payload = await commandPlan(options);
  else if (command === "plan-agents") payload = await commandPlanAgents(options);
  else if (command === "status") payload = await readiness(options);
  else if (command === "auth-status") {
    payload = await readiness(options);
    payload.status_label = payload.status.installed ? (payload.status.authenticated ? "authenticated" : "pending-auth") : "not-installed";
  } else if (command === "install") payload = await commandInstall(options);
  else if (command === "serve") payload = await commandServe(options);
  else if (command === "serve-agents") payload = await commandServeAgents(options);
  else if (command === "off") payload = await commandOff(options);
  else throw new Error(`Unknown tailscale setup command: ${command}`);

  if (options.json) console.log(JSON.stringify(payload, null, 2));
  else printHuman(payload, { plan: command === "plan" });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
