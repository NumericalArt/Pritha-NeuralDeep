---
id: agent-proactivity-scheduling
type: standard
status: draft
created: 2026-06-02
updated: 2026-06-20
last_reviewed: 2026-06-20
owner: Techscope/user
topics:
  - agent-engineering
  - proactivity
  - scheduling
  - agent-loops
  - cron
  - heartbeat
  - hooks
  - goal-loops
  - durable-execution
  - memory-safety
  - observability
tools:
  - Pritha
  - Codex
  - Claude Code
  - Agent Skills
  - MCP
  - Git worktree
  - ChatGPT Tasks
  - Kubernetes CronJob
  - Cloudflare Agents
  - OpenClaw
  - Temporal
  - Trigger.dev
  - Better Stack
sources:
  - 03_reviews/2026-06-02-agent-scheduling-heartbeat-source-batch-review.md
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
  - 01_sources/notes/2026-06-20-ai-agent-loops-video-source-note.md
  - 01_sources/notes/2026-06-20-addy-osmani-loop-engineering-source-note.md
  - 03_reviews/2026-06-20-agent-loop-design-assessment.md
  - https://developers.openai.com/codex/codex-manual.md
  - https://docs.anthropic.com/en/docs/claude-code/overview
  - https://docs.anthropic.com/en/docs/claude-code/hooks-guide
related:
  reviews:
    - 03_reviews/2026-06-02-agent-scheduling-heartbeat-source-batch-review.md
    - 03_reviews/2026-06-20-agent-loop-design-assessment.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-untrusted-input-security.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2023-11-23
source_updated: 2026-06-20
source_version: Pritha proactivity scheduling standard v2; scheduling source batch verified 2026-06-02; loop-design sources verified 2026-06-20
retrieved: 2026-06-02
verified: 2026-06-20
valid_for: Pritha-created agents with scheduled, heartbeat, queue-watcher or proactive behavior
temporal_status: current
---

# Standard: agent-proactivity-scheduling

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-20

## Rule

No child agent receives cron, heartbeat, scheduled jobs, queue watchers,
webhook-triggered loops, launchd autostart or proactive notifications unless
the `agent-contract` explicitly selects that behavior.

Scheduled behavior is an autonomy boundary. It must define scheduler owner,
trigger mode, memory write policy, concurrency, retries, monitoring, alerting,
kill switch and user-facing delivery before scaffold or deployment.

## Use When

- a child agent should send reports, reminders, briefs or maintenance output on
  a schedule;
- the agent needs to periodically check external state;
- the agent runs on a server, Mac mini, cloud worker, Kubernetes, Temporal,
  OpenClaw, Cloudflare Agents, Trigger.dev or another scheduler;
- a user asks for heartbeat, cron, pulse, recurring task, watcher, standing
  order or proactive behavior;
- a team/shared agent needs scheduled Slack, email, Telegram or dashboard
  output.

## Avoid When

- the task can be manual or user-triggered;
- the agent has no clear owner for alerts and failures;
- memory, privacy, tool permissions or network boundaries are undefined;
- the background source is untrusted and there is no quarantine/scanner layer;
- the agent has no run history, status command or kill switch;
- expected cost, cadence or maximum runtime is unknown.

## Scheduling Modes

| Mode | Use for | Notes |
| --- | --- | --- |
| `none` | default | No proactive behavior. |
| `manual` | user-triggered checks | Safe first step for Pritha. |
| `scheduled` | one-shot or recurring task | Use for reports, reminders and maintenance. |
| `cron` | calendar-based recurring job | Needs timezone, missed-run and concurrency policy. |
| `interval` | every N seconds/minutes | Watch overlap, cost and drift. |
| `heartbeat` | wake/check/sense loop | Must not silently mutate memory from untrusted input. |
| `event-driven` | webhook or source event | Needs auth, dedupe and replay policy. |
| `queue-watcher` | durable work queue | Needs backpressure, retries and poison-message handling. |
| `durable-workflow` | long multi-step work | Prefer Temporal-like history/retry/signal model. |
| `hybrid` | multiple triggers | Requires explicit routing and monitoring per trigger. |

## Required Contract Fields

Every proactive or scheduled agent must record:

- `proactive_mode`;
- scheduler owner: ChatGPT Tasks, host cron, launchd, Kubernetes CronJob,
  Cloudflare Agents, OpenClaw gateway, Temporal Schedule, Trigger.dev, external
  scheduler or manual;
- schedule expression, timezone and calendar assumptions;
- trigger sources;
- max runtime and timeout;
- concurrency policy: allow, forbid, replace or queue;
- missed-run policy;
- retry/backoff policy;
- idempotency/dedupe key;
- cost/token/media budget per run;
- memory write policy;
- untrusted-input policy for background sources;
- delivery surface and notification policy;
- run log/status path;
- heartbeat monitor or missed-run alert;
- kill switch and pause/delete command;
- human approval gates.

