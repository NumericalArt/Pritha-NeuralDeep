import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { creationDraftRoot, reconcileCreationArtifacts, approveCreationDocument, creationPrompt } from "../scripts/neuraldeep/agent-creation.mjs";
import { normalizeExternalResearchEvidence, normalizeExternalResearchSynthesis } from "../scripts/agents-mother/external-research.mjs";
import { contractData } from "../scripts/agents-mother/contract.mjs";
import { renderOutcomeSpecFromContract, verifyOutcomeApproval, outcomeSpecFile } from "../scripts/agents-mother/outcome-spec.mjs";

const hash = text => createHash("sha256").update(text).digest("hex");
function fixture(t) {
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-creation-approval-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "code"), stateRoot = path.join(temp, "state"), target = path.join(temp, "children", "alpha");
  const options = { root, stateRoot };
  const draftRoot = creationDraftRoot(stateRoot, "test-instance", "test-chat");
  mkdirSync(root, { recursive: true }); mkdirSync(stateRoot, { recursive: true });
  mkdirSync(path.join(target, "scripts"), { recursive: true }); writeFileSync(path.join(target, "scripts", "smoke-test.mjs"), "console.log('Smoke test passed.');\n");
  const cli = spawnSync(process.execPath, [path.resolve("scripts/pritha.mjs"), "init", "--no-input", "--contract-only", "--name", "Alpha", "--slug", "alpha", "--mission", "Produce a source report", "--success", "An operator receives a report", "--target-folder", target], {
    encoding: "utf8", env: { ...process.env, TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: stateRoot, PRITHA_AGENT_PARENT: path.dirname(target), PRITHA_AGENT_AUTHORING_ROOT: draftRoot },
  });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  let job = { jobId: path.basename(draftRoot), chatId: "test-chat", instanceId: "test-instance", agentId: "alpha", target, draftRoot, releaseSha: "a".repeat(40), revision: 4, phase: "interview", status: "pending", approvals: {}, contract: null, outcome: null, blocker: null };
  job = reconcileCreationArtifacts(job, options);
  assert.equal(job.status, "awaiting_contract_approval");
  const request = kind => ({ requestId: `request_${kind}_123`, expectedRevision: job.revision, action: `approve_${kind}`, actor: "codex-operator", authorizationBasis: "User delegated the controlled UI creation test" });
  const receipt = kind => path.join(stateRoot, "audit", "creation-approvals", job.jobId, `${kind}.json`);
  const outcome = approved => {
    const data = contractData(approved.contract.path, { root });
    const spec = path.join(draftRoot, "contracts", "alpha-outcome.md");
    writeFileSync(spec, renderOutcomeSpecFromContract(data, { date: "2026-09-19", artifactId: "alpha-outcome" }));
    return reconcileCreationArtifacts({ ...approved, status: "pending" }, options);
  };
  return { root, stateRoot, target, options, job, request, receipt, outcome };
}

test("research preparation supplies import commands and a schema accepted by the real evidence validator", t => {
  const f = fixture(t);
  const accepted = approveCreationDocument(f.job, "contract", f.request("contract"), f.options);
  const proposal = f.outcome(accepted);
  const job = approveCreationDocument(proposal, "outcome", f.request("outcome"), f.options);
  const prompt = creationPrompt(job);
  assert.match(prompt, /external-research .* --backend status/);
  assert.match(prompt, /external-research .* --backend manual --input/);
  assert.match(prompt, /printed gate status, not only the command exit code/);
  const match = prompt.match(/```pritha-research-json\n([\s\S]*?)\n```/);
  assert.ok(match, "research should not require discovering the evidence format in source code");
  const payload = JSON.parse(match[1]);
  Object.assign(payload.items[0], { topic_id: "fixture-runtime", source_url: "https://example.com/docs",
    source_title: "Fixture documentation", retrieved_at: new Date().toISOString(),
    claim: "The synthetic fixture supports this contract's HTTP request shape.",
    evidence_summary: "A controlled fixture provides a documented request and failure response.",
    version_context: "Fixture version 1", temporal_compatibility: "Version 1 matches the fixture runtime." });
  Object.assign(payload.synthesis, { memory_comparison: "The controlled source confirms the request boundary described in the local memory fixture.",
    summary: "The current controlled request interface supports the contract requirements.",
    architecture_decision: "Use the documented HTTP shape and retain the explicit local failure boundary.",
    alternatives: ["An offline-only fixture"], tradeoffs: ["HTTP requires explicit failure handling"] });
  const evidence = normalizeExternalResearchEvidence(payload);
  assert.equal(evidence.validCount, 1, JSON.stringify(evidence.items));
  const synthesis = normalizeExternalResearchSynthesis(payload, { evidenceLock: evidence.lock,
    contractFingerprint: contractData(job.contract.path, { root: f.root }).fingerprint,
    requiredTopicIds: ["fixture-runtime"] });
  assert.equal(synthesis.complete, true, JSON.stringify(synthesis.errors));
  delete payload.items[0].retrieved_at;
  assert.equal(normalizeExternalResearchEvidence(payload).validCount, 0, "the guide does not bypass evidence validation");
});

