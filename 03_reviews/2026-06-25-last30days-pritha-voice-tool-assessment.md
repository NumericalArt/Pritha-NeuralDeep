---
id: 2026-06-25-last30days-pritha-voice-tool-assessment
type: assessment
status: accepted
created: 2026-06-25
updated: 2026-06-25
topics:
  - pritha-voice-control
  - external-research
  - agent-skills
  - knowledge-freshness
  - realtime-tools
tools:
  - last30days-skill
  - OpenAI Realtime API
  - gpt-realtime-2
  - Pritha Control Center
  - Codex
  - Python
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - Codex App
runtime_environment:
  - local-project
  - mac
  - control-center
config_surfaces:
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - scripts/external-research-tools.mjs
  - scripts/agents-mother/external-research-last30days.mjs
  - tools/external-research/last30days-lock.json
  - 07_workflows/2026-06-23-last30days-external-research-backend-runbook.md
portability: adapter-needed
sources:
  - https://github.com/mvanhorn/last30days-skill
  - https://github.com/mvanhorn/last30days-skill/tree/d5f3083b826c2187d6b0218224f2a8c5402f89f4
  - https://github.com/mvanhorn/last30days-skill/blob/d5f3083b826c2187d6b0218224f2a8c5402f89f4/skills/last30days/SKILL.md
  - https://github.com/mvanhorn/last30days-skill/blob/d5f3083b826c2187d6b0218224f2a8c5402f89f4/CONFIGURATION.md
  - https://github.com/mvanhorn/last30days-skill/blob/d5f3083b826c2187d6b0218224f2a8c5402f89f4/CHANGELOG.md
  - https://github.com/mvanhorn/last30days-skill/blob/d5f3083b826c2187d6b0218224f2a8c5402f89f4/mcp/README.md
  - 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
  - 07_workflows/2026-06-23-last30days-external-research-backend-runbook.md
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/agent-untrusted-input-security.md
related:
  reviews:
    - 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
  workflows:
    - 07_workflows/2026-06-23-last30days-external-research-backend-runbook.md
    - 07_workflows/2026-06-25-pritha-last30days-voice-tool-plan.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-01-15
source_updated: 2026-06-25
source_version: upstream last30days-skill v3.8.3 at d5f3083b826c2187d6b0218224f2a8c5402f89f4; Pritha pinned backend updated to v3.8.3 at d5f3083b826c2187d6b0218224f2a8c5402f89f4 for recent_external_research
retrieved: 2026-06-25
verified: 2026-06-25
valid_for: Pritha gpt-realtime-2 voice-control tool planning as of 2026-06-25
temporal_status: version-bound
recommendation: experiment
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - governance
subject:
  kind: tool
  id: last30days-pritha-voice-tool
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Assessment: last30days as Pritha Voice Tool

Date: 2026-06-25
Status: accepted and implemented for the public no-secret voice path
Recommendation: keep as an experimental eighth voice tool behind a Pritha-native adapter, not as raw skill instructions in the Realtime prompt.

## One-paragraph read

`mvanhorn/last30days-skill` is useful enough to become Pritha Voice Control's eighth tool, but the voice integration should be a narrow server-side research tool, not a direct `/last30days` skill invocation by `gpt-realtime-2`. The best shape is `recent_external_research`: voice collects a short query and source window, the server runs the pinned Python backend in a sanitized environment, and Realtime receives a bounded research brief plus a private artifact path. "Bounded" does not mean a two-sentence answer: it means enough structured findings for Pritha to give a useful spoken answer, while excluding raw clusters, huge JSON, transcripts, secret-bearing environment details and low-value noise. This preserves Pritha's voice pattern: Realtime is a dispatcher, deterministic server tools own local execution, and Codex/deep-task lanes handle broader synthesis when needed.

## Current-source snapshot

- Upstream checked: `mvanhorn/last30days-skill` main commit `d5f3083b826c2187d6b0218224f2a8c5402f89f4`, committed `2026-06-25T15:57:11-07:00`, version `3.8.3`.
- Pritha backend has been updated to the same upstream pin: `d5f3083b826c2187d6b0218224f2a8c5402f89f4`, version `3.8.3`.
- Runtime requirement: Python `>=3.12`; Pritha currently has local Python `3.13.14` under `.tools/python`.
- Upstream changes since Pritha's earlier 2026-06-22 assessment include `3.8.1`, `3.8.2` and `3.8.3`, especially consent-driven first-run onboarding, security workflow improvements, MCP test coverage, Codex-visible citation rendering, and improved keyless Reddit/dedicated-subreddit behavior.

