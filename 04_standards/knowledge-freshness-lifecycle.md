---
id: knowledge-freshness-lifecycle
type: standard
status: active
created: 2026-05-17
updated: 2026-05-17
last_reviewed: 2026-05-17
owner: Techscope/user
topics: [knowledge-management, freshness, supersession, temporal-metadata, research, agent-memory]
tools: [codex, markdown, sqlite, embeddings]
sources:
  - AGENTS.md
  - 04_standards/expert-information-assessment.md
related:
  workflows:
    - 07_workflows/expert-information-assessment.md
  standards:
    - 04_standards/expert-information-assessment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-17
source_updated: 2026-05-17
source_version: techscope-memory-rules-v1
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Techscope knowledge artifacts from 2026-05-17 onward
temporal_status: current
---

# Standard: knowledge-freshness-lifecycle

Status: active
Owner: Techscope/user
Last reviewed: 2026-05-17

## Rule

Techscope must treat knowledge as versioned and time-sensitive. New material does not simply accumulate; it must be compared with existing artifacts, current external sources and the temporal context of the claim. If a newer, better-supported source changes the conclusion, the older artifact must be explicitly marked as outdated or superseded.

Every source should carry enough temporal metadata to answer: when was this true, for which version, when did we retrieve it, and when did we verify it?

## Required lifecycle states

- `draft`: useful but not yet stable.
- `active`: currently usable as a live reference.
- `outdated`: historically useful, but no longer reliable as current guidance.
- `superseded`: explicitly replaced by a newer artifact.
- `archived`: preserved but not intended for active use.

## Required comparison outcomes

Every assessment of a fast-moving topic should record one of:

- `confirms`: new material supports existing knowledge.
- `refines`: new material narrows, improves or clarifies existing knowledge.
- `contradicts`: new material conflicts with existing knowledge.
- `supersedes`: new material replaces existing knowledge.
- `uncertain`: sources are insufficient or contradictory.

## Required temporal metadata

For new intake, brief, assessment, review, decision and standard artifacts, record these fields when applicable:

- `source_published`: when the media, article, documentation page, release, version or announcement was first published.
- `source_updated`: when the source was materially updated, if known.
- `source_version`: version, tag, release, commit, model name, API version or spec date that the claim refers to.
- `retrieved`: when Techscope received or fetched the source.
- `verified`: when Techscope last checked the source against primary evidence.
- `valid_for`: technology/version/date range where the conclusion is expected to apply.
- `temporal_status`: `current`, `version-bound`, `stale` or `unknown`.

If exact values are unavailable, write `unknown` and explain the uncertainty in the artifact body. Unknown temporal context lowers evidence quality and blocks promotion to `standard` unless the claim is independently verified.

## Freshness check

For fast-moving technologies, check at least one current primary source before promoting a claim:

- official documentation;
- specification;
- changelog or release notes;
- repository, issue or pull request;
- primary author/company post;
- vendor security advisory when safety is involved.

The check must compare source dates and versions, not only source names. A newer blog post can still be weak evidence if it discusses an older version; an older official spec can still be authoritative if it is the active spec.

Secondary sources and influencer posts can identify useful signals, but they are not enough for standards unless backed by primary evidence or repeated practice.

## Temporal compatibility

When assessing a new source, explicitly decide whether its claim is compatible with:

- the current date of the assessment;
- the current stable version of the technology;
- the version or release discussed in older Techscope artifacts;
- known deprecations, breaking changes, security advisories or vendor policy changes;
- the intended project environment.

Use `temporal_status: version-bound` when a claim is correct only for a specific release, API version, model family or dated specification. Use `temporal_status: stale` when fresher evidence makes the claim unsafe as current guidance.

## Supersession protocol

When a new artifact replaces an older one:

1. Add `supersedes` to the new artifact.
2. Add `superseded_by` to the older artifact.
3. Change older artifact `status` to `superseded` or `outdated`.
4. Add a short note in the older artifact explaining why it changed.
5. Rebuild indexes.

Never delete old artifacts just because they are stale. They preserve context and show why the project changed direction.

## Agent behavior

Before creating a standard or decision, the agent must search existing memory for related topics and tools. If the new material changes the recommendation, the agent should update the old artifact in the same work session whenever possible.

The agent should prefer exact dates over relative words. Write `2026-05-17`, not `today`, and record media publish dates separately from Techscope ingestion dates.
