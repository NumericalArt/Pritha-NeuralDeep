import {
  NeuralDeepCoordinationStore,
  neuralDeepCoordinationPaths,
} from "../neuraldeep/coordination-store.mjs";
import { randomUUID } from "node:crypto";
import { hash } from "./store.mjs";
import { fail, TOOL_INSTRUCTIONS } from "./contracts.mjs";
import { jsonTools } from "./tools.mjs";
import { callSearchTool } from "./tools.mjs";
import { processSnapshot } from "../neuraldeep/process-snapshot.mjs";
const TERMINAL = ["completed", "partial", "failed", "cancelled", "interrupted"];
export class ResearchJobs {
  constructor(service) {
    this.service = service;
    this.store = service.store;
  }
  create({ question, model, requestKey }, context) {
    if (context.surface === "child") fail("permission_denied");
    this.service.allowed(this.service.context(context), this.store.settings());
    const c = this.service.context({ ...context, surface: "research" });
    this.service.allowed(c, this.store.settings());
    if (!c.explicit) fail("explicit_research_required");
    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > 4000 ||
      !/^[-\w.:/]{1,192}$/.test(model) ||
      !/^[-\w:]{1,160}$/.test(requestKey)
    )
      fail("invalid_request");
    return this.store.transaction(() => {
      const fingerprint = hash([question, model]);
      const prior = this.store.db
        .prepare("SELECT * FROM jobs WHERE owner=? AND request_key=?")
        .get(c.owner, requestKey);
      if (prior) {
        if (prior.request_hash !== fingerprint) fail("idempotency_conflict");
        return JSON.parse(prior.value);
      }
      if (
        this.store.db
          .prepare("SELECT count(*) AS n FROM jobs WHERE state='queued'")
          .get().n >= 10
      )
        fail("queue_full");
      const now = Date.now(),
        job = {
          id: `research_${randomUUID()}`,
          owner: c.owner,
          model,
          question: question.trim(),
          originSurface: context.surface,
          state: "queued",
          phase: "queued",
          createdAt: now,
          updatedAt: now,
          checkpoint: {
            messages: null,
            calls: 0,
            inputReserved: 0,
            outputReserved: 0,
            activeMs: 0,
            sources: [],
            report: null,
          },
          worker: null,
          error: null,
        };
      this.store.db
        .prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?)")
        .run(
          job.id,
          c.owner,
          requestKey,
          fingerprint,
          job.state,
          JSON.stringify(job),
          now,
        );
      return job;
    });
  }
  get(id, owner) {
    if (!/^research_[a-f0-9-]{36}$/.test(id)) fail("invalid_request");
    const row = this.store.db
      .prepare("SELECT value FROM jobs WHERE id=? AND owner=?")
      .get(id, owner);
    if (!row) fail("not_found");
    return JSON.parse(row.value);
  }
  list(owner) {
    this.reconcile();
    return this.store.db
      .prepare(
        "SELECT value FROM jobs WHERE owner=? ORDER BY updated DESC LIMIT 30",
      )
      .all(owner)
      .map((r) => JSON.parse(r.value));
  }
  save(job) {
    job.updatedAt = Date.now();
    this.store.db
      .prepare(
        "UPDATE jobs SET state=?,value=?,updated=? WHERE id=? AND owner=?",
      )
      .run(job.state, JSON.stringify(job), job.updatedAt, job.id, job.owner);
    return job;
  }
  reconcile() {
    const rows = this.store.db
      .prepare("SELECT value FROM jobs WHERE state IN ('running','cancelling')")
      .all();
    if (!rows.length) return;
    const snapshot = processSnapshot();
    for (const row of rows) {
      const job = JSON.parse(row.value);
      if (
        !job.worker ||
        !snapshot.some(
          (p) => p.pid === job.worker.pid && p.started === job.worker.started,
        )
      ) {
        job.state = job.state === "cancelling" ? "cancelled" : "interrupted";
        job.phase = job.state;
        job.error = "worker_interrupted";
        this.releaseDeadAdmission(job);
        this.save(job);
      }
    }
  }
  releaseDeadAdmission(job) {
    if (!this.service.stateRoot || !this.service.codeRoot) return;
    const journal = new NeuralDeepCoordinationStore(
      neuralDeepCoordinationPaths(
        this.service.stateRoot,
        this.service.codeRoot,
      ),
    );
    try {
      for (const row of journal.db
        .prepare(
          "SELECT id FROM attempts WHERE workload=? AND id LIKE 'research_http_%'",
        )
        .all(job.id)) {
        const entry = journal.get(row.id);
        if (entry.status === "active")
          journal.finish(entry.attemptId, entry.ownerToken, "cancelled");
        else if (entry.status === "queued")
          journal.cancelQueued(entry.attemptId);
      }
    } finally {
      journal.close();
    }
  }
  claim() {
    return this.store.transaction(() => {
      if (
        this.store.db
          .prepare(
            "SELECT id FROM jobs WHERE state IN ('running','cancelling')",
          )
          .get()
      )
        return null;
      const row = this.store.db
        .prepare(
          "SELECT value FROM jobs WHERE state='queued' ORDER BY updated LIMIT 1",
        )
        .get();
      if (!row) return null;
      const job = JSON.parse(row.value),
        proc = processSnapshot().find((p) => p.pid === process.pid);
      if (!proc) fail("worker_identity_unavailable");
      job.worker = { pid: proc.pid, started: proc.started };
      job.state = "running";
      return this.save(job);
    });
  }
  cancel(id, owner) {
    return this.store.transaction(() => {
      const job = this.get(id, owner);
      if (TERMINAL.includes(job.state)) return job;
      job.state = job.state === "queued" ? "cancelled" : "cancelling";
      job.phase = job.state;
      return this.save(job);
    });
  }
  resume(id, owner) {
    return this.store.transaction(() => {
      const job = this.get(id, owner);
      if (job.state === "queued" || job.state === "running") return job;
      if (!["interrupted", "partial"].includes(job.state))
        fail("resume_unavailable");
      if (
        job.checkpoint.calls >= 10 ||
        job.checkpoint.inputReserved >= 60000 ||
        job.checkpoint.outputReserved >= 8000 ||
        job.checkpoint.activeMs >= 300000
      )
        fail("budget_exceeded");
      this.service.allowed(
        {
          owner: job.owner,
          turn: job.id,
          surface: job.originSurface || "research",
          explicit: true,
        },
        this.store.settings(),
      );
      this.service.allowed(
        { owner: job.owner, turn: job.id, surface: "research", explicit: true },
        this.store.settings(),
      );
      if (
        this.store.db
          .prepare("SELECT count(*) AS n FROM jobs WHERE state='queued'")
          .get().n >= 10
      )
        fail("queue_full");
      job.state = "queued";
      job.phase = "queued";
      job.error = null;
      job.worker = null;
      return this.save(job);
    });
  }
}
export function renderResearchReport(value, sources) {
  if (
    !value ||
    typeof value.title !== "string" ||
    !Array.isArray(value.findings) ||
    !Array.isArray(value.limitations)
  )
    fail("invalid_report");
  const known = new Map(sources.filter((s) => s.read).map((s) => [s.id, s]));
  const findings = [];
  const refs = new Map();
  for (const f of value.findings.slice(0, 30)) {
    if (
      typeof f.text !== "string" ||
      !Array.isArray(f.source_ids) ||
      !f.source_ids.length ||
      f.source_ids.some((id) => !known.has(id)) ||
      /https?:\/\//i.test(f.text)
    )
      fail("invalid_report");
    const citations = f.source_ids.map((id) => {
      if (!refs.has(id)) refs.set(id, refs.size + 1);
      return `[${refs.get(id)}]`;
    });
    findings.push(`- ${f.text.slice(0, 2000)} ${citations.join(" ")}`);
  }
  if (!findings.length) fail("insufficient_sources");
  const clean = (t) =>
    String(t)
      .replace(/https?:\/\/\S+/g, "[unverified URL omitted]")
      .slice(0, 2000);
  return `# ${clean(value.title)}\n\n${findings.join("\n")}\n\n## Limitations\n\n${value.limitations.map((t) => `- ${clean(t)}`).join("\n") || "- Publication dates and source coverage must be checked."}\n\n## Sources\n\n${[
    ...refs,
  ]
    .map(([id, n]) => {
      const s = known.get(id);
      return `${n}. [${s.title.replace(/[\[\]\n]/g, "") || "Source"}](<${s.url}>) (read ${s.retrieved_at}; publication ${s.published_at || "unknown"})`;
    })
    .join("\n")}`;
}
export async function runResearchJob(
  jobs,
  job,
  { modelCall, signal = new AbortController().signal } = {},
) {
  const origin = {
    owner: job.owner,
    turn: job.id,
    surface: job.originSurface || "research",
    explicit: true,
  };
  const c = {
    surface: "research",
    owner: job.owner,
    turn: job.id,
    explicit: true,
    signal,
  };
  const cp = job.checkpoint;
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  c.signal = combined;
  const timer = setInterval(() => {
    try {
      const current = jobs.get(job.id, job.owner);
      if (current.state === "cancelling")
        controller.abort(
          Object.assign(new Error("cancelled"), { code: "cancelled" }),
        );
      jobs.service.allowed(origin, jobs.store.settings());
      jobs.service.allowed(c, jobs.store.settings());
    } catch (e) {
      controller.abort(e);
    }
  }, 100);
  timer.unref();
  const persist = () => {
    const current = jobs.get(job.id, job.owner);
    if (current.state === "cancelling") {
      controller.abort(
        Object.assign(new Error("cancelled"), { code: "cancelled" }),
      );
      return;
    }
    jobs.save(job);
  };
  cp.messages ||= [
    {
      role: "system",
      content: `You are a bounded research worker. ${TOOL_INSTRUCTIONS} Only web_search and read_page exist. Plan at most five subqueries. Read primary sources, resolve gaps and then return JSON only: {title,findings:[{text,source_ids:[id]}],limitations:[text]}. Every finding requires at least one READ source ID. Never invent IDs, dates or links; no raw URLs in findings. If sources are insufficient, say so in limitations and return findings: [].`,
    },
    { role: "user", content: job.question },
  ];
  try {
    while (cp.calls < 10 && cp.activeMs < 300000) {
      combined.throwIfAborted();
      jobs.service.allowed(origin, jobs.store.settings());
      jobs.service.allowed(c, jobs.store.settings());
      // Incomplete tool invocations after a crash are not replayed automatically.
      if (cp.inflightAt) {
        cp.activeMs += Math.max(
          0,
          Math.min(Date.now(), cp.inflightDeadlineAt || cp.inflightAt + 60000) -
            cp.inflightAt,
        );
        delete cp.inflightDeadlineAt;
        delete cp.inflightAt;
        persist();
      }
      if (cp.pending) {
        cp.messages.push({
          role: "tool",
          tool_call_id: cp.pending.id,
          content: JSON.stringify({
            ok: false,
            error: { code: "operation_interrupted_not_replayed" },
          }),
        });
        cp.pending = null;
        persist();
      }
      if (cp.activeMs >= 300000) break;
      const tools = jsonTools().map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      const inputUpper =
        Buffer.byteLength(JSON.stringify({ messages: cp.messages, tools })) +
        4096;
      const remaining = 8000 - cp.outputReserved,
        maxOutput = Math.min(1200, remaining);
      if (cp.inputReserved + inputUpper > 60000 || maxOutput < 100) break;
      job.phase = "thinking";
      persist();
      const response = await modelCall(
        {
          model: job.model,
          messages: cp.messages,
          tools,
          max_tokens: maxOutput,
          stream: false,
        },
        {
          signal: combined,
          timeoutMs: Math.max(1, 300000 - cp.activeMs),
          beforeDispatch: () => {
            combined.throwIfAborted();
            if (
              cp.calls >= 10 ||
              cp.activeMs >= 300000 ||
              cp.inputReserved + inputUpper > 60000 ||
              cp.outputReserved + maxOutput > 8000
            )
              fail("budget_exceeded");
            cp.calls++;
            cp.inputReserved += inputUpper;
            cp.outputReserved += maxOutput;
            cp.inflightAt = Date.now();
            cp.inflightDeadlineAt =
              cp.inflightAt + Math.min(60000, 300000 - cp.activeMs);
            persist();
          },
        },
      );
      if (cp.inflightAt) {
        cp.activeMs += Date.now() - cp.inflightAt;
        delete cp.inflightAt;
        delete cp.inflightDeadlineAt;
      }
      const message = response.choices?.[0]?.message;
      if (!message || (!message.content && !message.tool_calls))
        fail("invalid_response");
      const used = response.usage?.completion_tokens;
      if (Number.isSafeInteger(used) && used >= 0 && used <= maxOutput)
        cp.outputReserved -= maxOutput - used;
      if (message.tool_calls?.length) {
        const calls = message.tool_calls.slice(0, 1);
        cp.messages.push({
          role: "assistant",
          content: typeof message.content === "string" ? message.content : null,
          tool_calls: calls,
        });
        const call = calls[0];
        if (typeof call.id !== "string") fail("invalid_response");
        cp.pending = call;
        persist();
        job.phase =
          call.function?.name === "read_page" ? "reading" : "searching";
        persist();
        let args;
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          args = {};
        }
        if (cp.activeMs >= 300000) fail("budget_exceeded");
        const t = Date.now();
        const toolSignal = AbortSignal.any([
          combined,
          AbortSignal.timeout(Math.max(1, 300000 - cp.activeMs)),
        ]);
        const result = await callSearchTool(
          jobs.service,
          ["web_search", "read_page"].includes(call.function?.name)
            ? call.function.name
            : "unknown",
          args,
          { ...c, signal: toolSignal },
        );
        cp.activeMs += Date.now() - t;
        combined.throwIfAborted();
        cp.sources.push(...(result.sources || []));
        cp.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
        cp.pending = null;
        persist();
        continue;
      }
      job.phase = "verifying";
      persist();
      let parsed;
      try {
        parsed = JSON.parse(message.content);
      } catch {
        fail("invalid_report");
      }
      cp.report = renderResearchReport(parsed, cp.sources);
      combined.throwIfAborted();
      if (jobs.get(job.id, job.owner).state === "cancelling") fail("cancelled");
      job.state = "completed";
      job.phase = "completed";
      jobs.save(job);
      return job;
    }
    job.state = "partial";
    job.phase = "budget_exhausted";
    job.error = "budget_exceeded";
  } catch (e) {
    const current = jobs.get(job.id, job.owner);
    job.state =
      current.state === "cancelling" ||
      e.code === "cancelled" ||
      e.code === "disabled"
        ? "cancelled"
        : signal.aborted
          ? "interrupted"
          : cp.sources.length
            ? "partial"
            : "failed";
    job.phase = job.state;
    job.error = e.code || "research_failed";
  } finally {
    clearInterval(timer);
    if (cp.inflightAt) {
      cp.activeMs += Date.now() - cp.inflightAt;
      delete cp.inflightAt;
    }
  }
  if (!cp.report)
    cp.report = `# Research ${job.state}\n\n${job.error || "Incomplete evidence"}. No verified synthesis is available.\n\n## Retrieved sources\n\n${cp.sources.map((s) => `- ${s.url} — ${s.read ? "read" : "snippet only"}; publication ${s.published_at || "unknown"}`).join("\n")}`;
  jobs.save(job);
  return job;
}
