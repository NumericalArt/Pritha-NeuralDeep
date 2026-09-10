---
id: historical-engineering-c71e59b5ee13
type: review
status: processed
created: 2026-09-10
updated: 2026-09-10
topics: [agent-engineering, reusable-patterns]
tools: [Node.js, Codex]
sources: [reviewed-historical-engineering-evidence]
related: {}
memory_domain: agent-building-knowledge
privacy: public
---

# Historical engineering lessons

De-identified engineering notes retained from earlier agent work. These are
historical observations, not installed agents or current verification claims.

## Runtime isolation and boundary

- Runtime isolation profile: project-folder.
- Sandbox required: optional later.
- Sandbox candidate: none for v1.
- Host control plane: Pritha Control Center and operator terminal/Codex.
- Agent execution boundary: `<USER_HOME>/reference-agent` local web process and
  agent-local data folders.
- Credential boundary: host-only; credentials are configured through UI or
  local placeholders, never from voice/model context.
- Network policy: local-first; Tailscale private access only after approved
  Serve configuration; no external image provider network calls.
- Filesystem policy: reference-agent may read/write only its project-local app
  files, `images/inbox`, metadata and test fixtures.
- Integration policy presets: Pritha Control Center, Pritha Voice Control
  task routing, internal Codex handoff, Tailscale private access.
- Operator approval flow: required for mutating Tailscale Serve/install/off,
  service/autostart, deletion outside reference-agent, publication or credential
  writes.
- Snapshot/restore needs: standard child-agent project snapshot later.
- Runtime boundary notes: Pritha stores only control metadata and reports, not
  generated images.


## Security and permissions

- Secrets required: none for reference-agent v1.
- `.env.example` variables: safe placeholders only, no external image provider
  keys.
- Allowed network access: local app and Tailscale private access; no public
  exposure; no external generation provider calls.
- Allowed filesystem access: reference-agent project folder only.
- User authorization model: trusted local operator and trusted tailnet devices.
- Runtime isolation profile: project-folder.
- Network policy tier: operator-approved for Tailscale changes.
- Credential storage boundary: UI/local placeholders, no voice/model-context
  secret writes.
- Risk notes: image files can contain private operator content; do not copy to
  Pritha memory, logs or reports.


## AI-SAFE security profile

- AI-SAFE profile: standard.
- AI-SAFE review status: reviewed for contract; implementation checks pending.
- Interface / input-output controls: UI displays only project-local images and
  metadata; delete is the only feed action.
- Reasoning and planning controls: Codex generation occurs upstream in Pritha
  task context, not inside the reference-agent app.
- Knowledge / memory / RAG controls: no RAG or embeddings; local files only.
- Execution / tools / MCP / skills controls: no MCP; scripts must reject paths
  outside project root.
- Infrastructure / operations / orchestration controls: no autostart; Tailscale
  mutating actions require explicit final approval.
- AI-SAFE selected layers: interface, knowledge/memory, execution/tools,
  infrastructure.
- AI-SAFE skipped layers: external model/provider routing in reference-agent.
- AI-SAFE open risks: final implementation must verify delete cannot escape the
  image inbox and that Tailscale URL is not hardcoded.
- AI-SAFE recheck sources: Pritha standards and local implementation tests.

