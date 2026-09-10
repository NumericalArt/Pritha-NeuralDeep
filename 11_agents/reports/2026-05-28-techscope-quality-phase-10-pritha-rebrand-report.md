---
id: 2026-05-28-techscope-quality-phase-10-pritha-rebrand-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - pritha
  - rebranding
  - cli-alias
  - phase-10
tools:
  - Codex
  - Pritha
  - Agents Mother
  - node
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - scripts/pritha.mjs
  - scripts/agents-mother.mjs
  - scripts/agents-mother/index.mjs
  - 05_decisions/2026-05-28-pritha-rebrand.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/techscope-quality-audit-log.md
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
  decisions:
    - 05_decisions/2026-05-28-pritha-rebrand.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-10-pritha-alias-first
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha v0.1 alias-first rebrand
temporal_status: current
---

# Techscope Quality Phase 10 Report: Pritha Rebrand

## Summary

Phase 10 introduced **Pritha** as the public product name and preferred CLI
entrypoint for the Agents Mother layer, using the required alias-first approach.

Existing Agents Mother commands remain compatible. No frontmatter `type` values,
memory schema or `11_agents/` paths were renamed.

## Changes made

Created:

- `scripts/pritha.mjs`
- `05_decisions/2026-05-28-pritha-rebrand.md`
- `tests/pritha-alias.test.mjs`
- `<SECURE_HANDOFFS_DIR>/2026-05-28-pritha-repo-note.md` (outside repo)

Updated:

- `scripts/agents-mother.mjs`
  - Now prints a deprecation notice to stderr and delegates to the same entrypoint.
- `scripts/agents-mother/index.mjs`
  - Help text chooses Pritha or compatibility wording based on invoked script.
  - Added aliases:
    - `create` -> `init` or `scaffold` depending on whether a contract path is supplied.
    - `publish` -> trial check through `test --no-report`.
    - `lineage` -> registry rebuild.
- `package.json`
  - Added `bin.pritha`.
- `README.md`
  - Added a short Pritha usage section.
- `04_standards/agent-creation-harness.md`
  - Added Pritha naming and lineage vocabulary.
- `07_workflows/agents-mother.md`
  - Added Pritha commands and compatibility note.
- `08_templates/agent-project-contract.md`
  - Added optional lineage metadata fields.

## Verification results

Phase-specific checks:

- `node scripts/pritha.mjs test . --no-report` -> pass.
- `node scripts/agents-mother.mjs test . --no-report` -> pass and prints deprecation note.
- `node --test tests/pritha-alias.test.mjs tests/scaffold-snapshot.test.mjs` -> pass.
- `node scripts/quality-gate.mjs` -> pass before report creation.

Final gate:

- `node scripts/quality-gate.mjs` -> pass.
- `npm test --silent` -> golden checks pass + 31 tests pass.
- `node scripts/golden-checks.mjs --with-embeddings` -> pass.

Final memory stats:

- documents: 411
- chunks: 3966
- entities: 982
- relations: 10667
- embeddings: 3821

## Compatibility notes

- Old CLI path: kept.
- New CLI path: added.
- Scaffold snapshot: unchanged.
- Report and contract `type` values: unchanged.
- Memory schema: unchanged.
- Runtime folders and ignored files: unchanged.

## Rollback instructions

After the Phase 10 commit is created:

```sh
git revert <phase-10-commit>
```

## AM-CANDIDATE patterns

- `cli-rename-with-alias`: introduce a new product CLI while old commands remain shims.
- `brand-layer-separation`: narrative naming changes do not mutate schemas or paths.
- `lineage-vocabulary`: child-agent lifecycle can be described without breaking technical artifacts.

## Open questions

- Should Phase 11 translate the existing Russian README fully, or create a separate English OSS README first and keep the Russian knowledge README internal?
