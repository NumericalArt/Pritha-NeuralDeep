---
id: 2026-05-19-2026-05-19-telegram-telegram-user-64-как-дать-агенту-руки-4-типа-подключения-внешних-сервисов-signal
type: signal
status: extracted
created: 2026-05-19
updated: 2026-06-01
topics:
  - telegram
  - inbox
  - signal-extraction
tools:
  - telegram-bot
  - agent
  - agents
  - llm
  - mcp
  - claude
  - api
  - workflow
  - ci
  - review
  - browser
  - source
sources:
  - source-249472f2-159c-465f-9770-79e065c84b73
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-19
processed_at: 2026-06-01T21:03:38.432Z
retention_status: source-purged
usefulness: medium
evidence_quality: uncertain
anonymous_source_id: source-249472f2-159c-465f-9770-79e065c84b73
generated_from:
  - source-249472f2-159c-465f-9770-79e065c84b73
signal_quality: high
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
---

# Signal: source-249472f2-159c-465f-9770-79e065c84b73

Date: 2026-05-19
Status: extracted
Source class: telegram
Retention: source-purged

Date: 2026-05-19
Status: extracted
Signal quality: high
Extraction mode: heuristic-draft
Refinement status: needs-codex-refinement

## Core signal

- Заметил, что стал объяснять эту штуку на воркшопах даже не технарям — с тех пор как Claude Code и Сodex перестали быть инструментами для разработчиков и превратились в агентские среды общего назначения.
- Ему не нужно думать на каждом шаге, потому что в документации API уже есть все нужные методы и не нужно смотреть на страницу, чтобы понять куда дальше кликать.
- Насколько это полезно для программирования, LLM-агентов, coding agents или agent workflows?
- Тип 2: скрипт, вызывающий API (сюда же идут все mcp/cli – это просто доп.
- В реальности, это часто не работает – В реальности мы часто не хотим ждать часы, пока агент кликает страницы, или не готовы платить за API.
- Поведение: агент притворяется фронтендом и дергает внутренний API, который мы нашли через "Network" в консоли разработчика.
- Media: document: agents.mp4; animation: CgACAgIAAxkBAANAagyslqlxs-uHSrBzfc5nncCi2jcAAnqTAAKRXElLO_ZlMFUtsCQ7BA
- Не все функции есть в публичном API: в GetCourse нельзя управлять домашками студентов через API
- Или в нем просто нет того, что нужно
- Нужно заранее знать, какие есть селекторы, как обходить пагинацию и т.д.

## Technical details

- Тип 2.2: Неофициальный API (притворяемся фронтендом)
- Аутентификация тут обычно по кукиз, либо вообще отсутствует, если страница доступна без логина (привет, api.hh.ru/search)
- Как дать агенту "руки": 4 типа подключения внешних сервисов

## Agent design implications

- Проверить, можно ли превратить signal в правила для `AGENTS.md`, skills, MCP tools, reviewer agents, evals или workflows.
- Использовать этот signal как сжатый вход для assessment/review, но возвращаться к sources для финальных решений.

## Candidate rules

- Ему не нужно думать на каждом шаге, потому что в документации API уже есть все нужные методы и не нужно смотреть на страницу, чтобы понять куда дальше кликать.
- Или в нем просто нет того, что нужно
- Нужно заранее знать, какие есть селекторы, как обходить пагинацию и т.д.

## Noise removed

- Вступления, повторы, рекламные блоки, stage banter and generic motivation are intentionally excluded.

## Verification required

- Проверить первоисточники и даты публикации внешних ссылок.
- Сверить claims с official MCP specification and client docs.

## Codex refinement required

- Пройти harness `07_workflows/prompts/signal-extraction-harness.md` в этом Techscope thread.
- Добавить missing technical details, agent-design implications, risks, verification tasks and candidate rules.
- После ручного Codex-pass обновить `status: refined`, `extraction_mode: codex-assisted`, `refinement_status: codex-refined`.
