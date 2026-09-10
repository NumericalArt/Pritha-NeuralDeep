---
id: 2026-06-21-pritha-github-install-reproducibility-phase-2-report
type: agent-operations-report
status: complete
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - public-snapshot
  - release-safety
  - privacy
  - path-scrub
  - github-install
tools:
  - Node.js
  - Git
  - SQLite
  - Pritha
agent_platforms:
  - Codex
runtime_environment:
  - macOS
  - local-project
  - github-actions
config_surfaces:
  - scripts/pre-push-audit.mjs
  - scripts/launchd-root-audit.mjs
  - tests/launchd-root-audit.test.mjs
  - .memory
sources:
  - 03_reviews/2026-06-21-pritha-full-project-audit.md
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-baseline-report.md
  - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-1-report.md
related:
  reviews:
    - 03_reviews/2026-06-21-pritha-full-project-audit.md
  workflows:
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  reports:
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-baseline-report.md
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-1-report.md
  decisions:
    - 05_decisions/2026-05-28-pritha-public-snapshot-scrub.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-21
source_updated: 2026-06-21
source_version: phase-2-public-snapshot-scrub
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Phase 2 of Pritha GitHub install reproducibility roadmap
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
subject:
  kind: roadmap-phase
  id: pritha-github-install-reproducibility-phase-2
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Agent Operations Report: Pritha GitHub Install Reproducibility Phase 2

Date: 2026-06-21
Status: complete
Phase: 2 - Public Snapshot And Release Gates

## Summary

Phase 2 is complete. User-specific absolute paths were scrubbed from public
Markdown sources and the portable memory snapshot was rebuilt. The strict
pre-push audit now passes with `local-absolute-paths` count 0.

This closes the audit's S2 release blocker and satisfies the existing public
snapshot scrub decision for the current working tree.

## Changes

- Replaced machine-specific paths in StupidJoke contract/reports and voice
  session memory with placeholders such as `<SIBLING_AGENT_ROOT>/StupidJoke`,
  `<LEGACY_TECHSCOPE_ROOT>`, `<PRITHA_ROOT>` and `<USER_HOME>`.
- Scrubbed the 2026-06-21 project audit before it becomes tracked public memory.
- Updated `scripts/launchd-root-audit.mjs` so legacy-root detection is derived
  from the current checkout parent or `PRITHA_LAUNCHD_OLD_ROOT`, instead of a
  hardcoded user path.
- Updated launchd-root-audit tests to use a synthetic temp stale root through
  `PRITHA_LAUNCHD_OLD_ROOT`.
- Rebuilt `.memory/techscope.sqlite` and `.memory/last-rebuild.sql` through the
  normal quality gate.

## Verification

| Command | Result | Notes |
| --- | --- | --- |
| `rg -n "/Users/<user>|/home/<user>" --glob '!.memory/**' .` | pass | No real local-home matches outside `.memory`. |
| `node --test tests/launchd-root-audit.test.mjs tests/control-center-codex-safety.test.mjs` | pass | Launchd fixture and Codex safety tests passed. |
| `npm --prefix interfaces/control-center run typecheck` | pass | TypeScript completed with `tsc --noEmit`. |
| `node scripts/quality-gate.mjs` | pass | Full local gate passed and rebuilt memory. |
| `node scripts/pre-push-audit.mjs --strict` | pass | Release gate passed; `local-absolute-paths` count 0. |

## Acceptance Criteria

| Criterion | Status |
| --- | --- |
| Tracked public source uses placeholders instead of local absolute paths | pass |
| Portable memory snapshot rebuilt after scrub | pass |
| Strict pre-push audit passes | pass |
| Launchd stale-root detection remains test-covered | pass |
| No secrets or forbidden runtime state introduced | pass |

## Remaining Work

- Phase 3 should add deterministic dependency installation and bootstrap flow.
- Phase 2 did not yet add a new GitHub Actions release-gate workflow; the local
  strict audit is green and CI integration remains part of the upcoming release
  hardening work.
