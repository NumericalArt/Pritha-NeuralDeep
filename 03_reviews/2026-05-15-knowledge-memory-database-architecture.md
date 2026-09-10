---
id: 2026-05-15-knowledge-memory-database-architecture
type: review
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [memory, knowledge-base, semantic-search, graph, obsidian, sqlite, vector-db]
tools: [markdown, obsidian, sqlite, lancedb, qdrant, neo4j, kuzu, surrealdb]
sources:
  - https://obsidian.md/help/bases
  - https://obsidian.md/help/Plugins/Graph%2Bview
  - https://sqlite.org/vec1/doc/trunk/doc/vec1.md
  - https://docs.lancedb.com/quickstart
  - https://qdrant.tech/documentation/quick-start/
  - https://neo4j.com/developer/genai-ecosystem/vector-search/
  - https://docs.kuzudb.com/extensions/vector/
  - https://surrealdb.com/docs/surrealdb/reference-guide/vector-search
related:
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
  workflows:
    - 07_workflows/memory-implementation-roadmap.md
    - 07_workflows/memory-indexing.md
---

# Review: knowledge-memory-database-architecture

Date: 2026-05-15
Status: draft

## Question

Как организовать долговременную память проекта "Копилка технологий": хранить исследования, переработанные выводы, фичи, стандарты и связи между объектами так, чтобы это было удобно для человека, Codex-агента, семантического поиска и дальнейшего переноса в другие проекты?

## Recommendation

Начать с архитектуры:

```text
Markdown files as source of truth
        +
SQLite sidecar database for metadata, full-text search, relations and embeddings
        +
Obsidian as optional human UI
```

Не начинать сразу с отдельной graph DB как единственного хранилища. Для нашей задачи важнее переносимость, Git-история, читаемость и простое редактирование агентом. Граф и vector search лучше строить как индекс поверх Markdown, а не как единственную память.

## Options

### Option A: Markdown + Obsidian only

Плюсы:

- Очень просто стартовать.
- Все данные остаются локальными Markdown-файлами.
- Obsidian дает backlinks, graph view и database-like views через Bases.
- Хорошо работает с Git и ручным редактированием.

Минусы:

- Семантический поиск зависит от плагинов или внешнего индексатора.
- Graph view визуальный, но не полноценная graph DB для запросов.
- Сложно делать системные запросы вида "найди все фичи, связанные с agent workflows, которые rejected из-за security".

Вывод: отлично как UI и файловая база, недостаточно как машинная память агента.

### Option B: SQLite as source of truth

Плюсы:

- Один файл БД.
- Таблицы, индексы, связи, FTS5, JSON.
- Возможен vector search через расширения вроде SQLite Vec1/sqlite-vec.
- Легко переносить и бэкапить.

Минусы:

- Хуже читается человеком напрямую.
- Конфликты в Git сложнее, чем у Markdown.
- Codex-агенту придется поддерживать миграции и аккуратную схему.

Вывод: хорошо как индекс и метаданные, но не как главный формат знания.

### Option C: Dedicated vector DB

Кандидаты:

- LanceDB: embedded local DB, похожа на SQLite по простоте запуска, поддерживает vector search, full-text search, hybrid search и локальный путь.
- Qdrant: сильная отдельная vector database, удобно запускать локально через Docker, есть REST/gRPC API и dashboard.
- Chroma: популярна для RAG-прототипов и embedding functions.

Плюсы:

- Лучше подходят для semantic search и RAG.
- Есть готовые клиенты, фильтры, индексы, коллекции.
- Qdrant и LanceDB хорошо документированы для локального запуска.

Минусы:

- Еще один слой инфраструктуры.
- Не решают сами по себе граф связей и журнал решений.
- Для небольшого проекта могут быть преждевременным усложнением.

Вывод: LanceDB или SQLite-vector лучше для локального старта; Qdrant имеет смысл, когда поиск станет отдельным сервисом.

### Option D: Graph DB as source of truth

Кандидаты:

- Neo4j: зрелая graph DB, Cypher, визуализация, vector index/search.
- Kuzu: embedded graph database, ориентирована на аналитические graph workloads; есть vector extension с HNSW по документации.
- Memgraph: graph DB с возможностью совмещать graph traversal и vector search.
- SurrealDB: multi-model database: document, graph, vector, full-text, time-series, geospatial.

Плюсы:

- Естественно хранить связи: source -> claim -> tool -> standard -> decision -> project.
- Хорошо подходит для вопросов с переходами по связям.
- Neo4j и SurrealDB уже движутся в сторону graph + vector в одной системе.

Минусы:

- Сложнее эксплуатация и миграции.
- Больше риск преждевременной схемы: мы еще не знаем, какие отношения реально будут полезны.
- Markdown/Git-история становятся вторичными или требуют синхронизации.
- Graph DB не заменяет хорошую текстовую структуру и редакторскую дисциплину.

