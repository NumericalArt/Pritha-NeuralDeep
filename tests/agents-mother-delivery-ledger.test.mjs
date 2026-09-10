import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  accountDeliveryExecutorResult,
  budgetBlocker,
  claimDeliveryTarget,
  createDeliveryLedger,
  deliveryLedgerPaths,
  deliveryUsageStatus,
  deliveryTokenPreflight,
  grantDeliveryBudget,
  readDeliveryLedger,
  recordDeliveryFailure,
  recoverDeliveryLedger,
  releaseDeliveryTarget,
  targetKey,
  transitionDelivery,
  typedBlocker,
  updateDeliveryLedger,
  validateDeliveryLedger,
} from "../scripts/agents-mother/delivery-ledger.mjs";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-delivery-ledger-"));
  const runRoot = path.join(root, "builds", "alpha", "run-1");
  const project = path.join(root, "project");
  const created = createDeliveryLedger(runRoot, {
    runId: "run-1",
    agentSlug: "alpha",
    targetKey: targetKey(project),
    targetLabel: "alpha",
    spec: {
      id: "alpha-outcome",
      semanticLock: "sha256:semantic",
      documentLock: "sha256:document",
      contractFingerprint: "sha256:contract",
      approvalId: "approval-1",
    },
    createdAt: "2026-08-16T12:00:00.000Z",
  });
  return { root, runRoot, project, created };
}

test("ledger invariant requires exactly one next action or typed blockers in active states", () => {
  const { runRoot } = fixture();
  const state = readDeliveryLedger(runRoot);
  assert.equal(validateDeliveryLedger(state).ok, true);

  assert.equal(validateDeliveryLedger({ ...state, next_action: "", blockers: [] }).ok, false);
  assert.equal(validateDeliveryLedger({
    ...state,
    next_action: "continue",
    blockers: [typedBlocker({
      code: "needs_choice",
      summary: "A choice is needed.",
      question: "Which path should Pritha use?",
      options: [
        { id: "first", label: "First", effect: "Use the first path." },
        { id: "second", label: "Second", effect: "Use the second path." },
      ],
    })],
  }).ok, false);
});

test("typed blockers require one explicit question and bounded answer options", () => {
  assert.throws(() => typedBlocker({ code: "bad", summary: "Bad", question: "Choose", options: [] }), /question.*ending|2 to 5/);
  const blocker = typedBlocker({
    code: "material_choice",
    summary: "Two valid designs change the visible result.",
    question: "Which visible behavior should be used?",
    options: [
      { id: "compact", label: "Compact", effect: "Use the compact interaction." },
      { id: "guided", label: "Guided", effect: "Use the guided interaction." },
    ],
    evidence_refs: ["trial:experience"],
  });
  assert.equal(blocker.options.length, 2);
});

test("invalid explicit usage cannot normalize into a measured zero or an empty account list", () => {
  const { created: { state } } = fixture();
  for (const tokens_used of [null, "0", -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateDeliveryLedger({ ...state, budget: { ...state.budget, tokens_used } }).ok, false);
  }
  for (const accounted_turns of [null, {}, "invalid"]) {
    assert.equal(validateDeliveryLedger({ ...state, budget: { ...state.budget, accounted_turns } }).ok, false);
  }
});

test("budget amendments are explicit, idempotent, scoped and preserve approval and usage", () => {
  const { runRoot } = fixture();
  const before = readDeliveryLedger(runRoot);
  const input = { requestId: "budget-1", addTokens: 500, approvedBy: "user" };
  const first = grantDeliveryBudget(runRoot, input);
  const retry = grantDeliveryBudget(runRoot, input);
  assert.equal(retry.budget.max_tokens, before.budget.max_tokens + 500);
  assert.equal(retry.budget.max_iterations, before.budget.max_iterations);
  assert.equal(retry.budget.max_elapsed_ms, before.budget.max_elapsed_ms);
  assert.equal(retry.budget.tokens_used, before.budget.tokens_used);
  assert.deepEqual(retry.spec, before.spec);
  assert.equal(retry.budget.amendments.length, 1);
  assert.deepEqual(first.budget.amendments, retry.budget.amendments);
  assert.deepEqual(first, retry, "same-ID replay does not advance the ledger version or event history");
  assert.throws(() => grantDeliveryBudget(runRoot, { ...input, addTokens: 501 }), /different additions/);
  assert.throws(() => grantDeliveryBudget(runRoot, { ...input, approvedBy: "agent" }), /user authorization/);
  assert.throws(() => grantDeliveryBudget(runRoot, { ...input, requestId: "budget-2", expectedVersion: 1 }), /changed/);
  assert.throws(() => grantDeliveryBudget(runRoot, { ...input, requestId: "budget-3", addTokens: Number.MAX_SAFE_INTEGER }), /supported range/);
});

