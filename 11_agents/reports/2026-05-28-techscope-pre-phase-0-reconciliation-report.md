---
id: 2026-05-28-techscope-pre-phase-0-reconciliation-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - canonical-root
  - reconciliation
  - quality-roadmap
  - pritha
tools:
  - Codex
  - Agents Mother
  - validate-memory
  - rebuild-memory
sources:
  - <TECHSCOPE_ROOT>
  - <ARCHIVED_TECHSCOPE_ROOT>
  - 05_decisions/2026-05-18-techscope-canonical-root.md
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
related:
  decisions:
    - 05_decisions/2026-05-18-techscope-canonical-root.md
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  reports: []
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: pre-phase-0 canonical reconciliation
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope Phase 0 start readiness
temporal_status: current
---

# Operations Report: Techscope pre-Phase 0 reconciliation

Date: 2026-05-28
Status: complete

## Summary

Prepared canonical Techscope root for Phase 0 of the quality/release roadmap.

The canonical workspace remains:

```text
<TECHSCOPE_ROOT>
```

The old workspace remains archive/source-only:

```text
<ARCHIVED_TECHSCOPE_ROOT>
```

No runtime state, secrets, `.env.local`, `.queue`, `.logs` or SQLite database files were copied from the archive folder.

## Changes made

- Copied missing curated Markdown artifacts from `<ARCHIVED_TECHSCOPE_ROOT>` into `<TECHSCOPE_ROOT>`.
- Copied missing FESPA26 and Funny Teacher lifecycle reports and contracts.
- Copied missing standards created after the original migration:
  - `agent-runtime-placement`
  - `agent-team-operating-model`
  - `agent-untrusted-input-security`
  - `agent-harness-evaluation`
  - `codex-goals-for-long-running-agent-work`
  - `realtime-voice-control-for-codex-agents`
- Copied new source notes, briefs and assessments for OpenClaw, NemoClaw, Hermes operating model and local harness benchmark.
- Moved the quality roadmap from project root into:

```text
07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
```

- Updated selected shared templates and standards from the archive copy where they contained newer temporal/freshness/runtime-placement fields.
- Updated `AGENTS.md` to preserve canonical-root/media/wiki rules while adding:
  - temporal metadata requirements;
  - Techscope adoption check;
  - runtime placement;
  - team mode;
  - untrusted input policy;
  - runtime isolation profile;
  - deployment and post-creation review rules.
- Updated `scripts/agents-mother.mjs` with runtime-placement contract support from the archive copy.
- Rebuilt `11_agents/registry.md`.

## Verification results

Commands run from `<TECHSCOPE_ROOT>`:

```text
node --check scripts/agents-mother.mjs
node scripts/validate-memory.mjs
node scripts/rebuild-memory.mjs
node scripts/query-memory.mjs stats
node scripts/agents-mother.mjs registry
node scripts/agents-mother.mjs test .
node scripts/telegram-bot.mjs poll-once --dry-run
node scripts/telegram-bot.mjs queue-status
```

Observed status before final re-index:

```text
validate-memory: passed
rebuild-memory: indexed 385 documents, 3763 chunks
query-memory stats: documents 385, chunks 3763, entities 908, relations 10299
agents-mother test .: complete
telegram dry-run: ok
telegram queue: awaiting_codex 1, codex_media_review pending 1
```

## Known remaining pre-Phase 0 state

These are intentionally not fixed in preflight because the roadmap assigns them to Phase 0-2:

- Git is not initialized yet.
- `scripts/golden-checks.mjs` does not exist yet.
- Hardcoded `<TECHSCOPE_ROOT>` paths still exist in scripts and launchd files.
- Repo cruft such as `.DS_Store`, `Untitled*.canvas` and `2026-05-15.md` still exists.
- Telegram queue has one `awaiting_codex` / pending media-review item.
- Embeddings may need rebuild after the final Phase 0 baseline command.
- `agents-mother test .` generated duplicate frontmatter ids for repeated same-day test reports. Existing reports were manually disambiguated with `-2` and `-3`, and `scripts/agents-mother.mjs` was fixed to derive the report id from the final unique filename. A follow-up test created `2026-05-28-techscope-agent-test-report-4` with a unique id.

## Readiness

Ready to start Phase 0 from canonical root:

```text
<TECHSCOPE_ROOT>
```

Do not run Phase 0 from `<ARCHIVED_TECHSCOPE_ROOT>`.

## AM-CANDIDATE patterns

- `canonical-root-reconciliation`
- `archive-source-only-folder`
- `pre-phase-readiness-report`
