import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const rebuildScript = path.resolve("scripts/rebuild-memory.mjs");
const validateScript = path.resolve("scripts/validate-memory.mjs");
const schema = readFileSync(path.resolve(".memory/schema.sql"), "utf8");

function write(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

test("external instance agent artifacts override tracked history with the same document id", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-memory-instance-agents-"));
  const codeRoot = path.join(base, "Pritha");
  const stateRoot = path.join(base, "Pritha-state", "main");
  const trackedPath = path.join(codeRoot, "11_agents", "contracts", "shared-agent.md");
  const canonicalPath = path.join(stateRoot, "agents", "contracts", "shared-agent.md");

  try {
    write(path.join(codeRoot, ".memory", "schema.sql"), schema);
    write(
      trackedPath,
      `---
id: shared-agent-contract
type: note
status: accepted
created: 2026-08-19
---

# Shared Agent

TRACKED_HISTORY_MARKER
`,
    );
    write(
      canonicalPath,
      `---
id: shared-agent-contract
type: note
status: accepted
created: 2026-08-19
privacy: local-private
---

# Shared Agent

CANONICAL_INSTANCE_MARKER
`,
    );

    const rebuilt = spawnSync("node", [rebuildScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        TECHSCOPE_ROOT: codeRoot,
        PRITHA_STATE_ROOT: stateRoot,
      },
    });
    assert.equal(rebuilt.status, 0, `${rebuilt.stdout}\n${rebuilt.stderr}`);

    const database = path.join(stateRoot, "memory", "techscope.sqlite");
    const query = spawnSync(
      "sqlite3",
      [database, "SELECT d.path || char(10) || c.text FROM documents d JOIN chunks c ON c.document_id=d.id WHERE d.id='shared-agent-contract';"],
      { encoding: "utf8" },
    );
    assert.equal(query.status, 0, query.stderr);
    assert.match(query.stdout, /CANONICAL_INSTANCE_MARKER/);
    assert.doesNotMatch(query.stdout, /TRACKED_HISTORY_MARKER/);
    assert.match(query.stdout, new RegExp(path.relative(codeRoot, canonicalPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const validated = spawnSync("node", [validateScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        TECHSCOPE_ROOT: codeRoot,
        PRITHA_STATE_ROOT: stateRoot,
      },
    });
    assert.equal(validated.status, 0, `${validated.stdout}\n${validated.stderr}`);
    assert.match(validated.stdout, /Memory validation passed for 1 Markdown files/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("instance agent ids cannot shadow tracked platform knowledge", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-memory-platform-collision-"));
  const codeRoot = path.join(base, "Pritha");
  const stateRoot = path.join(base, "state");
  try {
    write(path.join(codeRoot, ".memory", "schema.sql"), schema);
    write(path.join(codeRoot, "03_reviews", "platform-review.md"), `---\nid: platform-review\ntype: note\nstatus: accepted\n---\n\n# Platform review\n`);
    write(path.join(stateRoot, "agents", "reports", "collision.md"), `---\nid: platform-review\ntype: note\nstatus: local\nprivacy: local-private\n---\n\n# Local collision\n`);
    const env = { ...process.env, TECHSCOPE_ROOT: codeRoot, PRITHA_STATE_ROOT: stateRoot };
    const rebuilt = run("node", [rebuildScript], { env });
    assert.notEqual(rebuilt.status, 0);
    assert.match(rebuilt.stderr, /collides with tracked platform knowledge/);
    const validated = run("node", [validateScript], { env });
    assert.notEqual(validated.status, 0);
    assert.match(validated.stderr, /collides with tracked platform document/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("two instances sharing one checkout index only their own child agents and leave Git clean", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-memory-two-instances-"));
  const codeRoot = path.join(base, "Pritha");
  const states = [path.join(base, "state-a"), path.join(base, "state-b")];
  try {
    write(path.join(codeRoot, ".memory", "schema.sql"), schema);
    write(path.join(codeRoot, "README.md"), "# Fixture\n");
    for (const [index, stateRoot] of states.entries()) {
      const letter = index === 0 ? "a" : "b";
      write(path.join(stateRoot, "agents", "contracts", `fixture-agent-${letter}.md`), `---\nid: fixture-agent-${letter}\ntype: note\nstatus: accepted\nprivacy: local-private\n---\n\n# Fixture Agent ${letter.toUpperCase()}\n\nINSTANCE_${letter.toUpperCase()}_ONLY\n`);
    }
    for (const args of [["init", "-b", "main"], ["config", "user.email", "fixture@example.com"], ["config", "user.name", "Fixture"], ["add", "."], ["commit", "-m", "fixture"]]) {
      const result = run("git", args, { cwd: codeRoot });
      assert.equal(result.status, 0, result.stderr);
    }
    for (const [index, stateRoot] of states.entries()) {
      const rebuilt = run("node", [rebuildScript], {
        env: { ...process.env, TECHSCOPE_ROOT: codeRoot, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: path.join(base, `agents-${index}`) },
      });
      assert.equal(rebuilt.status, 0, rebuilt.stderr);
      const query = run("sqlite3", [path.join(stateRoot, "memory", "techscope.sqlite"), "SELECT group_concat(id, ',') FROM documents;"]);
      assert.equal(query.status, 0, query.stderr);
      assert.match(query.stdout, new RegExp(`fixture-agent-${index === 0 ? "a" : "b"}`));
      assert.doesNotMatch(query.stdout, new RegExp(`fixture-agent-${index === 0 ? "b" : "a"}`));
    }
    assert.equal(existsSync(path.join(codeRoot, "11_agents")), false);
    const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: codeRoot });
    assert.equal(status.stdout.trim(), "");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("memory entrypoints load PRITHA_STATE_ROOT from checkout .env.local", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-memory-env-pointer-"));
  const codeRoot = path.join(base, "Pritha");
  const stateRoot = path.join(base, "state");
  try {
    write(path.join(codeRoot, ".memory", "schema.sql"), schema);
    write(path.join(codeRoot, ".env.local"), `PRITHA_STATE_ROOT=${stateRoot}\n`);
    write(path.join(stateRoot, "agents", "contracts", "local-agent.md"), `---\nid: local-agent\ntype: note\nstatus: local\nprivacy: local-private\n---\n\n# Local agent\n`);
    const env = { ...process.env, TECHSCOPE_ROOT: codeRoot };
    delete env.PRITHA_STATE_ROOT;
    const rebuilt = run("node", [rebuildScript], { env });
    assert.equal(rebuilt.status, 0, rebuilt.stderr);
    assert.equal(existsSync(path.join(stateRoot, "memory", "techscope.sqlite")), true);
    assert.equal(existsSync(path.join(codeRoot, ".memory", "techscope.sqlite")), false);
    const stats = run("node", [path.resolve("scripts/query-memory.mjs"), "stats"], { env, cwd: base, timeout: 10000, killSignal: "SIGKILL" });
    assert.equal(stats.status, 0, stats.stderr);
    assert.match(stats.stdout, /documents\s+1/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
