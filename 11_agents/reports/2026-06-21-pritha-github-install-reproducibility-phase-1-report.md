---
id: 2026-06-21-pritha-github-install-reproducibility-phase-1-report
type: agent-operations-report
status: complete
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - control-center
  - codex
  - approval-gate
  - safety
  - github-install
tools:
  - TypeScript
  - Node.js
  - Codex
  - Pritha Control Center
agent_platforms:
  - Codex
runtime_environment:
  - macOS
  - local-project
config_surfaces:
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/lib/realtime/codex-safety.ts
  - tests/control-center-codex-safety.test.mjs
sources:
  - 03_reviews/2026-06-21-pritha-full-project-audit.md
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-baseline-report.md
related:
  reviews:
    - 03_reviews/2026-06-21-pritha-full-project-audit.md
  workflows:
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  reports:
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-baseline-report.md
  standards:
    - 04_standards/pritha-self-model.md
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-21
source_updated: 2026-06-21
source_version: phase-1-execution-safety
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Phase 1 of Pritha GitHub install reproducibility roadmap
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
subject:
  kind: roadmap-phase
  id: pritha-github-install-reproducibility-phase-1
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Agent Operations Report: Pritha GitHub Install Reproducibility Phase 1

Date: 2026-06-21
Status: complete
Phase: 1 - Execution Safety Fixes

## Summary

Phase 1 is complete. Control Center Realtime Codex write behavior now defaults
to read-only when write env values are missing or empty, and any effective
`workspace-write` Codex task is held behind the UI approval gate.

This directly addresses the audit's S1 and S3 findings without changing the
overall Voice Control / Codex task architecture.

## Changes

- Added `interfaces/control-center/src/lib/realtime/codex-safety.ts` as a small
  pure helper for Codex write flag normalization.
- Updated `pritha-runtime.ts` so
  `PRITHA_REALTIME_CODEX_WRITE_ENABLED` and legacy
  `TECHSCOPE_VOICE_CODEX_WRITE_ENABLED` use an explicit allowlist. Empty,
  missing, `explicit`, typo and read-only values no longer enable writes.
- Added `workspace_write_requested` as an approval reason whenever the effective
  Codex sandbox is `workspace-write`.
- Added `workspace_write` approval action type for write tasks that do not also
  match a more specific risky action such as deployment, deletion, secrets,
  scheduler/service enablement or danger-full-access.
- Added `tests/control-center-codex-safety.test.mjs` to cover the write flag
  semantics and runtime approval-gate integration.

## Verification

| Command | Result | Notes |
| --- | --- | --- |
| `node --test tests/control-center-codex-safety.test.mjs tests/control-center-voice-settings.test.mjs` | pass | 5 tests passed. |
| `npm --prefix interfaces/control-center run typecheck` | pass | TypeScript completed with `tsc --noEmit`. |
| `node scripts/quality-gate.mjs` | pass | Full local quality gate passed after the change. |
| `node scripts/pre-push-audit.mjs --strict` | fail | Expected Phase 2 blocker remains: `local-absolute-paths` in tracked memory snapshot data. |

## Acceptance Criteria

| Criterion | Status |
| --- | --- |
| Empty env means read-only | pass |
| Explicit read-only values stay read-only | pass |
| Explicit write-enabled values are allowlisted | pass |
| Any effective workspace-write task requires UI approval | pass |
| Existing risky-action approval reasons preserved | pass |
| Full quality gate passes | pass |

## Remaining Work

- Phase 2 must scrub public snapshot paths and make release gates green.
- Phase 3 will turn the safe defaults into a reproducible bootstrap path.
