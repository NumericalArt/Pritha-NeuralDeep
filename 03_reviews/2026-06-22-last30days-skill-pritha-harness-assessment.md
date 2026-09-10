---
id: 2026-06-22-last30days-skill-pritha-harness-assessment
type: assessment
status: draft
created: 2026-06-22
updated: 2026-06-22
topics:
  - agent-skills
  - external-research
  - pritha
  - agent-factory
  - knowledge-freshness
  - scheduled-research
tools:
  - last30days-skill
  - Agent Skills
  - Codex
  - Python
  - SQLite
  - MCP
  - GitHub
  - Reddit
  - Hacker News
  - Polymarket
  - X
  - YouTube
agent_platforms:
  - Codex
  - Claude Code
  - Agent Skills hosts
model_context:
  - frontier reasoning model with web search
  - optional headless CLI
runtime_environment:
  - local Mac
  - codex-native
  - optional scheduler
config_surfaces:
  - SKILL.md
  - CLI flags
  - .env
  - LAST30DAYS_MEMORY_DIR
  - LAST30DAYS_STORE
  - Pritha research reports
portability: adapter-needed
sources:
  - https://github.com/mvanhorn/last30days-skill
  - https://github.com/mvanhorn/last30days-skill/tree/9f77d3ac314d95052c6718d2605f934c24a9ee0a
  - https://github.com/mvanhorn/last30days-skill/blob/9f77d3ac314d95052c6718d2605f934c24a9ee0a/README.md
  - https://github.com/mvanhorn/last30days-skill/blob/9f77d3ac314d95052c6718d2605f934c24a9ee0a/skills/last30days/SKILL.md
  - https://github.com/mvanhorn/last30days-skill/blob/9f77d3ac314d95052c6718d2605f934c24a9ee0a/CONFIGURATION.md
  - https://github.com/mvanhorn/last30days-skill/blob/9f77d3ac314d95052c6718d2605f934c24a9ee0a/CHANGELOG.md
  - https://github.com/mvanhorn/last30days-skill/blob/9f77d3ac314d95052c6718d2605f934c24a9ee0a/mcp/README.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/agent-skill-pack-lifecycle.md
  - 04_standards/agent-untrusted-input-security.md
  - 04_standards/agent-proactivity-scheduling.md
  - 04_standards/memory-domains.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agent-skill-pack-selection.md
related:
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/memory-domains.md
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agent-skill-pack-selection.md
    - 07_workflows/memory-indexing.md
  reviews:
    - 03_reviews/2026-06-02-agent-skills-source-batch-review.md
    - 03_reviews/2026-05-17-skills-vs-mcp-agent-tooling-assessment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-21
source_updated: 2026-06-22
source_version: last30days-skill v3.8.0, main commit 9f77d3ac314d95052c6718d2605f934c24a9ee0a
retrieved: 2026-06-22
verified: 2026-06-22
valid_for: Pritha external-research and child-agent research workflow design as of 2026-06-22
temporal_status: version-bound
source_type: github-repository
source_class: public-github
ingested_at: 2026-06-22
processed_at: 2026-06-22T00:00:00Z
retention_status: source-retained-public-url
usefulness: high
evidence_quality: medium
recommendation: experiment
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - governance
subject:
  kind: tool
  id: last30days-skill
privacy: public
retention: durable
review_status: draft
confidence: medium
---

# Assessment: last30days-skill for Pritha Harness

Date: 2026-06-22
Status: draft
Recommendation: experiment, not default adoption

## One-paragraph read

`mvanhorn/last30days-skill` is a serious external-research engine packaged as an Agent Skill: it can search recent public/social sources, save raw briefs, persist findings into its own SQLite store, and maintain watchlist-style recurring topics. It is a good candidate for a Pritha external-research adapter, especially for "what changed recently?" checks before agent creation. It should not be installed as an active Pritha skill or mandatory dependency yet. The correct first move is a pinned, isolated pilot that treats its output as untrusted source material, not curated Pritha memory.

## Source snapshot

- Repository: `mvanhorn/last30days-skill`, public GitHub.
- Checked ref: `main` commit `9f77d3ac314d95052c6718d2605f934c24a9ee0a`.
- Latest inspected release context: `SKILL.md` / `pyproject.toml` version `3.8.0`; `CHANGELOG.md` records `3.8.0` on 2026-06-21.
- Last commit observed: 2026-06-22 07:26:36 -0700, `fix: exclude dev artifacts from Hermes skill scan (#656)`.
- Local clone size: about 37 MB, 332 tracked files, 93 runtime script files under `skills/last30days/scripts`, 125 test files.
- Local Pritha host caveat: current `python3` is 3.9.6 and no `python3.12` / `python3.13` was found on PATH, while the tool requires Python 3.12+.

