import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  captureProtectedTrialInputs,
  cleanupDeliveryWorktree,
  commitVerifiedCheckpoint,
  DeliveryWorkspaceError,
  prepareDeliveryWorktree,
  readDeliveryWorktree,
  verifyProtectedTrialInputs,
} from "../scripts/agents-mother/delivery-worktree.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function repository() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "tests@pritha.local"]);
  git(root, ["config", "user.name", "Pritha Tests"]);
  writeFileSync(path.join(root, "agent.mjs"), "export const ready = false;\n", "utf8");
  writeFileSync(path.join(root, "eval.mjs"), "import { ready } from './agent.mjs'; if (!ready) process.exit(1);\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "initial"]);
  return root;
}

function plan() {
  return { trials: [{ id: "smoke", kind: "automated", argv: [process.execPath, "eval.mjs"], fixture: "", cwd: "." }] };
}

test("delivery coding uses a dedicated branch and leaves the active worktree unchanged", () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-run-")), "run");
  const prepared = prepareDeliveryWorktree(project, runRoot, "run-1");
  assert.equal(prepared.branch, "pritha/build-run-1");
  assert.equal(readFileSync(path.join(project, "agent.mjs"), "utf8").includes("false"), true);

  writeFileSync(path.join(prepared.worktree, "agent.mjs"), "export const ready = true;\n", "utf8");
  const checkpoint = commitVerifiedCheckpoint(runRoot, { verifiedAt: "2026-08-16T12:00:00.000Z" });
  assert.equal(checkpoint.changed, true);
  assert.equal(git(prepared.worktree, ["status", "--porcelain"]), "");
  assert.equal(git(project, ["status", "--porcelain"]), "");
  assert.equal(readFileSync(path.join(project, "agent.mjs"), "utf8").includes("false"), true);
});

test("dirty cleanup is retained and marked cleanup_required without force removal", () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-cleanup-")), "run");
  const prepared = prepareDeliveryWorktree(project, runRoot, "dirty-cleanup");
  writeFileSync(path.join(prepared.worktree, "untracked-user-work.txt"), "preserve\n");

  const planned = cleanupDeliveryWorktree(runRoot);
  assert.equal(planned.action, "retain");
  assert.equal(planned.cleanup_required, true);
  assert.equal(existsSync(prepared.worktree), true);

  const applied = cleanupDeliveryWorktree(runRoot, { apply: true, yes: true });
  assert.equal(applied.removed, false);
  assert.equal(existsSync(prepared.worktree), true);
  const metadata = readDeliveryWorktree(runRoot);
  assert.equal(metadata.cleanup_status, "required");
  assert.equal(metadata.cleanup_required, true);
  assert.equal(metadata.cleanup_reason, "dirty_worktree");
});

test("clean cleanup removes only the worktree and preserves branch and checkpoint", () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-cleanup-")), "run");
  const prepared = prepareDeliveryWorktree(project, runRoot, "clean-cleanup");
  writeFileSync(path.join(prepared.worktree, "agent.mjs"), "export const ready = true;\n");
  const checkpoint = commitVerifiedCheckpoint(runRoot);

  const applied = cleanupDeliveryWorktree(runRoot, { apply: true, yes: true, cleanedAt: "2026-08-22T12:00:00.000Z" });
  assert.equal(applied.removed, true);
  assert.equal(existsSync(prepared.worktree), false);
  assert.match(git(project, ["branch", "--list", prepared.branch]), /pritha\/build-clean-cleanup/);
  assert.equal(git(project, ["rev-parse", prepared.branch]), checkpoint.verified_checkpoint);
  const metadata = readDeliveryWorktree(runRoot);
  assert.equal(metadata.cleanup_status, "cleaned");
  assert.equal(metadata.cleanup_required, false);
  assert.equal(metadata.verified_checkpoint, checkpoint.verified_checkpoint);

  const repeated = cleanupDeliveryWorktree(runRoot, { apply: true, yes: true });
  assert.equal(repeated.reason, "already_cleaned");
  assert.equal(repeated.removed, false);
});

test("v1 worktree metadata is normalized by the backward reader", () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-v1-")), "run");
  prepareDeliveryWorktree(project, runRoot, "legacy-reader");
  const metadataPath = path.join(runRoot, "delivery-worktree.json");
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  metadata.schema = "pritha-delivery-worktree-v1";
  delete metadata.cleanup_status;
  delete metadata.cleanup_required;
  delete metadata.cleanup_reason;
  delete metadata.cleaned_at;
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  const normalized = readDeliveryWorktree(runRoot);
  assert.equal(normalized.schema, "pritha-delivery-worktree-v2");
  assert.equal(normalized.cleanup_status, "active");
  assert.equal(normalized.cleanup_required, false);
});

test("dirty active worktree is refused without stashing or resetting", () => {
  const project = repository();
  writeFileSync(path.join(project, "agent.mjs"), "user change\n", "utf8");
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-run-")), "run");
  assert.throws(
    () => prepareDeliveryWorktree(project, runRoot, "run-dirty"),
    (error) => error instanceof DeliveryWorkspaceError && error.code === "dirty_workspace",
  );
  assert.equal(readFileSync(path.join(project, "agent.mjs"), "utf8"), "user change\n");
});

test("Trial entrypoints are locked before executor changes", () => {
  const project = repository();
  const runRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "pritha-worktree-run-")), "run");
  const prepared = prepareDeliveryWorktree(project, runRoot, "run-lock");
  const captured = captureProtectedTrialInputs(plan(), prepared.worktree, runRoot);
  assert.deepEqual(captured.snapshot.entries.map((entry) => entry.path), ["eval.mjs"]);
  assert.equal(verifyProtectedTrialInputs(captured.snapshot, prepared.worktree).ok, true);

  writeFileSync(path.join(prepared.worktree, "eval.mjs"), "process.exit(0);\n", "utf8");
  const verification = verifyProtectedTrialInputs(captured.snapshot, prepared.worktree);
  assert.equal(verification.ok, false);
  assert.deepEqual(verification.changes, [{ path: "eval.mjs", reason: "content_changed" }]);
});
