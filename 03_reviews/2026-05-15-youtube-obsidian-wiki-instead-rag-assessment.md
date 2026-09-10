---
id: 2026-05-15-youtube-obsidian-wiki-instead-rag-assessment
type: assessment
status: draft
created: 2026-05-15
updated: 2026-06-01
topics:
  - assessment
  - youtube
  - obsidian
  - llm-wiki
  - rag
  - knowledge-base
  - agent-memory
  - coding-agents
tools:
  - yt-dlp
  - mlx-whisper
  - obsidian
  - markdown
  - codex
  - claude-code
  - sqlite
  - embeddings
sources:
  - source-a2c2b8f8-6ba1-4680-a88b-08819c2959e2
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-15
processed_at: 2026-06-01T21:03:38.438Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-a2c2b8f8-6ba1-4680-a88b-08819c2959e2
recommendation: experiment
---

# Assessment: source-a2c2b8f8-6ba1-4680-a88b-08819c2959e2

Date: 2026-05-15
Status: draft
Source class: video
Retention: source-purged

Date: 2026-05-15
Status: draft
Recommendation: experiment

## One-paragraph read

## Why it matters

- Это прямой материал про agent memory, knowledge base design and Obsidian-centered workflow.
- Он совпадает с нашей текущей траекторией, но добавляет ясную операционную модель: `ingest`, `query`, `lint`.
- Он дает проверяемую гипотезу: для небольших и средних исследовательских доменов связанная wiki может давать агенту лучшее понимание, чем поиск по отдельным chunks.
- Он показывает, что Obsidian может быть не только UI для человека, но и средой инспекции агентной памяти.

## Technical claims

- RAG дробит знания на chunks и каждый раз заново собирает контекст под вопрос.
- LLM Wiki переносит часть работы на ingest-time: агент заранее создает смысловые страницы, связи, индекс и лог.
- `index.md` нужен как карта базы знаний для query-time navigation.
- `log.md` нужен для воспроизводимости и защиты от повторной обработки.
- `lint` нужен как регулярное обслуживание базы знаний: orphan pages, missing concepts, duplicate concepts, broken links, stale assumptions.
- Под разные домены лучше иметь отдельные wiki, чтобы индекс и контекст оставались управляемыми.

## Programming relevance

Score: 4/5

Прямой программный материал умеренный, но архитектурная польза высокая: это workflow для Markdown-based knowledge systems, agent CLI workflows and local developer environments. В применении к coding agents паттерн может хранить проектные решения, архитектурные правила, lessons learned, recurring bugs and codebase conventions.

## Agent engineering relevance

Score: 5/5

Очень сильная связь с агентами. Паттерн задает persistent memory loop: агент не просто отвечает, а улучшает внешнюю память. Для coding agents это может уменьшить повторное "холодное" чтение проекта, помочь с onboarding and reduce context loss between sessions.

## DX impact

Score: 4/5

Для человека DX хорош: Markdown, Obsidian graph, links, reviewable files, normal diff. Для агента DX тоже хорош: обычные файлы, явные инструкции, индекс, лог. Минус: появляется дисциплина обслуживания и риск, что человек перестанет отличать источник от пересказа.

## Evidence quality

Score: 3/5

Видео вторичное, но практическое и подтверждается внешними материалами: Karpathy gist, Obsidian plugin, быстро растущая экосистема обсуждений. Этого достаточно для эксперимента, но недостаточно для немедленного стандарта.

## Practicality

Score: 5/5

Очень практично для нас: почти все базовые части уже есть. Нужно не внедрять новую БД, а добавить workflow and folder policy для agent-maintained wiki layer.

## Leverage

Score: 5/5

Потенциальный leverage высокий: если слой сработает, Techscope станет не просто архивом brief/review/decision, а живой картой понятий, которая помогает агенту быстрее строить связи между источниками, стандартами и решениями.

## Risk

Score: 3/5

## Expert lenses

### Programming

Полезно для проектной памяти: coding conventions, architecture notes, library choices, recurring fixes, deployment constraints. Не заменяет tests, docs or ADRs, но может связывать их и делать доступными агенту в query-time.

### Agent Engineering

Главная идея: память агента должна не только искать, но и накапливать обработанную структуру. Это хорошо сочетается с subagents and expert roles: после ingest можно создавать страницы concepts/tools/patterns, а standards-editor может превращать зрелые страницы в standards or decisions.

### DX

Obsidian graph и Markdown links дают человеку видимую, редактируемую память. Но нужно не смешивать "человеческие" documents with generated wiki pages. Для Techscope лучше завести отдельный generated слой с явным статусом.

### Security

Если в raw попадают рабочие чаты, клиентские звонки или внутренние документы, нужны правила приватности: не синкать raw через Obsidian Sync без явного решения, не отправлять чувствительные данные внешним LLM, не публиковать generated pages, которые содержат пересказ секретов.

### Evidence

Достаточно для локального эксперимента. Перед стандартом нужно проверить первоисточник Karpathy, существующие реализации, ограничения на масштабе, поведение при противоречивых sources and stale data.

### Product Pragmatism

Не стоит уходить в тяжелую graph DB или отдельный продукт. Самый дешевый эксперимент: поверх текущего vault добавить generated wiki folder, index/log and command discipline.

## Decision

Не архивировать. Принять как кандидат на эксперимент. Текущую архитектуру `Markdown + SQLite + embeddings + Obsidian` оставить; LLM Wiki рассматривать как дополнительный human-reviewable synthesis layer, а не замену semantic search.

## Next artifact

experiment
