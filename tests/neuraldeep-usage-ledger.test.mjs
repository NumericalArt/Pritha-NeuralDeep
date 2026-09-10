import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { neuralDeepRuntimeIdentity } from "../scripts/neuraldeep/runtime-identity.mjs";
import { readParentUsage } from "../scripts/agents-mother/phase-usage.mjs";
import {
  estimateWalletCost,
  recordNeuralDeepRun,
  summarizeNeuralDeepUsage,
  neuralDeepUsageLedgerPath,
  readNeuralDeepSessionUsage,
} from "../scripts/neuraldeep/usage-ledger.mjs";

const execFileAsync = promisify(execFile);

test("home and provider identities separate cumulative sessions; parent usage reads one authoritative ledger", t => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "nd-profile-usage-"));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  const a = neuralDeepRuntimeIdentity(stateRoot), b = neuralDeepRuntimeIdentity(stateRoot, { PRITHA_NEURALDEEP_CODEX_HOME: path.join(stateRoot, "other-home") });
  assert.notEqual(a.stateIdentityHash, b.stateIdentityHash); assert.notEqual(a.profileIdentity, b.profileIdentity);
  const record = (runId, profileIdentity, input) => recordNeuralDeepRun({ stateRoot, runId, profileIdentity, model: "fixture-model", source: "codex-chat", sessionId: "session-shared", cumulative: true, usage: { input_tokens: input, output_tokens: 10 } });
  record("a1", a.profileIdentity, 100); record("b1", b.profileIdentity, 200);
  assert.equal(record("a2", a.profileIdentity, 150).usage.totalTokens, 50);
  record("a2", a.profileIdentity, 150);
  assert.throws(() => record("a2", b.profileIdentity, 150), /identity_conflict/);
  const task = { chatId: "chat_fixture", nativeThreadId: "session-shared", stateIdentityHash: a.stateIdentityHash, providerId: "neuraldeep_cli" };
  const view = readParentUsage(task, { root: stateRoot, stateRoot });
  assert.equal(view.observedTokens, 160); assert.equal(view.observedTurns, 2);
  assert.equal(view.source, "neuraldeep-usage-ledger-v2");
  assert.equal(readParentUsage({ ...task, stateIdentityHash: b.stateIdentityHash }, { root: stateRoot, stateRoot }).observedTokens, null);
  assert.equal(readNeuralDeepSessionUsage({ stateRoot, profileIdentity: b.profileIdentity, sessionId: task.nativeThreadId }).observedTokens, 210);
});

test("legacy unscoped cumulative history remains preserved and transition cost stays unknown", t => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "nd-legacy-profile-"));
  t.after(() => rmSync(stateRoot, { recursive: true, force: true }));
  recordNeuralDeepRun({ stateRoot, runId: "init", model: "unrelated", source: "codex-chat", usage: { input_tokens: 0, output_tokens: 0 } });
  const db = new DatabaseSync(neuralDeepUsageLedgerPath(stateRoot));
  db.prepare("INSERT INTO session_totals VALUES(?,?,?,?,?,?,?,?)").run("legacy-session", "fixture-model", 100, 0, 10, 0, 110, new Date().toISOString()); db.close();
  const transition = recordNeuralDeepRun({ stateRoot, runId: "migration", model: "fixture-model", source: "codex-chat", sessionId: "legacy-session", cumulative: true, usage: { input_tokens: 150, output_tokens: 20 } });
  assert.equal(transition.usageKnown, false);
  const next = recordNeuralDeepRun({ stateRoot, runId: "after-migration", model: "fixture-model", source: "codex-chat", sessionId: "legacy-session", cumulative: true, usage: { input_tokens: 160, output_tokens: 25 } });
  assert.equal(next.usageKnown, true); assert.equal(next.usage.totalTokens, 15);
  const summary = summarizeNeuralDeepUsage({ stateRoot });
  assert.equal(summary.totals.totalTokens, 15, "do not sum historical cumulative values as newly measured usage");
  const read = new DatabaseSync(neuralDeepUsageLedgerPath(stateRoot), { readOnly: true });
  assert.equal(read.prepare("SELECT total_tokens FROM session_totals WHERE session_id=?").get("legacy-session").total_tokens, 110); read.close();
});

test("wallet formula separates cached input and never double-counts reasoning", () => {
  const cost = estimateWalletCost({ input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 7 }, {
    inputRubPerMillion: 10,
    cachedInputRubPerMillion: 1,
    outputRubPerMillion: 20,
  });
  assert.equal(cost, 0.00102);
});

