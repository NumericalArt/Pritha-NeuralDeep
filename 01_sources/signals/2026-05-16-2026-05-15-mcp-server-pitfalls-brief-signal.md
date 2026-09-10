---
id: 2026-05-16-2026-05-15-mcp-server-pitfalls-brief-signal
type: signal
status: extracted
created: 2026-05-16
updated: 2026-06-01
topics:
  - mcp
  - tool-design
  - agent-tools
  - security
  - evals
  - context-management
  - harness-engineering
  - signal-extraction
tools:
  - mcp
  - oauth
  - claude-desktop
  - cursor
  - continue
  - vscode
  - agent
  - agents
  - prompt
  - tool
  - tools
  - api
  - eval
  - test
  - ci
  - lint
  - guardrail
  - context
  - database
  - auth
sources:
  - source-c4ae562c-e9c1-4f4e-b9e9-dea3e1bcbf40
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
anonymous_source_id: source-c4ae562c-e9c1-4f4e-b9e9-dea3e1bcbf40
generated_from:
  - source-c4ae562c-e9c1-4f4e-b9e9-dea3e1bcbf40
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-c4ae562c-e9c1-4f4e-b9e9-dea3e1bcbf40

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

- MCP tool surface является интерфейсом для недетерминированной модели, поэтому инструменты должны быть сценарными, самодостаточными, семантически ясными, безопасными, тестируемыми через model behavior and bounded by context limits.
- Harness engineering says prompts, skills, tests, lints and review agents are guardrails.
- Unit tests test tool code, not whether the model uses tools correctly; add scenario evals and smoke tests.
- Together they imply: agent tools must be designed, tested and documented as part of the harness, not as incidental API wrappers.
- Prompt injection can enter through user prompts, database/API content and malicious MCP server outputs.
- MCP pitfall analysis says MCP tool schema, descriptions, errors and response shapes are also guardrails.
- 1:1 mapping API endpoints to MCP tools creates tool-selection confusion.
- Error messages should be written as recovery prompts.
- Tool responses must be bounded and paginated to preserve context.
- Add eval fixtures for expected tool choice and parameter shape.

## Technical details

- Long dependent chains are brittle; prefer high-level tools that hide IDs and sequencing.
- Create `mcp-tool-design` standard before building real MCP servers.
- Главный вывод для Techscope: MCP server нельзя проектировать как обычную API-обертку.
- Авторизация в MCP clients пока неоднородна; remote MCP auth требует client compatibility matrix.

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- MCP tool surface является интерфейсом для недетерминированной модели, поэтому инструменты должны быть сценарными, самодостаточными, семантически ясными, безопасными, тестируемыми через model behavior and bounded by context limits.
- Together they imply: agent tools must be designed, tested and documented as part of the harness, not as incidental API wrappers.
- Error messages should be written as recovery prompts.
- Tool responses must be bounded and paginated to preserve context.
- Long dependent chains are brittle; prefer high-level tools that hide IDs and sequencing.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official MCP specification and client docs.
- Проверить security implications отдельно перед стандартом.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- Сверить, какие rules уже достаточно зрелые для `mcp-tool-design` review/standard candidate.
- После refinement обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.
