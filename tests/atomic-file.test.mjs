import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireFileLock, atomicCompareAndSwapFile, withFileLock } from "../scripts/lib/atomic-file.mjs";

test("file lock rejects an active local owner", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-active-lock-"));
  const target = path.join(root, "state.json");
  const lock = acquireFileLock(target);
  try {
    assert.throws(() => acquireFileLock(target), /locked by another operation/);
  } finally {
    lock.release();
  }
  assert.equal(existsSync(`${target}.lock`), false);
});

test("file lock recovers a dead local PID without deleting its evidence", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-stale-lock-"));
  const target = path.join(root, "state.json");
  writeFileSync(`${target}.lock`, `${JSON.stringify({ pid: 2_147_483_647, created_at: "2020-01-01T00:00:00.000Z" })}\n`);

  const value = withFileLock(target, () => "recovered");

  assert.equal(value, "recovered");
  assert.equal(existsSync(`${target}.lock`), false);
  assert.equal(existsSync(root), true);
});

test("async callback retains the lock until its promise settles", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-async-lock-"));
  const target = path.join(root, "state.json");
  let releaseCallback;
  const pending = withFileLock(target, () => new Promise((resolve) => { releaseCallback = resolve; }));

  assert.throws(() => acquireFileLock(target), /locked by another operation/);
  releaseCallback("done");
  assert.equal(await pending, "done");

  const next = acquireFileLock(target);
  next.release();
});

test("compare-and-swap recovers a stale lock and refuses stale content", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-cas-lock-"));
  const target = path.join(root, "state.json");
  writeFileSync(target, "before");
  writeFileSync(`${target}.lock`, `${JSON.stringify({ pid: 2_147_483_647, created_at: "2020-01-01T00:00:00.000Z" })}\n`);

  atomicCompareAndSwapFile(target, "before", "after");
  assert.equal(readFileSync(target, "utf8"), "after");
  assert.throws(() => atomicCompareAndSwapFile(target, "before", "again"), /File changed during operation/);
});
