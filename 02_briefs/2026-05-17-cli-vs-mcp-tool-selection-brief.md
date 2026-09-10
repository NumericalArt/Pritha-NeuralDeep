---
id: 2026-05-17-cli-vs-mcp-tool-selection-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-06-01
topics:
  - mcp
  - cli
  - coding-agents
  - tool-use
  - context-engineering
  - agent-architecture
tools:
  - MCP
  - CLI
  - Git
  - GitHub MCP Server
  - curl
  - grep
  - cat
  - Fetcher MCP
sources:
  - source-e65838de-3b16-4163-942d-b7dccd02ddcb
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
supersedes:[]
superseded_by:[]
source_type: video
source_class: video
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.434Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-e65838de-3b16-4163-942d-b7dccd02ddcb
freshness_status: current
source_published: 2026-05-04
source_updated: unknown
source_version: video-g9JIUM0MHgQ; MCP spec 2025-06-18; GitHub MCP docs observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Agent tool selection guidance as of 2026-05-17
temporal_status: current
---

# Artifact: source-e65838de-3b16-4163-942d-b7dccd02ddcb

Date: 2026-05-17
Status: draft
Source class: video
Retention: source-purged

Date: 2026-05-17
Status: draft

## Summary

The video strengthens Techscope's emerging rule for agent tool design: CLI is the right default when a known command directly maps to a local developer task; MCP is justified when the useful abstraction is not the raw command, but a managed service boundary, rendered output, authentication, per-user permissions, auditability or centralized integration.

## Key claims

- CLI wins for local file operations, Git status/logs, text processing and scripts because models already know common commands and the commands compose cheaply.
- MCP carries a schema/context cost, especially when broad servers expose many tools but the agent only needs one or two.
- MCP wins when it transforms a hard raw interaction into a clean capability, such as rendering a JavaScript-heavy web page into readable content.
- MCP is stronger for OAuth, token refresh, team access control, audit trails and service-managed credentials.
- Mature MCP servers increasingly support toolsets or individual tool selection, which partially mitigates context bloat.
- The practical architecture is hybrid: CLI/script/skill for local deterministic work, MCP for service abstraction and governance.

## Evidence

- The transcript provides concrete examples: file read/search via `cat`/`grep`; Git via shell; web page fetching via an MCP browser-backed fetcher when `curl` sees only a JavaScript shell.
- MCP authorization docs confirm that MCP has defined authorization behavior for HTTP transports and separate expectations for STDIO credentials.
- GitHub MCP server docs and GitHub Docs confirm that toolsets and specific tools can be enabled or limited, supporting a narrow-tooling practice.
- IBM's MCP explainer frames MCP as a standardized integration layer, not the agent's decision engine.

## Existing knowledge and freshness

- Related existing artifacts:
  - `02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md`
  - `03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md`
- Relationship to existing knowledge: refines
- Official/current sources checked:
  - MCP authorization spec 2025-06-18
  - current MCP draft authorization page observed 2026-05-17
  - GitHub MCP Server repository/docs
  - GitHub Docs for MCP toolsets
  - IBM MCP explainer
- Freshness status: current
- Retrieved: 2026-05-17
- Verified: 2026-05-17
- Valid for: Agent tool selection guidance as of 2026-05-17
- Temporal status: current
- Artifacts to mark outdated or superseded: none

## Risks and caveats

- Token numbers in the video are useful as intuition, not stable facts.
- CLI can be unsafe when it gives agents broad shell access, poor auditability or direct secret access.
- MCP can be unsafe when servers expose too much authority, too many tools or unclear trust boundaries.
- Current MCP authorization behavior is evolving; standards should include a recheck date.

## Recommendation

Promote the combined Skills/MCP/CLI guidance to a draft standard. The standard should require pre-flight interface selection before adding tools to a new agent:

- Prefer CLI/script when a local command is deterministic, safe and maps directly to the job.
- Prefer skill when the missing piece is repeatable procedure, not a new external capability.
- Prefer MCP when auth, governance, shared service access, rendering, remote execution or durable protocol boundaries matter.
- Limit MCP toolsets/tools whenever possible.

## Next step

Create draft standard `04_standards/agent-tool-integration-selection.md`.
