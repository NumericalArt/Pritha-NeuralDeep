---
id: local-video-to-structured-text
type: standard
status: draft
created: 2026-05-15
updated: 2026-05-15
last_reviewed: 2026-05-15
owner: Techscope/user
topics: [audio, stt, local-ai, workflow, video-processing]
tools: [ffmpeg, kesha, parakeet, codex]
sources:
  - 02_briefs/2026-05-15-local-video-to-structured-text.md
  - 02_briefs/2026-05-15-youtube-local-transcription-test-brief.md
related:
  briefs:
    - 02_briefs/2026-05-15-local-video-to-structured-text.md
    - 02_briefs/2026-05-15-youtube-local-transcription-test-brief.md
supersedes: []
---

# Standard: local-video-to-structured-text

Status: draft
Owner: Codex/user
Last reviewed: 2026-05-15

## Rule

Для задач "видео или аудио -> структурированный текст" сначала рассматривать локальный агентный workflow, прежде чем использовать ручную загрузку аудио в облачные сервисы.

## Use when

- Нужно быстро получить структурированный конспект, summary, план, тезисы или извлечение решений из видео/аудио.
- Материал приватный или нежелательно отправлять аудио в сторонние облачные сервисы.
- Задача повторяется и ручной шаг загрузки в AI Studio замедляет работу.
- Достаточно локального качества ASR.

## Avoid when

- Требуется юридически точная расшифровка.
- Аудио сложное: сильный шум, много перекрывающихся голосов, важна точная diarization.
- Локальная модель заметно ошибается на языке, терминах или именах.
- Нет времени проверять качество результата.

## Required practices

- Сохранять исходный материал или ссылку в `00_inbox/`.
- Сохранять итоговый структурированный текст в `02_briefs/` или отдельный review, если материал стратегически важен.
- Отделять transcript от LLM-структурирования: сначала распознавание, затем анализ.
- Не воспроизводить полные транскрипты сторонних видео в заметках или ответах; использовать их как локальный raw artifact для анализа и краткого пересказа.
- Для длинных материалов включать VAD или сегментацию, если инструмент это поддерживает.
- Указывать инструмент, модель, версию и дату обработки.
- Если используется Kesha, перед важной задачей проверять `kesha status`.
- Для новых инструментов фиксировать ссылку на репозиторий, лицензию и способ установки.

## Candidate workflow

```text
1. Получить видео или аудио.
2. Если это видео, извлечь аудио через ffmpeg или другой надежный инструмент.
3. Распознать аудио локально через Kesha/Parakeet или другой ASR.
4. Сохранить transcript.
5. Передать transcript LLM-агенту для структурирования.
6. Сохранить итоговый markdown-документ.
7. Зафиксировать ошибки распознавания и качество результата.
```

## Examples

```text
Разбери видео: извлеки аудио, распознай речь локально, сделай структурированный текст с разделами Summary, Key Ideas, Tools, Risks, Action Items и Open Questions.
```

## Related decisions

- `02_briefs/2026-05-15-local-video-to-structured-text.md`
- `02_briefs/2026-05-15-youtube-local-transcription-test-brief.md`
