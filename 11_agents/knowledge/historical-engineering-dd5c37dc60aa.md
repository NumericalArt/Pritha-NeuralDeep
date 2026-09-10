---
id: historical-engineering-dd5c37dc60aa
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

## Reference Pattern

Use reference-agent as a reference when a future descendant needs:

- a browser-first voice UI;
- OpenAI Realtime with server-issued ephemeral client secrets;
- narrow server tools for durable actions;
- local SQLite operational memory;
- semantic search with lexical fallback;
- user-selected retrieval focus and explicit reset;
- media/source intake with stable ids;
- Tailscale access for a trusted single-user local service;
- launchd service mode gated by explicit user approval.

Do not copy it blindly when a future agent does not need live voice, media intake, learner progress, semantic retrieval, persistent local service behavior or trusted-tailnet access.

