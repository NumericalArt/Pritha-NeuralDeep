---
id: source-retention-and-anonymization
type: standard
status: draft
created: 2026-06-01
updated: 2026-06-01
last_reviewed: 2026-06-01
owner: Pritha
topics: [privacy, retention, media-intake, source-anonymization, memory]
tools: [Pritha, privacy-audit, transcribe-media, telegram-bot]
sources:
  - AGENTS.md
  - 07_workflows/privacy-preserving-intake.md
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
    - 07_workflows/media-intake-processing.md
  standards:
    - 04_standards/agent-untrusted-input-security.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-01
source_updated: 2026-06-01
source_version: Pritha privacy-retention policy v1
retrieved: 2026-06-01
verified: 2026-06-01
valid_for: Pritha incoming media and source processing
temporal_status: current
---

# Standard: Source Retention and Anonymization

## Rule

Pritha stores processed knowledge, not raw provenance. Incoming video, audio,
text dumps, transcripts, images, downloaded files, raw Telegram updates and
source-specific metadata are temporary processing inputs and must be deleted
after useful knowledge has been curated.

## Allowed Durable Metadata

- `source_class`: `video`, `audio`, `article`, `text`, `image`, `document`,
  `telegram`, `mixed` or `unknown`.
- `ingested_at` and `processed_at`.
- `retention_status: source-purged`.
- `usefulness`: `low`, `medium` or `high`.
- `evidence_quality`: `low`, `medium`, `high` or `uncertain`.
- `anonymous_source_id`: opaque random identifier not derived from title, URL,
  person, file name, chat id or source content.

## Forbidden Durable Metadata

- Original titles, source names, channel names, personal names, contact data,
  usernames, chat ids, user ids, file ids, IP addresses, raw paths, source URLs,
  original filenames and file metadata.
- Raw transcripts, ASR segment dumps, downloaded images, PDFs, audio, video and
  raw platform payloads.
- Pointers that allow reconstructing the original incoming material.

## Durable Knowledge

Curated artifacts may preserve ideas, technical claims, architecture patterns,
algorithms, risks, trade-offs, standards, decisions and implementation lessons
when they are rewritten as processed knowledge and no longer expose original
provenance.

## Gates

`scripts/privacy-audit.mjs --strict` must pass before publication. If a future
workflow needs to retain raw source material, it must use an explicit secure
storage decision outside the Git-tracked Techscope repository.
