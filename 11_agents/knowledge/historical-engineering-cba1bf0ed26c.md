---
id: historical-engineering-cba1bf0ed26c
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

## Security and permissions

- Secrets required: OpenAI API key; Codex CLI auth via local Codex installation; optional proxy later.
- `.env.example` variables: OPENAI_API_KEY, OPENAI_REALTIME_MODEL, CODEX_BIN, AGENT_DATA_DIR, reference-agent_ALLOWED_ORIGIN.
- Allowed network access: OpenAI API plus user-provided URLs and official source verification.
- Allowed filesystem access: agent project folder and configured local data/uploads directory only by default.
- User authorization model: local operator
- Risk notes: no public deployment without auth; no automatic publishing; uploaded media may contain private exhibition/customer information.

