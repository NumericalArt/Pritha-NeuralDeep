import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { STARTUP_CHECK_ID, SYNTAX_CHECK_ID, startupDiagnostics, syntaxDiagnostics } from "../scripts/agents-mother/delivery-diagnostics.mjs";

function project(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-diagnostics-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]); git(["config", "user.name", "Fixture"]); git(["config", "user.email", "fixture@example.invalid"]);
  for (const directory of ["scripts", "tests/trials", "node_modules/dependency"]) mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, "scripts/ok.mjs"), "export const value = `ready`;\n");
  writeFileSync(path.join(root, "tests/trials/verifier.mjs"), "export {};\n");
  git(["add", "-A"]); git(["commit", "-qm", "baseline"]);
  return root;
}

test("parseable scripts produce no diagnostic", t => {
  assert.deepEqual(syntaxDiagnostics(project(t)), []);
});

// Gemma 4 wrote \` inside template literals; the Trial only said the server exited (2026-09-28).
test("a script that does not parse is reported with its location and error, not its stack", t => {
  const root = project(t);
  writeFileSync(path.join(root, "scripts/server.mjs"), "const table = \\`| a |\\`;\nexport default table;\n");
  writeFileSync(path.join(root, "node_modules/dependency/index.js"), "this is not javascript (\n");
  writeFileSync(path.join(root, "tests/trials/broken.mjs"), "const = ;\n");
  const [diagnostic, ...rest] = syntaxDiagnostics(root);
  assert.equal(rest.length, 0);
  assert.equal(diagnostic.id, SYNTAX_CHECK_ID);
  assert.equal(diagnostic.status, "failed");
  assert.match(diagnostic.execution.stderr, /scripts\/server\.mjs:1/);
  assert.match(diagnostic.execution.stderr, /SyntaxError/);
  assert.doesNotMatch(diagnostic.execution.stderr, /node_modules|tests\/trials|\n\s+at /);
});

test("a folder that is not a Git work tree produces no diagnostic", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-diagnostics-plain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(syntaxDiagnostics(root), []);
});

const notReady = [{ id: "preset-behavior", execution: { stderr: "Error: Product /health did not become ready" } }];
function serverProject(t, source) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-startup-fixture-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"));
  writeFileSync(path.join(root, "scripts/server.mjs"), source);
  return root;
}

// A Gemma 4 server listened on its scaffold port variable, never on PORT (2026-09-28).
test("a server that ignores PORT is reported with what it printed", async t => {
  const root = serverProject(t, 'import { createServer } from "node:http";\nconst server = createServer((q, s) => s.end("ok")).listen(0, "127.0.0.1", () => console.log("listening on " + server.address().port));\n');
  const [diagnostic, ...rest] = await startupDiagnostics(root, notReady, { waitMs: 2_000 });
  assert.equal(rest.length, 0);
  assert.equal(diagnostic.id, STARTUP_CHECK_ID);
  assert.match(diagnostic.statement, /PORT=\d+[\s\S]*was still running[\s\S]*must listen on process\.env\.PORT/);
  assert.match(diagnostic.execution.stderr, /^listening on \d+$/);
});

test("a server that crashes at start is reported with its exit code and error", async t => {
  const root = serverProject(t, 'throw new Error("missing configuration");\n');
  const [diagnostic] = await startupDiagnostics(root, notReady, { waitMs: 2_000 });
  assert.match(diagnostic.statement, /exited with code 1/);
  assert.match(diagnostic.execution.stderr, /missing configuration/);
});

test("a server that answers /health on PORT, or a failure that is not about readiness, needs no startup diagnostic", async t => {
  const root = serverProject(t, 'import { createServer } from "node:http";\ncreateServer((q, s) => { s.writeHead(q.url === "/health" ? 200 : 404); s.end("ok"); }).listen(Number(process.env.PORT), "127.0.0.1");\n');
  assert.deepEqual(await startupDiagnostics(root, notReady, { waitMs: 3_000 }), []);
  assert.deepEqual(await startupDiagnostics(root, [{ id: "main", execution: { stderr: "not ready" } }]), []);
});
