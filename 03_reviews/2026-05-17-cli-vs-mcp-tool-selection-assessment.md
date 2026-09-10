---
id: 2026-05-17-cli-vs-mcp-tool-selection-assessment
type: assessment
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
  - security
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
  - source-4509b6d4-0d0a-4a78-a9e7-5699c246d280
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
supersedes:[]
superseded_by:[]
source_type: telegram
source_class: telegram
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.442Z
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-4509b6d4-0d0a-4a78-a9e7-5699c246d280
recommendation: standard
freshness_status: current
source_published: 2026-05-04
source_updated: unknown
source_version: video-g9JIUM0MHgQ; MCP spec 2025-06-18; MCP draft observed 2026-05-17; GitHub MCP docs observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Agent tool selection guidance as of 2026-05-17
temporal_status: current
---

# Assessment: source-4509b6d4-0d0a-4a78-a9e7-5699c246d280

Date: 2026-05-17
Status: draft
Source class: telegram
Retention: source-purged

Date: 2026-05-17
Status: draft
Recommendation: standard

## One-paragraph read

## Why it matters

## Technical claims

- Shell commands are often more compact than MCP calls for local developer tasks.
- MCP tool schemas can create meaningful context overhead when broad servers are loaded eagerly.
- CLI tools compose naturally with pipes; MCP tool calls are more isolated.
- MCP can compress complex interactions into useful output, especially when raw CLI output is not enough.
- MCP is a better fit for service-managed auth, token refresh, per-user permissions and audit trails.
- The right answer is not CLI or MCP; it is task-dependent routing.

## Existing knowledge check

- Related existing artifacts:
  - `02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md`
  - `03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md`
- Relationship to existing knowledge: refines
- Artifacts to mark outdated or superseded: none

## Freshness check

- Official/current sources checked:
  - MCP authorization spec 2025-06-18
  - current MCP draft authorization page observed 2026-05-17
  - GitHub MCP Server repository/docs
  - GitHub Docs for configuring MCP toolsets
  - IBM MCP explainer
- Freshness status: current
- Retrieved: 2026-05-17
- Verified: 2026-05-17
- Valid for: Agent tool selection guidance as of 2026-05-17
- Temporal status: current
- Temporal compatibility with existing artifacts: compatible; this video refines the 2026-05-17 Skills/MCP assessment by adding explicit CLI routing.
- Notes: MCP authorization and tool discovery behavior is changing; recheck before promoting this from draft standard to active standard.

## Programming relevance

Score: 5/5

Directly relevant to coding-agent setup, repo work, shell access, GitHub integration and tool routing.

## Agent engineering relevance

Score: 5/5

This is central agent architecture: tool choice, context budget, auth boundary, execution boundary and operational governance.

## DX impact

Score: 5/5

Good routing keeps agents fast and predictable. Developers should not pay MCP setup/context cost for a simple `git status`, and should not hand-roll OAuth/token refresh in shell when an MCP server can own that boundary.

## Evidence quality

Score: 4/5

The video is secondary, but it is concrete and aligns with primary docs. Some numbers, especially token counts, should be measured locally before being treated as standards.

## Practicality

Score: 5/5

Immediately usable. We can apply it to Techscope's own YouTube, Telegram, Obsidian, GitHub and documentation workflows.

## Leverage

Score: 5/5

High. The decision matrix can be reused in every future agent project.

## Risk

Score: 4/5

Risk is high if misapplied. Shell access is powerful and can be destructive. MCP access can be broad and data-sensitive. The standard must include least privilege, sandboxing, logging and tool narrowing.

## Expert lenses

### Programming

Prefer the interface closest to the real work. Local repo/file/Git/text jobs should start with CLI/script. Web rendering, SaaS, auth and cross-user access should start with MCP or browser-backed tools.

### Agent Engineering

Add a routing decision before tool execution: CLI/script, skill, MCP, browser or human review. Avoid exposing broad tools before the agent has a concrete need.

### DX

The best setup is boring for common tasks and structured for risky ones: fast shell for deterministic local work, controlled MCP for external services.

### Security

Do not treat CLI as automatically safer because it is simpler. Shell tools need sandboxing, allow/deny rules and review. MCP servers need least privilege, toolset limiting, credential isolation and auditability.

### Evidence

Primary sources support the main direction. The exact economics should be validated with Techscope's own tool logs and token measurements.

### Product Pragmatism

This should become a draft standard now. Waiting for perfect benchmarks would delay a rule we already need in daily agent setup.

## Decision

Create a draft standard for agent tool integration selection: CLI/script vs skill vs MCP vs browser/manual review.

## Next artifact

standard
