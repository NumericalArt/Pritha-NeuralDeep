import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";
import { AGENT_KINDS, operationsApplicability, proposeAgentKind, readAgentKind } from "../scripts/agents-mother/agent-kind.mjs";
import { contractData, contractFingerprint, validateContract } from "../scripts/agents-mother/contract.mjs";
import { agentOperationsApplicability, findCatalogAgent, readAgentCatalog } from "../scripts/agents-mother/identity.mjs";
import { checkCardReadiness } from "../scripts/agents-mother/card-readiness.mjs";
import { parseFrontmatterData } from "../scripts/lib/frontmatter.mjs";
import { approveOutcomeSpec, compileOutcomeSpec, createOutcomeSpec } from "../scripts/agents-mother/outcome-spec.mjs";

const legacy = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8");
const typed = (kind, text = legacy) => text.replace("type: agent-contract", `type: agent-contract\ncontract_schema_version: 2\nagent_kind: ${kind}`);
function fixture(t, kind = "one-shot-cli") {
  const parent = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-agent-kind-")));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, "mother"), stateRoot = path.join(parent, "state"), agentParent = path.join(parent, "children"), memoryRoot = path.join(stateRoot, "agents"), project = path.join(agentParent, "product");
  for (const dir of [root, project, ...["contracts", "profiles", "reports"].map(name => path.join(memoryRoot, name))]) mkdirSync(dir, { recursive: true });
  const contract = path.join(memoryRoot, "contracts/product.md");
  const text = (kind ? typed(kind) : legacy).replace("type: agent-contract", "type: agent-contract\nagent_id: kind-fixture")
    .replace(/^- Target folder:.*$/m, `- Target folder: ${project}`);
  writeFileSync(contract, text);
  const options = { root, stateRoot, memoryRoot, agentParent, baseUrl: false, fresh: true };
  return { ...options, options, project, contract, text, record: () => findCatalogAgent(readAgentCatalog(options), "kind-fixture") };
}

test("v2 result types roundtrip through the real contract validator and catalog", t => {
  for (const kind of AGENT_KINDS) {
    const f = fixture(t, kind);
    assert.deepEqual(validateContract(f.contract, { ...f.options, print: false }), []);
    assert.equal(contractData(f.contract, f.options).agentKind.kind, kind);
    assert.equal(f.record().agentKind.kind, kind);
    assert.equal(f.record().contractSource, f.contract);
    assert.equal(readFileSync(f.contract, "utf8"), f.text, "reading never migrates accepted text");
  }
});

test("legacy classification is advisory and preserves the existing semantic fingerprint", t => {
  assert.equal(contractFingerprint(legacy), "sha256:bb22ae52802aa517e93160900ce98e6f4075386b95b706c7814fb417d81f26eb");
  const f = fixture(t, null);
  const before = contractFingerprint(f.text);
  const result = contractData(f.contract, f.options);
  assert.equal(result.agentKind.kind, "legacy-unclassified");
  assert.equal(result.agentKind.status, "legacy");
  assert.equal(result.agentKind.suggestedKind, "interactive-agent");
  assert.equal(contractFingerprint(readFileSync(f.contract, "utf8")), before);
  assert.equal(readAgentKind().suggestedKind, null);
  assert.equal(readAgentKind(legacy.replace("- Primary interface: Codex project", "- Primary interface: unrelated-interface")).suggestedKind, null);
  assert.equal(readAgentKind(legacy.replace("- Primary interface: Codex project", "- Primary interface: CLI")).suggestedKind, "one-shot-cli");
  assert.notEqual(contractFingerprint(typed("library", f.text)), before, "a type change is a semantic revision requiring fresh approval");
});

test("v2 type changes invalidate existing Outcome approval while Trial plan v1 keeps its wire format", t => {
  const f = fixture(t);
  const spec = createOutcomeSpec(f.contract, f.options).path;
  approveOutcomeSpec(spec, { ...f.options, approvedBy: "user" });
  const { plan } = compileOutcomeSpec(spec, f.options);
  assert.equal(plan.contract_fingerprint, contractFingerprint(f.text));
  assert.equal(plan.agent_kind, undefined);
  assert.equal(plan.agent_id, undefined);
  writeFileSync(f.contract, f.text.replace("agent_kind: one-shot-cli", "agent_kind: library"));
  assert.throws(() => compileOutcomeSpec(spec, f.options), /contract|fingerprint|integrity/i);
});

test("unknown versions, missing types and duplicate schema fields fail without reflecting unsafe input", t => {
  const f = fixture(t);
  const secret = `ghp_${"x".repeat(25)}`;
  for (const text of [typed(secret), typed("library").replace("agent_kind: library\n", ""), typed("library").replace("contract_schema_version: 2", "contract_schema_version: 99"), typed("library").replace("contract_schema_version: 2", "contract_schema_version: [2]"), typed("library").replace("contract_schema_version: 2\n", ""), typed("library").replace("agent_kind: library", "agent_kind: library\nagent_kind: one-shot-cli")]) {
    writeFileSync(f.contract, text);
    const kind = readAgentKind(text);
    assert.equal(kind.status, "invalid");
    assert.doesNotMatch(JSON.stringify(kind), /ghp_/);
    assert.ok(validateContract(f.contract, { ...f.options, print: false }).some(issue => issue.startsWith("agent type:")));
    assert.equal(operationsApplicability(text).status, "invalid-contract");
  }
});

