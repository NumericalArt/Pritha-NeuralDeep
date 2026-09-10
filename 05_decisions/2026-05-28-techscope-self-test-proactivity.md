---
id: 2026-05-28-techscope-self-test-proactivity
type: decision
status: accepted
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - self-test
  - proactivity
  - operations
tools:
  - Codex
  - quality-gate
  - launchd
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - scripts/self-test.mjs
  - scripts/queue-health.mjs
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-8-self-test-proactivity
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope local operational checks
temporal_status: current
---

# Decision: Techscope Self-Test Proactivity

## Decision

Techscope self-test proactivity is `manual` by default.

The supported v1 operational checks are:

- `node scripts/self-test.mjs`
- `node scripts/queue-health.mjs`
- `node scripts/quality-gate.mjs`

No background service, cron, heartbeat, launchd job or notification loop is
installed or enabled by default.

## Rationale

The project is still evolving quickly. A manual self-test gives Codex and the
user a reliable operational pulse without introducing hidden background behavior
or surprise compute cost. Scheduled execution is useful later, but it must be an
explicit opt-in because it changes the host machine's operational behavior.

## Policy

- `self-test` runs a subset quality-gate profile, compares memory stats against
  the previous local baseline and checks queue failures.
- `queue-health` is informational and read-only. Stale queue items are reported,
  not mutated.
- Queue failed jobs and document-count drops are self-test regressions.
- Stale `pending` / `awaiting_codex` jobs are operational warnings, not automatic
  failures in v1.
- Scheduled self-test is allowed only after a separate user confirmation and a
  deployment report.
- `launchd/com.techscope.self-test.plist.template` may exist as a template, but
  it is not installed automatically.

## Consequences

- Codex should offer `node scripts/self-test.mjs` when the user asks for project
  health or when work touches scripts/infrastructure and the last self-test is
  older than seven days.
- Future setup or CI phases can promote self-test into a scheduled or CI gate,
  but only through a separate decision or release phase.
