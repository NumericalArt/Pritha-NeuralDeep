---
id: 2026-05-28-techscope-quality-phase-0-baseline-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - quality-roadmap
  - phase-0
  - baseline
  - golden-checks
  - pritha
tools:
  - Codex
  - git
  - node
  - sqlite3
  - Agents Mother
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 07_workflows/techscope-quality-audit-log.md
  - scripts/golden-checks.mjs
  - scripts/agents-mother.mjs
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/techscope-quality-audit-log.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-pre-phase-0-reconciliation-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-0-baseline-report-v1
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope quality roadmap Phase 0 baseline
temporal_status: current
---

# Phase 0 Baseline Report: Techscope quality roadmap

Date: 2026-05-28
Status: complete
Phase: 0 — Foundation: git, baseline, golden checks harness

## Summary

Phase 0 established the baseline harness required before later quality/release work:

- `.gitignore` audited and expanded for runtime state, secrets, raw artifacts, caches and local cruft.
- `scripts/golden-checks.mjs` created with human and `--json` output.
- `scripts/agents-mother.mjs test` gained `--no-report` to support non-mutating self-inspection.
- `07_workflows/techscope-quality-audit-log.md` created as append-only phase log.
- This baseline report records memory stats, queue status, self-inspection, script line counts, path mismatches and utility hashes.

## Baseline golden checks

Command:

```sh
node scripts/golden-checks.mjs
```

Result:

```text
Techscope golden checks: pass
Root: <TECHSCOPE_ROOT>
- PASS Markdown integrity
- PASS Memory rebuild
- PASS Memory stats
- PASS Agents Mother self-inspection
- PASS Telegram dry-run
- PASS Telegram queue status
- SKIPPED Embeddings rebuild (optional)
- SKIPPED Semantic search sanity (optional)
```

Machine-readable mode was also checked:

```sh
node scripts/golden-checks.mjs --json
```

Result: `pass`.

Final optional command:

```sh
node scripts/golden-checks.mjs --with-embeddings
```

Result: `pass`, including embeddings rebuild and semantic search sanity.

## Memory snapshot

Command:

```sh
node scripts/query-memory.mjs stats
```

Snapshot before this report was added:

```text
documents   391
chunks      3796
entities    918
relations   10381
embeddings  0
```

Note: default golden checks rebuild SQLite and skip embeddings unless `--with-embeddings` or `TECHSCOPE_GOLDEN_EMBEDDINGS=1` is used.

Final verification after this report was added:

```text
documents   392
chunks      3811
entities    924
relations   10398
embeddings  3667
```

## Queue snapshot

Command:

```sh
node scripts/telegram-bot.mjs queue-status
```

Result:

```json
{
  "telegram_intake": {
    "pending": 0,
    "processing": 0,
    "awaiting_codex": 1,
    "complete": 7,
    "done": 12,
    "failed": 0
  },
  "codex_media_review": {
    "pending": 1,
    "done": 5
  }
}
```

## Agents Mother self-inspection

Command:

```sh
node scripts/agents-mother.mjs test . --no-report
```

Result:

```text
Project: <TECHSCOPE_ROOT>
Classification: agent-project
Result: complete
Report: skipped (--no-report)
```

## Script line counts

```text
5    scripts/run-techscope-telegram-bot.sh
11   scripts/run-techscope-web.sh
85   scripts/embed-memory.py
103  scripts/semantic-search.py
109  scripts/golden-checks.mjs
194  scripts/query-memory.mjs
221  scripts/transcribe-youtube.mjs
223  scripts/techscope_web.py
233  scripts/validate-memory.mjs
252  scripts/techscope-web.mjs
334  scripts/extract-signal.mjs
394  scripts/rebuild-memory.mjs
673  scripts/llm-wiki.mjs
728  scripts/process-intake.mjs
778  scripts/telegram-bot.mjs
3808 scripts/agents-mother.mjs
8151 total
```

## Known path mismatches

Executable/runtime path mismatches to address in Phase 1:

```text
scripts/techscope_web.py: ROOT = Path("<TECHSCOPE_ROOT>")
scripts/techscope_web.py: HOME = "<USER_HOME>"
scripts/transcribe-youtube.mjs: hardcoded <USER_HOME> Python paths
scripts/run-techscope-web.sh: cd "<TECHSCOPE_ROOT>"
scripts/run-techscope-web.sh: hardcoded <USER_HOME> PATH entries
scripts/run-techscope-telegram-bot.sh: cd <TECHSCOPE_ROOT>
launchd/com.techscope.telegram-bot.plist: hardcoded <TECHSCOPE_ROOT> and HOME
launchd/com.techscope.web.plist: hardcoded <TECHSCOPE_ROOT> and HOME
operations/manifest.json: autostart policy references <TECHSCOPE_ROOT>
```

Instruction/history path references in `AGENTS.md` are intentional until Phase 1 creates env-first canonical-root wording.

## Utility hashes

SHA-256:

```text
ff5c198ea888ed033fc5ab2e1cf13ece22ac8386cf13c62eda1598c33bd296b8  scripts/validate-memory.mjs
233013a8c97a48d21fea1079d2b92c78b8d086b5fee9ed94b2595488dfd0a84c  scripts/rebuild-memory.mjs
e0125441902ed709d92ac349283da1eb46cceea33d29df99f4195f85d8d5f941  scripts/query-memory.mjs
aec29442716fe8c41926c534089076f3130a601b4434118fa42dd8f47fec65fd  scripts/agents-mother.mjs
b8a35df6035ab54a3906c2f3cb118b3bfa78b8ba9d110391dd6654d35784e0c8  scripts/telegram-bot.mjs
e194bf5f29e3c817fa2df78c34bd99293ffbde12b040bb102c05d55dfbaa02fb  scripts/golden-checks.mjs
```

These hashes are a baseline snapshot only. Phase 0 itself changed `agents-mother.mjs` and `golden-checks.mjs`, so final git commit is the authoritative source after this report.

## Changes made

Created:

- `scripts/golden-checks.mjs`
- `07_workflows/techscope-quality-audit-log.md`
- `11_agents/reports/2026-05-28-techscope-quality-phase-0-baseline-report.md`

Modified:

- `.gitignore`
- `scripts/agents-mother.mjs`

## Regressions observed

- `scripts/golden-checks.mjs` initially resolved root as `<USER_HOME>`; fixed by deriving root from `fileURLToPath(import.meta.url)`.
- Parallel golden-check invocations can contend on SQLite rebuild. Golden checks should run sequentially.
- Repeated `agents-mother test .` used to create duplicate report ids; fixed by deriving report id from the unique report filename and adding `--no-report`.

## Rollback instructions

After Phase 0 commit exists:

```sh
git revert HEAD
```

Before commit, manually remove the new files and restore modified files from the pre-Phase 0 snapshot if needed.

## AM-CANDIDATE patterns

- `audit-baseline-report`: every roadmap phase gets a structured report with evidence.
- `golden-checks-manifest`: one green/red command wraps project health.
- `audit-log-append-only`: roadmap execution becomes inspectable history.
- `non-mutating-self-inspection`: health checks should not create durable reports by default.

## Open questions

- None for Phase 0.
