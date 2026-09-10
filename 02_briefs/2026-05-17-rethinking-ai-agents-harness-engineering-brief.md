---
id: 2026-05-17-rethinking-ai-agents-harness-engineering-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-06-01
topics:
  - harness-engineering
  - coding-agents
  - agent-architecture
  - agent-evals
  - agent-safety
  - techscope
tools:
  - codex
  - claude
  - agents
  - workflows
  - evals
  - memory
  - guardrails
sources:
  - source-61e3b8a3-276b-4725-917b-4e6f2e01a99c
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.436Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-61e3b8a3-276b-4725-917b-4e6f2e01a99c
---

# Artifact: source-61e3b8a3-276b-4725-917b-4e6f2e01a99c

Date: 2026-05-17
Status: draft
Source class: telegram
Retention: source-purged

Date: 2026-05-17
Status: draft

## Summary

Видео `Rethinking AI Agents: The Rise of Harness Engineering` усиливает уже сохраненную идею OpenAI: в agent-first разработке главный объект проектирования - не только модель и не только prompt, а harness вокруг модели. Harness включает инструкции, tools, orchestration, memory/state, permissions, validation, traces, evaluator loops, queues and completion rules.

Практический вывод для Techscope: наш проект уже является harness для knowledge/intake agent. Его нужно описывать, тестировать и упрощать как инженерную систему.

## Key claims

- `Agent = model + harness`; качество агента может меняться сильнее от harness, чем от выбора модели.
- Harness должен быть явным: если логика размазана по prompt, controller code, скриптам и человеческим привычкам, ее невозможно нормально сравнить и улучшать.
- Natural-language harnesses интересны, если они становятся исполнимыми контрактами, а не просто длинными инструкциями.
- Durable file-backed state снижает риск потери контекста, особенно при restart, delegation and long-running workflows.
- Не всякая дополнительная структура полезна: verifiers, multi-candidate search and extra tools могут ухудшать стоимость, latency and reliability.
- Прогресс harness engineering часто выглядит как pruning: убрать лишний инструмент, лишний reset, лишний evaluator, лишнюю ветку.

## Evidence

- NLAH paper: arXiv `2603.25723`, published 2026-03-26, supports the claim that harness control logic can be externalized as portable natural-language artifacts with a runtime.
- AutoHarness paper: arXiv `2603.03329`, supports automatic code harness synthesis as a research direction.

## Risks and caveats

- The video is a secondary synthesis. Use it for scouting and hypothesis formation, not as final evidence.
- Portable harnesses increase security risk: prompt injection in harness text, malicious shared skills, unsafe tool bundles and hidden permission escalation.
- "Harness matters more than model" is directionally useful, but should not become dogma. Model upgrades can invalidate old harness assumptions.

## Recommendation

Create a Techscope experiment/review for `agent-harness-engineering`:

- inventory current Techscope harness components;
- define completion contracts for Telegram/media/wiki workflows;
- add one local ablation: remove or simplify a harness component and measure quality/cost/time;
- add one mechanical guardrail where we currently rely on text instructions;

## Next step

review | experiment
