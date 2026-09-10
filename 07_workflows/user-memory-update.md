---
id: user-memory-update
type: workflow
status: draft
created: 2026-06-02
updated: 2026-06-02
topics:
  - user-memory
  - privacy
  - local-private-memory
tools:
  - Pritha
  - Markdown
sources:
  - 04_standards/user-memory-privacy.md
  - 05_decisions/2026-06-02-pritha-memory-domain-model.md
related:
  standards:
    - 04_standards/user-memory-privacy.md
    - 04_standards/memory-domains.md
supersedes: []
superseded_by: []
memory_domain: governance
memory_domains:
  - governance
  - user-model
subject:
  kind: workflow
  id: user-memory-update
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Workflow: user-memory-update

Status: draft

## Goal

Keep useful user working preferences available to Pritha without leaking private
memory into public Markdown, `.memory/techscope.sqlite` or GitHub snapshots.

## Procedure

1. Only store a user preference when it is useful for future work.
2. Prefer explicit confirmation over inference.
3. Store confirmed preferences under `.private/user-memory/`.
4. Keep `.private/` and `.memory-private/` ignored by Git.
5. Do not index local-private memory into `.memory/techscope.sqlite`.
6. Separate confirmed preferences from inferred preferences.
7. Never store secrets, personal identifiers, contact data, raw chats or private
   source provenance.

## Local Private Shape

Suggested untracked files:

```text
.private/user-memory/
  profile.md
  preferences.md
  interactions.md
.memory-private/
  user.sqlite
```

## Use In Child-Agent Creation

Use user-model memory only as preference context. It cannot override explicit
current user instructions, safety rules, contract fields or primary-source
verification.
