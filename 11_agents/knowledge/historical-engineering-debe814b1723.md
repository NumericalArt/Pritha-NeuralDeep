---
id: historical-engineering-debe814b1723
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

## Security And Permissions

- Secrets required: OpenAI API key, Codex account auth outside repo.
- `.env.example` variables: defined in reference-agent; real secrets are not copied into Techscope.
- Allowed network access: OpenAI Realtime; source verification from Codex queue jobs.
- Allowed filesystem access: reference-agent project and its `data/` folder.
- User authorization model: single trusted local operator.
- Risk notes: no multi-user auth, manual service mode, private media should not be published automatically.


## Architecture Update 2026-05-29

Current reference-agent voice control is documented in `historical engineering evidence`.

The updated boundary is:

- Realtime for live speech and intent dispatch.
- Server tools for deterministic validation, memory writes, feed edits and gates.
- `CodexTaskService` for complex work.
- Codex App/thread as preferred foreground transport.
- Codex CLI/local queue as fallback or worker transport.

This makes reference-agent the Pritha reference for event/reportage agents: intake source material, update operational memory, process media and sources, form reviewed feed cards and publish only after explicit approval.

