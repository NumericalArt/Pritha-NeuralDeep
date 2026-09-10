---
id: 2026-05-15-memory-architecture
type: decision
status: accepted
created: 2026-05-15
updated: 2026-05-15
topics: [memory, knowledge-base, semantic-search, graph, obsidian, sqlite]
tools: [markdown, obsidian, sqlite]
sources:
  - 03_reviews/2026-05-15-knowledge-memory-database-architecture.md
related:
  workflows:
    - 07_workflows/memory-implementation-roadmap.md
---

# Decision: memory architecture

## Context

Проекту нужна долговременная память для исследований, переработанных выводов, фич, стандартов и решений. Память должна быть удобна человеку, Codex-агенту, будущему семантическому поиску и переносу знаний в другие проекты.

Рассматривались варианты:

- только Markdown/Obsidian;
- SQLite как основное хранилище;
- dedicated vector DB;
- graph DB как основное хранилище;
- гибридная архитектура.

## Decision

Используем гибридную архитектуру:

```text
Markdown files as source of truth
        +
YAML frontmatter for machine-readable metadata
        +
SQLite sidecar index for metadata, FTS, relations and embeddings
        +
Obsidian as optional human UI
```

Graph DB не внедряем на первом этапе. Граф связей сначала моделируется через Markdown links, frontmatter и таблицу `relations` в SQLite.

## Consequences

Плюсы:

- знания остаются читаемыми и редактируемыми как Markdown;
- Git-история остается простой;
- Obsidian можно подключить без миграции;
- SQLite index можно удалить и пересоздать;
- vector search и graph-like relations можно добавить постепенно.

Минусы:

- нужно поддерживать дисциплину frontmatter;
- потребуется индексатор Markdown -> SQLite;
- advanced graph queries появятся не сразу;
- возможна синхронизация между Markdown и индексом, если индексатор будет неидемпотентным.

## Alternatives considered

- Obsidian only: удобно для человека, недостаточно для воспроизводимой агентной памяти и semantic search.
- SQLite as source of truth: машинно удобно, но хуже для ручного чтения, Git и переносимости.
- Dedicated vector DB first: преждевременно для текущего объема знаний.
- Graph DB first: мощно, но риск рано зацементировать неправильную модель связей.

## Review date

2026-06-15

