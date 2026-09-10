---
id: 2026-05-28-techscope-quality-phase-2-operations-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - quality-roadmap
  - phase-2
  - operations
  - telegram
  - launchd
  - repo-cleanup
tools:
  - Codex
  - node
  - Telegram Bot API
  - launchd
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - .logs/techscope-telegram-bot.err.log
  - .logs/techscope-web.err.log
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/techscope-quality-audit-log.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-quality-phase-1-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-2-operational-reality
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope Phase 2 operational reality verification
temporal_status: current
---

# Techscope Quality Phase 2 Operations Report

## Summary

Phase 2 completed successfully. Telegram polling now uses exponential backoff,
jitter, Telegram `retry_after` handling and rate-limited repeated error logs.
Repository cruft was removed from the working directory, and the web runner was
verified through a portable local startup without installing launchd.

## Incidents observed

### Telegram getUpdates noise

Current log sample before the fix:

- `fetch failed`: 150 repeated lines.
- `Telegram API getUpdates failed: Bad Gateway`: 14 lines.
- `Telegram API getUpdates failed: Too Many Requests`: 3 lines.

Fix:

- Added configurable retry controls:
  - `TECHSCOPE_TELEGRAM_RETRY_INITIAL_MS`
  - `TECHSCOPE_TELEGRAM_RETRY_MAX_MS`
  - `TECHSCOPE_TELEGRAM_RETRY_JITTER_RATIO`
  - `TECHSCOPE_TELEGRAM_ERROR_LOG_INTERVAL_MS`
- Added exponential backoff with jitter for polling failures.
- Added support for Telegram `retry_after` from API errors.
- Added repeated-error suppression so identical failures are aggregated instead
  of written to the log on every loop.
- Made `deleteWebhook` startup failure non-fatal; the long polling loop continues
  and handles retry behavior.

### Web launchd old path

Current web error log still contains historical entries from the old root:

- `<ARCHIVED_TECHSCOPE_ROOT>/scripts/run-techscope-web.sh`: 4 lines.

Fix/verification:

- Phase 1 already replaced launchd files with portable templates.
- Phase 2 verified the portable web runner manually:
  - `HOST=127.0.0.1 PORT=3307 TECHSCOPE_ROOT=<TECHSCOPE_ROOT> scripts/run-techscope-web.sh`
  - `curl -fsS http://127.0.0.1:3307/`
  - `curl -fsS http://127.0.0.1:3307/api/stats`
- No launchd install/reload was performed.

## Repository cleanup

Removed ignored local cruft from the working directory:

- `.DS_Store`
- `.queue/.DS_Store`
- `00_inbox/.DS_Store`
- `01_sources/.DS_Store`
- `11_agents/.DS_Store`
- `2026-05-15.md`
- `Untitled.canvas`
- `Untitled 1.canvas`

Verification:

- `find . -name '.DS_Store' -o -name 'Untitled*.canvas' -o -name '2026-05-15.md'` -> no output.
- `git ls-files | grep -E '\\.DS_Store|Untitled.*\\.canvas|^2026-05-15\\.md$'` -> no output.
- `git log --all -- .env .env.local '*.sqlite' '*.token' 'secrets/*' --oneline` -> no output.

## Verification results

- Baseline before edits:
  - `node scripts/golden-checks.mjs --with-embeddings` -> pass.
- Telegram syntax and dry-run:
  - `node --check scripts/telegram-bot.mjs` -> pass.
  - `node scripts/telegram-bot.mjs poll-once --dry-run` -> pass.
  - `node scripts/telegram-bot.mjs queue-status` -> pass.
- Operations:
  - `node scripts/healthcheck.mjs` -> pass.
  - `plutil -lint launchd/com.techscope.web.plist launchd/com.techscope.telegram-bot.plist` -> OK.
  - Portable web startup on `127.0.0.1:3307` -> pass.
- Memory validation:
  - `node scripts/validate-memory.mjs` -> pass for 394 Markdown files before this report.
- Final golden gate:
  - `node scripts/golden-checks.mjs --with-embeddings` -> pass.
- Final healthcheck:
  - `node scripts/healthcheck.mjs` -> pass.
- Final memory stats after report and embeddings rebuild:
  - documents: 395
  - chunks: 3839
  - entities: 931
  - relations: 10443
  - embeddings: 3695

## Regressions observed

No regression observed. The real Telegram poll loop was not left running from
this Codex session; verification used syntax checks and dry-run commands. The
existing queue remains intentionally non-empty because it contains one
`awaiting_codex` media review item from the previous pipeline state.

## Rollback instructions

After the Phase 2 commit is created:

```sh
git revert <phase-2-commit>
```

The removed cruft files are ignored generated/local files and do not need
rollback.

## AM-CANDIDATE patterns

- `incident-as-operations-report`: runtime log evidence converted into a
  structured operations report.
- `external-fetch-backoff`: network polling should use exponential backoff,
  jitter, upstream retry hints and log aggregation.
- `repo-cruft-cleanup`: ignored local files are still cleaned before release,
  not merely hidden by `.gitignore`.
- `non-fatal-startup-network-warning`: startup network calls should warn and
  enter the retry loop instead of killing a long-running connector.

## Open questions

- Phase 8 queue-health should decide whether stale `awaiting_codex` media review
  jobs should be warnings or quality-gate failures.
