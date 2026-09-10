---
id: 2026-05-15-local-embeddings
type: decision
status: accepted
created: 2026-05-15
updated: 2026-05-15
topics: [memory, embeddings, semantic-search, local-ai]
tools: [sentence-transformers, sqlite]
sources:
  - 07_workflows/memory-indexing.md
related:
  workflows:
    - 07_workflows/memory-indexing.md
  standards:
    - 04_standards/memory-structure.md
---

# Decision: local embeddings

## Context

Проекту нужен semantic search по локальной Markdown-памяти. Мы хотим начать без внешней vector DB и без облачного embedding API, сохранив Markdown как source of truth и SQLite как sidecar index.

## Decision

Используем локальные embeddings через:

```text
sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
```

Векторы сохраняются в таблицу `embeddings` SQLite как JSON. Semantic search считает cosine similarity локально.

## Consequences

Плюсы:

- работает локально;
- поддерживает русский и английский;
- не требует внешнего API;
- не меняет Markdown-first архитектуру;
- достаточно легкий первый слой для текущего объема памяти.

Минусы:

- первый запуск скачивает модель с Hugging Face;
- поиск пока brute-force по векторам в SQLite;
- embeddings нужно пересобирать после `rebuild-memory`;
- качество ниже, чем у более крупных embedding-моделей.

## Alternatives considered

- OpenAI embeddings: проще и качественно, но не local-first.
- Qdrant/LanceDB: сильнее как vector store, но преждевременно для текущего объема.
- Multilingual E5/Jina: возможные будущие апгрейды, но сейчас важнее быстро получить работающий слой.

## Review date

2026-06-15

