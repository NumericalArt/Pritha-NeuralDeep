---
id: 2026-06-21-pritha-github-install-reproducibility-baseline-report
type: agent-operations-report
status: complete
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - github-install
  - reproducibility
  - baseline
  - release-safety
  - self-test
tools:
  - Node.js
  - npm
  - Git
  - GitHub Actions
  - SQLite
  - Pritha
agent_platforms:
  - Codex
runtime_environment:
  - macOS
  - local-project
config_surfaces:
  - scripts/self-test.mjs
  - scripts/quality-gate.mjs
  - scripts/pre-push-audit.mjs
  - interfaces/control-center
sources:
  - 03_reviews/2026-06-21-pritha-full-project-audit.md
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
related:
  reviews:
    - 03_reviews/2026-06-21-pritha-full-project-audit.md
  workflows:
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  standards:
    - 04_standards/pritha-self-model.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/tailscale-private-device-access-for-local-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-21
source_updated: 2026-06-21
source_version: phase-0-baseline
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Phase 0 of Pritha GitHub install reproducibility roadmap
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
subject:
  kind: roadmap-phase
  id: pritha-github-install-reproducibility-phase-0
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Agent Operations Report: Pritha GitHub Install Reproducibility Baseline

Date: 2026-06-21
Status: complete
Phase: 0 - Baseline And Acceptance

## Summary

Phase 0 is complete. The roadmap is now active, the current audit is linked as
the source review, and the baseline checks were run before implementation
changes.

The current architecture is healthy enough to proceed: self-test, quality gate
and Control Center typecheck pass. The release gate is intentionally red because
the public snapshot still contains local absolute paths in tracked memory
snapshot data. That is the expected blocker for Phase 2, not a new regression.

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `node scripts/self-test.mjs` | pass | Memory documents: 541; queue failed jobs: 0; queue stale items: 2; baseline written to `.memory/last-self-test.json`. |
| `node scripts/quality-gate.mjs` | pass | Environment doctor, privacy audit, memory validation, memory rebuild, smoke test, unit tests, Agents Mother self-inspection and Telegram dry-run passed. |
| `node scripts/pre-push-audit.mjs --strict` | fail | Expected Phase 2 blocker: `local-absolute-paths` count 274, truncated 194. Other release checks passed. |
| `npm --prefix interfaces/control-center run typecheck` | pass | TypeScript completed with `tsc --noEmit`. |

## Procedural Note

The first baseline attempt ran `self-test` and `quality-gate` concurrently.
`quality-gate` reported a transient SQLite `database is locked` error during
memory rebuild. The command was rerun sequentially and passed. The sequential
result is the accepted baseline.

## Known Blockers

### Phase 2 required blocker

- `pre-push-audit --strict` fails on `local-absolute-paths`.
- Main evidence is in tracked `.memory/last-rebuild.sql`, which has indexed
  older machine-specific paths from curated artifacts.
- This confirms the audit's S2 finding and must be fixed by the public snapshot
  scrub/rebuild phase before release.

### Non-blocking observations

- Queue health reports 2 stale items but self-test still passes and failed jobs
  are 0.
- `gitleaks` and `trufflehog` are available locally, but are not yet part of CI.
  CI release-gate hardening remains Phase 2 work.
- The current roadmap and audit were present as new local artifacts during the
  baseline. The scrub phase must treat new public artifacts with the same local
  path policy as the older snapshot.

## Acceptance Criteria

| Criterion | Status |
| --- | --- |
| Roadmap reviewed and accepted or amended | pass |
| Baseline report created | pass |
| Current audit linked as source review | pass |
| Known failures classified | pass |
| No implementation phase started before baseline | pass |

## Next Phase

Proceed to Phase 1: execution safety fixes.

Required first changes:

- Make empty `PRITHA_REALTIME_CODEX_WRITE_ENABLED` / legacy fallback resolve to
  read-only in Control Center.
- Require UI approval for every `workspace_write` Codex task.
- Add tests for the changed defaults and approval behavior.