test("an absolute cap preserves usage, supports bounded reduction and rejects unsafe totals", () => {
  const { runRoot } = fixture();
  const observed = accountDeliveryExecutorResult(runRoot, receipt({ tokens_used: 120 }), "executor/iteration-001.json");
  const input = { requestId: "absolute-budget", approvedBy: "user", setTokens: 300 };
  const next = grantDeliveryBudget(runRoot, input);
  assert.equal(next.budget.max_tokens, 300);
  assert.equal(next.budget.tokens_used, 120);
  assert.equal(next.budget.amendments[0].applied_version, next.version);
  assert.equal(next.budget.amendments[0].token_target, 300);
  assert.deepEqual(next.spec, observed.spec);
  assert.deepEqual(grantDeliveryBudget(runRoot, input), next);
  for (const setTokens of [0, -1, 120, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => grantDeliveryBudget(runRoot, { ...input, requestId: "invalid-budget", setTokens }));
  }
  assert.throws(() => grantDeliveryBudget(runRoot, { ...input, requestId: "mixed-budget", addTokens: 10 }), /either/);
  updateDeliveryLedger(runRoot, state => ({ ...state, budget: { ...state.budget, legacy_usage_unverified: true } }));
  assert.throws(() => grantDeliveryBudget(runRoot, { ...input, requestId: "unknown-reduction", setTokens: 250 }), /unknown/);
  assert.equal(grantDeliveryBudget(runRoot, { ...input, requestId: "unknown-extension", setTokens: 500 }).budget.max_tokens, 500);
});

test("an explicit time extension grants future time without spending or resetting token accounting", () => {
  const { runRoot } = fixture();
  const state = readDeliveryLedger(runRoot);
  const now = Date.parse(state.created_at) + state.budget.max_elapsed_ms + 90_000;
  const result = grantDeliveryBudget(runRoot, { requestId: "time-1", approvedBy: "user", addElapsedMs: 60_000, now });
  assert.equal(result.budget.max_elapsed_ms, now - Date.parse(state.created_at) + 60_000);
  assert.equal(result.budget.max_tokens, state.budget.max_tokens);
  assert.equal(result.budget.max_iterations, state.budget.max_iterations);
});

test("preflight exposes in-flight reservation and unknown availability", () => {
  const { runRoot } = fixture();
  const state = accountDeliveryExecutorResult(runRoot, receipt({ status: "dispatching", turn_status: "unknown", turn_id: null, token_budget: 500, tokens_used: null, usage_status: "unknown", thread_cleanup: "pending" }), "executor/iteration-001.json");
  assert.equal(deliveryTokenPreflight(state.budget).reserved, 500);
  assert.equal(deliveryTokenPreflight(state.budget).available, null);
});

test("updates use CAS versions and recover the latest snapshot from append-only events", () => {
  const { runRoot } = fixture();
  const prepared = transitionDelivery(runRoot, "preparing", { nextAction: "prepare_worktree", updatedAt: "2026-08-16T12:01:00.000Z" });
  assert.equal(prepared.state.version, 2);
  assert.throws(() => updateDeliveryLedger(runRoot, (state) => state, { expectedVersion: 1 }), /expected version 1/);

  const { statePath, eventsPath } = deliveryLedgerPaths(runRoot);
  writeFileSync(statePath, "{corrupt", "utf8");
  const recovered = recoverDeliveryLedger(runRoot);
  assert.equal(recovered.version, 2);
  assert.equal(recovered.status, "preparing");
  assert.equal(readFileSync(eventsPath, "utf8").trim().split("\n").length, 2);
});

test("recovery ignores only a crash-truncated final event line", () => {
  const { runRoot } = fixture();
  transitionDelivery(runRoot, "preparing", { nextAction: "prepare_worktree" });
  const { statePath, eventsPath } = deliveryLedgerPaths(runRoot);
  appendFileSync(eventsPath, '{"schema":"pritha-delivery-event-v1"');
  writeFileSync(statePath, "{corrupt", "utf8");

  const recovered = recoverDeliveryLedger(runRoot);
  assert.equal(recovered.version, 2);
  assert.equal(recovered.status, "preparing");
});

