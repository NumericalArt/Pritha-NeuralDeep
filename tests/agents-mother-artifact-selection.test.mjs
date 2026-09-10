import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { newestArtifactPathsFirst, writeUniqueArtifact } from "../scripts/agents-mother/artifact-selection.mjs";

test("artifact selection prefers revisions within a series and mtime across renamed series", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-artifact-selection-"));
  try {
    const oldBase = path.join(root, "2026-07-13-old-agent-research.md");
    const oldRevision = path.join(root, "2026-07-13-old-agent-research-2.md");
    const renamed = path.join(root, "2026-07-13-new-agent-research.md");
    for (const file of [oldBase, oldRevision, renamed]) writeFileSync(file, file);
    utimesSync(oldBase, new Date("2026-07-13T10:00:00Z"), new Date("2026-07-13T10:00:00Z"));
    utimesSync(oldRevision, new Date("2026-07-13T12:00:00Z"), new Date("2026-07-13T12:00:00Z"));
    utimesSync(renamed, new Date("2026-07-13T13:00:00Z"), new Date("2026-07-13T13:00:00Z"));

    assert.deepEqual(newestArtifactPathsFirst([oldBase, oldRevision]), [oldRevision, oldBase]);
    assert.equal(newestArtifactPathsFirst([oldBase, oldRevision, renamed])[0], renamed);
    const permutations = [
      [oldBase, oldRevision, renamed],
      [oldBase, renamed, oldRevision],
      [oldRevision, oldBase, renamed],
      [oldRevision, renamed, oldBase],
      [renamed, oldBase, oldRevision],
      [renamed, oldRevision, oldBase],
    ];
    for (const permutation of permutations) {
      assert.deepEqual(newestArtifactPathsFirst(permutation), [renamed, oldRevision, oldBase]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("atomic unique artifact writes use the filename as a unique frontmatter id input", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-artifact-write-"));
  const target = path.join(root, "2026-07-13-agent-research.md");
  try {
    const first = writeUniqueArtifact(target, ({ artifactId }) => `id: ${artifactId}\n`);
    const second = writeUniqueArtifact(target, ({ artifactId }) => `id: ${artifactId}\n`);
    assert.equal(first.artifactId, "2026-07-13-agent-research");
    assert.equal(second.artifactId, "2026-07-13-agent-research-2");
    assert.notEqual(first.path, second.path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
