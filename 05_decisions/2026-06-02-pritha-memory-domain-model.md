---
id: 2026-06-02-pritha-memory-domain-model
type: decision
status: accepted
created: 2026-06-02
updated: 2026-06-02
topics:
  - memory-domains
  - pritha
  - semantic-memory
  - user-memory
  - child-agents
tools:
  - Pritha
  - Markdown
  - SQLite
sources:
  - source-memory-domain-proposal-2026-06-02
related:
  standards:
    - 04_standards/memory-domains.md
    - 04_standards/user-memory-privacy.md
    - 04_standards/pritha-self-model.md
  workflows:
    - 07_workflows/memory-domain-routing.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-02
source_updated: 2026-06-02
source_version: user proposal reviewed and adapted 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha memory architecture from 2026-06-02 onward
temporal_status: current
review_date: 2026-07-02
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
  - agent-building-knowledge
subject:
  kind: system
  id: pritha
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: Pritha Memory Domain Model

Date: 2026-06-02
Status: accepted

## Context

Pritha's current memory architecture already has a useful staged structure:
inbox, sources, signals, briefs, reviews, standards, decisions, workflows,
generated wiki and agent lifecycle reports. Replacing this with domain folders
would make the system more brittle because one artifact can belong to several
semantic areas at once.

The useful improvement is to add a semantic domain layer over existing
Markdown/frontmatter and SQLite indexing.

## Decision

Adopt `memory_domain`, `memory_domains`, `subject`, `privacy`, `retention`,
`review_status` and `confidence` as optional-but-preferred frontmatter fields
for new curated artifacts.

Use these canonical domains:

- `pritha-self`;
- `child-agents`;
- `agent-building-knowledge`;
- `user-model`;
- `source-material`;
- `governance`;
- `marketing`.

Keep the current physical folder structure as the primary knowledge maturity
model. Add one new physical section, `12_marketing/`, for Pritha marketing copy,
myths, stories and product narrative drafts.

## Consequences

- Pritha can answer domain-shaped questions without moving files.
- Child-agent creation can retrieve standards/patterns first and past agents as
  evidence, not as templates to copy.
- User memory is explicitly separated from the public/portable Git snapshot.
- Marketing/identity material has a home without contaminating standards.

## Alternatives considered

- Move files into `memory/pritha-self`, `memory/child-agents`, and similar
  folders: rejected because it would confuse maturity stage with semantic
  domain.
- Create separate databases for every domain: rejected for v1; too heavy before
  domain metadata proves useful.
- Automatically infer domains for every historical file: deferred; new curated
  artifacts should lead the migration.

## Temporal basis

- Source published: 2026-06-02.
- Source updated: 2026-06-02.
- Source version: user proposal reviewed and adapted 2026-06-02.
- Retrieved: 2026-06-02.
- Verified: 2026-06-02.
- Valid for: Pritha memory architecture from 2026-06-02 onward.
- Freshness status: current.
- Temporal status: current.
- Supersedes: none.
- Superseded by: none.

## Review date

2026-07-02
