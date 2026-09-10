import { test } from "node:test";
import assert from "node:assert/strict";
import { SearchStore } from "../../scripts/search/store.mjs";
import { SearchService } from "../../scripts/search/service.mjs";
import {
  ResearchJobs,
  runResearchJob,
  renderResearchReport,
} from "../../scripts/search/research.mjs";
function fixture() {
  const store = new SearchStore({ databasePath: ":memory:", environment: {} });
  const service = new SearchService({
    store,
    verifyUrl: async (u) => u,
    providers: {
      neuraldeep: {
        search: async () => ({
          items: [
            { url: "https://example.com/a", content: "fact", title: "Primary" },
          ],
        }),
        read: async () => ({
          items: [
            { url: "https://example.com/a", content: "fact", title: "Primary" },
          ],
        }),
      },
    },
  });
  service.configure(
    {
      enabled: true,
      mode: "auto",
      surfaces: { task_chat: true, voice: true, child: false, research: true },
    },
    1,
  );
  const jobs = new ResearchJobs(service),
    context = { owner: "a", turn: "t", surface: "research", explicit: true };
  return { store, service, jobs, context };
}
test("research creation idempotent, ownership and explicit intent enforced", () => {
  const { jobs, context, store } = fixture();
  const input = {
    question: "Research this",
    model: "kimi-k2.6",
    requestKey: "k",
  };
  const a = jobs.create(input, context);
  assert.equal(jobs.create(input, context).id, a.id);
  assert.throws(
    () => jobs.create({ ...input, question: "different" }, context),
    { code: "idempotency_conflict" },
  );
  assert.throws(() => jobs.get(a.id, "b"), { code: "not_found" });
  assert.throws(
    () =>
      jobs.create(
        { ...input, requestKey: "new" },
        { ...context, explicit: false },
      ),
    { code: "explicit_research_required" },
  );
  jobs.cancel(a.id, "a");
  assert.equal(jobs.cancel(a.id, "a").state, "cancelled");
  store.close();
});
test("research only search/read, model calls reserved before dispatch, verified report", async () => {
  const { jobs, context, store } = fixture();
  jobs.create(
    { question: "Research", model: "kimi-k2.6", requestKey: "k" },
    context,
  );
  const job = jobs.claim();
  let calls = 0;
  await runResearchJob(jobs, job, {
    modelCall: async (body, hooks) => {
      hooks.beforeDispatch();
      assert.deepEqual(
        body.tools.map((t) => t.function.name),
        ["web_search", "read_page"],
      );
      calls++;
      if (calls === 1)
        return {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "call1",
                    type: "function",
                    function: {
                      name: "read_page",
                      arguments: JSON.stringify({
                        url: "https://example.com/a",
                      }),
                    },
                  },
                ],
              },
            },
          ],
        };
      const source = job.checkpoint.sources[0];
      return {
        usage: { completion_tokens: 100 },
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Evidence",
                findings: [
                  { text: "A supported statement.", source_ids: [source.id] },
                ],
                limitations: ["Publication date unknown"],
              }),
            },
          },
        ],
      };
    },
  });
  assert.equal(job.state, "completed");
  assert.match(job.checkpoint.report, /https:\/\/example.com/);
  assert.equal(job.checkpoint.calls, 2);
  store.close();
});
test("fabricated source citation rejected", () => {
  assert.throws(
    () =>
      renderResearchReport(
        {
          title: "x",
          findings: [{ text: "x", source_ids: ["fake"] }],
          limitations: [],
        },
        [],
      ),
    { code: "invalid_report" },
  );
});
test("budget yields partial, not fabricated completion", async () => {
  const { jobs, context, store } = fixture();
  jobs.create(
    { question: "Research", model: "kimi-k2.6", requestKey: "k" },
    context,
  );
  const job = jobs.claim();
  job.checkpoint.calls = 10;
  await runResearchJob(jobs, job, {
    modelCall: () => assert.fail("must not call"),
  });
  assert.equal(job.state, "partial");
  assert.equal(job.error, "budget_exceeded");
  store.close();
});
