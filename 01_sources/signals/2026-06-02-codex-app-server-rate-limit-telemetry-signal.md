---
id: 2026-06-02-codex-app-server-rate-limit-telemetry-signal
type: signal
status: refined
created: 2026-06-02
updated: 2026-06-11
topics:
  - codex-app-server
  - rate-limits
  - account-telemetry
  - agentic-ui
  - child-agents
tools:
  - Codex
  - Codex App Server
sources:
  - source-codex-app-server-rate-limit-telemetry-2026-06-02
related:
  reviews:
    - 03_reviews/2026-06-02-codex-app-server-rate-limit-telemetry-review.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-creation-harness.md
generated_from:
  - source-codex-app-server-rate-limit-telemetry-2026-06-02
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
source_type: docs
source_class: official-doc
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-codex-app-server-rate-limit-telemetry-2026-06-02
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pattern
  id: codex-app-server-rate-limit-telemetry
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Signal: Codex App-Server Rate Limit Telemetry

Date: 2026-06-02
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core Signal

A normal project running inside a Codex workspace should not assume it can read
the user's remaining ChatGPT/Codex subscription quota from environment
variables, public files or workspace state.

The documented route for programmatic account/rate-limit telemetry is a Codex
App Server integration. A client connected to `codex app-server` can use the
auth/account JSON-RPC surface:

- `account/read` for account and plan details;
- `account/updated` for auth/plan changes;
- `account/rateLimits/read` for ChatGPT rate limits;
- `account/rateLimits/updated` for rate-limit updates.

The rate-limit response can include `usedPercent`, `windowDurationMins`,
`resetsAt`, `planType`, `credits`, `rateLimitReachedType`, and multi-bucket
data keyed by `limitId`. A UI may present remaining headroom as
`100 - usedPercent`, but should label it as an estimate for the current quota
window, not a precise universal account balance.

## Practical Use For Pritha

When Pritha creates a child agent with a UI and the contract selects
`Codex surface profile: app-server`, Pritha should offer an optional account
telemetry widget:

- show current usage percent and reset time;
- show plan/credits only when returned by app-server;
- subscribe to `account/rateLimits/updated` instead of polling aggressively;
- hide unavailable data gracefully;
- never scrape local auth files or infer subscription from env vars.

This is most useful for:

- operator consoles;
- long-running Codex-controlled workflows;
- voice/UI shells that send deep tasks through Codex;
- child agents that need to pause, warn or ask before starting expensive turns.

## Boundaries

- Do not add this to ordinary child agents that only run inside a Codex
  workspace without app-server integration.
- Do not expose ChatGPT access tokens to browser UI.
- Do not store account emails, tokens or raw auth payloads in Pritha memory.
- Do not treat `usedPercent` as exact cost accounting.
- Do not require this telemetry for every Codex-native child agent.

## Candidate Rule

If `Codex surface profile` is `app-server`, ask whether the UI should include
Codex account/rate-limit telemetry. If yes, implement through app-server
`account/rateLimits/read` plus `account/rateLimits/updated`, with graceful
fallback when unavailable.
