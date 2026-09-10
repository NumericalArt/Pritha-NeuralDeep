import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

async function loadContinuationModule() {
  const source = readFileSync("interfaces/control-center/src/lib/realtime/codex-task/continuation.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-continuation-test-"));
  const modulePath = path.join(tmp, "continuation.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("Codex task continuation resolver auto-selects a strong stopped-task match", async () => {
  const loaded = await loadContinuationModule();
  try {
    const { resolveCodexTaskContinuation } = loaded.module;
    const result = resolveCodexTaskContinuation(
      {
        taskText: "Continue the Control Center voice task continuation implementation and add final tests.",
        taskType: "implementation",
        threadScope: { kind: "pritha", id: "control-center", label: "Pritha Control Center" },
      },
      [
        {
          taskId: "2026-06-27-parent",
          status: "complete",
          taskType: "implementation",
          taskText: "Implement Control Center voice task continuation routing.",
          resultExcerpt: "Resolver and UI work are partially complete; next action is tests.",
          threadScope: { kind: "pritha", id: "control-center", label: "Pritha Control Center" },
          updatedAt: "2026-06-27T12:00:00.000Z",
        },
      ],
    );

    assert.equal(result.action, "continue");
    assert.equal(result.selected.taskId, "2026-06-27-parent");
    assert.equal(result.confidence, "high");
    assert.match(result.selected.reasons.join(","), /same_thread_scope/);
    assert.match(result.selected.reasons.join(","), /continuation_cue/);
  } finally {
    loaded.cleanup();
  }
});

test("Codex task continuation resolver asks by voice for ambiguous candidates", async () => {
  const loaded = await loadContinuationModule();
  try {
    const { resolveCodexTaskContinuation } = loaded.module;
    const candidates = [
      {
        taskId: "task-a",
        status: "failed_timeout",
        taskType: "implementation",
        taskText: "Continue PictureBoom image inbox implementation.",
        resultExcerpt: "Timed out during verification.",
        threadScope: { kind: "agent", id: "pictureboom", label: "PictureBoom" },
      },
      {
        taskId: "task-b",
        status: "complete",
        taskType: "implementation",
        taskText: "Continue PictureBoom feed UI implementation.",
        resultExcerpt: "Completed UI pass, next action is image inbox verification.",
        threadScope: { kind: "agent", id: "pictureboom", label: "PictureBoom" },
      },
    ];

    const result = resolveCodexTaskContinuation(
      {
        taskText: "Continue PictureBoom.",
        taskType: "implementation",
        threadScope: { kind: "agent", id: "pictureboom", label: "PictureBoom" },
      },
      candidates,
    );

    assert.equal(result.action, "ask");
    assert.equal(result.confidence, "medium");
    assert.equal(result.candidates.length, 2);
    assert.match(result.reason, /ambiguous|medium/);
  } finally {
    loaded.cleanup();
  }
});

test("Codex task continuation resolver respects explicit and force-new choices", async () => {
  const loaded = await loadContinuationModule();
  try {
    const { resolveCodexTaskContinuation } = loaded.module;
    const candidates = [
        {
          taskId: "rejected-parent",
          shortId: "A7K",
          status: "rejected",
        taskType: "review",
        taskText: "Review Pritha voice safety.",
        resultExcerpt: "Rejected before execution.",
        threadScope: { kind: "pritha", id: "control-center", label: "Pritha Control Center" },
      },
    ];

    const explicit = resolveCodexTaskContinuation(
      {
        taskText: "Continue that rejected safety review with a narrower scope.",
        taskType: "review",
        explicitTaskId: "rejected-parent",
      },
      candidates,
    );
    assert.equal(explicit.action, "continue");
    assert.equal(explicit.selected.status, "rejected");
    assert.deepEqual(explicit.selected.reasons, ["explicit_task_id"]);

    const explicitShort = resolveCodexTaskContinuation(
      {
        taskText: "Продолжи A7K.",
        taskType: "review",
        explicitTaskId: "A7K",
      },
      candidates,
    );
    assert.equal(explicitShort.action, "continue");
    assert.equal(explicitShort.selected.taskId, "rejected-parent");
    assert.deepEqual(explicitShort.selected.reasons, ["explicit_short_task_id"]);

    const forced = resolveCodexTaskContinuation(
      {
        taskText: "Continue that rejected safety review with a narrower scope.",
        taskType: "review",
        explicitTaskId: "rejected-parent",
        mode: "force_new",
      },
      candidates,
    );
    assert.equal(forced.action, "new");
    assert.equal(forced.reason, "force_new_requested");
  } finally {
    loaded.cleanup();
  }
});

test("Codex task continuation resolver creates a new task for unrelated requests", async () => {
  const loaded = await loadContinuationModule();
  try {
    const { resolveCodexTaskContinuation, isStoppedCodexTaskStatus, isActiveCodexTaskStatus, isBlockedCodexTaskStatus } = loaded.module;
    const result = resolveCodexTaskContinuation(
      {
        taskText: "Research current weather APIs for a travel helper.",
        taskType: "research",
      },
      [
        {
          taskId: "voice-ui-parent",
          status: "complete",
          taskType: "implementation",
          taskText: "Implement Control Center voice UI task cards.",
          threadScope: { kind: "pritha", id: "control-center", label: "Pritha Control Center" },
        },
      ],
    );

    assert.equal(result.action, "new");
    assert.equal(result.reason, "no_suitable_continuation_candidate");
    assert.equal(isStoppedCodexTaskStatus("failed_timeout"), true);
    assert.equal(isStoppedCodexTaskStatus("rejected"), true);
    assert.equal(isStoppedCodexTaskStatus("aborted"), true);
    assert.equal(isActiveCodexTaskStatus("running"), true);
    assert.equal(isBlockedCodexTaskStatus("waiting_for_operator"), true);
  } finally {
    loaded.cleanup();
  }
});