## Usability Check

Direct user-facing use is good after setup, but not "small". The repository is a full multi-source research engine with a long `SKILL.md`, Python CLI, optional MCP wrapper, many source backends and a consent-heavy first-run flow.

Strengths:

- CLI help is clear and practical: `--emit=json`, `--quick`, `--days`, `--as-of`, `--search`, `--plan`, `--no-browser-cookies`, `--preflight`, `--diagnose`.
- `--preflight --emit=json` is excellent for Pritha readiness checks because it reports planned reads, writes, credentials, external commands and source availability without running research.
- In a sterile no-secret test (`PATH=`, `FROM_BROWSER=off`, no config, no store), preflight returned `safe: true` and no credentials present.
- A real `--emit=json --quick` run completed in about `22.4s` and returned structured source/candidate data.

Weaknesses:

- Without `--plan`, the engine warns that the hosting model should generate a query plan. The deterministic fallback works, but quality drops for named entities and subtle topics.
- Without X/YouTube credentials/tools, quality was only `3/5 core sources`; Reddit keyless retrieval can still produce noisy zero-relevance matches.
- If `PATH` is left open, preflight can detect `gh` and infer GitHub auth from the user's existing host session. That is unacceptable for default voice runs.
- The native skill output contract is very long and formatting-heavy; loading it into Realtime would be expensive and fragile.

Usability score:

- Direct human or Codex skill use: `7/10`.
- Pritha voice use through a narrow adapter: `8/10`.
- Raw direct Realtime tool invocation: `4/10`.

## Voice-control Fit

Good fit:

- "What changed in the last 7/30 days about X?"
- Fresh community/social/release pulse before Pritha changes a standard, agent contract or scaffold.
- Current-source evidence section for child-agent research gates.
- Quick weak-signal scan before deciding whether a deeper Codex task is worth starting.

Poor fit:

- Official documentation verification by itself.
- Security, legal, medical or financial decisions without primary-source follow-up.
- Private-account research, browser-cookie scraping or paid deep-research from voice without a UI approval gate.
- Synchronous spoken answer paths where a 20-180 second run would freeze the conversation.

## Recommended Tool Boundary

Add an eighth Realtime tool named `recent_external_research` or `research_last30days`.

The tool should be:

- read-only by default;
- asynchronous for normal runs;
- sanitized by default: `FROM_BROWSER=off`, `CODEX_AUTH_FILE=/dev/null`, `LAST30DAYS_CONFIG_DIR=""`, no global memory/store, no host `PATH` unless explicitly enabled;
- source-allowlisted by default: `reddit,hackernews,polymarket,grounding`;
- JSON-only internally;
- bounded-brief back to Realtime: concise enough for voice context, but rich enough for a meaningful spoken answer;
- raw-output/artifact stored under `.private/` or `.tools/`, never curated memory directly;
- able to escalate to `run_codex_task` for primary-source verification or standards updates.

Do not expose upstream MCP as the first integration. The MCP wrapper is useful evidence that a tool boundary exists, but Pritha already has a Node/Python adapter and stronger local sanitation rules.

## Security Notes

- External content is untrusted input. Last30days results must not directly update Markdown memory, tools, standards or decisions.
- Browser cookies, `gh` auth, ScrapeCreators, X, Perplexity, OpenRouter and other paid/private sources must be opt-in with UI-visible approval.
- `--publish-html`, `--store`, global `LAST30DAYS_MEMORY_DIR` writes and setup/onboarding commands are out of scope for the default voice tool.
- Default timeout should be capped, e.g. 45-90 seconds for voice quick mode and 180 seconds only when the operator asks for deeper research.
- Realtime should hear a voice-ready brief with main findings, source coverage, confidence and missing-source warnings, not raw clusters or long JSON.

## Decision

Proceed with an experimental eighth tool. The implementation reuses Pritha's existing external-research backend, updates the pin to upstream `3.8.3` after a focused regression run, and exposes a new voice-safe wrapper rather than broadening `run_codex_task` or injecting the full skill contract into `gpt-realtime-2`.

## Next artifact

`07_workflows/2026-06-25-pritha-last30days-voice-tool-plan.md`