Вывод: графовая БД полезна как второй этап, но не как первый фундамент.

## Proposed memory model

Минимальная сущностная модель:

```text
Source
  - article, video, channel, repo, docs, note

Artifact
  - intake, brief, review, decision, standard

Claim
  - утверждение, извлеченное из source

Tool
  - библиотека, CLI, сервис, модель, фреймворк

Feature
  - полезный паттерн или возможность, которую можно внедрить

Standard
  - повторяемое правило

Decision
  - принятое или отклоненное решение

ProjectFit
  - применимость к будущим проектам
```

Ключевые связи:

```text
Source MENTIONS Tool
Source SUPPORTS Claim
Claim MOTIVATES Feature
Feature MAY_BECOME Standard
Review COMPARES Tool
Decision ACCEPTS|REJECTS Feature
Standard APPLIES_TO ProjectFit
Standard SUPERSEDES Standard
```

## Recommended first implementation

### Phase 1: Markdown + Obsidian-compatible structure

Оставить текущие Markdown-файлы как source of truth. Добавить YAML frontmatter в шаблоны:

```yaml
---
id: 2026-05-15-local-video-to-structured-text
type: brief
status: draft
topics: [audio, stt, local-ai, workflow]
tools: [ffmpeg, kesha, parakeet]
related:
  sources:
    - 00_inbox/texts/2026-05-15-local-video-to-structured-text.md
  standards:
    - 04_standards/local-video-to-structured-text.md
---
```

Это сразу даст:

- удобную работу в Obsidian;
- backlinks и graph view;
- database-like views через Obsidian Bases;
- простую индексацию агентом.

### Phase 2: SQLite sidecar index

Добавить локальную БД, например:

```text
.memory/techscope.sqlite
```

Таблицы:

- `documents`: путь, тип, статус, title, summary, hash, updated_at.
- `chunks`: фрагменты текста для поиска.
- `entities`: tools, concepts, standards, projects, sources.
- `relations`: typed edges между сущностями.
- `embeddings`: vector для chunk/entity/document.

SQLite закрывает structured storage, FTS и lightweight graph через таблицу `relations`.

### Phase 3: Semantic search

Для первого варианта:

- SQLite Vec1/sqlite-vec, если хотим один файл и минимальную инфраструктуру.
- LanceDB, если хотим более специализированный embedded vector store с hybrid search.

Qdrant подключать позже, если:

- материалов станет много;
- понадобится dashboard/API;
- semantic search станет отдельным сервисом;
- будут несколько агентов или проектов, использующих общий индекс.

### Phase 4: Graph DB only if graph queries become real bottleneck

Переходить к graph DB, если появятся частые вопросы:

- "покажи все стандарты, которые опираются на этот источник";
- "какие решения будут затронуты, если мы откажемся от инструмента X";
- "найди цепочки от source до implemented feature";
- "какие технологии часто встречаются вместе и приводят к active standards".

Для embedded graph стоит рассмотреть Kuzu. Для зрелой визуализации и Cypher - Neo4j. Для эксперимента с single multi-model store - SurrealDB, но осторожно: оно может стать слишком центральной зависимостью.

## Obsidian role

Obsidian стоит подключить как UI, а не как единственную систему памяти.

Хорошо подходит для:

- чтения и ручного редактирования Markdown;
- graph view;
- backlinks;
- properties;
- Bases для таблиц по `type`, `status`, `topics`, `tools`.

Не стоит полагаться только на Obsidian, если нужна:

- автоматическая семантическая индексация;
- воспроизводимые агентные запросы;
- typed graph queries;
- перенос знаний в другие проекты через API.

## Sources

- Obsidian Bases: https://obsidian.md/help/bases
- Obsidian Graph view: https://obsidian.md/help/Plugins/Graph%2Bview
- SQLite Vec1: https://sqlite.org/vec1/doc/trunk/doc/vec1.md
- LanceDB quickstart: https://docs.lancedb.com/quickstart
- Qdrant local quickstart: https://qdrant.tech/documentation/quick-start/
- Neo4j vector index and search: https://neo4j.com/developer/genai-ecosystem/vector-search/
- Kuzu vector extension: https://docs.kuzudb.com/extensions/vector/
- SurrealDB vector search/reference docs: https://surrealdb.com/docs/surrealdb/reference-guide/vector-search

## Decision candidate

Предлагаемый первый decision:

```text
Мы храним знания в Markdown как source of truth, добавляем YAML frontmatter для машинной структуры, используем Obsidian как UI, а semantic search и typed relations строим через локальный sidecar index. Graph DB не внедряем до появления реальных graph-query сценариев, которые SQLite relations не закрывают.
```
