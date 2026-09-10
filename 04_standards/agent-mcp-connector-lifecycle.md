---
id: agent-mcp-connector-lifecycle
type: standard
status: draft
created: 2026-06-01
updated: 2026-08-09
last_reviewed: 2026-08-09
owner: Pritha
topics: [mcp, agent-connectors, agent-factory, harness-engineering, tool-use, security]
tools: [Pritha, MCP, Codex, Agent Skills]
sources:
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-untrusted-input-security.md
  - 03_reviews/2026-06-01-agent-connectivity-stack-update-assessment.md
  - 02_briefs/2026-05-17-skills-vs-mcp-agent-tooling-brief.md
  - 02_briefs/2026-05-17-cli-vs-mcp-tool-selection-brief.md
  - 02_briefs/2026-05-15-mcp-server-pitfalls-brief.md
  - https://modelcontextprotocol.io/development/roadmap
  - https://modelcontextprotocol.io/community/skills-over-mcp/charter
  - https://modelcontextprotocol.io/seps/2575-stateless-mcp
  - https://blog.modelcontextprotocol.io/posts/2026-07-28/
  - https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
  - https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649
  - https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
  - https://github.com/github/github-mcp-server
  - https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/configure-toolsets
  - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
  - https://www.docker.com/blog/connect-codex-to-mcp-servers-mcp-toolkit/
  - 03_reviews/2026-06-02-remote-mcp-source-batch-review.md
  - 03_reviews/2026-06-02-agentic-ui-source-batch-review.md
  - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
related:
  workflows:
    - 07_workflows/agent-mcp-connector-selection.md
    - 07_workflows/agents-mother.md
  standards:
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-interface-experience.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-17
source_updated: 2026-07-28
source_version: Pritha MCP connector lifecycle v5; MCP 2026-07-28 stateless core, discovery, MRTR and extension migration
retrieved: 2026-06-01
verified: 2026-08-09
valid_for: Pritha-created agents that may use external MCP servers or MCP-style connectors
temporal_status: current
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

# Standard: Agent MCP Connector Lifecycle

## Rule

Pritha treats MCP as an optional, contract-selected connector layer for child
agents. MCP is recommended only when the agent needs a durable external
capability boundary: authentication, shared service access, governance,
auditability, remote execution, managed tool discovery, rendered output or
centralized integration logic.

External MCP servers must not be silently installed, broadly exposed or treated
as harmless context. They are reviewed, scoped to narrow toolsets, recorded in
the agent contract and manifest, checked for readiness, and audited during the
agent lifecycle.

Remote MCP servers are service integrations. They add network, authorization,
credential, availability, data residency and SaaS side-effect boundaries on top
of the ordinary MCP tool surface. Treat remote MCP as closer to adding an API
connector than installing a local helper.

## Relationship to Skills

Skills and MCP are complementary.

- A skill is procedural memory: it tells the agent how to do a repeatable task.
- MCP is a capability boundary: it exposes external context, tools or services.

Use a skill when the missing piece is project procedure. Use MCP when the
missing piece is controlled access to an external system. Use both when the MCP
server exposes a capability and the agent needs local operating rules for when,
why and how to use it.

## Defaults

- MCP needs: `auto`
- Allowed MCP sources: `trusted-only`
- MCP install mode: `recommend`
- Auth policy: `no-secrets-in-repo`
- Toolset policy: `narrow-only`
- Side-effect policy: `approval-required`
- External MCP activation: explicit contract decision required
- Missing selected auth: `pending-auth`, not ready
- Missing optional MCP: `skipped`

## Use When

- The agent needs OAuth, refresh-token handling or per-user permissions.
- The agent needs a remote SaaS or hosted service boundary with explicit
  authentication and audit.
- The integration should be centrally maintained across agents or users.
- A service boundary can own rate limits, caching, audit logs or credentials.
- The agent needs remote/API-only access rather than local deterministic commands.
- Rendering, browser-backed extraction or processed output is more valuable than
  raw CLI output.
- The workflow is audit-sensitive or shared-team operated.

## Avoid When

- A local CLI/script safely maps directly to the job.
- A skill can encode the missing repeatable procedure without a service boundary.
- The MCP source, maintainer, license or auth behavior is unclear.
- The server exposes broad toolsets when the agent needs only one or two actions.
- The contract has no secrets, network, filesystem or side-effect policy.
- Current client/server behavior is volatile and has not been rechecked.

## Lifecycle

1. Discovery: identify possible MCP servers from local memory, trusted catalogs,
   official docs or user-provided candidates.
2. Boundary selection: compare MCP against CLI/script, skill, browser/manual and
   direct API using `agent-tool-integration-selection`.
3. Recommendation: explain why MCP is useful, optional or unnecessary for the
   child agent's actual workflow.
4. Review: inspect provenance, source type, auth requirements, exposed tools,
   toolset scoping, network scope, filesystem scope, side effects, license,
   maintenance risk, transport, prompt-injection surface and tool-definition
   drift risk.
