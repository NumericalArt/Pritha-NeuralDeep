---
id: agent-team-operating-model
type: standard
status: draft
created: 2026-05-27
updated: 2026-08-13
last_reviewed: 2026-08-13
owner: Techscope/user
topics:
  - agent-engineering
  - multi-agent-operations
  - agent-team-operating-model
  - proactivity
  - memory
tools:
  - Codex
  - Agents Mother
  - Hermes Agent
  - Obsidian
  - Codex CLI
sources:
  - 02_briefs/2026-05-27-hermes-agent-team-operating-model-brief.md
  - 03_reviews/2026-05-27-hermes-agent-team-operating-model-assessment.md
  - anonymous incoming video source (purged)
  - https://github.com/NousResearch/hermes-agent/blob/main/RELEASE_v0.12.0.md
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/
  - 04_standards/agent-proactivity-scheduling.md
  - 03_reviews/2026-06-02-agent-scheduling-heartbeat-source-batch-review.md
  - 03_reviews/2026-08-13-swarm-forge-repository-assessment.md
  - https://github.com/unclebob/swarm-forge/tree/9acd54d2239fef7e41ddacd8fd30dfb0e69672fe
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-27-hermes-agent-team-operating-model-assessment.md
    - 03_reviews/2026-06-02-agent-scheduling-heartbeat-source-batch-review.md
  briefs:
    - 02_briefs/2026-05-27-hermes-agent-team-operating-model-brief.md
  workflows:
    - 07_workflows/agents-mother.md
  assessments:
    - 03_reviews/2026-08-13-swarm-forge-repository-assessment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-04
source_updated: 2026-08-12
source_version: Pritha draft standard v3; durable handoff, queue liveness and role-topology evidence
retrieved: 2026-05-27
verified: 2026-08-13
valid_for: Agents Mother role/team design from 2026-05-27 onward
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: standard
  id: agent-team-operating-model
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Standard: agent-team-operating-model

Status: draft
Owner: Techscope/user
Last reviewed: 2026-08-13

## Rule

Do not grow one universal agent indefinitely. When a project has distinct
domains, schedules, memories or tool risks, design an explicit operating model:
coordinator, specialists, workers, memory loops, schedules and notification
policy.

The goal is not "more agents". The goal is clearer responsibility and less
context/tool sprawl.

## Use when

- a new agent needs multiple durable responsibilities;
- user workflows naturally split into domains such as research, finance,
  content, documents, operations or coding;
- scheduled reports or reminders are part of the product;
- one chat would need too many tools, memories or styles;
- long-running work should be handled by a sidecar runtime such as Codex CLI.

## Avoid when

- the project is still exploratory and one operator loop is enough;
- roles are vague or duplicated;
- no one will maintain skills, memory and schedules;
- notification volume cannot be controlled;
- the design would hide sensitive tool use behind agent-to-agent routing.

## Required practices

- Start from concrete pain: time, money, repeated manual work, lost context,
  missed follow-ups or messy information.
- Define whether the architecture is `single-agent`, `coordinator-plus-workers`,
  `specialist-team` or `external-harness-team`.
- Give each role a short mission, allowed tools, memory scope, output format and
  escalation path.
- Keep one user-facing coordinator unless the user explicitly wants multiple
  front doors.
- Keep specialist agents narrow and auditable.
- Define which skills are shared, which are role-specific and how stale skills
  are reviewed.
- Define scheduled jobs separately from conversational tasks.
- Require self-contained prompts and explicit skills/toolsets for scheduled
  jobs.
- Apply `agent-proactivity-scheduling` for every scheduled role, heartbeat,
  standing order or proactive notification stream. Team-mode agents need
  scheduler ownership, missed-run alerts, notification policy and memory write
  boundaries before scheduled work is enabled.
- Preserve daily/weekly summaries only when they produce action, decisions or
  memory value.
- Define a notification policy: what can interrupt the user, what is batched,
  what is logged silently and how the user can mute agents.
- Route long-running coding, media or verification work to a worker runtime with
  logs and completion criteria.

