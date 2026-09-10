---
id: 2026-05-15-youtube-local-transcription-test-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-06-01
topics:
  - youtube
  - transcription
  - stt
  - local-ai
  - workflow
tools:
  - yt-dlp
  - imageio-ffmpeg
  - mlx-whisper
  - whisper-small
sources:
  - source-ec060b22-5b16-4caa-aab1-a6ab69a2e617
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: video
source_class: video
ingested_at: 2026-05-15
processed_at: 2026-06-01T21:03:38.433Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-ec060b22-5b16-4caa-aab1-a6ab69a2e617
---

# Artifact: source-ec060b22-5b16-4caa-aab1-a6ab69a2e617

Date: 2026-05-15
Status: draft
Source class: video
Retention: source-purged

Date: 2026-05-15
Status: draft

## Summary

Локальная транскрибация YouTube-видео сработала. У ролика не было доступных субтитров или автосубтитров через `yt-dlp`, поэтому был использован полноценный путь:

```text
YouTube URL -> yt-dlp mp4 download -> ffmpeg audio extraction -> mlx-whisper ASR -> JSON transcript
```

Результат пригоден как подтверждение, что на Mac можно собрать рабочий локальный pipeline без AI Studio и без ручной загрузки аудио в веб-интерфейс.

- Title: `Ты не знаешь CONDITIONALS в Английском | Американец на РУССКОМ объяснил все типы`
- Channel: `Luke McCarthy English`
- Duration: `16:00`

## Tooling used

- `yt-dlp` installed via `python3 -m pip install --user yt-dlp`.
- `imageio-ffmpeg` installed via `python3 -m pip install --user imageio-ffmpeg`.
- `mlx-whisper` installed via `python3 -m pip install --user mlx-whisper`.
- Model: `mlx-community/whisper-small-mlx`.
- Language hint: `ru`.

## Raw artifacts

## Result

- Video duration: `00:15:59.66`.
- Transcript language detected/forced: `ru`.
- Transcript text length: `13190` characters.
- Segments: `407`.
- ASR runtime after model download: about 20 seconds.
- The transcript is stored locally as a raw artifact, not reproduced in full in project notes.

## What worked

- `yt-dlp` could inspect the video and detect that no subtitles were available.
- YouTube initially returned a 403/SABR issue for the default client.
- Switching `yt-dlp` to Android client allowed downloading format `18`.
- `imageio-ffmpeg` provided a usable local ffmpeg binary without Homebrew.
- `mlx-whisper` worked on Apple Silicon after adding a local `ffmpeg` symlink to PATH.

## Friction

- No `yt-dlp`, `ffmpeg`, `kesha` or `whisper` were preinstalled.
- Homebrew was not available.
- `yt-dlp` warned about YouTube PO token/SABR behavior.
- `mlx-whisper` expects an executable named `ffmpeg` in PATH.
- The first model repo id tried was wrong; the working model was `mlx-community/whisper-small-mlx`.

## Content note

The video itself is an English-learning lesson about conditionals. For copyright reasons, do not reproduce the full transcript in project notes or chat. Use the transcript for local analysis, summaries, and technical pipeline validation.

## Recommendation

Status: `successful experiment`.

This is enough evidence to keep improving the `local-video-to-structured-text` standard. Do not mark the standard active yet; run one more test with:

- a longer YouTube video;
- a noisy or multi-speaker video;
- ideally a video where YouTube subtitles exist, so we can compare captions vs local ASR.
