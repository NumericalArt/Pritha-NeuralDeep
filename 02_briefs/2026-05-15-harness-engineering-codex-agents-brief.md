---
id: 2026-05-15-harness-engineering-codex-agents-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-06-01
topics:
  - harness-engineering
  - coding-agents
  - agent-memory
  - agent-evals
  - ci
  - dx
  - software-engineering
tools:
  - codex
  - agents-md
  - lint
  - ci
  - playwright
  - zod
  - pnpm
  - chrome-devtools
  - openai
sources:
  - source-56805a57-e063-4b1b-b547-4d8a4fbf78b9
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-15
processed_at: 2026-06-01T21:03:38.433Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-56805a57-e063-4b1b-b547-4d8a4fbf78b9
---

# Artifact: source-56805a57-e063-4b1b-b547-4d8a4fbf78b9

Date: 2026-05-15
Status: draft
Source class: video
Retention: source-purged

Date: 2026-05-15
Status: draft

## Summary

Ryan Lopopolo описывает harness engineering как инженерную дисциплину вокруг coding agents: человек больше не должен быть главным производителем кода, а должен проектировать среду, инструкции, guardrails, CI feedback loops, review agents, repo structure и проверяемые acceptance criteria, чтобы агенты могли выполнять полный цикл разработки. Главный сдвиг: implementation становится дешевой и параллелизуемой, а дефицитными ресурсами становятся human time, human/model attention и context window.

## Key claims

- В agent-first workflow код перестает быть главным дефицитом; дефицитными становятся внимание, контекст, качество спецификации и feedback loops.
- Важны не только prompts, но и все места, где агент получает управляемый feedback: `AGENTS.md`, rules files, skills, lint errors, test failures, review-agent comments, QA plans, runbooks.
- Репозиторий должен быть legible для агента: единообразные patterns, маленькие локальные domains, явные public/private boundaries, shared utilities, предсказуемые scripts and CI.
- Human review нужно переводить из повторяющихся комментариев в durable docs, lint rules, tests and reviewer agents.
- Ошибки агентов и людей нужно группировать в классы и устранять системно, например через weekly garbage collection day.
- Агент должен входить в workflow как разработчик: через ticket, локальные tools, devtools, observability, tests and acceptance criteria.

## Evidence

- Видео: AI Engineer talk by Ryan Lopopolo, OpenAI.

## Why it matters for Techscope

Это один из самых сильных материалов для нашей миссии на текущий момент. Он напрямую превращается в правила для будущих coding agents:

- проектировать репозитории как agent-readable systems;
- хранить durable instructions and standards рядом с кодом;
- превращать повторяющиеся review comments в автоматические checks;
- использовать reviewer agents по ролям;
- создавать harness layer: skills, local tooling, observability, browser/devtools control, CI feedback;
- считать человеческое внимание главным bottleneck.

## Risks and caveats

- Тезис "code is free" опасно понимать буквально: production risk, maintenance semantics, security and ownership никуда не исчезают.
- Практика OpenAI может опираться на модели, tooling и token budgets, недоступные маленьким проектам.
- Нужны локальные эксперименты: насколько наши проекты готовы к agent-first structure.
- Автоматизация review не должна выключать human accountability для security, privacy, product decisions and architecture.

## Recommendation

Создать отдельный review/experiment: `agent-harness-engineering-for-techscope`.

Минимальный эксперимент для ближайшего проекта:

- определить `AGENTS.md` as durable harness contract;
- добавить role-based review checklist: security, reliability, DX, product;
- описать "what good looks like" для QA plan;
- проверить, улучшает ли это качество Codex outputs и снижает ли ручной review.

## Next step

review | experiment
