---
id: agent-provider-binding
type: workflow
status: active
created: 2026-09-19
updated: 2026-09-19
topics: [agents, neuraldeep, provider-binding]
tools: [NeuralDeep, SQLite]
sources: [scripts/neuraldeep/agent-provider-binding.mjs, scripts/neuraldeep/agent-provider-broker.mjs]
related: {}
supersedes: []
superseded_by: []
---

# Подключение агента к NeuralDeep Pritha

В карточке агента открыть **Connections → NeuralDeep для агента**. Выбрать
**NeuralDeep этого экземпляра**, явно выбрать модель и сохранить. Затем запустить
агента; для уже работающего агента выполнить Stop и Start. Начальное состояние —
**Отключено**. Модель не заменяется автоматически при изменении каталога.

Привязка доступна только агенту с контрактом текущего экземпляра, однозначным
каталогом в его agent parent и managed runtime `detached-node-process`. Launchd,
внешние сервисы и исторические карточки не получают процессную привязку.

Pritha сохраняет в своём private admission SQLite только identity, выбранную
модель, режим, ревизию и hash отдельного случайного process token. Ключ провайдера
остаётся в настройках/Keychain Pritha. Ни ключ, ни process token не возвращаются
в UI, не записываются в исходники, `.env`, документы или журнал запросов.

При Start хост передаёт только серверному процессу:

- `PRITHA_LLM_BASE_URL`: локальный endpoint Pritha, заканчивается `/llm/v1`.
- `PRITHA_LLM_MODEL`: явно выбранная модель.
- `PRITHA_LLM_TOKEN`: отдельный bearer capability только для этого агента.

Приложение выполняет серверный `POST ${PRITHA_LLM_BASE_URL}/chat/completions`,
заголовок `Authorization: Bearer ${PRITHA_LLM_TOKEN}`, JSON:

```json
{"model":"<PRITHA_LLM_MODEL>","messages":[{"role":"user","content":"<text>"}],"stream":false,"max_tokens":4096}
```

Ответ содержит `choices[0].message.content`. Разрешены только текстовые сообщения
`system`, `user`, `assistant`: не более 64 сообщений, 200000 символов всего,
100000 символов в одном сообщении, 256 KiB JSON; `max_tokens` от 1 до 4096.
Опциональная `temperature` — от 0 до 2. Один запрос занимает не более 60 секунд,
включая admission; вывод — не более 64000 символов. Streaming, tools, произвольные
upstream URL и автоматические retries отсутствуют. Необязательный уникальный
`X-Pritha-Request-Id` позволяет повторному отправителю получить конфликт вместо
второго платного dispatch. Текст запросов и ответов в журнале не сохраняется.

**Отключено** сразу запрещает новые запросы, а текущий ответ после изменения
привязки не принимается. Возврат той же модели восстанавливает доступ уже
запущенного процесса. Смена модели или новый Start меняют process capability;
старое значение перестаёт действовать. Перезапуск только Pritha сохраняет
привязку работающего агента.

Broker использует общую admission capacity и отдельный учёт `child-agent`.
Незавершённый intent, потерянный receipt или неизвестный расход блокирует следующий
запрос этого агента. Перезапуск, смена модели и отключение/восстановление не
сбрасывают этот blocker. Проверка сохранённых receipts выполняется хостом; UI
привязки не утверждает неизвестный расход и не повторяет inference.

Ошибки имеют вид `{ "ok": false, "error": { "code": "..." } }`.
Основные коды: `provider_binding_disabled`, `provider_binding_changed`,
`provider_not_configured`, `provider_capacity`, `provider_timeout`,
`provider_response_invalid`, `provider_usage_unconfirmed`.
Приложение сохраняет предыдущие дайджесты и предлагает пользователю повторить
действие, когда подключение восстановлено и расход предыдущего запроса известен.

Для независимого verifier хост может подменить три process env переменные
контролируемым локальным mock. Такой mock не является реальным подключением
NeuralDeep; реальная сводка проверяется отдельно в пользовательском UI-прогоне.
