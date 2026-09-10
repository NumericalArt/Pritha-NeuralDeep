---
id: 2026-06-02-agentic-ui-source-batch-review
type: review
status: draft
created: 2026-06-02
updated: 2026-06-02
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
  - https://www.nngroup.com/articles/service-design-evolve-ai-agents/
  - https://www.copilotkit.ai/blog/introducing-ag-ui-the-protocol-where-agents-meet-users/
  - https://shopify.engineering/mcp-ui-breaking-the-text-wall
  - https://openai.com/index/introducing-apps-in-chatgpt/
  - https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/
  - https://developers.googleblog.com/search/?author=Google+A2UI+Team
  - https://modelcontextprotocol.io/docs/extensions/apps
  - https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/
related:
  signals:
    - 01_sources/signals/2026-06-02-agentic-ui-source-batch-signal.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-mcp-connector-lifecycle.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2025-02-14 to 2026-04-17
source_updated: mixed
source_version: official/vendor/UX source batch verified 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha child-agent interface selection and agentic UI scaffolding
temporal_status: current
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-agentic-ui-batch-2026-06-02
recommendation: standard
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

# Review: Agentic UI Source Batch

Date: 2026-06-02
Status: draft
Recommendation: standard

## One-Paragraph Read

This batch should become a new Pritha interface standard. The useful lesson is
not "every agent needs a web UI"; it is that user-facing agents need explicit
interface architecture when they work over time, manipulate state, call tools,
request approvals or show complex options. Chat remains fine for simple
question/answer and operator commands. Rich agentic UI is justified when it
improves visibility, control, state editing, trust or task completion.

## Source Verdicts

| Date | Source | Verdict | Pritha fit |
| --- | --- | --- | --- |
| 2025-02-14 | NN/g service design with AI agents | adopt | Strong UX/service-design frame: agents become actors, and services shift toward outcome-oriented delegation with check-ins. |
| 2025-05-12 | AG-UI | adopt as pattern | Event-stream contract for messages, tool calls, state patches, lifecycle, cancellation and user-agent co-working. |
| 2025-08-05 | Shopify MCP UI | adopt with caveat | Strong proof that text-only fails for commerce-like workflows; use as pattern for rich interactive tool results, not only shopping. |
| 2025-10-06 | OpenAI Apps SDK | adopt/watch | Confirms chat-hosted interactive apps built on MCP; permissions, privacy and review are part of the UI architecture. |
| 2025-12-15 | Google A2UI | adopt/watch | Strong trust-boundary pattern: declarative UI from component catalogs, host-owned rendering and cross-platform support. |
| 2026-04-17 | A2UI v0.9 | watch | Indicates rapid evolution toward framework-agnostic production generative UI; recheck before implementation. |
| 2025-11-21+ | MCP Apps | watch/adopt for MCP agents | Standardizes interactive UI resources for MCP clients; useful when MCP server owns a widget/app resource. |

## Consolidated Patterns

### Outcome-Oriented Interface

When an agent acts on behalf of a user, the interface should show:

- goal and current plan;
- what the agent can do autonomously;
- what needs approval;
- progress and blockers;
- editable state;
- cancellation/pause/retry;
- final result and audit trail.

### Event-Stream UI

Use an event-stream UI when frontend and backend need to synchronize:

- partial messages;
- tool call start/end/error;
- state deltas;
- lifecycle events;
- thread/run IDs;
- cancellation and concurrency;
- approval gates.

### Interactive Tool Result

Use MCP App/MCP UI-style widgets when a tool result is too rich for text:

- product cards;
- forms and selectors;
- dashboards;
- maps;
- charts;
- approval panels;
- multi-step workflow panels.

The widget must not bypass the agent's side-effect policy. It should express
user intent back to the host/agent, which applies permissions and approvals.

### Declarative Generated UI

Use A2UI-style declarative components when the host application should retain
control over:

- design system and styling;
- accessibility;
- native rendering across platforms;
- security;
- allowed component catalog;
- incremental updates.

This is especially relevant for remote or multi-agent contexts where executing
arbitrary HTML/JavaScript is too risky or visually inconsistent.

## Techscope Adoption Check

- Techscope/Agents Mother fit: adopt.
- Implementation cost: low for standards and contract fields, medium for a web
  scaffold placeholder, high for production AG-UI/A2UI/MCP Apps runtime.
- Operational complexity: medium-high if the UI controls side effects, secrets
  or external app permissions.
- Current architecture impact: add an interface experience standard; do not
  change the default `codex-native + optional adapters` path.
- Freshness/technology timing: volatile. A2UI and MCP Apps are evolving quickly;
  verify versions before implementation.
- Decision: add standard now, update child-agent contract and Pritha interview
  to capture interface needs; keep protocol selection optional.

## Promotion Guidance

Promote as Pritha doctrine:

- UI is a harness boundary, not decoration;
- rich UI is selected by workflow need;
- the user must see progress, state, approvals and cancellation when an agent
  acts over time;
- the host owns rendering and security boundaries;
- generated UI should use trusted component catalogs or sandboxed resources;
- widgets express intent, but side effects still go through agent policy;
- every selected UI layer needs fallback and readiness checks.

Do not promote as defaults:

- all agents get a web UI;
- all chat apps need generated UI;
- arbitrary agent-generated HTML/JS;
- direct widget-side destructive actions;
- protocol lock-in before the child-agent contract demands it.
