import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadRollingSummaryModule() {
  const source = readFileSync("interfaces/control-center/src/lib/realtime/rolling-summary.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-rolling-summary-test-"));
  const modulePath = path.join(tmp, "rolling-summary.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("rolling summary checkpoint has a fixed compact schema", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const {
      buildRollingSummaryCheckpoint,
      ROLLING_SUMMARY_SCHEMA_VERSION,
      ROLLING_SUMMARY_MAX_BYTES,
    } = loaded.module;

    const result = buildRollingSummaryCheckpoint({
      topicKey: "Pritha Memory",
      updatedAt: "2026-06-24T01:34:00.000Z",
      task: "Implement internal rolling summary for Pritha Realtime sessions.",
      currentStatus: "Checkpoint contract is being defined.",
      keyRefs: ["interfaces/control-center/src/lib/realtime/pritha-runtime.ts"],
      keyResources: ["private realtime runtime root"],
      confirmedConstraints: ["No new UI", "Do not store secrets"],
      confirmedAccesses: ["workspace-write approved"],
      nextStep: "Add private rolling storage in the next step.",
      latestRealtimeSession: {
        sessionId: "voice-test",
        updatedAt: "2026-06-24T01:34:10.000Z",
        summary: "Operator asked how rolling summary should bridge voice sessions.",
        keyPoints: ["Pritha should recall previous session context"],
        userIntents: ["Continue the rolling summary implementation"],
        nextStep: "Keep the handoff summary available for the next session.",
      },
      latestCodexTask: {
        taskId: "task-123",
        title: "Implement rolling summary",
        status: "running",
        phase: "step_completed",
        subject: "pritha:memory",
        result: "Checkpoint contract was added.",
        refs: ["tests/control-center-rolling-summary.test.mjs"],
        nextStep: "Wire the storage layer.",
      },
      sourceEvent: "step_completed",
    });

    assert.equal(result.checkpoint.schemaVersion, ROLLING_SUMMARY_SCHEMA_VERSION);
    assert.equal(result.checkpoint.topicKey, "pritha-memory");
    assert.equal(result.checkpoint.privacy, "summary-only");
    assert.equal(result.checkpoint.sizeLimitBytes, ROLLING_SUMMARY_MAX_BYTES);
    assert.equal("expiresAt" in result.checkpoint, false);
    assert.deepEqual(Object.keys(result.checkpoint), [
      "schemaVersion",
      "topicKey",
      "updatedAt",
      "task",
      "currentStatus",
      "keyRefs",
      "keyResources",
      "confirmedConstraints",
      "confirmedAccesses",
      "nextStep",
      "latestRealtimeSession",
      "latestCodexTask",
      "sourceEvent",
      "privacy",
      "sizeLimitBytes",
    ]);
    assert.equal(result.checkpoint.latestRealtimeSession.summary, "Operator asked how rolling summary should bridge voice sessions.");
    assert.equal(result.checkpoint.latestCodexTask.taskId, "task-123");
    assert.ok(result.byteLength <= ROLLING_SUMMARY_MAX_BYTES);
    assert.match(result.serialized, /Implement internal rolling summary/);
    assert.doesNotMatch(result.serialized, /expiresAt|expires_at/);
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary derives latest sections from legacy handoff fields", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { buildRollingSummaryCheckpoint } = loaded.module;
    const { checkpoint } = buildRollingSummaryCheckpoint({
      topicKey: "agent-pictureboom",
      updatedAt: "2026-06-24T09:27:33.153Z",
      task: "PictureBoom",
      currentStatus: "Status: complete; phase: completed; brief: Codex finished the task and the result is ready.",
      keyRefs: ["interfaces/control-center/src/components/voice/usePrithaRealtime.ts"],
      keyResources: ["agent:pictureboom"],
      confirmedConstraints: ["No secrets"],
      nextStep: "Ask the operator whether to continue with PictureBoom.",
      latestRealtimeSession: {
        sessionId: "unknown",
        summary: "No Realtime session summary captured.",
        keyPoints: [],
        userIntents: [],
        nextStep: "Continue from the latest operator request if relevant.",
      },
      latestCodexTask: {
        taskId: "none",
        title: "No Codex task captured.",
        status: "unknown",
        phase: "unknown",
        subject: "unknown",
        result: "No Codex task result captured.",
        refs: [],
        nextStep: "Inspect or continue the latest Codex task only if the operator asks.",
      },
      sourceEvent: "session_stopping",
    });

    assert.equal(checkpoint.latestCodexTask.taskId, "agent-pictureboom");
    assert.equal(checkpoint.latestCodexTask.title, "PictureBoom");
    assert.match(checkpoint.latestCodexTask.result, /Codex finished the task/);
    assert.notEqual(checkpoint.latestCodexTask.title, "No Codex task captured.");
    assert.match(checkpoint.latestRealtimeSession.summary, /Codex finished the task/);
    assert.deepEqual(checkpoint.latestRealtimeSession.userIntents, ["PictureBoom"]);
    assert.equal(checkpoint.latestRealtimeSession.updatedAt, "2026-06-24T09:27:33.153Z");
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary redacts secrets and rejects raw transcript-shaped input", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { buildRollingSummaryCheckpoint } = loaded.module;
    const result = buildRollingSummaryCheckpoint({
      topicKey: "memory",
      task: "Raw transcript:\nUser: here is sk-test123456789012345\nAssistant: got it",
      currentStatus: "OPENAI_API_KEY=sk-live123456789012345 and Bearer abcdefghijklmnop", // gitleaks:allow -- synthetic test fixture or non-secret identifier
      keyRefs: [
        "Recent voice session events:\n- user: secret detail\n- assistant: ok",
        "03_reviews/non-secret.md",
      ],
      confirmedConstraints: ['{"token":"github_pat_123456789012345678901234567890"}'],
      latestRealtimeSession: {
        summary: "Raw transcript:\nUser: do not keep sk-session123456789012345\nAssistant: ok",
        userIntents: ["Continue without token=secret-value"],
      },
      latestCodexTask: {
        title: "Credential cleanup",
        result: "Bearer abcdefghijklmnop should be redacted",
      },
      nextStep: "Continue without raw transcript storage.",
    });

    assert.equal(result.privacyFlags.rawTranscriptOmitted, 3);
    assert.equal(result.privacyFlags.sensitiveRedacted, true);
    assert.doesNotMatch(result.serialized, /sk-test|sk-live|sk-session|github_pat|Bearer abcdefghijklmnop|secret detail|User:|secret-value/i);
    assert.match(result.serialized, /Status not captured|OPENAI_API_KEY=\[redacted\]/);
    assert.match(result.serialized, /03_reviews\/non-secret\.md/);
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary keeps a durable single-file handoff without expiry", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { buildRollingSummaryCheckpoint } = loaded.module;
    const updatedAtMs = Date.parse("2026-06-24T01:34:00.000Z");
    const { checkpoint } = buildRollingSummaryCheckpoint({
      topicKey: "pritha-memory",
      updatedAt: new Date(updatedAtMs).toISOString(),
      task: "Bridge current voice session to the next one.",
      currentStatus: "Fresh handoff file was written.",
      nextStep: "Load this in the next Realtime session.",
      sourceEvent: "session_stopping",
    });

    assert.equal(checkpoint.updatedAt, new Date(updatedAtMs).toISOString());
    assert.equal("expiresAt" in checkpoint, false);
    assert.equal("expires_at" in checkpoint, false);
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary enforces the hard serialized size limit", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { buildRollingSummaryCheckpoint } = loaded.module;
    const longText = "Pritha memory rolling checkpoint ".repeat(80);
    const result = buildRollingSummaryCheckpoint({
      topicKey: "memory-size",
      task: longText,
      currentStatus: longText,
      keyRefs: Array.from({ length: 20 }, (_, index) => `ref-${index}-${longText}`),
      keyResources: Array.from({ length: 20 }, (_, index) => `resource-${index}-${longText}`),
      confirmedConstraints: Array.from({ length: 20 }, (_, index) => `constraint-${index}-${longText}`),
      confirmedAccesses: Array.from({ length: 20 }, (_, index) => `access-${index}-${longText}`),
      nextStep: longText,
      maxBytes: 1_300,
    });

    assert.ok(result.byteLength <= 1_300, `checkpoint should be <= 1300 bytes, got ${result.byteLength}`);
    assert.equal(result.privacyFlags.truncated, true);
    assert.ok(result.checkpoint.keyRefs.length <= 6);
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary keeps one overwritable and recoverable current checkpoint", async () => {
  const loaded = await loadRollingSummaryModule();
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-rolling-summary-store-"));
  try {
    const { buildRollingSummaryCheckpoint, rollingSummaryByteLength, ROLLING_SUMMARY_MAX_BYTES } = loaded.module;
    const storageDir = path.join(tmp, "rolling-summary");
    const checkpointPath = path.join(storageDir, "current.json");
    const writeAtomic = (serialized, suffix) => {
      rmSync(storageDir, { recursive: true, force: true });
      writeFileSync(path.join(tmp, ".keep"), "", "utf8");
      mkdirSync(storageDir, { recursive: true });
      const tmpPath = `${checkpointPath}.${suffix}.tmp`;
      writeFileSync(tmpPath, `${serialized}\n`, "utf8");
      renameSync(tmpPath, checkpointPath);
    };

    const first = buildRollingSummaryCheckpoint({
      topicKey: "pritha-memory",
      updatedAt: "2026-06-24T01:40:00.000Z",
      task: "First checkpoint for Pritha memory rolling summary.",
      currentStatus: "Storage is being introduced.",
      nextStep: "Overwrite this checkpoint with newer progress.",
      sourceEvent: "step_completed",
    });
    const second = buildRollingSummaryCheckpoint({
      topicKey: "pictureboom",
      updatedAt: "2026-06-24T01:45:00.000Z",
      task: "Second checkpoint for a different subject.",
      currentStatus: "Current handoff file is overwritten.",
      keyRefs: ["interfaces/control-center/src/components/voice/usePrithaRealtime.ts"],
      nextStep: "Continue from the latest recovered checkpoint.",
      sourceEvent: "session_stopping",
    });

    writeAtomic(first.serialized, "first");
    writeAtomic(second.serialized, "second");

    assert.deepEqual(readdirSync(storageDir), ["current.json"]);
    const recovered = JSON.parse(readFileSync(checkpointPath, "utf8"));
    assert.equal(recovered.topicKey, "pictureboom");
    assert.equal(recovered.updatedAt, "2026-06-24T01:45:00.000Z");
    assert.equal(recovered.currentStatus, "Current handoff file is overwritten.");
    assert.doesNotMatch(JSON.stringify(recovered), /Storage is being introduced/);
    assert.ok(rollingSummaryByteLength(JSON.stringify(recovered, null, 2)) <= ROLLING_SUMMARY_MAX_BYTES);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    loaded.cleanup();
  }
});

