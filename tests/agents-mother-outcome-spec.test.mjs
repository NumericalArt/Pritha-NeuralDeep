import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveOutcomeSpec,
  compileOutcomeSpec,
  createOutcomeSpec,
  outcomeDocumentLock,
  latestOutcomeSpecForContract,
  outcomeSemanticLock,
  parseOutcomeSpecText,
  reviseOutcomeSpec,
  validateOutcomeSpecText,
  verifyOutcomeApproval,
} from "../scripts/agents-mother/outcome-spec.mjs";

function fixture(contractStatus = "accepted") {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-outcome-spec-"));
  const stateRoot = path.join(root, "runtime-state");
  const contractDir = path.join(root, "11_agents", "contracts");
  mkdirSync(contractDir, { recursive: true });
  const contractPath = path.join(contractDir, "2026-08-16-alpha-agent-contract.md");
  writeFileSync(contractPath, `---
id: 2026-08-16-alpha-agent-contract
type: agent-contract
status: ${contractStatus}
created: 2026-08-16
updated: 2026-08-16
---

# Agent Project Contract: Alpha

## Purpose

- Agent name: Alpha
- Primary mission: Turn a source note into a concise evidence-linked report
- Target user: single operator
- Success criteria: A user can provide a note and receive a report with evidence
- Out of scope: publishing and deployment

## Functional scope

### V1 core functions

- Accept a source note
- Produce an evidence-linked report

### Critical user workflows

- Submit note and review report

## Runtime and interface

- Primary interface: Codex project
- Proactive mode: none

## Data, memory and sources

- Input data types: text notes
- Stored data: Markdown reports
`, "utf8");
  const created = createOutcomeSpec(path.relative(root, contractPath), { root, date: "2026-08-16" });
  return { root, stateRoot, contractPath, specPath: created.path };
}

test("Outcome Spec proposal covers V1 functions and deliverables", () => {
  const { root, specPath } = fixture();
  const text = readFileSync(specPath, "utf8");
  const result = validateOutcomeSpecText(text, { root });

  assert.equal(result.ok, true, result.issues.map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
  assert.equal(result.parsed.trials.length, 3);
  assert.equal(result.automatedTrials, 1);
  assert.equal(result.coverage.length, 4);
  assert.equal(result.coverage.every((entry) => entry.covered), true);
});

test("semantic and document locks ignore approval metadata but not outcome meaning", () => {
  const { specPath } = fixture();
  const draft = readFileSync(specPath, "utf8");
  const metadataOnly = draft
    .replace("status: draft", "status: approved")
    .replace("outcome_spec_status: draft", "outcome_spec_status: approved")
    .replace("approved_by: pending", "approved_by: user")
    .replace("approved_at: pending", "approved_at: 2026-08-16T12:00:00.000Z")
    .replace("review_status: draft", "review_status: accepted");
  const changedOutcome = draft.replace("Accept a source note", "Accept two unrelated source notes");

  assert.equal(outcomeDocumentLock(metadataOnly), outcomeDocumentLock(draft));
  assert.equal(outcomeSemanticLock(metadataOnly), outcomeSemanticLock(draft));
  assert.notEqual(outcomeSemanticLock(changedOutcome), outcomeSemanticLock(draft));
  assert.notEqual(outcomeDocumentLock(changedOutcome), outcomeDocumentLock(draft));
});

test("approval writes exact host evidence outside the executor project", () => {
  const { root, stateRoot, specPath } = fixture();
  const approved = approveOutcomeSpec(specPath, {
    root,
    stateRoot,
    approvedBy: "user",
    approvedAt: "2026-08-16T12:00:00.000Z",
  });
  const verification = verifyOutcomeApproval(specPath, { root, stateRoot });

  assert.equal(verification.ok, true, verification.reasons.join(", "));
  assert.equal(approved.event.semantic_lock, verification.event.semantic_lock);
  assert.equal(approved.evidencePath.startsWith(stateRoot), true);
  assert.equal(approved.evidencePath.includes(path.join("audit", "outcome-approvals.jsonl")), true);
  assert.equal(readFileSync(specPath, "utf8").includes("approved_by: user"), true);
});

test("contract lineage lookup prefers its approved Outcome Spec", () => {
  const { root, stateRoot, contractPath, specPath } = fixture();
  approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-16T12:00:00.000Z" });
  const outcome = latestOutcomeSpecForContract(contractPath, { root });

  assert.equal(outcome.id, "2026-08-16-alpha-agent-outcome-spec");
  assert.equal(outcome.status, "approved");
  assert.equal(outcome.valid, true);
});

test("semantic mutation after approval invalidates locks and approval evidence", () => {
  const { root, stateRoot, specPath } = fixture();
  approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-16T12:00:00.000Z" });
  const approvedText = readFileSync(specPath, "utf8");
  writeFileSync(specPath, approvedText.replace("Accept a source note", "Accept a private source note"), "utf8");

  const validation = validateOutcomeSpecText(readFileSync(specPath, "utf8"), { root });
  const verification = verifyOutcomeApproval(specPath, { root, stateRoot });

  assert.equal(validation.issues.some((entry) => entry.code === "OS015"), true);
  assert.equal(verification.ok, false);
  assert.equal(verification.reasons.includes("os015"), true);
});

test("compiled Trial plan is deterministic and contains no compilation timestamp", () => {
  const { root, stateRoot, specPath } = fixture();
  approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-16T12:00:00.000Z" });
  const first = compileOutcomeSpec(specPath, { root, stateRoot, runId: "fixture-run" });
  const second = compileOutcomeSpec(specPath, { root, stateRoot, runId: "fixture-run" });

  assert.equal(first.text, second.text);
  assert.equal(first.text.includes("compiled_at"), false);
  assert.equal(first.plan.counts.automated, 1);
  assert.equal(first.plan.autonomous_verification_allowed, false);
  assert.deepEqual(first.plan.delivery_policy, {
    build_git_mode: "disposable-worktree",
    build_executor: "codex-cli",
    trial_backend_policy: "local-or-codex-cli",
    max_iterations: 6,
    max_elapsed_ms: 5_400_000,
    max_tokens: 1_000_000,
    token_budget_source: "legacy-default",
    repeated_failure_threshold: 3,
    autonomous_effects_denied: "push, merge, deployment, service enablement, secret provisioning, Outcome Spec mutation, verifier mutation",
    acceptance_policy: "verified is distinct from accepted; operator-judged Trials require explicit user acceptance",
  });
});

test("automated Trial rejects shell execution and traversal cwd", () => {
  const { root, specPath } = fixture();
  const valid = readFileSync(specPath, "utf8");
  const invalid = valid
    .replace('["node", "scripts/smoke-test.mjs"]', '["sh", "-c", "node scripts/smoke-test.mjs"]')
    .replace("- When cwd: .", "- When cwd: ../outside");
  const parsed = parseOutcomeSpecText(invalid);
  const result = validateOutcomeSpecText(invalid, { root });

  assert.equal(parsed.trials[0].argv, null);
  assert.equal(result.issues.some((entry) => entry.code === "OS011"), true);
});

test("approval cannot be self-issued under a different actor label", () => {
  const { root, stateRoot, specPath } = fixture();
  assert.throws(
    () => approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "executor" }),
    /explicit --approved-by user/,
  );
});

