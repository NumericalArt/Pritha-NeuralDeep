---
id: user-memory-privacy
type: standard
status: draft
created: 2026-06-02
updated: 2026-07-13
last_reviewed: 2026-07-13
owner: Techscope/user
topics:
  - user-memory
  - privacy
  - local-private-memory
  - pritha
tools:
  - Pritha
  - Markdown
  - SQLite
sources:
  - 05_decisions/2026-06-02-pritha-memory-domain-model.md
  - source-memory-domain-proposal-2026-06-02
related:
  decisions:
    - 05_decisions/2026-06-02-pritha-memory-domain-model.md
  standards:
    - 04_standards/memory-domains.md
  workflows:
    - 07_workflows/user-memory-update.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-02
source_updated: 2026-06-02
source_version: user memory privacy standard v1
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha user-model memory
temporal_status: current
memory_domain: governance
memory_domains:
  - governance
  - user-model
subject:
  kind: standard
  id: user-memory-privacy
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Standard: user-memory-privacy

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-02

## Rule

User-model memory is local-private by default. It must not be written into
tracked Markdown, committed SQLite snapshots or public/portable Techscope memory
unless the user explicitly asks for a specific export.

## Use When

- storing user working preferences;
- remembering confirmed interaction style;
- deciding whether a preference can influence child-agent scaffolds;
- designing private memory storage for Pritha or descendants.

## Avoid When

- the information is a secret, credential, private identifier or raw chat;
- the user did not confirm that the preference should be remembered;
- the memory would be used as evidence for a public standard;
- private memory would enter `.memory/techscope.sqlite`.

## Required Practices

- Store local user-model files under `<state-root>/private/user-memory/`.
- Store private indexes under `<state-root>/private/memory-private/`.
- Keep both locations ignored by Git.
- Never share these locations between Pritha instance IDs.
- Record confidence and confirmation state.
- Separate confirmed preferences from inferred preferences.
- Provide a future review/edit/delete workflow before expanding this layer.
- Do not store secrets, contact data, personal identifiers, raw chats or
  private source provenance.

## Allowed User-Memory Examples

- preferred language for interaction;
- preferred answer style;
- tolerance for detailed plans;
- safety/default preferences;
- explicitly approved interface preferences;
- explicitly confirmed constraints for child-agent creation.

## Temporal Validity

- Source published: 2026-06-02.
- Source updated: 2026-06-02.
- Source version: user memory privacy standard v1.
- Retrieved: 2026-06-02.
- Verified: 2026-06-02.
- Valid for: Pritha user-model memory.
- Freshness status: current.
- Temporal status: current.
- Recheck when: Techscope publication policy, private memory storage or user
  consent workflow changes.

## Related Decisions

- `05_decisions/2026-06-02-pritha-memory-domain-model.md`