test("rolling summary relevance accepts related tasks and ignores unrelated ones", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { buildRollingSummaryCheckpoint, rollingSummaryRelevance } = loaded.module;
    const { checkpoint } = buildRollingSummaryCheckpoint({
      topicKey: "pritha-memory",
      task: "Implement rolling summary checkpoints for Pritha memory.",
      currentStatus: "Contract helper ready.",
      keyRefs: ["interfaces/control-center/src/lib/realtime/rolling-summary.ts"],
      nextStep: "Wire storage and debounce.",
    });

    assert.equal(rollingSummaryRelevance("continue Pritha memory rolling summary storage", checkpoint).related, true);
    assert.equal(rollingSummaryRelevance("weather and bitcoin price for tomorrow", checkpoint).related, false);
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary recall context is empty for unrelated follow-up tasks", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { buildRollingSummaryCheckpoint, formatRollingSummaryForRealtime, rollingSummaryRelevance } = loaded.module;
    const { checkpoint } = buildRollingSummaryCheckpoint({
      topicKey: "pritha-memory",
      task: "Implement rolling summary recall for Pritha memory Realtime sessions.",
      currentStatus: "Startup recall is available.",
      keyResources: ["pritha:memory", "Realtime rolling summary"],
      nextStep: "Continue privacy and reliability tests.",
    });
    const unrelated = rollingSummaryRelevance("prepare a PictureBoom launch image and marketing copy", checkpoint);
    const related = rollingSummaryRelevance("continue Pritha memory Realtime rolling summary tests", checkpoint);
    const unrelatedContext = unrelated.related ? formatRollingSummaryForRealtime(checkpoint) : "";
    const relatedContext = related.related ? formatRollingSummaryForRealtime(checkpoint) : "";

    assert.equal(unrelated.related, false);
    assert.equal(unrelatedContext, "");
    assert.equal(related.related, true);
    assert.match(relatedContext, /Internal rolling summary checkpoint/);
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary realtime recall context is byte bounded", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { buildRollingSummaryCheckpoint, formatRollingSummaryForRealtime, rollingSummaryByteLength } = loaded.module;
    const { checkpoint } = buildRollingSummaryCheckpoint({
      topicKey: "pritha-memory",
      task: "Внедрить rolling summary для голосовых Realtime сессий Pritha. ".repeat(10),
      currentStatus: "Checkpoint recall is being integrated with bounded internal context. ".repeat(8),
      keyRefs: Array.from({ length: 8 }, (_, index) => `interfaces/control-center/src/lib/realtime/ref-${index}.ts`),
      keyResources: ["Pritha memory", "Realtime voice control", "Codex task checkpoint"],
      confirmedConstraints: ["No raw transcripts", "No secrets", "No new UI"],
      nextStep: "Load only related summaries at Realtime startup.",
      latestRealtimeSession: {
        sessionId: "voice-current",
        summary: "Operator discussed why Pritha did not remember the previous voice session.",
        userIntents: ["Explain the previous voice session"],
        keyPoints: ["Rolling summary should include session content"],
        nextStep: "Answer from the rolling summary tool.",
      },
      latestCodexTask: {
        taskId: "codex-latest",
        title: "Fix Realtime rolling summary",
        status: "complete",
        phase: "completed",
        subject: "pritha:memory",
        result: "Production was rebuilt and Realtime was verified.",
        refs: ["interfaces/control-center/src/components/voice/usePrithaRealtime.ts"],
        nextStep: "Let the operator test voice recall.",
      },
    });

    const context = formatRollingSummaryForRealtime(checkpoint, 800);

    assert.ok(rollingSummaryByteLength(context) <= 800, `context should be <= 800 bytes, got ${rollingSummaryByteLength(context)}`);
    assert.match(context, /Internal rolling summary checkpoint/);
    assert.match(context, /Latest Realtime session:/);
    assert.match(context, /Latest Codex task:/);
  } finally {
    loaded.cleanup();
  }
});

