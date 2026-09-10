---
id: neuraldeep-voice-capture-followup-2026-09-10
type: review
status: in-progress
created: 2026-09-10
updated: 2026-09-10
topics: [neuraldeep, voice-control, chromium, audio-capture, regression-testing]
tools: [Silero-VAD, Web-Audio, Playwright, NeuralDeep]
sources:
  - 03_reviews/2026-09-10-neuraldeep-voice-prototype-implementation.md
  - https://webaudio.github.io/web-audio-api/
related:
  workflows: [07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
source_version: capture-base-a32ed74e2474f55eb99b26bd166fd46fb3443568
verified: 2026-09-10
temporal_status: version-bound
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha-neuraldeep
privacy: public
retention: durable
review_status: pending-physical-chrome-acceptance
confidence: medium
---

# NeuralDeep Voice: диагностика захвата после первого запуска

Пользователь подтвердил, что новый транспорт отвечает на телефоне и в Safari
на Mac. В Chrome на том же Mac Realtime работает, NeuralDeep остаётся в
Listening без ответа, в том числе при Voice input level 100%. Общая
неисправность микрофона или его разрешений этим сравнением не подтверждается.
Причина конкретного сбоя Chrome ещё не установлена; исправления ниже нельзя
считать его физической приёмкой.

## Установленные факты

- В момент первого сбоя серверный журнал не содержал принятых голосовых turns:
  нужно проверять участок microphone → Web Audio → Silero → WAV upload.
- Прежние browser smoke tests подменяли микрофон тишиной, а live ответ запускали
  текстом. Это проверяло подключение и LLM/TTS, но не распознавание spoken input.
- Синтетическая английская речь с амплитудой 3% при input level 53% стабильно
  не обнаруживалась старой цепочкой в Chromium. Унаследованная степень 2.5
  превращала 53% в коэффициент 0.2045. При 100% тот же тест обнаруживал речь.
  Это отдельный воспроизводимый дефект чувствительности, но не полное объяснение
  пользовательского случая: на его Chrome проверка 100% тоже не помогла.
- Silero v5 в отдельном тесте давал max speech probability около 0.044 с прежним
  усилением и 0.926 с линейным 53%. После резкого перепада громкости примерно
  на 30 dB сохраняемое состояние модели может снова пропускать тихую речь;
  синтетический тест свежего подключения не является тестом таких перепадов.

## Изменения кандидата

- Только NeuralDeep: монофонический capture с browser autoGainControl и
  линейная шкала входного уровня. Realtime сохраняет прежние constraints и
  степень 2.5. Нулевой уровень и mute сохраняются.
- Только уже принятый VAD сегмент нормализуется перед PCM16/WAV: усиление
  ограничено 8, target RMS 0.035, peak headroom 0.9. Тишина и почти нулевой
  сигнал не усиливаются; исходный массив и voice draft не меняются.
- В UI показан измеренный сигнал, распознанная речь, пауза либо остановка
  захвата. Состояние audio context само по себе не считается доказательством
  поступления кадров. Таймер диагностики закрывается вместе с транспортом.
- В существующий private client log поступают счётчик кадров, RMS,
  speech probability, sample rate, audio context state и фактические capture
  constraints. Без device labels/IDs, аудиозаписей или транскриптов. Интервал
  periodic log не чаще десяти секунд, UI обновляется раз в секунду.
- Маршрутизация задач, tool effects, memory, sticky context, provider endpoints,
  receipt schema и SQLite migrations не меняются.

## Проверки

Unit regression проверяет сохранение нуля/тишины, прохождение серверного RMS
gate для тихой принятой речи, ограничение усиления, отсутствие clipping и
неизменность исходного массива. Полный self-test: 898/898 tests, privacy audit,
memory validation и health проходят. После настройки capture constraints
повторно проходят production build и 25 targeted tests.

`interfaces/control-center/tests/voice-input.browser.mjs` использует настоящие
AudioWorklet и pinned Silero, подменяя только источник звука. Проверяются:
тишина, mute с речью, нулевой уровень с речью, тихая речь при 53%, обычная при
100%, capture diagnostics, suspended context, stop/reconnect и очистка tracks.
На fresh connection live сценарий проходит actual STT → LLM → TTS в Chromium
и WebKit. Один Chromium live run завершился provider_unavailable на стадии
TTS после успешных STT/LLM; отдельный повтор прошёл. Автоматического retry
в продукт не добавлено.

Дополнительный Chromium test оставляет настоящий `getUserMedia` и подаёт
локальный synthetic WAV через browser fake-audio-capture. Он проходит после
добавления двух секунд тишины в зацикливаемый fixture. Непрерывно повторяемая
речь без достаточной паузы давала аудиокадры и ненулевой RMS, но не завершала
сегмент — это ожидаемое ограничение текущего endpointer, а не отсутствие доступа
к микрофону. Silent output connection в отдельном эксперименте не меняла этот
результат; предположение о необходимости дополнительного подключения к
audio destination не включено в исправление.

Fixture `tests/fixtures/neuraldeep/voice-input-en.wav` создан локальным
синтезатором из нейтральной английской фразы. Это не запись пользователя;
происхождение и текст лежат в соседнем JSON. Обычные browser checks
перехватывают WAV upload; API inference включается явно:

```sh
PRITHA_VOICE_E2E_BASE_URL=http://127.0.0.1:<isolated-port> \
PRITHA_VOICE_E2E_LIVE=1 \
node --test --test-concurrency=1 interfaces/control-center/tests/voice-input.browser.mjs
```

Запускать browser suites последовательно: они временно меняют transport
settings изолированного сервера и восстанавливают их после теста.

## Приёмка и выпуск

Good State Alignment: aligned — сохраняются Realtime, music ducking,
маршрутизация и история задач, изоляция и managed rollback. Для отката
подготовлен отдельный проверенный artifact рабочей сборки `a32ed74`, с
coordinator schema 4 и обоими транспортами.

Перед выпуском необходимы clean commit, отсутствие активных Task Chat/Voice
executions, maintenance barrier и managed staged update только целевого
экземпляра. Не останавливать задачу пользователя ради установки диагностики.
После выпуска проверить exact build identity, все основные страницы и chunks.
Затем требуется повтор на физическом Chrome: по новым capture metrics
разделить отсутствие кадров, нулевой сигнал, непризнанную VAD речь и ошибку
отправки/ответа. До этого пользовательский Chrome-сбой остаётся открытым.
