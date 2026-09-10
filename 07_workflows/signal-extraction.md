---
id: workflow-signal-extraction
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-16
topics: [signal-extraction, media-intake, summarization, agent-design, knowledge-processing]
tools: [markdown, process-intake, extract-signal, codex]
sources:
  - AGENTS.md
  - 04_standards/signal-extraction.md
related:
  standards:
    - 04_standards/signal-extraction.md
  workflows:
    - 07_workflows/codex-assisted-signal-extraction.md
    - 07_workflows/media-intake-processing.md
    - 07_workflows/expert-information-assessment.md
---

# Workflow: signal-extraction

## Goal

После загрузки входного материала извлечь концентрированную смысловую информацию для Techscope: технические тезисы, детали, риски, правила и implications для проектирования агентов.

## Command

```sh
node scripts/extract-signal.mjs <artifact-path>
```

This command creates a heuristic draft. For meaningful material, continue with:

```text
07_workflows/codex-assisted-signal-extraction.md
07_workflows/prompts/signal-extraction-harness.md
```

## Inputs

- intake;
- source note;
- processed transcript-derived summary;
- article note;
- assessment draft.

Raw transcripts are not retained in tracked memory; signal notes go to `01_sources/signals/` and are indexed.

## Output

```text
01_sources/signals/YYYY-MM-DD-topic-signal.md
```

New signal drafts are marked:

```yaml
status: extracted
extraction_mode: heuristic-draft
refinement_status: needs-codex-refinement
harness: 07_workflows/prompts/signal-extraction-harness.md
```

After Codex-assisted refinement in this Techscope thread:

```yaml
status: refined
extraction_mode: codex-assisted
refinement_status: codex-refined
```

## Rules

- Keep technical signal, not full prose.
- Remove intros, marketing, calls to subscribe, biographies, repeated examples and vague motivation.
- Preserve tool names, constraints, failure modes, security issues, eval ideas and implementation details.
- Link back only to anonymous source ids, curated internal artifacts or official reference sources; do not write raw paths, incoming URLs, transcript paths or platform identifiers.
- Signal is not a standard. It is compressed evidence for assessment, brief, review and future standards.
- Do not use external LLM services for refinement; Codex performs the expert extraction in this thread.
- Telegram signals use the same rules as every other media channel.
