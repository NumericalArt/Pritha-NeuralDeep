---
id: 2026-06-02-remote-mcp-source-batch-signal
type: signal
status: refined
created: 2026-06-02
updated: 2026-06-11
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
  - source-remote-mcp-batch-2026-06-02
related:
  reviews:
    - 03_reviews/2026-06-02-remote-mcp-source-batch-review.md
  standards:
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-untrusted-input-security.md
generated_from:
  - source-remote-mcp-batch-2026-06-02
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
anonymous_source_id: source-remote-mcp-batch-2026-06-02
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

# Signal: Remote MCP Source Batch

Date: 2026-06-02
Status: refined
Source class: mixed
Retention: source-purged

## Core Signal

External and remote MCP should be treated as an integration layer, not as a
library install. The useful pattern is:

```text
registry/catalog discovery
-> owner/provenance review
-> remote/local transport decision
-> auth and credential boundary
-> narrow tool allowlist
-> tool-schema scan and drift detection
-> approval gates
-> runtime readiness
-> audit/update lifecycle
```

## Useful Delta For Pritha

- Remote MCP creates a network and authorization boundary. It needs different
  review from local stdio MCP because requests may leave the user's machine and
  auth is often OAuth/API-token based.
- Registries and catalogs are discovery surfaces, not trust decisions. Official,
  GitHub, Docker and vendor registries reduce search friction but do not remove
  the need to check owner, scope, package/image provenance and tool behavior.
- Tool poisoning is a first-class MCP risk: malicious instructions can hide in
  tool descriptions, schemas, parameter names, examples or dynamic tool lists.
- Docker-style containerized MCP helps with local isolation and reproducibility,
  but it does not automatically make tool permissions safe.
- Cloudflare/OpenAI/Google/Zapier examples show MCP becoming a SaaS integration
  interface. This is useful for business agents only when the contract defines
  data scope, side effects, user approval and logging.
- Anthropic's code-execution-with-MCP pattern is a pressure signal: for agents
  with many MCP tools, prefer progressive discovery and sandboxed code/API
  composition over eager loading every schema into model context.

## Pritha Rule Candidate

External MCP candidates should stay `candidate-only` until Pritha records:

- source and owner;
- registry/catalog path;
- transport: stdio, Streamable HTTP, SSE or gateway;
- auth method and credential storage;
- enabled tool allowlist;
- side-effect classes;
- tool-schema scan result;
- schema/tool-list drift policy;
- approval gates;
- readiness command;
- fallback.
