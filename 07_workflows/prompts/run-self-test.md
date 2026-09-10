---
id: run-self-test-prompt
type: workflow
status: active
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - self-test
  - operations
tools:
  - Codex
  - self-test
sources:
  - scripts/self-test.mjs
  - scripts/queue-health.mjs
related:
  decisions:
    - 05_decisions/2026-05-28-techscope-self-test-proactivity.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-8-self-test-prompt
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: manual Techscope operational pulse
temporal_status: current
---

# Run Techscope Self-Test

Use this prompt when the user asks whether Techscope is healthy, when work
touches scripts/infrastructure, or when `.memory/last-self-test.json` is older
than seven days.

Run:

```sh
node scripts/self-test.mjs
node scripts/queue-health.mjs
```

Interpretation:

- `self-test` failure means a real regression must be investigated.
- `queue-health` stale items are informational unless they also appear in failed
  queues.
- Do not mutate queues automatically.
- Do not install launchd or schedule anything unless the user explicitly asks.
