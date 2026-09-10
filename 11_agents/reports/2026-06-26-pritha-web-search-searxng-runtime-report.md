---
id: 2026-06-26-pritha-web-search-searxng-runtime-report
type: agent-operations-report
status: completed
created: 2026-06-26
updated: 2026-06-26
topics:
  - pritha-voice-control
  - web-search
  - searxng
  - operations
tools:
  - SearXNG
  - Pritha Control Center
  - gpt-realtime-2
  - Python
sources:
  - 03_reviews/2026-06-26-pritha-vc-open-source-web-search-assessment.md
  - 07_workflows/2026-06-26-pritha-web-search-voice-tool-plan.md
  - https://docs.searxng.org/dev/search_api.html
  - https://github.com/searxng/searxng/tree/e3126b89e69d1a56488f54f27928581a897cb058
related:
  reviews:
    - 03_reviews/2026-06-26-pritha-vc-open-source-web-search-assessment.md
  workflows:
    - 07_workflows/2026-06-26-pritha-web-search-voice-tool-plan.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: pritha-subsystem
  id: voice-control-web-search
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Operations Report: Pritha Voice Web Search SearXNG Runtime

Date: 2026-06-26
Status: completed

## Summary

SearXNG was installed as a local Pritha runtime dependency and started for Voice Control web search testing.

The runtime is intentionally local-only:

- SearXNG listens on `127.0.0.1:8888`.
- Pritha Control Center listens on `127.0.0.1:3420`.
- No Tailscale/public SearXNG exposure was configured.
- No launchd, cron, scheduler or durable auto-start service was enabled.
- `recent_external_research` remains installed but disabled from the active Realtime tool surface.

## Runtime Layout

- Source checkout: `.tools/web-search/searxng/main`
- Upstream commit: `e3126b89e69d1a56488f54f27928581a897cb058`
- Python venv: `.tools/web-search/searxng/venv`
- Private settings: `.private/services/searxng/settings.yml`
- Tracked lock/config: `tools/web-search/searxng-lock.json`
- Reproducible local installer: `scripts/web-search-tools.mjs`

The settings enable JSON:

```yaml
search:
  formats:
    - html
    - json
```

## Verification

Direct SearXNG JSON smoke test:

- URL: `http://127.0.0.1:8888/search?q=SearXNG&format=json`
- Result: JSON returned successfully.
- Sample result count: 23.
- Some engines reported CAPTCHA/unresponsive warnings; SearXNG still returned usable results.

Pritha Realtime status:

- Active tools include `web_search`.
- Active tools do not include `recent_external_research`.
- `external_research.last30days_realtime_tool_surface` is `disabled`.

Pritha `web_search` tool checks:

- `operation=diagnose`: `ok: true`, `status: complete`, `coverage: partial`.
- Query `OpenAI Realtime API documentation` with `source_policy=official_first` and OpenAI domains: `ok: true`, `coverage: good`, 5 results, mostly official OpenAI pages.

## Operational Notes

GitHub should contain the reproducible integration layer, not generated runtime state. A fresh clone can install and start the local backend with:

```sh
node scripts/bootstrap.mjs prepare --profile local
node scripts/bootstrap.mjs start --profile control-center
```

The Realtime `web_search` handler can also auto-ensure local SearXNG on first localhost backend failure. This is a local background process, not a persistent service. A future durable setup should be a separate explicit operations decision with stop/restart commands, logging, healthcheck and user approval for launchd or another service manager.
