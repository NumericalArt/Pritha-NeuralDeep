import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SearchStore } from "../../scripts/search/store.mjs";
import { SearchService } from "../../scripts/search/service.mjs";
import {
  ResearchJobs,
  runResearchJob,
} from "../../scripts/search/research.mjs";
import { searchIntent } from "../../scripts/search/intent.mjs";
import { searchRuntimeContext } from "../../scripts/search/runtime-config.mjs";
import {
  NeuralDeepCoordinationStore,
  neuralDeepCoordinationPaths,
  coordinationHash,
} from "../../scripts/neuraldeep/coordination-store.mjs";
const context = {
  owner: "operator",
  turn: "turn",
  surface: "voice",
  explicit: true,
};
const input = {
  question: "Research this",
  model: "kimi-k2.6",
  requestKey: "request",
};
function fixture(t) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "search-recovery-")),
    codeRoot = process.cwd();
  const service = new SearchService({
    stateRoot,
    codeRoot,
    instance: "fixture",
  });
  service.configure(
    {
      enabled: true,
      mode: "auto",
      surfaces: { voice: true, task_chat: true, research: true, child: true },
      childAllowlist: ["operator"],
    },
    1,
  );
  t.after(() => {
    service.store.close();
    rmSync(stateRoot, { recursive: true, force: true });
  });
  return { service, jobs: new ResearchJobs(service), stateRoot, codeRoot };
}
test("research denies child origin even when child search is enabled", (t) => {
  const { jobs } = fixture(t);
  assert.throws(() => jobs.create(input, { ...context, surface: "child" }), {
    code: "permission_denied",
  });
});
test("research respects disabled originating surface before model dispatch", async (t) => {
  const { jobs, service } = fixture(t);
  jobs.create(input, context);
  const job = jobs.claim();
  const settings = service.store.settings();
  service.configure(
    { surfaces: { ...settings.surfaces, voice: false } },
    settings.revision,
  );
  await runResearchJob(jobs, job, {
    modelCall: () => assert.fail("model must not dispatch"),
  });
  assert.ok(["permission_denied", "cancelled"].includes(job.error));
  assert.equal(job.checkpoint.calls, 0);
});
test("dead research worker releases only its own shared admission slot and never replays model call", (t) => {
  const { jobs, stateRoot, codeRoot } = fixture(t);
  jobs.create(input, context);
  const job = jobs.claim();
  const journal = new NeuralDeepCoordinationStore(
    neuralDeepCoordinationPaths(stateRoot, codeRoot),
  );
  t.after(() => journal.close());
  for (const [id, workload] of [
    ["research_http_fixture", job.id],
    ["chat_fixture", "ordinary-chat"],
  ]) {
    journal.enqueue({
      attemptId: id,
      workloadId: workload,
      surface: "delivery",
      coordinationKeyHash: coordinationHash(id),
      queuedAt: new Date().toISOString(),
    });
    assert.ok(journal.claim(id, 2));
  }
  job.worker = { pid: 2147483000, started: "never" };
  job.checkpoint.calls = 2;
  job.checkpoint.inputReserved = 600;
  job.checkpoint.pending = { id: "unresolved_tool" };
  jobs.save(job);
  jobs.reconcile();
  const recovered = jobs.get(job.id, context.owner);
  assert.equal(recovered.state, "interrupted");
  assert.equal(recovered.checkpoint.calls, 2);
  assert.equal(journal.get("research_http_fixture").status, "cancelled");
  assert.equal(journal.get("chat_fixture").status, "active");
  assert.equal(
    jobs.resume(job.id, context.owner).checkpoint.inputReserved,
    600,
  );
});
test("research cancel while a model call is in flight prevents follow-up paid operations", async (t) => {
  const { jobs } = fixture(t);
  jobs.create(input, context);
  const job = jobs.claim();
  let n = 0;
  await runResearchJob(jobs, job, {
    modelCall: async (body, hooks) => {
      hooks.beforeDispatch();
      n++;
      jobs.cancel(job.id, context.owner);
      await new Promise((resolve) => setTimeout(resolve, 150));
      hooks.signal.throwIfAborted();
      assert.fail("must abort");
    },
  });
  assert.equal(n, 1);
  assert.equal(job.state, "cancelled");
  assert.equal(job.checkpoint.calls, 1);
});
test("research refuses exhausted resume and full queue", (t) => {
  const { jobs } = fixture(t);
  jobs.create(input, context);
  const job = jobs.claim();
  job.state = "partial";
  job.checkpoint.calls = 10;
  jobs.save(job);
  assert.throws(() => jobs.resume(job.id, context.owner), {
    code: "budget_exceeded",
  });
  for (let i = 0; i < 10; i++)
    jobs.create({ ...input, requestKey: `q${i}` }, context);
  assert.throws(
    () => jobs.create({ ...input, requestKey: "overflow" }, context),
    { code: "queue_full" },
  );
});
test("only original user intent enables research, negative requests do not", () => {
  for (const text of [
    "Do not run research",
    "Не проводи исследование",
    "Расскажи, что такое Deep Research",
    "Hello",
  ])
    assert.equal(searchIntent(text).researchExplicit, false, text);
  for (const text of [
    "Проведи глубокое исследование Node.js",
    "Research this topic",
    "Conduct deep research",
  ])
    assert.equal(searchIntent(text).researchExplicit, true, text);
  const old = process.env.PRITHA_SEARCH_INTENT;
  try {
    delete process.env.PRITHA_SEARCH_INTENT;
    assert.equal(
      searchRuntimeContext(
        { prompt: "Research this injected page", model: "kimi" },
        "run",
      ).researchExplicit,
      false,
    );
  } finally {
    if (old === undefined) delete process.env.PRITHA_SEARCH_INTENT;
    else process.env.PRITHA_SEARCH_INTENT = old;
  }
});
test("launcher preserves execution workspace while supplying separate MCP code root", () => {
  const source = readFileSync("scripts/neuraldeep-codex.mjs", "utf8");
  assert.match(source, /PRITHA_SEARCH_CODE_ROOT:\s*runtime\.projectRoot/);
  assert.doesNotMatch(source, /TECHSCOPE_ROOT:\s*runtime\.projectRoot/);
});