test("Outcome Spec approval requires an accepted referenced contract", () => {
  const { root, stateRoot, specPath } = fixture("draft");
  assert.throws(
    () => approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user" }),
    /requires an accepted agent contract/,
  );
});

test("contract revision invalidates previously approved outcome evidence", () => {
  const { root, stateRoot, contractPath, specPath } = fixture();
  approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-16T12:00:00.000Z" });
  const contract = readFileSync(contractPath, "utf8");
  writeFileSync(contractPath, contract.replace("Turn a source note", "Turn two source notes"), "utf8");

  const verification = verifyOutcomeApproval(specPath, { root, stateRoot });
  assert.equal(verification.ok, false);
  assert.equal(verification.reasons.includes("os003"), true);
});

test("user correction creates a new draft revision and supersedes the old approval", () => {
  const { root, stateRoot, specPath } = fixture();
  approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-16T12:00:00.000Z" });
  const approvedText = readFileSync(specPath, "utf8");
  const approved = parseOutcomeSpecText(approvedText);
  const approvedSemanticLock = outcomeSemanticLock(approved);
  const approvedDocumentLock = outcomeDocumentLock(approvedText);

  const revision = reviseOutcomeSpec(specPath, { root, stateRoot, date: "2026-08-17" });
  const previousText = readFileSync(specPath, "utf8");
  const previous = parseOutcomeSpecText(previousText);
  const nextText = readFileSync(revision.path, "utf8");
  const next = parseOutcomeSpecText(nextText);
  const previousApproval = verifyOutcomeApproval(specPath, { root, stateRoot });

  assert.equal(previous.frontmatter.status, "superseded");
  assert.deepEqual(previous.frontmatter.superseded_by, [revision.relPath]);
  assert.equal(outcomeSemanticLock(previous), approvedSemanticLock);
  assert.equal(outcomeDocumentLock(previousText), approvedDocumentLock);
  assert.equal(previous.frontmatter.outcome_semantic_lock, approved.frontmatter.outcome_semantic_lock);
  assert.equal(previous.frontmatter.outcome_document_lock, approved.frontmatter.outcome_document_lock);
  assert.equal(previousApproval.ok, false);
  assert.equal(previousApproval.reasons.includes("spec_not_approved"), true);
  assert.equal(previousApproval.reasons.includes("os015"), false, "supersession is not lock tampering");
  assert.equal(next.frontmatter.status, "draft");
  assert.deepEqual(next.frontmatter.supersedes, [revision.previousRelPath]);
  assert.deepEqual(previous.frontmatter.superseded_by, [revision.relPath]);
  assert.equal(next.frontmatter.outcome_semantic_lock, "pending");
  assert.equal(validateOutcomeSpecText(nextText, { root }).ok, true);

  approveOutcomeSpec(revision.path, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-17T12:00:00.000Z" });
  assert.equal(verifyOutcomeApproval(revision.path, { root, stateRoot }).ok, true);
});
