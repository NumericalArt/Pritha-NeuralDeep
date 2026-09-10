---
id: 2026-05-15-mcp-server-pitfalls-assessment
type: assessment
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [assessment, mcp, tool-design, agent-tools, security, evals, context-management]
tools: [mcp, oauth, claude-desktop, cursor, continue, vscode]
sources:
  - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
  - 01_sources/notes/2026-05-15-habr-mcp-server-pitfalls-source-note.md
  - anonymous incoming article source (purged)
related:
  intakes:
    - 00_inbox/links/2026-05-15-habr-mcp-server-pitfalls-intake.md
  briefs:
    - 02_briefs/2026-05-15-mcp-server-pitfalls-brief.md
  workflows:
    - 07_workflows/expert-information-assessment.md
    - 07_workflows/media-intake-processing.md
recommendation: review
---

# Assessment: mcp-server-pitfalls

Date: 2026-05-15
Status: draft
Recommendation: review

## One-paragraph read

Статья разбирает практические проблемы при создании MCP-серверов: несовместимая авторизация в клиентах, слишком большое количество инструментов, хрупкие цепочки вызовов, плохие описания инструментов, ошибки без remediation steps, нехватка evals, prompt injection and response size/context limits. Для Techscope это сильный материал: он почти напрямую конвертируется в стандарт проектирования MCP tools для будущих агентов.

## Why it matters

- MCP является ключевым интерфейсом между агентами и внешними инструментами.
- Ошибки tool design напрямую ухудшают надежность agent workflows.
- Материал помогает зафиксировать guardrails до того, как мы начнем активно писать собственные MCP servers.
- Совпадает с идеей harness engineering: tool descriptions, errors, tests and CI are prompts and guardrails for agents.

## Technical claims

- MCP tools should not mirror internal API endpoints 1:1.
- Tools should map to user scenarios and high-level intents.
- Tool chains with hidden IDs and ordering constraints are brittle for LLMs.
- Descriptions and parameter schemas are the model-facing UI.
- Error payloads must include actionable recovery instructions.
- Model-tool interaction requires evals/smoke tests in addition to unit tests.
- MCP servers must use least privilege and defend against prompt injection from both users and tool outputs.
- Tool responses must be bounded to protect context window.

## Programming relevance

Score: 5/5

Прямо относится к проектированию MCP servers, APIs for agents, validation, testing, error handling and secure integration.

## Agent engineering relevance

Score: 5/5

Очень высокая. Это материал про то, как LLM выбирает инструменты и где ломается tool use. Применимо к coding agents, research agents, Telegram/YouTube intake agents and future Techscope tools.

## DX impact

Score: 4/5

Хорошие MCP tools уменьшают ручную коррекцию агента. Плохие MCP tools создают путаницу, context waste and debugging burden.

## Evidence quality

Score: 3/5

Практический field report от Bitrix24, но не официальный MCP spec. Перед стандартом нужно сравнить с primary docs and client behavior.

## Practicality

Score: 5/5

Можно применить немедленно как checklist для любого MCP server.

## Leverage

Score: 5/5

Высокий leverage: правильный tool surface может резко повысить надежность агентов и снизить потребность в ручном supervision.

## Risk

Score: 3/5

Есть риск принять частный опыт Bitrix24 как универсальный стандарт. Нужна проверка с official MCP docs and current client support.

## Expert lenses

### Programming

Нужно проектировать MCP server как agent-facing product, а не thin API wrapper. Self-contained tools, validation, typed schemas, pagination and explicit errors are required.

### Agent Engineering

Главный вывод: инструмент является prompt surface. Название, описание, schema, error text, response shape and client support влияют на поведение модели.

### DX

Разработчикам нужен MCP design checklist and test harness, иначе каждый server будет повторять одни и те же ошибки.

### Security

Least privilege, confirmation for destructive actions, filtering external data and audit logging должны быть обязательными требованиями.

### Evidence

Нужно проверить official MCP authorization guidance, current client support and security recommendations.

### Product Pragmatism

Рекомендации достаточно конкретны, чтобы сразу создать draft standard и применять на первом MCP prototype.

## Decision

Не архивировать. Создать brief and follow-up review/standard candidate: `mcp-tool-design`.

## Next artifact

review | standard
