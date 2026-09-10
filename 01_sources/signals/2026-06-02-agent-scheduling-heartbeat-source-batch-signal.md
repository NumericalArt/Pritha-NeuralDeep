---
id: 2026-06-02-agent-scheduling-heartbeat-source-batch-signal
type: signal
status: refined
created: 2026-06-02
updated: 2026-06-11
topics:
  - agent-scheduling
  - cron
  - heartbeat
  - proactive-agents
  - durable-execution
  - memory-safety
  - observability
  - pritha
tools:
  - ChatGPT Tasks
  - Kubernetes CronJob
  - Cloudflare Agents
  - OpenClaw
  - Temporal
  - Trigger.dev
  - Better Stack
sources:
  - source-agent-scheduling-heartbeat-batch-2026-06-02
related:
  reviews:
    - 03_reviews/2026-06-02-agent-scheduling-heartbeat-source-batch-review.md
  standards:
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-untrusted-input-security.md
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-agent-scheduling-heartbeat-batch-2026-06-02
generated_from:
  - source-agent-scheduling-heartbeat-batch-2026-06-02
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: Agent Scheduling And Heartbeat Source Batch

Date: 2026-06-02
Status: refined
Source class: mixed
Retention: source-purged

## Core Signal

Cron and heartbeat are not interchangeable implementation details. They define
how much autonomy an agent has while the user is absent. For Pritha, scheduled
behavior must be contract-selected, observable, bounded, memory-safe and easy
to disable.

The useful taxonomy is:

- user-level scheduled prompt: product feature such as ChatGPT Tasks;
- cron/scheduled job: bounded task at a known time;
- interval/heartbeat: repeated wake/check loop;
- event-driven watcher: reacts to webhook/queue/source changes;
- durable workflow schedule: orchestration with persisted history, retries,
  signals and audit.

## Useful Delta For Pritha

- Default remains `proactive_mode: none | manual`. No cron, heartbeat,
  launchd, queue watcher or background pulse without explicit contract choice.
- Prefer scheduled isolated jobs for reports, reminders and maintenance.
- Use heartbeat only for cheap deterministic checks and event detection.
  Heartbeat must not directly write long-term memory from untrusted sources.
- If a background loop reads email, Slack, RSS, web pages, GitHub or other
  external content, route it through quarantine, scanner, processed signal and
  approval/verification before memory mutation.
- For long-running multi-step work, prefer durable workflow orchestration over
  ad hoc sleep loops or cron chains.
- Every scheduled agent job needs observability: last run, next run, status,
  duration, missed-run policy, retries, alert channel and kill switch.

## Deduplication Note

This source batch does not replace existing Hermes/OpenClaw cron notes. It
promotes a general Pritha standard: child agents must decide proactivity mode,
scheduler owner, concurrency, memory write policy and monitoring before any
scheduled behavior is scaffolded.

## Caution

The arXiv heartbeat paper makes the memory-safety risk concrete: background
execution can silently ingest untrusted content into the same memory/context
used for foreground conversations. For Pritha descendants, this means:

- no shared foreground/background memory channel by default;
- no direct memory writes from heartbeat material;
- no hidden background source ingestion;
- no autonomous notification loop without user-visible run records.
