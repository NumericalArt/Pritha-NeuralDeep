---
id: wiki-page-tool-markdown
type: wiki-page
status: generated
created: 2026-05-15
updated: 2026-05-16
topics:
  - youtube
  - obsidian
  - llm-wiki
  - rag
  - knowledge-base
  - agent-memory
  - markdown
  - coding-agents
  - agent-evals
  - test-first-development
  - harness-engineering
  - acceptance-criteria
  - dx
  - security
tools:
  - markdown
  - codex
  - superpowers
  - npm
  - lint
  - ci
sources:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  - 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=2ZHHzfMSeWc
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://community.obsidian.md/plugins/karpathywiki
  - 03_reviews/2026-05-16-test-first-agent-workflow-review.md
  - 01_sources/signals/2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal.md
  - 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
  - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  - 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
  - https://t.me/tosoltaime/42
  - https://openai.com/index/harness-engineering/
related:
  briefs:
    - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-youtube.md
    - 10_wiki/pages/topic-obsidian.md
    - 10_wiki/pages/topic-llm-wiki.md
    - 10_wiki/pages/topic-rag.md
    - 10_wiki/pages/topic-knowledge-base.md
    - 10_wiki/pages/topic-agent-memory.md
    - 10_wiki/pages/topic-markdown.md
    - 10_wiki/pages/tool-yt-dlp.md
    - 10_wiki/pages/tool-mlx-whisper.md
    - 10_wiki/pages/tool-obsidian.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-claude-code.md
    - 10_wiki/pages/concept-brief.md
    - 10_wiki/pages/concept-youtube-obsidian-wiki-instead-rag.md
    - 10_wiki/pages/topic-coding-agents.md
    - 10_wiki/pages/topic-agent-evals.md
    - 10_wiki/pages/topic-test-first-development.md
    - 10_wiki/pages/topic-harness-engineering.md
    - 10_wiki/pages/topic-acceptance-criteria.md
    - 10_wiki/pages/topic-dx.md
    - 10_wiki/pages/topic-security.md
    - 10_wiki/pages/tool-superpowers.md
    - 10_wiki/pages/tool-npm.md
    - 10_wiki/pages/tool-lint.md
    - 10_wiki/pages/tool-ci.md
    - 10_wiki/pages/concept-review.md
    - 10_wiki/pages/concept-test-first-agent-workflow.md
  reviews:
    - 03_reviews/2026-05-16-test-first-agent-workflow-review.md
generated_from:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  - 03_reviews/2026-05-16-test-first-agent-workflow-review.md
review_status: unreviewed
confidence: low
last_linted: 2026-05-15
---
# Wiki Page: tool: markdown

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks markdown as a tool in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md`: Видео показывает практический Obsidian setup по мотивам LLM Wiki / Karpathy knowledge base pattern: вместо того чтобы каждый раз делать RAG по сырым chunk-ам, агент постепенно компилирует из raw sources связанную Markdown wiki, поддерживает `index.md` и `log.md`, а затем отвечает на запросы через чтение индекса и релевантных страниц. Автор демонстрирует три операции: `ingest` для добавления источников, `query` для ответов по wiki и `lint` для поиска дубликатов, пропущенных страниц, слабых связей и противоречий. - Для умеренного объема знаний LLM Wiki может быть проще и точнее классического RAG: агент работает не с разрозненными chunk-ами, а с уже скомпилированными смысловыми страницами и ссылками. - Базовая структура состоит из трех частей: raw sources, generated wiki и schema/rules file. - Человек выбирает источники и проверяет качество, а LLM создает и поддерживает wiki pages,...
- From `03_reviews/2026-05-16-test-first-agent-workflow-review.md`: Should Techscope adopt a default workflow where coding agents receive spec, acceptance criteria and machine-checkable tests/evals before implementation? Adopt as an experiment, not yet as an active standard. If the next 2-3 coding tasks show better reliability, create a standard candidate: ```text 04_standards/test-first-agent-workflow.md ``` with progressive levels: - Level 0: command-only verification for trivial edits. - Level 1: spec + acceptance criteria for normal tasks. - Level 2: failing tests/evals before implementation for non-trivial tasks. - Level 3: independent QA/security/product lens before implementation for risky or user-facing tasks.

## Evidence sources

- 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
- 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
- raw-source-purged
- https://www.youtube.com/watch?v=2ZHHzfMSeWc
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://community.obsidian.md/plugins/karpathywiki
- 03_reviews/2026-05-16-test-first-agent-workflow-review.md
- 01_sources/signals/2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal.md
- 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
- 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
- 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
- https://t.me/tosoltaime/42
- https://openai.com/index/harness-engineering/

## Related pages

- [[pages/topic-coding-agents|topic: coding-agents]]
- [[pages/topic-agent-evals|topic: agent-evals]]
- [[pages/topic-test-first-development|topic: test-first-development]]
- [[pages/topic-harness-engineering|topic: harness-engineering]]
- [[pages/topic-acceptance-criteria|topic: acceptance-criteria]]
- [[pages/topic-dx|topic: dx]]
- [[pages/topic-security|topic: security]]
- [[pages/tool-codex|tool: codex]]
- [[pages/tool-superpowers|tool: superpowers]]
- [[pages/tool-npm|tool: npm]]
- [[pages/tool-lint|tool: lint]]
- [[pages/tool-ci|tool: ci]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
