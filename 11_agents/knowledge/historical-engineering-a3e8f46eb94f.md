---
id: historical-engineering-a3e8f46eb94f
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

## Trigger Boundary

Allowed triggers:

- Pritha realtime voice intent addressed to reference-agent.
- Optional Control Center UI shortcut that creates the same Codex task payload.

Not allowed in this contract:

- direct server-side image-generation provider calls from Pritha or reference-agent;
- external image providers or image-provider credentials;
- public publishing;
- Pritha memory, queue, report or log storage for generated image files;
- launchd, cron, scheduler, service install or deployment changes.

