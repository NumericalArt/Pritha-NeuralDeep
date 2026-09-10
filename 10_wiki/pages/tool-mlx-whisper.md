---
id: wiki-page-tool-mlx-whisper
type: wiki-page
status: generated
created: 2026-05-15
updated: 2026-05-17
topics:
  - youtube
  - obsidian
  - llm-wiki
  - rag
  - knowledge-base
  - agent-memory
  - markdown
  - openclaw
  - hermes
  - codex-cli
  - ai-agents
  - user-experience
  - non-professional-users
  - telegram-agents
tools:
  - mlx-whisper
  - openclaw
  - hermes
  - codex
  - obsidian
  - telegram
  - youtube
sources:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  - 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=2ZHHzfMSeWc
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://community.obsidian.md/plugins/karpathywiki
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
  - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=L-HAzfFWSto
  - https://github.com/NousResearch/hermes-agent
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
  - https://github.com/openai/codex
  - https://openai.com/index/introducing-the-codex-app/
  - https://arxiv.org/abs/2603.07670
related:
  briefs:
    - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
    - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-youtube.md
    - 10_wiki/pages/topic-obsidian.md
    - 10_wiki/pages/topic-llm-wiki.md
    - 10_wiki/pages/topic-rag.md
    - 10_wiki/pages/topic-knowledge-base.md
    - 10_wiki/pages/topic-agent-memory.md
    - 10_wiki/pages/topic-markdown.md
    - 10_wiki/pages/tool-yt-dlp.md
    - 10_wiki/pages/tool-obsidian.md
    - 10_wiki/pages/tool-markdown.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-claude-code.md
    - 10_wiki/pages/concept-brief.md
    - 10_wiki/pages/concept-youtube-obsidian-wiki-instead-rag.md
    - 10_wiki/pages/topic-openclaw.md
    - 10_wiki/pages/topic-hermes.md
    - 10_wiki/pages/topic-codex-cli.md
    - 10_wiki/pages/topic-ai-agents.md
    - 10_wiki/pages/topic-user-experience.md
    - 10_wiki/pages/topic-non-professional-users.md
    - 10_wiki/pages/topic-telegram-agents.md
    - 10_wiki/pages/tool-openclaw.md
    - 10_wiki/pages/tool-hermes.md
    - 10_wiki/pages/tool-telegram.md
    - 10_wiki/pages/tool-youtube.md
generated_from:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
review_status: unreviewed
confidence: low
last_linted: 2026-05-15
---
# Wiki Page: tool: mlx-whisper

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks mlx-whisper as a tool in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md`: Видео показывает практический Obsidian setup по мотивам LLM Wiki / Karpathy knowledge base pattern: вместо того чтобы каждый раз делать RAG по сырым chunk-ам, агент постепенно компилирует из raw sources связанную Markdown wiki, поддерживает `index.md` и `log.md`, а затем отвечает на запросы через чтение индекса и релевантных страниц. Автор демонстрирует три операции: `ingest` для добавления источников, `query` для ответов по wiki и `lint` для поиска дубликатов, пропущенных страниц, слабых связей и противоречий. - Для умеренного объема знаний LLM Wiki может быть проще и точнее классического RAG: агент работает не с разрозненными chunk-ами, а с уже скомпилированными смысловыми страницами и ссылками. - Базовая структура состоит из трех частей: raw sources, generated wiki и schema/rules file. - Человек выбирает источники и проверяет качество, а LLM создает и поддерживает wiki pages,...
- From `02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md`: Видео полезно как UX-свидетельство продвинутого пользователя, который не является профессиональным разработчиком, но активно использует агентские системы. Его главный практический вывод: выбор агентской среды для реальной работы определяется не "самым умным" ответом, а стабильностью контура, управлением памятью, стоимостью контекста, прозрачностью tools/skills and recovery after restart. Для Techscope это подтверждает уже выбранную архитектуру: входящие материалы должны превращаться не в сырые длинные контексты, а в source note, refined signal, brief/review and generated wiki layer. Для будущих агентов особенно важны thin interfaces for users and explicit harness rules for memory, tools, permissions and completion. - Agent shells differ mainly by harness thickness: how much context, tools, persona and memory they inject before the model answers. - Rich/personal shells can be pleasant...

## Evidence sources

- 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
- 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
- raw-source-purged
- https://www.youtube.com/watch?v=2ZHHzfMSeWc
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://community.obsidian.md/plugins/karpathywiki
- 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
- 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
- 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
- raw-source-purged
- https://www.youtube.com/watch?v=L-HAzfFWSto
- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
- https://github.com/openai/codex
- https://openai.com/index/introducing-the-codex-app/
- https://arxiv.org/abs/2603.07670

## Related pages

- [[pages/topic-openclaw|topic: openclaw]]
- [[pages/topic-hermes|topic: hermes]]
- [[pages/topic-codex-cli|topic: codex-cli]]
- [[pages/topic-ai-agents|topic: ai-agents]]
- [[pages/topic-user-experience|topic: user-experience]]
- [[pages/topic-non-professional-users|topic: non-professional-users]]
- [[pages/topic-agent-memory|topic: agent-memory]]
- [[pages/topic-llm-wiki|topic: llm-wiki]]
- [[pages/topic-telegram-agents|topic: telegram-agents]]
- [[pages/tool-openclaw|tool: openclaw]]
- [[pages/tool-hermes|tool: hermes]]
- [[pages/tool-codex|tool: codex]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
