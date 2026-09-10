---
id: historical-engineering-db9dc1f4a77e
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

## Architecture recommendation

- Runtime family: keep `hybrid` unless research finds a hard blocker.
- Telegram: keep out of scaffold v1 unless the user explicitly selects it later.
- Memory: start from `SQLite-first operational memory plus Markdown docs; raw media stored under local uploads and referenced from DB.`; add SQLite/embeddings only if v1 workflows need retrieval.
- Scaffold should remain minimal, testable and free of copied TechScope secrets.

