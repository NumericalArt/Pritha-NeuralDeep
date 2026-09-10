---
id: agent-mcp-connector-selection
type: workflow
status: draft
created: 2026-06-01
updated: 2026-06-02
topics: [mcp, agent-connectors, pritha, agent-factory, harness-engineering]
tools: [Pritha, MCP, Codex]
sources:
  - 04_standards/agent-mcp-connector-lifecycle.md
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/agent-creation-harness.md
  - 03_reviews/2026-06-02-remote-mcp-source-batch-review.md
related:
  standards:
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-tool-integration-selection.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: workflow
  id: agent-mcp-connector-selection
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Workflow: Agent MCP Connector Selection

## Goal

Choose whether a Pritha-created child agent needs MCP connectors, and if so,
record them as explicit, scoped, auditable harness modules rather than implicit
global tools.

## Inputs

- Accepted or draft `agent-contract`.
- Mission, workflows, interfaces, tools, secrets, deployment and security needs.
- Candidate MCP servers from local memory, trusted docs or user request.

## Steps

1. Decide whether the workflow needs an external capability boundary.
2. Compare alternatives using `agent-tool-integration-selection`:
   - CLI/script for deterministic local work;
   - skill/workflow for repeatable procedure;
   - browser/manual for rendered or judgment-heavy work;
   - MCP for auth, governance, shared services, auditability, remote execution,
     managed tool discovery or processed service output.
   - progressive discovery when the agent has many possible tools but only a
     few should be loaded per task.
3. Score each MCP candidate:
   - workflow fit;
   - trust/provenance;
   - auth clarity;
   - scope minimization;
   - side-effect risk;
   - context/tool schema cost;
   - discovery/catalog support;
   - transport and remote origin;
   - tool-definition scan/drift risk;
   - maintenance risk;
   - fallback quality.
4. Recommend one of:
   - `selected`;
   - `optional`;
   - `candidate-only`;
   - `rejected`;
   - `blocked`.
5. Record the decision in the agent contract.
6. If selected, scaffold:
   - `mcp/manifest.json`;
   - `mcp/candidates.json`;
   - `mcp/README.md`;
   - `scripts/mcp-status.mjs` when the scaffold has enough runtime context.
7. Mark readiness:
   - `configured`;
   - `pending-auth`;
   - `failed`;
   - `skipped`.
8. Keep destructive, public, spend, delete, deploy or sensitive-data actions
   behind explicit approval gates.

## Interview Questions

- Does this agent need access to external services beyond local files/scripts?
- Is there a mature local CLI that already handles the integration safely?
- Does the workflow require OAuth, refresh tokens, per-user permissions or
  shared team governance?
- Which exact toolsets/actions does the agent need?
- Which actions are read-only, write, publish, spend, deploy or delete?
- Where are credentials stored?
- Is the server local stdio, Streamable HTTP, SSE, remote gateway or another
  adapter path?
- If remote, where do requests originate and which OAuth/API scopes are needed?
- Can the MCP server be scoped to narrow tools/toolsets?
- Does the connector support discovery through a registry, manifest, server
  card or runtime tool search?
- Have tool definitions, schemas, prompts and resources been scanned for tool
  poisoning?
- What happens if tool definitions change after approval?
- What is the fallback if the MCP connector is unavailable?
- Should this connector be selected for v1, left as candidate-only or postponed?

## Output

The workflow should produce:

- contract fields for MCP policy and selected/candidate connectors;
- an architecture note explaining why MCP is or is not needed;
- manifest entries for selected connectors;
- readiness status;
- audit/update notes for future maintenance.
