---
id: 2026-06-20-openai-codex-goals-source-note
type: source-note
status: processed
created: 2026-06-20
updated: 2026-06-20
topics:
  - codex
  - goals
  - agent-harness
  - long-running-work
  - evidence-based-completion
tools:
  - Codex
  - Codex Goals
  - OpenAI Cookbook
  - Codex Manual
sources:
  - source-03e44633-53b6-4273-9e28-dbdf11d05b5e
related:
  intakes:
    - 00_inbox/links/2026-05-21-openai-codex-goals-intake.md
  assessments:
    - 03_reviews/2026-05-21-openai-codex-goals-assessment.md
  standards:
    - 04_standards/codex-goals-for-long-running-agent-work.md
  signals:
    - 01_sources/signals/2026-05-17-2026-05-17-telegram-telegram-user-45-codex-desktop-cli-поддерживает-режим-копать-отсюда-до-об-signal.md
source_type: document
source_class: official-docs
ingested_at: 2026-06-20T00:00:00-07:00
processed_at: 2026-06-20T00:00:00-07:00
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-03e44633-53b6-4273-9e28-dbdf11d05b5e
agent_platforms:
  - Codex
model_context:
  - Codex app, IDE extension and CLI builds supporting Goals
runtime_environment:
  - codex-thread
  - codex-app
  - codex-ide-extension
  - codex-cli
config_surfaces:
  - /goal
  - features.goals
  - config.toml
  - thread goal state
portability: codex-native
source_published: 2026-05-09
source_updated: 2026-05-13
source_version: OpenAI Cookbook page published 2026-05-09; source notebook commit 9b4e6279edd4dceb6b4b7da582482a7c882f7544 on 2026-05-13; Codex manual fetched 2026-06-20
retrieved: 2026-06-20
verified: 2026-06-20
valid_for: Codex Goal mode as documented on 2026-06-20 for builds supporting Goals from 0.128.0 onward
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: source-note
  id: openai-codex-goals
privacy: public
retention: source-purged
review_status: processed
confidence: high
---

# Source Note: OpenAI Codex Goals

Date: 2026-06-20
Status: processed
Source class: official-docs
Retention: source-purged

## Public references checked

- OpenAI Developers Cookbook: `Using Goals in Codex`, dated 2026-05-09.
- OpenAI Cookbook GitHub source notebook: `examples/codex/using_goals_in_codex.ipynb`, latest path commit `9b4e6279edd4dceb6b4b7da582482a7c882f7544`, committed 2026-05-13 with verified GitHub signature.
- Current Codex manual fetched through the `openai-docs` Codex manual helper on 2026-06-20.

## Verification summary

- The Cookbook describes Goals as persistent, thread-scoped completion contracts for work where the next step depends on evidence gathered during the task.
- The current Codex manual independently confirms Goal mode, `/goal`, `features.goals`, the app/IDE/CLI command surfaces, pause/resume/clear lifecycle controls and the guidance to use `/plan` first when the goal needs shaping.
- The manual confirms that goal text is both the starting prompt and completion criteria, and that goals should include measurable outcome or test criteria.
- The CLI slash-command documentation in the current manual says goal objectives must be non-empty and at most 4,000 characters; longer instructions should live in a file referenced by the goal.
- This resolves the older local uncertainty around whether `/goal` and `features.goals` were official product behavior.

## Relationship to existing knowledge

- Confirms and refreshes `03_reviews/2026-05-21-openai-codex-goals-assessment.md`.
- Refreshes `04_standards/codex-goals-for-long-running-agent-work.md` without changing its core recommendation.
- Supersedes the unresolved verification item in the older Telegram-derived signal about `[features] goals = true`.
- Refines the Hermes goal-loop brief by making the Codex-native semantics official: Codex Goals are thread-scoped state and conservative continuation, not generic background autonomy.

## Durable follow-up

- Use the standard for Pritha/Techscope long-running Codex tasks.
- Recheck official docs before changing command syntax, lifecycle assumptions, budget handling or app/CLI availability.
- Do not use Goals as a substitute for `AGENTS.md`, workflows, explicit tool permissions or deployment approval gates.
