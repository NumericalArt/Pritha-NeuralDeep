import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { preflightAgentCreation, probeCreationPort } from "../scripts/neuraldeep/creation-preflight.mjs";
import { validateContract } from "../scripts/agents-mother/contract.mjs";
const hash = text => createHash("sha256").update(text).digest("hex");
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-preflight-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const stateRoot = path.join(root, "state"), agentParent = path.join(root, "children"), target = path.join(agentParent, "signal-desk");
  const jobId = `creation_${"a".repeat(24)}`, draftRoot = path.join(stateRoot, "creation-drafts", jobId);
  mkdirSync(target, { recursive: true }); mkdirSync(path.join(draftRoot, "contracts"), { recursive: true });
  return { root, stateRoot, agentParent, job: { jobId, chatId: "chat-fixture", instanceId: "fixture", agentId: "signal-desk", target, draftRoot, phase: "interview", approvals: {} },
    reservation: { ownerId: "chat-fixture", path: target, state: "ready" }, providerStatus: { availability: "ready", effectiveProvider: "neuraldeep_cli", providerState: "available",
      selected: { modelId: "fixture-model", effortId: "high" }, models: [{ id: "fixture-model", effortIds: ["high"] }] } };
}
function contract(f, { runtime = "codex-native", accepted = false, api = false } = {}) {
  const file = path.join(f.job.draftRoot, "contracts", "contract.md");
  let text = readFileSync(new URL("fixtures/contracts/valid-agent-contract.md", import.meta.url), "utf8")
    .replace("type: agent-contract", "type: agent-contract\nagent_id: signal-desk")
    .replace(/^status: accepted$/m, `status: ${accepted ? "accepted" : "draft"}`)
    .replace("- Target folder: ../SnapshotAgent", `- Target folder: ${f.job.target}`)
    .replace("- Runtime family: codex-native", `- Runtime family: ${runtime}`);
  if (api) text = text.replace("- Primary interface: Codex project", "- Primary interface: web").replace("- Secondary interfaces: CLI", "- Secondary interfaces: API")
    .replace("- Service mode: none", "- Service mode: process").replace(/^- `\.env.example` variables:.*$/m, "- `.env.example` variables: SIGNAL_DESK_PORT=45678");
  writeFileSync(file, text);
  assert.deepEqual(validateContract(file, { root: f.root, print: false }), []);
  f.job.contract = { path: file, hash: hash(text) }; return text;
}

test("interview and contract authoring accept missing documents in the exact empty reserved target", async t => {
  const f = fixture(t);
  assert.equal((await preflightAgentCreation(f)).ok, true);
  f.job.phase = "contract"; assert.equal((await preflightAgentCreation(f)).ok, true);
  f.job.phase = "outcome";
  assert.ok((await preflightAgentCreation(f)).blockers.some(item => item.code === "creation_contract_missing"));
});

test("neighbor ownership, path traversal and symlink targets are rejected without touching neighbors", async t => {
  const f = fixture(t);
  assert.ok((await preflightAgentCreation({ ...f, reservation: { ...f.reservation, ownerId: "another-chat" } })).blockers.some(item => item.code === "creation_target_ownership_unverified"));
  assert.ok((await preflightAgentCreation({ ...f, job: { ...f.job, target: f.stateRoot } })).blockers.some(item => item.code === "creation_target_boundary"));
  const neighbor = path.join(f.agentParent, "neighbor"); mkdirSync(neighbor); writeFileSync(path.join(neighbor, "keep.txt"), "unchanged");
  rmSync(f.job.target, { recursive: true }); symlinkSync(neighbor, f.job.target);
  assert.ok((await preflightAgentCreation(f)).blockers.some(item => item.code === "creation_target_boundary"));
  assert.equal(readFileSync(path.join(neighbor, "keep.txt"), "utf8"), "unchanged");
});

test("validated drafts use the supported adapter; acceptance still requires separate host approval", async t => {
  const f = fixture(t); f.job.phase = "contract";
  contract(f); let result = await preflightAgentCreation(f);
  assert.equal(result.ok, true); assert.equal(result.adapter.name, "codex-workspace-v1");
  contract(f, { accepted: true }); result = await preflightAgentCreation(f);
  assert.ok(result.blockers.some(item => item.code === "creation_contract_host_approval_required"));
  f.job.approvals.contract = { hash: f.job.contract.hash }; f.job.phase = "outcome";
  assert.equal((await preflightAgentCreation(f)).ok, true, "outcome authoring may start after distinct accepted contract approval");
  f.job.phase = "scaffold";
  result = await preflightAgentCreation(f); assert.ok(result.blockers.some(item => item.code === "creation_outcome_approval_required"));
});

