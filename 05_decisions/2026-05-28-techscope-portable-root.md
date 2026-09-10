---
id: 2026-05-28-techscope-portable-root
type: decision
status: active
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - portable-root
  - launchd
  - agents-mother
  - open-source
tools:
  - Codex
  - node
  - launchd
  - TECHSCOPE_ROOT
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 05_decisions/2026-05-18-techscope-canonical-root.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  decisions:
    - 05_decisions/2026-05-18-techscope-canonical-root.md
  reports: []
supersedes:
  - 05_decisions/2026-05-18-techscope-canonical-root.md
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: portable root phase 1
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope runtime root resolution from Phase 1 onward
temporal_status: current
review_date: 2026-06-28
---

# Decision: Techscope portable root

Date: 2026-05-28
Status: active

## Context

The previous canonical-root decision fixed Techscope to one local machine path.
That was useful during migration, but it blocks open-source release, fresh clones,
forks, and sibling-agent creation on another account or host.

## Decision

Use env-first root resolution for runtime code:

1. `TECHSCOPE_ROOT` when set.
2. Git root from the current working directory.
3. `process.cwd()` / current directory as fallback.

Launchd files in the repository are templates with placeholders:
`__TECHSCOPE_ROOT__`, `__HOME__`, and `__USER__`. Filled plist files are local
runtime configuration and must not be committed.

Sibling agents are created under the parent directory of the resolved Techscope
root unless an explicit target path is provided in the agent contract.

## Consequences

- Runtime scripts no longer depend on one macOS username or checkout path.
- `scripts/lib/paths.mjs` becomes the shared root-resolution source for Node
  scripts.
- Launchd setup requires a rendering/copy step before installation.
- Historical Markdown may keep absolute paths as migration evidence, but
  executable code and manifests should not.

## Alternatives considered

- Keep a fixed canonical root. Rejected: too brittle for forks and release.
- Use only `process.cwd()`. Rejected: scripts are often launched from another
  directory by Codex, launchd, or wrappers.
- Use only git root. Rejected: setup and generated projects may need an
  explicit env override.

## Temporal basis

- Source published: 2026-05-28
- Source updated: 2026-05-28
- Source version: portable root phase 1
- Retrieved: 2026-05-28
- Verified: 2026-05-28
- Valid for: Techscope runtime root resolution from Phase 1 onward
- Freshness status: current
- Temporal status: current
- Supersedes: `05_decisions/2026-05-18-techscope-canonical-root.md`
- Superseded by: none

## Review date

2026-06-28
