---
id: wiki-page-tool-agents-md
type: wiki-page
status: generated
created: 2026-05-15
updated: 2026-05-15
topics:
  - harness-engineering
  - coding-agents
  - agent-memory
  - agent-evals
  - ci
  - dx
  - software-engineering
tools:
  - agents-md
  - codex
  - lint
  - ci
  - playwright
  - zod
  - pnpm
  - chrome-devtools
  - openai
sources:
  - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  - 00_inbox/links/2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake.md
  - 03_reviews/2026-05-15-2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake-auto-assessment.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=am_oeAoUhew
  - https://openai.com/index/harness-engineering/
related:
  briefs:
    - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-harness-engineering.md
    - 10_wiki/pages/topic-coding-agents.md
    - 10_wiki/pages/topic-agent-memory.md
    - 10_wiki/pages/topic-agent-evals.md
    - 10_wiki/pages/topic-ci.md
    - 10_wiki/pages/topic-dx.md
    - 10_wiki/pages/topic-software-engineering.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-lint.md
    - 10_wiki/pages/tool-ci.md
    - 10_wiki/pages/tool-playwright.md
    - 10_wiki/pages/tool-zod.md
    - 10_wiki/pages/tool-pnpm.md
    - 10_wiki/pages/tool-chrome-devtools.md
    - 10_wiki/pages/tool-openai.md
generated_from:
  - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
review_status: unreviewed
confidence: low
last_linted: 
---
# Wiki Page: tool: agents-md

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks agents-md as a tool in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md`: Ryan Lopopolo описывает harness engineering как инженерную дисциплину вокруг coding agents: человек больше не должен быть главным производителем кода, а должен проектировать среду, инструкции, guardrails, CI feedback loops, review agents, repo structure и проверяемые acceptance criteria, чтобы агенты могли выполнять полный цикл разработки. Главный сдвиг: implementation становится дешевой и параллелизуемой, а дефицитными ресурсами становятся human time, human/model attention и context window. - В agent-first workflow код перестает быть главным дефицитом; дефицитными становятся внимание, контекст, качество спецификации и feedback loops. - Важны не только prompts, но и все места, где агент получает управляемый feedback: `AGENTS.md`, rules files, skills, lint errors, test failures, review-agent comments, QA plans, runbooks. - Репозиторий должен быть legible для агента: единообразные...

## Evidence sources

- 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
- 00_inbox/links/2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake.md
- 03_reviews/2026-05-15-2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake-auto-assessment.md
- raw-source-purged
- https://www.youtube.com/watch?v=am_oeAoUhew
- https://openai.com/index/harness-engineering/

## Related pages

- [[pages/topic-harness-engineering|topic: harness-engineering]]
- [[pages/topic-coding-agents|topic: coding-agents]]
- [[pages/topic-agent-memory|topic: agent-memory]]
- [[pages/topic-agent-evals|topic: agent-evals]]
- [[pages/topic-ci|topic: ci]]
- [[pages/topic-dx|topic: dx]]
- [[pages/topic-software-engineering|topic: software-engineering]]
- [[pages/tool-codex|tool: codex]]
- [[pages/tool-lint|tool: lint]]
- [[pages/tool-ci|tool: ci]]
- [[pages/tool-playwright|tool: playwright]]
- [[pages/tool-zod|tool: zod]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
