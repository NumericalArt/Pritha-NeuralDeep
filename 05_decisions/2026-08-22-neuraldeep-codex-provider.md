---
id: 2026-08-22-neuraldeep-codex-provider
type: decision
status: accepted
created: 2026-08-22
updated: 2026-08-22
topics:
  - pritha
  - codex
  - neuraldeep
  - model-providers
  - responses-api
tools:
  - Codex CLI
  - NeuralDeep API
  - macOS Keychain
sources:
  - https://learn.chatgpt.com/docs/config-file/config-advanced
  - https://learn.chatgpt.com/docs/config-file/config-reference
  - https://developers.openai.com/api/reference/resources/responses/methods/create
  - https://neuraldeep.ru/llms-full.txt
  - operator-live-compatibility-tests-2026-08-22
related:
  intakes: []
  briefs: []
  reviews: []
  standards:
    - 04_standards/agent-creation-harness.md
  workflows:
    - docs/neuraldeep-codex.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-22
source_updated: 2026-08-22
source_version: Codex CLI 0.135.0 and NeuralDeep public API observed 2026-08-22
retrieved: 2026-08-22
verified: 2026-08-22
valid_for: Pritha NeuralDeep transport architecture from 2026-08-22
temporal_status: current
review_date: 2026-09-22
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
subject:
  kind: decision
  id: neuraldeep-codex-provider
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: Keep Codex and Adapt NeuralDeep Responses

Date: 2026-08-22
Status: accepted

## Context

Pritha is Codex-native. NeuralDeep exposes OpenAI-compatible Chat Completions
and Responses endpoints and offers economical models, but its current Responses
SSE is not fully compatible with Codex: tool-call events work, while assistant
text is attached to a reasoning item and the message lifecycle is omitted. The
correct final message remains available in `response.completed.output`.

## Decision

- Keep stock, open-source Codex as the agent harness; do not replace it with a
  cheaper model or maintain a Codex fork at this stage.
- Run this work in the independent `Pritha-NeuralDeep` repository with its own
  external state root and future GitHub remote.
- Configure NeuralDeep as a custom Codex Responses provider.
- Put a small loopback-only compatibility adapter between Codex and NeuralDeep.
  Rebuild only the missing assistant-message lifecycle from the canonical
  completed response; preserve reasoning and tool-call events.
- Read the bearer token on demand from macOS Keychain using Codex command-backed
  authentication. Never write it to Git or generated TOML.
- Begin with the verified `qwen3.6-35b-a3b` and `gpt-oss-120b` models and keep
  default harness concurrency at two or lower while using the free tariff.
- Do not reroute existing Control Center or Voice execution until their provider
  path has separate integration and regression coverage.

## Consequences

- Existing Pritha architecture and Codex tool semantics remain reusable.
- The provider can be removed or upgraded without merging a Codex fork.
- Responses are currently buffered for normalization, so token streaming is
  delayed until completion.
- Provider-side schema or event changes may require adapter updates and live
  compatibility tests.
- NeuralDeep model behavior, tool reliability, context limits, quotas and data
  handling remain provider-dependent and require evaluation before production.

## Alternatives considered

- Direct Codex-to-NeuralDeep Responses: rejected for now because completed text
  is lost by Codex despite a successful process exit.
- Chat Completions inside stock Codex: unavailable because custom Codex
  providers use the Responses wire API.
- Maintain a Codex fork: deferred; it adds a long-term merge and security burden
  for a defect that can be isolated at the transport boundary.
- Replace Codex with OpenCode or a custom harness: viable fallback if broader
  NeuralDeep compatibility is needed, but it would discard Pritha's Codex-native
  assumptions and require more migration work.

## Temporal basis

- Source published: 2026-08-22
- Source updated: 2026-08-22
- Source version: Codex CLI 0.135.0 and NeuralDeep API observed 2026-08-22
- Retrieved: 2026-08-22
- Verified: 2026-08-22
- Valid for: Pritha NeuralDeep transport architecture from 2026-08-22
- Freshness status: current
- Temporal status: current
- Supersedes: none
- Superseded by: none

## Review date

2026-09-22
