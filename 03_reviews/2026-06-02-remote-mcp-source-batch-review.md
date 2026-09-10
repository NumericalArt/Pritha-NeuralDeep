---
id: 2026-06-02-remote-mcp-source-batch-review
type: review
status: draft
created: 2026-06-02
updated: 2026-06-02
topics:
  - mcp
  - remote-mcp
  - external-connectors
  - tool-poisoning
  - mcp-registries
  - agent-security
  - pritha
tools:
  - MCP
  - Cloudflare
  - Docker MCP Toolkit
  - OpenAI Responses API
  - Google ADK
  - GitHub MCP Registry
  - Zapier MCP
sources:
  - https://www.anthropic.com/news/model-context-protocol
  - https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/
  - https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks
  - https://www.docker.com/blog/introducing-docker-mcp-catalog-and-toolkit/
  - https://blog.cloudflare.com/mcp-demo-day/
  - https://cloud.google.com/blog/topics/developers-practitioners/use-google-adk-and-mcp-with-an-external-server
  - https://openai.com/index/new-tools-and-features-in-the-responses-api/
  - https://zapier.com/blog/zapier-mcp-openai-responses-api/
  - https://github.blog/ai-and-ml/generative-ai/how-to-find-install-and-manage-mcp-servers-with-the-github-mcp-registry/
  - https://www.anthropic.com/engineering/code-execution-with-mcp
  - https://registry.modelcontextprotocol.io/docs
  - https://modelcontextprotocol.io/registry/terms-of-service
  - https://platform.openai.com/docs/guides/tools-remote-mcp
  - https://developers.cloudflare.com/agents/model-context-protocol/
related:
  signals:
    - 01_sources/signals/2026-06-02-remote-mcp-source-batch-signal.md
  standards:
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2024-11-25 to 2025-11-04
source_updated: mixed
source_version: official/vendor source batch verified 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha remote MCP connector selection and audit
temporal_status: current
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-remote-mcp-batch-2026-06-02
recommendation: standard
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: remote-mcp-connector-lifecycle
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Review: Remote MCP Source Batch

Date: 2026-06-02
Status: draft
Recommendation: standard

## One-Paragraph Read

This batch is worth integrating into Pritha's MCP lifecycle standard. It
confirms that MCP is becoming the common external-tool interface for agents, but
remote MCP raises a sharper trust problem than local scripts: network calls,
OAuth scopes, registries, dynamic tool lists, tool descriptions and SaaS side
effects can all alter agent behavior. The right response is not to ban remote
MCP, but to make it contract-selected, narrowly scoped, scanned, observable and
candidate-only until review passes.

## Source Verdicts

| Date | Source | Verdict | Pritha fit |
| --- | --- | --- | --- |
| 2024-11-25 | Anthropic MCP launch | baseline | Defines host/client/server role split and MCP as external data/tool connector. |
| 2025-03-25 | Cloudflare remote MCP | adopt | Strong remote deployment pattern: hosted MCP, auth, transport and adapter concerns. |
| 2025-04-01 | Invariant Labs tool poisoning | adopt for security | Tool descriptions/schemas can inject hidden instructions. Must scan and diff tool definitions. |
| 2025-04-22 | Docker MCP Catalog and Toolkit | adopt with caveat | Useful containerized catalog/toolkit path; catalog is discovery, not authorization. |
| 2025-05-01 | Cloudflare MCP Demo Day | watch/adopt as ecosystem evidence | Shows MCP as SaaS integration surface across major vendors. Do not infer all vendor servers are safe. |
| 2025-05-14 | Google ADK external MCP | adopt | Confirms external MCP can be integrated across agent frameworks; transport choice matters. |
| 2025-05-21 | OpenAI Responses remote MCP | adopt | Remote MCP enters first-party OpenAI API path. Requires explicit connector and approval policy. |
| 2025-05-21 | Zapier MCP with OpenAI | adopt with caveat | High business value and high side-effect risk; thousands of apps demand strict scopes and approvals. |
| 2025-10-24 | GitHub MCP Registry | adopt | Registry improves discovery/install, especially developer workflows; still requires owner and tool review. |
| 2025-11-04 | Anthropic code execution with MCP | adopt as pressure signal | Many MCP tools create context bloat; use progressive discovery and sandboxed code/API composition. |

## Consolidated Patterns

### Remote MCP Boundary

Remote MCP is a service integration. It must record:

- server URL and owner;
- transport;
- auth method;
- credential storage;
- network path;
- data scope;
- side-effect scope;
- logging/audit location;
- fallback.

### Registry And Catalog Policy

Use registries and catalogs for discovery only. Official registries, GitHub MCP
Registry, Docker MCP Catalog and vendor docs can help find candidates, but
candidate servers still need provenance, package/image, license, maintainer,
toolset, auth and side-effect review.

### Tool Poisoning Review

Before enabling an external MCP server, inspect the full tool definition:
description, parameter names, schemas, enums, examples, prompts/resources and
dynamic tool list behavior. Record a hash/fingerprint when possible and treat
tool-list changes as drift that requires re-review.

### Context And Code Execution

When tool count is high, avoid loading every schema eagerly. Prefer:

- manifest or tool search;
- narrow allowlists;
- progressive discovery;
- sandboxed code/API composition for multi-tool work;
- filtered outputs before model context.

## Techscope Adoption Check

- Techscope/Agents Mother fit: adopt.
- Implementation cost: low for standards/workflow updates, medium for manifest
  fields, high for automated tool-definition scanner and drift monitor.
- Risk: external MCP can become hidden SaaS authority with broad tools,
  token-heavy schemas and prompt-injection surface.
- Decision: update MCP lifecycle standard and connector workflow now; defer
  automated MCP scanner until a child-agent contract selects external MCP.

## Promotion Guidance

Promote as principles:

- remote MCP is a network/auth boundary;
- registry/catalog discovery is not trust;
- tool definitions are untrusted input;
- dynamic tool drift requires audit;
- broad SaaS MCP needs approval gates;
- code-mode/MCP composition needs sandboxing.

Do not promote as defaults:

- installing from random registries;
- broad Zapier/app catalogs;
- all tools exposed by vendor MCP servers;
- code execution without sandbox;
- remote MCP for simple local workflows.
