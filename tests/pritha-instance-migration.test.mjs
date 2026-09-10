import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = path.resolve("scripts/pritha-instance.mjs");

function fixture(base, name, voiceText) {
  const checkout = path.join(base, name, "Pritha");
  const agentParent = path.dirname(checkout);
  const stateRoot = path.join(base, "state", name);
  mkdirSync(path.join(checkout, ".queue", "telegram-intake", "pending"), { recursive: true });
  mkdirSync(path.join(checkout, ".memory"), { recursive: true });
  mkdirSync(path.join(checkout, ".snapshots", "audit"), { recursive: true });
  mkdirSync(path.join(checkout, "03_reviews"), { recursive: true });
  mkdirSync(path.join(checkout, "11_agents", "contracts"), { recursive: true });
  mkdirSync(path.join(agentParent, `${name}-agent`), { recursive: true });
  writeFileSync(path.join(checkout, "AGENTS.md"), "# Pritha\n");
  writeFileSync(path.join(agentParent, `${name}-agent`, "AGENTS.md"), "# Agent\n");
  writeFileSync(path.join(checkout, ".queue", "telegram-intake", "pending", "job.json"), JSON.stringify({ id: name }));
  writeFileSync(path.join(checkout, ".memory", "last-self-test.json"), JSON.stringify({ schema: "techscope-self-test-v1" }));
  writeFileSync(path.join(checkout, ".snapshots", "audit", "events.jsonl"), `${JSON.stringify({ instance: name })}\n`);
  writeFileSync(path.join(checkout, "03_reviews", `2026-07-13-${name}-voice-session-memory.md`), voiceText);
  writeFileSync(path.join(checkout, ".env.local"), "OPENAI_API_KEY=fixture-secret-never-printed\n");
  writeFileSync(path.join(checkout, "11_agents", "contracts", `${name}-historical-agent-contract.md`), `---\nid: ${name}-historical-agent-contract\ntype: agent-contract\nstatus: accepted\n---\n\n# Historical fixture\n`);
  return { checkout, agentParent, stateRoot };
}

function runMigration(instance, mode) {
  return spawnSync("node", [SCRIPT, "migrate", mode, ...(mode === "--apply" ? ["--yes"] : []), "--json"], {
    cwd: instance.checkout,
    env: {
      ...process.env,
      TECHSCOPE_ROOT: instance.checkout,
      PRITHA_STATE_ROOT: instance.stateRoot,
      PRITHA_AGENT_PARENT: instance.agentParent,
      PRITHA_INSTANCE_ID: path.basename(path.dirname(instance.checkout)),
      PRITHA_INSTANCE_ROLE: "replica",
      PRITHA_CONTROL_CENTER_PORT: "5420",
    },
    encoding: "utf8",
  });
}

test("migration plan is read-only and apply keeps two instance roots isolated", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-migration-"));
  try {
    const alpha = fixture(base, "alpha", "alpha-only");
    const beta = fixture(base, "beta", "beta-only");

    const plan = runMigration(alpha, "--plan");
    assert.equal(plan.status, 0, plan.stderr || plan.stdout);
    assert.equal(existsSync(alpha.stateRoot), false, "plan must not create the state root");

    for (const instance of [alpha, beta]) {
      const applied = runMigration(instance, "--apply");
      assert.equal(applied.status, 0, applied.stderr || applied.stdout);
      const payload = JSON.parse(applied.stdout);
      assert.equal(payload.applied, true);
      assert.ok(existsSync(path.join(instance.stateRoot, "queue", "telegram-intake", "pending", "job.json")));
      assert.ok(existsSync(path.join(instance.stateRoot, "memory", "last-self-test.json")));
      assert.ok(existsSync(path.join(instance.stateRoot, "audit", "events.jsonl")));
      assert.ok(existsSync(path.join(instance.stateRoot, "agents", "registry.md")));
      assert.equal(existsSync(path.join(instance.stateRoot, "agents", "contracts", `${path.basename(path.dirname(instance.checkout))}-historical-agent-contract.md`)), false);
    }

    assert.equal(readFileSync(path.join(alpha.stateRoot, "voice-drafts", "2026-07-13-alpha-voice-session-memory.md"), "utf8"), "alpha-only");
    assert.equal(readFileSync(path.join(beta.stateRoot, "voice-drafts", "2026-07-13-beta-voice-session-memory.md"), "utf8"), "beta-only");
    assert.equal(existsSync(path.join(alpha.stateRoot, "voice-drafts", "2026-07-13-beta-voice-session-memory.md")), false);
    const envMode = statSync(path.join(alpha.stateRoot, "config", "runtime.env")).mode & 0o777;
    assert.equal(envMode, 0o600);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("instance configuration accepts the three fleet ports", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-ports-"));
  try {
    for (const port of [3420, 4420, 5420]) {
      const instance = fixture(base, `port-${port}`, String(port));
      const result = spawnSync("node", [SCRIPT, "status", "--json"], {
        cwd: instance.checkout,
        env: {
          ...process.env,
          TECHSCOPE_ROOT: instance.checkout,
          PRITHA_STATE_ROOT: instance.stateRoot,
          PRITHA_AGENT_PARENT: instance.agentParent,
          PRITHA_INSTANCE_ID: `port-${port}`,
          PRITHA_CONTROL_CENTER_PORT: String(port),
        },
        encoding: "utf8",
      });
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.instance.control_center_port, port);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