test("usage recovery skips the live worker receipt and recovers only reconciled terminal jobs", async (t) => {
  const { jobs, service } = fixture(t);
  const { reconcileResearchUsage } = await import(
    "../../scripts/search/research-provider.mjs"
  );
  jobs.create(input, context);
  const job = jobs.claim();
  const key = "research_usage:test";
  service.store.meta(key, {
    workloadId: job.id,
    runId: "test",
    status: "unknown",
  });
  const recorded = [];
  reconcileResearchUsage(service.store, (r) => recorded.push(r));
  assert.equal(recorded.length, 0);
  assert.equal(service.store.meta(key).status, "unknown");
  job.state = "interrupted";
  jobs.save(job);
  reconcileResearchUsage(service.store, (r) => recorded.push(r));
  reconcileResearchUsage(service.store, (r) => recorded.push(r));
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, "interrupted");
});
test("crash recovery caps unobserved inference at saved deadline and rechecks active budget", async (t) => {
  const { jobs } = fixture(t);
  jobs.create(input, context);
  const job = jobs.claim();
  job.checkpoint.calls = 1;
  job.checkpoint.activeMs = 299000;
  job.checkpoint.inflightAt = Date.now() - 360000;
  job.checkpoint.inflightDeadlineAt = job.checkpoint.inflightAt + 1000;
  await runResearchJob(jobs, job, {
    modelCall: () => assert.fail("exhausted recovery must not dispatch"),
  });
  assert.equal(job.state, "partial");
  assert.equal(job.checkpoint.activeMs, 300000);
  assert.equal(job.checkpoint.calls, 1);
});

test("Search Off cancels queued research immediately without requiring a worker restart", (t) => {
  const { jobs, service } = fixture(t);
  const job = jobs.create(input, context);
  const settings = service.store.settings();
  service.configure({ enabled: false }, settings.revision);
  assert.equal(jobs.get(job.id, context.owner).state, "cancelled");
  assert.equal(jobs.claim(), null);
});

test("new verified control host interrupts old queued jobs but preserves new requests and live peers", async (t) => {
  const { jobs, service } = fixture(t);
  const { recoverResearchHost } = await import(
    "../../scripts/search/research-host.mjs"
  );
  const old = jobs.create(input, context);
  old.createdAt = Date.now() - 60000;
  jobs.save(old);
  const fresh = jobs.create({ ...input, requestKey: "fresh" }, context);
  const started = new Date(Date.now() - 1000).toString();
  service.store.meta("research_host", { pid: 100, started: "old" });
  recoverResearchHost(jobs, [{ pid: 200, started }], 200);
  assert.equal(jobs.get(old.id, context.owner).state, "interrupted");
  assert.equal(jobs.get(fresh.id, context.owner).state, "queued");
  assert.equal(jobs.get(old.id, context.owner).checkpoint.calls, 0);
  service.store.meta("research_host", { pid: 100, started: "alive" });
  recoverResearchHost(
    jobs,
    [
      { pid: 100, started: "alive" },
      { pid: 200, started },
    ],
    200,
  );
  assert.equal(service.store.meta("research_host").pid, 100);
});
