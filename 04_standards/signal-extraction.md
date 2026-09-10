---
id: signal-extraction
type: standard
status: active
created: 2026-05-15
updated: 2026-06-01
last_reviewed: 2026-06-01
owner: Techscope/user
topics: [signal-extraction, knowledge-processing, media-intake, agent-design]
tools: [markdown, extract-signal, process-intake, codex]
sources:
  - AGENTS.md
related:
  workflows:
    - 07_workflows/signal-extraction.md
    - 07_workflows/codex-assisted-signal-extraction.md
    - 07_workflows/codex-assisted-media-review.md
    - 07_workflows/media-intake-processing.md
supersedes: []
---

# Standard: signal-extraction

Status: active
Owner: Techscope/user
Last reviewed: 2026-05-16

## Rule

Каждый значимый входящий материал должен получить `signal` artifact: сжатую техническую выжимку, очищенную от воды, рекламы, повторов и нерелевантных фрагментов.

Автоматический extractor создает только `heuristic-draft`. Для материалов, которые могут повлиять на программирование, LLM agents, coding agents, agent harnesses, standards or decisions, обязательный следующий шаг - Codex-assisted refinement прямо в Techscope thread, без внешних LLM-сервисов.

Codex-assisted refinement нужен не для хранения "хорошего транскрипта". Транскрипт является transient extraction artifact and must be purged after processed knowledge is created. Цель refinement - не допустить, чтобы ASR-шум, timestamp-фрагменты, source metadata или слабая эвристика попали в рабочую память как curated knowledge.

## Purpose

Signal artifact нужен не как красивое summary, а как рабочий концентрат для проектирования агентов, tools, workflows, standards and decisions.

## Keep

- технические claims;
- конкретные практики;
- tool/API/model/library names;
- архитектурные ограничения;
- failure modes;
- security/DX risks;
- eval ideas;
- candidate rules for agents;
- official primary-source links and verification tasks when they are stable reference material, not incoming-material provenance.

## Remove

- marketing and calls to action;
- biography and stage banter;
- repeated examples without new meaning;
- vague motivation;
- long quotes;
- full transcripts;
- personal stories unless they encode transferable workflow patterns.

## Pipeline position

```text
incoming material -> transient processing -> neutral intake -> signal -> assessment -> brief/review/standard
```

Assessment should use signal notes as compressed input while keeping only anonymous source ids and neutral metadata for incoming materials.

Raw transcripts, raw media and direct incoming provenance are not authored working memory and are not retained in tracked memory. Searchable working memory should rely on curated Markdown artifacts: `signal`, `assessment`, `brief`, `review`, `decision` and `standard`.

## Signal lifecycle

- `status: extracted` + `extraction_mode: heuristic-draft` + `refinement_status: needs-codex-refinement`: создан машинный черновик.
- `status: refined` + `extraction_mode: codex-assisted` + `refinement_status: codex-refined`: Codex в Techscope thread прочитал source artifact, очистил шум, усилил technical signal and updated the artifact.
- `status: reviewed` + `refinement_status: human-reviewed`: пользователь или отдельный review подтвердил, что signal можно использовать как вход для brief/review/decision.
- `status: superseded`: signal заменен более новым artifact.

## Codex-assisted harness

Использовать:

```text
07_workflows/prompts/signal-extraction-harness.md
```

Codex refinement должен:

- compare the signal draft with transient/approved source material when available, without retaining raw/provenance breadcrumbs;
- оставить только переносимые technical claims, practices, risks and agent-design implications;
- добавить verification tasks and primary-source needs;
- сопоставить материал с существующими Techscope standards/decisions/reviews;
- не использовать внешние LLM-сервисы.

Codex refinement in Techscope v1 is a workflow stage performed by the active Codex thread, not an automatic worker inside `process-intake`. `process-intake` may create the draft and set `refinement_status: needs-codex-refinement`; the actual curated rewrite happens when Codex reads the source artifact and updates the signal.

Full refinement is mandatory when:

- heuristic signal quality is visibly poor;
- ASR produced noisy text;
- the draft includes timestamps, source metadata or random fragments;
- the material may be promoted to brief, review, decision or standard;
- the material affects agent design, safety, memory, evals, tools or user workflows.

For low-impact material with a clean heuristic signal, a spot check is acceptable.

## Telegram media

Все входящие из Telegram проходят тот же pipeline. Telegram bot может создать только neutral intake, transient link/media processing, heuristic signal and assessment.

Если Telegram media содержит фото, скриншот, UI, диаграмму, видео, аудио, документ или другой материал с потенциальной пользой, это штатный случай для Codex-assisted media review:

- media file is held only in untracked temp/quarantine storage while it is needed;
- задание создается в `.queue/codex-media-review/pending/` without tracked raw paths;
- Telegram intake переводится в `awaiting_codex` and не считается завершенным;
- Codex в текущем Techscope thread открывает media, извлекает technical signal, проверяет контекст and updates artifacts;
- результат фиксируется как refined signal, source note, brief or assessment.
- после `codex-review-done` intake переводится в `complete`.

Media-derived signal должен быть refined в Techscope thread перед тем, как становиться basis for brief, review, standard or decision.

## Non-goals

- Do not make signal a final decision.
- Do not replace primary-source verification.
- Do not store copyrighted full article or transcript text in signal.
