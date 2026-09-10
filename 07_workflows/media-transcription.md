---
id: media-transcription
type: workflow
status: active
created: 2026-05-15
updated: 2026-06-01
topics:
  - media
  - transcription
  - stt
  - local-ai
  - workflow
tools:
  - transcribe-media
  - imageio-ffmpeg
  - mlx-whisper
  - whisper-small
sources:
  - source-bbaa3d3a-f51b-425d-bf41-678886dac088
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-15
processed_at: 2026-06-01T21:03:38.450Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-bbaa3d3a-f51b-425d-bf41-678886dac088
---

# Artifact: source-bbaa3d3a-f51b-425d-bf41-678886dac088

Date: 2026-05-15
Status: active
Source class: video
Retention: source-purged

## Goal

## Command

```sh
```

Optional:

```sh
```

## Outputs

The command emits JSON status only:

- `anonymous_source_id`;
- `source_class`;
- `processed_at`;
- transcription metadata such as language/model/text length;
- deletion status for temp original/audio/transcript files.

Original media, extracted audio, ASR JSON, transcript text and readable transcript Markdown are created only inside an untracked temporary workspace and deleted before exit.

## Rules

- Полный транскрипт стороннего видео/аудио не сохранять в tracked memory.
- В `02_briefs/`, `03_reviews/`, `04_standards/` и `05_decisions/` сохранять summary, выводы, паттерны и технические заметки, а не transcript fragments.
- `node scripts/privacy-audit.mjs --strict` must pass after transcription workflows.

## Current implementation

The workflow is implemented by `scripts/transcribe-media.mjs`.
