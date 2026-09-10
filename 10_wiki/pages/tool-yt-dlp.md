---
id: wiki-page-tool-yt-dlp
type: wiki-page
status: generated
created: 2026-05-15
updated: 2026-05-15
topics:
  - youtube
  - obsidian
  - llm-wiki
  - rag
  - knowledge-base
  - agent-memory
  - markdown
tools:
  - yt-dlp
  - mlx-whisper
  - obsidian
  - markdown
  - codex
  - claude-code
sources:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  - 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=2ZHHzfMSeWc
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://community.obsidian.md/plugins/karpathywiki
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
    - 10_wiki/pages/tool-mlx-whisper.md
    - 10_wiki/pages/tool-obsidian.md
    - 10_wiki/pages/tool-markdown.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-claude-code.md
    - 10_wiki/pages/concept-brief.md
    - 10_wiki/pages/concept-youtube-obsidian-wiki-instead-rag.md
generated_from:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
review_status: unreviewed
confidence: low
last_linted: 2026-05-15
---
# Wiki Page: tool: yt-dlp

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks yt-dlp as a tool in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md`: Видео показывает практический Obsidian setup по мотивам LLM Wiki / Karpathy knowledge base pattern: вместо того чтобы каждый раз делать RAG по сырым chunk-ам, агент постепенно компилирует из raw sources связанную Markdown wiki, поддерживает `index.md` и `log.md`, а затем отвечает на запросы через чтение индекса и релевантных страниц. Автор демонстрирует три операции: `ingest` для добавления источников, `query` для ответов по wiki и `lint` для поиска дубликатов, пропущенных страниц, слабых связей и противоречий. - Для умеренного объема знаний LLM Wiki может быть проще и точнее классического RAG: агент работает не с разрозненными chunk-ами, а с уже скомпилированными смысловыми страницами и ссылками. - Базовая структура состоит из трех частей: raw sources, generated wiki и schema/rules file. - Человек выбирает источники и проверяет качество, а LLM создает и поддерживает wiki pages,...

## Evidence sources

- 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
- 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
- raw-source-purged
- https://www.youtube.com/watch?v=2ZHHzfMSeWc
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://community.obsidian.md/plugins/karpathywiki

## Related pages

- [[pages/topic-youtube|topic: youtube]]
- [[pages/topic-obsidian|topic: obsidian]]
- [[pages/topic-llm-wiki|topic: llm-wiki]]
- [[pages/topic-rag|topic: rag]]
- [[pages/topic-knowledge-base|topic: knowledge-base]]
- [[pages/topic-agent-memory|topic: agent-memory]]
- [[pages/topic-markdown|topic: markdown]]
- [[pages/tool-mlx-whisper|tool: mlx-whisper]]
- [[pages/tool-obsidian|tool: obsidian]]
- [[pages/tool-markdown|tool: markdown]]
- [[pages/tool-codex|tool: codex]]
- [[pages/tool-claude-code|tool: claude-code]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
