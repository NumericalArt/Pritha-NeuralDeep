---
id: 2026-06-01-agent-connectivity-progressive-discovery-signal
type: signal
status: refined
created: 2026-06-01
updated: 2026-06-11
topics:
  - agent-connectivity
  - mcp
  - cli
  - agent-skills
  - progressive-discovery
  - tool-search
  - code-mode
  - harness-engineering
  - agent-tools
tools:
  - MCP
  - CLI
  - Agent Skills
  - tool_search
sources:
  - source-2635f0f7-bb58-4ec7-8c7e-6a344049208b
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
    - 07_workflows/agent-mcp-connector-selection.md
  standards:
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-skill-pack-lifecycle.md
source_type: image
source_class: image
ingested_at: 2026-06-01
processed_at: 2026-06-01T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-2635f0f7-bb58-4ec7-8c7e-6a344049208b
generated_from:
  - source-2635f0f7-bb58-4ec7-8c7e-6a344049208b
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-2635f0f7-bb58-4ec7-8c7e-6a344049208b

Date: 2026-06-01
Status: refined
Source class: image
Retention: source-purged

## Core Signal

The material refines Pritha's existing tool-boundary doctrine rather than
replacing it. The useful pattern is a layered connectivity stack:

- Skills carry reusable domain/procedural knowledge.
- MCP provides external connectivity, auth, governance, discovery and audit
  boundaries.
- CLI/computer use provides token-efficient local execution when the model
  already understands the tool.

The new emphasis is progressive discovery: do not load every tool schema into
context by default. Give the agent a catalog/search path so it can discover and
load only the tools or skills needed for the current task.

## Useful Delta For Pritha

- Add `tool_search`/catalog-style discovery as an optional harness pattern for
  tool-heavy child agents.
- Treat code-mode orchestration as a separate, sandboxed capability: useful for
  composing multiple MCP/CLI/API calls, but not safe as an unbounded default.
- Update MCP connector review to look for server discovery metadata, dynamic
  tool lists, registry entries and Skills Over MCP direction.
- Keep MCP Apps/UI resources as watch/experiment unless a child agent explicitly
  needs interactive widgets from an MCP server.

## Relationship To Existing Memory

This confirms:

- `agent-tool-integration-selection`: choose CLI, skill, MCP, browser or manual
  by task boundary.
- `agent-mcp-connector-lifecycle`: MCP is optional, reviewed and scoped.
- `agent-skill-pack-lifecycle`: skills are procedural memory and should remain
  progressive-disclosure artifacts.

This refines:

- broad tool schemas are not only a cost problem; they should trigger a
  discovery/catalog design;
- MCP server discovery and Skills Over MCP should be watched as emerging
  interoperability patterns.

## Candidate Rules

- Tool-heavy agents should prefer progressive discovery over eager loading of
  every tool schema.
- If a child agent needs many external tools, add a catalog/search layer before
  adding broad MCP toolsets.
- Code-mode orchestration requires sandboxing, timeout, filesystem/network
  policy and approval gates.
- MCP roadmap claims should be verified against official MCP Roadmap, SEPs or
  WG charters before becoming standards.

## Verification Notes

- Official MCP Roadmap confirms transport/scalability, server cards, enterprise
  readiness and extension ecosystem as active priorities.
- Skills Over MCP is an active working group; current direction is an extension
  using existing Resources primitives.
- Stateless MCP and Server Cards have SEP-level artifacts, but client/server
  support should be rechecked before scaffold decisions.
