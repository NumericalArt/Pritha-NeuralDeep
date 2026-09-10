import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkCardReadiness } from "../scripts/agents-mother/card-readiness.mjs";

function writeRegistry(root, rows = []) {
  const registryDir = path.join(root, "11_agents");
  mkdirSync(registryDir, { recursive: true });
  writeFileSync(
    path.join(registryDir, "registry.md"),
    [
      "## Agents",
      "",
      "| Agent | Mission | Runtime | Interface | Deployment | Proactivity | Evidence |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...rows,
      "",
    ].join("\n"),
  );
}

function writeManifest(projectRoot, overrides = {}) {
  const manifest = {
    version: 1,
    generated_by: "Pritha",
    agent: "AlphaAgent",
    service_mode: "manual",
    autostart: "disabled",
    control_center_managed: true,
    control_center_contract: {
      version: 1,
      command_shape: "structured-argv",
      executor: "scripts/control-center-runtime.mjs",
      default_execution: "control-center-managed-local-runtime",
      legacy_strings_executable: false,
      confirmation_required: false,
    },
    control_center_runtime: {
      manager: "detached-node-process",
      service_boundary: "project-local-control-center-runtime",
      prestart_argv: [],
      start_argv: ["node", "scripts/control-center-agent-service.mjs"],
      health_url: "http://127.0.0.1:4999/api/health",
    },
    start_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "start"],
      cwd: ".",
      control_center_managed: true,
    },
    stop_command: {
      argv: ["node", "scripts/control-center-runtime.mjs", "stop"],
      cwd: ".",
      control_center_managed: true,
    },
    healthcheck_argv: ["node", "scripts/healthcheck.mjs"],
    local_upstream_url: "http://127.0.0.1:4999",
    health_url: "http://127.0.0.1:4999/api/health",
    ...overrides,
  };

  mkdirSync(path.join(projectRoot, "operations"), { recursive: true });
  writeFileSync(
    path.join(projectRoot, "operations", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function writeContract(root, { name, technicalSlug, targetFolder }) {
  const contractDir = path.join(root, "11_agents", "contracts");
  mkdirSync(contractDir, { recursive: true });
  writeFileSync(
    path.join(contractDir, `${technicalSlug}-agent-contract.md`),
    [
      "---",
      `id: ${technicalSlug}-agent-contract`,
      "type: agent-contract",
      "status: accepted",
      "---",
      "",
      `- Agent name: ${name}`,
      `- Technical slug: ${technicalSlug}`,
      `- Target folder: ${targetFolder}`,
      "",
    ].join("\n"),
  );
}

function writeOutcomeLifecycle(root, { name, technicalSlug, deliveryStatus = "awaiting_acceptance" }) {
  const contractDir = path.join(root, "11_agents", "contracts");
  const reportDir = path.join(root, "11_agents", "reports");
  mkdirSync(contractDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    path.join(contractDir, `${technicalSlug}-agent-outcome-spec.md`),
    [
      "---",
      `id: ${technicalSlug}-agent-outcome-spec`,
      "type: agent-outcome-spec",
      "status: approved",
      "outcome_spec_status: approved",
      "approved_by: user",
      "created: 2026-08-16",
      "updated: 2026-08-16",
      "---",
      "",
      `# Agent Outcome Spec: ${name}`,
    ].join("\n"),
  );
  writeFileSync(
    path.join(reportDir, `${technicalSlug}-agent-delivery-report.md`),
    [
      "---",
      `id: ${technicalSlug}-agent-delivery-report`,
      "type: agent-delivery-report",
      `status: ${deliveryStatus}`,
      "created: 2026-08-16",
      "updated: 2026-08-16",
      "---",
      "",
      `# Agent delivery report: ${name}`,
    ].join("\n"),
  );
}

test("card readiness reports missing when registry row is absent", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-missing-"));
  const root = path.join(parent, "Pritha");
  mkdirSync(root, { recursive: true });
  writeRegistry(root);

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "missing");
  assert.equal(result.registryPresent, false);
  assert.match(result.blockers.join("\n"), /missing from the current instance registry/);
});

test("card readiness reports ready for registered scaffold with card-ready manifest", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-ready-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot);

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "ready");
  assert.match(result.agentId, /^agent-[a-f0-9]{24}$/);
  assert.equal(result.identity.status, "legacy");
  assert.equal(result.registryPresent, true);
  assert.equal(result.folderPresent, true);
  assert.equal(result.manifestPresent, true);
  assert.equal(result.controlCenterVisible, "unknown");
  assert.deepEqual(result.blockers, []);
});

