---
id: agent-a2a-interoperability
type: standard
status: draft
created: 2026-07-02
updated: 2026-07-02
last_reviewed: 2026-07-02
owner: Pritha
topics:
  - a2a
  - child-agents
  - agent-communication
  - multi-agent-systems
  - agent-security
tools:
  - A2A Protocol
  - MCP
  - Pritha
agent_platforms:
  - Pritha child agents
  - Codex-native agents
  - local web agents
  - Python A2A agents
model_context:
  - hosted frontier models
  - realtime agents
  - Codex workers
runtime_environment:
  - local Mac
  - sibling project folders
  - Tailscale private network
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
  - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
  - https://a2a-protocol.org/latest/
  - https://a2a-protocol.org/latest/specification/
  - https://github.com/a2aproject/A2A/releases/tag/v1.0.1
  - https://github.com/a2aproject/a2a-python
  - https://github.com/a2aproject/a2a-samples
related:
  decisions:
    - 05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md
  reviews:
    - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
  workflows:
    - 07_workflows/agent-a2a-communication-selection.md
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/tailscale-private-device-access-for-local-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2025-04-09..2026-05-28
source_updated: 2026-05-28
source_version: A2A Protocol latest docs plus v1.0.1 release; Python SDK compatibility checked 2026-07-02
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha child-agent A2A design for A2A v1.0 until next protocol or SDK compatibility change
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: standard
  id: agent-a2a-interoperability
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Standard: Agent A2A Interoperability

Status: draft
Owner: Pritha
Last reviewed: 2026-07-02

## Rule

Pritha uses A2A as an optional, contract-selected interoperability layer for child agents that must communicate as peer agents.

A2A is selected when agents need discovery, delegation, shared task state, multi-turn interaction, artifacts, streaming updates, push notifications or cross-framework interoperability. A2A is not selected merely because an agent exists.

MCP remains the tool/resource layer. A2A is the peer-agent layer. A child agent can use both: A2A to receive or delegate tasks, MCP or local scripts to execute its own tools.

## Use When

- One child agent needs to ask another child agent to perform a domain task.
- A child agent should expose selected skills to trusted sibling agents or another user's Pritha.
- Delegated work is long-running and needs status, artifacts, streaming progress or cancellation.
- Agents are implemented in different frameworks or languages and need a common communication boundary.
- A team-mode or coordinator-plus-workers architecture needs explicit delegation semantics.
- A partner or external agent must be discovered by Agent Card rather than hand-coded integration.

## Avoid When

- A local script, function call, direct API, database query or MCP tool is enough.
- The remote capability is stateless and tool-like.
- No trust registry, auth policy or untrusted input policy exists.
- The agent would expose sensitive memory, tools or private URLs through a public Agent Card.
- The user has not approved external network exposure or cross-agent side effects.
- The workflow has no measurable benefit over a direct user-to-agent task.

## Required Practices

For every A2A-selected child agent, record these contract fields:

- `a2a_enabled`: true | false.
- `a2a_role`: provider | client | both.
- `a2a_discovery`: private-direct | local-registry | well-known | external-registry.
- `a2a_card_visibility`: private | authenticated | public.
- `a2a_agent_card_path`: usually `/.well-known/agent-card.json` only when discovery is selected.
- `a2a_skills`: skill ids, names, descriptions, examples, input modes, output modes and security requirements.
- `a2a_auth`: none-local-only | api-key | bearer | oauth2 | oidc | mtls.
- `a2a_authorization`: per-skill policy and required user approval gates.
- `a2a_trust_registry`: allowed remote agents, card URLs, fingerprints, owners and revocation path.
- `a2a_task_policy`: accepted task types, timeouts, cancellation, retry, artifact limits and cost limits.
- `a2a_memory_policy`: which memory domains can be read or written through A2A.
- `a2a_untrusted_input_policy`: card/message/artifact sanitization and quarantine.
- `a2a_observability`: task ids, context ids, correlation ids, logs, traces and audit events.
- `a2a_readiness`: skipped | pending-auth | pending-network | ready | failed.

## Discovery Policy

