---
id: 2026-05-28-realtime-default-mode
type: decision
status: accepted
created: 2026-05-28
updated: 2026-05-28
topics:
  - realtime
  - setup
  - voice-agents
tools:
  - OpenAI Realtime API
  - Pritha
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - docs/realtime.md
related:
  workflows:
    - 07_workflows/first-run-setup.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-12-first-run-setup
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha setup v0.1 and descendant setup templates
temporal_status: current
---

# Decision: Realtime Is Opt-In In First-Run Setup

## Context

Voice interfaces are valuable for descendant agents, but realtime sessions have
privacy and cost implications. Current model names and prices change often, so
the setup wizard must not hardcode stale cost estimates.

## Decision

Pritha first-run setup keeps Realtime disabled by default. If the user enables
it, setup records the chosen mode and displays a cost/privacy warning. Always-on
voice requires explicit confirmation; push-to-talk is the safer default pattern
for descendants unless the product design needs continuous listening.

## Consequences

- Fresh clones are usable without an OpenAI API key.
- Voice descendants can still opt in through their own contracts.
- Setup references `docs/realtime.md` and current OpenAI pricing rather than
  embedding a fixed price.
- No realtime process is started by setup.
