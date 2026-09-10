---
id: wiki-page-topic-ai-agents
type: wiki-page
status: generated
created: 2026-05-17
updated: 2026-05-18
topics:
  - ai-agents
  - harness-engineering
  - context-engineering
  - agent-memory
  - evaluation
  - observability
  - tool-use
  - recovery
  - techscope
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
  - medium
  - anthropic
  - openai
  - langchain
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
  - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
  - 01_sources/notes/2026-05-17-medium-harness-engineering-six-layer-source-note.md
  - 01_sources/signals/2026-05-17-medium-harness-engineering-six-layer-signal.md
  - raw-source-purged
  - https://medium.com/%40bollen_en_kersen/list/ai-engineering-302c79906afa
  - https://openai.com/index/harness-engineering/
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://www.anthropic.com/engineering/building-effective-agents
related:
  briefs:
    - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
    - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-openclaw.md
    - 10_wiki/pages/topic-hermes.md
    - 10_wiki/pages/topic-codex-cli.md
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
    - 10_wiki/pages/topic-harness-engineering.md
    - 10_wiki/pages/topic-context-engineering.md
    - 10_wiki/pages/topic-evaluation.md
    - 10_wiki/pages/topic-observability.md
    - 10_wiki/pages/topic-tool-use.md
    - 10_wiki/pages/topic-recovery.md
    - 10_wiki/pages/topic-techscope.md
    - 10_wiki/pages/tool-medium.md
    - 10_wiki/pages/tool-anthropic.md
    - 10_wiki/pages/tool-openai.md
    - 10_wiki/pages/tool-langchain.md
    - 10_wiki/pages/concept-brief.md
    - 10_wiki/pages/concept-harness.md
  reviews:
    - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  standards:
    - 04_standards/agent-shell-evaluation.md
generated_from:
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  - 04_standards/agent-shell-evaluation.md
  - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
review_status: unreviewed
confidence: low
last_linted: 
---
# Wiki Page: topic: ai-agents

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks ai-agents as a topic in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md`: Видео полезно как UX-свидетельство продвинутого пользователя, который не является профессиональным разработчиком, но активно использует агентские системы. Его главный практический вывод: выбор агентской среды для реальной работы определяется не "самым умным" ответом, а стабильностью контура, управлением памятью, стоимостью контекста, прозрачностью tools/skills and recovery after restart. Для Techscope это подтверждает уже выбранную архитектуру: входящие материалы должны превращаться не в сырые длинные контексты, а в source note, refined signal, brief/review and generated wiki layer. Для будущих агентов особенно важны thin interfaces for users and explicit harness rules for memory, tools, permissions and completion. - Agent shells differ mainly by harness thickness: how much context, tools, persona and memory they inject before the model answers. - Rich/personal shells can be pleasant...
- From `03_reviews/2026-05-17-agent-shell-evaluation-review.md`: Как Techscope должен сравнивать разные агентские среды и оболочки: Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI and future agent runtimes? Нужен единый evaluation contract, чтобы не смешивать: - официальные возможности runtime; - мнение блогеров и advanced users; - реальные локальные эксперименты; - UX для не-разработчиков; - security posture and permission model. Adopt the mixed rubric as a draft working rule now. Use it for all future comparisons of Codex, Hermes, OpenClaw, Claude Code, Gemini CLI and related environments. Do not use advanced-user opinions as proof of architecture, but do preserve them as high-value UX evidence.
- From `04_standards/agent-shell-evaluation.md`: # Standard: agent-shell-evaluation Status: draft Owner: Techscope/user Last reviewed: 2026-05-17 ## Rule При сравнении агентских сред нельзя оценивать только "качество ответа" или популярность инструмента. Нужно фиксировать runtime, дату, модель/provider, memory model, tool surface, permission model, context overhead, operator profile, evidence class and local fit. Этот стандарт пока draft. Он задает рабочую рубрику, но не является окончательным выбором между Codex, Hermes, OpenClaw, Claude Code, Gemini CLI or future runtimes. ## Use when - Появляется материал о новой агентской среде, coding agent, autonomous agent, CLI agent or app shell. - Нужно решить, что использовать для нового проекта или нового агента. - Нужно сравнить Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI or related runtimes. - Источник является мнением продвинутого пользователя, блогера или community report,...
- From `02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md`: Скриншоты статьи дают компактную модель зрелого agent harness: агент - это не только model + prompt/context, а model + deterministic scaffolding around action. Самое ценное для Techscope - шесть слоев harness, которые хорошо ложатся на нашу архитектуру: границы информации, tool system, orchestration, memory/state, evaluation/observability, constraints/validation/recovery. - Prompt engineering помогает выразить intent, но не дает фактов, памяти и надежной последовательности действий. - Context engineering шире RAG: это управление тем, какие токены видит модель в каждый момент, включая state, tool outputs and summaries. - Harness engineering переносит ответственность за порядок действий, проверки, recovery and constraints из вероятностной модели в детерминированную систему. - Raw tool output should not go straight into context; it should be parsed, filtered and summarized. - A mature...

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
- 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
- 01_sources/notes/2026-05-17-medium-harness-engineering-six-layer-source-note.md
- 01_sources/signals/2026-05-17-medium-harness-engineering-six-layer-signal.md
- raw-source-purged
- https://medium.com/%40bollen_en_kersen/list/ai-engineering-302c79906afa
- https://openai.com/index/harness-engineering/
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/building-effective-agents

## Related pages

- [[pages/topic-harness-engineering|topic: harness-engineering]]
- [[pages/topic-context-engineering|topic: context-engineering]]
- [[pages/topic-agent-memory|topic: agent-memory]]
- [[pages/topic-evaluation|topic: evaluation]]
- [[pages/topic-observability|topic: observability]]
- [[pages/topic-tool-use|topic: tool-use]]
- [[pages/topic-recovery|topic: recovery]]
- [[pages/topic-techscope|topic: techscope]]
- [[pages/tool-medium|tool: medium]]
- [[pages/tool-codex|tool: codex]]
- [[pages/tool-anthropic|tool: anthropic]]
- [[pages/tool-openai|tool: openai]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
