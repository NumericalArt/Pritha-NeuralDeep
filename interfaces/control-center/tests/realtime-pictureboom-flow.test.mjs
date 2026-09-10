import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_PATH = path.join(PROJECT_ROOT, "src", "lib", "realtime", "pritha-runtime.ts");

function runtimeSource() {
  return readFileSync(RUNTIME_PATH, "utf8");
}

test("routes PictureBoom image requests through a safe Codex task payload", () => {
  const source = runtimeSource();
  for (const required of [
    "PictureBoom Codex image handoff",
    "Use run_codex_task with task_type=implementation",
    "write_mode=workspace_write",
    "requires_internet=false",
    "subject_kind=agent",
    "subject_id=pictureboom",
    "subject_label=PictureBoom",
    "thread_reset=false",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /\/Users\/jkl\/PictureBoom/);
});

test("requires PictureBoom local ingest checks and browser non-disclosure", () => {
  const source = runtimeSource();
  for (const required of [
    "node scripts/image-inbox.mjs ingest",
    "node scripts/image-inbox.mjs list --json",
    "node scripts/image-inbox.mjs assert-local",
    "PictureBoom feed/API visibility",
    "Pritha memory, queues, logs and reports",
    "must not expose the prompt summary or request id",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
