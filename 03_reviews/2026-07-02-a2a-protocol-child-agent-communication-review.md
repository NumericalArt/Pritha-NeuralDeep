---
id: 2026-07-02-a2a-protocol-child-agent-communication-review
type: review
status: complete
created: 2026-07-02
updated: 2026-07-02
topics:
  - a2a
  - agent-communication
  - child-agents
  - multi-agent-systems
  - agent-security
tools:
  - A2A Protocol
  - A2A Python SDK
  - A2A Samples
  - MCP
  - Pritha
agent_platforms:
  - Pritha child agents
  - Codex-native agents
  - local web agents
  - Python A2A agents
model_context:
  - hosted frontier models
  - Codex workers
  - local deterministic services
runtime_environment:
  - local Mac
  - private Tailscale network
  - sibling agent projects
  - external hosted agents
config_surfaces:
  - agent-contract
  - AGENTS.md
  - operations/manifest.json
  - A2A Agent Card
  - agent trust registry
portability: adapter-needed
sources:
  - 01_sources/notes/2026-07-02-a2a-protocol-source-note.md
  - https://a2a-protocol.org/latest/
  - https://a2a-protocol.org/latest/specification/
  - https://github.com/a2aproject/A2A/releases/tag/v1.0.1
  - https://github.com/a2aproject/a2a-python
  - https://github.com/a2aproject/a2a-samples
  - https://a2a-protocol.org/latest/topics/a2a-and-mcp/
  - https://a2a-protocol.org/latest/topics/agent-discovery/
  - https://a2a-protocol.org/latest/topics/enterprise-ready/
  - https://a2a-protocol.org/latest/topics/streaming-and-async/
related:
  source_notes:
    - 01_sources/notes/2026-07-02-a2a-protocol-source-note.md
  signals:
    - 01_sources/signals/2026-07-02-a2a-protocol-agent-communication-signal.md
  decisions:
    - 05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md
  standards:
    - 04_standards/agent-a2a-interoperability.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2025-04-09..2026-05-28
source_updated: 2026-05-28
source_version: A2A latest docs plus GitHub release v1.0.1; a2a-python compatibility statement retrieved 2026-07-02
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha child-agent communication design until A2A v1.0 compatibility or SDK readiness changes
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: review
  id: a2a-child-agent-communication
privacy: public
retention: durable
review_status: complete
confidence: high
---

# Review: A2A Protocol For Pritha Child-Agent Communication

Date: 2026-07-02
Status: complete

## Question

How should Pritha use A2A when selected child agents need to communicate, exchange information, delegate tasks or let one agent execute work on behalf of another?

## Options

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| No protocol, direct local APIs | Simple for one-off local integrations | Custom glue grows quickly; no standard discovery or task state | Good for tiny internal calls |
| MCP only | Strong tool/resource boundary; already covered by Pritha standards | Treats agents like tools and misses peer task semantics | Good when the remote capability is stateless and tool-like |
| A2A as optional child-agent module | Standard Agent Cards, skills, tasks, artifacts, streaming and long-running work | Requires auth, trust registry, sanitization and runtime testing | Best default for selected inter-agent collaboration |
| Custom agent bus | Maximum control | Reinvents discovery, auth, task lifecycle and interoperability | Use only if A2A cannot meet a hard requirement |

## Recommendation

Adopt A2A as an optional, contract-selected interoperability module for Pritha child agents.

Use it when the relationship is agent-to-agent: peer delegation, durable task state, multi-turn interaction, artifacts, streaming progress, cross-runtime framework interoperability or external partner agents. Do not use it when a simple local script, API endpoint, MCP tool or direct database query is enough.

## Architecture

A Pritha A2A-capable agent should have two separate surfaces:

- Local native surface: UI, CLI, Codex sidecar, memory, tools and deterministic scripts.
- A2A surface: Agent Card, selected Agent Skills, task API, status/artifact handling, optional streaming and optional push notifications.

The A2A surface must not expose internal memory or tools directly. It offers delegated skills backed by local policy gates. A remote agent can request work, but the receiving agent decides whether the task is allowed, what memory can be read, what tools can run and whether user approval is required.

## Security

Apply `agent-untrusted-input-security` to every remote Agent Card, message, artifact and task status. External agents are untrusted even if they speak A2A correctly.

Minimum security requirements:

- HTTPS for production or private Tailscale HTTPS for local trusted-device deployments.
- Authenticated Agent Cards when card contents reveal private endpoints or sensitive skills.
- No static secrets in Agent Cards.
- Per-skill authorization and approval gates for side effects.
- Data minimization for messages and artifacts.
- Sanitization before any remote card/message/artifact is injected into model context.
- Audit logs for task creation, state changes, tool-triggering and memory writes.
- Explicit SSRF and replay protections for push notification webhooks.

## Developer Experience

Start with private direct discovery for local Pritha clones and sibling agents. Public well-known discovery is useful only when an agent is intentionally reachable by broad clients.

For Python child agents, the official `a2a-sdk` is the preferred implementation path after pinning versions and running a smoke test. For TypeScript/Next.js child agents, either use an official JS SDK if selected and verified at implementation time, or implement the narrow v1.0 HTTP binding needed by the selected skills.

## Product Pragmatist

A2A is worthwhile when the user can name a concrete cross-agent workflow:

- "This agent asks another agent to perform a domain task."
- "This agent exposes skills to other Pritha clones or trusted devices."
- "This agent needs long-running delegated work with status and artifacts."
- "Multiple users or organizations will discover and invoke agents independently."

If the workflow is only "agent A calls function B", prefer MCP, local API or a script.

## Research Scout

Official docs are mature enough for design decisions around A2A v1.0. Community adoption signals are positive but mixed, with more visible enterprise interest than broad startup usage. This supports an optional module posture rather than immediate default inclusion.

## Open Questions

- Which JavaScript SDK version should Pritha prefer for Next.js child agents after a fresh check?
- Should Pritha maintain one shared local A2A registry across clones or per-clone registries?
- What exact Control Center UI should expose agent-to-agent trust grants and revocations?
- Which compliance test suite should become mandatory when A2A moves from local trusted agents to external public agents?

## Existing Knowledge And Temporal Context

- Related existing artifacts: `agent-tool-integration-selection`, `agent-mcp-connector-lifecycle`, `agent-team-operating-model`, `agent-untrusted-input-security`, `agents-mother`.
- Relationship to existing knowledge: refines and extends.
- Source published: 2025-04-09..2026-05-28.
- Source updated: 2026-05-28.
- Source version: A2A v1.0.1 release and latest docs checked 2026-07-02.
- Retrieved: 2026-07-02.
- Verified: 2026-07-02.
- Freshness status: current.
- Temporal status: version-bound.
