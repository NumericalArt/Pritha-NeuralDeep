---
id: 2026-05-28-pritha-rebrand
type: decision
status: accepted
created: 2026-05-28
updated: 2026-05-28
topics:
  - pritha
  - agents-mother
  - rebranding
  - cli
  - compatibility
tools:
  - Codex
  - Pritha
  - Agents Mother
  - node
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 04_standards/agent-creation-harness.md
  - 07_workflows/agents-mother.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-creation-harness.md
  reports: []
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-10-alias-first-rebrand
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha v0.1 alias-first rebrand
temporal_status: current
---

# Decision: Pritha Rebrand

Date: 2026-05-28
Status: accepted

## Decision

The public product name for the Agents Mother layer is **Pritha**.

Pritha is the spec-to-agent compiler inside Techscope: it turns a user request or specification into a working child agent scaffold with tests, handoff and lifecycle reports.

## Compatibility Policy

- Add `scripts/pritha.mjs` as the preferred entrypoint.
- Keep `scripts/agents-mother.mjs` as a compatibility shim for at least one release.
- Keep frontmatter `type` values unchanged.
- Keep `11_agents/`, reports, contracts and memory schema unchanged.
- Keep old command names working while adding Pritha aliases.
- Do not rename Techscope; Techscope remains the internal knowledge layer.

## CLI Policy

Preferred:

```sh
node scripts/pritha.mjs <command>
```

Compatibility:

```sh
node scripts/agents-mother.mjs <command>
```

New aliases:

- `create --name ... --mission ...` -> create a seed/agent-contract.
- `create <contract-path> --output <folder>` -> scaffold a descendant from a seed.
- `publish <project-path>` -> run a trial check through `test --no-report`.
- `lineage` -> rebuild the registry/genealogy view.

## Vocabulary

- Seed: agent specification, technically still an `agent-contract`.
- Descendant: generated child agent project.
- Lineage: chain of contract, scaffold, tests, handoff, operations, deployment and review.
- Traits: reusable capabilities and patterns.
- Inheritance: base safety, memory and tool policies.
- Mutation: task-specific adaptation.
- Trial: evaluation before handoff or release.

## Consequences

- Documentation and user-facing help should prefer Pritha.
- Existing scripts and reports remain readable and valid.
- Snapshot tests must catch accidental scaffold changes during the rebrand.
- A future migration may rename deeper internals only after a separate decision and validation plan.
