---
id: memory-domain-routing
type: workflow
status: draft
created: 2026-06-02
updated: 2026-06-02
topics:
  - memory-domains
  - memory-routing
  - pritha
tools:
  - Pritha
  - Markdown
  - SQLite
sources:
  - 05_decisions/2026-06-02-pritha-memory-domain-model.md
  - 04_standards/memory-domains.md
related:
  decisions:
    - 05_decisions/2026-06-02-pritha-memory-domain-model.md
  standards:
    - 04_standards/memory-domains.md
    - 04_standards/user-memory-privacy.md
supersedes: []
superseded_by: []
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
subject:
  kind: workflow
  id: memory-domain-routing
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Workflow: memory-domain-routing

Status: draft

## Goal

Route new knowledge into semantic memory domains without moving files out of
their maturity-stage folders.

## Routing Rules

| Material | Primary domain |
| --- | --- |
| "Pritha can/should/does..." | `pritha-self` |
| New child agent contract/report/test/handoff/evolution | `child-agents` |
| Harness, memory, skills, MCP, tools, runtime, interface or eval pattern | `agent-building-knowledge` |
| User working preference | `user-model` in local-private memory |
| External article/video/post/source | `source-material` first, then another domain only after review |
| Standard, decision, safety, privacy or promotion policy | `governance` plus relevant domain |
| Pritha tagline, story, myth, positioning or sales copy | `marketing` |

## Child-Agent Creation Retrieval

When researching a new child agent:

1. Start from the user's request and current `agent-contract`.
2. Retrieve `agent-building-knowledge` standards and workflows for the selected
   mission, interface, memory, tools, skills, MCP, runtime and operations.
3. Retrieve `pritha-self` capabilities and constraints.
4. Retrieve `child-agents` profiles/reports only as evidence of successful or
   failed patterns.
5. Use `user-model` only if local-private memory is available and the user has
   allowed it.

Do not start by studying existing child agents as templates. Similar agents are
evidence, not inheritance.

## Update Procedure

1. Decide whether the material is raw/source, processed signal, review,
   standard, decision, workflow, report, profile or marketing copy.
2. Keep the file in the folder matching its knowledge maturity or lifecycle.
3. Add `memory_domain`, `memory_domains`, `subject`, `privacy`, `retention`,
   `review_status` and `confidence` when practical.
4. If `privacy: local-private` or `memory_domain: user-model`, route to
   `.private/user-memory/` and do not commit.
5. Rebuild memory index.
6. Verify domain retrieval with `node scripts/query-memory.mjs by-domain`.

## Commands

```sh
node scripts/query-memory.mjs by-domain pritha-self
node scripts/query-memory.mjs by-domain agent-building-knowledge
node scripts/query-memory.mjs by-subject system pritha
```

## Failure Cases

- Marketing copy treated as a standard.
- Generated wiki page treated as canonical self-knowledge.
- User preference written into public memory.
- Old child-agent scaffold copied into a new agent without contract fit.
- Background intake updates `pritha-self` without review.
