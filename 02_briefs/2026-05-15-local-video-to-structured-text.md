---
id: 2026-05-15-local-video-to-structured-text-brief
type: brief
status: draft
created: 2026-05-15
updated: 2026-05-15
topics: [audio, stt, local-ai, workflow, video-processing]
tools: [ffmpeg, ai-studio, kesha, parakeet, codex]
sources:
  - 00_inbox/texts/2026-05-15-local-video-to-structured-text.md
  - https://github.com/drakulavich/kesha-voice-kit
  - https://build.nvidia.com/nvidia/parakeet-1_1b-rnnt-multilingual-asr
  - https://github.com/NVIDIA-NeMo/NeMo/blob/main/docs/source/asr/models.rst
related:
  intakes:
    - 00_inbox/texts/2026-05-15-local-video-to-structured-text.md
  standards:
    - 04_standards/local-video-to-structured-text.md
---

# Brief: local-video-to-structured-text

Date: 2026-05-15
Source: `00_inbox/texts/2026-05-15-local-video-to-structured-text.md`
Status: draft

## Summary

Текст описывает удачный переход от полуавтоматического workflow к локальному агентному workflow:

1. Раньше Codex извлекал аудио из видео через `ffmpeg`.
2. Затем mp3 вручную загружался в AI Studio.
3. Новый эксперимент: Codex локально установил Kesha Voice Kit, распознал аудио и выдал структурированный документ.

Главная ценность: сокращение ручных действий и превращение обработки видео в повторяемую агентную операцию на Mac.

## Key claims

- Для задачи "видео -> аудио -> структурированный текст" можно построить полностью локальный workflow.
- `kesha` может заменить ручную загрузку аудио в AI Studio на локальную расшифровку.
- Parakeet потенциально хорошо подходит для русского аудио.
- Codex способен сам установить инструмент и выполнить задачу за несколько минут.

## Evidence

- Репозиторий `drakulavich/kesha-voice-kit` описывает Kesha как open-source voice toolkit для speech-to-text, text-to-speech, VAD, language detection и агентных стеков: https://github.com/drakulavich/kesha-voice-kit
- Документация Kesha указывает CLI-команды для транскрибации, JSON, timestamps, VAD и speaker diarization: https://github.com/drakulavich/kesha-voice-kit
- Kesha заявляет поддержку speech-to-text для 25 языков, включая Russian, а внутри использует NVIDIA Parakeet TDT 0.6B v3 для STT: https://github.com/drakulavich/kesha-voice-kit
- NVIDIA NIM показывает `parakeet-1.1b-rnnt-multilingual-asr` как ASR-модель для 25 языков, включая Russian: https://build.nvidia.com/nvidia/parakeet-1_1b-rnnt-multilingual-asr
- Документация NVIDIA NeMo описывает Parakeet как семейство ASR-моделей на FastConformer с CTC, RNN-T или TDT decoder: https://github.com/NVIDIA-NeMo/NeMo/blob/main/docs/source/asr/models.rst

## Expert notes

### Architecture

Хороший кандидат на локальный CLI pipeline:

```text
video file -> audio extraction/decoding -> ASR transcript -> LLM structuring -> markdown artifact
```

Интересная деталь: Kesha заявляет аудио-декодирование WAV, MP3, OGG/Opus, FLAC, AAC, M4A без `ffmpeg`, но видеофайлы все равно могут требовать `ffmpeg` для извлечения аудиодорожки.

### Security

Локальный STT снижает риск утечки приватных аудио/видео в облачные сервисы. Но перед стандартизацией нужно проверить:

- откуда скачиваются модели;
- лицензии моделей и инструмента;
- объем локального кэша моделей;
- возможность закрепить версии.

### Developer Experience

Workflow перспективен, потому что агент может запускать CLI без ручной загрузки файлов в AI Studio. Для стандарта нужно сохранить:

- команды установки;
- команды проверки `kesha status`;
- формат выходных файлов;
- промпт для структурирования расшифровки;
- fallback на `ffmpeg + cloud ASR`, если локальная транскрибация не справилась.

### Product Pragmatist

Польза высокая, если часто нужно обрабатывать видео, созвоны, голосовые заметки или обучающие материалы. Пока не стоит делать жесткий стандарт: есть только один успешный кейс, без замеров качества и воспроизводимости.

### Research Scout

Kesha выглядит свежим и небольшим проектом: на GitHub на момент проверки видны 35 stars и свежий релиз v1.17.0 от 2026-05-15. Это не минус, но требует осторожности: закреплять версии и иметь альтернативный путь.

## Risks and caveats

- Неясно, насколько хорошо Parakeet/Kesha работает на разных типах русского аудио: шум, несколько спикеров, акценты, плохой микрофон, длинные видео.
- Возможно, потребуется отдельный шаг `ffmpeg` для видеоформатов, если Kesha принимает только аудиофайлы.
- Маленький open-source проект может быстро меняться, ломать CLI или исчезнуть.
- Нужно проверить лицензионную совместимость для коммерческого использования.
- Для структурированного текста нужен второй этап: LLM должен превратить transcript в документ, а не только распознать речь.

## Recommendation

Статус: `experiment`.

Не утверждать как стандарт сразу. Провести короткую проверку на 2-3 реальных материалах:

- короткое русское видео до 10 минут;
- длинное русское видео 30+ минут;
- материал с несколькими спикерами или шумом.

После проверки можно оформить стандарт "локальная обработка видео в структурированный текст".

## Next step

Создать draft standard с минимальным workflow и пометить его как экспериментальный.
