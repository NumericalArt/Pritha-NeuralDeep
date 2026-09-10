import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";

function runTailscaleSetup(args, env = {}) {
  return spawnSync("node", ["scripts/tailscale-setup.mjs", ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runTailscaleSetupAsync(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/tailscale-setup.mjs", ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function writeFakeTailscale(dir) {
  const fakePath = path.join(dir, "tailscale");
  writeFileSync(fakePath, `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
if (process.env.FAKE_TAILSCALE_LOG) appendFileSync(process.env.FAKE_TAILSCALE_LOG, args.join(" ") + "\\n");
if (args[0] === "version") {
  console.log("1.90.0");
  process.exit(0);
}
if (args[0] === "status" && args[1] === "--json") {
  if (process.env.FAKE_TAILSCALE_AUTH === "0") {
    console.log(JSON.stringify({ BackendState: "NeedsLogin" }));
  } else {
    console.log(JSON.stringify({ BackendState: "Running", Self: { DNSName: "test-host.example.invalid." } }));
  }
  process.exit(0);
}
if (args[0] === "serve" && args[1] === "status" && args[2] === "--json") {
  const upstream = process.env.FAKE_TAILSCALE_UPSTREAM || "http://127.0.0.1:3420";
  console.log(JSON.stringify({ Web: { "test-host.example.invalid:3420": { Handlers: { "/": { Proxy: upstream } } } } }));
  process.exit(0);
}
if (args[0] === "serve" && args[1] === "status") {
  const upstream = process.env.FAKE_TAILSCALE_UPSTREAM || "http://127.0.0.1:3420";
  console.log("https://test-host.example.invalid:3420 (tailnet only)\\n|-- " + upstream);
  process.exit(0);
}
if (args[0] === "serve") {
  process.exit(0);
}
console.error("unexpected fake tailscale args: " + args.join(" "));
process.exit(1);
`);
  spawnSync("chmod", ["+x", fakePath]);
  return fakePath;
}

function withServer(handler, options = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else if (req.url === "/api/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, root: options.root || process.cwd() }));
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const port = server.address().port;
        resolve(await handler(port));
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

test("tailscale setup plan is safe when Tailscale is missing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-tailscale-missing-"));
  try {
    const missingBin = path.join(dir, "missing-tailscale");
    const result = runTailscaleSetup(["plan", "--app", "control-center", "--port", "3420", "--json"], {
      PRITHA_TAILSCALE_BIN: missingBin,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.schema, "pritha-tailscale-setup-v1");
    assert.equal(payload.status.installed, false);
    assert.equal(payload.status.authenticated, false);
    assert.ok(payload.steps.some((step) => step.id === "install-client" && step.status === "pending-user-install"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tailscale setup status exposes readiness fields", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-tailscale-status-"));
  try {
    const fakeBin = writeFakeTailscale(dir);
    const result = runTailscaleSetup(["status", "--app", "control-center", "--port", "3420", "--json"], {
      PRITHA_TAILSCALE_BIN: fakeBin,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status.installed, true);
    assert.equal(payload.status.authenticated, true);
    assert.equal(payload.status.serve_configured, true);
    assert.equal(payload.status.tailscale_url, "https://test-host.example.invalid:3420");
    assert.equal(payload.status.peer_access_not_tested, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tailscale setup detects the live Control Center port for the current root", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-tailscale-live-port-"));
  try {
    const fakeBin = writeFakeTailscale(dir);
    const root = path.join(dir, "Pritha");
    mkdirSync(root, { recursive: true });
    await withServer(async (port) => {
      const upstream = `http://127.0.0.1:${port}`;
      writeFileSync(
        path.join(root, ".techscope-setup.json"),
        JSON.stringify({
          schema: "techscope-setup-state-v1",
          tailscale: {
            app: "control-center",
            port,
          },
        }),
      );
      const result = await runTailscaleSetupAsync(["status", "--app", "control-center", "--json"], {
        TECHSCOPE_ROOT: root,
        PRITHA_CONTROL_CENTER_PORT: "",
        PRITHA_TAILSCALE_BIN: fakeBin,
        FAKE_TAILSCALE_UPSTREAM: upstream,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.port, port);
      assert.equal(payload.local_url, upstream);
      assert.equal(payload.status.local_upstream_health.status, "ready");
      assert.equal(payload.status.serve_configured, true);
    }, { root });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tailscale setup serve requires explicit --yes", () => {
  const result = runTailscaleSetup(["serve", "--app", "control-center", "--port", "3420", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --yes/);
});

test("tailscale setup serve configures private Serve and writes setup state", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-tailscale-serve-"));
  try {
    const fakeBin = writeFakeTailscale(dir);
    const logPath = path.join(dir, "tailscale.log");
    const statePath = path.join(dir, ".techscope-setup.json");
    await withServer(async (port) => {
      const upstream = `http://127.0.0.1:${port}`;
      const result = await runTailscaleSetupAsync([
        "serve",
        "--app",
        "control-center",
        "--port",
        String(port),
        "--state",
        statePath,
        "--yes",
        "--json",
      ], {
        PRITHA_TAILSCALE_BIN: fakeBin,
        FAKE_TAILSCALE_LOG: logPath,
        FAKE_TAILSCALE_UPSTREAM: upstream,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.action_status, "configured");
      const log = readFileSync(logPath, "utf8");
      assert.ok(log.includes(`serve --yes --bg --https=${port} http://127.0.0.1:${port}`), log);
      const state = JSON.parse(readFileSync(statePath, "utf8"));
      assert.equal(state.tailscale.installed, true);
      assert.equal(state.tailscale.authenticated, true);
      assert.equal(state.tailscale.serve_configured, true);
      assert.equal(state.tailscale.local_upstream_health, "ready");
      assert.equal(state.tailscale.peer_access_not_tested, true);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tailscale setup plans sibling child-agent Serve mappings without mutation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pritha-tailscale-agents-"));
  try {
    const fakeBin = writeFakeTailscale(dir);
    const root = path.join(dir, "Pritha");
    const agent = path.join(dir, "DesignAgent");
    await withServer(async (port) => {
      mkdirSync(root, { recursive: true });
      mkdirSync(path.join(agent, "operations"), { recursive: true });
      writeFileSync(path.join(root, ".keep"), "", "utf8");
      writeFileSync(
        path.join(agent, "operations", "manifest.json"),
        JSON.stringify(
          {
            local_upstream_url: `http://127.0.0.1:${port}`,
            health_url: `http://127.0.0.1:${port}/api/health`,
          },
          null,
          2,
        ),
      );
      const result = await runTailscaleSetupAsync(["plan-agents", "--json"], {
        TECHSCOPE_ROOT: root,
        PRITHA_TAILSCALE_BIN: fakeBin,
        FAKE_TAILSCALE_UPSTREAM: "http://127.0.0.1:9",
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.schema, "pritha-tailscale-agent-fleet-v1");
      assert.equal(payload.summary.total, 1);
      assert.equal(payload.summary.readyToServe, 1);
      assert.equal(payload.agents[0].app, "DesignAgent");
      assert.equal(payload.agents[0].local_upstream_health.status, "ready");
      assert.equal(payload.agents[0].serve_configured, false);
      assert.match(payload.agents[0].serve_command, new RegExp(`--port ${port} --health-path /api/health --yes`));
      assert.doesNotMatch(result.stdout, /test-host\.example\.invalid/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tailscale setup serve-agents requires explicit --yes", () => {
  const result = runTailscaleSetup(["serve-agents", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --yes/);
});

test("Control Center Next config gets Tailscale dev origins from env", () => {
  const config = readFileSync("interfaces/control-center/next.config.mjs", "utf8");
  assert.match(config, /PRITHA_CONTROL_CENTER_ALLOWED_DEV_ORIGINS/);
  assert.doesNotMatch(config, new RegExp("tail" + "691439|mac-mini\\." + "tail"));
});

test("Codex-facing Tailscale operator protocol is documented", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const workflow = readFileSync("07_workflows/first-run-setup.md", "utf8");
  const guide = readFileSync("docs/tailscale-private-access.md", "utf8");
  const cli = runTailscaleSetup(["--help"]);
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);

  for (const body of [agents, workflow, guide, cli.stdout]) {
    assert.match(body, /plan .*status|plan`, `status`|plan\/status|plan --app control-center/s);
    assert.match(body, /plan-agents|agent/i);
    assert.match(body, /install --yes/);
    assert.match(body, /serve --yes/);
    assert.match(body, /serve-agents --yes|agent/i);
    assert.match(body, /off(?: .*?)? --yes|off --yes/);
    assert.match(body, /explicit\s+user approval|explicit\s+user confirmation|separate explicit\s+user approval/);
    assert.match(body, /Peer access|peer access|trusted peer device|phone/);
  }

  assert.match(guide, /Codex Operator Protocol/);
  assert.match(agents, /docs\/tailscale-private-access\.md/);
});
