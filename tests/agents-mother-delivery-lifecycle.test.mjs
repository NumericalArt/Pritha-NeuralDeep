import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MANAGED_LIFECYCLE_TRIAL_ID, managedLifecycleCheck, managedLifecycleFailure } from "../scripts/agents-mother/delivery-lifecycle.mjs";
import { serviceLifecycleTest } from "../scripts/agents-mother/scaffold/tests.mjs";

const manifest = {
  scaffold_adapter: "api-process-v1",
  control_center_managed: true,
  health_url: "http://127.0.0.1:3999/health",
  start_command: { argv: ["node", "scripts/service-control.mjs", "start"], env_allowlist: ["FIXTURE_PORT", "PRITHA_STATE_ROOT"] },
};
const stub = 'console.error(JSON.stringify({status:"implementation-required"}));\nprocess.exitCode=78;\n';
const server = `import { createServer } from "node:http";
createServer((request, response) => { response.writeHead(request.url === "/health" ? 200 : 404); response.end("ok"); })
  .listen(Number(process.env.FIXTURE_PORT), "127.0.0.1");
`;
// Identity is the PID plus a per-start token on its command line: a record naming another process is never signalled.
const serviceControl = `import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const pidFile = new URL("../.state/service.pid.json", import.meta.url);
const commandOf = pid => spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).stdout;
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const saved = () => { try { return JSON.parse(readFileSync(pidFile, "utf8")); } catch { return null; } };
const owned = record => typeof record?.token === "string" && commandOf(record.pid).includes("--service-token=" + record.token);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const action = process.argv[2], record = saved();
if (action === "start") {
  if (owned(record)) process.exit(0);
  mkdirSync(new URL("../.state/", import.meta.url), { recursive: true });
  const token = randomUUID();
  const child = spawn(process.execPath, ["scripts/server.mjs", "--service-token=" + token], { detached: true, stdio: "ignore" });
  child.unref();
  writeFileSync(pidFile, JSON.stringify({ pid: child.pid, token }));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:" + process.env.FIXTURE_PORT + "/health")).ok) process.exit(0); } catch {}
    await wait(100);
  }
  process.exit(1);
}
if (action === "stop") {
  if (!record) process.exit(0);
  if (!owned(record)) { if (alive(record.pid)) process.exit(1); rmSync(pidFile, { force: true }); process.exit(0); }
  process.kill(record.pid, "SIGTERM");
  for (let attempt = 0; attempt < 50 && alive(record.pid); attempt += 1) await wait(100);
  rmSync(pidFile, { force: true });
  process.exit(alive(record.pid) ? 1 : 0);
}
process.exit(2);
`;

function project(t, { control = stub, withManifest = true } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-lifecycle-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git(["init", "-q"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]);
  for (const directory of ["scripts", "tests", "operations"]) mkdirSync(path.join(root, directory));
  if (withManifest) writeFileSync(path.join(root, "operations/manifest.json"), JSON.stringify(manifest));
  writeFileSync(path.join(root, "scripts/service-control.mjs"), stub);
  writeFileSync(path.join(root, "scripts/server.mjs"), server);
  writeFileSync(path.join(root, "tests/service-lifecycle.test.mjs"), serviceLifecycleTest(manifest));
  git(["add", "-A"]); git(["commit", "-qm", "scaffold baseline"]);
  const base = git(["rev-parse", "HEAD"]);
  writeFileSync(path.join(root, "scripts/service-control.mjs"), control);
  return { root, base };
}

test("a project without a managed process manifest at its baseline is not checked", t => {
  const { root, base } = project(t, { withManifest: false });
  assert.deepEqual(managedLifecycleCheck(root, { baseRevision: base }), { applicable: false });
  assert.deepEqual(managedLifecycleCheck(root, {}), { applicable: false });
});

// Gemma 4 passed every Outcome Trial with this stub in place; Pritha's Start then failed with exit 78 (2026-09-28).
test("the scaffold lifecycle stub fails the host check even when the child weakens its own lifecycle test", t => {
  const { root, base } = project(t);
  writeFileSync(path.join(root, "tests/service-lifecycle.test.mjs"), 'import test from "node:test";\ntest("lifecycle", () => {});\n');
  const check = managedLifecycleCheck(root, { baseRevision: base });
  assert.equal(check.applicable, true);
  assert.equal(check.ok, false);
  assert.match(check.output, /implementation-required/);
  assert.equal(check.output.includes(os.tmpdir()), false, "the disposable copy path is not reported");
  const failure = managedLifecycleFailure(check);
  assert.equal(failure.id, MANAGED_LIFECYCLE_TRIAL_ID);
  assert.equal(failure.kind, "automated");
  assert.match(failure.statement, /service-control\.mjs start\|stop/);
  assert.match(failure.execution.stderr, /implementation-required/);
});

test("a working managed lifecycle passes in a disposable copy and leaves the candidate untouched", t => {
  const { root, base } = project(t, { control: serviceControl });
  const check = managedLifecycleCheck(root, { baseRevision: base });
  assert.equal(check.applicable, true);
  assert.equal(check.ok, true, check.output);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "M scripts/service-control.mjs");
});

test("a managed process project without a tests folder or service control fails the check instead of crashing it", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-lifecycle-bare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git(["init", "-q"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]);
  mkdirSync(path.join(root, "operations"));
  writeFileSync(path.join(root, "operations/manifest.json"), JSON.stringify(manifest));
  git(["add", "-A"]); git(["commit", "-qm", "manifest only"]);
  const check = managedLifecycleCheck(root, { baseRevision: git(["rev-parse", "HEAD"]) });
  assert.equal(check.applicable, true);
  assert.equal(check.ok, false);
  assert.match(check.output, /implementation-required until the approved service lifecycle is built/);
});
