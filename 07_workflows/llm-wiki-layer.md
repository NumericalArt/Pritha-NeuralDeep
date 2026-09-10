---
id: llm-wiki-layer
type: workflow
status: experimental
created: 2026-05-15
updated: 2026-05-15
topics: [llm-wiki, generated-knowledge, agent-memory, obsidian, rag, workflow]
tools: [markdown, obsidian, codex]
sources:
  - 04_standards/signal-extraction.md
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
related:
  decisions:
    - 05_decisions/2026-05-15-memory-architecture.md
  standards:
    - 04_standards/signal-extraction.md
    - 04_standards/memory-structure.md
  workflows:
    - 07_workflows/memory-indexing.md
---

# Workflow: llm-wiki-layer

## Goal

Поддерживать экспериментальный generated wiki layer поверх curated Techscope artifacts.

## Source of truth

`10_wiki/` не является канонической памятью. Это производный слой для навигации, гипотез, синтеза и Obsidian graph view.

Канонические выводы остаются в:

- `02_briefs/`
- `03_reviews/`
- `04_standards/`
- `05_decisions/`

## Structure

```text
10_wiki/
  README.md
  index.md
  log.md
  pages/
```

## Commands

```sh
node scripts/llm-wiki.mjs ingest <artifact-path>
node scripts/llm-wiki.mjs query "<question>"
node scripts/llm-wiki.mjs lint
```

## Ingest

Use when a curated artifact should enrich generated wiki navigation.

Rules:

- Accept only curated Markdown artifacts.
- Reject raw-source holding areas.
- Extract frontmatter topics, tools, sources, related links and key sections.
- Create or update generated wiki pages in `10_wiki/pages/`.
- Rebuild `10_wiki/index.md`.
- Append an event to `10_wiki/log.md`.
- Never update standards or decisions directly.

## Query

Use when the user asks a conceptual question over generated wiki memory.

Rules:

- Start from `10_wiki/index.md`.
- Return matching generated pages and their source artifacts.
- Treat wiki pages as leads, not final evidence.
- If evidence is weak, point to the curated artifacts that must be opened.

## Lint

Use before relying on the layer.

Checks:

- wiki pages without sources;
- broken internal links;
- concepts in `index.md` without pages;
- orphan pages;
- pages without ingest log entries;
- active status on generated pages.

## Promotion rule

If a generated wiki page looks strong enough to affect project standards, create a review or decision first. Do not promote generated synthesis directly into `04_standards/`.