test("card readiness resolves a technical slug and explicit target folder outside the sibling naming convention", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-explicit-target-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "Documents", "OperationsAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| Operations Agent | fixture mission | codex-native | Codex project / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeContract(root, { name: "Operations Agent", technicalSlug: "operations-agent", targetFolder: projectRoot });
  writeManifest(projectRoot, {
    agent: "Operations Agent",
    service_mode: "none",
    control_center_managed: false,
    control_center_contract: { mode: "readiness-card-only" },
    control_center_runtime: undefined,
    start_command: { argv: ["node", "scripts/agent-cli.mjs", "status"] },
    stop_command: { argv: [] },
    local_upstream_url: undefined,
    health_url: undefined,
  });

  const result = await checkCardReadiness("operations-agent", { root, baseUrl: false });

  assert.equal(result.status, "ready");
  assert.match(result.agentId, /^agent-[a-f0-9]{24}$/);
  assert.equal(result.registryPresent, true);
  assert.equal(result.folderPresent, true);
  assert.equal(result.folderPath, path.relative(root, projectRoot));
  assert.equal(result.manifestPresent, true);
  assert.deepEqual(result.blockers, []);
});

test("card readiness exposes Outcome Spec and delivery as separate lifecycle states", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-outcome-lifecycle-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 outcome:1 scaffold:1 delivery:1 |"]);
  writeContract(root, { name: "AlphaAgent", technicalSlug: "alpha-agent", targetFolder: projectRoot });
  writeOutcomeLifecycle(root, { name: "AlphaAgent", technicalSlug: "alpha-agent" });
  writeManifest(projectRoot);

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.lifecycle.outcome, {
    present: true,
    id: "alpha-agent-agent-outcome-spec",
    path: "11_agents/contracts/alpha-agent-agent-outcome-spec.md",
    status: "approved",
    approved: true,
  });
  assert.equal(result.lifecycle.delivery.present, true);
  assert.equal(result.lifecycle.delivery.status, "awaiting_acceptance");
  assert.match(result.nextActions.join("\n"), /Continue the delivery lifecycle from awaiting_acceptance/);
});

test("card readiness normalizes executable manual_only action plans to ready", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-live-ready-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    if (urlText.endsWith("/api/agents")) {
      return new Response(
        JSON.stringify({
          agents: [
            {
              id: "alpha-agent",
              name: "AlphaAgent",
              ui: { primaryAction: "start" },
              control: { planAction: "start" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (urlText.endsWith("/api/agents/alpha-agent/actions/start/plan")) {
      return new Response(
        JSON.stringify({
          status: "manual_only",
          actionEnabled: true,
          blockers: [],
          control: { executionMode: "executable" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const result = await checkCardReadiness("alpha-agent", { root, baseUrl: "http://control.test" });
    assert.equal(result.status, "ready");
    assert.equal(result.actionPlanStatus, "ready");
    assert.equal(result.rawActionPlanStatus, "manual_only");
    assert.equal(result.actionExecutionMode, "executable");
    assert.equal(result.actionEnabled, true);
    assert.deepEqual(result.blockers, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("card readiness reports needs_confirmation for executable confirmation-gated action plans", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-live-confirm-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    if (urlText.endsWith("/api/agents")) {
      return new Response(
        JSON.stringify({
          agents: [
            {
              id: "alpha-agent",
              name: "AlphaAgent",
              ui: { primaryAction: "start" },
              control: { planAction: "start" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (urlText.endsWith("/api/agents/alpha-agent/actions/start/plan")) {
      return new Response(
        JSON.stringify({
          status: "manual_only",
          actionEnabled: true,
          requiresConfirmation: true,
          confirmation: { requiredPhrase: "START alpha-agent" },
          blockers: [],
          control: { executionMode: "executable" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const result = await checkCardReadiness("alpha-agent", { root, baseUrl: "http://control.test" });
    assert.equal(result.status, "ready");
    assert.equal(result.actionPlanStatus, "needs_confirmation");
    assert.equal(result.rawActionPlanStatus, "manual_only");
    assert.equal(result.actionExecutionMode, "executable");
    assert.equal(result.actionEnabled, true);
    assert.deepEqual(result.blockers, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("card readiness blocks selected Control Center runtime without a health contract", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-runtime-contract-"));
  const root = path.join(parent, "Pritha");
  const projectRoot = path.join(parent, "AlphaAgent");
  mkdirSync(projectRoot, { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);
  writeManifest(projectRoot, {
    healthcheck_argv: [],
    health_url: undefined,
    local_upstream_url: undefined,
    control_center_runtime: {
      manager: "detached-node-process",
      service_boundary: "project-local-control-center-runtime",
      prestart_argv: [],
      start_argv: ["node", "scripts/control-center-agent-service.mjs"],
    },
  });

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /requires health_url, local_upstream_url, or healthcheck_argv/);
});

test("card readiness reports unknown operations applicability without an authored contract or manifest", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "pritha-card-blocked-"));
  const root = path.join(parent, "Pritha");
  mkdirSync(path.join(parent, "AlphaAgent"), { recursive: true });
  writeRegistry(root, ["| AlphaAgent | fixture mission | codex-native | cli / Telegram none | local Mac | manual | contracts:1 scaffold:1 |"]);

  const result = await checkCardReadiness("alpha-agent", { root, baseUrl: false });

  assert.equal(result.status, "blocked");
  assert.equal(result.registryPresent, true);
  assert.equal(result.folderPresent, true);
  assert.equal(result.manifestPresent, false);
  assert.match(result.blockers.join("\n"), /Operations applicability needs an accepted contract/);
});