for (const stage of ["intent_recorded", "canonical_written", "receipt_completed"]) {
  test(`contract approval recovers a crash at ${stage} using the original host request`, t => {
    const f = fixture(t), request = f.request("contract"), draftText = f.job.contract.text;
    assert.throws(() => approveCreationDocument(f.job, "contract", request, { ...f.options, onApprovalCheckpoint: checkpoint => { if (checkpoint === stage) throw new Error("simulated crash"); } }), /simulated crash/);
    assert.equal(readFileSync(f.job.contract.path, "utf8"), draftText, "executor draft stays unchanged");
    const before = reconcileCreationArtifacts(f.job, f.options);
    if (stage !== "receipt_completed") assert.equal(before.blocker.code, "creation_approval_incomplete");
    else assert.ok(before.approvals.contract, "completed receipt restores a lost job update");
    const recovered = approveCreationDocument(f.job, "contract", request, f.options);
    assert.equal(recovered.approvals.contract.actor, "codex-operator");
    assert.equal(recovered.approvals.contract.requestId, request.requestId);
    assert.equal(contractData(recovered.contract.path, { root: f.root }).fm.status, "accepted");
    assert.equal(contractData(recovered.contract.path, { root: f.root }).buildTokenBudgetConfirmation, "user");
    assert.equal(recovered.approvals.outcome, undefined);
    assert.equal(readdirSync(path.join(f.stateRoot, "agents", "contracts")).filter(file => file.endsWith(".md")).length, 1);
    assert.equal(JSON.parse(readFileSync(f.receipt("contract"), "utf8")).status, "completed");
    assert.equal(approveCreationDocument(recovered, "contract", request, f.options).contract.hash, recovered.contract.hash);
  });
}

for (const stage of ["canonical_written", "outcome_receipt_written", "receipt_completed"]) {
  test(`Outcome approval recovers ${stage} without borrowing or duplicating approval evidence`, t => {
    const f = fixture(t);
    const accepted = approveCreationDocument(f.job, "contract", f.request("contract"), f.options);
    const proposal = f.outcome(accepted), request = f.request("outcome");
    assert.equal(proposal.status, "awaiting_outcome_approval");
    assert.throws(() => approveCreationDocument(proposal, "outcome", request, { ...f.options, onApprovalCheckpoint: checkpoint => { if (checkpoint === stage) throw new Error("simulated crash"); } }), /simulated crash/);
    const recovered = approveCreationDocument(proposal, "outcome", request, f.options);
    assert.ok(recovered.approvals.contract && recovered.approvals.outcome);
    assert.notEqual(recovered.approvals.contract.requestId, recovered.approvals.outcome.requestId);
    const verified = verifyOutcomeApproval(recovered.outcome.path, f.options);
    assert.equal(verified.ok, true, verified.reasons.join(","));
    assert.equal(verified.event.creation_job_id, f.job.jobId);
    assert.equal(verified.event.request_id, request.requestId);
    assert.equal(verified.event.actor, "codex-operator");
    const eventsFile = path.join(f.stateRoot, "audit", "outcome-approvals.jsonl");
    assert.equal(readFileSync(eventsFile, "utf8").trim().split("\n").length, 1);
    assert.equal(approveCreationDocument(recovered, "outcome", request, f.options).outcome.hash, recovered.outcome.hash);
    assert.equal(readFileSync(eventsFile, "utf8").trim().split("\n").length, 1);
  });
}

