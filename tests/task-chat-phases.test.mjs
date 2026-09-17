import test from "node:test";
import assert from "node:assert/strict";

import {
  TASK_CHAT_PHASES,
  resolveTaskChatPhase,
  taskChatTurnTimeoutMs,
  taskChatPhasePreamble,
  taskChatTimeoutCheckpoint
} from "../scripts/neuraldeep/task-chat-phases.mjs";

const agentSubject = { taskType: "agent_creation", subjectId: "agent-x" };
const NEXT_LINE = "Next: open a New chat with the same Subject, paste this checkpoint and continue from the next step. Do not Resume or Retry this turn.";

test("TASK_CHAT_PHASES is the canonical phase order", () => {
  assert.deepEqual(TASK_CHAT_PHASES, ["interview", "contract", "outcome", "scaffold", "implement", "verify", "finish"]);
});

test("resolveTaskChatPhase returns null without an agent_creation subject", () => {
  assert.equal(resolveTaskChatPhase({}), null);
  assert.equal(resolveTaskChatPhase({ subject: null, text: "phase=verify" }), null);
  assert.equal(resolveTaskChatPhase({ subject: { taskType: "chat" }, text: "phase=verify" }), null);
});

test("resolveTaskChatPhase defaults to implement", () => {
  assert.equal(resolveTaskChatPhase({ subject: agentSubject, text: "" }), "implement");
  assert.equal(resolveTaskChatPhase({ subject: agentSubject, text: "please continue the work" }), "implement");
});

test("resolveTaskChatPhase honours explicit phase markers", () => {
  assert.equal(resolveTaskChatPhase({ subject: agentSubject, text: "phase=Outcome now" }), "outcome");
  assert.equal(resolveTaskChatPhase({ subject: agentSubject, text: "status: phase : VERIFY" }), "verify");
  assert.equal(resolveTaskChatPhase({ subject: agentSubject, text: "phase=banana" }), "implement");
});

test("taskChatTurnTimeoutMs returns base for non-child subjects", () => {
  assert.equal(taskChatTurnTimeoutMs({ subject: null, settingsTimeoutMs: 1800000, environment: {} }), 1800000);
  assert.equal(taskChatTurnTimeoutMs({ subject: { taskType: "chat" }, settingsTimeoutMs: 90000, environment: { PRITHA_TASK_CHAT_CHILD_TURN_TIMEOUT_MS: "300000" } }), 90000);
  assert.equal(taskChatTurnTimeoutMs({ subject: null, settingsTimeoutMs: "bad" }), 600000);
});

test("taskChatTurnTimeoutMs caps agent_creation turns", () => {
  assert.equal(taskChatTurnTimeoutMs({ subject: agentSubject, settingsTimeoutMs: 1800000, environment: {} }), 720000);
  assert.equal(taskChatTurnTimeoutMs({ subject: agentSubject, settingsTimeoutMs: 1800000, environment: { PRITHA_TASK_CHAT_CHILD_TURN_TIMEOUT_MS: "300000" } }), 300000);
  assert.equal(taskChatTurnTimeoutMs({ subject: agentSubject, settingsTimeoutMs: 1800000, environment: { PRITHA_TASK_CHAT_CHILD_TURN_TIMEOUT_MS: "10" } }), 120000);
  assert.equal(taskChatTurnTimeoutMs({ subject: agentSubject, settingsTimeoutMs: 3000000, environment: { PRITHA_TASK_CHAT_CHILD_TURN_TIMEOUT_MS: "5000000" } }), 1800000);
  assert.equal(taskChatTurnTimeoutMs({ subject: agentSubject, settingsTimeoutMs: 1800000, environment: { PRITHA_TASK_CHAT_CHILD_TURN_TIMEOUT_MS: "not-a-number" } }), 720000);
  assert.equal(taskChatTurnTimeoutMs({ subject: agentSubject, settingsTimeoutMs: 100000, environment: { PRITHA_TASK_CHAT_CHILD_TURN_TIMEOUT_MS: "720000" } }), 100000);
});

