---
id: wiki-page-topic-hermes
type: wiki-page
status: generated
created: 2026-05-17
updated: 2026-05-17
topics:
  - hermes
  - agent-shell-evaluation
  - ai-agents
  - coding-agents
  - codex-cli
  - codex-app
  - openclaw
  - claude-code
  - gemini-cli
  - user-experience
  - agent-memory
  - security
tools:
  - openclaw
  - hermes
  - codex
  - obsidian
  - telegram
  - youtube
  - mlx-whisper
  - claude-code
  - gemini-cli
  - markdown
sources:
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
  - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=L-HAzfFWSto
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://github.com/NousResearch/hermes-agent
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
  - https://github.com/openai/codex
  - https://openai.com/index/introducing-the-codex-app/
  - https://arxiv.org/abs/2603.07670
  - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
  - 04_standards/agent-shell-evaluation.md
related:
  briefs:
    - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-openclaw.md
    - 10_wiki/pages/topic-codex-cli.md
    - 10_wiki/pages/topic-ai-agents.md
    - 10_wiki/pages/topic-user-experience.md
    - 10_wiki/pages/topic-non-professional-users.md
    - 10_wiki/pages/topic-agent-memory.md
    - 10_wiki/pages/topic-llm-wiki.md
    - 10_wiki/pages/topic-telegram-agents.md
    - 10_wiki/pages/tool-openclaw.md
    - 10_wiki/pages/tool-hermes.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-obsidian.md
    - 10_wiki/pages/tool-telegram.md
    - 10_wiki/pages/tool-youtube.md
    - 10_wiki/pages/tool-mlx-whisper.md
    - 10_wiki/pages/topic-agent-shell-evaluation.md
    - 10_wiki/pages/topic-coding-agents.md
    - 10_wiki/pages/topic-codex-app.md
    - 10_wiki/pages/topic-claude-code.md
    - 10_wiki/pages/topic-gemini-cli.md
    - 10_wiki/pages/topic-security.md
    - 10_wiki/pages/tool-claude-code.md
  reviews:
    - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  standards:
    - 04_standards/agent-shell-evaluation.md
generated_from:
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  - 04_standards/agent-shell-evaluation.md
review_status: unreviewed
confidence: low
last_linted: 
---
# Wiki Page: topic: hermes

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks hermes as a topic in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md`: Видео полезно как UX-свидетельство продвинутого пользователя, который не является профессиональным разработчиком, но активно использует агентские системы. Его главный практический вывод: выбор агентской среды для реальной работы определяется не "самым умным" ответом, а стабильностью контура, управлением памятью, стоимостью контекста, прозрачностью tools/skills and recovery after restart. Для Techscope это подтверждает уже выбранную архитектуру: входящие материалы должны превращаться не в сырые длинные контексты, а в source note, refined signal, brief/review and generated wiki layer. Для будущих агентов особенно важны thin interfaces for users and explicit harness rules for memory, tools, permissions and completion. - Agent shells differ mainly by harness thickness: how much context, tools, persona and memory they inject before the model answers. - Rich/personal shells can be pleasant...
- From `03_reviews/2026-05-17-agent-shell-evaluation-review.md`: Как Techscope должен сравнивать разные агентские среды и оболочки: Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI and future agent runtimes? Нужен единый evaluation contract, чтобы не смешивать: - официальные возможности runtime; - мнение блогеров и advanced users; - реальные локальные эксперименты; - UX для не-разработчиков; - security posture and permission model. Adopt the mixed rubric as a draft working rule now. Use it for all future comparisons of Codex, Hermes, OpenClaw, Claude Code, Gemini CLI and related environments. Do not use advanced-user opinions as proof of architecture, but do preserve them as high-value UX evidence.
- From `04_standards/agent-shell-evaluation.md`: # Standard: agent-shell-evaluation Status: draft Owner: Techscope/user Last reviewed: 2026-05-17 ## Rule При сравнении агентских сред нельзя оценивать только "качество ответа" или популярность инструмента. Нужно фиксировать runtime, дату, модель/provider, memory model, tool surface, permission model, context overhead, operator profile, evidence class and local fit. Этот стандарт пока draft. Он задает рабочую рубрику, но не является окончательным выбором между Codex, Hermes, OpenClaw, Claude Code, Gemini CLI or future runtimes. ## Use when - Появляется материал о новой агентской среде, coding agent, autonomous agent, CLI agent or app shell. - Нужно решить, что использовать для нового проекта или нового агента. - Нужно сравнить Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI or related runtimes. - Источник является мнением продвинутого пользователя, блогера или community report,...

## Evidence sources

- 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
- 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
- 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
- raw-source-purged
- https://www.youtube.com/watch?v=L-HAzfFWSto
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://github.com/NousResearch/hermes-agent
- https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
- https://github.com/openai/codex
- https://openai.com/index/introducing-the-codex-app/
- https://arxiv.org/abs/2603.07670
- 03_reviews/2026-05-17-agent-shell-evaluation-review.md
- 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
- 04_standards/agent-shell-evaluation.md

## Related pages

- [[pages/topic-agent-shell-evaluation|topic: agent-shell-evaluation]]
- [[pages/topic-ai-agents|topic: ai-agents]]
- [[pages/topic-coding-agents|topic: coding-agents]]
- [[pages/topic-codex-cli|topic: codex-cli]]
- [[pages/topic-codex-app|topic: codex-app]]
- [[pages/topic-openclaw|topic: openclaw]]
- [[pages/topic-claude-code|topic: claude-code]]
- [[pages/topic-gemini-cli|topic: gemini-cli]]
- [[pages/topic-user-experience|topic: user-experience]]
- [[pages/topic-agent-memory|topic: agent-memory]]
- [[pages/topic-security|topic: security]]
- [[pages/tool-codex|tool: codex]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