## What the tool is

The project is not just a prompt or a small `SKILL.md`. It is a multi-source research engine with:

- an Agent Skills package at `skills/last30days/SKILL.md`;
- a Python CLI engine at `skills/last30days/scripts/last30days.py`;
- adapters for Reddit, X/Twitter, YouTube, TikTok, Instagram, Hacker News, Polymarket, GitHub, Bluesky, Threads, Pinterest, Perplexity and web backends;
- optional credentials through `.env`, macOS Keychain, `pass`, browser cookies, `gh auth token` and provider API keys;
- `--days` / `--lookback-days`, `--as-of`, `--plan`, `--github-user`, `--github-repo`, `--hiring-signals`, `--competitors`, `--emit=json|md|html|compact`;
- `--store`, `store.py`, `watchlist.py` and `briefing.py` for repeated monitoring;
- an optional Go MCP wrapper targeted at Claude Desktop, with one `research` tool that shells out to the Python engine.

## Fit with Pritha

### Strong fits

- Pritha already has a pre-scaffold research gate. `scripts/pritha.mjs research` searches local memory and writes `11_agents/research/...-agent-research.md`. A fresh external-search section belongs naturally after the current domain-aware memory findings.
- The tool's "last 30 days" bias matches Pritha's freshness requirement for fast-moving runtimes, APIs, agent frameworks, skills, MCP connectors, models and deployment services.
- `--emit=json` and `--store` make it possible to consume findings programmatically instead of relying only on chat prose.
- The watchlist module maps well to recurring Pritha topics such as Codex capabilities, Agent Skills, MCP security, agent harnesses, local model runtimes, prompt-injection research and child-agent UI patterns.

### Weak fits

- The skill's runtime contract is large and very opinionated about output format. It is useful for direct user-facing `/last30days` runs, but too broad to inject into Pritha as always-on operating instructions.
- It has a wide network and credential surface. Pritha's default child-agent rule is minimal selected modules, not global tool sprawl.
- Its SQLite store is not Pritha memory. Pritha's authored source of truth remains Markdown; `.memory/techscope.sqlite` is rebuildable from curated artifacts. The last30days store can only be a staging/source cache.
- It requires Python 3.12+ and optional binaries/API keys. Current Pritha environment does not satisfy the Python requirement.

## Recommended integration shape

Add a Pritha-native `external-research` gate, with last30days as one optional backend.

Default behavior:

1. Keep current local memory search as the first authority.
2. Derive external search topics from the user request and `agent-contract`: mission, selected runtime, selected interfaces, APIs, models, deployment target, data sources, skills, MCP connectors, untrusted-input classes and unusual dependencies.
3. Run fresh internet search for volatile topics unless the contract explicitly records `Current-docs verification required: no-with-reason`.
4. Save raw external results outside curated memory first.
5. Write a compact reviewed section into the agent research report:
   - query;
   - date window;
   - backend/tool used;
   - source URLs;
   - key claims;
   - candidate additions to the scaffold;
   - rejected/noisy findings;
   - open questions;
   - whether findings confirm, refine, contradict or supersede Pritha memory.
6. Only promote durable conclusions into `02_briefs/`, `03_reviews/`, `04_standards/` or `05_decisions/` after evidence classification.

Concrete command surface to add later:

```sh
node scripts/pritha.mjs research <contract-path> --external-search
node scripts/pritha.mjs external-research run --topic "Codex Agent Skills" --days 30
node scripts/pritha.mjs external-research watchlist list
node scripts/pritha.mjs external-research watchlist run-now
```

This should be Pritha code that can use:

- Codex/native web search when available;
- `last30days.py --emit=json` when installed, pinned and healthy;
- plain official-doc checks for technologies where social search is less useful.

## Child-agent creation procedure

Make fresh external search mandatory for non-trivial child-agent creation, but make the backend optional.

Rule proposal:

