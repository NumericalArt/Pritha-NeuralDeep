---
id: historical-engineering-cbb26e852859
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

## Runtime Isolation And Boundary

- Runtime isolation profile: project-folder.
- Sandbox required: optional for future hardening.
- Sandbox candidate: none for v1.
- Host control plane: operator terminal and browser.
- Agent execution boundary: `<USER_HOME>/reference-agent` Node/Vite process.
- Credential boundary: server-side environment only.
- Network policy: manual mode local-only; Realtime voice contacts OpenAI only
  after explicit operator action.
- Filesystem policy: app does not write runtime data; generated assets are
  created by explicit script.
- Integration policy presets: OpenAI Realtime only.
- Operator approval flow: required for future writes, deployment, service,
  publication or credential changes.
- Snapshot/restore needs: git/workspace snapshot only.
- Runtime boundary notes: browser receives ephemeral session credentials, not
  the OpenAI API key.

