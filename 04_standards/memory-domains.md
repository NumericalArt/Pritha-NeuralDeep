---
id: memory-domains
type: standard
status: draft
created: 2026-06-02
updated: 2026-07-13
last_reviewed: 2026-07-13
owner: Techscope/user
topics:
  - memory-domains
  - semantic-memory
  - pritha
  - child-agents
  - user-memory
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
  workflows:
    - 07_workflows/memory-domain-routing.md
  standards:
    - 04_standards/user-memory-privacy.md
    - 04_standards/pritha-self-model.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-02
source_updated: 2026-06-02
source_version: memory domain standard v1
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha Markdown memory and retrieval workflows
temporal_status: current
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
subject:
  kind: standard
  id: memory-domains
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Standard: memory-domains

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-02

## Rule

Pritha memory uses two independent axes:

- folder/stage: maturity of knowledge;
- memory domain: semantic area of meaning.

Do not replace the current staged Markdown architecture with domain folders.
Add domain metadata so a single artifact can belong to several domains.

## Canonical Domains

| Domain | Meaning |
| --- | --- |
| `pritha-self` | Pritha identity, capabilities, limits, roadmap, lifecycle and self-improvement. |
| `child-agents` | Created descendants, contracts, reports, profiles, lifecycle evidence and lessons. |
| `agent-building-knowledge` | General patterns for harnesses, memory, tools, skills, MCP, runtime placement, interfaces and operations. |
| `user-model` | User preferences and working model. Must be local-private unless explicitly exported. |
| `source-material` | Intake, source notes, signals and processed source-derived knowledge. |
| `governance` | Standards, decisions, safety, privacy, promotion rules and audit policies. |
| `marketing` | Pritha product narrative, positioning, myths, stories, taglines and public-facing copy drafts. |

## Frontmatter Convention

Use these fields for new curated artifacts when the domain is clear:

```yaml
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: agent-harness-evaluation
privacy: public
retention: durable
review_status: draft
confidence: medium
```

`memory_domain` is the primary domain. `memory_domains` lists all relevant
domains. `subject.kind` and `subject.id` identify what the artifact is about.

## Privacy Values

- `public`: safe for normal Techscope Git snapshot.
- `internal`: project-internal but not secret.
- `local-private`: must not be committed or indexed into public memory.
- `sensitive`: requires explicit storage policy before indexing.

## Required Practices

- New standards, decisions, workflows, reviews and agent reports should include
  domain metadata when practical.
- Generated wiki pages may summarize domains, but they do not become canonical
  evidence for standards or decisions.
- `user-model` belongs in local-private storage by default.
- Marketing artifacts must not become standards without a separate review.
- Child-agent profiles summarize lifecycle evidence; they do not replace
  contracts, reports or tests.
- Successful child-agent patterns are used as evidence and reusable pattern
  candidates, not copied blindly into new descendants.
- Tracked Markdown is shared authored knowledge. Generated SQLite, embeddings,
  setup state, audit, queues, voice drafts and live child-agent registry belong
  to the external `PRITHA_STATE_ROOT` of one instance.
- `11_agents/` is historical shared evidence. Live contracts, reports,
  research and registry use `<state-root>/agents/` and require explicit review
  before promotion to shared knowledge.

## Child-Agent Research Order

When creating a child agent, Pritha should use:

1. the current contract and user request;
2. `agent-building-knowledge` standards/workflows/patterns;
3. `pritha-self` capabilities and limitations;
4. `child-agents` profiles/reports only for comparable evidence and proven
   patterns;
5. `user-model` local-private preferences only when available and permitted.

Do not start by studying old child agents as templates. Each descendant may be
unique.

## Temporal Validity

- Source published: 2026-06-02.
- Source updated: 2026-06-02.
- Source version: memory domain standard v1.
- Retrieved: 2026-06-02.
- Verified: 2026-06-02.
- Valid for: Pritha Markdown memory and retrieval workflows.
- Freshness status: current.
- Temporal status: current.
- Recheck when: memory schema, privacy policy, generated wiki behavior or
  child-agent lifecycle reports materially change.

## Related Decisions

- `05_decisions/2026-06-02-pritha-memory-domain-model.md`