Default for local Pritha clones and sibling agents: `private-direct`.

Use `local-registry` when several local or trusted agents need discovery without public exposure.

Use `well-known` only when the agent is intentionally discoverable at a domain or private Tailscale HTTPS endpoint and its Agent Card contains no sensitive internals, or is protected by authentication.

Use `external-registry` only when a registry owner, trust model, auth policy, card freshness and revocation path are defined.

## Agent Card Policy

Agent Cards are public or semi-public capability declarations. Treat them as product and security surfaces.

An Agent Card must include only the information needed for discovery and invocation. It must not include static secrets, private memory contents, hidden prompts, internal tool credentials, unrestricted filesystem paths or unreviewed local URLs.

Sensitive capabilities require authenticated extended Agent Cards or selective disclosure.

## Runtime Boundary

An A2A request must enter through an adapter layer, not directly into memory or tools.

Required boundary:

1. Authenticate the remote client or peer agent.
2. Resolve the remote agent in the trust registry.
3. Validate skill, input mode, size limits and task policy.
4. Sanitize all remote content.
5. Map the task into the receiving agent's local job queue or deterministic handler.
6. Apply local approvals before side effects.
7. Return task state, messages and artifacts through A2A.
8. Log task id, context id, remote agent id, selected skill, approval result and artifact hashes.

## Security Rules

- Remote Agent Cards, messages, artifacts and task statuses are untrusted input.
- Remote agents cannot directly modify curated memory.
- Remote agents cannot directly invoke shell, MCP, browser, Codex, publication, payment, messaging or deployment tools.
- Side effects require the receiving agent's local policy and, when risk is medium or high, operator approval.
- Push notification webhook URLs must be validated to avoid SSRF and abuse.
- Webhook receivers must verify signatures, tokens, timestamps or mTLS according to the selected scheme.
- All production A2A traffic must use HTTPS. Local development may use loopback HTTP only when not exposed.

## MCP Relationship

Use MCP when the remote thing is a tool or resource.

Use A2A when the remote thing is an autonomous agent that owns reasoning, state, tools or multi-turn task execution.

It is acceptable to expose an A2A agent's narrow skill through an MCP resource for tool-like invocation, but the canonical inter-agent contract remains A2A when task state, autonomy or negotiation matters.

## Readiness Checks

Before marking A2A ready:

- Agent Card validates and has no secrets.
- The selected discovery mode works from the intended network boundary.
- Auth failure returns a safe failure.
- Allowed peer can submit a minimal task.
- Disallowed peer is rejected.
- Task status retrieval works.
- Cancellation works or is explicitly unsupported.
- Streaming works if `capabilities.streaming` is true.
- Push notifications work if `capabilities.pushNotifications` is true.
- Remote Agent Card and artifact injection tests pass.
- Logs include task id, context id and remote agent id.

## Agent Environment Compatibility

- Agent platforms: Pritha-created child agents, Codex-native agents, Python A2A agents and local web agents.
- Model context: any model family, because A2A is transport and task protocol, not model behavior.
- Runtime environment: local Mac, Tailscale private network, sibling projects and hosted agents.
- Config surfaces: contract, operations manifest, A2A Agent Card, trust registry and AGENTS.md.
- Portability: adapter-needed.
- Codex adaptation: Codex can implement or operate A2A adapters, but A2A tasks should not directly become unrestricted Codex tasks without policy checks.
- Environment-specific caveats: local agents should avoid public well-known cards unless the operator selected external discovery.

## Temporal Validity

- Source published: 2025-04-09..2026-05-28.
- Source updated: 2026-05-28.
- Source version: A2A latest docs plus v1.0.1 release; Python SDK compatibility checked 2026-07-02.
- Retrieved: 2026-07-02.
- Verified: 2026-07-02.
- Valid for: Pritha child-agent A2A design for A2A v1.0.
- Freshness status: current.
- Temporal status: version-bound.
- Recheck when: A2A releases a new minor/major version, selected SDK changes compatibility, or Pritha exposes an agent beyond local/Tailscale trust boundaries.

## Related Decisions

- `05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md`
