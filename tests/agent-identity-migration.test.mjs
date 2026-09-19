import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentInstanceKey, findCatalogAgent, readAgentCatalog, readCatalogArtifact } from "../scripts/agents-mother/identity.mjs";
import { contractFingerprint } from "../scripts/agents-mother/contract.mjs";
import { applyAgentIdentityMigration, planAgentIdentityMigration } from "../scripts/agents-mother/identity-migration.mjs";

function fixture(t) {
  const temp = mkdtempSync(path.join(os.tmpdir(), "pritha-migration-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const options = { root: path.join(temp, "code"), stateRoot: path.join(temp, "state"), memoryRoot: path.join(temp, "state", "agents"), agentParent: path.join(temp, "children") };
  for (const dir of [options.root, options.agentParent, path.join(options.memoryRoot, "contracts"), path.join(options.memoryRoot, "reports")]) mkdirSync(dir, { recursive: true });
  const project = path.join(options.agentParent, "alpha"); mkdirSync(project); writeFileSync(path.join(project, "AGENTS.md"), "# Child\n");
  const contract = path.join(options.memoryRoot, "contracts", "alpha.md");
  writeFileSync(contract, `---\nid: contract-alpha\ntype: agent-contract\nagent_id: alpha\nstatus: accepted\n---\n- Agent name: Alpha\n- Target folder: ${project}\n- Primary mission: Summarize\n`);
  const fp = contractFingerprint(readFileSync(contract, "utf8"));
  const report = path.join(options.memoryRoot, "reports", "report.md");
  const reportText = `---\nid: report-alpha\ntype: agent-delivery-report\nagent_id: alpha\nstatus: blocked\nrelated:\n  agent_contracts:\n    - ../../agents/contracts/alpha.md\n---\n- Contract fingerprint: ${fp}\n- Run id: historic-abandoned\n`;
  writeFileSync(report, reportText);
  const legacyRoot = path.join(options.stateRoot, "execution-workspaces", "historical-workspace");
  return { options, contract, fp, report, reportText, legacyRoot, read: () => readAgentCatalog({ ...options, fresh: true }), plan: () => planAgentIdentityMigration({ ...options, legacyRoots: [legacyRoot] }) };
}

test("reviewed migration binds report IDs and hashes, preserves history, and is idempotent", t => {
  const f = fixture(t);
  const initial = findCatalogAgent(f.read(), "alpha");
  assert.equal(initial.artifacts.length, 1);
  assert.equal(planAgentIdentityMigration(f.options).entries.length, 0, "old execution root must be explicitly supplied");
  const plan = f.plan();
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].contractId, "contract-alpha");
  assert.equal(plan.entries[0].artifactId, "report-alpha");
  assert.equal(plan.entries[0].instanceKey, agentInstanceKey(f.options.stateRoot));
  const applied = applyAgentIdentityMigration(plan, { ...f.options, planLock: plan.planLock, approvedBy: "codex-operator", authorizationBasis: "User requested audit remediation" });
  assert.equal(applied.applied, true);
  assert.equal(readFileSync(f.report, "utf8"), f.reportText);
  const agent = findCatalogAgent(f.read(), "alpha");
  assert.equal(agent.artifacts.length, 2);
  assert.equal(agent.artifacts.find(item => item.path === f.report).fm.status, "blocked");
  assert.equal(readCatalogArtifact(agent, f.report, f.options), f.reportText);
  assert.ok(agent.diagnostics.includes("verified-path-migration-not-approval"));
  const second = applyAgentIdentityMigration(plan, { ...f.options, planLock: plan.planLock, approvedBy: "user" });
  assert.equal(second.replayed, true);
  writeFileSync(f.contract, readFileSync(f.contract, "utf8").replace("Summarize", "New purpose"));
  assert.equal(readCatalogArtifact(agent, f.report, f.options), "");
  assert.equal(findCatalogAgent(f.read(), "alpha").artifacts.length, 1, "contract changes invalidate cached mappings");
});

test("same basename, foreign instance and ambiguous fingerprints never create a migration", t => {
  const f = fixture(t);
  const other = fixture(t);
  writeFileSync(f.report, f.reportText.replace("agent_id: alpha", `agent_id: alpha\ninstance_key: ${agentInstanceKey(other.options.stateRoot)}`));
  assert.equal(f.plan().entries.length, 0);
  assert.equal(f.plan().unresolved[0].reason, "foreign-or-conflicting-identity");
  writeFileSync(f.report, f.reportText.replace("agent_id: alpha", "agent_id: same-basename-other-id"));
  assert.equal(f.plan().entries.length, 0);
  writeFileSync(f.report, f.reportText.replace(f.fp, `sha256:${"0".repeat(64)}`));
  assert.equal(f.plan().entries.length, 0);
  writeFileSync(f.report, f.reportText);
  writeFileSync(path.join(f.options.memoryRoot, "contracts", "copy.md"), readFileSync(f.contract, "utf8"));
  assert.equal(f.plan().entries.length, 0);
  assert.equal(f.plan().unresolved[0].reason, "ambiguous-contract-identity");
});

test("migration rejects stale plans, altered plan contents and a foreign state root", t => {
  const f = fixture(t), other = fixture(t), plan = f.plan();
  assert.throws(() => applyAgentIdentityMigration(plan, { ...f.options, planLock: plan.planLock }), /approval_required/);
  assert.throws(() => applyAgentIdentityMigration({ ...plan, entries: [] }, { ...f.options, planLock: plan.planLock, approvedBy: "user" }), /plan_tampered/);
  assert.throws(() => applyAgentIdentityMigration(plan, { ...other.options, planLock: plan.planLock, approvedBy: "user" }), /plan_mismatch/);
  assert.throws(() => planAgentIdentityMigration({ ...f.options, memoryRoot: other.options.memoryRoot }), /memory_outside_instance/);
  writeFileSync(f.report, `${f.reportText}\nHistorical note.\n`);
  assert.throws(() => applyAgentIdentityMigration(plan, { ...f.options, planLock: plan.planLock, approvedBy: "user" }), /plan_stale/);
});

test("missing project folders remain historical catalog entries", t => {
  const f = fixture(t);
  rmSync(path.join(f.options.agentParent, "alpha"), { recursive: true });
  const historical = findCatalogAgent(f.read(), "alpha");
  assert.equal(historical.catalogPresence, "history");
  assert.equal(historical.projectPath, null);
  assert.equal(historical.artifacts.length, 1);
});

test("malformed stored mapping is diagnosed and never crashes catalog reading", t => {
  const f = fixture(t);
  writeFileSync(path.join(f.options.memoryRoot, "identity-migrations.json"), JSON.stringify({ schema: "pritha-agent-identity-migrations-v1", instanceKey: agentInstanceKey(f.options.stateRoot), entries: [null, {}] }));
  const catalog = f.read();
  assert.ok(catalog.diagnostics.some(item => item.code === "identity-migration-map-invalid"));
  assert.equal(findCatalogAgent(catalog, "alpha").artifacts.length, 1);
});
