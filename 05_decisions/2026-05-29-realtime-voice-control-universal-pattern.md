---
id: 2026-05-29-realtime-voice-control-universal-pattern
type: decision
status: accepted
created: 2026-05-29
updated: 2026-05-29
topics:
  - agent-engineering
  - voice-agents
  - realtime
  - codex-app
  - codex-cli
  - pritha
tools:
  - OpenAI Realtime API
  - Codex App
  - Codex CLI
  - SQLite
sources:
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/codex-in-the-loop.md
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/service.ts
related:
  intakes: []
  briefs: []
  reviews:
    - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
    - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-29
source_version: FESPA26 Codex-in-the-loop architecture inspected 2026-05-29
retrieved: 2026-05-29
verified: 2026-05-29
valid_for: Pritha descendants with realtime voice and complex tool/deep-task workflows
temporal_status: version-bound
review_date: 2026-07-01
---

# Decision: Realtime Voice Control Universal Pattern

Date: 2026-05-29
Status: accepted

## Context

FESPA26 changed its voice-control architecture. Complex tasks are no longer modeled as direct Realtime model work or only as local Codex CLI jobs. The current architecture routes voice-triggered deep work through a Codex task boundary that can use Codex App/thread transports, contract files, automatic Codex CLI execution or local queue fallback.

Funny Teacher independently confirmed the same high-level boundary in a different domain: Realtime handles live conversation; server tools own durable memory/actions.

## Decision

Pritha treats realtime voice control as a reusable architecture pattern:

- Realtime is the live voice dispatcher.
- Server tools are deterministic action boundaries.
- Codex App/thread is the preferred foreground transport for complex tasks when available.
- Codex CLI remains a fallback, autonomous worker or queue transport.
- Durable domain state belongs in the agent memory/repository, not in the voice model.

FESPA26 is the reference example for event/reportage agents that ingest media, update memory and generate reviewed feed cards.

## Consequences

- Future voice agents should not expose broad filesystem, publication or deployment power directly through Realtime tools.
- Voice tools should return short spoken status while recording real state in memory/jobs.
- Contracts for new agents must state which deep-task transports are selected: Codex App/thread, contract-file handoff, Codex CLI, queue worker or none.
- Fallback behavior must be explicit. Silent loss of a voice-triggered complex task is not acceptable.
- The standard `04_standards/realtime-voice-control-for-codex-agents.md` is promoted to active for Codex-native descendants, with version-bound caveats.

## Alternatives considered

- Realtime-only agent: rejected for complex agents because it cannot safely own durable media, code, publication or memory workflows.
- Codex CLI-only voice backend: rejected for live voice UX because latency and interaction quality belong in Realtime.
- Codex CLI as the only deep-task transport: superseded by FESPA26's Codex App/thread transport plus CLI fallback design.
- Domain-specific FESPA-only pattern: rejected because Funny Teacher confirms the same boundary outside event/reportage work.

## Temporal basis

- Source published: unknown.
- Source updated: 2026-05-29.
- Source version: FESPA26 Codex-in-the-loop architecture inspected 2026-05-29.
- Retrieved: 2026-05-29.
- Verified: 2026-05-29.
- Valid for: Pritha descendants with realtime voice and complex tool/deep-task workflows.
- Freshness status: current.
- Temporal status: version-bound.
- Supersedes: none.
- Superseded by: none.

## Review date

2026-07-01
