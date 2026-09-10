---
id: review-2026-06-02-codex-app-server-rate-limit-telemetry
type: review
status: draft
created: 2026-06-02
updated: 2026-06-02
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
  - https://developers.openai.com/codex/app-server
related:
  signals:
    - 01_sources/signals/2026-06-02-codex-app-server-rate-limit-telemetry-signal.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-02
source_updated: 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha child-agent UI and Codex app-server integration decisions
temporal_status: current
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
source_type: docs
source_class: official-doc
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
recommendation: standard-update
---

# Review: Codex App-Server Rate Limit Telemetry

## One-Paragraph Read

This is a useful Pritha pattern, but only for descendants that integrate with
Codex through `codex app-server`. The official Codex App Server docs expose an
auth/account surface with `account/rateLimits/read` and
`account/rateLimits/updated`, and the payload includes quota-window fields such
as `usedPercent`, `windowDurationMins` and `resetsAt`, with optional plan and
credit details when available. This should become an optional operator-console
or rich-UI capability, not a global assumption about every Codex workspace
project. The safe default is to avoid env/file scraping and show quota telemetry
only when the contract selected app-server and the connected server returns the
data.

## Source Verdict

| Source | Verdict | Use |
| --- | --- | --- |
| OpenAI Codex App Server docs | adopt | Official protocol/auth/rate-limit surface and JSON-RPC method names. |

## Implementation Guidance

- Add contract fields for Codex account/rate-limit telemetry.
- Default telemetry to `none`.
- Enable it only when `Codex surface profile` is `app-server` or an equivalent
  app-server-backed integration.
- Read initial data with `account/rateLimits/read`.
- Subscribe to `account/rateLimits/updated` for live UI updates.
- Render missing `planType`, `credits` or secondary buckets as unavailable, not
  as zero.
- Treat `100 - usedPercent` as remaining window headroom, not as a universal
  subscription balance.

## Security And Privacy Notes

- Do not pass ChatGPT tokens into browser widgets.
- Do not persist account emails, tokens or raw auth payloads in tracked memory.
- Keep app-server transport local or authenticated when exposed over WebSocket.
- Do not infer rate limits from `CODEX_HOME`, auth files, environment variables
  or undocumented local state.

## Promotion Guidance

Promote to `agent-interface-experience` and the agent contract template as an
optional UI telemetry module. Do not create a separate mandatory subsystem until
Pritha has at least one real child agent using app-server-backed UI.
