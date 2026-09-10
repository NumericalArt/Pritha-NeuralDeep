---
id: 2026-06-26-pritha-vc-open-source-web-search-assessment
type: assessment
status: draft
created: 2026-06-26
updated: 2026-06-26
topics:
  - pritha-voice-control
  - realtime-tools
  - web-search
  - open-source-search
  - knowledge-freshness
tools:
  - SearXNG
  - Crawl4AI
  - Firecrawl
  - Whoogle
  - YaCy
  - tavily-open
  - Vane
  - gpt-realtime-2
agent_platforms:
  - Pritha VC Realtime
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - voice-control
runtime_environment:
  - local-project
  - mac
  - control-center
  - tailscale-private-access
config_surfaces:
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/components/voice/usePrithaRealtime.ts
  - interfaces/control-center/.env.example
  - SearXNG settings.yml
portability: adapter-needed
sources:
  - https://docs.searxng.org/dev/search_api.html
  - https://github.com/searxng/searxng
  - https://docs.openwebui.com/features/chat-conversations/web-search/providers/searxng/
  - https://docs.crawl4ai.com/
  - https://github.com/unclecode/crawl4ai
  - https://github.com/firecrawl/firecrawl
  - https://github.com/firecrawl/firecrawl/blob/main/SELF_HOST.md
  - https://github.com/benbusby/whoogle-search
  - https://yacy.net/
  - https://github.com/yacy/yacy_search_server
  - https://github.com/jianjungki/tavily-open
  - https://github.com/ItzCrazyKns/Vane
  - 03_reviews/2026-06-25-last30days-pritha-voice-tool-assessment.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 04_standards/agent-tool-integration-selection.md
related:
  intakes: []
  briefs: []
  reviews:
    - 03_reviews/2026-06-25-last30days-pritha-voice-tool-assessment.md
  decisions: []
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/agent-tool-integration-selection.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: "mixed: SearXNG docs 2026.6.24+e3126b89e; Crawl4AI docs v0.9.x; GitHub repository HEADs retrieved 2026-06-26"
source_version: "SearXNG docs 2026.6.24+e3126b89e; Crawl4AI docs v0.9.x; Pritha VC context after last30days v3.8.3 integration"
retrieved: 2026-06-26
verified: 2026-06-26
valid_for: Pritha gpt-realtime-2 voice-control web-search tool planning as of 2026-06-26
temporal_status: current
recommendation: experiment
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: pritha-subsystem
  id: voice-control-realtime-web-search
privacy: public
retention: durable
review_status: draft
confidence: medium
---

# Assessment: open-source web search for Pritha VC Realtime

Date: 2026-06-26
Status: draft
Recommendation: run a local SearXNG-backed `web_search` experiment, with optional Crawl4AI page extraction. Keep `recent_external_research` for last-30-days signal scans.

## One-paragraph read

Pritha VC needs a different tool from `recent_external_research`. The current last30days tool is good for "what changed recently around this topic?" but weak for ordinary spoken questions like weather, sports, official facts, release pages or "find me a current source." The best open-source v1 is SearXNG as a local metasearch backend exposed through a narrow Pritha server adapter. Add Crawl4AI only when Pritha needs to open the top result pages and extract clean markdown. Do not integrate a full Perplexity-like app as the first step: Vane/Perplexica-style systems are useful inspiration, but they duplicate Pritha's answer layer and add another agent/UI runtime.

## Why it matters

The user expects Pritha to answer by voice after a search, not to report that no reliable sources were available when a straightforward web lookup should have found them. The new tool should therefore optimize for low-latency retrieval, source URLs, confidence, and transparent failure modes. It should not be another long research job.

## Candidate comparison

| Option | Strengths | Weaknesses | Fit for Pritha VC |
| --- | --- | --- | --- |
| SearXNG | Mature privacy-oriented metasearch; HTTP API; many engines; no tracking/profiling positioning; already used by AI apps like Open WebUI. | Must self-host or configure JSON output; public instances often disable JSON; quality depends on upstream engines and anti-bot behavior. | Best v1 search backend. |
| SearXNG + Crawl4AI | Search plus page extraction into LLM-friendly markdown; good for cited answers and official-source checks. | More moving parts, browser/crawler security surface, slower than search-only. | Best v1.5 for "answer with sources." |
| Whoogle | Very light, self-hosted Google result proxy; JSON output exists; simple install. | Single Google upstream; the README has an April 2026 final-release notice because Google blocking broke the no-JavaScript approach; project itself suggests Searx/SearXNG for multi-engine use. | Skip for Pritha v1; not stable enough. |
| YaCy | True open-source search engine with own index, crawler and P2P mode. | Heavy for voice; local index quality needs crawling; Java service/admin surface; not a quick current web answer tool. | Watch/experiment later for private corpus or intranet search. |
| Firecrawl | Strong agent-oriented search/scrape API and markdown extraction; self-host path exists. | AGPL and cloud-vs-open-source split; self-hosting has more maintenance; hosted mode is no longer purely open-source/local. | Good optional extraction service, not primary open-source search. |
| tavily-open | Tavily-like API built on SearXNG/Crawl4AI, with caching and fallback extraction. | Adds a wrapper around components we can integrate directly; less proven than SearXNG itself. | Watch; use if direct adapter becomes too much work. |
| Vane / Perplexica-style app | Full privacy-focused AI answering engine, bundled SearXNG, cited answers. | Another app/answering layer; needs model setup and UI/runtime; overlaps with Pritha's own synthesis layer. | Inspiration only for now. |

