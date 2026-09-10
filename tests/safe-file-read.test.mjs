import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { readBoundedRegularFile } from "../scripts/lib/safe-file-read.mjs";

test("bounded file reader accepts a small regular file and rejects symlinks, devices and oversized files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-safe-read-"));
  const outside = path.join(os.tmpdir(), `pritha-safe-read-outside-${process.pid}.txt`);
  try {
    const regular = path.join(root, "regular.json");
    writeFileSync(regular, "{\"ok\":true}\n");
    assert.equal(readBoundedRegularFile(regular, { maxBytes: 100, allowedRoots: [root] }).text, "{\"ok\":true}\n");

    writeFileSync(outside, "outside");
    const symlink = path.join(root, "link.json");
    symlinkSync(outside, symlink);
    assert.throws(() => readBoundedRegularFile(symlink, { maxBytes: 100, allowedRoots: [root] }), /regular|symlink/);
    assert.throws(() => readBoundedRegularFile("/dev/zero", { maxBytes: 100 }), /regular/);

    const oversized = path.join(root, "oversized.json");
    writeFileSync(oversized, "x".repeat(101));
    assert.throws(() => readBoundedRegularFile(oversized, { maxBytes: 100 }), /size_limit/);
  } finally {
    rmSync(outside, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
