---
id: neuraldeep-voice-prototype-implementation-2026-09-10
type: review
status: processed
created: 2026-09-10
updated: 2026-09-10
topics: [neuraldeep, voice-control, transport, routing, stt, tts, implementation, regression-testing]
tools: [NeuralDeep, OpenAI-Realtime, Codex-CLI, Next.js, Silero-VAD, Playwright]
sources:
  - 07_workflows/2026-09-10-neuraldeep-alternative-voice-coding-plan.md
  - 03_reviews/2026-09-06-alternative-voice-transport-research.md
  - https://neuraldeep.tech/llms-full.txt
related:
  workflows: [07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
source_version: implementation-base-c115e5efdc7b7e777d4577e11a9c376685e41f1f
verified: 2026-09-10
temporal_status: version-bound
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha-neuraldeep
privacy: public
retention: durable
review_status: experimental-prototype
confidence: high
---

# Альтернативный Voice Control: реализованный прототип

Сохранён и реализован [согласованный план](../07_workflows/2026-09-10-neuraldeep-alternative-voice-coding-plan.md). Исходная версия — `c115e5e`, уже содержащая последние изменения маршрутизации Voice / Task Chat. Изменения выполнены в отдельном worktree. Работающий экземпляр и его состояние не обновлялись.

## Что доступно в коде

- В Settings → Voice добавлен выбор `OpenAI Realtime` / `NeuralDeep — experimental`. Старые настройки без нового поля выбирают Realtime. Выбор применяется при следующем подключении.
- Сохранены `gpt-realtime-2`, его текущие overrides, прежний Realtime session config и транспорт WebRTC.
- Новый маршрут: локальный Silero VAD → NeuralDeep `whisper-1` → `qwen3.6-35b-a3b-noreason` → NeuralDeep TTS. Голос по умолчанию — `serena`; язык — Auto, Russian или English. Автоматического перехода на другой провайдер нет.
- STT и TTS первого прототипа работают по API. Локальное распознавание и локальный синтез не добавлены. Локально выполняются определение границ речи, подготовка PCM/WAV и воспроизведение.
- Используется существующий Next Node runtime. Новый daemon, порт или сервис не требуются.
- Карточки, polling Codex, операторские ответы, intake, music control, sticky context, rolling summary и сохранение памяти проходят через прежний общий контроллер и runtime handlers.

## Граница транспорта

Общая React façade `PrithaRealtimeProvider` / `usePrithaRealtime` сохранена. Добавленный `VoiceEventChannel` позволяет существующей логике контроллера работать с WebRTC или HTTP-адаптером. Это намеренный поэтапный способ внедрения: весь большой hook не переписан одновременно с новой аудиоцепочкой.

На серверной стороне новый транспорт использует собственные события: `turn.accepted`, `turn.phase`, `transcript.user`, `transcript.assistant`, `tool.result`, `tool.browser_request`, `audio.segment`, `turn.completed`, `turn.interrupted`, `turn.error`. Адаптер переводит их в общие callback контроллера. Серверные tool results используются для представления карточек, без повторного запуска инструмента из браузера.

Новые HTTP endpoints находятся под `/api/voice`:

| Endpoint | Назначение |
| --- | --- |
| `GET /status` | Выбранный транспорт и наличие серверного credential |
| `POST /sessions` | Снимок настроек и новая сессия |
| `GET /sessions/:id/events` | SSE и восстановление событий по cursor |
| `POST /sessions/:id/turns` | Текст или ограниченный WAV, стабильный `clientTurnId` |
| `GET /sessions/:id/turns/:turnId` | Проверка принятия после потерянного HTTP ACK |
| `POST /sessions/:id/context` | Контекст и browser tool gate |
| `POST /sessions/:id/browser-results` | Коррелированный результат browser tool |
| `POST /sessions/:id/interrupt` | Прерывание ответа |
| `GET /sessions/:id/audio/:audioId` | Однократная доставка временного WAV |
| `DELETE /sessions/:id` | Закрытие сессии и очистка аудио |

Существующий API guard сохранён. Сессия дополнительно связана с instance identity и HttpOnly / SameSite cookie. Credential остаётся на сервере. Чужой session ID без подходящего cookie не даёт доступ к событиям или аудио.

## Сохранение маршрутизации и защита эффектов

Новый `voice_dialogue` — короткий HTTP admission. Он использует общий лимит NeuralDeep, но не получает native session, logical owner, host resources или фиктивный CLI PID. Lease освобождается до выполнения tools. Настоящие задачи Codex сохраняют прежний surface `voice`, topic generation, FIFO, history linking и handoff barriers Task Chat.

В coordinator SQLite добавлены отдельные receipts для voice turns, HTTP requests и mutating operations. `run_codex_task` получает host-reserved task ID до первого эффекта. Повтор HTTP ACK или повтор идентичного инструмента моделью в том же turn возвращает существующее подтверждение. Изменённый payload под тем же ID отклоняется. Неопределённый результат не запускается автоматически повторно; после ошибки инструмента дальнейший проход модели ограничивается ответом без tools.

Аргументы всего tool batch проходят JSON parsing и schema validation до первого эффекта. Старый операторский CAS сохраняет проверку task ID, request ID, generation и revision. `music_control` и `confirm_voice_intake` выполняются в браузере по host-issued operation ID. Прерывание речи не отменяет уже принятую задачу Codex; её receipt и карточка могут завершиться после прерывания озвучки.

После смерти HTTP worker не создаётся CLI recovery owner. Запрос получает неизвестный/прерванный исход и остаётся защищённым от повторной отправки. Voice usage имеет отдельный source `voice-dialogue`; Chat Completions usage учитывает completion tokens и cached prompt tokens. Отсутствие usage или тарифа не превращается в нулевую стоимость.

## Аудио и контекст

- Один microphone stream; echo cancellation и noise suppression включены, AGC выключен. Сохраняется общий gain control.
- VAD: `@ricky0123/vad-web` 0.0.30, ONNX Runtime Web 1.29.0, Silero v5. Все runtime assets копируются из зафиксированных npm dependencies и отдаются локально; CDN не требуется.
- Начальные параметры: silence 600 ms, preroll 256 ms, minimum speech 96 ms, thresholds 0.5 / 0.35.
- Вход — mono PCM16 WAV 16 kHz, максимум 120 секунд / 4 MiB. Контейнер, длины и sample rate проверяются на сервере; тишина отбрасывается до LLM.
- При достижении лимита запись удерживается в RAM вкладки. Предлагается отправить её целиком или удалить; частичная команда автоматически не выполняется.
- TTS — WAV 24 kHz, одна генерация сегмента за раз и ограниченная очередь. Временное аудио имеет TTL 120 секунд. Сырые аудиозаписи не сохраняются на диск.
- Текст planning pass не озвучивается до проверки завершённого ответа и tool calls. Для обычного ответа без tools достаточно одного LLM request. TTS режет публичный текст на короткие фразы, исключая code / JSON / reasoning.
- Сервер хранит ограниченное окно из 12 групп turns / 64k символов; контекстные обновления ограничены. Существующие 120 событий текущей сессии, sticky recap, карточки задач и rolling-summary механизм остаются в общем контроллере.
- AudioContext разблокируется в пользовательском нажатии Start. Подключение можно отменить. Скрытие страницы ставит capture и озвучку на паузу; возвращение не создаёт повтор принятой команды.

## Выполненные проверки

Полный self-test в отдельном state root: **894/894 unit tests**, environment checks, privacy audit, Markdown validation, rebuild memory, smoke test и Telegram dry-run прошли. После него отдельно добавлена и пройдена проверка повторного model tool call с сохранением одного task receipt. При окончательном выпуске используется финальная проверка текущего source pin.

Новые regression tests проверяют миграцию v3 → v4, отказ старого writer, повтор ACK, конфликт payload, потерю HTTP worker, отсутствие CLI owner у dialogue, отмену во время task acceptance, предварительную проверку всего tool batch, browser result correlation, границы аудио, fragmented SSE, неизвестный provider outcome и нормализацию usage.

Отдельный 15-минутный Chromium soak с синтетической тишиной завершён за 902 секунды: соединение сохранялось во всех 30 замерах, browser errors — 0, inference requests — 0. JS heap после принудительного GC находился в пределах 9.18–10.06 MiB; это не измерение общего RSS браузера или памяти WASM. Soak проверял VAD / capture / SSE до последних небольших изменений отмены подключения и dedup; окончательная сборка отдельно проходит browser regression.

Production build и TypeScript проходят. Browser tests на Chromium и WebKit проходят с синтетическим microphone stream: загрузка локальных VAD/WASM assets, подключение, live ответ NeuralDeep с аудио, mute, смена выбранного транспорта без изменения активной сессии и остановка всех microphone tracks. Дополнительный сценарий отменяет подключение во время ожидания microphone permission, затем выдаёт запоздавший stream: tracks должны остановиться, серверная сессия удалиться, а новое подключение — пройти. WebKit automation не считается приёмкой на физическом iPhone.

### Модель и задержка

Проведена live evaluation из **100 синтетических prompts: 40 RU, 40 EN, 20 mixed**. Она проверяет выбор инструмента; инструменты в этом evaluation не выполнялись. Результат — **97/100 точных совпадений**. В 20 критических случаях не запрошены запрещённые mutating tools. Два расхождения — дополнительный read-only `inspect_codex_task` перед уточнением неоднозначного согласия; ещё один запрос завершился deadline 45 s и не допущен к выполнению инструментов.

Расход evaluation: 676 692 input tokens, 8 639 output tokens, 100 LLM requests. Это ниже согласованных лимитов. Полнота аргументов и host authorization отдельно покрываются runtime validators и regression tests; метрика 97% не подменяет эти проверки.

| Проба | Наблюдение |
| --- | --- |
| Первый короткий RU ответ, текст → LLM → TTS | Первый WAV примерно через 3.75 s |
| Следующий короткий EN ответ в той же сессии | Первый WAV примерно через 1.62 s |
| STT русской синтетической фразы | 0.90 s; текст распознан точно |
| STT английской синтетической фразы | 0.69 s; эквивалентное сокращение “I am” → “I'm” |
| Отдельный browser text → audio smoke | Около 2.89 s до первого звука |

Эти наблюдения не являются p50/p95. Для полного голосового turn дополнительно учитываются endpointing и STT. Целевые p50 ≤ 1.5 s и p95 ≤ 3 s **пока не подтверждены**. Поэтому транспорт остаётся experimental.

## Что остаётся приёмкой

- 40 голосовых реплик на настоящем Mac microphone и 40 на физическом iPhone / Safari, RU + EN + mixed.
- Реальное echo cancellation, barge-in ≤ 200 ms, разрешения microphone, audio route changes и возврат из background на iPhone.
- Оценка качества произношения имён/технических терминов и длительные разговоры со сменой темы.
- Измерение end-of-speech → first audio с p50/p95, сравнение с сохранённым Realtime на тех же устройствах.
- Строгая проверка identity / chunks / `/codex` и peer access после управляемого обновления рабочего экземпляра.

Android и локальные STT/TTS остаются отдельными последующими этапами. Существующий Realtime доступен как исходный выбор и путь возврата.

## Безопасное обновление и откат

Схема coordinator увеличена до **4**; history остаётся **1**, history registry — **3**, usage — **2**. Старый writer v3 намеренно отказывает при открытии v4. Поэтому нельзя просто fast-forward рабочий checkout под запущенным v3 runtime: CLI children читают часть кода из checkout.

Подготовлена отдельная совместимая сборка старого Realtime из `bed42945105a3ba19e56a753049f007e01882eb8`, с coordinator v4 и без нового Voice UI. Артефакт содержит source identity, BUILD_ID и digest всех executable / chunks / manifests, проверенный `verifyRollbackArtifact`. Старое состояние не требуется преобразовывать обратно в v3.

Порядок первого обновления после отдельного lifecycle approval:

1. Повторно проверить clean main, ancestry целевого commit, идентичность экземпляра и compatible rollback artifact.
2. Проверить отсутствие незавершённых CLI / host effects через read-only release-state inspector. Незавершённые задачи не отменять автоматически.
3. Установить instance-local maintenance barrier, повторно проверить drain, остановить только manager-verified целевой сервис и подтвердить завершение принадлежащих ему процессов. После остановки получить согласованный SQLite/native-history backup. До этого не создавать новый migrating coordinator store. Остановка и backup должны произойти **до** изменения checkout, чтобы не смешивать v3 и v4 writers.
4. Выполнить fast-forward main до проверенного candidate и managed local update с `--expected-commit` и `--rollback-artifact`.
5. Проверить exact commit / BUILD_ID, primary routes, chunks, `/codex`, сохранённые задачи и память. Снять maintenance barrier только после подтверждённого совместимого runtime.
6. При неуспехе использовать совместимую сборку Realtime v4; сохранять новые receipts и native history. Не восстанавливать поверх них устаревшую полную копию состояния и не открывать v4 старым writer.

Остановка, запуск и обновление рабочего сервиса в этом проходе не выполнялись. Approval boundary задан [workflow staged release](../07_workflows/control-center-staged-release.md): “Immediately before the first real service action, obtain explicit operator approval.”

## Повторяемые команды

```sh
# Из корня checkout; STATE_ROOT должен принадлежать только проверке.
node --test tests/neuraldeep-voice-journal.test.mjs tests/neuraldeep-voice-provider.test.mjs tests/neuraldeep-voice-sessions.test.mjs
node interfaces/control-center/node_modules/typescript/bin/tsc --noEmit --project interfaces/control-center/tsconfig.json

# Browser validation использует отдельно запущенный loopback candidate.
PRITHA_VOICE_E2E_BASE_URL=http://127.0.0.1:35482 node --test --test-concurrency=1 interfaces/control-center/tests/voice-pipeline.browser.mjs
# Добавить PRITHA_VOICE_E2E_LIVE=1 только для двух платных synthetic dialogue probes.

# Live model evaluation не выполняет предложенные инструменты.
PRITHA_STATE_ROOT="$STATE_ROOT" node scripts/neuraldeep/voice-eval.mjs --live --base-url http://127.0.0.1:35482 --output "$STATE_ROOT/voice-eval.json"
```
