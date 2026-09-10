---
id: 2026-05-15-mcp-server-pitfalls-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [mcp, tool-design, agent-tools, security, evals, context-management, harness-engineering]
tools: [mcp, oauth, claude-desktop, cursor, continue, vscode]
sources:
  - 01_sources/signals/2026-05-16-2026-05-15-mcp-server-pitfalls-brief-signal.md
  - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
  - 01_sources/notes/2026-05-15-habr-mcp-server-pitfalls-source-note.md
  - 03_reviews/2026-05-15-mcp-server-pitfalls-assessment.md
  - anonymous incoming article source (purged)
related:
  signals:
    - 01_sources/signals/2026-05-16-2026-05-15-mcp-server-pitfalls-brief-signal.md
  intakes:
    - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
  assessments:
    - 03_reviews/2026-05-15-mcp-server-pitfalls-assessment.md
  briefs:
    - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  workflows:
    - 07_workflows/media-intake-processing.md
---

# Brief: mcp-server-pitfalls

Date: 2026-05-15
Source: anonymous incoming source (purged)
Status: draft

## Summary

Статья Битрикс24 описывает восемь практических проблем MCP-server development. Главный вывод для Techscope: MCP server нельзя проектировать как обычную API-обертку. MCP tool surface является интерфейсом для недетерминированной модели, поэтому инструменты должны быть сценарными, самодостаточными, семантически ясными, безопасными, тестируемыми через model behavior and bounded by context limits.

## Key claims

- Авторизация в MCP clients пока неоднородна; remote MCP auth требует client compatibility matrix.
- 1:1 mapping API endpoints to MCP tools creates tool-selection confusion.
- Long dependent chains are brittle; prefer high-level tools that hide IDs and sequencing.
- Tool descriptions and parameter descriptions are the only UI the model reliably sees.
- Error messages should be written as recovery prompts.
- Unit tests test tool code, not whether the model uses tools correctly; add scenario evals and smoke tests.
- Prompt injection can enter through user prompts, database/API content and malicious MCP server outputs.
- Tool responses must be bounded and paginated to preserve context.

## Techscope implications

- Create `mcp-tool-design` standard before building real MCP servers.
- Prefer local-first MCP servers until auth/client support is clear.
- Keep tool count small: start with 3-5 scenario tools per server.
- Add eval fixtures for expected tool choice and parameter shape.
- Treat error text as part of prompt engineering.
- Require least privilege, audit logs and confirmation for destructive actions.
- Add response-size policy: default limits, pagination and summarization.

## Relationship to harness engineering

This article complements OpenAI harness engineering:

- Harness engineering says prompts, skills, tests, lints and review agents are guardrails.
- MCP pitfall analysis says MCP tool schema, descriptions, errors and response shapes are also guardrails.
- Together they imply: agent tools must be designed, tested and documented as part of the harness, not as incidental API wrappers.

## Recommendation

Promote to review/standard candidate:

```text
04_standards/mcp-tool-design.md
```

But before making it active, compare against official MCP spec and current client behavior.

## Next step

Create `03_reviews/2026-05-15-mcp-tool-design-review.md` or draft standard `04_standards/mcp-tool-design.md`.
