---
id: 2026-05-17-2026-05-17-youtube-openclaw-hermes-codex-cli-user-experience-intake-signal
type: signal
status: extracted
created: 2026-05-17
updated: 2026-06-01
topics:
  - youtube
  - openclaw
  - hermes
  - codex-cli
  - user-experience
  - non-professional-users
  - ai-agents
  - signal-extraction
tools:
  - youtube
  - yt-dlp
  - mlx-whisper
  - codex
  - openclaw
  - hermes
  - agent
  - agents
  - workflow
  - memory
  - review
  - source
  - standard
sources:
  - source-adf31a54-b2bc-41ed-b12b-14e7b78b42a4
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.430Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-adf31a54-b2bc-41ed-b12b-14e7b78b42a4
generated_from:
  - source-adf31a54-b2bc-41ed-b12b-14e7b78b42a4
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-adf31a54-b2bc-41ed-b12b-14e7b78b42a4

Date: 2026-05-17
Status: extracted
Source class: telegram
Retention: source-purged

Date: 2026-05-17
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- Какие agent-design выводы переносимы в Techscope: memory, Telegram control, Obsidian/wiki, business workflows, autonomy boundaries?
- Такой источник полезен для понимания adoption friction: что понятно, что ломается, что кажется практичным, где не-кодеры упираются в настройку, память, Telegram/CRM/business workflows.
- Title: OpenClaw, Hermes и Codex CLI: какой AI-агент выбрать сейчас
- Что из этого может стать recommendation для будущих agents или standards?
- # Intake: youtube-openclaw-hermes-codex-cli-user-experience
- Это не взгляд профессионального разработчика, а опыт продвинутого пользователя AI-агентов.
- Channel: ALEKSEI ULIANOV | AI-АГЕНТЫ
- Какие реальные pain points у продвинутого не-IT пользователя при выборе OpenClaw/Hermes/Codex CLI?

## Technical details

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Candidate rules require manual review.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- Добавить missing technical details, agent-design implications, risks, verification tasks and candidate rules.
- После ручного Codex-pass обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.
