---
id: historical-engineering-e242dc7a690d
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

## Pattern Pack

- Path: 11_agents/research/2026-06-23-reference-agent-agent-pattern-pack.md
- Status: complete
- Selected patterns: 24
- Semantic/embedding search: complete
- Semantic failure log: none
- External research seeds: deterministic browser, browser app., web. telegram, telegram none., reference-agent voice-first, voice-first codex-native, adding telegram, telegram web, web api, api voice, voice mcp, mcp skills, skills browser, browser file, upload rag, rag deployment

Codex must read this pattern pack before scaffold or agent improvement work. If semantic/embedding search failed, continue only with the warning recorded above and use external research to compensate for missing semantic retrieval.


## Architecture recommendation

- Runtime family: keep `codex-native scaffold plus deterministic local web app.` unless research finds a hard blocker.
- Telegram: include it as `none.` adapter with queue, allowlist, concise replies and logs.
- Memory: start from `file-backed local media inbox, no embeddings or Pritha memory`; add SQLite/embeddings only if v1 workflows need retrieval.
- Scaffold should remain minimal, testable and free of copied Pritha secrets.

