---
id: 2026-07-02-a2a-protocol-agent-communication-signal
type: signal
status: extracted
created: 2026-07-02
updated: 2026-07-02
topics:
  - a2a
  - agent-communication
  - child-agents
  - agent-discovery
  - delegation
tools:
  - A2A Protocol
  - MCP
  - Pritha
sources:
  - 01_sources/notes/2026-07-02-a2a-protocol-source-note.md
related:
  source_notes:
    - 01_sources/notes/2026-07-02-a2a-protocol-source-note.md
  reviews:
    - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
  standards:
    - 04_standards/agent-a2a-interoperability.md
generated_from:
  - source-a2a-protocol-batch-2026-07-02
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: source-material
memory_domains:
  - source-material
  - agent-building-knowledge
subject:
  kind: signal
  id: a2a-agent-communication
privacy: public
retention: source-purged
review_status: processed
confidence: high
---

# Signal: A2A Protocol Agent Communication

Date: 2026-07-02
Status: extracted
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

A2A is useful for Pritha when a child agent must expose or consume another agent as a peer with discoverable skills, task state, multi-turn interaction, artifacts, streaming updates or long-running delegated work.

A2A should be a selected interoperability module, not a default harness layer for every child agent.

## Technical details

- Discovery centers on Agent Cards and Agent Skills.
- Default public discovery path is `/.well-known/agent-card.json`, but private/direct discovery and registries are valid patterns.
- A2A tasks produce state, messages and artifacts; streaming and push notifications are first-class options for long-running work.
- Security lives at the HTTP/transport layer with HTTPS, authentication headers, authorization and per-skill controls.
- Agent Cards, remote messages and artifacts must be handled as untrusted input.

## Agent design implications

- Child-agent contracts need explicit A2A fields when the agent can delegate to or be invoked by other agents.
- Pritha should maintain an agent trust registry for local/sibling agents before allowing cross-agent task execution.
- A2A should integrate with existing Pritha readiness checks, operations manifests, access policy, Tailscale/private network policy and untrusted input policy.
- A2A and MCP should remain separate: MCP equips an agent with tools; A2A lets agents collaborate.

## Candidate rules

- Do not expose a public Agent Card by default.
- Do not embed secrets or internal credentials in an Agent Card.
- Do not let a remote agent write memory, run tools, spend money or publish externally without the receiving agent's local policy and approval gates.
- Prefer private direct configuration for local Pritha clones and trusted sibling agents.
- Require smoke tests for card discovery, task submission, task status retrieval, cancellation, streaming if enabled, and untrusted card sanitization.

## Verification required

- Recheck A2A release notes and SDK compatibility before implementation.
- Test the selected SDK or minimal protocol binding in the target runtime.
- Verify agent-card endpoint visibility from the intended network boundary.

## Source links

- `01_sources/notes/2026-07-02-a2a-protocol-source-note.md`
