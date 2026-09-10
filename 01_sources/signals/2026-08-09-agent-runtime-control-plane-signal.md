---
id: 2026-08-09-agent-runtime-control-plane-signal
type: signal
status: refined
created: 2026-08-09
updated: 2026-08-09
topics:
  - agent-runtime
  - control-plane
  - long-running-agents
  - mcp
  - agent-skills
  - agent-evaluation
tools:
  - Pritha
  - MCP
  - Codex
sources:
  - 00_inbox/texts/2026-08-09-agent-runtime-control-plane-research-intake.md
related:
  assessments:
    - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
  standards:
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-mcp-connector-lifecycle.md
    - 04_standards/agent-skill-pack-lifecycle.md
generated_from:
  - 00_inbox/texts/2026-08-09-agent-runtime-control-plane-research-intake.md
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
supersedes: []
superseded_by: []
memory_domain: source-material
memory_domains:
  - source-material
  - agent-building-knowledge
subject:
  kind: pattern
  id: agent-runtime-control-plane
privacy: internal
retention: durable
review_status: refined
confidence: high
verified: 2026-08-09
---

# Signal: Agent Runtime Control Plane

## Signal

Для долгоживущего агента недостаточно сильной модели, длинного контекста и
проверок отдельных tool calls. Надежность определяется отдельным control plane,
который хранит проверяемое состояние работы, связывает действия с актуальной
ревизией мира, применяет ограничения независимо от executor и принимает
завершение только по внешним доказательствам.

## Confirmed Direction

Pritha уже содержит большую часть этого направления в стандарте trajectory
control. Новые источники усиливают и конкретизируют четыре требования:

1. `execution ledger` должен различать утверждения агента и проверенные факты;
2. доказательство должно быть привязано к `workspace_revision` или другому
   идентификатору наблюдаемого состояния;
3. pause/resume/input-required/budget-exhausted должны быть типизированными
   состояниями, а не свободным текстом;
4. skills, hooks, MCP metadata и plugin manifests являются supply-chain и
   policy surfaces, а не доверенными инструкциями.

## Important Corrections

- MCP 2026-07-28 действительно переводит базовое взаимодействие к stateless
  request model и добавляет MRTR/Tasks extensions, но требует version-aware
  adapters during migration.
- Google Agent Hooks документированы как fail-open при сбое hook; они не могут
  быть единственным security boundary.
- LangChain Managed Deep Agents остаются private beta в проверенных официальных
  материалах, а не public beta.
- Текущий OpenAI plugin manifest находится в `.codex-plugin/plugin.json`;
  корневой `plugin.json` относится к другой plugin ecosystem и не является
  универсальным форматом.
- Некоторые названия и метрики из исходной подборки не удалось подтвердить;
  они не должны влиять на scaffold defaults.

## Recommended Use

Использовать сигнал при проектировании child agents, которые:

- работают долго или между сессиями;
- переживают внешние изменения workspace;
- исполняют skills/plugins из внешних источников;
- используют MCP 2026-07-28 servers or extensions;
- требуют независимого audit/completion gate.

Не создавать отдельный тяжелый control-plane продукт для простых локальных
read-only задач.