## Loop Preflight

Before any loop touches production, define and test the loop contract manually.

Every loop must record:

- trigger type: heartbeat, cron/scheduled, hook/event, goal, queue-watcher or
  durable workflow;
- purpose and expected artifact;
- run context: local project, background worktree, cloud routine, thread
  automation or external scheduler;
- worktree/isolation policy;
- selected skills or procedural memory;
- selected plugins/connectors and their auth scope;
- subagent policy: none, verifier-only, bounded parallel workers or specialist
  team;
- state store: Markdown file, task tracker, queue, database or other durable
  memory outside the model context;
- stop condition and blocked condition;
- cost/token/tool budget per run;
- human-readable run summary and review path.

Do not schedule a loop until the same prompt or workflow has succeeded manually
at least once with reviewable output.

## Memory Safety

Heartbeat and scheduled jobs must not write directly to long-term memory from
untrusted external content.

The safe path is:

1. Detect or receive external material.
2. Store only transient/quarantined raw data when needed.
3. Scan and summarize into processed signal.
4. Apply privacy-retention and untrusted-input rules.
5. Write curated memory only after the contract permits it.
6. Record neutral run metadata and source class.

If the background task reads email, Slack, Telegram, RSS, GitHub, web pages,
documents or files, it must use foreground/background context separation. Do
not let a hidden heartbeat pollute the same context used for user-facing
conversation.

## Cron vs Heartbeat

Prefer cron/scheduled jobs for named outputs:

- daily brief;
- weekly review;
- monthly cleanup;
- backup/sync;
- reminder;
- health report.

Use heartbeat only for sensing:

- check whether something changed;
- detect stale queue state;
- determine whether escalation is needed;
- keep a runtime alive only when the platform requires it and cost is bounded.

Heartbeat should run deterministic checks before model work and should stop
cleanly when no work is needed.

## Hooks And Goals

Use hooks for lifecycle or event-driven enforcement where the trigger is clear:
tool call, session event, external webhook, PR event or similar. Hooks should
prefer deterministic checks before model work.

Use goal loops only when completion can be verified by tests, artifacts,
external state or an explicit blocker report. Goal loops need precise success
criteria, boundaries, budgets and a pause/clear path. Weak goal criteria are a
cost risk because the agent can keep iterating without producing better
evidence.

Use subagents inside loops only when they reduce context/tool sprawl or create
a useful maker/checker split. Parallel subagents are not a default; they burn
tokens and need bounded prompts plus summarized outputs.

## Durable Workflow Rule

If the job is multi-step, externally stateful, expensive, failure-prone or needs
human approval, do not model it as a chain of cron invocations. Use a durable
workflow pattern: deterministic orchestration, nondeterministic LLM/tool calls
as activities, persisted history, retries, signals/queries and audit.

## Observability

Every scheduled module should expose:

- `status`: selected/skipped/configured/pending-auth/failed;
- `list`: scheduled jobs and next run;
- `runs`: last runs, duration and outcome;
- `pause` or `disable`;
- `run-now` for manual test;
- `logs`;
- `monitor`: heartbeat/missed-run alert status.

For Pritha scaffolds, these can be placeholders until a scheduler is selected,
but selected scheduler modules must not be marked ready without these surfaces.

## Comprehension Debt

A loop can produce code, tickets, reports or notifications faster than the user
understands them. Every recurring loop must preserve a short human-readable run
summary: what it checked, what it changed, what evidence passed, what remains
open and what needs human judgment. Automated completion is not a substitute
for ownership.

## Defaults

- Proactive mode: `none` or `manual`.
- Scheduler install: disabled.
- Heartbeat: disabled.
- Autostart: disabled.
- Memory writes from background sources: disabled unless explicitly contracted.
- External notifications: approval-required.
- Missed-run monitoring: required for deployed scheduled agents.

## Temporal Validity

- Source published: 2023-11-23 through 2026-05-22.
- Source updated: 2026-06-20.
- Source version: Pritha proactivity scheduling standard v2; scheduling source
  batch verified 2026-06-02; loop-design sources verified 2026-06-20.
- Retrieved: 2026-06-02.
- Verified: 2026-06-20.
- Valid for: Pritha-created agents with scheduled, heartbeat, queue-watcher or
  proactive behavior.
- Freshness status: current.
- Temporal status: current.
- Recheck when: Codex automations/goals/subagents, Claude Code routines/hooks,
  ChatGPT Tasks, Kubernetes CronJob, Cloudflare Agents, OpenClaw, Temporal,
  Trigger.dev or heartbeat-memory security research changes scheduling
  semantics, persistence, concurrency, feature limits or memory safety
  guidance.

## Related Decisions

- `04_standards/agent-creation-harness.md`
- `04_standards/agent-team-operating-model.md`
- `04_standards/agent-untrusted-input-security.md`
