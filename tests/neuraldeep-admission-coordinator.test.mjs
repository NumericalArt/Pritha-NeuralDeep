import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const sourceRoot = "interfaces/control-center/src/lib";

function transpile(source, replacements = []) {
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  return output;
}

async function loadCoordinator() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-admission-"));
  const stateRoot = path.join(tmp, "state");
  mkdirSync(stateRoot, { recursive: true });
  writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
export const resolveTechscopeRoot = () => ${JSON.stringify(tmp)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(stateRoot)};
`);
  writeFileSync(path.join(tmp, "account.mjs"), "export async function getNeuralDeepAccountSnapshot() { return { limits: null }; }\n");
  writeFileSync(path.join(tmp, "private-json.mjs"), transpile(readFileSync(`${sourceRoot}/private-json.ts`, "utf8")));
  writeFileSync(path.join(tmp, "coordinator.mjs"), transpile(
    readFileSync(`${sourceRoot}/codex-chat/admission-coordinator.ts`, "utf8"),
    [
      ['"@/lib/pritha-paths"', '"./pritha-paths.mjs"'],
      ['"@/lib/private-json"', '"./private-json.mjs"'],
      ['"@/lib/settings/neuraldeep-account-server"', '"./account.mjs"'],
      ['"../../../../../scripts/neuraldeep/coordination-store.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/coordination-store.mjs")).href)],
      ['"../../../../../scripts/neuraldeep/operator-requests.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/operator-requests.mjs")).href)],
      ['"../../../../../scripts/neuraldeep/execution-workspaces.mjs"', JSON.stringify(pathToFileURL(path.resolve("scripts/neuraldeep/execution-workspaces.mjs")).href)],
    ],
  ));
  return {
    tmp,
    stateRoot,
    module: await import(`${pathToFileURL(path.join(tmp, "coordinator.mjs")).href}?${Math.random()}`),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

function delay(milliseconds = 25) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("unknown NeuralDeep limit admits only one launch", async () => {
  const loaded = await loadCoordinator();
  try {
    const coordinator = new loaded.module.NeuralDeepAdmissionCoordinator({ ledgerPath: null, limitProvider: async () => null });
    const first = await coordinator.acquire({ attemptId: "attempt_one", surface: "voice", workloadId: "task-one", coordinationKey: "topic-one" });
    let secondAdmitted = false;
    const secondPromise = coordinator.acquire({ attemptId: "attempt_two", surface: "voice", workloadId: "task-two", coordinationKey: "topic-two" })
      .then((lease) => { secondAdmitted = true; return lease; });
    await delay();
    assert.equal(secondAdmitted, false);
    assert.equal(coordinator.snapshot().effectiveLimit, 1);
    await first.release();
    const second = await secondPromise;
    assert.equal(secondAdmitted, true);
    await second.release();
  } finally {
    loaded.cleanup();
  }
});

test("different keys run in parallel while one key remains FIFO", async () => {
  const loaded = await loadCoordinator();
  try {
    const coordinator = new loaded.module.NeuralDeepAdmissionCoordinator({ ledgerPath: null, limitProvider: async () => 3 });
    const first = await coordinator.acquire({ attemptId: "attempt_a1", surface: "voice", workloadId: "task-a1", coordinationKey: "topic-a" });
    let sameKeyAdmitted = false;
    const sameKeyPromise = coordinator.acquire({ attemptId: "attempt_a2", surface: "voice", workloadId: "task-a2", coordinationKey: "topic-a" })
      .then((lease) => { sameKeyAdmitted = true; return lease; });
    const other = await coordinator.acquire({ attemptId: "attempt_b1", surface: "task_chat", workloadId: "turn-b1", coordinationKey: "chat-b" });
    await delay();
    assert.equal(sameKeyAdmitted, false);
    assert.deepEqual(coordinator.snapshot().active.map((entry) => entry.attemptId).sort(), ["attempt_a1", "attempt_b1"]);
    await first.release();
    const second = await sameKeyPromise;
    assert.equal(sameKeyAdmitted, true);
    await Promise.all([second.release(), other.release()]);
  } finally {
    loaded.cleanup();
  }
});

test("a lower live limit does not interrupt active work and stops new admission", async () => {
  const loaded = await loadCoordinator();
  try {
    let limit = 2;
    const coordinator = new loaded.module.NeuralDeepAdmissionCoordinator({ ledgerPath: null, limitProvider: async () => limit, limitCacheMs: 100 });
    const first = await coordinator.acquire({ attemptId: "attempt_limit1", surface: "voice", workloadId: "task-limit1", coordinationKey: "topic-limit1" });
    const second = await coordinator.acquire({ attemptId: "attempt_limit2", surface: "voice", workloadId: "task-limit2", coordinationKey: "topic-limit2" });
    limit = 1;
    coordinator.invalidateLimit();
    let thirdAdmitted = false;
    const thirdPromise = coordinator.acquire({ attemptId: "attempt_limit3", surface: "task_chat", workloadId: "turn-limit3", coordinationKey: "chat-limit3" })
      .then((lease) => { thirdAdmitted = true; return lease; });
    await first.release();
    await delay();
    assert.equal(thirdAdmitted, false);
    assert.equal(coordinator.snapshot().active.length, 1);
    await second.release();
    const third = await thirdPromise;
    await third.release();
  } finally {
    loaded.cleanup();
  }
});

test("queued cancellation and predecessor blocking never start the launch", async () => {
  const loaded = await loadCoordinator();
  try {
    const coordinator = new loaded.module.NeuralDeepAdmissionCoordinator({ ledgerPath: null, limitProvider: async () => 1 });
    const active = await coordinator.acquire({ attemptId: "attempt_active", surface: "voice", workloadId: "task-active", coordinationKey: "topic-active" });
    const abort = new AbortController();
    const cancelled = coordinator.acquire({
      attemptId: "attempt_cancel",
      surface: "voice",
      workloadId: "task-cancel",
      coordinationKey: "topic-cancel",
      signal: abort.signal,
    });
    abort.abort();
    await assert.rejects(cancelled, (error) => error.code === "admission_cancelled");

    const blocked = coordinator.acquire({ attemptId: "attempt_blocked", surface: "voice", workloadId: "task-blocked", coordinationKey: "topic-blocked" });
    await delay();
    assert.deepEqual(await coordinator.rejectWaitingForCoordinationKey("topic-blocked"), ["attempt_blocked"]);
    await assert.rejects(blocked, (error) => error.code === "predecessor_confirmation_required");
    await active.release();
    assert.equal(coordinator.snapshot().queued.length, 0);
  } finally {
    loaded.cleanup();
  }
});

test("an approved predecessor resumes ahead of later cards for the same paused topic", async () => {
  const loaded = await loadCoordinator();
  try {
    const coordinator = new loaded.module.NeuralDeepAdmissionCoordinator({ ledgerPath: null, limitProvider: async () => 2 });
    coordinator.pauseCoordinationKey("topic-approval", "waiting_for_approval");
    let laterAdmitted = false;
    const laterPromise = coordinator.acquire({
      attemptId: "attempt_later",
      surface: "voice",
      workloadId: "task-later",
      coordinationKey: "topic-approval",
    }).then((lease) => { laterAdmitted = true; return lease; });
    await delay();
    assert.equal(laterAdmitted, false);

    const predecessor = await coordinator.acquire({
      attemptId: "attempt_predecessor",
      surface: "voice",
      workloadId: "task-predecessor",
      coordinationKey: "topic-approval",
      predecessorPriority: true,
      resumePausedKey: true,
    });
    assert.equal(predecessor.attemptId, "attempt_predecessor");
    assert.equal(laterAdmitted, false);
    await predecessor.release();
    const later = await laterPromise;
    await later.release();
  } finally {
    loaded.cleanup();
  }
});

test("persisted queued and active admissions require confirmation after restart", async () => {
  const loaded = await loadCoordinator();
  try {
    const ledgerPath = path.join(loaded.stateRoot, "codex-chat", "admission-registry.json");
    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, `${JSON.stringify({
      version: 1,
      updatedAt: "2026-09-03T00:00:00.000Z",
      attempts: [
        { attemptId: "attempt_restart1", surface: "voice", workloadId: "task-restart1", coordinationKeyHash: "a".repeat(24), status: "active", queuedAt: "2026-09-03T00:00:00.000Z", admittedAt: "2026-09-03T00:00:01.000Z", finishedAt: null },
        { attemptId: "attempt_restart2", surface: "task_chat", workloadId: "turn-restart2", coordinationKeyHash: "b".repeat(24), status: "queued", queuedAt: "2026-09-03T00:00:02.000Z", admittedAt: null, finishedAt: null },
      ],
    })}\n`);
    const coordinator = new loaded.module.NeuralDeepAdmissionCoordinator({ stateRoot: loaded.stateRoot, ledgerPath, limitProvider: async () => 1 });
    const abort = new AbortController();
    let admitted = false;
    const pending = coordinator.acquire({ attemptId: "attempt_after_restart", surface: "voice", workloadId: "task-after", coordinationKey: "topic-after", signal: abort.signal })
      .then(lease => { admitted = true; return lease; });
    const cancellation = assert.rejects(pending, error => error.code === "admission_cancelled");
    await delay(60);
    assert.equal(admitted, false, "unresolved old processes retain admission until reconciled");
    assert.equal(coordinator.snapshot().unresolved.length, 2);
    abort.abort();
    await cancellation;
    const saved = JSON.parse(readFileSync(ledgerPath, "utf8"));
    assert.deepEqual(saved.attempts.slice(0, 2).map((entry) => entry.status), ["resume_confirmation_required", "resume_confirmation_required"]);
    coordinator.close();
  } finally {
    loaded.cleanup();
  }
});

test("an unstarted provider wait reacquires its own attempt without replaying any runtime or stale release", async () => {
  const loaded = await loadCoordinator();
  const coordinator = new loaded.module.NeuralDeepAdmissionCoordinator({ ledgerPath: null, limitProvider: async () => 2 });
  const request = { attemptId: "attempt_provider_wait", surface: "task_chat", workloadId: "turn-provider-wait", coordinationKey: "scope-provider-wait" };
  try {
    const first = await coordinator.acquire(request); await first.release("waiting_for_provider");
    await assert.rejects(coordinator.acquire(request), { code: "admission_attempt_duplicate" });
    const resumed = await coordinator.acquire({ ...request, unstartedOwnerToken: first.launcherReceipt.ownerToken });
    assert.notEqual(resumed.launcherReceipt.ownerToken,first.launcherReceipt.ownerToken);
    await first.release("completed"); assert.equal(coordinator.snapshot().active.length,1);
    await resumed.release("waiting_for_provider");
    assert.equal(await coordinator.cancelUnstarted(request.attemptId,first.launcherReceipt.ownerToken),false);
    assert.equal(await coordinator.cancelUnstarted(request.attemptId,resumed.launcherReceipt.ownerToken),true);
    const next=await coordinator.acquire({...request,attemptId:"attempt_after_cancel",workloadId:"turn-after-cancel"});await next.release();
  } finally { coordinator.close();loaded.cleanup(); }
});

test('new direct message automatically releases a stopped predecessor with process proof',async()=>{
  const loaded=await loadCoordinator();
  const {NeuralDeepCoordinationStore,coordinationHash}=await import('../scripts/neuraldeep/coordination-store.mjs');
  const databasePath=path.join(loaded.tmp,'cleanup.sqlite');
  const store=new NeuralDeepCoordinationStore({databasePath});
  let coordinator;
  try{
    const resources=[{kind:'path',key:path.join(loaded.tmp,'workspace'),mode:'write'}];
    store.enqueue({attemptId:'old',workloadId:'old-turn',surface:'task_chat',coordinationKeyHash:coordinationHash('chat'),queuedAt:new Date().toISOString(),resources});
    const prior=store.claim('old',1);
    store.beginRuntimeRun({runId:'old_run',requestHash:'a'.repeat(64),receipt:{process_protocol:1,process_exited:true,process_tree_exited:true,adapter_closed:true}});
    store.attachRuntime('old',prior.ownerToken,'old_run');store.finish('old',prior.ownerToken,'failed');
    coordinator=new loaded.module.NeuralDeepAdmissionCoordinator({databasePath,ledgerPath:null,limitProvider:async()=>1});
    const lease=await coordinator.acquire({attemptId:'new',workloadId:'new-turn',surface:'task_chat',coordinationKey:'chat',resources,signal:AbortSignal.timeout(2000)});
    assert.equal(lease.attemptId,'new');assert.equal(store.get('old').status,'cancelled');await lease.release();
  }finally{await coordinator?.close();store.close();loaded.cleanup();}
});