5. Contract decision: record selected, optional, candidate or rejected MCP
   connectors in the agent contract.
6. Scaffold integration: generate MCP manifest placeholders only for selected or
   candidate connectors; never write secrets into the scaffold.
7. Readiness check: report `configured`, `pending-auth`, `failed` or `skipped`.
8. Runtime use: expose only approved toolsets/tools and keep destructive,
   public, high-cost or sensitive actions behind approval gates.
9. Audit/update: periodically check source drift, auth drift, toolset expansion,
   broken servers and unused connectors.

## Progressive Discovery

For a child agent with many possible MCP connectors or toolsets, prefer
progressive discovery over eager loading. The active context should receive a
small manifest, status command or tool-search/catalog route first. Full tool
schemas should be loaded only when the task needs them.

Discovery candidates include:

- `mcp/manifest.json` for selected project connectors;
- `mcp/candidates.json` for advisory candidates;
- runtime-specific tool search when available;
- official registries or trusted catalogs;
- MCP Server Cards when supported by the server/client ecosystem.

Do not treat discovery as authorization. A discoverable server still needs
contract compatibility, trust review, auth policy, scoped toolsets and approval
gates before runtime use.

## Gateway and Catalog Rule

Managed MCP gateways and catalogs, such as Docker MCP Toolkit, can reduce setup
friction, centralize credential handling and make server configuration more
portable across clients. They do not replace Pritha's connector review.

When a child agent uses an MCP gateway, record the gateway separately from the
individual servers it exposes. The contract must still define:

- allowed servers;
- enabled tools or toolsets;
- credential owner and storage boundary;
- network and filesystem scope;
- update policy for gateway and server images/packages;
- approval mode for side effects;
- audit/log location;
- fallback if the gateway or selected server is unavailable.

Do not expose a whole catalog because it is convenient. A 200-server catalog is
a discovery surface, not a permission set.

The same rule applies to official registries, GitHub MCP Registry, Docker MCP
Catalog, vendor server portals and broad no-code catalogs such as Zapier MCP.
Use them to find candidates. Do not treat listing, verification, popularity,
container packaging or vendor branding as authorization for runtime use.

## Remote MCP Boundary

For remote MCP, record:

- remote server URL or registry/server identifier;
- transport: Streamable HTTP, SSE, remote gateway or client-specific adapter;
- auth method: OAuth, bearer token, API key, Access policy or none;
- credential owner and storage boundary;
- minimum OAuth scopes or app permissions;
- whether requests originate from the user machine, model provider, cloud
  worker or gateway;
- expected data classes crossing the network;
- side-effect classes;
- audit/log surface;
- data residency or enterprise governance constraints;
- fallback if the remote server is unavailable.

If the network origin or auth flow is unclear, keep the connector
`candidate-only`.

## Tool Definition Security

Treat MCP tool definitions as untrusted model input. A malicious or compromised
server can hide instructions in descriptions, parameter names, schemas, enum
values, examples, prompts, resources or dynamic tool lists.

Before enabling an external MCP server:

- inspect full tool definitions, not only tool names;
- scan descriptions and schemas for instruction injection or exfiltration
  language;
- record a hash/fingerprint when practical;
- alert or block if tool definitions change unexpectedly;
- keep high-risk tools behind approval even if the server is otherwise trusted.

Tool poisoning and rug-pull drift are blocking risks for untrusted or broad MCP
servers.

## MCP 2026-07-28 Compatibility Boundary

The 2026-07-28 protocol release makes the core request model stateless. Do not
assume that a server receives a mandatory initialization handshake, durable
session identifier or prior-request capabilities. Identity, protocol version
and capabilities required for one request must be available on that request or
through an explicitly selected extension.

For every connector, record:

- negotiated protocol version;
- legacy initialization/session dependence;
- discovery method and fallback;
- whether list responses support safe caching and invalidation;
- whether elicitation uses multi-round tool requests (MRTR);
- selected extensions such as Tasks;
- client/server compatibility test evidence.

During migration, use a version-aware adapter. It may support both legacy and
2026-07-28 behavior, but it must not silently emulate session state in a way that
changes authorization, tenant identity or replay semantics.

MRTR `input_required` is a protocol interaction state, not blanket permission to
ask for secrets or approve side effects. Map it into the agent's typed lifecycle,
apply privacy rules to requested input and preserve human approval gates.

MCP request headers and cacheable catalogs improve routing and efficiency but
also create trust boundaries. Gateways must validate header-derived identity,
vary caches by the relevant authorization/capability scope and avoid leaking
one tenant's tools or metadata to another.

## Emerging MCP Directions

Track these as `watch` or `experiment` unless a child-agent contract explicitly
requires them and current client/server support is verified:

- MCP Server Cards and `.well-known` discovery metadata;
- Skills Over MCP for distributing procedural knowledge through MCP resources or
  extensions;