test("an unsupported draft can be corrected before approval while accepted runtime stays blocked", async t => {
  const f = fixture(t); f.job.phase = "contract";
  const text = contract(f, { runtime: "hybrid" });
  let result = await preflightAgentCreation(f);
  assert.equal(result.ok, true); assert.ok(result.warnings.some(item => item.code === "creation_adapter_unavailable"));
  contract(f, { runtime: "hybrid", accepted: true }); f.job.approvals.contract = { hash: f.job.contract.hash }; f.job.phase = "outcome";
  assert.ok((await preflightAgentCreation(f)).blockers.some(item => item.code === "creation_adapter_unavailable"));
  writeFileSync(f.job.contract.path, `${text}\nuser addition\n`);
  assert.ok((await preflightAgentCreation(f)).blockers.some(item => item.code === "creation_contract_changed"));
});

test("API process uses the same declared port as its scaffold manifest and reports occupancy", async t => {
  const f = fixture(t); f.job.phase = "contract"; contract(f, { runtime: "api", api: true });
  let observed;
  const result = await preflightAgentCreation(f, { portProbe: async port => { observed = port; return { ok: false, code: "creation_port_in_use" }; } });
  assert.equal(observed, 45678); assert.equal(result.port.value, 45678); assert.equal(result.adapter.name, "api-process-v1");
  assert.equal(result.ok, true); assert.ok(result.warnings.some(item => item.code === "creation_port_in_use"));
  contract(f, { runtime: "api", api: true, accepted: true }); f.job.approvals.contract = { hash: f.job.contract.hash }; f.job.phase = "outcome";
  const accepted = await preflightAgentCreation(f, { portProbe: async () => ({ ok: false, code: "creation_port_in_use" }) });
  assert.ok(accepted.blockers.some(item => item.code === "creation_port_in_use"));
});

test("host-only document checks omit provider probing without waiving documents, adapter or port", async t => {
  const f = fixture(t); f.job.phase = 'outcome'; contract(f, { accepted: true }); f.job.approvals.contract = { hash: f.job.contract.hash };
  assert.equal((await preflightAgentCreation({ ...f, providerStatus: null, checkProvider: false })).ok, true);
  assert.equal((await preflightAgentCreation({ ...f, providerStatus: null })).ok, false, 'model launches still require provider readiness by default');
  contract(f, { runtime: 'hybrid', accepted: true }); f.job.approvals.contract = { hash: f.job.contract.hash };
  assert.ok((await preflightAgentCreation({ ...f, providerStatus: null, checkProvider: false })).blockers.some(item => item.code === 'creation_adapter_unavailable'));
  f.job.approvals = {};
  assert.ok((await preflightAgentCreation({ ...f, providerStatus: null, checkProvider: false })).blockers.some(item => item.code === 'creation_contract_approval_required'));
});

test("provider readiness is supplied without a model call and emits no credential or raw provider error", async t => {
  const f = fixture(t);
  const result = await preflightAgentCreation({ ...f, providerStatus: { ...f.providerStatus, providerState: "auth_required", warning: "SECRET=fixture-private-value" } });
  assert.ok(result.blockers.some(item => item.code === "creation_provider_auth_required"));
  assert.ok(!JSON.stringify(result).includes("fixture-private-value"));
  f.providerStatus.selected.modelId = "unknown";
  assert.ok((await preflightAgentCreation(f)).blockers.some(item => item.code === "creation_model_unavailable"));
});

test("bounded port probe detects a real occupied port and releases its temporary bind", async () => {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  try { assert.equal((await probeCreationPort(port)).code, "creation_port_in_use"); }
  finally { await new Promise(resolve => listener.close(resolve)); }
  assert.equal((await probeCreationPort(port)).ok, true);
  assert.equal((await probeCreationPort(port)).ok, true, "the prior probe released the port");
  assert.equal((await probeCreationPort(0)).code, "creation_port_invalid");
});
