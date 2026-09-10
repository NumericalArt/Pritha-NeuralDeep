import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { redactFilesystemPaths } from "../scripts/lib/redaction.mjs";

test("tracked report redaction replaces known roots and user-specific paths", () => {
  const homeDir = path.join(path.sep, "Users", "fixture-user");
  const projectRoot = path.join(homeDir, "Agents", "report-agent");
  const stateRoot = path.join(homeDir, ".local", "state", "pritha");
  const prithaRoot = path.join(homeDir, "Pritha");
  const tempRoot = path.join(path.sep, "private", "var", "folders", "fixture", "T", "worktree");
  const text = [
    `project=${path.join(projectRoot, "out", "result.md")}`,
    `state=${path.join(stateRoot, "builds", "run-1")}`,
    `root=${path.join(prithaRoot, "scripts", "pritha.mjs")}`,
    `temp=${path.join(tempRoot, "file.txt")}`,
    "relative=tests/fixture.md",
  ].join("\n");
  const redacted = redactFilesystemPaths(text, {
    homeDir,
    root: prithaRoot,
    stateRoot,
    projectRoot,
  });

  assert.equal(redacted.includes(homeDir), false);
  assert.equal(redacted.includes(tempRoot), false);
  assert.match(redacted, /<PROJECT_ROOT>\/out\/result\.md/);
  assert.match(redacted, /<PRITHA_STATE_ROOT>\/builds\/run-1/);
  assert.match(redacted, /<TECHSCOPE_ROOT>\/scripts\/pritha\.mjs/);
  assert.match(redacted, /relative=tests\/fixture\.md/);
});

test("path redaction keeps secret redaction active", () => {
  const homeDir = path.join(path.sep, "Users", "fixture-user");
  const value = redactFilesystemPaths(`${path.join(homeDir, "file")} token=ghp_abcdefghijklmnopqrstuvwxyz123456`, { homeDir });
  assert.doesNotMatch(value, /ghp_/);
  assert.equal(value.includes(homeDir), false);
});