test("taskChatPhasePreamble is empty for missing or unknown phase", () => {
  assert.equal(taskChatPhasePreamble({}), "");
  assert.equal(taskChatPhasePreamble({ phase: null }), "");
  assert.equal(taskChatPhasePreamble({ phase: "banana" }), "");
});

test("taskChatPhasePreamble renders budget and implement goal", () => {
  const preamble = taskChatPhasePreamble({ phase: "implement", timeoutMs: 720000 });
  assert.ok(preamble.includes("Host turn contract (phase: implement, budget: 12 min)."));
  assert.ok(preamble.includes("One deliverable per turn: exactly one file or one CLI step. Split anything larger into the next turn."));
  assert.ok(preamble.includes("Final message: files changed, commands run, what is left. Nothing else."));
  assert.ok(preamble.includes("Phase goal: one product file, syntax-checked with node --check, nothing else."));
});

test("taskChatPhasePreamble renders the verify phase goal", () => {
  const preamble = taskChatPhasePreamble({ phase: "verify", timeoutMs: 300000 });
  assert.ok(preamble.includes("budget: 5 min"));
  assert.ok(preamble.includes("Phase goal: run the outcome trials once and report pass/fail per trial. Do not fix code in this turn."));
});

test("taskChatTimeoutCheckpoint renders the empty state", () => {
  const output = taskChatTimeoutCheckpoint({});
  assert.deepEqual(output.split("\n"), [
    "Step timeout checkpoint.",
    "Files changed: none recorded.",
    "Last command: none.",
    "Last assistant note: none.",
    NEXT_LINE
  ]);
});

test("taskChatTimeoutCheckpoint summarises mixed items deterministically", () => {
  const output = taskChatTimeoutCheckpoint({
    phase: "verify",
    timeoutMs: 600000,
    items: [
      { kind: "system", note: "ignored kind" },
      { kind: "file_change", changes: [{ path: "a.mjs", operation: "create" }, { path: "b.mjs", operation: "edit" }] },
      { kind: "file_change", changes: [{ path: "a.mjs", operation: "edit" }, { path: "c.mjs", operation: "create" }] },
      { kind: "command", commandPreview: "node scripts/agents-mother.mjs validate", exitCode: 1 },
      { kind: "assistant_message", message: { markdown: "Did a, b and c.  Still   to do: d." } },
      { kind: "command", commandPreview: "node --check c.mjs", exitCode: 0 }
    ]
  });

  assert.ok(output.startsWith("Step timeout checkpoint (phase: verify) after 10 min."));
  assert.ok(output.includes("Files changed: a.mjs, b.mjs, c.mjs."));
  assert.ok(output.includes("Last command: node --check c.mjs (exit 0)."));
  assert.ok(output.includes("Last assistant note: Did a, b and c. Still to do: d."));
  assert.ok(output.includes(NEXT_LINE));
});

test("taskChatTimeoutCheckpoint truncates preview, note and keeps the last 12 files", () => {
  const longPreview = "x".repeat(250);
  const longNote = "word ".repeat(100);
  const paths = Array.from({ length: 15 }, (_, index) => `file-${index}.mjs`);

  const output = taskChatTimeoutCheckpoint({
    timeoutMs: 900000,
    items: [
      { kind: "file_change", changes: paths.map((path) => ({ path, operation: "create" })) },
      { kind: "command", commandPreview: longPreview, exitCode: null },
      { kind: "assistant_message", message: { text: longNote } }
    ]
  });

  assert.ok(output.startsWith("Step timeout checkpoint after 15 min."));
  assert.ok(output.includes(`Files changed: ${paths.slice(-12).join(", ")}.`));
  assert.ok(!output.includes("file-0.mjs"));
  assert.ok(output.includes(`Last command: ${"x".repeat(200)} (exit ?).`));
  const expectedNote = longNote.replace(/\s+/g, " ").trim().slice(0, 300);
  const noteLine = output.split("\n").find((line) => line.startsWith("Last assistant note: "));
  assert.equal(noteLine, `Last assistant note: ${expectedNote}.`);
  assert.equal(noteLine.length, "Last assistant note: ".length + 300 + 1);
});
