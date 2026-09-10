---
id: 2026-05-28-techscope-quality-phase-8-self-test-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - quality-roadmap
  - phase-8
  - self-test
  - queue-health
  - proactivity
tools:
  - Codex
  - self-test
  - queue-health
  - quality-gate
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - scripts/self-test.mjs
  - scripts/queue-health.mjs
  - 05_decisions/2026-05-28-techscope-self-test-proactivity.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/prompts/run-self-test.md
  decisions:
    - 05_decisions/2026-05-28-techscope-self-test-proactivity.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-quality-phase-7-quality-gate-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-8-self-test
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope Phase 8 operational self-test
temporal_status: current
---

# Techscope Quality Phase 8 Report: Self-Test and Operational Pulse

## Summary

Phase 8 completed successfully. Techscope now has a manual self-test command,
read-only queue health diagnostics and an explicit decision that proactive
operational checks remain manual by default.

No background service was installed or enabled.

## Changes made

Created:

- `scripts/self-test.mjs`
- `scripts/queue-health.mjs`
- `tests/self-test.test.mjs`
- `tests/queue-health.test.mjs`
- `05_decisions/2026-05-28-techscope-self-test-proactivity.md`
- `07_workflows/prompts/run-self-test.md`
- `launchd/com.techscope.self-test.plist.template`

Updated:

- `scripts/quality-gate.mjs`
  - Added `--profile self-test`.
- `tests/quality-gate.test.mjs`
  - Added self-test profile coverage.
- `package.json`
  - Added `self-test` and `queue-health` scripts.
- `.gitignore`
  - Ignores `.memory/last-self-test.json`.
- `AGENTS.md`
  - Added manual self-test guidance for scripts/infrastructure work.

## Verification results

Phase-specific checks:

- `node scripts/queue-health.mjs` -> pass, reports 2 stale informational items and 0 failed jobs.
- `node scripts/queue-health.mjs --json` -> pass.
- `node scripts/quality-gate.mjs --profile self-test` -> pass.
- `node scripts/self-test.mjs --dry-run --json` -> pass.
- `node scripts/self-test.mjs` -> pass and writes `.memory/last-self-test.json`.
- `node scripts/self-test.mjs --json` -> pass and compares against the previous baseline.
- `plutil -lint launchd/com.techscope.self-test.plist.template` -> pass.
- `node --test tests/queue-health.test.mjs tests/self-test.test.mjs tests/quality-gate.test.mjs` -> pass.

Current queue health snapshot:

- telegram-intake pending: 0
- telegram-intake awaiting_codex: 1
- telegram-intake failed: 0
- codex-media-review pending: 1
- stale informational items: 2

Final gate:

- `node scripts/quality-gate.mjs` -> pass.
- `npm test --silent` -> golden checks pass + 21 tests pass.
- `node scripts/golden-checks.mjs --with-embeddings` -> pass.
- Final `node scripts/self-test.mjs --json` after embeddings rebuild -> pass.

Final memory stats:

- documents: 405
- chunks: 3911
- entities: 963
- relations: 10569
- embeddings: 3767

## Regressions observed

During implementation, `self-test --dry-run` initially compared synthetic
`documents: 0` against the real previous baseline and failed after the first
real baseline was written. Fixed by skipping document-count regression checks in
dry-run mode. Dry-run now validates contracts only.

## Rollback instructions

After the Phase 8 commit is created:

```sh
git revert <phase-8-commit>
```

## AM-CANDIDATE patterns

- `self-test-mjs`: local operational pulse with baseline comparison.
- `queue-health-mjs`: read-only queue diagnostics with stale item reporting.
- `scheduled-health-pulse`: template-only candidate, not enabled by default.
- `proactive-self-test-contract`: explicit decision before any heartbeat or schedule.

## Open questions

- Should stale `awaiting_codex` jobs become a warning in a future quality gate,
  or remain informational until media-review automation improves?
- Should Phase 12 first-run setup call `self-test` at the end, or only
  `quality-gate`?
