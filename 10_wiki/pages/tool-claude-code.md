---
id: wiki-page-tool-claude-code
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
  - agent-shell-evaluation
  - ai-agents
  - coding-agents
  - codex-cli
  - codex-app
  - hermes
  - openclaw
  - claude-code
  - gemini-cli
  - user-experience
  - security
tools:
  - claude-code
  - codex
  - hermes
  - openclaw
  - gemini-cli
  - obsidian
  - telegram
  - markdown
sources:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  - 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=2ZHHzfMSeWc
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://community.obsidian.md/plugins/karpathywiki
  - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
  - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  - https://www.youtube.com/watch?v=L-HAzfFWSto
  - https://github.com/NousResearch/hermes-agent
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
  - https://github.com/openai/codex
  - https://openai.com/index/introducing-the-codex-app/
  - https://arxiv.org/abs/2603.07670
  - 04_standards/agent-shell-evaluation.md
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
    - 10_wiki/pages/tool-markdown.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/concept-brief.md
    - 10_wiki/pages/concept-youtube-obsidian-wiki-instead-rag.md
    - 10_wiki/pages/topic-agent-shell-evaluation.md
    - 10_wiki/pages/topic-ai-agents.md
    - 10_wiki/pages/topic-coding-agents.md
    - 10_wiki/pages/topic-codex-cli.md
    - 10_wiki/pages/topic-codex-app.md
    - 10_wiki/pages/topic-hermes.md
    - 10_wiki/pages/topic-openclaw.md
    - 10_wiki/pages/topic-claude-code.md
    - 10_wiki/pages/topic-gemini-cli.md
    - 10_wiki/pages/topic-user-experience.md
    - 10_wiki/pages/topic-security.md
    - 10_wiki/pages/tool-hermes.md
    - 10_wiki/pages/tool-openclaw.md
  reviews:
    - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  standards:
    - 04_standards/agent-shell-evaluation.md
generated_from:
  - 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
  - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  - 04_standards/agent-shell-evaluation.md
review_status: unreviewed
confidence: low
last_linted: 2026-05-15
---
# Wiki Page: tool: claude-code

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks claude-code as a tool in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md`: Видео показывает практический Obsidian setup по мотивам LLM Wiki / Karpathy knowledge base pattern: вместо того чтобы каждый раз делать RAG по сырым chunk-ам, агент постепенно компилирует из raw sources связанную Markdown wiki, поддерживает `index.md` и `log.md`, а затем отвечает на запросы через чтение индекса и релевантных страниц. Автор демонстрирует три операции: `ingest` для добавления источников, `query` для ответов по wiki и `lint` для поиска дубликатов, пропущенных страниц, слабых связей и противоречий. - Для умеренного объема знаний LLM Wiki может быть проще и точнее классического RAG: агент работает не с разрозненными chunk-ами, а с уже скомпилированными смысловыми страницами и ссылками. - Базовая структура состоит из трех частей: raw sources, generated wiki и schema/rules file. - Человек выбирает источники и проверяет качество, а LLM создает и поддерживает wiki pages,...
- From `03_reviews/2026-05-17-agent-shell-evaluation-review.md`: Как Techscope должен сравнивать разные агентские среды и оболочки: Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI and future agent runtimes? Нужен единый evaluation contract, чтобы не смешивать: - официальные возможности runtime; - мнение блогеров и advanced users; - реальные локальные эксперименты; - UX для не-разработчиков; - security posture and permission model. Adopt the mixed rubric as a draft working rule now. Use it for all future comparisons of Codex, Hermes, OpenClaw, Claude Code, Gemini CLI and related environments. Do not use advanced-user opinions as proof of architecture, but do preserve them as high-value UX evidence.
- From `04_standards/agent-shell-evaluation.md`: # Standard: agent-shell-evaluation Status: draft Owner: Techscope/user Last reviewed: 2026-05-17 ## Rule При сравнении агентских сред нельзя оценивать только "качество ответа" или популярность инструмента. Нужно фиксировать runtime, дату, модель/provider, memory model, tool surface, permission model, context overhead, operator profile, evidence class and local fit. Этот стандарт пока draft. Он задает рабочую рубрику, но не является окончательным выбором между Codex, Hermes, OpenClaw, Claude Code, Gemini CLI or future runtimes. ## Use when - Появляется материал о новой агентской среде, coding agent, autonomous agent, CLI agent or app shell. - Нужно решить, что использовать для нового проекта или нового агента. - Нужно сравнить Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI or related runtimes. - Источник является мнением продвинутого пользователя, блогера или community report,...

## Evidence sources

- 02_briefs/2026-05-15-youtube-obsidian-wiki-instead-rag-brief.md
- 00_inbox/links/2026-05-15-youtube-obsidian-wiki-instead-rag-intake.md
- raw-source-purged
- https://www.youtube.com/watch?v=2ZHHzfMSeWc
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://community.obsidian.md/plugins/karpathywiki
- 03_reviews/2026-05-17-agent-shell-evaluation-review.md
- 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
- 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
- 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
- 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
- https://www.youtube.com/watch?v=L-HAzfFWSto
- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
- https://github.com/openai/codex
- https://openai.com/index/introducing-the-codex-app/
- https://arxiv.org/abs/2603.07670
- 04_standards/agent-shell-evaluation.md

## Related pages

- [[pages/topic-agent-shell-evaluation|topic: agent-shell-evaluation]]
- [[pages/topic-ai-agents|topic: ai-agents]]
- [[pages/topic-coding-agents|topic: coding-agents]]
- [[pages/topic-codex-cli|topic: codex-cli]]
- [[pages/topic-codex-app|topic: codex-app]]
- [[pages/topic-hermes|topic: hermes]]
- [[pages/topic-openclaw|topic: openclaw]]
- [[pages/topic-claude-code|topic: claude-code]]
- [[pages/topic-gemini-cli|topic: gemini-cli]]
- [[pages/topic-user-experience|topic: user-experience]]
- [[pages/topic-agent-memory|topic: agent-memory]]
- [[pages/topic-security|topic: security]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