## Current-source notes

- SearXNG supports `/` and `/search` over GET/POST and JSON output through `format=json`, but JSON must be enabled in `settings.yml`; many public instances disable it. This means Pritha should self-host or control the instance configuration.
- SearXNG describes itself as a metasearch engine where users are neither tracked nor profiled, and the GitHub repository lists AGPL-3.0 licensing.
- Open WebUI documents SearXNG as a Docker-backed web-search provider, which is useful evidence that the SearXNG boundary is normal for local LLM/chat systems.
- Crawl4AI v0.9.x focuses on clean markdown, structured extraction, browser control and open-source access without forced API keys. It is a crawler/extractor, not a search engine.
- Firecrawl provides search/scrape/interact APIs and is open source under AGPL-3.0, but its self-hosting documentation explicitly calls out extra maintenance/configuration.
- Whoogle is attractive for simplicity and has JSON output, but its README now carries a 2026 final-release notice due to Google blocking. It also says Whoogle only uses Google results and encourages Searx for other engines and more configuration. This makes it a poor Pritha backend in 2026.
- YaCy is the most independent search-engine option, but it is a full index/crawler/search-server system. That is too much operational surface for the immediate Realtime voice need.

## Recommended tool boundary

Add a separate Realtime tool, tentatively named `web_search` or `current_web_lookup`.

The tool should accept:

- `query`: user-visible search query.
- `mode`: `quick`, `sources`, or `deep`.
- `source_policy`: `general`, `official_first`, `news`, `technical`, or `community`.
- `max_results`: bounded default of 5.
- `freshness`: optional `day`, `month`, `year`, or none, mapped to SearXNG `time_range` only when supported.
- `domains`: optional allow/prefer list for official-source routing.
- `language`: optional, default from UI/session.

The tool should return:

- `answerable`: boolean.
- `coverage`: `good`, `partial`, `weak`, or `none`.
- `results`: title, URL, source/engine, snippet, published date if available.
- `extracted_sources`: only for modes that fetch pages.
- `warnings`: disabled engines, timeouts, weak evidence, no official source found.
- `timings`: search and extraction latency.
- `artifact_path`: private run directory under `.private/`, not curated memory.

## Proposed architecture

```text
Realtime voice
  -> Pritha server tool: web_search/current_web_lookup
  -> local SearXNG /search?q=...&format=json
  -> optional Crawl4AI/readability extraction for top N URLs
  -> compact cited result back to Realtime
  -> private logs/artifacts for debugging
```

Implementation defaults:

- Bind SearXNG to localhost or an internal-only address, not public Tailscale exposure.
- Enable `search.formats: [html, json]` in SearXNG settings.
- Keep the voice path read-only.
- Use short timeouts: about 4-6 seconds for search-only, 8-12 seconds when extracting top pages.
- Cap results and extracted text hard; Realtime gets a compact answer payload, not raw pages.
- Log `search_started`, `search_finished`, result count, source URLs, timings and backend errors.
- Make `recent_external_research` and `web_search` distinct in the UI so "8 active" does not imply one tool does both jobs.

## Voice behavior

Pritha should not say "I have no reliable sources" just because one tool returned empty. It should say something closer to:

- "I found 4 current sources; the best one is the official page..."
- "I found only weak/secondary sources, so I would treat this as tentative..."
- "This looks like a weather/sports/live-data question; I need a dedicated provider or official site lookup, not last30days."
- "The search backend timed out; I can try a deeper Codex task."

## Security and operations

- Treat search results and extracted pages as untrusted input.
- Do not let retrieved page text directly write memory, standards, decisions or scripts.
- Do not expose SearXNG admin/config pages over Tailscale until access control is explicit.
- Record AGPL obligations for SearXNG and Firecrawl before distributing a modified hosted service.
- Prefer the narrow Pritha adapter over exposing a broad MCP/search server directly to Realtime.
- Add a diagnostics command similar to `external-research-tools.mjs diagnose`: check SearXNG URL, JSON enabled, query smoke test, timeout, and extraction backend status.

## Existing knowledge check

Related artifact: `03_reviews/2026-06-25-last30days-pritha-voice-tool-assessment.md`.

Relationship: refines and narrows. `last30days` remains useful for recent signal/community/release research. The new web-search tool covers general current lookup and source discovery.

This also confirms `04_standards/realtime-voice-control-for-codex-agents.md`: Realtime should dispatch to a narrow server tool, and the server should own retrieval, logging, limits and source handling.

## Scores

- Programming relevance: 4/5. The integration is straightforward HTTP/JSON plus optional extraction.
- Agent engineering relevance: 5/5. This fixes a real voice-tool mismatch and improves trust.
- DX impact: 4/5. A local SearXNG smoke test and logs are much easier to debug than vague model claims.
- Evidence quality: 4/5. Primary docs and repos were checked; live result quality still needs local benchmarking.
- Practicality: 4/5 for SearXNG search-only, 3/5 for SearXNG plus extraction.
- Leverage: 5/5. A reliable search tool benefits Pritha and future child agents.
- Risk: 3/5. Main risks are upstream engine blocking, crawler security, AGPL/distribution details and source hallucination if the answer layer over-trusts snippets.

## Decision

Proceed with a local SearXNG-backed `web_search` experiment for Pritha VC Realtime. Use search-only first, then add Crawl4AI or a simpler readability extractor for top-page verification. Keep Firecrawl, tavily-open and Vane as later comparison points, not the first implementation.

## Next artifact

experiment
