---
id: 2026-05-16-2026-05-15-openai-harness-engineering-source-note-signal
type: signal
status: extracted
created: 2026-05-16
updated: 2026-06-01
topics:
  - harness-engineering
  - codex
  - coding-agents
  - agent-first-development
  - repository-knowledge
  - agent-legibility
  - signal-extraction
tools:
  - codex
  - agents-md
  - ci
  - lint
  - chrome-devtools
  - observability
  - openai
  - agent
  - agents
  - tool
  - tools
  - workflow
  - architecture
  - test
  - guardrail
  - auth
  - metric
  - trace
  - review
  - qa
sources:
  - source-479cb135-6fa0-4b4b-b497-ce90948466f9
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-16
processed_at: 2026-06-01T21:03:38.426Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-479cb135-6fa0-4b4b-b497-ce90948466f9
generated_from:
  - source-479cb135-6fa0-4b4b-b497-ce90948466f9
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-479cb135-6fa0-4b4b-b497-ce90948466f9

Date: 2026-05-16
Status: extracted
Source class: video
Retention: source-purged

Date: 2026-05-16
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- Local dev environment должен быть driveable by agents: app boot per worktree, browser/devtools access, logs, metrics, traces.
- Guardrails должны быть механическими: linters, CI jobs, structural tests, review agents.
- Он важнее YouTube-видео как evidence base, потому что фиксирует практику команды OpenAI: agent-first development with Codex, repository-local knowledge, mechanical guardrails, review agents, CI feedback loops and agent-legible architecture.
- Статья описывает эксперимент OpenAI: команда строила и выпускала внутренний продукт, где весь код, тесты, CI, документация, observability and tooling создавались Codex agents.
- `AGENTS.md` должен быть картой, а не огромной энциклопедией.
- Глубокое знание проекта должно жить в repository-local Markdown/docs, доступных агенту.
- Agent legibility является архитектурной целью: если знание не доступно агенту в репозитории, для агента оно фактически не существует.
- Ошибки и review feedback нужно превращать в durable docs или executable checks.
- Human judgment остается важным, но должен применяться на уровне приоритетов, acceptance criteria, архитектурных ограничений и проверки результата.

## Technical details

- YouTube-видео `am_oeAoUhew` согласуется с тезисами статьи, но должно рассматриваться как выступление/дополнительный контекст, а не единственное основание.
- Нужно ли создать отдельный стандарт `agent-harness-engineering.md`?

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Local dev environment должен быть driveable by agents: app boot per worktree, browser/devtools access, logs, metrics, traces.
- Guardrails должны быть механическими: linters, CI jobs, structural tests, review agents.
- `AGENTS.md` должен быть картой, а не огромной энциклопедией.
- Глубокое знание проекта должно жить в repository-local Markdown/docs, доступных агенту.
- Ошибки и review feedback нужно превращать в durable docs или executable checks.
- Human judgment остается важным, но должен применяться на уровне приоритетов, acceptance criteria, архитектурных ограничений и проверки результата.
- YouTube-видео `am_oeAoUhew` согласуется с тезисами статьи, но должно рассматриваться как выступление/дополнительный контекст, а не единственное основание.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Проверить security implications отдельно перед стандартом.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- После refinement обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.