test("legacy v1 ledgers normalize to the 1000000-token v2 budget", () => {
  const { runRoot } = fixture();
  const { statePath } = deliveryLedgerPaths(runRoot);
  const legacy = JSON.parse(readFileSync(statePath, "utf8"));
  legacy.schema = "pritha-delivery-ledger-v1";
  delete legacy.budget.max_tokens;
  delete legacy.budget.tokens_used;
  delete legacy.budget.token_budget_source;
  delete legacy.budget.goal_enforcement;
  delete legacy.budget.accounted_turns;
  delete legacy.budget.accounting_version;
  delete legacy.budget.legacy_usage_unverified;
  writeFileSync(statePath, `${JSON.stringify(legacy, null, 2)}\n`);
  const normalized = readDeliveryLedger(runRoot);
  assert.equal(normalized.schema, "pritha-delivery-ledger-v2");
  assert.equal(normalized.budget.max_tokens, 1_000_000);
  assert.equal(normalized.budget.tokens_used, 0);
  assert.equal(normalized.budget.token_budget_source, "legacy-default");
  assert.deepEqual(normalized.budget.accounted_turns, []);
  assert.equal(deliveryUsageStatus(normalized.budget), "legacy-unknown");
  assert.equal(budgetBlocker(normalized).code, "goal_usage_unavailable");
  assert.deepEqual(normalized.spec, legacy.spec);
});

function receipt(overrides = {}) {
  return {
    schema: "pritha-build-executor-result-v2", executor: "codex-app-server-build", run_id: "run-1",
    thread_id: "thread-1", turn_id: "turn-1", status: "completed", turn_status: "completed",
    tokens_used: 120, usage_status: "measured", usage_source: "goal", usage_scope: "build-executor",
    goal_enforcement: "required", thread_cleanup: "archived", ...overrides,
  };
}

test("observed overshoot is durable and blocks further model spending", () => {
  const { runRoot } = fixture();
  updateDeliveryLedger(runRoot, state => ({ ...state, budget: { ...state.budget, max_tokens: 100 } }));
  const state = accountDeliveryExecutorResult(runRoot, receipt(), "executor/iteration-001.json");
  assert.equal(state.budget.tokens_used, 120);
  assert.equal(validateDeliveryLedger(state).ok, true);
  assert.equal(budgetBlocker(state).code, "token_budget_exhausted");
  assert.equal(readDeliveryLedger(runRoot).budget.tokens_used, 120);
  assert.equal(recoverDeliveryLedger(runRoot).budget.tokens_used, 120);
});

test("a long amendment history preserves the same delivery run for another authorized extension", () => {
  const { runRoot } = fixture();
  const granted = grantDeliveryBudget(runRoot, { approvedBy: "user", requestId: "first-grant", addTokens: 1 });
  const amendment = granted.budget.amendments[0];
  updateDeliveryLedger(runRoot, state => ({ ...state, budget: { ...state.budget, max_tokens: amendment.before.max_tokens + 1_001,
    amendments: Array.from({ length: 1_001 }, (_, index) => ({ ...amendment, request_id: `historical-grant-${index}`,
      before: { ...amendment.before, max_tokens: amendment.before.max_tokens + index },
      after: { ...amendment.after, max_tokens: amendment.after.max_tokens + index },
    })),
  } }));
  const extended = grantDeliveryBudget(runRoot, { approvedBy: "user", requestId: "next-grant", addTokens: 10 });
  assert.equal(extended.run_id, granted.run_id);
  assert.equal(extended.budget.max_tokens, amendment.before.max_tokens + 1_011);
  assert.equal(extended.budget.tokens_used, granted.budget.tokens_used);
  assert.equal(extended.budget.amendments.length, 1_002);
});

test("cumulative usage replay and late updates charge the bound turn once", () => {
  const { runRoot } = fixture();
  for (const count of [100, 100, 120, 100, 120]) accountDeliveryExecutorResult(runRoot, receipt({ tokens_used: count }), "executor/iteration-001.json");
  const budget = readDeliveryLedger(runRoot).budget;
  assert.equal(budget.tokens_used, 120);
  assert.equal(budget.accounted_turns.length, 1);
  assert.equal(deliveryUsageStatus(budget), "complete");
});

