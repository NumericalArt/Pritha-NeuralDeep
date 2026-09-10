---
id: 2026-06-26-pritha-web-search-voice-tool-plan
type: workflow
status: implemented
created: 2026-06-26
updated: 2026-06-26
topics:
  - pritha-voice-control
  - realtime-tools
  - web-search
  - searxng
  - control-center
tools:
  - SearXNG
  - OpenAI Realtime API
  - gpt-realtime-2
  - Pritha Control Center
  - last30days-skill
agent_platforms:
  - Pritha VC Realtime
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
runtime_environment:
  - local-project
  - mac
  - control-center
  - tailscale-private-access
config_surfaces:
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/components/voice/usePrithaRealtime.ts
  - interfaces/control-center/src/components/voice/VoiceControlPage.tsx
  - scripts/web-search-tools.mjs
  - scripts/bootstrap.mjs
  - tools/web-search/searxng-lock.json
  - tests/pritha-voice-control.test.mjs
  - .env.example
portability: adapter-needed
sources:
  - 03_reviews/2026-06-26-pritha-vc-open-source-web-search-assessment.md
  - 03_reviews/2026-06-25-last30days-pritha-voice-tool-assessment.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 04_standards/agent-tool-integration-selection.md
  - https://docs.searxng.org/dev/search_api.html
  - https://github.com/searxng/searxng
related:
  reviews:
    - 03_reviews/2026-06-26-pritha-vc-open-source-web-search-assessment.md
    - 03_reviews/2026-06-25-last30days-pritha-voice-tool-assessment.md
  workflows:
    - 07_workflows/2026-06-25-pritha-last30days-voice-tool-plan.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/agent-tool-integration-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-06-26
source_version: implementation plan v1; SearXNG docs 2026.6.24+e3126b89e; Pritha Control Center voice runtime inspected 2026-06-26
retrieved: 2026-06-26
verified: 2026-06-26
valid_for: Pritha Control Center gpt-realtime-2 Voice Control web-search tool replacement
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: workflow
  id: pritha-web-search-voice-tool
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Implementation Plan: Pritha Voice Web Search Tool

Date: 2026-06-26
Status: implemented

## Objective

Replace the active Realtime `recent_external_research` tool with a smaller `web_search` tool for ordinary current web lookup. Keep the last30days backend installed and callable from code, but remove it from the active Realtime tool schema and voice instructions so it does not consume context or get selected for wrong tasks.

## Plan

1. Leave `handleRecentExternalResearch` and last30days readiness code intact.
2. Remove `recent_external_research` from `buildPrithaRealtimeTools`, Realtime instructions, UI fallback tool list and client data-channel tool banner.
3. Add `web_search` as the eighth active tool.
4. Route `web_search` to a local SearXNG JSON backend through a narrow server handler.
5. Return compact voice-safe search output: results, URLs, snippets, coverage, warnings, timings and private artifact path.
6. Add `operation=diagnose` for checking SearXNG reachability and JSON readiness.
7. Add reproducible local SearXNG install/start tooling under ignored `.tools` and `.private` paths.
8. Wire SearXNG into bootstrap: `prepare --profile local` installs it, and `start --profile control-center` starts it locally before Control Center.
9. Let the `web_search` handler auto-ensure local SearXNG on first backend connection failure when the URL is localhost.
10. Document local env knobs in `.env.example`.
11. Update tests to assert the active tool boundary, disabled last30days surface and bootstrap hooks.

## Tool Contract

```ts
{
  operation?: "search" | "diagnose";
  query?: string;
  mode?: "quick" | "sources" | "deep";
  source_policy?: "general" | "official_first" | "news" | "technical" | "community";
  freshness?: "day" | "month" | "year";
  domains?: string[];
  language?: string;
  max_results?: number;
}
```

## Safe Defaults

- Backend: `PRITHA_WEB_SEARCH_BACKEND=searxng`.
- Endpoint: `PRITHA_SEARXNG_URL=http://127.0.0.1:8888/search`.
- Timeout: `PRITHA_WEB_SEARCH_TIMEOUT_MS=6000`.
- Auto-ensure: `PRITHA_WEB_SEARCH_AUTO_ENSURE=1` for localhost SearXNG only.
- No memory writes.
- Raw run output goes only to `.private/interface-lab/pritha-control-center/realtime/web-search-runs/`.
- If SearXNG is unavailable, Pritha must report backend unavailability instead of claiming no reliable sources exist.

## Fresh Clone Behavior

A new local checkout gets the tool code, pinned SearXNG lock file and bootstrap integration from GitHub. It does not vendor the SearXNG checkout, Python venv or private settings into the repo. Those are generated locally:

- `node scripts/bootstrap.mjs prepare --profile local` installs the pinned SearXNG checkout into `.tools/web-search/searxng/` and writes private local settings under `.private/services/searxng/`.
- `node scripts/bootstrap.mjs start --profile control-center` starts local SearXNG in the background and then starts Control Center in the foreground.
- A first `web_search` call can also run `node scripts/web-search-tools.mjs ensure searxng --yes --json` automatically if localhost SearXNG is not reachable.

This makes GitHub clones reproducible without committing generated runtime state or exposing a public search service.

## Rollback

To re-enable last30days as the active voice tool, restore `recent_external_research` in `buildPrithaRealtimeTools`, Realtime instructions, UI fallback list and client data-channel banner. The backend handler was not deleted.
