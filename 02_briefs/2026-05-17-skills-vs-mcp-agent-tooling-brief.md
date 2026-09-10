---
id: 2026-05-17-skills-vs-mcp-agent-tooling-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-06-01
topics:
  - agent-skills
  - mcp
  - coding-agents
  - context-engineering
  - tool-use
  - workflow-standardization
tools:
  - Agent Skills
  - MCP
  - Codex
  - Claude Code
  - Playwright
  - GitHub CLI
  - OpenAI Docs MCP
  - Shell tool
sources:
  - source-f71ffbdf-62d1-436b-b9ff-81e6307fd74c
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.436Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-f71ffbdf-62d1-436b-b9ff-81e6307fd74c
---

# Artifact: source-f71ffbdf-62d1-436b-b9ff-81e6307fd74c

Date: 2026-05-17
Status: draft
Source class: video
Retention: source-purged

Date: 2026-05-17
Status: draft

## Summary

The useful conclusion is not "Skills killed MCP". Skills and MCP solve adjacent but different problems. MCP is a protocol for exposing external context, tools and services to agents. Skills are portable, progressive-disclosure instructions that tell an agent how to perform a task, often by using local scripts, CLIs, reference files or MCP tools. For Techscope and future coding agents, the practical rule should be: prefer skills for local repeatable workflows and process knowledge; prefer MCP for service integration, OAuth, shared governance, caching, remote/API-agent environments and standardized tool access.

## Key claims

- Skills are a better fit for workflow instructions, local scripts, local CLI wrappers, browser automation through scripts, document/file workflows and project-specific operating procedures.
- MCP is a better fit when the agent needs a standardized service boundary, OAuth/refresh-token handling, shared integration logic, centralized updates, caching/rate-limit handling, auditing or non-local/API execution.
- Context overhead is still a concern, but no longer the only argument: modern clients can lazy-load or search tools on demand.
- Skills and MCP can be layered: MCP gives access to an external system; a skill tells the agent when and how to use that access.
- Both Skills and MCP are security-sensitive. Skills can bundle executable scripts; MCP tools can expose data and arbitrary operations. Both need trust, review and sandboxing/approval policies.

## Evidence

- Agent Skills docs define the folder/`SKILL.md` model and progressive disclosure.
- OpenAI maintains a Codex skills catalog and ships system skills in Codex.
- OpenAI also hosts a public Docs MCP server and explicitly suggests pairing it with a skill, which supports the "complement, not replacement" model.
- MCP specification defines resources, prompts and tools as server features, using JSON-RPC and capability negotiation.
- OpenAI Shell docs reinforce that local command execution is powerful but needs sandboxing, allowlists/denylists and logging.
- The video transcript provides a practical migration recipe: list MCPs, find CLI/script alternatives, wrap repeatable workflows into skills, test, then remove only the MCPs that are actually redundant.

## Risks and caveats

- MCP servers can also be risky: tool descriptions, data access and command execution need consent and authorization.
- Skills are not guaranteed to trigger unless their metadata/description is good.
- Agents can skip steps in a skill; critical workflows need checklists, assertions or executable harnesses.
- MCP token/context cost varies by client and implementation; use measurements rather than fixed assumptions.
- OAuth and shared team integrations should not be forced into skills unless a mature CLI already handles auth safely.

## Recommendation

Adopt this as a candidate standard for Techscope:

- Default to skills for repeatable local agent workflows, project conventions, command wrappers, document generation, browser scripts and internal scripts.
- Default to MCP for external service access with auth, shared team governance, server-side caching, auditability, and integrations that should be centrally maintained.
- Use skills plus MCP together when process knowledge matters: the MCP exposes the tool, the skill teaches the agent the operating procedure.
- Before adding any MCP server to a coding-agent setup, ask whether a small skill around an existing CLI/script would be cheaper, safer and easier to maintain.

## Next step

Create a draft standard: "agent tool integration selection: skills vs MCP vs CLI". The standard should include a decision matrix, security checklist and migration recipe.