test("rolling summary key event debounce rejects token-level noise", async () => {
  const loaded = await loadRollingSummaryModule();
  try {
    const { isRollingSummaryKeyEvent, rollingSummaryDebounceDecision, ROLLING_SUMMARY_DEBOUNCE_MS } = loaded.module;

    assert.equal(isRollingSummaryKeyEvent("step_completed"), true);
    assert.equal(isRollingSummaryKeyEvent("session_started"), true);
    assert.equal(isRollingSummaryKeyEvent("session_stopping"), true);
    assert.equal(isRollingSummaryKeyEvent("page_unload_checkpoint"), true);
    assert.equal(isRollingSummaryKeyEvent("response.audio_transcript.delta"), false);
    assert.deepEqual(rollingSummaryDebounceDecision({ sourceEvent: "response.audio_transcript.delta" }), {
      write: false,
      reason: "not_key_event",
      waitMs: 0,
    });
    assert.equal(
      rollingSummaryDebounceDecision({
        sourceEvent: "step_completed",
        nowMs: 20_000,
        lastWriteAtMs: 20_000 - ROLLING_SUMMARY_DEBOUNCE_MS + 100,
      }).write,
      false,
    );
    assert.equal(
      rollingSummaryDebounceDecision({
        sourceEvent: "step_completed",
        nowMs: 20_000,
        lastWriteAtMs: 20_000 - ROLLING_SUMMARY_DEBOUNCE_MS - 1,
      }).write,
      true,
    );
    assert.equal(rollingSummaryDebounceDecision({ sourceEvent: "step_completed", force: true }).reason, "forced");
  } finally {
    loaded.cleanup();
  }
});

