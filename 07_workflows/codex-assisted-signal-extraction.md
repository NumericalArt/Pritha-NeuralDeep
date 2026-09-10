---
id: workflow-codex-assisted-signal-extraction
type: workflow
status: active
created: 2026-05-16
updated: 2026-06-01
topics: [signal-extraction, codex, agent-harness, media-intake, telegram, agent-design]
tools: [codex, markdown, extract-signal, process-intake, telegram-bot]
sources:
  - AGENTS.md
  - 04_standards/signal-extraction.md
related:
  workflows:
    - 07_workflows/signal-extraction.md
    - 07_workflows/media-intake-processing.md
    - 07_workflows/telegram-intake-bot.md
  standards:
    - 04_standards/signal-extraction.md
---

# Workflow: Codex-assisted signal extraction

## Goal

Превращать автоматический `signal` draft в пригодную для Techscope смысловую выжимку без внешних LLM-сервисов. Содержательная работа выполняется Codex-агентом прямо в текущем Techscope thread.

This workflow is about curating working memory, not about polishing transcripts. Raw transcripts are transient extraction artifacts and are purged after processed knowledge is created. The durable knowledge artifact is the refined `signal` and, when useful, the follow-up `assessment`, `brief`, `review`, `decision` or `standard`.

## When to run

Запускать для каждого значимого входящего материала:

- Telegram forwarded post/message;
- media transcript;
- статья, blog post, Habr/Medium/Telegram long read;
- source note;
- brief или assessment, если из него нужно выделить reusable rules для агентов.

## Pipeline

```text
intake/source artifact
  -> node scripts/extract-signal.mjs <artifact>
  -> heuristic signal draft
  -> Codex-assisted refinement in this thread
  -> refined signal
  -> assessment/brief/review/decision candidate
  -> rebuild memory and embeddings
```

In Techscope v1 there is no autonomous Codex-refinement worker inside `process-intake`. `process-intake` creates heuristic drafts and marks them with `needs-codex-refinement`; the Codex-assisted pass happens in the active Techscope Codex thread.

## Command

Черновик:

```sh
node scripts/extract-signal.mjs <artifact-path>
```

После ручного Codex-pass:

```sh
node scripts/validate-memory.mjs
node scripts/rebuild-memory.mjs
python3 scripts/embed-memory.py
node scripts/query-memory.mjs stats
```

## Codex harness

Использовать prompt/spec:

```text
07_workflows/prompts/signal-extraction-harness.md
```

Codex-pass должен:

- открыть исходный artifact и уже созданный signal;
- удалить воду, случайные вопросы, рекламные фрагменты и source metadata без technical value;
- сохранить только claims, patterns, failure modes, constraints, workflows, risks, tools, eval ideas and agent-design implications;
- отметить слабые места evidence и нужные первоисточники;
- сопоставить материал с existing Techscope memory;
- обновить signal status:
  - `status: refined`;
  - `extraction_mode: codex-assisted`;
  - `refinement_status: codex-refined`.

Codex-pass can be skipped or reduced to a spot check only when the material is low-impact and the heuristic signal is visibly clean. It is required when the draft contains ASR noise, timestamps, source metadata, random fragments or when the material may affect agent standards, decisions, safety, tooling, memory, evals or user workflows.

## Telegram rule

Telegram bot автоматически создает intake, запускает link processing, media transcription when possible, heuristic signal draft and assessment. Но Telegram-контент часто неполный и шумный, поэтому любой Telegram signal с потенциальной пользой для агентов должен пройти Codex-assisted refinement перед использованием в brief, review, standard or decision.

## Safety

- Не отправлять материал во внешние LLM-сервисы.
- Не копировать полный transcript/article в signal.
- Не превращать refined signal в стандарт без review/decision.
- Если источник вторичный, явно указать verification tasks.
- Если evidence слабый, signal может остаться `status: extracted` and `refinement_status: needs-codex-refinement`.
