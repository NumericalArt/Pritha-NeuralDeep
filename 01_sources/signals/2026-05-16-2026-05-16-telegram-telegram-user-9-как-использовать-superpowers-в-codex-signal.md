---
id: 2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal
type: signal
status: refined
created: 2026-05-16
updated: 2026-06-01
topics:
  - telegram
  - inbox
  - codex-workflow
  - agent-evals
  - acceptance-criteria
  - test-first-development
  - signal-extraction
tools:
  - telegram-bot
  - codex
  - superpowers
  - markdown
  - npm
  - agent
  - agents
  - llm
  - prompt
  - workflow
  - security
  - eval
  - test
  - lint
  - review
  - qa
  - source
sources:
  - source-218ada86-fc34-44a1-b610-9c7ddb31a6a5
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-16
processed_at: 2026-06-01T21:03:38.427Z
retention_status: source-purged
usefulness: medium
evidence_quality: uncertain
anonymous_source_id: source-218ada86-fc34-44a1-b610-9c7ddb31a6a5
generated_from:
  - source-218ada86-fc34-44a1-b610-9c7ddb31a6a5
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-218ada86-fc34-44a1-b610-9c7ddb31a6a5

Date: 2026-05-16
Status: refined
Source class: telegram
Retention: source-purged

Date: 2026-05-16
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- Полезный workflow для coding agents: сначала формализовать spec, MVP scope, user flows, constraints and acceptance criteria, затем отдельно подготовить tests/evals, и только после этого отдавать Codex implementation work.
- Главный принцип: агент-исполнитель не должен сам придумывать критерии проверки уже после написания кода. Проверки нужно вынести вперед как независимый контракт.
- Suggested loop: `Spec -> external tests/evals -> Codex plan -> failing tests -> implementation -> passing tests -> command verification`.
- Тестовые артефакты лучше хранить в репозитории как durable harness files: `docs/evals/`, `tests/`, `fixtures/`, `acceptance.md`.
- Финальная верификация должна быть командной, а не декларативной: `npm test`, `npm run lint`, smoke checks, eval run.
- Идея хорошо ложится на OpenAI harness engineering: prompts, tests, lints, docs and review agents become mechanical guardrails around coding agents.

## Technical details

- External QA/product-review pass should cover happy paths, invalid input, security/prompt-injection cases, UX edge cases, acceptance criteria and eval examples.
- Codex planning should explicitly map tests/spec to files, modules, verification commands and implementation order.
- Red-green loop is useful for agent work: create or import failing checks first, implement until checks pass, then run the full verification command set.
- Treat `/using superpowers` as brainstorming/spec-shaping input, not as a substitute for repository-local tests and eval fixtures.

## Agent design implications

- Для будущих coding-agent harnesses нужен стандарт: before implementation, define acceptance criteria and machine-checkable tests/evals.
- Для сложных задач стоит использовать независимый reviewer lens before coding: QA/product/security/eval design. В Techscope это можно делать самим в Codex thread или через subagent roles, без внешних сервисов.
- AGENTS.md или project workflow should instruct coding agents to ask for or create verification artifacts before touching production code.
- This signal is a candidate input for a future `agent-harness-engineering` or `test-first-agent-workflow` standard.

## Candidate rules

- Перед реализацией coding agent должен иметь spec, acceptance criteria and verification commands.
- Проверки должны быть repository artifacts where possible, not only chat text.
- Для agent-generated code prefer failing-test-first or eval-first workflow.
- Финальный ответ агента должен ссылаться на реально выполненные commands and results.
- Security/prompt-injection cases должны входить в eval/test design для agent-facing features.

## Noise removed

- Убраны intake metadata, служебные вопросы Techscope and raw Telegram details.
- Убрана зависимость от внешней модели как обязательное требование: для нашего проекта independent QA lens can be performed by Codex in-thread or configured subagents.
- Full Telegram post is not copied beyond the compact technical signal.

## Verification required

- Проверить, что термин `Superpowers` относится к конкретной Codex feature/workflow and whether it has official docs.
- Найти или создать examples of `docs/evals/`, `acceptance.md` and smoke checks in future real projects.
- Security lens required before adopting this as a standard for prompt-injection-sensitive workflows.

## Codex refinement notes

- Refined in Techscope thread using `07_workflows/prompts/signal-extraction-harness.md`.
- Strong recommendation: promote to brief/review if we decide to formalize test-first coding-agent workflow.
