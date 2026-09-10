---
id: agent-tool-integration-selection
type: standard
status: draft
created: 2026-05-17
updated: 2026-06-02
last_reviewed: 2026-06-02
owner: Techscope/user
topics: [agent-architecture, tool-use, mcp, cli, agent-skills, context-engineering, security]
tools: [CLI, MCP, Agent Skills, Browser, GitHub MCP Server, Shell tool]
sources:
  - 02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md
  - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
  - 02_briefs/2026-05-17-cli-vs-mcp-tool-selection-brief.md
  - 03_reviews/2026-05-17-cli-vs-mcp-tool-selection-assessment.md
  - 03_reviews/2026-06-01-agent-connectivity-stack-update-assessment.md
  - https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
  - https://github.com/github/github-mcp-server
  - https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/configure-toolsets
  - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
  - 03_reviews/2026-06-02-remote-mcp-source-batch-review.md
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
    - 03_reviews/2026-05-17-cli-vs-mcp-tool-selection-assessment.md
    - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
    - 03_reviews/2026-06-02-remote-mcp-source-batch-review.md
  briefs:
    - 02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md
    - 02_briefs/2026-05-17-cli-vs-mcp-tool-selection-brief.md
  standards:
    - 04_standards/agent-mcp-connector-lifecycle.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-04
source_updated: 2026-06-02
source_version: Techscope draft standard v3; MCP spec 2025-06-18; GitHub MCP docs; Codex/Docker/AWS and remote MCP source batches verified 2026-06-02
retrieved: 2026-05-17
verified: 2026-06-02
valid_for: Techscope agent projects and coding-agent harness design from 2026-05-17 onward
temporal_status: current
---

# Standard: agent-tool-integration-selection

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-02

## Rule

Before adding a capability to an agent, choose the narrowest reliable integration boundary:

- use CLI/script when a local deterministic command maps directly to the job;
- use a skill when the missing piece is repeatable procedure, project convention or harness logic;
- use MCP when the capability needs a durable service boundary, authentication, remote execution, shared governance, tool discovery, auditability or rendered/processed output;
- use browser/manual review when the task requires visual inspection, dynamic interaction or human judgment.

Do not default to MCP just because a server exists. Do not default to CLI just because the model knows shell commands.

## Use when

- designing a new coding agent or subagent;
- adding a tool to Techscope;
- deciding whether Telegram, GitHub, browser, documentation, database or file workflows should be exposed through scripts, skills or MCP;
- reducing context pressure from broad tool schemas;
- moving a local workflow toward team/shared operation.

## Avoid when

- the task is one-off and manual execution is cheaper than building an integration;
- the tool boundary is security-sensitive and no trust model is defined;
- the source or API version is unknown;
- the current MCP/server/client behavior has changed and freshness has not been rechecked.

## Required practices

- Start with a short routing note: `CLI/script`, `skill`, `MCP`, `browser` or `manual`.
- Prefer CLI/script for local file operations, Git status/logs, text processing, format conversion, test execution and deterministic project scripts.
- Prefer skills for reusable agent procedure: how to transcribe a video, process an intake, run a review, query memory or operate a project-specific harness.
- Prefer MCP for OAuth, refresh-token handling, SaaS APIs, per-user permissions, audit trails, centralized team integrations, server-side caching/rate limits and remote/API-only agents.
- Prefer browser-backed tools when the agent needs rendered DOM, JavaScript execution, screenshots or visual verification.
- Narrow MCP exposure where possible: enable only needed toolsets/tools, prefer read-only modes for research, and avoid broad `all` toolsets unless justified.
- Treat both shell and MCP as privileged execution surfaces. Use least privilege, explicit credentials, logs and reviewable configuration.
- Measure token/context impact before treating numeric claims as facts.
- When MCP is selected for a Pritha child agent, apply `agent-mcp-connector-lifecycle`: record source, auth, enabled toolsets, approval gates, readiness and fallback in the contract/scaffold.
- When remote MCP is selected, treat it as an API/service integration: record
  network origin, auth scopes, transport, data classes, logs, tool-definition
  scan and drift policy.
