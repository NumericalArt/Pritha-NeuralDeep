---
id: wiki-page-topic-recovery
type: wiki-page
status: generated
created: 2026-05-18
updated: 2026-05-18
topics:
  - recovery
  - harness-engineering
  - ai-agents
  - context-engineering
  - agent-memory
  - evaluation
  - observability
  - tool-use
  - techscope
tools:
  - medium
  - codex
  - anthropic
  - openai
  - langchain
sources:
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
    - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-harness-engineering.md
    - 10_wiki/pages/topic-ai-agents.md
    - 10_wiki/pages/topic-context-engineering.md
    - 10_wiki/pages/topic-agent-memory.md
    - 10_wiki/pages/topic-evaluation.md
    - 10_wiki/pages/topic-observability.md
    - 10_wiki/pages/topic-tool-use.md
    - 10_wiki/pages/topic-techscope.md
    - 10_wiki/pages/tool-medium.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-anthropic.md
    - 10_wiki/pages/tool-openai.md
    - 10_wiki/pages/tool-langchain.md
    - 10_wiki/pages/concept-brief.md
    - 10_wiki/pages/concept-harness.md
generated_from:
  - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
review_status: unreviewed
confidence: low
last_linted: 
---
# Wiki Page: topic: recovery

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks recovery as a topic in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md`: Скриншоты статьи дают компактную модель зрелого agent harness: агент - это не только model + prompt/context, а model + deterministic scaffolding around action. Самое ценное для Techscope - шесть слоев harness, которые хорошо ложатся на нашу архитектуру: границы информации, tool system, orchestration, memory/state, evaluation/observability, constraints/validation/recovery. - Prompt engineering помогает выразить intent, но не дает фактов, памяти и надежной последовательности действий. - Context engineering шире RAG: это управление тем, какие токены видит модель в каждый момент, включая state, tool outputs and summaries. - Harness engineering переносит ответственность за порядок действий, проверки, recovery and constraints из вероятностной модели в детерминированную систему. - Raw tool output should not go straight into context; it should be parsed, filtered and summarized. - A mature...

## Evidence sources

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
- [[pages/topic-ai-agents|topic: ai-agents]]
- [[pages/topic-context-engineering|topic: context-engineering]]
- [[pages/topic-agent-memory|topic: agent-memory]]
- [[pages/topic-evaluation|topic: evaluation]]
- [[pages/topic-observability|topic: observability]]
- [[pages/topic-tool-use|topic: tool-use]]
- [[pages/topic-techscope|topic: techscope]]
- [[pages/tool-medium|tool: medium]]
- [[pages/tool-codex|tool: codex]]
- [[pages/tool-anthropic|tool: anthropic]]
- [[pages/tool-openai|tool: openai]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
