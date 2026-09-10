---
id: 2026-06-02-agent-scheduling-heartbeat-source-batch-review
type: review
status: draft
created: 2026-06-02
updated: 2026-06-02
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
  - https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt
  - https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
  - https://developers.cloudflare.com/agents/api-reference/schedule-tasks/
  - https://arxiv.org/abs/2603.23064
  - https://docs.openclaw.ai/cron/
  - https://docs.openclaw.ai/automation/cron-vs-heartbeat
  - https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal
  - https://temporal.io/blog/orchestrating-ambient-agents-with-temporal
  - https://trigger.dev/docs/tasks/scheduled
  - https://betterstack.com/community/guides/monitoring/what-is-cron-monitoring/
related:
  signals:
    - 01_sources/signals/2026-06-02-agent-scheduling-heartbeat-source-batch-signal.md
  standards:
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-agent-scheduling-heartbeat-batch-2026-06-02
recommendation: standard
freshness_status: current
source_published: 2023-11-23 to 2026-05-22
source_updated: mixed
source_version: official docs/articles and arXiv source batch verified 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha proactivity, scheduling and heartbeat policy
temporal_status: current
---

# Review: Agent Scheduling And Heartbeat Source Batch

Date: 2026-06-02
Status: draft
Recommendation: standard

## One-Paragraph Read

This batch should become a Pritha standard. The strongest conclusion is that
cron/heartbeat is an autonomy boundary, not a convenience feature. Scheduled
agent behavior must be selected in the contract, run through a known scheduler,
use bounded prompts/tools, expose run status and avoid silent memory mutation.
Heartbeat is useful for cheap sensing and wake/sleep patterns, but it is
dangerous when it reads untrusted sources and writes to the same memory/context
used for foreground conversations.

## Source Verdicts

| Date | Source | Verdict | Pritha fit |
| --- | --- | --- | --- |
| 2026-05 updated | OpenAI Help: Tasks in ChatGPT | adopt as product reference | User-level scheduled prompts, notifications and task limits. Useful as a high-level product model, not as a repo-agent scheduler. |
| 2026-05 updated | Kubernetes CronJob | adopt as production baseline | CronJob shows required scheduler fields: timezone, concurrency, job history, missed-job behavior and constraints. |
| 2026-04-30 | Cloudflare Agents: Schedule tasks | adopt with caveat | Strong agent-native scheduling model: delay, date, cron, interval, SQLite persistence and Durable Object alarms. High power because scheduled callbacks can read/write agent state. |
| 2026-04-04 | arXiv: Mind Your HEARTBEAT | adopt for safety | Strong warning: heartbeat background execution can silently pollute persistent memory if untrusted sources share foreground context/memory. |
| 2026-03-30 | MindStudio heartbeat article | candidate only | Exact source title was not independently verified in this run. The wake/sleep concept is useful, but not a source for standard promotion. |
| 2026-02-01 | OpenClaw cron docs | adopt as agent-native reference | Gateway scheduler pattern: persisted jobs, main/isolated session choices, delivery modes and run history. |
| 2025-11-12 | Temporal dynamic AI agents | adopt | Best durable-agent pattern: deterministic workflow control, nondeterministic LLM/tool calls in activities, replayable history. |
| 2025-09-18 | Temporal ambient agents | adopt | Schedules, Signals, Queries and workflow history support proactive agents with auditability and inter-agent communication. |
| 2024-04-17 | Trigger.dev scheduled tasks | adopt as code-defined scheduler | Useful for developer apps: scheduled tasks in code, dynamic schedules, deployment/version behavior and dashboard/API management. |
| 2023-11-23 | Better Stack cron monitoring | adopt | Simple operational rule: jobs should ping a heartbeat monitor; missed pings create alerts/incidents. |

## Consolidated Patterns

### Scheduling Mode Taxonomy

- `scheduled`: bounded one-shot or recurring task.
- `cron`: calendar-based recurring task.
- `interval`: fixed delay between executions.
- `heartbeat`: repeated wake/check loop, often used for sensing or keeping an
  agent alive.
- `event-driven`: webhook/queue/source-change trigger.
- `durable-workflow`: persisted workflow with retries, signals, queries and
  audit history.

### Cron vs Heartbeat

Use cron/scheduled jobs when the user can name the task, cadence and expected
artifact: daily report, weekly review, monthly cleanup, reminder, backup or
sync.

Use heartbeat only when the agent needs a periodic sensing loop. Heartbeat
should first run deterministic checks and only escalate to model work when
there is meaningful change. It must have a stop condition, max cost, max
runtime and memory mutation boundary.

### Durable Orchestration

Use Temporal-like durable workflow orchestration when the job is multi-step,
long-running, failure-prone, externally stateful or needs human approval. Cron
should start the workflow; it should not be the workflow.

### Memory-Safe Background Intake

Any background task that reads untrusted content must use the same safety model
as interactive untrusted input:

- quarantine raw input;
- scanner/validation before model context;
- processed signal before memory;
- no raw source promotion;
- human approval for high-risk memory writes;
- foreground/background context separation.

### Monitoring

Every scheduled child-agent job needs:

- last run and next run;
- success/failure status;
- duration and timeout;
- retry/backoff policy;
- overlap/concurrency policy;
- missed-run detection;
- alert channel;
- run log path;
- kill switch.

## Techscope Adoption Check

- Techscope/Agents Mother fit: adopt.
- Implementation cost: low for standards/templates, medium for scaffold
  manifests/status scripts, high for full durable workflow runtime.
- Risk: silent memory pollution, noisy notifications, hidden cost, duplicate
  runs, missed runs, stale credentials, overlapping jobs and unclear ownership.
- Decision: create a proactivity scheduling standard now. Keep default
  proactivity disabled/manual unless the child-agent contract explicitly selects
  a mode.

## Promotion Guidance

Promote as principles:

- background autonomy is contract-selected;
- cron starts bounded jobs, not open-ended agent loops;
- heartbeat is sensing, not silent memory ingestion;
- durable workflows handle long-running multi-step work;
- every scheduled job needs run history and monitoring;
- foreground/background memory must be separated.

Do not promote as defaults:

- always-on heartbeat;
- hidden background memory updates;
- unmonitored cron;
- shared foreground/background context;
- Temporal, Cloudflare, Trigger.dev, OpenClaw or ChatGPT Tasks as universal
  platform choices.