test("Control Center wires rolling summaries to private storage and debounced client updates", () => {
  const runtimeSource = readFileSync("interfaces/control-center/src/lib/realtime/pritha-runtime.ts", "utf8");
  const hookSource = readFileSync("interfaces/control-center/src/components/voice/usePrithaRealtime.ts", "utf8");
  const routeSource = readFileSync("interfaces/control-center/src/app/api/realtime/rolling-summary/route.ts", "utf8");

  assert.match(runtimeSource, /function rollingSummaryStorageDir\(\)/);
  assert.match(runtimeSource, /"rolling-summary"/);
  assert.match(runtimeSource, /"current\.json"/);
  assert.match(runtimeSource, /writeRollingSummaryAtomic/);
  assert.match(runtimeSource, /atomicWritePrivateJson/);
  assert.match(runtimeSource, /resourceKey: `rolling-summary:\$\{checkpointPath\}`/);
  assert.doesNotMatch(runtimeSource, /rollingSummaryIsExpired/);
  assert.doesNotMatch(runtimeSource, /await unlink\(checkpointPath\)/);
  assert.match(runtimeSource, /rollingSummaryDebounceDecision/);
  assert.match(runtimeSource, /rolling_summary_checkpoint_saved/);
  assert.match(runtimeSource, /formatRollingSummaryForRealtime/);
  assert.match(runtimeSource, /name: "recall_rolling_summary"/);
  assert.match(runtimeSource, /Use recall_rolling_summary when the operator asks what you discussed last time/);
  assert.match(runtimeSource, /Do not claim the previous conversation is unknown until you have tried recall_rolling_summary/);
  assert.match(runtimeSource, /await getPrithaRollingSummary\(\{/);
  assert.match(runtimeSource, /source: "rolling-summary-current"/);
  assert.match(runtimeSource, /privacy: "summary-only"/);
  assert.match(runtimeSource, /latestRealtimeSession: args\.latestRealtimeSession \?\? args\.latest_realtime_session/);
  assert.match(runtimeSource, /latestCodexTask: args\.latestCodexTask \?\? args\.latest_codex_task/);
  assert.match(runtimeSource, /const contextText = !relevance \|\| relevance\.related \? formatRollingSummaryForRealtime\(checkpoint\) : ""/);
  assert.match(runtimeSource, /context_text: contextText/);
  assert.match(routeSource, /upsertPrithaRollingSummary/);
  assert.match(hookSource, /ROLLING_SUMMARY_CLIENT_DEBOUNCE_MS = 12_000/);
  assert.match(hookSource, /\/api\/realtime\/rolling-summary/);
  assert.match(hookSource, /queueRollingSummaryCheckpoint/);
  assert.match(hookSource, /rollingSummaryEventFromSnapshot/);
  assert.match(hookSource, /connection_lost/);
  assert.match(hookSource, /periodic_checkpoint/);
  assert.match(hookSource, /session_turn/);
  assert.doesNotMatch(hookSource, /checkpointRollingSummaryNow\("session_started"/);
  assert.match(hookSource, /session_stopping/);
  assert.match(hookSource, /page_unload_checkpoint/);
  assert.match(hookSource, /latestRealtimeSession/);
  assert.match(hookSource, /latestCodexTask/);
  assert.match(hookSource, /buildRealtimeSessionSection/);
  assert.match(hookSource, /const codexTasksRef = useRef<CodexTaskState\[\]>\(\[\]\)/);
  assert.match(hookSource, /codexTasksRef\.current = nextTasks/);
  assert.match(hookSource, /const taskSnapshot = codexTasksRef\.current/);
  assert.match(hookSource, /taskSnapshot\.find/);
  assert.match(hookSource, /sendBeacon/);
  assert.match(hookSource, /keepalive: true/);
  assert.match(hookSource, /rollingSummarySessionActiveRef/);
  assert.match(hookSource, /unmountCleanupRef/);
  assert.match(hookSource, /cleanup\.closeConnection\?\.\(\)/);
  assert.match(hookSource, /cleanup\.closeConnection\?\.\(\);\n\s+\};\n\s+\}, \[\]\);/);
  assert.match(hookSource, /sessionData\.tools\.join/);
  assert.doesNotMatch(hookSource, /sendRollingSummaryRecall/);
  assert.doesNotMatch(hookSource, /Internal Rolling Summary Recall/);
  assert.doesNotMatch(hookSource, /rolling_summary_recall_used/);
  assert.doesNotMatch(hookSource, /requestResponse\("rolling_summary_recall"/);
});
