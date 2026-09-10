---
id: 2026-05-16-2026-05-15-habr-mcp-server-pitfalls-intake-signal
type: signal
status: extracted
created: 2026-05-16
updated: 2026-06-01
topics:
  - habr
  - mcp
  - tool-design
  - agent-tools
  - security
  - evals
  - context-management
  - signal-extraction
tools:
  - mcp
  - oauth
  - claude-desktop
  - cursor
  - continue
  - vscode
  - agent
  - tool
  - workflow
  - auth
  - review
  - source
  - standard
sources:
  - source-13bc4e08-6c3b-4ba9-815e-3bec530ea479
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-16
processed_at: 2026-06-01T21:03:38.426Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-13bc4e08-6c3b-4ba9-815e-3bec530ea479
generated_from:
  - source-13bc4e08-6c3b-4ba9-815e-3bec530ea479
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-13bc4e08-6c3b-4ba9-815e-3bec530ea479

Date: 2026-05-16
Status: extracted
Source class: video
Retention: source-purged

Date: 2026-05-16
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- MCP напрямую относится к agent tooling и будущим агентам Techscope.
- Материал содержит набор concrete pitfalls, которые можно превратить в checklist или standard для MCP tool design.
- Какие правила MCP tool design стоит зафиксировать как стандарт?
- Какие риски особенно важны для наших будущих агентов?
- Статья описывает практические проблемы разработки MCP-серверов.
- Title: Что может пойти и обязательно пойдет не так при написании MCP-сервера
- Author: vasilyev / команда AI Битрикс24
- Как соотнести рекомендации с OpenAI harness engineering и нашими текущими workflows?

## Technical details

- Published: 2026-03-16 inferred from Habr current-year display

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Candidate rules require manual review.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official MCP specification and client docs.
- Проверить security implications отдельно перед стандартом.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- После refinement обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.
