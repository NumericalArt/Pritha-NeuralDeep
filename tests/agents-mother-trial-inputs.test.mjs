import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec, outcomeDocumentLock, outcomeSemanticLock, parseOutcomeSpecText, preflightOutcomeTrialInputs, validateOutcomeSpecText, verifyOutcomeApproval } from "../scripts/agents-mother/outcome-spec.mjs";
import { inspectProtectedTrialInputs } from "../scripts/agents-mother/delivery-worktree.mjs";
import { FunctionBuildExecutor } from "../scripts/agents-mother/build-executors.mjs";
import { resumeDelivery, runDeliveryLoop } from "../scripts/agents-mother/delivery-loop.mjs";
import { runTrialPlan } from "../scripts/agents-mother/trial-runner.mjs";

const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const correctProduct = "console.log(JSON.stringify({sum:Number(process.argv[2])+Number(process.argv[3])}));\n";
const verifier = `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const [a,b,sum] of JSON.parse(readFileSync('verification/cases.json','utf8'))) {
  const result=spawnSync(process.execPath,['scripts/agent-cli.mjs',String(a),String(b)],{encoding:'utf8',timeout:2000,killSignal:'SIGKILL'});
  assert.equal(result.status,0);
  assert.deepEqual(JSON.parse(result.stdout),{sum});
}
console.log('sum cases passed');
`;

