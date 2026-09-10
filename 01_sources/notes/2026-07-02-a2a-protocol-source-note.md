---
id: 2026-07-02-a2a-protocol-source-note
type: source-note
status: processed
created: 2026-07-02
updated: 2026-07-02
topics:
  - a2a
  - agent-communication
  - multi-agent-systems
  - agent-discovery
  - child-agents
tools:
  - A2A Protocol
  - A2A Python SDK
  - A2A Samples
  - MCP
  - Pritha
sources:
  - source-a2a-protocol-batch-2026-07-02
related:
  reviews:
    - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
  standards:
    - 04_standards/agent-a2a-interoperability.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-untrusted-input-security.md
  decisions:
    - 05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md
  workflows:
    - 07_workflows/agent-a2a-communication-selection.md
source_type: document-batch
source_class: official-docs-with-community-signal
anonymous_source_id: source-a2a-protocol-batch-2026-07-02
ingested_at: 2026-07-02T00:00:00-07:00
processed_at: 2026-07-02T00:00:00-07:00
retention_status: source-purged
usefulness: high
evidence_quality: high-for-specification-medium-for-adoption
source_published: 2025-04-09..2026-05-28
source_updated: 2026-05-28
source_version: A2A specification latest; A2A GitHub release v1.0.1 dated 2026-05-26 and released 2026-05-28; a2a-python README retrieved 2026-07-02
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha child-agent A2A design until the A2A specification, SDK compatibility, or security guidance changes
temporal_status: current
memory_domain: source-material
memory_domains:
  - source-material
  - agent-building-knowledge
subject:
  kind: source-note
  id: a2a-protocol
privacy: public
retention: source-purged
review_status: processed
confidence: high
---

# Source Note: A2A Protocol For Child-Agent Communication

Date: 2026-07-02
Status: processed

## Public references checked

- Official overview and specification pages for the A2A Protocol.
- A2A main GitHub repository and release list.
- A2A release `v1.0.1`, dated 2026-05-26 and released on GitHub on 2026-05-28.
- Official Python SDK repository `a2aproject/a2a-python`.
- Official samples repository `a2aproject/a2a-samples`.
- Python quickstart pages for setup, AgentSkill/AgentCard and server interaction.
- Official A2A and MCP comparison, agent discovery, enterprise features, and streaming/asynchronous operation docs.
- Community signals from A2A GitHub discussions, Hacker News and Cisco's engineering blog.

## Verification summary

- A2A is an agent-to-agent protocol, not an agent framework, not an MCP replacement, and not a sub-agent/tool-call protocol.
- The core A2A fit is discovery, delegation, shared task state, messages, artifacts, streaming, push notifications and authenticated inter-agent communication.
- A2A and MCP are complementary: MCP is for tools/resources; A2A is for peer agents that may be stateful, autonomous, opaque and multi-turn.
- Agent Cards are the discovery boundary. They describe identity, endpoints, capabilities, auth and skills. The standard well-known path is `/.well-known/agent-card.json`.
- Agent Cards can leak sensitive capability and internal URL information. Sensitive cards need authentication, authorization, selective disclosure, and no embedded static secrets.
- Production A2A requires HTTPS, HTTP-layer identity, per-skill authorization, data minimization, logging, tracing, metrics and audit for significant task state changes.
- Streaming is suitable for real-time progress and large incremental artifacts. Push notifications are suitable for disconnected clients and very long tasks, but webhook security requires strict validation.
- The Python SDK states compatibility with A2A 1.0 plus 0.3 compatibility mode across JSON-RPC, HTTP+JSON/REST and gRPC.
- The official samples include an explicit warning that external agents, Agent Cards, messages, artifacts and task statuses are untrusted input.

## Community signal

- Community adoption signals are real but uneven. GitHub discussions show implementers experimenting with SDKs, A2A-MCP bridges and multi-agent frameworks.
- A recent Hacker News thread includes claims of enterprise usage and startup use cases around standardized endpoints, catalogs and long-running tasks. Treat this as anecdotal, not primary evidence.
- Cisco's blog frames A2A as slower-adopting than MCP but complementary and relevant at a different layer of the agentic stack.

## Relationship to existing Pritha knowledge

- Confirms `04_standards/agent-tool-integration-selection.md`: choose the narrowest integration boundary.
- Refines `04_standards/agent-mcp-connector-lifecycle.md`: MCP is tool/resource boundary, A2A is peer-agent boundary.
- Extends `04_standards/agent-team-operating-model.md`: team-mode agents need explicit delegation and communication contracts.
- Extends `04_standards/agent-untrusted-input-security.md`: remote agents and Agent Cards are untrusted inputs.

## Durable follow-up

- Promote A2A as an optional, contract-selected module for Pritha child agents.
- Do not add A2A to every child agent by default.
- Add A2A readiness fields to future agent contracts when inter-agent delegation is selected.
- Prefer private/direct discovery for local Pritha clones and trusted sibling agents. Use public well-known discovery only when the contract selects external discovery.
