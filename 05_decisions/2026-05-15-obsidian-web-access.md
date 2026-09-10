---
id: 2026-05-15-obsidian-web-access
type: decision
status: accepted
created: 2026-05-15
updated: 2026-05-15
topics: [obsidian, web-ui, tailscale, mac-mini, mobile, knowledge-base]
tools: [obsidian, tailscale, sqlite]
sources:
  - 03_reviews/2026-05-15-obsidian-web-access-architecture.md
  - https://obsidian.md/help/sync-notes
  - https://tailscale.com/docs/reference/tailscale-cli/serve
related:
  reviews:
    - 03_reviews/2026-05-15-obsidian-web-access-architecture.md
---

# Decision: obsidian web access

## Context

Нужно иметь доступ к "Копилке технологий" с MacBook и телефона. Также нужна визуализация и веб-интерфейс поверх нашей памяти: Markdown, SQLite, relations, FTS и semantic embeddings.

## Decision

Разделяем роли:

- Obsidian: редактор Markdown vault и ручная навигация.
- Techscope Web: приватный read-only веб-интерфейс для просмотра, поиска, графа и semantic memory.
- Tailscale Serve: приватный доступ к Techscope Web с MacBook и телефона.

Funnel не использовать по умолчанию, потому что он открывает сервис шире, чем нужно.

## Consequences

Плюсы:

- Mac mini может быть постоянным knowledge server.
- MacBook и телефон получают browser-доступ без публичной публикации.
- Web UI может использовать нашу SQLite/embedding память, чего Obsidian сам по себе не делает.
- Markdown остается source of truth.

Минусы:

- Нужно создать и поддерживать маленькое web app.
- Редактирование с телефона через web UI пока не планируется.
- Для полноценного Obsidian editing на телефоне может понадобиться Obsidian Sync или отдельный sync-слой.

## Alternatives considered

- Obsidian Sync only: хорошо для редактирования, но не дает нашего web/semantic UI.
- Obsidian Publish: cloud publish, больше для публикации, чем для приватной памяти.
- Quartz/static site: красиво для чтения, но хуже интеграция с SQLite/embeddings.
- Tailscale Funnel: полезен для публичного доступа, но сейчас избыточен.

## Review date

2026-06-15