test("unknown dispatch becomes measured after recovery without losing other charges", () => {
  const { runRoot } = fixture();
  const reference = "executor/iteration-001.json";
  const pending = receipt({ status: "dispatching", turn_id: null, tokens_used: null, usage_status: "unknown", thread_cleanup: "pending" });
  accountDeliveryExecutorResult(runRoot, pending, reference);
  accountDeliveryExecutorResult(runRoot, pending, reference);
  let state = readDeliveryLedger(runRoot);
  assert.equal(state.budget.tokens_used, 0);
  assert.equal(state.budget.unaccounted_attempts.length, 1);
  assert.equal(budgetBlocker(state).code, "goal_usage_unavailable");
  state = accountDeliveryExecutorResult(runRoot, receipt(), reference);
  assert.equal(state.budget.tokens_used, 120);
  assert.equal(state.budget.unaccounted_attempts.length, 0);
});

test("waived legacy zero remains unknown and consumes only the authorized waiver", () => {
  const { runRoot } = fixture();
  updateDeliveryLedger(runRoot, state => ({ ...state, budget: { ...state.budget, goal_enforcement: "waived-once", goal_waiver: { granted_by: "user" } } }));
  const legacy = receipt({ schema: "pritha-build-executor-result-v1", tokens_used: 0, goal_enforcement: "waived-once" });
  delete legacy.usage_status;
  delete legacy.usage_source;
  const state = accountDeliveryExecutorResult(runRoot, legacy, "executor/iteration-001.json");
  assert.equal(state.budget.accounted_turns.length, 0);
  assert.equal(deliveryUsageStatus(state.budget), "unknown");
  assert.equal(state.budget.goal_enforcement, "required");
  assert.ok(state.budget.goal_waiver.used_at);
});

test("invalid totals and conflicting measurement sources preserve a blocker", () => {
  const { runRoot } = fixture();
  accountDeliveryExecutorResult(runRoot, receipt({ tokens_used: Number.MAX_SAFE_INTEGER }), "executor/iteration-001.json");
  let state = accountDeliveryExecutorResult(runRoot, receipt({ thread_id: "thread-2", tokens_used: 1 }), "executor/iteration-002.json");
  assert.equal(state.budget.tokens_used, Number.MAX_SAFE_INTEGER);
  assert.equal(state.budget.unaccounted_attempts[0].reason, "token_total_out_of_range");
  state = accountDeliveryExecutorResult(runRoot, receipt({ tokens_used: 5, usage_source: "thread-token-usage" }), "executor/iteration-001.json");
  assert.equal(state.budget.tokens_used, Number.MAX_SAFE_INTEGER);
  assert.ok(state.budget.unaccounted_attempts.some(entry => entry.reason === "conflicting_usage_sources"));
});

test("another run or accounting phase cannot enter the build budget", () => {
  const { runRoot } = fixture();
  assert.throws(() => accountDeliveryExecutorResult(runRoot, receipt({ run_id: "other-run" }), "executor/iteration-001.json"), /another delivery run/);
  assert.throws(() => accountDeliveryExecutorResult(runRoot, receipt({ usage_scope: "parent-task-chat" }), "executor/iteration-001.json"), /different usage scope/);
  assert.equal(readDeliveryLedger(runRoot).budget.tokens_used, 0);
});

test("one active run may own a delivery target", () => {
  const { root, runRoot, project } = fixture();
  const buildsRoot = path.join(root, "builds");
  const key = targetKey(project);
  const first = claimDeliveryTarget(buildsRoot, { targetKey: key, runId: "run-1", runRoot });
  assert.throws(
    () => claimDeliveryTarget(buildsRoot, { targetKey: key, runId: "run-2", runRoot: path.join(buildsRoot, "alpha", "run-2") }),
    /already owns this target/,
  );
  assert.equal(releaseDeliveryTarget(first.claimPath, "run-1").released, true);
});

test("repeated identical Trial failures become an actionable blocker", () => {
  const { runRoot } = fixture();
  transitionDelivery(runRoot, "preparing", { nextAction: "build" });
  transitionDelivery(runRoot, "building", { nextAction: "verify" });
  transitionDelivery(runRoot, "verifying", { nextAction: "run_trials" });
  const failures = [{ id: "smoke", assertions: [{ type: "exit_code", passed: false }], error: null }];
  const first = recordDeliveryFailure(runRoot, failures);
  transitionDelivery(runRoot, "verifying", { nextAction: "run_trials" });
  const second = recordDeliveryFailure(runRoot, failures);
  transitionDelivery(runRoot, "verifying", { nextAction: "run_trials" });
  const third = recordDeliveryFailure(runRoot, failures);

  assert.equal(first.state.status, "building");
  assert.equal(second.state.status, "building");
  assert.equal(third.state.status, "blocked");
  assert.equal(third.state.next_action, "");
  assert.equal(third.state.blockers[0].code, "repeated_trial_failure");
  assert.equal(third.state.blockers[0].options.length, 3);
});