test("interview writes v2 type proposals while preserving separate draft Outcome approval", t => {
  const f = fixture(t);
  for (const [name, flags, expected] of [["interactive", [], "interactive-agent"], ["headless", ["--interface", "headless"], "one-shot-cli"], ["module", ["--agent-kind", "library"], "library"]]) {
    const result = spawnSync(process.execPath, ["scripts/pritha.mjs", "interview", "--no-input", "--name", name, "--mission", "Provide a deterministic fixture result", ...flags], {
      encoding: "utf8", timeout: 8000, env: { ...process.env, TECHSCOPE_ROOT: f.root, PRITHA_STATE_ROOT: f.stateRoot, PRITHA_AGENT_PARENT: f.agentParent },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const contracts = readdirSync(path.dirname(f.contract)).filter(file => file.includes(name));
    const text = readFileSync(path.join(path.dirname(f.contract), contracts.find(file => file.endsWith("-agent-contract.md"))), "utf8");
    assert.equal(readAgentKind(text).kind, expected);
    assert.equal(parseFrontmatterData(text).status, "draft");
    const outcome = readFileSync(path.join(path.dirname(f.contract), contracts.find(file => file.endsWith("-agent-outcome-spec.md"))), "utf8");
    assert.equal(parseFrontmatterData(outcome).outcome_spec_status, "draft");
  }
  assert.throws(() => proposeAgentKind({ agentKind: "unknown" }), /invalid agent_kind/);
});

test("operations requirements follow selected capabilities independently of every result type", t => {
  for (const kind of AGENT_KINDS) {
    const f = fixture(t, kind);
    assert.equal(agentOperationsApplicability(f.record(), null, f.options).manifestRequired, false);
    writeFileSync(f.contract, f.text.replace("- Service mode: none", "- Service mode: launchd"));
    assert.equal(agentOperationsApplicability(f.record(), null, f.options).manifestRequired, true);
    writeFileSync(f.contract, f.text.replace("- Proactive mode: none", "- Proactive mode: scheduled"));
    assert.equal(agentOperationsApplicability(f.record(), null, f.options).manifestRequired, true);
  }
  assert.equal(operationsApplicability(typed("one-shot-cli"), { control_center_managed: true }).manifestRequired, true);
  assert.equal(operationsApplicability(typed("one-shot-cli").replace("status: accepted", "status: draft")).manifestRequired, null);
  assert.equal(operationsApplicability("").manifestRequired, null);
});

test("CLI without a manifest has card readiness without inventing Outcome verification", async t => {
  for (const kind of ["one-shot-cli", "library", null]) {
    const f = fixture(t, kind);
    const result = await checkCardReadiness("kind-fixture", f.options);
    assert.equal(result.status, "ready");
    assert.equal(result.manifestPresent, false);
    assert.equal(result.operationsApplicability.status, "not-required");
    assert.equal(result.readinessScope, "card-configuration-only");
    assert.equal(result.lifecycle.outcome.approved, false);
    assert.equal(result.lifecycle.delivery.status, "not-started");
    writeFileSync(f.contract, f.text.replace("- Service mode: none", "- Service mode: launchd"));
    const missing = await checkCardReadiness("kind-fixture", f.options);
    assert.equal(missing.status, "blocked");
    assert.match(missing.blockers.join("\n"), /selected operations/);
  }
});

test("unsafe or corrupt present manifests remain explicit failures even when operations are optional", async t => {
  const f = fixture(t);
  const manifest = path.join(f.project, "operations/manifest.json");
  mkdirSync(path.dirname(manifest));
  for (const text of ["{", "[]", "null"]) {
    writeFileSync(manifest, text);
    assert.equal((await checkCardReadiness("kind-fixture", f.options)).status, "blocked");
  }
  rmSync(manifest);
  const foreign = path.join(f.root, "foreign.json"); writeFileSync(foreign, '{"service_mode":"none"}');
  symlinkSync(foreign, manifest);
  const result = await checkCardReadiness("kind-fixture", f.options);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /unsafe to read/);
});

test("profile and report labels cannot override the authored contract result type", t => {
  const f = fixture(t);
  for (const type of ["child-agent-profile", "agent-test-report"]) {
    writeFileSync(path.join(f.memoryRoot, type.endsWith("profile") ? "profiles/fake.md" : "reports/fake.md"), `---\ntype: ${type}\nagent_id: kind-fixture\nagent_kind: service\nupdated: 2099-01-01\n---\n`);
  }
  assert.equal(f.record().agentKind.kind, "one-shot-cli");
  assert.equal(agentOperationsApplicability(f.record(), null, f.options).manifestRequired, false);
});

test("production readiness adapter skips irrelevant service probes and preserves selected-operation blockers", async () => {
  const source = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");
  const tree = ts.createSourceFile("server.ts", source, ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "operationalReadiness");
  const compiled = ts.transpileModule(`const operationalRuntimeManager=()=>null; const launchdRuntimeState=()=>{throw new Error('unexpected service probe')}; ${fn.getText(tree)}; export { operationalReadiness };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const { operationalReadiness } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const params = { folderPresent: true, manifest: null, operations: "not_installed", health: { status: "not_checked" }, access: {} };
  const cli = await operationalReadiness({ ...params, applicability: operationsApplicability(typed("one-shot-cli")) });
  assert.equal(cli.status, "ready");
  assert.equal(cli.runtime.status, "not_applicable");
  assert.deepEqual(cli.blockers, []);
  assert.equal((await operationalReadiness({ ...params, applicability: operationsApplicability(typed("service").replace("- Service mode: none", "- Service mode: launchd")) })).status, "blocked");
  assert.equal((await operationalReadiness({ ...params, applicability: operationsApplicability(typed("library")), manifestIssue: "invalid" })).status, "blocked");
  assert.equal((await operationalReadiness({ ...params, folderPresent: false, applicability: operationsApplicability(typed("library")) })).status, "missing");
});
