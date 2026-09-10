import test from "node:test";
import assert from "node:assert/strict";
import { isolatedProject } from "./helpers/isolated-project.mjs";

test("Pritha entrypoint preserves Agents Mother test behavior", t => {
  const fixture = isolatedProject(t);
  const result = fixture.run("scripts/pritha.mjs", ["test", ".", "--no-report"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Classification: agent-project/);
  assert.match(result.stdout, /Report: skipped \(--no-report\)/);
  fixture.assertNoReports();
});

test("legacy Agents Mother wrapper remains compatible and prints a deprecation note", t => {
  const fixture = isolatedProject(t);
  const result = fixture.run("scripts/agents-mother.mjs", ["test", ".", "--no-report"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Classification: agent-project/);
  assert.match(result.stderr, /Deprecation notice: Agents Mother is now Pritha/);
  fixture.assertNoReports();
});

test("Pritha aliases expose create, publish and lineage surfaces", t => {
  const fixture = isolatedProject(t);
  const help = fixture.run("scripts/pritha.mjs", ["help"]);
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /Pritha aliases:/);
  assert.match(help.stdout, /create --name/);
  assert.match(help.stdout, /publish <project-path>/);
  assert.match(help.stdout, /lineage/);

  const publish = fixture.run("scripts/pritha.mjs", ["publish", "."]);
  assert.equal(publish.status, 0, publish.stderr || publish.stdout);
  assert.match(publish.stdout, /Report: skipped \(--no-report\)/);
  fixture.assertNoReports();
});

test("Pritha and legacy entrypoints propagate fixture smoke failures without writing reports", t => {
  const fixture = isolatedProject(t);
  fixture.write("scripts/smoke-test.mjs", "process.exitCode = 1;\n");
  for (const entrypoint of ["scripts/pritha.mjs", "scripts/agents-mother.mjs", "scripts/agents-mother/index.mjs"]) {
    const result = fixture.run(entrypoint, ["test", ".", "--no-report"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /Result: failed/);
  }
  fixture.assertNoReports();
});
