"use client";
import { useEffect, useRef, useState } from "react";
import { CodexMarkdown } from "@/components/codex/CodexMarkdown";
export function SearchResearchPanel() {
  const [question, setQuestion] = useState(""),
    [jobs, setJobs] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  async function load() {
    try {
      const r = await fetch("/api/search/research", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setJobs(d.jobs || []);
    } catch {
      /* Keep previously loaded report. */
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const running = jobs.some((j) =>
    ["queued", "running", "cancelling"].includes(j.state),
  );
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [running]);
  async function action(kind: string, id?: string) {
    setBusy(true);
    setMessage("");
    try {
      key.current ||= crypto.randomUUID();
      const r = await fetch(
        id ? `/api/search/research/${id}/${kind}` : "/api/search/research",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id ? {} : { question, requestKey: key.current }),
        },
      );
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setMessage(`Research: ${d.error || "unavailable"}`);
        return;
      }
      if (!id) {
        key.current = null;
        setQuestion("");
      }
      await load();
    } catch {
      setMessage("Request result unknown. Retry uses the same request ID.");
    } finally {
      setBusy(false);
    }
  }
  function download(job: any) {
    const url = URL.createObjectURL(
      new Blob([job.checkpoint.report || ""], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${job.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div aria-label="Deep Research">
      <h3>Deep Research</h3>
      <p>
        A separate research job with sources, cancellation and a bounded budget.
        It uses the currently selected model and provider quota. Reports are
        retained for 30 days.
      </p>
      <label>
        Research question
        <textarea
          aria-label="Research question"
          maxLength={4000}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            key.current = null;
          }}
        />
      </label>
      <div className="settings-rowline">
        <button
          className="outline-button"
          disabled={busy || !question.trim()}
          onClick={() => void action("start")}
        >
          Start research
        </button>
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh research
        </button>
      </div>
      <p role="status">{message}</p>
      {jobs.map((job) => (
        <details key={job.id}>
          <summary>
            {job.question} · {job.state}
          </summary>
          <p>
            {job.phase} · {job.model} · {job.checkpoint.calls}/10 model calls ·{" "}
            {Math.round(job.checkpoint.activeMs / 1000)}/300 active seconds
          </p>
          <p>
            {job.budget?.search ?? 0}/10 searches · {job.budget?.read ?? 0}/8
            pages · {job.checkpoint.inputReserved}/60,000 input tokens reserved
            · {job.checkpoint.outputReserved}/8,000 output tokens reserved
          </p>
          {job.error ? <p>{job.error}</p> : null}
          <div className="settings-rowline">
            {["queued", "running", "cancelling"].includes(job.state) ? (
              <button
                className="outline-button"
                disabled={busy}
                onClick={() => void action("cancel", job.id)}
              >
                Cancel research
              </button>
            ) : null}
            {["interrupted", "partial"].includes(job.state) ? (
              <button
                className="outline-button"
                disabled={busy}
                onClick={() => void action("resume", job.id)}
              >
                Resume with remaining budget
              </button>
            ) : null}
            {job.checkpoint.report ? (
              <button className="outline-button" onClick={() => download(job)}>
                Export report
              </button>
            ) : null}
          </div>
          {job.checkpoint.report ? (
            <CodexMarkdown markdown={job.checkpoint.report} />
          ) : (
            <p>No completed report yet.</p>
          )}
        </details>
      ))}
    </div>
  );
}
