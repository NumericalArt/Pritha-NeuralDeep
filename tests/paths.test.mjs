import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSiblingAgentPath, resolveTechscopeRoot } from "../scripts/lib/paths.mjs";

test("resolveTechscopeRoot honors TECHSCOPE_ROOT", () => {
  const oldRoot = process.env.TECHSCOPE_ROOT;
  const root = mkdtempSync(path.join(os.tmpdir(), "techscope-root-fixture-"));
  process.env.TECHSCOPE_ROOT = root;
  try {
    assert.equal(resolveTechscopeRoot(), root);
  } finally {
    if (oldRoot === undefined) delete process.env.TECHSCOPE_ROOT;
    else process.env.TECHSCOPE_ROOT = oldRoot;
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveTechscopeRoot ignores stale missing TECHSCOPE_ROOT", () => {
  const oldRoot = process.env.TECHSCOPE_ROOT;
  process.env.TECHSCOPE_ROOT = path.join(os.tmpdir(), "missing-techscope-root-for-test");
  try {
    assert.equal(resolveTechscopeRoot(), process.cwd());
  } finally {
    if (oldRoot === undefined) delete process.env.TECHSCOPE_ROOT;
    else process.env.TECHSCOPE_ROOT = oldRoot;
  }
});

test("resolveSiblingAgentPath places agents beside root by default", () => {
  assert.equal(
    resolveSiblingAgentPath("ChildAgent", { root: "/tmp/example/Techscope" }),
    path.join("/tmp/example", "ChildAgent"),
  );
});

test("resolveSiblingAgentPath supports explicit override", () => {
  assert.equal(
    resolveSiblingAgentPath("Ignored", { overridePath: "/tmp/custom-agent" }),
    "/tmp/custom-agent",
  );
});
