---
id: 2026-05-28-pritha-public-snapshot-scrub
type: decision
status: accepted
created: 2026-05-28
updated: 2026-05-28
topics:
  - pritha
  - release
  - security
  - privacy
tools:
  - Git
  - GitHub
  - Pritha
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - scripts/pre-push-audit.mjs
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-quality-phase-13-github-ci-release-prep-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-13-release-prep
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha v0.1 public snapshot preparation
temporal_status: current
---

# Decision: Scrub Local Paths And Telegram User Id Before Public Snapshot

## Context

Phase 13 pre-push audit found historical Markdown artifacts with local absolute
paths and Telegram user identifiers. They were useful as private project
history, but are not appropriate for a public Pritha snapshot.

## Decision

The tracked source-of-truth snapshot is scrubbed before any GitHub publication:

- local absolute paths are replaced with placeholders such as
  `<TECHSCOPE_ROOT>`, `<SIBLING_AGENT_ROOT>` and `<USER_HOME>`;
- Telegram numeric user/chat identifiers are replaced with `telegram-user`;
- tracked filenames containing the Telegram id are renamed to use
  `telegram-user`;
- the original local details remain outside the public repo, if needed, in
  `secure-handoffs/`.

## Consequences

- Current tracked content is safer for public release.
- Historical private paths are less precise, but still semantically useful.
- A normal commit does not rewrite older Git history. For the first public
  repository, prefer a fresh private GitHub repo or clean export path, verify it,
  then flip public.
