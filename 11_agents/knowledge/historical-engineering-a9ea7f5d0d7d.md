---
id: historical-engineering-a9ea7f5d0d7d
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

## Lessons Learned

- Event agents need a feed/source lifecycle, not generic chat memory only.
- Realtime voice should dispatch to narrow server tools and Codex deep tasks
  instead of owning durable state directly.
- Publication, service install and public exposure must stay behind explicit
  gates.

