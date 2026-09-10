---
id: 2026-08-09-agent-runtime-control-plane-research-intake
type: intake
status: processed
created: 2026-08-09
updated: 2026-08-09
topics:
  - agent-runtime
  - control-plane
  - mcp
  - agent-skills
  - long-running-agents
  - agent-memory
  - agent-evaluation
tools:
  - MCP
  - Codex
  - Google Managed Agents
  - Anthropic Managed Agents
  - LangChain Deep Agents
sources:
  - source-2026-08-09-agent-runtime-control-plane-research
related:
  signals:
    - 01_sources/signals/2026-08-09-agent-runtime-control-plane-signal.md
  assessments:
    - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
supersedes: []
superseded_by: []
memory_domain: source-material
memory_domains:
  - source-material
  - agent-building-knowledge
subject:
  kind: research-batch
  id: agent-runtime-control-plane-2026-08
privacy: internal
retention: source-purged
review_status: processed
confidence: medium
source_type: pasted-research
source_class: user-provided
received_at: 2026-08-09
processed_at: 2026-08-09
retention_status: source-purged
anonymous_source_id: source-2026-08-09-agent-runtime-control-plane-research
---

# Intake: Agent Runtime and Control Plane Research

## Context

Пользователь передал исследовательскую подборку о новых runtime-паттернах,
протоколах, managed-agent платформах, skill/plugin packaging, памяти и
benchmark-подходах для возможного использования Pritha при создании новых
агентов.

Исходный материал содержал как проверяемые технические утверждения, так и
ссылочно неполные или смешанные описания нескольких экосистем. Поэтому он не
используется напрямую как стандарт: каждый существенный тезис проверен по
официальной документации, статье или исходному коду.

## Initial Hypothesis

Наиболее переносимая ценность материала — не конкретный managed-agent vendor,
а общий control-plane слой:

- versioned execution ledger;
- typed pause/resume and budget state;
- policy hooks outside the executor;
- independent completion evidence;
- workspace revision freshness;
- lifecycle-scoped memory;
- fail-closed skill and plugin activation;
- MCP 2026-07-28 compatibility boundary.

## Processing Result

- факты и версии сверены с первичными источниками;
- доступный код проверен без установки и исполнения внешних проектов;
- подтвержденные паттерны сопоставлены с текущими стандартами Pritha;
- спорные тезисы сохранены как `unverified`, а не как знание;
- создан curated assessment и точечные обновления стандартов.

Raw attachment, исходный путь и входящая provenance-информация не сохраняются в
tracked knowledge.