- MCP Apps / UI resources for interactive widgets;
- MCP Tasks for long-running or human-in-the-loop tool work where current
  client/server extension support is verified.

These directions can improve enterprise operation, but they are version-bound.
Recheck official MCP Roadmap, SEPs, extension docs and client support before
turning any of them into scaffold defaults.

## MCP Apps and UI Resources

If a child-agent contract selects MCP Apps, MCP UI or another MCP-delivered
interactive widget, also apply `agent-interface-experience`.

The MCP server may provide a UI resource, but the child-agent contract still
must define:

- whether the UI is an operator panel, workflow UI, embedded app or generated
  widget;
- the host rendering boundary, such as sandboxed iframe or host-owned
  components;
- what user intents the widget may emit;
- which side effects still require agent/operator approval;
- whether the widget can request tool calls, send messages or update model
  context;
- privacy prompts and data classes visible to the widget;
- fallback text/tool output if the host does not support MCP Apps.

Do not let MCP-delivered UI bypass toolset scoping, auth policy or side-effect
approval gates.

## Review Fields

Every selected or candidate MCP connector should record:

- name;
- source type: official, vendor, community, local, unknown;
- source URL or package reference when allowed by the child agent's provenance
  policy;
- maintainer and license when known;
- trust level;
- review status: recommended, optional, candidate, rejected, blocked;
- required credentials and where they are stored;
- auth mode;
- transport;
- remote origin;
- minimum scopes;
- registry/catalog source;
- discovery method: manual, manifest, registry, server-card, runtime-search;
- enabled toolsets/tools;
- dynamic tool/resource/prompt lists;
- tool definition scan result;
- tool definition hash or drift policy;
- network scope;
- filesystem scope;
- side-effect classes: read-only, write, publish, spend, deploy, delete;
- approval gates;
- prompt-injection and data-exfiltration risks;
- expected context/tool schema cost;
- progressive discovery support;
- readiness command;
- audit/update command;
- fallback if MCP is unavailable.

## Scaffold Shape

For a child agent that selects MCP, Pritha should create a small module:

```text
mcp/
  README.md
  manifest.json
  candidates.json
scripts/
  mcp-status.mjs
```

`mcp/manifest.json` is the source of truth for selected connectors. It should
record configured connectors, pending authentication, enabled toolsets and
approval gates. `mcp/candidates.json` is advisory and must not be treated as
active instructions.

## Manifest Sketch

```json
{
  "version": 1,
  "policy": {
    "external_mcp": "approval-required",
    "toolsets": "narrow-only",
    "auth": "no-secrets-in-repo",
    "side_effects": "approval-required",
    "tool_definition_scan": "required"
  },
  "connectors": [
    {
      "name": "github",
      "source_type": "official-or-vendor",
      "review_status": "selected",
      "readiness": "pending-auth",
      "transport": "remote-http-or-stdio",
      "registry_source": "manual-or-registry",
      "enabled_toolsets": ["repos-read"],
      "tool_definition_scan": "pending",
      "side_effects": ["read-only"],
      "approval_gates": ["write", "publish", "delete"],
      "fallback": "gh CLI or manual browser review"
    }
  ],
  "candidates": []
}
```

## Failure Rules

Block or keep candidate-only any MCP connector that:

- requires undefined secrets or unclear credential storage;
- violates the child agent's network, filesystem or data-retention policy;
- exposes broad destructive or public actions without approval gates;
- exposes broad app catalogs without a narrow allowlist;
- cannot narrow toolsets or permissions enough for the contract;
- has unknown provenance for a security-sensitive workflow;
- injects untrusted tool output or tool definitions directly into memory or
  tools;
- contains suspicious tool descriptions, schemas, prompts or resource metadata;
- changes tool definitions after review without an explicit drift decision;
- requires runtime install during scaffold without explicit user approval;
- has changed protocol/auth behavior since the last verified source check.

## Pritha Simplicity Rule

Pritha should not become a general MCP marketplace manager. Its job is to decide
whether MCP belongs in a specific child agent's initial architecture, explain the
reasoning, create minimal manifests when selected, and report readiness. Deeper
MCP implementation, server creation or runtime-specific installation happens
only when the child agent contract requires it.

## Temporal Validity

- Source published: 2026-05-17.
- Source updated: 2026-07-28.
- Source version: Pritha MCP connector lifecycle v5; MCP 2026-07-28 stateless
  core, discovery, MRTR and extensions plus prior connector source batches.
- Retrieved: 2026-06-01.
- Verified: 2026-08-09.
- Valid for: Pritha-created agents that may use external MCP servers or
  MCP-style connectors.
- Freshness status: current.
- Temporal status: current.
- Recheck when: MCP spec/auth/tool discovery changes, major clients change MCP
  configuration semantics, registries/catalogs change trust semantics, remote
  MCP auth guidance changes, or a child agent selects a security-sensitive MCP.