test("authored accepted flags and job approval metadata do not substitute for host evidence", t => {
  const f = fixture(t);
  writeFileSync(f.job.contract.path, f.job.contract.text.replace("status: draft", "status: accepted"));
  const proposal = reconcileCreationArtifacts(f.job, f.options);
  assert.ok(proposal.contract.issues.some(issue => issue.includes("действием хоста")));
  assert.throws(() => approveCreationDocument(f.job, "contract", f.request("contract"), f.options), /creation_document_changed|Обновите/);
  const forged = reconcileCreationArtifacts({ ...f.job, approvals: { contract: { hash: f.job.contract.hash, actor: "user" } } }, f.options);
  assert.equal(forged.blocker.code, "creation_approval_receipt_missing");
});

test("approval rechecks reviewed revision, immutable request and exact canonical contents", t => {
  const f = fixture(t), request = f.request("contract");
  assert.throws(() => approveCreationDocument(f.job, "contract", { ...request, expectedRevision: 3 }, f.options), /creation_approval_request_stale/);
  assert.throws(() => approveCreationDocument(f.job, "contract", request, { ...f.options, onApprovalCheckpoint: stage => { if (stage === "canonical_written") throw new Error("crash"); } }), /crash/);
  assert.throws(() => approveCreationDocument(f.job, "contract", { ...request, requestId: "new_request" }, f.options), /Повтор должен/);
  const receipt = JSON.parse(readFileSync(f.receipt("contract"), "utf8"));
  writeFileSync(receipt.destination, readFileSync(receipt.destination, "utf8").replace("Produce a source report", "Different product"));
  assert.throws(() => approveCreationDocument(f.job, "contract", request, f.options), /creation_canonical_document_changed/);
});

test("stale contract, missing Outcome event and executor context cannot authorize continuation", t => {
  const f = fixture(t);
  const accepted = approveCreationDocument(f.job, "contract", f.request("contract"), f.options);
  const ready = approveCreationDocument(f.outcome(accepted), "outcome", f.request("outcome"), f.options);
  rmSync(path.join(f.stateRoot, "audit", "outcome-approvals.jsonl"));
  assert.equal(reconcileCreationArtifacts(ready, f.options).blocker.code, "creation_outcome_host_receipt_missing");
  writeFileSync(ready.contract.path, `${readFileSync(ready.contract.path, "utf8")}\nChanged requirement.\n`);
  assert.equal(reconcileCreationArtifacts(ready, f.options).blocker.code, "creation_approved_document_changed");
  const previous = process.env.PRITHA_AGENT_AUTHORING_ROOT;
  process.env.PRITHA_AGENT_AUTHORING_ROOT = f.job.draftRoot;
  try { assert.throws(() => approveCreationDocument(f.job, "contract", f.request("contract"), f.options), /creation_approval_requires_host/); }
  finally { if (previous === undefined) delete process.env.PRITHA_AGENT_AUTHORING_ROOT; else process.env.PRITHA_AGENT_AUTHORING_ROOT = previous; }
});

test("preexisting canonical file without a host intent cannot be adopted", t => {
  const f = fixture(t);
  const directory = path.join(f.stateRoot, "agents", "contracts"); mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, path.basename(f.job.contract.path));
  writeFileSync(destination, f.job.contract.text.replace("status: draft", "status: accepted"));
  assert.throws(() => approveCreationDocument(f.job, "contract", f.request("contract"), f.options), /Действующий документ/);
  assert.equal(hash(readFileSync(destination, "utf8")), hash(f.job.contract.text.replace("status: draft", "status: accepted")));
});

