---
id: 2026-05-17-2026-05-17-telegram-telegram-user-33-codex-находка-кодекс-может-задавать-вопросы-не-только-в--signal
type: signal
status: refined
created: 2026-05-17
updated: 2026-06-01
topics:
  - telegram
  - inbox
  - signal-extraction
tools:
  - telegram-bot
  - agent
  - agents
  - llm
  - codex
  - tool
  - workflow
  - review
  - source
sources:
  - source-dc46cb35-8fe2-4cbf-a340-9e03d67e0153
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.429Z
retention_status: source-purged
usefulness: medium
evidence_quality: uncertain
anonymous_source_id: source-dc46cb35-8fe2-4cbf-a340-9e03d67e0153
generated_from:
  - source-dc46cb35-8fe2-4cbf-a340-9e03d67e0153
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-dc46cb35-8fe2-4cbf-a340-9e03d67e0153

Date: 2026-05-17
Status: refined
Source class: telegram
Retention: source-purged

Date: 2026-05-17
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- Claimed Codex config option: `[features] default_mode_request_user_input = true` may allow Codex to ask interactive questions outside `/plan` mode.
- This is potentially useful for agent workflows because it makes clarification questions available during execution, not only during planning.
- Local verification did not find this option in the current `~/.codex/config.toml`; treat as an unverified feature flag until tested in a controlled session or confirmed by official docs/release notes.
- The architectural signal is stronger than the specific flag: agent harnesses should define when the agent may interrupt for human clarification versus proceed autonomously.

## Technical details

- Current local config does not set `default_mode_request_user_input`.
- `request_user_input` exists as a tool in this environment, but tool availability is mode/context-dependent.
- Do not make this a Techscope standard until verified in the exact Codex CLI/app version we use.

## Agent design implications

- Add a future rule category: clarification policy. Define when agents should ask, continue, or make a conservative assumption.
- For coding agents, interactive questions are useful before irreversible edits, unclear product choices or high-cost experiments.

## Candidate rules

- Codex feature flags must be verified locally before being adopted.
- Agent harnesses should include an explicit "ask vs act" policy.
- Clarification questions are a tool, not a default behavior; over-asking can break autonomy.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Test `default_mode_request_user_input = true` in a disposable Codex config/session before documenting it as supported.
- Search official OpenAI/Codex release notes or docs before standardizing.

## Codex refinement

- Done on 2026-05-17 during Telegram backlog cleanup.
