---
id: 2026-05-15-youtube-obsidian-wiki-instead-rag-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-06-01
topics:
  - youtube
  - obsidian
  - llm-wiki
  - rag
  - knowledge-base
  - agent-memory
  - markdown
tools:
  - yt-dlp
  - mlx-whisper
  - obsidian
  - markdown
  - codex
  - claude-code
sources:
  - source-074a85fb-9b16-4b77-b21f-09fdfb4c1591
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-15
processed_at: 2026-06-01T21:03:38.434Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-074a85fb-9b16-4b77-b21f-09fdfb4c1591
---

# Artifact: source-074a85fb-9b16-4b77-b21f-09fdfb4c1591

Date: 2026-05-15
Status: draft
Source class: video
Retention: source-purged

Date: 2026-05-15
Status: draft

## Summary

Видео показывает практический Obsidian setup по мотивам LLM Wiki / Karpathy knowledge base pattern: вместо того чтобы каждый раз делать RAG по сырым chunk-ам, агент постепенно компилирует из raw sources связанную Markdown wiki, поддерживает `index.md` и `log.md`, а затем отвечает на запросы через чтение индекса и релевантных страниц. Автор демонстрирует три операции: `ingest` для добавления источников, `query` для ответов по wiki и `lint` для поиска дубликатов, пропущенных страниц, слабых связей и противоречий.

## Key claims

- Для умеренного объема знаний LLM Wiki может быть проще и точнее классического RAG: агент работает не с разрозненными chunk-ами, а с уже скомпилированными смысловыми страницами и ссылками.
- Базовая структура состоит из трех частей: raw sources, generated wiki и schema/rules file.
- Человек выбирает источники и проверяет качество, а LLM создает и поддерживает wiki pages, cross-links, index и log.
- `index.md` становится входной картой для agent query: агент сначала читает индекс, затем рекурсивно подтягивает нужные связанные страницы.
- `lint` нужен как регулярная операция обслуживания: выявлять orphan pages, missing concept pages, broken links, дубликаты, устаревшие или конфликтующие записи.
- Под каждый крупный проект или исследовательский контекст лучше заводить отдельную wiki, чтобы индекс помещался в контекст и не смешивал разные домены.

## Evidence

- Видео является вторичным практическим пересказом и демонстрацией.

## Risks and caveats

- LLM Wiki не отменяет RAG и vector search. Скорее это другой слой: curated synthesis and relations before retrieval.
- Главный риск: hallucination propagation. Если агент ошибся при ingest и wiki-страница стала производным "источником", ошибка может закрепиться.
- При росте базы `index.md` может стать слишком большим или слишком грубым. Тогда потребуются sub-indexes, search tools или hybrid retrieval.
- Автоматическое переписывание wiki без review опасно для решений и стандартов.

## Recommendation

Считать материал сильным кандидатом на эксперимент для Techscope. Не менять текущую архитектуру на "только LLM Wiki", а добавить поверх нее экспериментальный workflow:

```text
```

## Next step

Создать экспериментальный workflow `llm-wiki-layer`:

- определить папку для agent-maintained pages;
- завести `index.md` и `log.md`;
- описать команды `ingest`, `query`, `lint`;
- прогнать эксперимент на уже обработанных YouTube-видео и наших memory architecture документах;
- сравнить качество ответов с текущим semantic search.