test("ledger computes resume deltas, deduplicates run ids, and snapshots changed prices", () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-usage-ledger-"));
  try {
    const first = recordNeuralDeepRun({
      stateRoot, runId: "run-1", source: "codex-chat", model: "model-a", sessionId: "session-a", cumulative: true,
      usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10 },
      billing: { mode: "wallet", tier: "wallet", price: { inputRubPerMillion: 10, cachedInputRubPerMillion: 1, outputRubPerMillion: 20 } },
    });
    const second = recordNeuralDeepRun({
      stateRoot, runId: "run-2", source: "codex-chat", model: "model-a", sessionId: "session-a", cumulative: true,
      usage: { input_tokens: 160, cached_input_tokens: 30, output_tokens: 25 },
      billing: { mode: "wallet", tier: "wallet", price: { inputRubPerMillion: 20, cachedInputRubPerMillion: 2, outputRubPerMillion: 40 } },
    });
    const duplicate = recordNeuralDeepRun({ stateRoot, runId: "run-2", source: "codex-chat", model: "model-a", sessionId: "session-a", usage: {} });
    assert.equal(first.usage.inputTokens, 100);
    assert.equal(second.usage.inputTokens, 60);
    assert.equal(second.usage.outputTokens, 15);
    assert.equal(second.estimatedCostRub, 0.00162);
    assert.equal(duplicate.duplicate, true);
    const summary = summarizeNeuralDeepUsage({ stateRoot, range: "24h" });
    assert.equal(summary.totals.runs, 2);
    assert.equal(summary.totals.inputTokens, 160);
    assert.equal(summary.totals.outputTokens, 25);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("subscription and unknown usage retain null cost instead of a false zero", () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-usage-null-cost-"));
  try {
    const subscription = recordNeuralDeepRun({
      stateRoot, runId: "subscription-run", source: "agent-mother", model: "model-a", usage: { input_tokens: 10, output_tokens: 5 },
      billing: { mode: "subscription", tier: "free", price: { inputRubPerMillion: 10, outputRubPerMillion: 20 } },
    });
    const unknown = recordNeuralDeepRun({
      stateRoot, runId: "unknown-run", source: "embeddings", model: "embed-a", usage: null, usageKnown: false,
      billing: { mode: "wallet", tier: "wallet", price: { inputRubPerMillion: 10, outputRubPerMillion: 20 } },
    });
    assert.equal(subscription.estimatedCostRub, null);
    assert.equal(subscription.costStatus, "included_in_subscription");
    assert.equal(unknown.estimatedCostRub, null);
    assert.equal(unknown.costStatus, "usage_unavailable");
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("unknown resumed usage does not reset the previous cumulative session total", () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-usage-unknown-resume-"));
  try {
    recordNeuralDeepRun({
      stateRoot, runId: "known-run", source: "codex-chat", model: "model-a", sessionId: "session-a", cumulative: true,
      usage: { input_tokens: 100, output_tokens: 20 }, billing: { mode: "wallet", price: { inputRubPerMillion: 10, outputRubPerMillion: 20 } },
    });
    const unknown = recordNeuralDeepRun({
      stateRoot, runId: "unknown-resume", source: "codex-chat", model: "model-a", sessionId: "session-a", cumulative: true,
      usage: null, usageKnown: false, billing: { mode: "wallet", price: { inputRubPerMillion: 10, outputRubPerMillion: 20 } },
    });
    const resumed = recordNeuralDeepRun({
      stateRoot, runId: "next-known-run", source: "codex-chat", model: "model-a", sessionId: "session-a", cumulative: true,
      usage: { input_tokens: 130, output_tokens: 25 }, billing: { mode: "wallet", price: { inputRubPerMillion: 10, outputRubPerMillion: 20 } },
    });
    assert.equal(unknown.cumulativeReset, false);
    assert.equal(resumed.usage.inputTokens, 30);
    assert.equal(resumed.usage.outputTokens, 5);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("parallel processes can append independent runs", async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-usage-concurrent-"));
  const moduleUrl = new URL("../scripts/neuraldeep/usage-ledger.mjs", import.meta.url).href;
  try {
    await Promise.all(Array.from({ length: 8 }, (_, index) => execFileAsync(process.execPath, [
      "--input-type=module",
      "--eval",
      `import {recordNeuralDeepRun} from ${JSON.stringify(moduleUrl)}; recordNeuralDeepRun({stateRoot:${JSON.stringify(stateRoot)},runId:${JSON.stringify(`parallel-${index}`)},source:'child-agent',model:'model-a',usage:{input_tokens:1,output_tokens:1},billing:{mode:'subscription'}});`,
    ])));
    const summary = summarizeNeuralDeepUsage({ stateRoot, range: "24h" });
    assert.equal(summary.totals.runs, 8);
    assert.equal(summary.totals.totalTokens, 16);
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("legacy provenance without ledger usage is exposed as unmetered", () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-usage-legacy-"));
  try {
    mkdirSync(path.join(stateRoot, "logs"), { recursive: true });
    writeFileSync(path.join(stateRoot, "logs", "neuraldeep-runtime.jsonl"), `${JSON.stringify({
      schema: "pritha-neuraldeep-runtime-provenance-v1",
      timestamp: new Date().toISOString(),
      event: "run_finished",
      run_id: "legacy-run",
      model: "legacy-model",
      exit_code: 0,
    })}\n`);
    const summary = summarizeNeuralDeepUsage({ stateRoot, range: "24h" });
    assert.equal(summary.totals.runs, 1);
    assert.equal(summary.bySource[0].source, "unmetered");
    assert.equal(summary.recent[0].costStatus, "legacy_unmetered");
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});
