---
id: 2026-05-28-techscope-quality-phase-13-github-ci-release-prep-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - pritha
  - github
  - ci
  - release
  - phase-13
tools:
  - GitHub Actions
  - Dependabot
  - Pritha
  - Git
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - https://github.com/actions/checkout
  - https://github.com/actions/setup-node/releases
  - https://github.com/actions/setup-python
  - https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file
  - https://docs.github.com/articles/about-branch-restrictions
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/techscope-quality-audit-log.md
  decisions:
    - 05_decisions/2026-05-28-pritha-public-snapshot-scrub.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-13-github-ci-release-prep
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha v0.1 GitHub publication preparation
temporal_status: current
---

# Techscope Quality Phase 13 Report: GitHub CI And Release Prep

## Summary

Phase 13 prepared Pritha for GitHub publication without performing remote
GitHub operations. Creating the repository, pushing, branch protection and the
public visibility flip remain explicit user-confirmed handoff steps.

## Changes made

Created:

- `.github/workflows/quality-gate.yml`
- `.github/workflows/memory-validate.yml`
- `.github/workflows/setup-wizard-smoke.yml`
- `.github/dependabot.yml`
- `docs/release.md`
- `scripts/pre-push-audit.mjs`
- `05_decisions/2026-05-28-pritha-public-snapshot-scrub.md`

Updated:

- `scripts/env-doctor.mjs`
  - `mlx-whisper` remains critical on macOS.
  - `mlx-whisper` is a warning on Linux CI because it is a local macOS transcription helper.
- `package.json`
  - Added `pre-push-audit` script.
- Markdown memory snapshot
  - Replaced local absolute paths with placeholders.
  - Replaced Telegram numeric user/chat id with `telegram-user`.
  - Renamed tracked files that contained the Telegram id.
- `docs/release.md`
  - Documented branch protection, release flow, tag flow and safe publication handoff.

## CI design

- `Quality Gate`
  - Runs on pull requests and pushes to `main`.
  - Matrix: Ubuntu latest, Node 20 and Node 22.
  - Installs portable Python dependencies and runs `env-doctor` + `quality-gate`.
- `Memory Validate`
  - Runs for memory/source-of-truth path changes.
  - Runs `validate-memory`, `rebuild-memory` and count sanity.
- `Setup Wizard Smoke`
  - Runs for setup workflow/script changes.
  - Runs the Phase 12 setup CLI in temp state/env paths.
- Dependabot
  - Weekly npm, pip and GitHub Actions update checks.

## Verification results

Phase-specific checks:

- Official GitHub action/dependabot/branch-protection sources checked on 2026-05-28.
- `git log --all -- .env .env.local '*.sqlite' '*.token' 'secrets/*' --oneline` -> empty.
- `git ls-files | grep '6208460904'` -> 0.
- `git grep -n '6208460904'` -> no matches.
- `git grep -n '<private local path pattern>'` -> no matches.
- `node scripts/pre-push-audit.mjs --json` -> pass:
  - secret history: pass;
  - forbidden tracked files: pass;
  - local absolute paths: pass;
  - Telegram id candidates: pass;
  - `gitleaks` and `trufflehog`: missing locally, documented as optional one-time scanners.
- `node scripts/validate-memory.mjs` -> pass after scrub/renames.
- `node scripts/quality-gate.mjs` -> pass.
- `npm test --silent` -> golden checks pass + 36 tests pass.
- `node scripts/golden-checks.mjs --with-embeddings` -> pass.

Final memory stats:

- documents: 420
- chunks: 4037
- entities: 1003
- relations: 10768
- embeddings: 3887

## Not executed

- GitHub repository creation.
- Push to GitHub.
- Branch protection setup.
- GitHub Release creation.
- `gitleaks` and `trufflehog` binary scans.

These are intentionally not executed without explicit user confirmation and
available GitHub credentials/tooling.

## Safety notes

- `secure-handoffs/` remains outside the repository.
- The current tracked snapshot is scrubbed, but old local Git history still
  exists locally. For first public release, create/push a verified private repo
  first and only then flip public.

## Rollback instructions

After the Phase 13 commit is created:

```sh
git revert <phase-13-commit>
```

## AM-CANDIDATE patterns

- `github-quality-workflow`: GitHub Actions quality gate with Node matrix.
- `markdown-validate-workflow`: focused source-of-truth validation workflow.
- `setup-wizard-ci-smoke`: clean temp setup smoke in CI.
- `secure-handoff-folder`: publication instructions remain outside repo.
- `local-path-scrub`: public snapshot scrub before first push.

## Open questions

- Should Pritha publish from current history, a fresh clean export, or a
  history-rewritten branch?
- Should `gitleaks`/`trufflehog` become required local release gates once
  installed on the release machine?
