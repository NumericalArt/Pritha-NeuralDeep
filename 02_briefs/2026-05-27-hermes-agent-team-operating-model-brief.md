---
id: 2026-05-27-hermes-agent-team-operating-model-brief
type: brief
status: draft
created: 2026-05-27
updated: 2026-05-27
topics:
  - hermes-agent
  - multi-agent-operations
  - agent-team-operating-model
  - cron
  - skills
  - obsidian-memory
tools:
  - Hermes Agent
  - Obsidian
  - Codex CLI
  - Google Meet
  - Telegram
agent_platforms:
  - Hermes Agent
  - Codex
model_context:
  - mixed
runtime_environment:
  - messaging-gateway
  - local-agent
  - cron
  - codex-cli-sidecar
config_surfaces:
  - skills
  - cron jobs
  - delegation
  - Obsidian vault
  - agent roles
  - notification policy
portability: adapter-needed
sources:
  - 00_inbox/links/2026-05-27-youtube-hermes-agent-team-operating-model-intake.md
  - 01_sources/notes/2026-05-27-hermes-agent-team-operating-model-source-note.md
  - anonymous incoming video source (purged)
  - https://github.com/NousResearch/hermes-agent/blob/main/RELEASE_v0.12.0.md
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/
related:
  intakes:
    - 00_inbox/links/2026-05-27-youtube-hermes-agent-team-operating-model-intake.md
  reviews:
    - 03_reviews/2026-05-27-hermes-agent-team-operating-model-assessment.md
  decisions: []
  standards:
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-runtime-placement.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-04
source_updated: 2026-05-04
source_version: YouTube video; Hermes v0.12.0 official docs checked 2026-05-27
retrieved: 2026-05-27
verified: 2026-05-27
valid_for: Agents Mother multi-agent operating-model design
temporal_status: current
---

# Brief: Hermes Agent Team Operating Model

Date: 2026-05-27
Source: YouTube lived-use demo plus Hermes official docs
Status: draft

## Summary

The durable idea is to design an agent project as an operating system of
specialists, not as one overgrown assistant. A coordinator handles user-facing
intake and routing; specialist agents own narrow domains; scheduled reports and
daily notes create continuity; a separate reflection agent compares work against
goals; heavy coding or long-running tasks can be delegated to a sidecar runtime
such as Codex CLI.

## Key claims

- Start from real pain: time, money, routine, lost context, repeated reports,
  messy files or manual follow-ups.
- Do not automate for the sake of automation.
- Use role agents when task domains need different skills, memories and tone.
- Reusable skills are assets; they should be curated, consolidated and moved
  carefully between agents.
- Cron is useful for scheduled reports, but prompts must be self-contained and
  toolsets explicit.
- A daily-note loop can turn raw activity into actionable reflection.
- Too many proactive notifications reduce usefulness; agents need notification
  budgets and quiet modes.

## Agent environment profile

- Agent platforms: Hermes source pattern; Codex/Agents Mother target adaptation.
- Model context: mixed, depends on the agent role and task.
- Runtime environment: messaging gateway, local agent, cron jobs, Obsidian-style
  memory, Codex CLI worker for long tasks.
- Config surfaces: skills, cron jobs, delegation policy, Obsidian vault,
  notification policy and role definitions.
- Portability: adapter-needed. Hermes-specific mechanics should be translated to
  Codex-native contracts and workflows.

## Evidence

- The video shows a concrete set of specialist agents and use cases.
- Hermes v0.12.0 release notes confirm Curator, Google Meet plugin, Humanizer,
  cron ticker, skill maintenance and self-improvement loop changes.
- Hermes Cron docs confirm fresh sessions, skill-backed cron jobs, delivery
  options, security checks and no-agent mode.
- Hermes Delegation docs confirm isolated subagents with restricted toolsets and
  final-summary-only returns.

## Existing knowledge and freshness

- Related existing artifacts:
  - `02_briefs/2026-05-18-hermes-goal-autonomous-workflow-brief.md`
  - `03_reviews/2026-05-18-hermes-goal-agent-architecture-assessment.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-runtime-placement.md`
  - `04_standards/realtime-voice-control-for-codex-agents.md`
- Relationship to existing knowledge: refines.
- Official/current sources checked: Hermes v0.12 release notes, Curator docs,
  Cron docs, Delegation docs.
- Freshness status: current.
- Source published: 2026-05-04.
- Source updated: 2026-05-04.
- Source version: YouTube video; Hermes v0.12.0 official docs checked
  2026-05-27.
- Retrieved: 2026-05-27.
- Verified: 2026-05-27.
- Valid for: Agents Mother multi-agent operating-model design.
- Temporal status: current.
- Artifacts to mark outdated or superseded: none.

## Risks and caveats

- This is one user's setup, not a controlled benchmark.
- Specialist agents can multiply maintenance unless skills, memory and
  notification policy are controlled.
- Cron jobs run in fresh sessions and require self-contained prompts and
  explicit skills/toolsets.
- Delegated subagents do not inherit full parent history; only context passed to
  them matters.
- Meeting bots, userbots and financial/document agents require privacy and
  permission review before production use.

## Recommendation

Promote the new part into a draft standard: `agent-team-operating-model`. Use it
as an Agents Mother design checklist when a new agent should become a team of
roles, not one monolithic assistant.

## Next step

Add the standard to Agents Mother and future agent contracts as an optional
decision point: single agent, coordinator plus specialists, or external worker
runtime.
