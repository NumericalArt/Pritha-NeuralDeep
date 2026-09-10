---
id: 2026-05-28-techscope-quality-phase-1-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - quality-roadmap
  - phase-1
  - portable-root
  - launchd
tools:
  - Codex
  - node
  - python3
  - launchd
  - TECHSCOPE_ROOT
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 05_decisions/2026-05-28-techscope-portable-root.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/techscope-quality-audit-log.md
  decisions:
    - 05_decisions/2026-05-28-techscope-portable-root.md
    - 05_decisions/2026-05-18-techscope-canonical-root.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-quality-phase-0-baseline-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-1-portable-root
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope Phase 1 portable root verification
temporal_status: current
---

# Techscope Quality Phase 1 Report: Portable Root

## Summary

Phase 1 completed successfully. Techscope runtime code no longer hardcodes the
local user path in `scripts/`, `launchd/`, `interfaces/`, `memory/`, `tools/`,
or `operations/`. Root resolution is env-first and launchd files are portable
templates with explicit placeholders.

## Changes made

- Created `scripts/lib/paths.mjs` with:
  - `resolveTechscopeRoot()`: `TECHSCOPE_ROOT` -> git root -> current cwd.
  - `resolveSiblingAgentPath(name)`: parent-of-root sibling by default.
  - `pathFromRoot(...segments)`.
- Created `scripts/healthcheck.mjs` for root, manifest, sqlite, script,
  telegram dry-run and launchd plist validation.
- Updated `scripts/run-techscope-web.sh` and
  `scripts/run-techscope-telegram-bot.sh` to derive root from their own script
  location, unless `TECHSCOPE_ROOT` is provided.
- Updated `scripts/techscope_web.py` to resolve root from env/git/cwd and stop
  injecting a hardcoded `HOME`.
- Updated `scripts/transcribe-youtube.mjs` to use portable root resolution and
  discover `mlx_whisper`/`imageio_ffmpeg` from environment, PATH and Python.
- Converted launchd plist files to placeholder templates:
  `__TECHSCOPE_ROOT__`, `__HOME__`, `__USER__`.
- Added `launchd/README.md` with rendering and safety instructions.
- Updated `operations/manifest.json` healthcheck to `node scripts/healthcheck.mjs`.
- Added decision `05_decisions/2026-05-28-techscope-portable-root.md`.
- Marked the previous canonical-root decision as superseded.
- Updated `AGENTS.md` to define env-first root and sibling-agent placement.

## Verification results

- Baseline before edits:
  - `node scripts/golden-checks.mjs --with-embeddings` -> pass.
- Markdown validation after edits:
  - `node scripts/validate-memory.mjs` -> pass for 393 Markdown files.
- Runtime path audit:
  - `grep -rn "<USER_HOME>" scripts launchd interfaces memory tools operations` -> no matches.
- Healthcheck:
  - `node scripts/healthcheck.mjs` -> pass.
  - `TECHSCOPE_ROOT=<TECHSCOPE_ROOT> node <TECHSCOPE_ROOT>/scripts/healthcheck.mjs` from `/tmp` -> pass.
- Portable golden check:
  - `TECHSCOPE_ROOT=<TECHSCOPE_ROOT> node <TECHSCOPE_ROOT>/scripts/golden-checks.mjs` from `/tmp` -> pass.
  - `TECHSCOPE_ROOT=<TECHSCOPE_ROOT> node <TECHSCOPE_ROOT>/scripts/golden-checks.mjs --with-embeddings` from `/tmp` -> pass.
- Agents Mother self-inspection:
  - `node scripts/agents-mother.mjs test . --no-report` -> complete.
- launchd validation:
  - `plutil -lint launchd/com.techscope.web.plist launchd/com.techscope.telegram-bot.plist` -> OK.
- Final memory stats after report and embeddings rebuild:
  - documents: 394
  - chunks: 3827
  - entities: 928
  - relations: 10427
  - embeddings: 3683

## Regressions observed

No functional regression observed. `rebuild-memory` clears embeddings as part of
the normal derived-index rebuild; the final gate for this phase rebuilds
embeddings with `--with-embeddings`.

## Rollback instructions

Use git to revert the Phase 1 commit after it is created:

```sh
git revert <phase-1-commit>
```

If only launchd templates need rollback, restore:

```sh
git restore launchd scripts/run-techscope-web.sh scripts/run-techscope-telegram-bot.sh
```

## AM-CANDIDATE patterns

- `TECHSCOPE_ROOT-env`: env-first root resolution for portable local agents.
- `path-portability-check`: grep + healthcheck gate for user-specific runtime paths.
- `home-aware-launchd-template`: committed plist templates with placeholders, not filled local config.
- `portable-tool-discovery`: discover local tools from env/PATH/Python instead of hardcoded user paths.

## Open questions

- Phase 2 should decide whether to generate filled launchd plists from templates
  or keep rendering as a documented manual step.
