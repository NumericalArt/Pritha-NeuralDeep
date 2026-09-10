import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export function isolatedProject(t, { bootstrap = false } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pritha-command-fixture-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "project");
  const stateRoot = path.join(directory, "state");
  const agentParent = path.join(directory, "agents");
  for (const dir of [root, stateRoot, agentParent, path.join(root, "scripts")]) mkdirSync(dir, { recursive: true });
  // Do not inherit instance routing, credentials, PORT/HOST or NODE_OPTIONS.
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "LANG", "LC_ALL"]
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, { TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: agentParent, PRITHA_INSTANCE_ID: "test-fixture" });
  const write = (relative, content) => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  write("AGENTS.md", "# Test agent\nUse only fixture data.\n");
  write("README.md", "# Test project\n");
  write(".env.example", "# No credentials required.\n");
  for (const kind of ["interfaces", "memory", "tools", "operations"]) write(`${kind}/manifest.json`, "{}\n");
  write("scripts/smoke-test.mjs", "console.log('fixture smoke passed');\n");
  if (bootstrap) {
    for (const file of ["env-doctor.mjs", "validate-memory.mjs", "query-memory.mjs", "lib"]) {
      symlinkSync(path.join(repositoryRoot, "scripts", file), path.join(root, "scripts", file));
    }
    write("02_briefs/fixture.md", "---\nid: fixture-brief\ntype: brief\nstatus: draft\ncreated: 2026-09-08\nupdated: 2026-09-08\ntopics: [fixture]\ntools: []\nsources: []\nrelated: {}\n---\n\n# Fixture brief\n");
    mkdirSync(path.join(stateRoot, "memory"), { recursive: true });
    const setup = spawnSync("sqlite3", [path.join(stateRoot, "memory", "techscope.sqlite"),
      ["documents", "chunks", "entities", "relations"].map(name => `CREATE TABLE ${name} (id TEXT);`).join("\n")], { env, encoding: "utf8" });
    assert.equal(setup.status, 0, setup.stderr || setup.stdout);
  }
  return {
    root, stateRoot, env, write,
    run(entrypoint, args) {
      return spawnSync(process.execPath, [path.join(repositoryRoot, entrypoint), ...args], { cwd: root, env, encoding: "utf8", timeout: 60_000 });
    },
    assertNoReports() {
      const reports = path.join(stateRoot, "agents", "reports");
      assert.deepEqual(existsSync(reports) ? readdirSync(reports) : [], []);
    },
  };
}