test("contract approval does not authorize a forged Outcome or revive a cancelled job", t => {
  const f = fixture(t);
  const accepted = approveCreationDocument(f.job, "contract", f.request("contract"), f.options);
  const proposal = f.outcome(accepted);
  const forged = { ...proposal, approvals: { ...proposal.approvals, outcome: { hash: proposal.outcome.hash, actor: "user", requestId: "executor_claim" } } };
  assert.equal(reconcileCreationArtifacts(forged, f.options).blocker.code, "creation_approval_receipt_missing");
  assert.throws(() => approveCreationDocument({ ...proposal, status: "cancelled" }, "outcome", f.request("outcome"), f.options), /creation_approval_request_stale/);
  const replay = approveCreationDocument({ ...accepted, status: "cancelled" }, "contract", f.request("contract"), f.options);
  assert.equal(replay.status, "cancelled");
});

test("Outcome host evidence from another job is rejected even if its content locks match", t => {
  const f = fixture(t);
  const accepted = approveCreationDocument(f.job, "contract", f.request("contract"), f.options);
  const proposal = f.outcome(accepted), request = f.request("outcome");
  assert.throws(() => approveCreationDocument(proposal, "outcome", request, { ...f.options, onApprovalCheckpoint: stage => { if (stage === "outcome_receipt_written") throw new Error("crash"); } }), /crash/);
  const file = path.join(f.stateRoot, "audit", "outcome-approvals.jsonl");
  const event = JSON.parse(readFileSync(file, "utf8").trim());
  event.creation_job_id = "creation_other";
  writeFileSync(file, `${JSON.stringify(event)}\n`);
  assert.throws(() => approveCreationDocument(proposal, "outcome", request, f.options), /creation_outcome_receipt_conflict/);
});

test("read-only receipt recovery preserves pause and cancellation before and after approval completion", t => {
  const f = fixture(t), request = f.request("contract");
  assert.throws(() => approveCreationDocument(f.job, "contract", request, { ...f.options, onApprovalCheckpoint: stage => { if (stage === "canonical_written") throw new Error("crash"); } }), /crash/);
  for (const status of ["paused", "cancelled"]) {
    const incomplete = reconcileCreationArtifacts({ ...f.job, status, autoContinue: false }, f.options);
    assert.equal(incomplete.status, status);
    assert.equal(incomplete.blocker.code, "creation_approval_incomplete");
  }
  const cancelled = approveCreationDocument(reconcileCreationArtifacts({ ...f.job, status: "cancelled", autoContinue: false }, f.options), "contract", request, f.options);
  assert.equal(cancelled.status, "cancelled");
  for (const status of ["paused", "cancelled"]) {
    const restored = reconcileCreationArtifacts({ ...f.job, status, autoContinue: false, blocker: { code: "creation_approval_incomplete", message: "Prior interrupted write" } }, f.options);
    assert.equal(restored.status, status);
    assert.equal(restored.autoContinue, false);
    assert.equal(restored.blocker, null);
    assert.equal(restored.approvals.contract.requestId, request.requestId);
  }
});

test("Outcome authored from an isolated execution checkout keeps its exact contract binding at the host", t => {
  const f = fixture(t), accepted = approveCreationDocument(f.job, "contract", f.request("contract"), f.options);
  const executionRoot = path.join(f.root, "isolated-execution-checkout"); mkdirSync(executionRoot);
  const data = contractData(accepted.contract.path, { root: executionRoot });
  const spec = path.join(f.job.draftRoot, "contracts", "from-execution-outcome.md");
  const authored = renderOutcomeSpecFromContract(data, { date: "2026-09-19", artifactId: "execution-outcome" });
  writeFileSync(spec, authored);
  const proposal = reconcileCreationArtifacts(accepted, f.options);
  assert.equal(proposal.outcome.path, spec);
  assert.deepEqual(proposal.outcome.issues, []);
  assert.equal(proposal.outcome.text, authored);
  const ready = approveCreationDocument(proposal, "outcome", f.request("outcome"), f.options);
  const verified = verifyOutcomeApproval(ready.outcome.path, f.options);
  assert.equal(verified.ok, true, verified.reasons.join(","));
  assert.equal(outcomeSpecFile(ready.outcome.path, f.options).parsed.frontmatter.contract_path, accepted.contract.path);
  assert.equal(readFileSync(spec, "utf8"), authored, "approval does not rebase the operator-reviewed draft");
});
