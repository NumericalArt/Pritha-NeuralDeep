---
id: memory-implementation-roadmap
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-15
topics: [memory, roadmap, semantic-search, graph, obsidian, sqlite]
tools: [markdown, obsidian, sqlite]
sources:
  - 03_reviews/2026-05-15-knowledge-memory-database-architecture.md
related:
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
  workflows:
    - 07_workflows/memory-indexing.md
---

# Roadmap: memory implementation

Status: active
Owner: Techscope/user
Started: 2026-05-15

## Goal

Построить долговременную память проекта "Копилка технологий", которая одновременно:

- читается человеком как Markdown-база;
- работает в Obsidian как vault с backlinks, graph view и Bases;
- индексируется агентом для structured search, full-text search и semantic search;
- сохраняет typed relations между источниками, идеями, инструментами, решениями и стандартами;
- остается переносимой в другие проекты и будущих агентов.

## Architecture

```text
Markdown files as source of truth
        |
        | parse frontmatter + body
        v
SQLite sidecar index
        |
        +-- metadata
        +-- full-text search
        +-- typed relations
        +-- embeddings
        |
        v
semantic and graph-like retrieval
```

Obsidian используется как human UI поверх Markdown, а не как единственный источник истины.

## Phase 1: Markdown discipline

Status: done

Задача: сделать все будущие артефакты машинно-индексируемыми без потери читаемости.

Deliverables:

- YAML frontmatter во всех шаблонах.
- Единые поля `id`, `type`, `status`, `created`, `updated`, `topics`, `tools`, `sources`, `related`.
- Правило: каждый новый материал получает стабильный `id`.
- Правило: файлы остаются в ASCII/kebab-case.

Acceptance criteria:

- Новый intake, brief, review, decision или standard можно распарсить без анализа свободного текста.
- Obsidian может использовать properties для таблиц и фильтров.
- Codex может найти связанные материалы через frontmatter и markdown links.

## Phase 2: Obsidian-compatible vault

Status: planned

Задача: сделать текущую папку удобной для ручной навигации в Obsidian.

Deliverables:

- Сохранить Markdown-first структуру.
- Добавить соглашения по tags/topics.
- При необходимости добавить `.obsidian/` только после ручного открытия vault и понимания нужных настроек.
- Создать Obsidian Bases views для:
  - all briefs;
  - active standards;
  - decisions by status;
  - tools and topics.

Acceptance criteria:

- Можно открыть папку проекта в Obsidian.
- Видны backlinks и graph view.
- Можно фильтровать заметки по `type`, `status`, `topics`, `tools`.

## Phase 3: SQLite sidecar index

Status: in progress

Задача: добавить локальную индексную БД, которую можно пересоздать из Markdown.

Deliverables:

- Папка `.memory/`.
- SQL schema для `techscope.sqlite`.
- Таблицы:
  - `documents`;
  - `chunks`;
  - `entities`;
  - `relations`;
  - `embeddings`;
  - `index_runs`.
- Документированный rebuild workflow.
- Frontmatter validator.
- Query CLI для FTS, metadata filters и relations.

Acceptance criteria:

- БД можно удалить и восстановить из Markdown.
- В БД есть metadata, typed relations и full-text index.
- Нет ручного редактирования SQLite как source of truth.

Current commands:

```sh
node scripts/validate-memory.mjs
node scripts/rebuild-memory.mjs
node scripts/query-memory.mjs stats
node scripts/query-memory.mjs search STT
node scripts/query-memory.mjs by-topic memory
node scripts/query-memory.mjs by-tool sqlite
node scripts/query-memory.mjs open
```

## Phase 4: Semantic search

Status: planned

Задача: добавить embeddings и semantic retrieval.

Default path:

- сначала SQLite vector extension, если достаточно одного файла и локальной простоты;
- LanceDB, если нужен более специализированный embedded vector store;
- Qdrant позже, если поиск станет отдельным сервисом или понадобится shared API.

Deliverables:

- Выбранный embedding provider/model.
- Chunking policy.
- Reindex command.
- Query workflow: text query -> embedding -> candidates -> metadata filters -> answer.

Acceptance criteria:

- Можно задавать вопросы вроде "что мы знаем про локальный STT?".
- Результаты возвращают ссылки на Markdown-файлы.
- Retrieval объясняет, на какие источники и стандарты опирается.

## Phase 5: Graph layer

Status: planned

Задача: проверить, достаточно ли `relations` в SQLite или нужна отдельная graph DB.

Start with:

- `relations` table as lightweight graph.

Escalate to graph DB only if:

- нужны частые multi-hop queries;
- SQLite relations становятся неудобными;
- появляется необходимость визуального graph exploration за пределами Obsidian.

Candidates:

- Kuzu for embedded analytical graph.
- Neo4j for mature Cypher and visualization.
- SurrealDB for experimental multi-model storage.

Acceptance criteria:

- Есть реальные query examples, которые SQLite закрывает плохо.
- Понятна стоимость поддержки graph DB.
- Есть миграционный план из Markdown/SQLite.

## Phase 6: Export to other projects and agents

Status: planned

Задача: сделать знания переносимыми.

Deliverables:

- Export workflow для стандартов.
- Project onboarding prompt.
- Agent instruction pack, который можно переносить в `AGENTS.md` других проектов.
- Каталог reusable features/patterns.

Acceptance criteria:

- Можно выбрать стандарт и перенести его в другой проект вместе с rationale.
- Новый агент получает не только правило, но и ограничения, примеры и связанные решения.

## Implementation order

1. Done: принять decision о Markdown-first + sidecar index.
2. Done: обновить шаблоны frontmatter.
3. Done: добавить schema draft для SQLite.
4. Done: добавить workflow индексации.
5. Done: привести существующие первые артефакты к новому frontmatter.
6. Done: добавить rebuild script, query CLI и validator.
7. Next: выбрать embedding model/provider.
8. Next: добавить semantic search поверх текущей SQLite-памяти.

## Open questions

- Какой embedding provider использовать первым: локальный или облачный?
- Нужна ли приватность "все полностью локально" как жесткое правило?
- Какой язык запросов к памяти удобнее: CLI-команды, natural language через Codex или оба варианта?
