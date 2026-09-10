import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writeLifecycleReport } from "../scripts/agents-mother/lifecycle-report.mjs";

test("lifecycle writer redacts secrets and filesystem paths before durable write and keeps ids unique", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pritha-lifecycle-writer-"));
  const basePath = path.join(directory, "2026-08-22-fixture-agent-test-report.md");
  const projectRoot = path.join(path.sep, "workspace", "fixture-project");
  const stateRoot = path.join(path.sep, "srv", "pritha-state", "fixture");
  const prithaRoot = path.join(path.sep, "workspace", "Pritha");
  const homeDir = path.join(path.sep, "home", "fixture-user");
  const tempPath = path.join(os.tmpdir(), "fixture-secret", "output.log");
  const context = {
    projectRoot,
    stateRoot,
    root: prithaRoot,
    homeDir,
  };
  const render = ({ artifactId }) => `---
id: ${artifactId}
type: agent-test-report
status: complete
---

Project: ${projectRoot}
State: ${stateRoot}
Pritha: ${prithaRoot}
Home: ${homeDir}
Temp: ${tempPath}
API_KEY=fixture-secret-value
`;
  try {
    const first = writeLifecycleReport(basePath, render, context);
    const second = writeLifecycleReport(basePath, render, context);
    for (const written of [first, second]) {
      const text = readFileSync(written.path, "utf8");
      assert.equal(path.basename(written.path, ".md"), written.artifactId);
      assert.match(text, new RegExp(`^id: ${written.artifactId}$`, "m"));
      assert.match(text, /<PROJECT_ROOT>/);
      assert.match(text, /<PRITHA_STATE_ROOT>/);
      assert.match(text, /<TECHSCOPE_ROOT>/);
      assert.match(text, /<USER_HOME>/);
      assert.match(text, /<TEMP_PATH>/);
      assert.match(text, /API_KEY=\[REDACTED\]/);
      for (const privateValue of ["fixture-secret-value", projectRoot, stateRoot, homeDir, path.dirname(tempPath)]) {
        assert.equal(text.includes(privateValue), false);
      }
    }
    assert.equal(second.revision, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("every durable lifecycle report surface uses the shared final writer", () => {
  const files = [
    "scripts/agents-mother/scaffold/index.mjs",
    "scripts/agents-mother/test.mjs",
    "scripts/agents-mother/handoff.mjs",
    "scripts/agents-mother/operations.mjs",
    "scripts/agents-mother/registry.mjs",
    "scripts/agents-mother/delivery-loop.mjs",
  ];
  for (const file of files) {
    const source = readFileSync(path.resolve(file), "utf8");
    assert.match(source, /writeLifecycleReport\(/, `${file} must use the shared lifecycle writer`);
  }
});