## Durable Handoff Contract

When roles exchange work asynchronously, the handoff must be durable and typed.
A chat message, terminal keystroke or model-visible notification is not an
authoritative task record.

Record at minimum:

- stable handoff and task identifiers;
- sender and recipient roles;
- task-contract/instruction revision;
- immutable artifact or workspace revision;
- priority and lifecycle state;
- created, claimed, completed or failed timestamps;
- current owner or lease;
- required verifier and acceptance condition.

Use atomic publish and claim operations. One worker should have at most one
current task unless its contract explicitly selects batch mode. Batch membership
and ordering must be deterministic.

Keep transport and notification separate:

- the durable inbox/queue is the source of truth;
- a wake-up is an idempotent hint;
- the runtime must reconcile queued-but-unclaimed and stale claimed work;
- missed notifications must trigger bounded re-notification or operator alert;
- restart must recover current and queued work without relying on transcript
  memory;
- health status must expose queue age, owner, attempt count and failure class.

Validate recipients and artifact revisions before delivery. Use a deterministic
merge/apply tool with typed output, or unambiguous natural-language instructions;
do not generate prose that resembles a nonexistent shell command.

Runtime queue state, raw handoff payloads and worker traces belong in the
instance state root. Promote only curated, non-sensitive lessons into tracked
Markdown.

## Worktree Boundary

A worktree can reduce branch collisions and clarify ownership, but it is not a
sandbox. A team contract must separately decide process, filesystem, network,
credential, port, service, cache and database isolation. Avoid assigning an
autonomous writing role directly to the operator's main checkout when a
dedicated worktree is practical.

## Topology Escalation

Start with the smallest topology that can provide the required evidence:

1. one executor for simple, reversible, locally verified work;
2. executor plus fresh verifier for meaningful correctness risk;
3. coordinator plus narrow workers when parallel ownership or distinct tools
   materially help;
4. specialist pipeline only when separate specification, implementation,
   architecture, hardening or QA gates improve measured accepted-result quality.

Do not add roles only to imitate a software organization. Every additional role
must justify its context, latency, cost, merge traffic and failure surface.

## Role patterns

| Role | Purpose | Watch for |
| --- | --- | --- |
| Coordinator | User-facing intake, routing and synthesis | Becoming a giant prompt with every tool |
| Researcher | Finds sources, repos, channels and weak signals | Unverified claims and source drift |
| Content/copy specialist | Turns transcripts/notes into publishable text | Generic AI style and overproduction |
| Finance/operator | Reviews spending, subscriptions, operational metrics | Sensitive data and access boundaries |
| Document/legal assistant | Drafts/checks structured docs | Legal overclaiming and privacy |
| Daily-review/kaizen agent | Compares actions against goals | Annoying moralizing or notification spam |
| Coding worker | Long-running code/repo tasks | Needs tests, logs and user-visible completion |

## Contract fields

Future `agent-contract` files should answer:

- `team_mode`: single-agent | coordinator-plus-workers | specialist-team |
  external-harness-team
- `coordinator_role`
- `specialist_roles`
- `shared_skills`
- `role_specific_skills`
- `skill_curation_policy`
- `scheduled_jobs`
- `daily_or_weekly_memory_loop`
- `notification_policy`
- `worker_runtime_routes`
- `agent_to_agent_delegation_rules`
- `human_override_policy`

## Temporal validity

- Source published: 2026-05-04.
- Source updated: 2026-08-12.
- Source version: Pritha draft standard v3; Hermes sources plus durable
  handoff, queue-liveness and role-topology evidence.
- Retrieved: 2026-05-27.
- Verified: 2026-08-13.
- Valid for: Agents Mother role/team design from 2026-05-27 onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: Hermes/Codex/OpenClaw delegation, cron, skills, memory,
  notification or worker-runtime semantics change.

## Related decisions

- `04_standards/agent-creation-harness.md`
- `04_standards/agent-runtime-placement.md`
- `04_standards/realtime-voice-control-for-codex-agents.md`
