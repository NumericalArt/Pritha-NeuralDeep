---
id: media-intake-processing
type: workflow
status: active
created: 2026-05-15
updated: 2026-06-01
topics: [media-intake, assessment, telegram, source-verification, agents, queue]
tools: [telegram-bot, process-intake, extract-signal, codex, transcribe-media, mlx-whisper, markdown]
sources:
  - AGENTS.md
  - 04_standards/expert-information-assessment.md
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
    - 07_workflows/expert-information-assessment.md
    - 07_workflows/telegram-intake-bot.md
    - 07_workflows/media-transcription.md
    - 07_workflows/codex-assisted-signal-extraction.md
    - 07_workflows/codex-assisted-media-review.md
  standards:
    - 04_standards/expert-information-assessment.md
---

# Workflow: media-intake-processing

## Goal

Любой входящий материал из Telegram, ссылок, файлов, текстов или другого медиа должен проходить не только сохранение и индексацию, но и первичную экспертную оценку относительно миссии Techscope.

## Rule

После создания intake нужно сразу:

1. Сохранить neutral intake metadata without raw source/provenance.
2. Поставить intake в persistent queue, если источник пришел через Telegram или другой автоматический канал.
3. Извлечь ссылки.
4. Проверить доступность ссылок, если это возможно.
5. Для поддерживаемых remote/local media запустить локальную транскрибацию, если источник доступен и есть совместимый adapter.
6. Использовать media/transcript только transiently в untracked temp/quarantine workspace.
7. Создать heuristic `signal` draft в `01_sources/signals/` without source URLs/raw paths/transcript fragments.
8. Удалить original media, extracted audio, transcript JSON/text/Markdown and raw platform payloads after processed knowledge is extracted.
9. Пометить signal как `needs-codex-refinement`.
10. Создать `assessment` в `03_reviews/`.
11. Связать signal and assessment только через anonymous source id and neutral metadata.
12. Пересобрать memory index and embeddings.
13. Для media, которые требуют содержательного понимания, выполнить Codex-assisted review до удаления transient material; tracked memory keeps only processed conclusions.
13. Не считать intake полностью обработанным, пока закрыт не только автоматический pass, но и обязательный Codex-assisted review.
14. Для полезных материалов выполнить Codex-assisted refinement в этом Techscope thread.
15. Перед любым стандартом или решением провести консилиум expert lenses.

## Command

```sh
node scripts/process-intake.mjs <intake-path> --transcribe-media --reindex
```

Telegram queue worker:

```sh
node scripts/telegram-bot.mjs worker
```

Codex media-review queue:

```sh
node scripts/telegram-bot.mjs full-status
node scripts/telegram-bot.mjs codex-review-report
node scripts/telegram-bot.mjs codex-review-done <job-id>
```

## Expert council

Консилиум в Techscope v1 - это обязательный проход по expert lenses:

- Programming;
- Agent Engineering;
- DX;
- Security;
- Evidence;
- Product Pragmatism.

Для сложных материалов дополнительно использовать роли из `06_subagents/`: architecture, security, developer-experience, product-pragmatist, research-scout, standards-editor.

## Output

Primary output:

```text
01_sources/signals/YYYY-MM-DD-topic-signal.md
```

Assessment output:

```text
03_reviews/YYYY-MM-DD-topic-assessment.md
```

The assessment may recommend:

- `archive`;
- `brief`;
- `review`;
- `experiment`;
- `decision`;
- `standard`.

## Completion semantics

`auto_completed_at` means that scripts inspected links transiently, processed compatible media sources where possible, created neutral assessment/signal drafts, purged raw/provenance artifacts and rebuilt the index.

`completed_at` means the full required pipeline is closed. For media intakes this requires the useful working-memory artifacts to be curated first. In Techscope v1 this is a Codex-assisted pass performed in the current Techscope thread, not a background Codex worker.

Codex-assisted refinement is not for preserving a "better transcript". The transcript is raw evidence. The refinement step exists to prevent noisy ASR output, source metadata, timestamps or weak heuristic extraction from entering curated working memory as if it were knowledge.

If the heuristic signal is already clean and the material is low-risk/low-impact, a spot check may be enough. Full Codex refinement is required when:

- the heuristic signal contains ASR errors, timestamps, source metadata or random fragments;
- the material may become a brief, review, decision or standard;
- the material affects agent design, safety, memory, evals, tools or user workflows;
- automatic scoring appears inconsistent with the actual content.

Telegram replies must reflect this distinction. "Готово" is allowed only for a fully completed intake.

## Safety

- Автоматический assessment является draft, не финальным решением.
- Автоматический signal является heuristic draft, не финальной экспертной выжимкой.
- Содержательный refinement выполняется Codex-агентом в текущем Techscope thread по `07_workflows/prompts/signal-extraction-harness.md`, без внешних LLM-сервисов. Это workflow-стадия, а не автоматический worker внутри `process-intake`.
- Media с потенциальной пользой проходят Codex-assisted media review по `07_workflows/codex-assisted-media-review.md`.
- Внешние claims не принимать без первоисточника.
- Полные transcripts, raw media, raw Telegram updates, original filenames, source URLs and source platform identifiers are not stored in tracked memory.
- Raw transcript не является рабочей памятью. В рабочую память идут curated artifacts: `signal`, `assessment`, `brief`, `review`, `decision` and `standard`.
- Telegram/media artifacts are processed transiently and purged. Signal/assessment must reference only anonymous source ids and neutral source class metadata.
- `node scripts/privacy-audit.mjs --strict` must pass after processing and before push.
- Если материал может повлиять на настройку агентов, зафиксировать это как recommendation для будущего agent standard, prompt rule, workflow или decision.
