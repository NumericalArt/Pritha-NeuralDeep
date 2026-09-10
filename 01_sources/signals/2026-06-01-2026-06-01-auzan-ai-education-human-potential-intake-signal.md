---
id: 2026-06-01-2026-06-01-auzan-ai-education-human-potential-intake-signal
type: signal
status: extracted
created: 2026-06-01
updated: 2026-06-01
topics:
  - youtube
  - ai-education
  - human-potential
  - skills
  - ai-literacy
  - future-of-work
  - signal-extraction
tools:
  - youtube
  - yt-dlp
  - transcribe-media
  - mlx-whisper
  - rbc-investments
  - agent
  - agents
  - workflow
  - eval
  - memory
  - review
  - source
sources:
  - source-12ab2ef7-c930-45fc-960f-8bb2865b4105
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-06-01
processed_at: 2026-06-01T21:03:38.432Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-12ab2ef7-c930-45fc-960f-8bb2865b4105
generated_from:
  - source-12ab2ef7-c930-45fc-960f-8bb2865b4105
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-12ab2ef7-c930-45fc-960f-8bb2865b4105

Date: 2026-06-01
Status: extracted
Source class: video
Retention: source-purged

Date: 2026-06-01
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- Для Techscope важны не общие социальные тезисы, а переносимые выводы: какие навыки, интерфейсы, memory/workflow patterns или критерии обучения стоит учитывать в future agents.
- Подтверждает ли видео текущие стандарты Techscope по обучающим агентам, памяти, evals или human-in-the-loop?
- Description excerpt from metadata: как нейросети меняют обучение и какие навыки станут важнее в эпоху ИИ.
- Источник публичный и экспертно-популярный, но не техническая документация; claims нужно отделять от мнений и не превращать напрямую в стандарты.
- Нужно ли сохранить это как brief про AI education/skills или достаточно refined signal + assessment?
- # Intake: Auzan on AI education and human potential
- Материал касается того, как ИИ меняет обучение, навыки и человеческий потенциал; это может быть полезно для проектирования обучающих и knowledge-work агентов.
- Title: Александр Аузан - о человеческом потенциале России и будущем образования в эпоху ИИ

## Technical details

- Supplied short link was normalized to canonical video id `rWpvwVfU0K4`.
- Есть ли в материале практические выводы для agent engineering, developer education или learning-agent design?
- signal | assessment | brief | review | archive

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Источник публичный и экспертно-популярный, но не техническая документация; claims нужно отделять от мнений и не превращать напрямую в стандарты.
- Нужно ли сохранить это как brief про AI education/skills или достаточно refined signal + assessment?

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- Добавить missing technical details, agent-design implications, risks, verification tasks and candidate rules.
- После ручного Codex-pass обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.
