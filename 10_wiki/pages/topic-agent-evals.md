---
id: wiki-page-topic-agent-evals
type: wiki-page
status: generated
created: 2026-05-15
updated: 2026-05-16
topics:
  - agent-evals
  - coding-agents
  - test-first-development
  - harness-engineering
  - acceptance-criteria
  - dx
  - security
tools:
  - codex
  - agents-md
  - lint
  - ci
  - playwright
  - zod
  - pnpm
  - chrome-devtools
  - openai
  - superpowers
  - markdown
  - npm
sources:
  - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  - 00_inbox/links/2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake.md
  - 03_reviews/2026-05-15-2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake-auto-assessment.md
  - raw-source-purged
  - https://www.youtube.com/watch?v=am_oeAoUhew
  - https://openai.com/index/harness-engineering/
  - 03_reviews/2026-05-16-test-first-agent-workflow-review.md
  - 01_sources/signals/2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal.md
  - 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
  - 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
  - https://t.me/tosoltaime/42
related:
  briefs:
    - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  wiki_pages:
    - 10_wiki/pages/topic-harness-engineering.md
    - 10_wiki/pages/topic-coding-agents.md
    - 10_wiki/pages/topic-agent-memory.md
    - 10_wiki/pages/topic-ci.md
    - 10_wiki/pages/topic-dx.md
    - 10_wiki/pages/topic-software-engineering.md
    - 10_wiki/pages/tool-codex.md
    - 10_wiki/pages/tool-agents-md.md
    - 10_wiki/pages/tool-lint.md
    - 10_wiki/pages/tool-ci.md
    - 10_wiki/pages/tool-playwright.md
    - 10_wiki/pages/tool-zod.md
    - 10_wiki/pages/tool-pnpm.md
    - 10_wiki/pages/tool-chrome-devtools.md
    - 10_wiki/pages/tool-openai.md
    - 10_wiki/pages/topic-test-first-development.md
    - 10_wiki/pages/topic-acceptance-criteria.md
    - 10_wiki/pages/topic-security.md
    - 10_wiki/pages/tool-superpowers.md
    - 10_wiki/pages/tool-markdown.md
    - 10_wiki/pages/tool-npm.md
    - 10_wiki/pages/concept-review.md
    - 10_wiki/pages/concept-test-first-agent-workflow.md
  reviews:
    - 03_reviews/2026-05-16-test-first-agent-workflow-review.md
generated_from:
  - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  - 03_reviews/2026-05-16-test-first-agent-workflow-review.md
review_status: unreviewed
confidence: low
last_linted: 
---
# Wiki Page: topic: agent-evals

Status: generated
Review status: unreviewed
Confidence: low

## Generated summary

This generated page tracks agent-evals as a topic in the Techscope knowledge base. Use it for navigation and synthesis only; follow the sources before making standards or decisions.

## Current synthesis

- From `02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md`: Ryan Lopopolo описывает harness engineering как инженерную дисциплину вокруг coding agents: человек больше не должен быть главным производителем кода, а должен проектировать среду, инструкции, guardrails, CI feedback loops, review agents, repo structure и проверяемые acceptance criteria, чтобы агенты могли выполнять полный цикл разработки. Главный сдвиг: implementation становится дешевой и параллелизуемой, а дефицитными ресурсами становятся human time, human/model attention и context window. - В agent-first workflow код перестает быть главным дефицитом; дефицитными становятся внимание, контекст, качество спецификации и feedback loops. - Важны не только prompts, но и все места, где агент получает управляемый feedback: `AGENTS.md`, rules files, skills, lint errors, test failures, review-agent comments, QA plans, runbooks. - Репозиторий должен быть legible для агента: единообразные...
- From `03_reviews/2026-05-16-test-first-agent-workflow-review.md`: Should Techscope adopt a default workflow where coding agents receive spec, acceptance criteria and machine-checkable tests/evals before implementation? Adopt as an experiment, not yet as an active standard. If the next 2-3 coding tasks show better reliability, create a standard candidate: ```text 04_standards/test-first-agent-workflow.md ``` with progressive levels: - Level 0: command-only verification for trivial edits. - Level 1: spec + acceptance criteria for normal tasks. - Level 2: failing tests/evals before implementation for non-trivial tasks. - Level 3: independent QA/security/product lens before implementation for risky or user-facing tasks.

## Evidence sources

- 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
- 00_inbox/links/2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake.md
- 03_reviews/2026-05-15-2026-05-15-youtube-harness-engineering-ryan-lopopolo-openai-intake-auto-assessment.md
- raw-source-purged
- https://www.youtube.com/watch?v=am_oeAoUhew
- https://openai.com/index/harness-engineering/
- 03_reviews/2026-05-16-test-first-agent-workflow-review.md
- 01_sources/signals/2026-05-16-2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex-signal.md
- 00_inbox/telegram/2026-05-16-telegram-telegram-user-9-как-использовать-superpowers-в-codex.md
- 01_sources/notes/2026-05-15-openai-harness-engineering-source-note.md
- https://t.me/tosoltaime/42

## Related pages

- [[pages/topic-coding-agents|topic: coding-agents]]
- [[pages/topic-test-first-development|topic: test-first-development]]
- [[pages/topic-harness-engineering|topic: harness-engineering]]
- [[pages/topic-acceptance-criteria|topic: acceptance-criteria]]
- [[pages/topic-dx|topic: dx]]
- [[pages/topic-security|topic: security]]
- [[pages/tool-codex|tool: codex]]
- [[pages/tool-superpowers|tool: superpowers]]
- [[pages/tool-markdown|tool: markdown]]
- [[pages/tool-npm|tool: npm]]
- [[pages/tool-lint|tool: lint]]
- [[pages/tool-ci|tool: ci]]

## Open questions

- What curated artifact should promote or reject this generated synthesis?
