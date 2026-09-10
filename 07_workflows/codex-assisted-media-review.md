---
id: workflow-codex-assisted-media-review
type: workflow
status: active
created: 2026-05-17
updated: 2026-05-17
topics: [media-review, telegram, codex, visual-analysis, signal-extraction, agent-design]
tools: [codex, telegram-bot, view-image, markdown, process-intake]
sources:
  - AGENTS.md
  - 04_standards/signal-extraction.md
related:
  workflows:
    - 07_workflows/telegram-intake-bot.md
    - 07_workflows/media-intake-processing.md
    - 07_workflows/codex-assisted-signal-extraction.md
  standards:
    - 04_standards/signal-extraction.md
---

# Workflow: Codex-assisted media review

## Goal

Сделать Codex-разбор медиа штатным этапом Techscope.

Telegram-бот может сохранить фото, скриншот, видео, аудио или документ и связать их с intake/assessment. Но содержательное понимание медиа выполняет Codex в текущем Techscope thread: открыть artifact, извлечь technical signal, убрать шум, сопоставить с памятью проекта, проверить первоисточники при необходимости и оформить результат.

## Queue

Автоматическая обработка Telegram media создает задания:

```text
.queue/codex-media-review/pending/
.queue/codex-media-review/done/
```

Посмотреть очередь для текущего Codex-треда:

```sh
node scripts/telegram-bot.mjs codex-review-report
```

После завершения разбора:

```sh
node scripts/telegram-bot.mjs codex-review-done <job-id>
```

## Procedure

1. Выполнить `codex-review-report`.
2. Для каждого pending job открыть media file через доступный Codex tool: image viewer для изображений, локальную транскрибацию/извлечение текста для audio/video/document, shell tools для метаданных.
3. Сопоставить media с intake, raw Telegram update, signal draft and assessment.
4. Извлечь только полезный signal:
   - UI/workflow patterns;
   - architecture decisions;
   - agent harness ideas;
   - risks, failure modes, security/DX implications;
   - concrete tools, versions, repo links and verification tasks.
5. Удалить визуальный шум: decorative UI, repeated screenshots, ads, generic announcements.
6. Обновить или создать:
   - refined signal in `01_sources/signals/`;
   - source note in `01_sources/notes/` for meaningful media groups;
   - brief/review/assessment when useful.
7. Run validation, rebuild and embeddings.
8. Mark job done. После этого Telegram intake can move from `awaiting_codex` to `complete`.

## Output to Current Thread

Результаты media-review должны быть выводимы в текущий Techscope Codex thread:

- краткое содержание увиденного;
- извлеченный technical signal;
- что было обновлено в Markdown;
- какие файлы являются source links;
- какие проверки или эксперименты нужны дальше.

Telegram-бот не пишет напрямую в Codex thread. Он создает queue artifact and source links. Codex подхватывает их в этом thread and reports the result here.

## Completion Rule

Пока job находится в `.queue/codex-media-review/pending/`, связанный Telegram intake не считается полностью обработанным. Корректный статус для него - `awaiting_codex`.

После Codex-разбора нужно выполнить:

```sh
node scripts/telegram-bot.mjs codex-review-done <job-id>
```

Эта команда закрывает media-review job и переводит связанный intake в `complete`, если он был в `awaiting_codex`.

## Safety

- Не отправлять изображения во внешние LLM-сервисы.
- Не встраивать бинарные media files в signal/brief/review.
- Если изображение содержит секреты, токены, приватные чаты или персональные данные, не переписывать их в Markdown; зафиксировать только безопасный вывод.
- Не превращать screenshot-based claims в standard без первоисточника.