function fixture(t) {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-verifier-inputs-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), project = path.join(parent, "agent");
  const options = { root, stateRoot, projectPath: project }, contracts = path.join(stateRoot, "agents/contracts");
  for (const directory of [root, contracts, path.join(project, "scripts"), path.join(project, "verification")]) mkdirSync(directory, { recursive: true });
  const contract = path.join(contracts, "sum-contract.md");
  writeFileSync(contract, readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${project}`)
    .replace(/^- Primary mission:.*$/m, "- Primary mission: Return the sum of two CLI numbers as JSON")
    .replace(/^- Success criteria:.*$/m, "- Success criteria: The requested sums are returned as JSON")
    .replace(/(### V1 core functions\n)[\s\S]*?(?=\n### )/, "$1\n- Return a JSON sum of two numbers\n"));
  writeFileSync(path.join(project, "AGENTS.md"), "# Synthetic sum agent\n");
  writeFileSync(path.join(project, "verification/check-sum.mjs"), verifier);
  writeFileSync(path.join(project, "verification/cases.json"), "[[2,3,5],[0,-1,-1],[100,4,104]]\n");
  const specPath = createOutcomeSpec(contract, options).path, draft = readFileSync(specPath, "utf8");
  const covers = validateOutcomeSpecText(draft, options).coverage.map(row => `- Covers: ${row.id}`).join("\n");
  const inputs = ["verification/check-sum.mjs", "verification/cases.json"].map(file => ({ path: file, hash: hash(readFileSync(path.join(project, file))), provenance: "host-reviewed:synthetic-sum-v1" }));
  const trial = `## Trials\n\n### Trial: sum-cases\n\n- Statement: CLI returns correct JSON sums for independent cases.\n- Kind: automated\n${covers}\n- Isolation: none\n- When argv: ["node", "verification/check-sum.mjs"]\n- When cwd: .\n- Then exit code: 0\n- Then stdout contains: sum cases passed\n- Product target: scripts/agent-cli.mjs\n- Fixture: verification/cases.json\n${inputs.map(input => `- Verifier input: ${input.path} :: ${input.hash} :: ${input.provenance}`).join("\n")}\n- Timeout ms: 10000\n\n`;
  const text = draft.replace(/## Trials\n[\s\S]*?(?=## Demo script)/, trial);
  writeFileSync(specPath, text);
  git(project, ["init"]); git(project, ["config", "user.name", "Pritha Tests"]); git(project, ["config", "user.email", "tests@pritha.local"]);
  git(project, ["add", "."]); git(project, ["commit", "-m", "host reviewed verifier"]);
  const approve = () => approveOutcomeSpec(specPath, { ...options, approvedBy: "user" });
  const compile = runId => compileOutcomeSpec(specPath, { ...options, runId });
  return { parent, root, stateRoot, project, options, specPath, text, draft, inputs, approve, compile };
}

test("readonly public preflight and approval lock verifier provenance while allowing a missing product", t => {
  const f = fixture(t), before = readFileSync(f.specPath, "utf8");
  const result = preflightOutcomeTrialInputs(f.specPath, f.options);
  assert.equal(result.status, "ready", JSON.stringify(result.issues));
  assert.equal(result.executesCommands, false); assert.equal(result.writesFiles, false);
  assert.deepEqual(result.inputs.map(row => row.path), f.inputs.map(row => row.path).sort());
  assert.equal(result.inputs.every(row => row.hash === row.declared_hash && row.provenance === f.inputs[0].provenance), true);
  assert.equal(existsSync(path.join(f.project, "scripts/agent-cli.mjs")), false);
  const env = { ...process.env, TECHSCOPE_ROOT: f.root, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_PARENT: f.parent };
  const cli = JSON.parse(execFileSync(process.execPath, ["scripts/pritha.mjs", "outcome", "preflight", f.specPath, "--project", f.project], { encoding: "utf8", env }));
  assert.equal(cli.status, "ready"); assert.equal(cli.semanticLock, result.semanticLock);
  assert.equal(readFileSync(f.specPath, "utf8"), before);
  f.approve(); const { plan } = f.compile("approved");
  assert.deepEqual(plan.trials[0].verifierInputs, f.inputs);
  assert.equal(verifyOutcomeApproval(f.specPath, f.options).ok, true);
  assert.equal(existsSync(path.join(f.stateRoot, "builds", plan.agent_slug, "approved", "protected-trial-inputs.json")), false);
});

test("independent verifier rejects missing, stub and wrong products and accepts correct CLI output", async t => {
  const f = fixture(t); f.approve(); const { plan } = f.compile("negative-control");
  const run = () => runTrialPlan(plan, f.options);
  assert.equal((await run()).result.verification_status, "failed");
  for (const product of ["console.log('READY');\n", "console.log(JSON.stringify({sum:0}));\n"]) {
    writeFileSync(path.join(f.project, "scripts/agent-cli.mjs"), product);
    assert.equal((await run()).result.verification_status, "failed");
  }
  writeFileSync(path.join(f.project, "scripts/agent-cli.mjs"), correctProduct);
  assert.equal((await run()).result.verification_status, "verified");
  assert.equal(readFileSync(path.join(f.project, "verification/check-sum.mjs"), "utf8"), verifier);
});

test("approved delivery builds a missing product while keeping the reviewed verifier outside executor ownership", async t => {
  const f = fixture(t); f.approve(); const compiled = f.compile("build-product");
  let calls = 0;
  const executor = new FunctionBuildExecutor(async ({ worktree }) => {
    calls++; mkdirSync(path.join(worktree, "scripts"), { recursive: true }); writeFileSync(path.join(worktree, "scripts/agent-cli.mjs"), correctProduct);
    return { summary: "implemented CLI sum", changed_files: ["scripts/agent-cli.mjs"] };
  });
  const result = await runDeliveryLoop({ ...f.options, ...compiled, buildExecutor: executor, trialBackend: "local", reportDir: false });
  assert.equal(result.state.status, "verified", JSON.stringify(result.state.blockers)); assert.equal(calls, 1);
  assert.equal(existsSync(path.join(f.project, "scripts/agent-cli.mjs")), false);
  const snapshot = JSON.parse(readFileSync(path.join(compiled.runRoot, "protected-trial-inputs.json"), "utf8"));
  assert.equal(snapshot.entries.length, 2); assert.equal(snapshot.entries.every(row => row.declared_hash === row.hash), true);
  assert.equal(git(result.worktree.worktree, ["status", "--porcelain"]), "");
});

test("missing or replaced verifier stops before build probe and standalone Trial execution", async t => {
  const f = fixture(t); f.approve(); const compiled = f.compile("missing-verifier");
  rmSync(path.join(f.project, "verification/check-sum.mjs")); git(f.project, ["add", "."]); git(f.project, ["commit", "-m", "missing verifier fixture"]);
  let calls = 0;
  const executor = { probe() { calls++; throw new Error("must not probe"); }, execute() { calls++; throw new Error("must not build"); } };
  const result = await runDeliveryLoop({ ...f.options, ...compiled, buildExecutor: executor, reportDir: false });
  assert.equal(result.state.status, "blocked"); assert.equal(result.state.blockers[0].code, "trial_input_missing"); assert.equal(calls, 0);
  writeFileSync(path.join(f.project, "verification/check-sum.mjs"), "console.log('sum cases passed');\n");
  await assert.rejects(runTrialPlan(compiled.plan, { ...f.options, backend: executor }), error => error.code === "trial_input_provenance_mismatch");
  assert.equal(calls, 0);
  // Restore reviewed bytes in the owned candidate and verify without reopening
  // a model turn or changing this run's approval/history.
  writeFileSync(path.join(result.worktree.worktree, "verification/check-sum.mjs"), verifier);
  mkdirSync(path.join(result.worktree.worktree, "scripts"), { recursive: true });
  writeFileSync(path.join(result.worktree.worktree, "scripts/agent-cli.mjs"), correctProduct);
  const resumed = await resumeDelivery(compiled.runId, { ...f.options, hostOnly: true, buildExecutor: executor, trialBackend: "local", reportDir: false });
  assert.equal(resumed.state.status, "verified", JSON.stringify(resumed.state.blockers)); assert.equal(calls, 0);
  assert.match(readFileSync(path.join(compiled.runRoot, "events.jsonl"), "utf8"), /trial_input_missing/);
});

test("declarations reject unsafe paths, overlapping ownership and symlinked verifier ancestors before approval", t => {
  const f = fixture(t);
  for (const changed of [
    f.text.replace("- Product target: scripts/agent-cli.mjs", "- Product target: verification"),
    f.text.replace("host-reviewed:synthetic-sum-v1", "unknown"),
    f.text.replace("- Verifier input: verification/check-sum.mjs", "- Verifier input: ../outside"),
    f.text.replace(f.inputs[0].hash, "sha256:bad"),
  ]) assert.equal(validateOutcomeSpecText(changed, f.options).issues.some(issue => issue.code === "OS020"), true);
  renameSync(path.join(f.project, "verification"), path.join(f.parent, "outside"));
  symlinkSync(path.join(f.parent, "outside"), path.join(f.project, "verification"), "dir");
  assert.throws(f.approve, error => error.code === "trial_input_invalid");
  assert.equal(readFileSync(f.specPath, "utf8"), f.text);
  assert.equal(existsSync(path.join(f.stateRoot, "audit/outcome-approvals.jsonl")), false);
});

test("standalone Trial cannot publish passing evidence after its backend changes a protected input", async t => {
  const f = fixture(t); f.approve(); const compiled = f.compile("changed-during-trial");
  const backend = {
    name: "synthetic-mutating-backend",
    async execute() {
      writeFileSync(path.join(f.project, "verification/check-sum.mjs"), "console.log('sum cases passed');\n");
      return { exitCode: 0, stdout: "sum cases passed", stderr: "", durationMs: 1, isolation: "none" };
    },
  };
  await assert.rejects(runTrialPlan(compiled.plan, { ...f.options, backend, runRoot: compiled.runRoot }), /Protected Trial inputs changed/);
  assert.equal(existsSync(path.join(compiled.runRoot, "trial-result.json")), false);
});

test("direct product assertions allow a missing executable but cannot waive a protected verifier elsewhere", t => {
  const f = fixture(t);
  const direct = { kind: "automated", id: "direct", cwd: "scripts", argv: ["node", "agent-cli.mjs"], productTargets: ["scripts/agent-cli.mjs"], thenStdoutContains: ["sum"] };
  assert.deepEqual(inspectProtectedTrialInputs({ trials: [direct] }, f.project), []);
  assert.throws(() => inspectProtectedTrialInputs({ trials: [{ ...direct, thenStdoutContains: [] }] }, f.project), error => error.code === "trial_input_declaration_invalid");
  const protectedTrial = { ...direct, productTargets: [], argv: ["node", "../verification/check-sum.mjs"], verifierInputs: [{ ...f.inputs[0], path: "scripts/agent-cli.mjs" }] };
  assert.throws(() => inspectProtectedTrialInputs({ trials: [direct, protectedTrial] }, f.project), error => error.code === "trial_input_declaration_conflict");
  assert.throws(() => inspectProtectedTrialInputs({ trials: [{ ...direct, productTargets: [123] }] }, f.project), error => error.code === "trial_input_declaration_invalid");
  const tooMany = Array.from({ length: 257 }, (_, index) => ({ id: `input-${index}`, kind: "automated", argv: ["node", `verifier-${index}.mjs`] }));
  assert.throws(() => inspectProtectedTrialInputs({ trials: tooMany }, f.project), error => error.code === "trial_input_inventory_too_large");
});

test("structured automated Trial waiver binds user, reason and operator scope in the same approved field", async t => {
  const f = fixture(t);
  const original = parseOutcomeSpecText(f.draft), scope = original.trials.map(trial => trial.id);
  const waiver = { actor: "user", reason: "The operator must judge the demonstration against the written rubric.", scope };
  const withWaiver = f.draft.replace("automated_trial_waiver: none", `automated_trial_waiver:\n  actor: user\n  reason: ${waiver.reason}\n  scope:\n${scope.map(id => `    - ${id}`).join("\n")}`)
    .replace("- Kind: automated", "- Kind: operator-judged\n- Pass criteria: The operator observes a correct completed demonstration.");
  writeFileSync(f.specPath, withWaiver);
  assert.equal(validateOutcomeSpecText(withWaiver, f.options).ok, true);
  f.approve(); const { plan } = f.compile("waived");
  assert.deepEqual(plan.automated_trial_waiver, waiver); assert.equal(plan.autonomous_verification_allowed, false);
  assert.equal((await runTrialPlan(plan, f.options)).result.verification_status, "awaiting_acceptance");
  assert.notEqual(outcomeSemanticLock(withWaiver), outcomeSemanticLock(withWaiver.replace(waiver.reason, "A different operator judgment is required for this scope.")));
  for (const changed of [withWaiver.replace("actor: user", "actor: assistant"), withWaiver.replace(`    - ${scope[0]}`, "    - missing-trial"), withWaiver.replace(waiver.reason, "none")]) {
    assert.equal(validateOutcomeSpecText(changed, f.options).issues.some(issue => issue.code === "OS021"), true);
  }
});

test("legacy waiver meaning and absent Trial declarations preserve v1 locks and never imply autonomous verification", async t => {
  const f = fixture(t);
  assert.equal(Object.hasOwn(parseOutcomeSpecText(f.draft).trials[0], "verifierInputs"), false);
  const legacy = f.draft.replace("automated_trial_waiver: none", "automated_trial_waiver: The user requires operator judgment");
  assert.equal(validateOutcomeSpecText(legacy, f.options).issues.some(issue => issue.code === "OS021"), true);
  let approved = legacy.replace("status: draft", "status: approved").replace("outcome_spec_status: draft", "outcome_spec_status: approved")
    .replace("approved_by: pending", "approved_by: user").replace("approved_at: pending", "approved_at: 2026-09-06T12:00:00Z")
    .replace("outcome_semantic_lock: pending", `outcome_semantic_lock: ${outcomeSemanticLock(legacy)}`);
  approved = approved.replace("outcome_document_lock: pending", `outcome_document_lock: ${outcomeDocumentLock(approved)}`);
  assert.equal(validateOutcomeSpecText(approved, f.options).issues.some(issue => issue.code === "OS021"), false);
  // Compatibility is a read property; a handcrafted label is never approval evidence.
  writeFileSync(f.specPath, approved); assert.equal(verifyOutcomeApproval(f.specPath, f.options).ok, false);
  writeFileSync(f.specPath, f.text); f.approve(); const { plan } = f.compile("waiver-runtime");
  writeFileSync(path.join(f.project, "scripts/agent-cli.mjs"), correctProduct);
  for (const automated_trial_waiver of ["The user requires operator judgment", { actor: "user", reason: "Manual judgment remains necessary", scope: ["manual"] }]) {
    const result = await runTrialPlan({ ...plan, automated_trial_waiver, autonomous_verification_allowed: true }, f.options);
    assert.equal(result.result.verification_status, "awaiting_acceptance");
    writeFileSync(path.join(f.project, "scripts/agent-cli.mjs"), "console.log('{}');\n");
    assert.equal((await runTrialPlan({ ...plan, automated_trial_waiver }, f.options)).result.verification_status, "failed");
    writeFileSync(path.join(f.project, "scripts/agent-cli.mjs"), correctProduct);
  }
});
