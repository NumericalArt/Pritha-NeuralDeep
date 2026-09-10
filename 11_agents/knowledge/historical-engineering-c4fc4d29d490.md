---
id: historical-engineering-c4fc4d29d490
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

- Runtime family: keep `codex-native` unless research finds a hard blocker.
- Telegram: keep out of scaffold v1 unless the user explicitly selects it later.
- Memory: start from `Markdown-only minimal project notes`; add SQLite/embeddings only if v1 workflows need retrieval.
- Scaffold should remain minimal, testable and free of copied Pritha secrets.

