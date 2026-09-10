---
id: historical-engineering-d2396fd8e63c
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

## Recovery Pattern

When multiple local agents share Tailscale Serve:

1. Preserve the known-good reference service and do not edit its project files during network diagnosis.
2. Reset Tailscale Serve to the smallest needed mapping.
3. Verify local upstream health.
4. Verify tailnet URL from the host, while remembering that host self-access is not enough.
5. If peers still cannot open the service but `tailscale ping` works, restart Tailscale on the host and reapply Serve mappings.
6. Add additional services one at a time on separate HTTPS ports.
7. Record the final `tailscale serve status` shape.


## Lessons

- Tailscale URL success from the host can be a misleading hairpin check; always confirm from the target device when mobile/laptop access matters.
- Restore the reference service before adding a second service.
- Keep each agent on a separate Tailscale HTTPS port to avoid path and cache ambiguity.
- Use health endpoints for each upstream before judging browser UI behavior.

