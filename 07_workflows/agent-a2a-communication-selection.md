---
id: agent-a2a-communication-selection
type: workflow
status: draft
created: 2026-07-02
updated: 2026-07-02
topics:
  - a2a
  - child-agents
  - agent-communication
  - agent-discovery
  - agent-security
tools:
  - A2A Protocol
  - MCP
  - Pritha
sources:
  - 04_standards/agent-a2a-interoperability.md
  - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
  - 01_sources/notes/2026-07-02-a2a-protocol-source-note.md
related:
  standards:
    - 04_standards/agent-a2a-interoperability.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-untrusted-input-security.md
  decisions:
    - 05_decisions/2026-07-02-a2a-optional-child-agent-communication-layer.md
  reviews:
    - 03_reviews/2026-07-02-a2a-protocol-child-agent-communication-review.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2025-04-09..2026-05-28
source_updated: 2026-05-28
source_version: workflow v1 based on A2A v1.0.1 and Pritha agent standards
retrieved: 2026-07-02
verified: 2026-07-02
valid_for: Pritha child-agent design when A2A is considered
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: workflow
  id: agent-a2a-communication-selection
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Workflow: Agent A2A Communication Selection

Status: draft

## Goal

Decide whether a child agent should use A2A, then define and verify the smallest safe A2A surface.

## Selection Procedure

1. Name the concrete cross-agent workflow.
2. Decide whether the remote capability is a tool/resource or an agent.
3. If it is a tool/resource, prefer local script, direct API or MCP.
4. If it is an agent, check whether the workflow needs discovery, delegation, task state, artifacts, streaming, push notifications or multi-turn negotiation.
5. Select A2A only when at least one A2A capability is materially useful.
6. Record the selection in the agent contract.
7. Apply `agent-a2a-interoperability`.

## Contract Procedure

For selected A2A, add:

- `a2a_enabled`
- `a2a_role`
- `a2a_discovery`
- `a2a_card_visibility`
- `a2a_skills`
- `a2a_auth`
- `a2a_authorization`
- `a2a_trust_registry`
- `a2a_task_policy`
- `a2a_memory_policy`
- `a2a_untrusted_input_policy`
- `a2a_observability`
- `a2a_readiness`

## Implementation Procedure

1. Create or update the A2A adapter layer.
2. Generate the minimal Agent Card for selected skills.
3. Add private direct discovery first for local/sibling agents.
4. Add authenticated or public well-known discovery only if selected.
5. Implement task submission, status retrieval and cancellation.
6. Add streaming only if the task needs incremental progress.
7. Add push notifications only if disconnected clients or long-running jobs require it.
8. Route accepted tasks into the receiving agent's local job queue or deterministic handler.
9. Keep remote content out of direct prompts until sanitized.
10. Add audit logging for task ids, context ids, remote agent ids, skill ids, approvals and artifact hashes.

## Verification Procedure

Run checks before marking A2A ready:

```sh
curl -fsS <agent-base>/.well-known/agent-card.json
```

Then verify:

- Agent Card schema and no secrets.
- Allowed peer can fetch the card.
- Disallowed peer cannot fetch private card details.
- Allowed peer can submit a minimal task.
- Task status can be fetched.
- Cancellation behavior is correct.
- Streaming behavior matches the Agent Card if enabled.
- Push notification behavior matches the Agent Card if enabled.
- Untrusted Agent Card and artifact injection tests pass.
- Logs contain task id, context id and remote agent id.

## Readiness Values

- `skipped`: A2A was considered but not selected.
- `pending-auth`: auth or trust registry is missing.
- `pending-network`: endpoint or discovery route is not reachable.
- `ready`: selected A2A tests passed.
- `failed`: selected A2A tests failed.

## Failure Cases

- Treating another agent as trusted because it is local.
- Publishing a public Agent Card with internal paths, private URLs or sensitive skills.
- Using A2A when MCP or a script would be simpler and safer.
- Letting remote agent content write memory or trigger tools directly.
- Advertising streaming or push notifications before they are implemented.
- Forgetting revocation for a trusted remote agent.
