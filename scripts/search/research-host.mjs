import { processSnapshot } from "../neuraldeep/process-snapshot.mjs";
// Called only by the Control Center host, never by a short-lived MCP process.
export function recoverResearchHost(
  jobs,
  snapshot = processSnapshot(),
  pid = process.pid,
) {
  const current = snapshot.find((p) => p.pid === pid);
  if (!current) return;
  const previous = jobs.store.meta("research_host");
  if (
    previous &&
    snapshot.some(
      (p) => p.pid === previous.pid && p.started === previous.started,
    )
  )
    return;
  if (previous) {
    const startedAt = Date.parse(current.started);
    if (Number.isFinite(startedAt))
      jobs.store.transaction(() => {
        for (const row of jobs.store.db
          .prepare("SELECT value FROM jobs WHERE state='queued'")
          .all()) {
          const job = JSON.parse(row.value);
          if (job.createdAt >= startedAt) continue;
          job.state = "interrupted";
          job.phase = "interrupted";
          job.error = "host_restarted_before_dispatch";
          jobs.save(job);
        }
      });
  }
  jobs.store.meta("research_host", {
    pid: current.pid,
    started: current.started,
  });
  jobs.reconcile();
}
