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
  const projectInputs = [
    ["scripts/smoke-test.mjs", "console.log('smoke:ok');\n"],
  ];
  for (const [relativePath, content] of projectInputs) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
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
  assert.equal(text.includes("Trial field dictionary"), true);
  assert.equal(text.includes("### Trial: data-shape"), false, "Generic contracts do not imply a JSON schema");
  assert.equal(text.includes("### Trial: live-path"), false, "Generic contracts do not imply an upstream adapter");
  assert.equal(result.parsed.trials.filter(trial => trial.kind === "operator-judged").length, 2);
});

test("web app proposals carry the product journey and every contract success criterion without authoring repairs", () => {
  const f = fixture();
  const appContract = path.join(path.dirname(f.contractPath), "web-app-contract.md");
  const workflow = "Open the reading list, refresh public RSS and export the selected Russian digest";
  const success = "Both feeds refresh without duplicates; SQLite survives restart; disabled provider preserves earlier digests";
  writeFileSync(appContract, readFileSync(f.contractPath, "utf8")
    .replace("type: agent-contract", "type: agent-contract\ninterview_preset: llm-app\noutcome_trial_preset: llm-http-app-v1")
    .replace("Agent name: Alpha", "Agent name: Reading Desk")
    .replace("Primary interface: Codex project", "Primary interface: web\n- Service mode: process")
    .replace("Submit note and review report", workflow)
    .replace("A user can provide a note and receive a report with evidence", success));
  const spec = createOutcomeSpec(appContract, { root: f.root });
  const text = readFileSync(spec.path, "utf8");
  const result = validateOutcomeSpecText(text, { root: f.root });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.match(result.parsed.userFacing.journey.start, /Open.*web/);
  assert.equal(result.parsed.userFacing.journey.goal, "Turn a source note into a concise evidence-linked report");
  assert.ok(text.includes(workflow));
  assert.ok(result.parsed.trials.some(t => t.kind === "operator-judged" && t.passCriteria === success));
  assert.equal(result.parsed.deliverables.length, 2, "product detail must not change coverage identities");
  assert.equal(result.coverage.every(entry => entry.covered), true);
  const verifier = result.parsed.trials.find(t => t.id === "preset-behavior");
  assert.ok(verifier, "host functional verifier remains mandatory");
  assert.equal(verifyOutcomeApproval(spec.path, { root: f.root, stateRoot: f.stateRoot }).ok, false);
  writeFileSync(spec.path, text.replace("## Shape", "An operator-authored clarification.\n\n## Shape"));
  assert.equal(createOutcomeSpec(appContract, { root: f.root }).path, spec.path);
  assert.ok(readFileSync(spec.path, "utf8").includes("An operator-authored clarification."));
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

test("validator prints allowed enum values in status messages", () => {
  const { root, specPath } = fixture();
  const text = readFileSync(specPath, "utf8");
  const invalid = text
    .replace("status: draft", "status: banana")
    .replace("outcome_spec_status: draft", "outcome_spec_status: banana");
  const result = validateOutcomeSpecText(invalid, { root });

  assert.equal(result.issues.some((entry) => entry.code === "OS002"), true);
  assert.equal(
    result.issues.some((entry) => entry.code === "OS002" && entry.message.includes("allowed:") && entry.message.includes("draft")),
    true,
    result.issues.map((entry) => `${entry.code}: ${entry.message}`).join("\n"),
  );
});

test("shared Then artifact asserted by two automated trials fails validation", () => {
  const { root, specPath } = fixture();
  const valid = readFileSync(specPath, "utf8");
  const appended = valid.replace(
    "## Demo script",
    `### Trial: shared-assert-a

- Statement: First trial asserts the shared artifact.
- Kind: automated
- Covers: deliverable:02-runnable-project-with-a-user-guide-and-verification-evidence
- Isolation: none
- When argv: ["node", "scripts/smoke-test.mjs"]
- Then exit code: 0
- Then artifact: data/shared.json
- Timeout ms: 120000

### Trial: shared-assert-b

- Statement: Second trial asserts the same shared artifact.
- Kind: automated
- Covers: deliverable:02-runnable-project-with-a-user-guide-and-verification-evidence
- Isolation: none
- When argv: ["node", "scripts/smoke-test.mjs"]
- Then exit code: 0
- Then artifact: data/shared.json
- Timeout ms: 120000

## Demo script`,
  );
  const result = validateOutcomeSpecText(appended, { root });
  const shared = result.issues.find((entry) => entry.code === "OS022");

  assert.notEqual(shared, undefined, "expected OS022 shared_asserted_artifact issue");
  assert.equal(result.issues.some((entry) => entry.code === "OS022" && entry.message.includes("shared_asserted_artifact") && entry.message.includes("data/shared.json")), true, result.issues.map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
});

test("product target colliding with a protected fixture fails validation", () => {
  const { root, specPath } = fixture();
  const valid = readFileSync(specPath, "utf8");
  const conflicted = valid.replace(
    "- Timeout ms: 120000",
    `- Timeout ms: 120000
- Product target: tests/fixtures/x.json
- Fixture: tests/fixtures/x.json`,
  );
  const result = validateOutcomeSpecText(conflicted, { root });
  const conflict = result.issues.find((entry) => entry.code === "OS023");

  assert.notEqual(conflict, undefined, "expected OS023 trial_input_protected_conflict issue");
  assert.equal(conflict.message.includes("trial_input_protected_conflict"), true, conflict.message);
});

test("approval evidence accepts host-known workspace roots, not matching basenames", () => {
  const { root, stateRoot, specPath } = fixture();
  approveOutcomeSpec(specPath, { root, stateRoot, approvedBy: "user", approvedAt: "2026-08-16T12:00:00.000Z" });
  const evidencePath = path.join(stateRoot, "audit", "outcome-approvals.jsonl");
  const event = JSON.parse(readFileSync(evidencePath, "utf8").trim());
  const workspaceRoot = path.join(root, "workspaces", "task");
  mkdirSync(workspaceRoot, { recursive: true });
  event.spec_path = path.relative(workspaceRoot, specPath);
  writeFileSync(evidencePath, `${JSON.stringify(event)}\n`);
  assert.equal(verifyOutcomeApproval(specPath, { root, stateRoot }).ok, false);
  const verification = verifyOutcomeApproval(specPath, { root, stateRoot, sourceRoot: workspaceRoot });
  assert.equal(verification.ok, true, verification.reasons.join(", "));
  event.spec_path = `unrelated/${path.basename(specPath)}`;
  writeFileSync(evidencePath, `${JSON.stringify(event)}\n`);
  assert.equal(verifyOutcomeApproval(specPath, { root, stateRoot, sourceRoot: workspaceRoot }).ok, false);
});

test("outcome init preserves authored draft bytes even when the contract changes", () => {
  const f = fixture();
  const authored = `${readFileSync(f.specPath, "utf8")}\n## Operator requirement\n\nPreserve the user's export naming requirement.\n`;
  writeFileSync(f.specPath, authored);
  writeFileSync(f.contractPath, readFileSync(f.contractPath, "utf8").replace("- Produce an evidence-linked report", "- Produce an evidence-linked report\n- Return a usage path"));
  const existing = createOutcomeSpec(path.relative(f.root, f.contractPath), { root: f.root, date: "2026-08-17" });
  assert.equal(existing.path, f.specPath);
  assert.equal(existing.unchanged, true);
  assert.equal(readFileSync(f.specPath, "utf8"), authored);
  assert.ok(existing.issues.some(issue => issue.code === "OS003"), "changed contract requires explicit review");
});

test("outcome init preserves approval and returns the same artifact", () => {
  const f = fixture();
  approveOutcomeSpec(f.specPath, { ...f, approvedBy: "user" });
  const approved = readFileSync(f.specPath, "utf8");
  const existing = createOutcomeSpec(f.contractPath, { root: f.root, date: "2026-09-19" });
  assert.equal(existing.path, f.specPath);
  assert.equal(existing.unchanged, true);
  assert.equal(readFileSync(f.specPath, "utf8"), approved);
  assert.equal(verifyOutcomeApproval(f.specPath, f).ok, true);
});

test("equal contract contents in another path do not borrow outcome identity", () => {
  const f = fixture();
  const otherContract = path.join(path.dirname(f.contractPath), "other-contract.md");
  writeFileSync(otherContract, readFileSync(f.contractPath, "utf8"));
  assert.equal(latestOutcomeSpecForContract(otherContract, { root: f.root }), null);
});

test("delegated approval records the actual operator and scope without changing authority", () => {
  const f = fixture();
  assert.throws(() => approveOutcomeSpec(f.specPath, { ...f, approvedBy: "user", actor: "codex-operator" }), /authorization basis/);
  const result = approveOutcomeSpec(f.specPath, { ...f, approvedBy: "user", actor: "codex-operator", authorizationBasis: "User delegated the local UI trial for this exact scope", requestId: "request-1", jobId: "creation-1" });
  assert.equal(result.event.actor, "codex-operator");
  assert.equal(result.event.approved_by, "user");
  assert.equal(result.event.creation_job_id, "creation-1");
  assert.equal(result.event.request_id, "request-1");
  assert.equal(verifyOutcomeApproval(f.specPath, f).ok, true);
});

test("selected preset adds an independent locked verifier and approval blocks when it is missing", () => {
  const f = fixture();
  const presetContract = path.join(path.dirname(f.contractPath), "preset-contract.md");
  writeFileSync(presetContract, readFileSync(f.contractPath, "utf8").replace("type: agent-contract", "type: agent-contract\noutcome_trial_preset: llm-http-app-v1"));
  const spec = createOutcomeSpec(presetContract, { root: f.root });
  const value = validateOutcomeSpecText(readFileSync(spec.path, "utf8"), { root: f.root });
  assert.equal(value.ok, true, JSON.stringify(value.issues));
  const trial = value.parsed.trials.find(entry => entry.id === "preset-behavior");
  assert.match(trial.verifierInputs[0].hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(trial.verifierInputs[0].provenance, "host-template:llm-http-app-v1");
  assert.throws(() => approveOutcomeSpec(spec.path, { ...f, projectPath: f.root, approvedBy: "user" }), /missing/);
  const weakened = readFileSync(spec.path, "utf8").replace('["node", "tests/trials/pritha-outcome-verifier.mjs", "llm-http-app-v1"]', '["node", "scripts/smoke-test.mjs"]');
  assert.ok(validateOutcomeSpecText(weakened, { root: f.root }).issues.some(issue => issue.code === "OS024"));
});
