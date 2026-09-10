import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const accessModeSource = readFileSync("interfaces/control-center/src/lib/access-mode.ts", "utf8");
const agentCardSource = readFileSync("interfaces/control-center/src/components/agents/AgentCard.tsx", "utf8");
const agentsPageSource = readFileSync("interfaces/control-center/src/app/agents/page.tsx", "utf8");
const statusPagesSource = readFileSync("interfaces/control-center/src/components/shell/StatusPages.tsx", "utf8");
const agentStatusPageSource = readFileSync("interfaces/control-center/src/app/agents/[id]/page.tsx", "utf8");
const controlCenterServerSource = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");
const settingsSource = readFileSync("interfaces/control-center/src/components/settings/SettingsControlPage.tsx", "utf8");

async function loadAccessModeModule() {
  const output = ts.transpileModule(accessModeSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-access-mode-test-"));
  const modulePath = path.join(tmp, "access-mode.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("Agent cards render URLs through the selected Control Center access mode", () => {
  assert.match(agentCardSource, /agentUrlForAccessMode\(agent\.url,\s*access,\s*accessMode,\s*agent\.tailscaleUrl\)/);
  assert.match(agentCardSource, /statusUrlForAccessMode\(agent\.statusUrl,\s*access,\s*accessMode\)/);
  assert.match(agentCardSource, /agent\.activity === "active"/);
  assert.match(agentCardSource, /Status page/);
  assert.match(agentCardSource, /data-testid="agent-url-link"/);
  assert.match(agentCardSource, /data-url=\{displayUrl\}/);
  assert.match(agentsPageSource, /AgentsStatusPage/);
  assert.match(statusPagesSource, /statusUrl: `\/agents\/\$\{agent\.id\}`/);
});

test("Managed active web agents keep plan control as the primary action", () => {
  assert.doesNotMatch(agentCardSource, /const usePrimaryOpen/);
  assert.doesNotMatch(agentCardSource, /data-testid="agent-primary-open-link"/);
  assert.doesNotMatch(agentCardSource, /data-testid="agent-manage-button"/);
  assert.match(agentCardSource, /className=\{`\$\{mobile \? "mobile-agent-action" : "agent-action"\} \$\{actionTone\}`\}/);
  assert.match(agentCardSource, /onClick=\{canOpenPlan \? \(\) => onAction\?\.\(agent\) : undefined\}/);
  assert.match(agentCardSource, /data-testid="agent-url-link"/);
});

test("Access mode URL rewrite keeps LAN ports but requires explicit child-agent Tailscale links", async () => {
  const loaded = await loadAccessModeModule();
  try {
    const access = {
      localhost: "http://127.0.0.1:3420",
      lan: "ready",
      lanUrl: "http://192.0.2.10:3420",
      tailscale: "ready",
      tailscaleUrl: "https://control-center.example.invalid",
      qr: "ready",
    };

    assert.equal(loaded.module.agentUrlForAccessMode("http://127.0.0.1:4877", access, "localhost"), "http://127.0.0.1:4877");
    assert.equal(loaded.module.agentUrlForAccessMode("http://127.0.0.1:4877", access, "lan"), "http://192.0.2.10:4877");
    assert.equal(loaded.module.agentUrlForAccessMode("http://127.0.0.1:4877", access, "tailscale"), undefined);
    assert.equal(
      loaded.module.agentUrlForAccessMode("http://127.0.0.1:4877", access, "tailscale", "https://agent.example.invalid:4877"),
      "https://agent.example.invalid:4877",
    );
  } finally {
    loaded.cleanup();
  }

  assert.match(accessModeSource, /agentUrlForAccessMode\(rawUrl: string \| undefined, access: ControlCenterStatus\["access"\], mode: AccessMode, agentTailscaleUrl\?: string\)/);
  assert.match(accessModeSource, /if \(mode === "tailscale"\) return agentTailscaleUrl/);
  assert.match(accessModeSource, /if \(mode === "localhost"\) return rawUrl/);
  assert.match(accessModeSource, /const target = new URL\(targetBase\)/);
  assert.match(accessModeSource, /next\.protocol = target\.protocol/);
  assert.match(accessModeSource, /next\.hostname = target\.hostname/);
  assert.match(accessModeSource, /next\.port = source\.port \|\| target\.port/);
});

test("Control Center carries served agent Tailscale links into agent cards", () => {
  assert.match(controlCenterServerSource, /tailscale_public_url\?: string/);
  assert.match(controlCenterServerSource, /function validTailscalePublicUrl/);
  assert.match(controlCenterServerSource, /function tailscaleServeStatusJson/);
  assert.match(controlCenterServerSource, /function servedTailscaleUrlForLocalUrl/);
  assert.match(controlCenterServerSource, /function agentTailscaleUrl/);
  assert.match(controlCenterServerSource, /if \(url\.username \|\| url\.password\) return undefined/);
  assert.match(controlCenterServerSource, /url\.protocol !== "https:" \|\| !url\.hostname\.endsWith\("\.ts\.net"\)/);
  assert.match(controlCenterServerSource, /const tailscaleUrl = agentTailscaleUrl\(manifest,\s*localUrl,\s*access\)/);
  assert.match(controlCenterServerSource, /tailscale: tailscaleUrl/);
  assert.match(statusPagesSource, /tailscaleUrl: agent\.url\.tailscale/);
});

test("Control Center bounds and caches read-only Tailscale probes", () => {
  assert.match(controlCenterServerSource, /createProbeCache\(\{ ttlMs: 120_000 \}\)/);
  assert.match(controlCenterServerSource, /policy: "privateAccess"/);
  assert.match(controlCenterServerSource, /accessLinksCache\.get\(cacheKey/);
  assert.match(readFileSync("scripts/lib/timeout-policy.mjs", "utf8"), /privateAccess: Object\.freeze\(\{ defaultMs: 1_000/);
});

test("Settings Tailscale guidance uses the current instance port", () => {
  assert.match(settingsSource, /new URL\(access\?\.localhost/);
  assert.match(settingsSource, /--port \$\{controlCenterPort\}/);
  assert.doesNotMatch(settingsSource, /<code>node scripts\/tailscale-setup\.mjs plan --app control-center --port 3420<\/code>/);
});

test("Agent status page gives inactive runtimes a human-readable fallback", () => {
  assert.match(agentStatusPageSource, /getControlCenterStatus/);
  assert.match(agentStatusPageSource, /Child agent status/);
  assert.match(agentStatusPageSource, /Runtime not open/);
  assert.match(agentStatusPageSource, /Open Runtime/);
});