- Production scaffold requires both Pritha memory research and current external verification.
- External verification is `complete` only when volatile choices have been checked against current sources.
- If the requested agent is purely local/minimal and uses no volatile external API/runtime/dependency, the report may mark external search `not-applicable` with a reason.
- If the user explicitly says "no internet", record `pending` or `not-performed-by-request`, and do not present the scaffold as fully production-verified unless the contract accepts that risk.

The query generator should produce searches like:

- `<agent mission> agent architecture current best practices`;
- `<selected runtime/framework> docs release changes`;
- `<selected API/service> auth limits pricing changelog`;
- `<selected model/provider> current capabilities pricing limits`;
- `<selected interface> security prompt injection recent`;
- `<selected MCP/skill/tool> current install docs issues`;
- `<deployment target> service install launchd/systemd current docs`.

For example, a Telegram child agent should trigger searches for current Telegram Bot API constraints, Telegram file/media limits, queue/polling/webhook behavior and current security notes. A browser Realtime voice agent should trigger current OpenAI Realtime/API docs, browser audio constraints, WebRTC/WebSocket security and Codex transport status.

## Regular Pritha topic monitoring

The tool can support recurring topic search, but not as automatic curated-memory writes.

Candidate watchlist topics:

- `OpenAI Codex AGENTS.md skills latest changes`;
- `Agent Skills ecosystem security supply chain evals`;
- `MCP authorization remote MCP security tool discovery`;
- `agent prompt injection untrusted input defenses`;
- `local coding agents OpenClaw Hermes Pi Cursor Claude Code`;
- `agent harness evaluation benchmarks local models tool use`;
- `Realtime voice agents browser WebRTC Codex sidecar`;
- `agent memory Markdown SQLite embeddings graph RAG`;
- `deployment launchd cron scheduled agent operations`;
- `AI UI agentic UI MCP Apps UI widgets`.

Recommended cadence:

- manual `run-now` first;
- weekly digest after the first successful manual run;
- no cron/launchd until an operations report selects scheduler owner, budget, status command, logs, kill switch and approval gates;
- curated import only through `signal`, `brief`, `assessment`, `review`, `decision` or `standard` artifacts.

## Security and governance risks

- External skill supply chain: activate only after pinning commit/tree SHA, license review, script review, dependency review and hash recording.
- Prompt injection: external posts, comments, transcripts and pages are hostile input. They must not directly update Pritha memory, tools, contracts or standards.
- Credential scope: the tool can use many secrets and browser cookies. Pritha must not copy or infer these from existing `.env`, Keychain, browser sessions or `gh auth` without explicit configuration.
- Account and ToS risk: X/browser-cookie scraping and social platform scraping should be opt-in and documented.
- Cost risk: ScrapeCreators, Perplexity, OpenRouter, xAI and other providers can spend money. Each recurring topic needs a budget.
- Data quality risk: engagement-weighted social evidence is useful for pulse and adoption signals, not for truth by itself.
- Scheduler risk: `watchlist.py` stores schedules as metadata but relies on an external scheduler. Pritha must not add cron/launchd automatically.
- Local runtime risk: current machine lacks Python 3.12+ on PATH, so direct execution fails today.

## Technical feasibility

Feasible, with an adapter. Not feasible as a silent drop-in default.

Minimum pilot:

1. Pin repository to commit `9f77d3ac314d95052c6718d2605f934c24a9ee0a`.
2. Install Python 3.12+ in an isolated environment.
3. Run `last30days.py --diagnose` with `LAST30DAYS_CONFIG_DIR=""` and no secrets.
4. Run one no-secret smoke query using only free/keyless sources and `--emit=json`.
5. Store raw output under a non-canonical staging path.
6. Write a Pritha wrapper that extracts source URLs and compact findings into a research report section.
7. Add tests that prove scaffold is blocked when external verification is required but missing.

Promotion criteria:

- read-only smoke passes without secrets;
- output shape is stable enough to parse;
- Pritha wrapper records source URLs, dates, backend and failures;
- no raw external content can write directly to curated memory;
- skill remains pinned and hash-audited;
- recurring mode has manual `run-now`, status and budget before any scheduler.

## Decision

Adopt the pattern, not the dependency yet.

Pritha should add a mandatory fresh external-verification step to child-agent research, and `last30days-skill` is a strong backend candidate for that step. It should remain candidate-only until a pinned, isolated pilot proves that it can run on the local Pritha host, produce parseable JSON, and integrate with Pritha's Markdown-first memory without bypassing evidence review.

## Next artifact

experiment
