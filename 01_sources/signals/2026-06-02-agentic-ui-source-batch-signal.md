---
id: 2026-06-02-agentic-ui-source-batch-signal
type: signal
status: refined
created: 2026-06-02
updated: 2026-06-11
topics:
  - agentic-ui
  - generative-ui
  - user-facing-agents
  - service-design
  - mcp-apps
  - ag-ui
  - a2ui
  - pritha
tools:
  - AG-UI
  - MCP Apps
  - MCP UI
  - OpenAI Apps SDK
  - A2UI
  - ChatGPT Apps
sources:
  - source-agentic-ui-batch-2026-06-02
related:
  reviews:
    - 03_reviews/2026-06-02-agentic-ui-source-batch-review.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-mcp-connector-lifecycle.md
generated_from:
  - source-agentic-ui-batch-2026-06-02
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-agentic-ui-batch-2026-06-02
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: agent-interface-experience
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Signal: Agentic UI Source Batch

Date: 2026-06-02
Status: refined
Source class: mixed
Retention: source-purged

## Core Signal

User-facing agents need an interface model that is richer than chat when the
agent manipulates state, spans time, asks for approvals, compares options or
guides the user through a complex workflow. The emerging pattern is:

```text
user goal
-> visible agent state
-> streamed progress/events
-> structured interactive components
-> explicit user control, cancellation and approvals
-> host-owned rendering/security boundary
-> final outcome and audit trail
```

## Useful Delta For Pritha

- Interface selection is a harness decision, not styling. A child-agent
  contract should decide whether the user needs chat-only, operator console,
  embedded app, realtime co-working UI, MCP App/UI resource or declarative
  generated UI.
- Service design changes because agents become actors. The UI should expose
  outcomes, delegation boundaries, check-ins, approvals and recovery paths, not
  only prompts and answers.
- AG-UI-style event streams are useful when frontend and agent backend must
  share mutable state, tool progress, lifecycle signals, cancellation and
  multi-run/thread identity.
- MCP Apps/MCP UI are useful when an MCP server should return an interactive
  widget or app resource alongside tool results. This is especially relevant
  for commerce, dashboards, forms and workflow panels.
- A2UI-style declarative UI is useful when the host app should retain control
  over native rendering, design system, accessibility and security while the
  agent proposes structured component layouts.
- OpenAI Apps SDK confirms an important platform shape: chat can become a host
  for interactive apps, but app permissions, privacy policy, review and
  partner rules become part of the UX architecture.

## Pritha Rule Candidate

For any child agent with a user-facing interface beyond CLI/Codex thread,
Pritha should record:

- interface role: chat, operator console, embedded app, workflow UI, voice UI
  or generated component UI;
- user control needs: approve, cancel, pause, retry, edit state, override;
- state model: ephemeral, thread-scoped, task-scoped or durable;
- progress visibility and audit trail;
- UI transport/protocol candidate;
- rendering trust boundary;
- component catalog or widget source;
- permissions/privacy prompts;
- fallback when rich UI is unsupported.

## Noise Removed

- Protocol announcements are not treated as a reason to add a UI layer to every
  child agent.
- Product claims about ecosystem reach are kept as context, not architecture
  defaults.
- Concrete e-commerce examples are generalized into interactive-state and
  approval patterns.
