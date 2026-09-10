---
id: wiki-page-topic-context-management
type: wiki-page
status: generated
created: 2026-05-15
updated: 2026-05-15
topics:
  - context-management
  - mcp
  - tool-design
  - agent-tools
  - security
  - evals
  - harness-engineering
tools:
  - mcp
  - oauth
  - claude-desktop
  - cursor
  - continue
  - vscode
sources:
  - 02_briefs/2026-05-15-mcp-server-pitfalls-brief.md
  - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
  - 01_sources/notes/2026-05-15-habr-mcp-server-pitfalls-source-note.md
  - 03_reviews/2026-05-15-mcp-server-pitfalls-assessment.md
  - https://habr.com/ru/companies/bitrix/articles/1009150/
related:
  briefs:
    - 02_briefs/2026-05-15-mcp-server-pitfalls-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-mcp.md
    - 10_wiki/pages/topic-tool-design.md
    - 10_wiki/pages/topic-agent-tools.md
    - 10_wiki/pages/topic-security.md
    - 10_wiki/pages/topic-evals.md
    - 10_wiki/pages/topic-harness-engineering.md
    - 10_wiki/pages/tool-mcp.md
    - 10_wiki/pages/tool-oauth.md
    - 10_wiki/pages/tool-claude-desktop.md
    - 10_wiki/pages/tool-cursor.md
    - 10_wiki/pages/tool-continue.md
    - 10_wiki/pages/tool-vscode.md
    - 10_wiki/pages/concept-brief.md
    - 10_wiki/pages/concept-mcp-server-pitfalls.md
generated_from:
  - 02_briefs/2026-05-15-mcp-server-pitfalls-brief.md
review_status: unreviewed
confidence: low
last_linted: 
---
# Wiki Page: topic: context-management

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks context-management as a topic in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-15-mcp-server-pitfalls-brief.md`: Статья Битрикс24 описывает восемь практических проблем MCP-server development. Главный вывод для Techscope: MCP server нельзя проектировать как обычную API-обертку. MCP tool surface является интерфейсом для недетерминированной модели, поэтому инструменты должны быть сценарными, самодостаточными, семантически ясными, безопасными, тестируемыми через model behavior and bounded by context limits. - Авторизация в MCP clients пока неоднородна; remote MCP auth требует client compatibility matrix. - 1:1 mapping API endpoints to MCP tools creates tool-selection confusion. - Long dependent chains are brittle; prefer high-level tools that hide IDs and sequencing. - Tool descriptions and parameter descriptions are the only UI the model reliably sees. - Error messages should be written as recovery prompts. - Unit tests test tool code, not whether the model uses tools correctly; add scenario evals...

## Evidence sources

- 02_briefs/2026-05-15-mcp-server-pitfalls-brief.md
- 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
- 01_sources/notes/2026-05-15-habr-mcp-server-pitfalls-source-note.md
- 03_reviews/2026-05-15-mcp-server-pitfalls-assessment.md
- https://habr.com/ru/companies/bitrix/articles/1009150/

## Related pages

- [[pages/topic-mcp|topic: mcp]]
- [[pages/topic-tool-design|topic: tool-design]]
- [[pages/topic-agent-tools|topic: agent-tools]]
- [[pages/topic-security|topic: security]]
- [[pages/topic-evals|topic: evals]]
- [[pages/topic-harness-engineering|topic: harness-engineering]]
- [[pages/tool-mcp|tool: mcp]]
- [[pages/tool-oauth|tool: oauth]]
- [[pages/tool-claude-desktop|tool: claude-desktop]]
- [[pages/tool-cursor|tool: cursor]]
- [[pages/tool-continue|tool: continue]]
- [[pages/tool-vscode|tool: vscode]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
