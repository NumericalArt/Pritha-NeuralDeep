---
id: privacy-preserving-intake
type: workflow
status: draft
created: 2026-06-01
updated: 2026-06-01
topics: [privacy, retention, media-intake, source-anonymization]
tools: [Pritha, privacy-audit, privacy-sanitize-current-state, transcribe-media, telegram-bot]
sources:
  - 04_standards/source-retention-and-anonymization.md
related:
  standards:
    - 04_standards/source-retention-and-anonymization.md
  workflows:
    - 07_workflows/media-intake-processing.md
    - 07_workflows/media-transcription.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-01
source_updated: 2026-06-01
source_version: workflow v1
retrieved: 2026-06-01
verified: 2026-06-01
valid_for: Pritha incoming material processing
temporal_status: current
---

# Workflow: Privacy-Preserving Intake

## Goal

Turn incoming material into reusable agent-engineering knowledge without keeping
raw source files, transcripts or direct provenance breadcrumbs.

## Steps

1. Assign an opaque `anonymous_source_id`.
2. Process source material in an untracked temporary workspace.
3. Extract useful ideas, technical patterns, risks, trade-offs and candidate
   standards.
4. Write curated Markdown with neutral metadata only.
5. Delete raw media, platform payloads, transcript files and source-specific
   metadata.
6. Run `node scripts/privacy-audit.mjs --strict`.
7. Rebuild memory only after the audit passes.

## Rules

- Do not store raw Telegram JSON, downloaded Telegram media, source videos,
  extracted audio or transcript files in tracked paths.
- Do not store original source URL, title, author, channel, file name, chat id,
  user id or file id in durable Markdown.
- Official documentation/spec references may remain when they are cited as
  stable technical references rather than as raw incoming-material provenance.

## Verification

```sh
node scripts/privacy-audit.mjs --strict
node scripts/validate-memory.mjs
node scripts/rebuild-memory.mjs
```
