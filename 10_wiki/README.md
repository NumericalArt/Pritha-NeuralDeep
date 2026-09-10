---
id: llm-wiki-readme
type: wiki-index
status: generated
created: 2026-05-15
updated: 2026-05-15
topics: [llm-wiki, generated-knowledge, agent-memory]
tools: [markdown, codex]
sources:
  - 07_workflows/llm-wiki-layer.md
related:
  workflows:
    - 07_workflows/llm-wiki-layer.md
---

# LLM Wiki Layer

`10_wiki/` is an experimental generated synthesis layer for Techscope.

Rules:

- Curated artifacts remain the source of truth.
- Wiki pages are generated navigation and hypothesis pages.
- Do not cite a wiki page as final evidence without checking its `sources`.
- Do not store full transcripts, raw source material, secrets or long third-party excerpts here.
- Use `node scripts/llm-wiki.mjs ingest <artifact-path>` to update the layer.
- Use `node scripts/llm-wiki.mjs query "<question>"` for a source-linked wiki lookup.
- Use `node scripts/llm-wiki.mjs lint` before relying on the layer.