- When Codex is selected, choose the Codex surface explicitly: local CLI, app
  supervision, IDE, cloud task, app-server, MCP worker, workspace agent or
  enterprise provider path. Do not treat "Codex" as one interchangeable
  integration boundary.
- For tool-heavy agents, prefer progressive discovery over eager loading: expose a catalog/search/status path before loading every tool schema or MCP server into the active context.
- Use code-mode orchestration only when multi-tool sequencing would otherwise require many slow model turns, and only with sandbox, timeout, filesystem/network policy and approval gates.

## Decision matrix

| Need | Default choice | Why |
| --- | --- | --- |
| Read/search local files | CLI/script | Mature commands, compact, deterministic. |
| Git status/log/diff in local repo | CLI/script | Models know Git; command output is the useful artifact. |
| Repeatable project procedure | Skill | Encodes "how we do it here" without building a server. |
| Public HTTP fetch of simple static text | CLI/script or browser | Start simple; use browser if rendering matters. |
| JavaScript-heavy page extraction | Browser or MCP fetcher | Raw `curl` may return framework shell, not readable content. |
| SaaS with OAuth/token refresh | MCP | Server boundary can own auth lifecycle. |
| Shared team integration | MCP | Centralized config, access control and update path. |
| Audit/compliance-sensitive action | MCP or managed service | Easier to enforce policy and logs than ad hoc shell. |
| Visual QA | Browser | Requires rendered state, screenshots or interaction. |
| Many possible tools, few needed per task | Progressive discovery | Search/select toolsets on demand instead of bloating every turn. |
| Multi-step tool orchestration | Code mode in sandbox | Let code compose calls when policy allows; avoid long sequential model-tool loops. |
| Parent agent needs a coding worker | Codex as MCP worker | Preserve thread IDs, scoped workspace, approval policy, traces and artifact gates. |
| Organization requires AWS governance | Bedrock-backed provider path | Treat as runtime/provider placement with region, IAM, CloudTrail and feature-gap checks. |
| Many MCP servers available through a gateway | Gateway plus narrow MCP allowlist | Gateway helps operations; each server/tool still needs review and approval. |
| External SaaS with broad actions | Remote MCP with strict scopes or direct API | Useful only with narrow tools, approvals, audit and fallback. |
| Huge MCP tool catalog | Progressive discovery or code/API composition | Avoid loading every schema into context; use sandbox for code composition. |

## Temporal validity

- Source published: 2026-05-04 for the IBM CLI/MCP video; 2026-05-12 for the related Skills/MCP video.
- Source updated: 2026-06-02 for this Techscope draft.
- Source version: Techscope draft standard v3; MCP spec 2025-06-18; GitHub MCP
  docs and Codex/Docker/AWS/remote MCP source batches verified 2026-06-02.
- Retrieved: 2026-05-17.
- Verified: 2026-06-02.
- Valid for: Techscope agent projects and coding-agent harness design from 2026-05-17 onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: MCP spec/auth/tool discovery changes, GitHub MCP Server changes
  toolset behavior, Docker MCP Toolkit changes catalog/gateway semantics, or
  Codex/OpenAI skills/tool/provider execution model changes.

## Examples

- Techscope YouTube transcription should remain CLI/script-backed and wrapped by project workflow rules.
- Techscope intake assessment should be skill/workflow-like: local Markdown source of truth, deterministic scripts for indexing, agent-assisted synthesis in the thread.
- GitHub local repo inspection should start with CLI; GitHub cloud operations involving PRs/issues/auth may use GitHub connector/MCP-style integration.
- Rendered website extraction should not rely on `curl` if the target is a client-rendered app; use browser-backed extraction.

## Related decisions

- `05_decisions/2026-05-15-memory-architecture.md`
- `05_decisions/2026-05-15-local-embeddings.md`
- `04_standards/agent-mcp-connector-lifecycle.md`
