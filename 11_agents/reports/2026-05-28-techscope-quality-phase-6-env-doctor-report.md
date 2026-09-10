---
id: 2026-05-28-techscope-quality-phase-6-env-doctor-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - quality-roadmap
  - phase-6
  - dependencies
  - env-doctor
tools:
  - Codex
  - Node.js
  - sqlite3
  - Python
  - sentence-transformers
  - mlx-whisper
  - yt-dlp
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - requirements.txt
  - docs/prerequisites.md
  - scripts/env-doctor.mjs
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/techscope-quality-audit-log.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-quality-phase-5-test-layer-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-6-env-doctor
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope Phase 6 dependency diagnostics
temporal_status: current
---

# Techscope Quality Phase 6 Report: Env Doctor

## Summary

Phase 6 completed successfully. Techscope now has explicit dependency manifests,
human prerequisites documentation and a machine-readable environment doctor that
checks critical local runtime dependencies with actionable install hints.

## Changes made

Created:

- `requirements.txt`
- `docs/prerequisites.md`
- `scripts/env-doctor.mjs`
- `tests/env-doctor.test.mjs`

Updated:

- `package.json`
  - Added `env`: `node scripts/env-doctor.mjs`.
- `scripts/healthcheck.mjs`
  - Runs env doctor as a non-blocking health warning.
- `scripts/golden-checks.mjs`
  - Runs env doctor as a non-blocking warning until a later release gate makes it strict.
- `scripts/transcribe-youtube.mjs`
  - Finds `mlx_whisper` in the Python user scripts directory when it is installed but not on `PATH`.

## Dependency policy

Pinned Python packages:

- `sentence-transformers==5.1.2`
- `imageio-ffmpeg==0.6.0`
- `mlx-whisper==0.4.3`
- `yt-dlp==2025.10.14`

`mlx-whisper` is the selected local Whisper alternative for the current Apple
Silicon workflow. `openai-whisper` is not pinned because the active transcription
script uses `mlx_whisper`.

Python 3.10+ remains the preferred baseline for new installs. The current Mac
mini environment uses Apple Command Line Tools Python 3.9.6 and successfully
runs the existing embedding/transcription stack, so env doctor treats Python 3.9
as a temporary compatibility floor and reports Python < 3.10 as a warning by
default. `node scripts/env-doctor.mjs --strict` promotes that warning to a
critical failure.

## Verification results

Baseline:

- `node scripts/golden-checks.mjs --with-embeddings` -> pass before Phase 6 edits.

Phase-specific checks:

- `node scripts/env-doctor.mjs` -> pass with 4 warnings:
  - Python 3.10 recommended baseline missing on this machine.
  - Codex CLI not found.
  - `rg` not found.
  - system `ffmpeg` not found; non-blocking because `imageio-ffmpeg` is available.
- `node scripts/env-doctor.mjs --json` -> pass, machine-readable payload.
- `node scripts/env-doctor.mjs --simulate-missing=sqlite3` -> fails as expected with actionable sqlite3 install hint.
- `node scripts/env-doctor.mjs --strict` -> fails as expected on Python 3.9.6.
- `node scripts/healthcheck.mjs` -> pass with env doctor embedded.
- `node --test tests/**/*.test.mjs` -> 15 tests pass.
- `npm test --silent` -> golden checks pass + 15 tests pass.

Fresh clone simulation:

- `git clone <TECHSCOPE_ROOT> /tmp/techscope-phase6-clone.../Techscope`
  -> success after the Phase 6 commit.
- `node scripts/env-doctor.mjs` inside the clean clone -> pass with the same
  4 environment warnings as the source checkout.
- `node scripts/env-doctor.mjs --simulate-missing=sqlite3` inside the clean clone
  -> fails as expected with an actionable sqlite3 install hint.

Final gate:

- `node scripts/golden-checks.mjs --with-embeddings` -> pass after report/audit/registry updates.
- `npm test --silent` -> pass after report/audit/registry updates.

Final memory stats after the embeddings gate:

- documents: 400
- chunks: 3883
- entities: 950
- relations: 10513
- embeddings: 3739

## Regressions observed

No production regression observed. The phase exposed two useful environment
facts:

- `rg` is not installed on this Mac mini, so Codex falls back to `grep/find`.
- `mlx_whisper` was installed in the Python user scripts directory but not on
  `PATH`; `transcribe-youtube.mjs` now discovers that location directly.
- Running two memory-writing gates concurrently can trigger SQLite
  `database is locked`; final checks must run sequentially until Phase 7
  introduces a serialized quality gate.

## Rollback instructions

After the Phase 6 commit is created:

```sh
git revert <phase-6-commit>
```

## AM-CANDIDATE patterns

- `prerequisites-md`: human-readable prerequisites with current-machine caveats.
- `env-doctor-mjs`: dependency doctor with human and JSON output.
- `python-requirements-pinned`: pinned Python package manifest for reproducible setup.
- `non-blocking-env-warning`: environment diagnostics can be visible before they become release gates.

## Open questions

- Should Phase 7 or Phase 8 make `--strict` env doctor part of a release gate?
- Should Techscope install `rg` on this Mac mini, or leave it as an optional
  developer convenience?
