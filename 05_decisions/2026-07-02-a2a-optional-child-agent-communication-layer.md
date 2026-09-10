---
id: 2026-07-02-a2a-optional-child-agent-communication-layer
type: decision
status: accepted
created: 2026-07-02
updated: 2026-07-02
topics:
  - a2a
  - child-agents
  - agent-communication
  - multi-agent-systems
  - agent-governance
tools:
  - A2A Protocol
  - MCP
  - Pritha
sources:
  - 01_sources/notes/2026-07-02-a2a-protocol-source-note.md
  - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
  - 04_standards/agent-a2a-interoperability.md
related:
  reviews:
    - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
  standards:
    - 04_standards/agent-a2a-interoperability.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-team-operating-model.md
  workflows:
    - 07_workflows/agent-a2a-communication-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2025-04-09..2026-05-28
source_updated: 2026-05-28
source_version: A2A v1.0.1 plus Pritha A2A review v1
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha-created child agents from 2026-07-02 onward
temporal_status: version-bound
review_date: 2026-10-02
memory_domain: governance
memory_domains:
  - governance
  - agent-building-knowledge
subject:
  kind: decision
  id: a2a-optional-child-agent-communication-layer
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: A2A As Optional Child-Agent Communication Layer

Date: 2026-07-02
Status: accepted

## Context

Pritha creates child agents that may need to communicate across sibling projects, user-specific Pritha clones or external runtimes. The user wants Pritha to support selected agents exchanging information, knowledge and task execution responsibilities through A2A.

Existing Pritha standards already cover MCP, skills, team operating models and untrusted input. A2A adds a distinct peer-agent communication layer.

## Decision

Pritha will treat A2A as an optional, contract-selected child-agent communication module.

Pritha will not add A2A by default to every child agent. A2A is selected only when the contract identifies a concrete peer-agent workflow and records discovery, auth, trust, memory, task, observability and approval policy.

Default local posture: private direct discovery between trusted sibling agents.

Public or broad discovery through `/.well-known/agent-card.json` requires explicit contract selection and security review.

## Consequences

- New child-agent contracts can include A2A fields.
- Future scaffolds can add A2A adapter placeholders when selected.
- Control Center can later expose A2A readiness, trust grants and peer-agent status.
- Remote Agent Cards, messages, artifacts and task statuses become untrusted inputs by default.
- MCP remains the tool/resource connector layer; A2A becomes the peer-agent layer.

## Alternatives Considered

- Use only direct local APIs: rejected as the default because it does not provide standard discovery or task lifecycle.
- Use only MCP: rejected for peer-agent workflows because MCP is primarily a tool/resource protocol.
- Add A2A to every agent: rejected because it adds security and operations surface without benefit for simple agents.
- Build a custom Pritha-only agent bus first: deferred because A2A provides a current open standard and SDK ecosystem.

## Temporal Basis

- Source published: 2025-04-09..2026-05-28.
- Source updated: 2026-05-28.
- Source version: A2A v1.0.1 plus Pritha A2A review v1.
- Retrieved: 2026-07-02.
- Verified: 2026-07-02.
- Valid for: Pritha-created child agents from 2026-07-02 onward.
- Freshness status: current.
- Temporal status: version-bound.
- Supersedes: none.
- Superseded by: none.

## Review Date

2026-10-02
