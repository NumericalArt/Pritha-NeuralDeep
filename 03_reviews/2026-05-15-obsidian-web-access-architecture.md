---
id: 2026-05-15-obsidian-web-access-architecture
type: review
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [obsidian, web-ui, tailscale, mac-mini, mobile, knowledge-base]
tools: [obsidian, tailscale, quartz, sqlite]
sources:
  - https://obsidian.md/help/sync-notes
  - https://help.obsidian.md/publish
  - https://tailscale.com/docs/reference/tailscale-cli/serve
  - https://tailscale.com/docs/features/tailscale-funnel
  - https://obsidian.md/help/publish/headless
related:
  decisions:
    - 05_decisions/2026-05-15-obsidian-web-access.md
  workflows:
    - 07_workflows/memory-indexing.md
---

# Review: obsidian-web-access-architecture

Date: 2026-05-15
Status: draft

## Question

Как организовать доступ к "Копилке технологий" с MacBook и телефона: через Obsidian, через веб-интерфейс на Mac mini, через Tailscale или через публичный publish?

## Recommendation

Использовать двухслойную архитектуру:

```text
Obsidian vault for editing and human note work
        +
Techscope Web on Mac mini for reading, search, graph and semantic memory UI
        +
Tailscale Serve for private access from MacBook and phone
```

Не пытаться превратить Obsidian в серверное веб-приложение. Obsidian лучше оставить как редактор Markdown vault. Для просмотра "снаружи" лучше сделать отдельный read-only web UI поверх Markdown + SQLite + embeddings.

## Options

### Option A: Obsidian Sync

Использовать Obsidian Sync для редактирования vault на MacBook и телефоне.

Плюсы:

- официальный путь синхронизации Obsidian между устройствами;
- работает с мобильными приложениями Obsidian;
- меньше самодельной инфраструктуры.

Минусы:

- платный сервис;
- это sync, а не веб-интерфейс;
- не дает наш кастомный semantic/graph UI.

Вывод: хороший вариант для редактирования vault с MacBook/телефона, если нужна именно мобильная работа в Obsidian.

### Option B: Obsidian Publish

Использовать Obsidian Publish как облачный сайт/knowledge base.

Плюсы:

- официальный publish-путь;
- есть сайт, custom domains, headless publish.

Минусы:

- платный cloud hosting;
- больше подходит для публикации, а не приватной агентной памяти;
- не интегрирован с нашей SQLite/embeddings памятью.

Вывод: не первый выбор. Может пригодиться позже для публичной части знаний.

### Option C: Static site from vault

Генерировать сайт из Markdown через Quartz/MkDocs/аналог и отдавать его с Mac mini.

Плюсы:

- красиво, быстро, статично;
- хорошо подходит для чтения с телефона;
- можно отдавать через Tailscale Serve.

Минусы:

- отдельный build pipeline;
- хуже интеграция с нашей SQLite semantic memory;
- обычно read-only.

Вывод: хороший вариант для "digital garden" view, но не лучший для первого внутреннего UI.

### Option D: Custom Techscope Web

Сделать локальное веб-приложение, которое читает:

- Markdown files;
- `.memory/techscope.sqlite`;
- FTS;
- semantic embeddings;
- relations.

Плюсы:

- идеально ложится на текущую архитектуру;
- можно сделать semantic search, filters, graph, open items, standards, decisions;
- доступ через browser на MacBook и телефоне;
- не нужно индексировать raw-транскрипты;
- можно развивать как агентный UI.

Минусы:

- нужно написать и поддерживать маленькое приложение;
- сначала будет менее красиво, чем Obsidian/Quartz;
- editing лучше оставить в Obsidian/Codex, а web UI сделать read-only.

Вывод: лучший первый web layer для нашей задачи.

## Tailscale role

Использовать Tailscale Serve, а не Funnel, по умолчанию.

- Tailscale Serve: приватный доступ только внутри tailnet.
- Tailscale Funnel: публичный доступ из интернета.

Для MacBook и телефона достаточно Tailscale Serve. Funnel не включать без отдельного решения, потому что он публикует сервис наружу.

## Proposed architecture

```text
Mac mini
  <TECHSCOPE_ROOT>
    Markdown vault
    .memory/techscope.sqlite
    scripts/rebuild-memory.mjs
    scripts/embed-memory.py
    web app on localhost:3000

MacBook
  browser -> Tailscale URL -> Mac mini web app
  optional Obsidian vault copy/sync for editing

Phone
  browser -> Tailscale URL -> Mac mini web app
  optional Obsidian Mobile + Obsidian Sync for editing
```

## Web UI v1

Минимальный интерфейс:

- dashboard;
- search box: FTS + semantic;
- filters by type/status/topic/tool;
- open items;
- standards;
- decisions;
- assessments;
- markdown viewer;
- relation panel.

## Decision candidate

Build `Techscope Web` as a private read-only local web app served from Mac mini through Tailscale Serve. Use Obsidian separately as the human Markdown editor. Add Obsidian Sync later only if we need editing from phone/MacBook inside Obsidian.

