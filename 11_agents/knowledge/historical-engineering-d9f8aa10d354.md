---
id: historical-engineering-d9f8aa10d354
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

## Useful Scaffold Patterns

- Keep Realtime as the low-latency teacher interface, not the whole agent.
- Use ephemeral Realtime client secrets from the server; never expose the API key to the browser.
- Keep durable actions in server tools:
  - semantic search;
  - record attempt;
  - save lesson outcome.
- Store lesson progress in SQLite when the domain has repeat attempts and evolving learner state.
- Treat YouTube video/audio as cache; keep URL, derivative, attempts, grades and progress as durable memory.
- Give the user manual retrieval controls:
  - search memory;
  - select a result as practice focus;
  - clear focus when it should not affect the next lesson.
- Make repeated source intake idempotent by stable source id.


## Failed Assumptions

- A YouTube embed alone is not reliable enough for mobile learning flow; anti-bot prompts can block viewing.
- A passive search-result list is not enough; search results need actions.
- A selected memory result can confuse the next voice session unless the UI has a clear reset.
- Avoiding duplicate DB rows is not the same as idempotent intake; derivative rebuild and reindex must also be skipped.
- "English teacher" was too narrow; the UI and teacher should support language learning generally.


## Reusable Standard Candidates

- `selected-memory-focus`: semantic search results become useful when one result can be explicitly injected into the next Realtime session.
- `memory-focus-reset`: any user-selected retrieval context must have an obvious reset.
- `source-idempotent-intake`: every media/source ingestion flow should use a stable source id before creating new artifacts.
- `local-cache-not-memory`: large media files should be cache unless the contract explicitly requires archival storage.
- `voice-tool-boundary`: Realtime should call narrow server tools rather than directly touching raw files or broad memory.


## Outdated Or Risky Patterns

- Treating a web voice agent as a pure chat UI misses important product controls around context, memory and reset.
- Letting model retrieval happen only invisibly makes user steering harder.
- Launchd service setup should remain explicit and documented; do not silently install long-running services.

