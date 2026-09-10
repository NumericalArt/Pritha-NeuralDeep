---
id: memory-structure
type: standard
status: active
created: 2026-05-15
updated: 2026-06-01
last_reviewed: 2026-06-01
owner: Techscope/user
topics: [memory, markdown, frontmatter, indexing]
tools: [markdown, sqlite, obsidian]
sources:
  - 05_decisions/2026-05-15-memory-architecture.md
  - 05_decisions/2026-05-29-pritha-portable-memory-snapshot.md
  - 07_workflows/memory-implementation-roadmap.md
related:
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
    - 05_decisions/2026-05-29-pritha-portable-memory-snapshot.md
  workflows:
    - 07_workflows/memory-indexing.md
supersedes: []
---

# Standard: memory-structure

Status: active
Owner: Techscope/user
Last reviewed: 2026-05-29

## Rule

Каждый значимый authored-артефакт памяти должен быть Markdown-файлом с YAML frontmatter. Для Pritha GitHub snapshot переносит authored Markdown, schema, bootstrap/rebuild scripts and lightweight status baselines. SQLite, FTS, embeddings и graph-like relations являются локальными generated indexes: они должны оставаться полностью пересоздаваемыми из Markdown, но не должны накапливать длинную бинарную Git-историю. Raw JSON, transcripts, downloaded text/PDF/image source artifacts, original media and incoming-material provenance are not portable Git state.

## Use when

- Создается intake, brief, assessment, review, decision, standard или workflow.
- Материал должен быть доступен для Obsidian, Codex, SQLite index и переносимого GitHub snapshot.
- Из материала нужно извлекать темы, инструменты, источники и связи.

## Avoid when

- Файл является служебным README без самостоятельного статуса знания.
- Файл является временным черновиком, который не должен индексироваться.

## Required practices

- `id` должен быть стабильным и уникальным в проекте.
- `type` должен описывать роль артефакта: `intake`, `brief`, `assessment`, `review`, `decision`, `standard`, `workflow`, `template`.
- `status` должен отражать состояние: `new`, `processed`, `draft`, `proposed`, `accepted`, `active`, `deprecated`, `rejected`, `archived`.
- `topics` должны описывать предметную область.
- `tools` должны содержать технологии, библиотеки, модели, сервисы и CLI.
- `sources` для incoming-material artifacts должны использовать anonymous source ids или curated internal documents, not raw paths, incoming source URLs, original filenames or platform identifiers. Official docs/spec/reference URLs may remain in standards/reviews when they are stable reference material rather than incoming-material provenance.
- `related` должен связывать артефакт с briefs, reviews, decisions, standards и workflows.
- Для новых файлов использовать шаблоны из `08_templates/`.
- После серии изменений запускать `node scripts/privacy-audit.mjs --strict`, `node scripts/validate-memory.mjs`, `node scripts/rebuild-memory.mjs` и перед push `node scripts/golden-checks.mjs --with-embeddings`.

## Identifier policy

- Для intake: `YYYY-MM-DD-short-topic-intake`.
- Для brief: `YYYY-MM-DD-short-topic-brief`.
- Для review: `YYYY-MM-DD-short-topic-review`.
- Для decision: `YYYY-MM-DD-short-topic`.
- Для standard: стабильное имя стандарта без даты, например `memory-structure`.
- Для workflow: стабильное имя workflow, например `memory-indexing`.
- Для template: `template-kind`.

## Examples

```yaml
---
id: 2026-05-15-local-video-to-structured-text-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [audio, stt, local-ai]
tools: [ffmpeg, kesha, parakeet]
sources:
  - 00_inbox/texts/2026-05-15-local-video-to-structured-text.md
related:
  standards:
    - 04_standards/local-video-to-structured-text.md
---
```

## Related decisions

- `05_decisions/2026-05-15-memory-architecture.md`
- `05_decisions/2026-05-29-pritha-portable-memory-snapshot.md`
