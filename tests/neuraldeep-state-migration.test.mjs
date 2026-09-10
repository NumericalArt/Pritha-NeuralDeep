import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function write(root, relative, value) {
  const filePath = path.join(root, relative);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

test("state migration copies only the memory allowlist and leaves its source unchanged", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "pritha-neuraldeep-migration-"));
  const source = path.join(fixture, "source");
  const target = path.join(fixture, "target");
  mkdirSync(path.join(source, "memory"), { recursive: true });
  mkdirSync(target, { recursive: true });
  write(source, "agents/profiles/example.md", "agent profile\n");
  write(source, "private/user-memory/user.md", "private model\n");
  write(source, "private/voice-research/research.md", "voice research\n");
  write(source, "voice-drafts/draft.md", "voice draft\n");
  write(source, "queue/pending/old-job.json", "{\"old\":true}\n");
  write(source, "codex-chat/registry.json", "{\"old\":true}\n");
  const sourceProfile = readFileSync(path.join(source, "agents/profiles/example.md"), "utf8");
  execFileSync("sqlite3", [path.join(source, "memory", "techscope.sqlite")], {
    input: `
      CREATE TABLE documents (id TEXT PRIMARY KEY);
      CREATE TABLE chunks (id TEXT PRIMARY KEY);
      CREATE TABLE embeddings (id TEXT PRIMARY KEY);
      INSERT INTO documents VALUES ('d1');
      INSERT INTO chunks VALUES ('c1');
      INSERT INTO embeddings VALUES ('e1');
    `,
  });

  const env = { ...process.env, PRITHA_MIGRATION_SOURCE: source, PRITHA_STATE_ROOT: target };
  const plan = spawnSync(process.execPath, ["scripts/migrate-neuraldeep-state.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).status, "planned");
  assert.equal(existsSync(path.join(target, "agents")), false);

  const unconfirmed = spawnSync(process.execPath, ["scripts/migrate-neuraldeep-state.mjs", "apply"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.notEqual(unconfirmed.status, 0);
  assert.match(unconfirmed.stderr, /migration_apply_requires_--yes/);

  const result = spawnSync(process.execPath, ["scripts/migrate-neuraldeep-state.mjs", "apply", "--yes"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(source, "agents/profiles/example.md"), "utf8"), sourceProfile);
  assert.equal(readFileSync(path.join(target, "agents/profiles/example.md"), "utf8"), sourceProfile);
  assert.equal(existsSync(path.join(target, "queue")), false);
  assert.equal(existsSync(path.join(target, "codex-chat")), false);
  const manifest = JSON.parse(readFileSync(path.join(target, "migration", "memory-migration-manifest.json"), "utf8"));
  assert.equal(manifest.mode, "allowlist-copy-source-read-only");
  assert.equal(manifest.exclusionsVerified, true);
  assert.deepEqual(manifest.database.counts, { documents: 1, chunks: 1, embeddings: 1 });
  assert.equal(execFileSync("sqlite3", [path.join(target, "memory", "techscope.sqlite"), "PRAGMA integrity_check;"], { encoding: "utf8" }).trim(), "ok");

  write(target, "agents/reports/post-migration.md", "new target-only report\n");
  const verify = spawnSync(process.execPath, ["scripts/migrate-neuraldeep-state.mjs", "verify"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).status, "verified");
});
