import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const entrypoint = path.resolve("scripts/pritha.mjs");

test("Pritha CLI loads the checkout-local instance pointer before agent modules", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-cli-instance-env-"));
  const root = path.join(base, "Pritha");
  const stateRoot = path.join(base, "state", "main");
  const contractsRoot = path.join(stateRoot, "agents", "contracts");
  const agentParent = path.join(base, "agents-main");
  mkdirSync(root, { recursive: true });
  mkdirSync(contractsRoot, { recursive: true });
  mkdirSync(agentParent, { recursive: true });
  writeFileSync(path.join(root, ".env.local"), [
    `PRITHA_STATE_ROOT=${stateRoot}`,
    `PRITHA_AGENT_PARENT=${agentParent}`,
    "PRITHA_INSTANCE_ID=main-fixture",
    "",
  ].join("\n"));
  writeFileSync(path.join(contractsRoot, "2026-08-19-local-only-agent-contract.md"), `---
id: local-only-agent-contract
type: agent-contract
status: draft
created: 2026-08-19
updated: 2026-08-19
topics: []
tools: []
sources: []
related: {}
supersedes: []
superseded_by: []
---

# Agent Contract

- Agent name: Local Only Agent
`);

  try {
    const env = { ...process.env, TECHSCOPE_ROOT: root };
    delete env.PRITHA_STATE_ROOT;
    delete env.PRITHA_AGENT_PARENT;
    delete env.PRITHA_INSTANCE_ID;
    const result = spawnSync(process.execPath, [entrypoint, "list"], {
      cwd: root,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Local Only Agent/);
    assert.match(result.stdout, /state[\\/]main[\\/]agents[\\/]contracts/);
    assert.doesNotMatch(result.stdout, /11_agents/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
