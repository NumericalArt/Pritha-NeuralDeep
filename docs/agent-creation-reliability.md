---
id: neuraldeep-agent-creation-reliability-implementation
type: review
status: in-progress
created: 2026-09-23
updated: 2026-09-23
topics: [neuraldeep, agent-creation, reliability, recovery]
tools: [Pritha, Node.js, SQLite, Codex CLI]
sources: [2026-09-23-neuraldeep-agent-creation-deep-audit, 2026-09-23-neuraldeep-agent-creation-reliability-plan]
related:
  workflows: [2026-09-23-neuraldeep-agent-creation-reliability-plan]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: neuraldeep-agent-creation
privacy: internal
retention: durable
review_status: implementation-in-progress
confidence: high
---

# Устойчивое создание агентов: реализация плана аудита

Работа относится к NeuralDeep на MacBook. Начальная ревизия — `d625e836c149a393bd361870c897df8f934ff7d2`. Каноническая Pritha и остальные экземпляры не изменяются. Архив аудита остаётся описанием исходного состояния; этот документ фиксирует последующие изменения.

Сверка Good State выполнена: сохраняются история, отдельные approvals, isolation state, закреплённые версии старых jobs, ownership процессов и штатный staged release. Код готовится в отдельной рабочей копии. Изменения runtime выпускаются после проверок.

| Этап | Состояние | Подтверждение |
|---|---|---|
| WP0: исходная точка | Выполнен | Согласованные SQLite backups; сохранены jobs, delivery evidence и Git bundles кандидата; operations report перенесён в instance memory с прежним SHA-256; source чистый. 28/28 gateway tests |
| WP1: расход | Реализован, проверен локально | Явная host-owned lineage, legacy receipt binding, нижняя граница 208544 и unknown=1, без двойного начисления после settlement. 26/26 targeted tests |
| WP2: безопасное восстановление | Реализован, проверен локально | 8/8 recovery tests; freshness, task/spec identity, process-tree exit, adoption без новых команд; неизвестный расход сохраняется |
| WP3: deadlines | Реализован, проверен локально | 63/63 targeted tests: общий срок фаз, soft admission до reservation, медленный ответ с final usage, зависание с unknown, suspend, неизменность policy |
| WP4: применимое исследование | Реализован, проверен локально | 57/57 targeted tests; v2 новых jobs, primary Search/Read, immutable page hashes, точные выдержки и host publication; legacy policy сохранена |
| WP5: effective settings | Реализован, 39/39 tests | Profile distinguishes provider declarations, transport verification, ignored Qwen effort, pinned model/context/output/application caps |
| WP6: независимые Trials | Реализован, проверен локально | Реальный stock sandbox network-denial; независимые negative controls; host verifier copy вне product worktree |
| WP7: интерфейс и инструкции | Реализован, локальные проверки пройдены | 37/37 gateway/UI tests, TypeScript; браузерные recovery fixtures подготовлены для общей проверки |
| WP8: incremental SSE | Запланирован отдельным изменением | — |
| Общая проверка и реальный corpus | Не выполнены | Локальные тесты не означают создание реального продукта |

## WP0

Отсутствующий импорт `creation-preparation-control.mjs` добавлен в gateway fixture. Незаполненная обязательная dependency теперь даёт явную ошибку с именем модуля, а не молчаливый пустой объект. Повторные GET и approvals/replay проверяются существующими тестами. Перенос старого локального отчёта выполнен без изменения содержимого; рабочая сборка ещё не переключалась.

## WP1

Хост до запуска executor сохраняет связь creation job → delivery → iteration → launcher run. Каждый provider request сохраняет эту связь рядом со своим request hash. Повторная привязка к другой задаче запрещена.

Для старых данных используется точная host executor receipt с совпадающими delivery/attempt/launcher IDs. Префикс строки, время и название модели доказательством принадлежности не являются. Неразрешимая связь остаётся явно неизвестной.

Карточка разделяет подтверждённый итог, измеренную часть незакрытых исполнений, ожидающие и остановленные неизвестные запросы, удержанный резерв. При settlement тот же запрос не начисляется повторно; cached input уже включён в input. Проекция не переписывает ledger.

## Проверки и выпуск

Журналы этапов и подтверждения состояния сохраняются в private implementation bundle. Полный suite, TypeScript, production build, transport/stock-CLI/browser acceptance и реальный ограниченный corpus ещё обязательны перед итоговым заключением. Приёмка человеком и settlement неизвестного расхода остаются отдельными действиями.

## WP3

Новая execution policy закрепляет модель, configured prompt budget и время итерации. Все фазы одной итерации используют абсолютные soft/hard deadlines. Admission после soft deadline отказывает до reservation; завершение уже начатого запроса разрешено до request deadline с отдельным settlement grace. Wrapper завершает только свой процесс. Причины остановки и transport timing записываются отдельно; потерянный final usage остаётся unknown. Legacy jobs сохраняют прежние 12 минут и закреплённый executor.

## WP4

Для новых chat jobs research protocol v2 и contract `research_topic_policy: 2` отделяют выбранные возможности от advisory memory seeds. Отрицательные требования не включают Voice, Telegram, RAG. Исторический failed/draft материал используется как урок; повторные разделы ограничены на документ.

Хост выполняет не более 12 обязательных тем, по два последовательных Search/Read attempts на тему за generation; независимые лимиты Search Settings также сохраняются. Эти операции используют web/search quota, а не модельный token budget. Время операций входит в active-time budget. Exact topic, primary-domain list, search/read receipts, read page, excerpt и SHA-256 сохраняются до model selection. Reload не сбрасывает счётчики. Незавершённая операция не повторяется автоматически.

Модель одним bounded запросом выбирает точные выдержки и объясняет совместимость; tools отключены. Хост проверяет topic/source identity, exact quote, поля, freshness/version rule, coverage и synthesis, затем публикует locked report с CAS. Это проверка происхождения и структурной полноты, а не математическое доказательство истинности интерпретации. Допустима одна оплаченная структурная коррекция из прежнего бюджета. Неизвестный usage не даёт права повторить запрос. Невыбранные/неподдержанные источники остаются явным блокером с возможностью пересмотра требования.

## WP5

Повторно проверена документация NeuralDeep от 2026-09-23: `https://neuraldeep.ru/llms-full.txt`. Для Qwen 3.8/3.6 `reasoning_effort` не управляет thinking. Каталог теперь отделяет advertised reasoning от действующего effort; Qwen получает «не применяется». Это не переключение на noreason. Неверифицированные `chat_template_kwargs` в Responses не внедряются. Default model не подменяет выбранный model ID при невалидном значении.

Versioned profile закрепляет provider-declared context (Qwen 262144), application output cap 8192, requested/effective effort и статус transport verification. CLI получает context declaration, а reservation проверяется отдельно. Byte reserve остаётся консервативной оценкой; tokenizer не заявлен. Все фазы новой job используют её model ID и timeout, а не последующие изменения Settings. UI показывает configured prompt budget как настройку общего чата, отдельно от preparation caps. Research v2 передаёт один context packet без coding prompt и дублированной tool history. 39/39 профильных тестов пройдены.

## WP6

Installed stock Codex sandbox проверен реальным отрицательным тестом против доступного host loopback server. Даже при `network_access=true` в тестовом config команда с явной host policy получает EPERM/EACCES. Исправлен устаревший plural `--permissions-profile` на поддерживаемый `--permission-profile`; Network denial входит в probe. Без успешного probe sandbox Trial не исполняется. Local backend по-прежнему не считается доказательством отсутствия inference.

Locked host-template verifier запускается из созданной хостом копии вне writable product worktree; SHA-256 сверяется с approved Outcome. Контрольные неправильные продукты отвергнуты: smoke stub, fabricated digest, потерянные ссылки, неправильный язык, игнорирование scoped bearer и потеря persistence. Source errors, provider 429/malformed/disabled, восстановление и restart проверяются контролируемыми upstream fixtures. 43/43 targeted tests пройдены, включая installed stock sandbox. Эти проверки не закрывают operator-judged Trials и не доказывают качество реального LLM ответа.

## WP7

Оператор видит доступное локальное восстановление отдельно от новых запросов модели. Unknown usage не превращается в обещание успешной сверки. Сообщения объясняют изменённый source, устаревшие Trials, незавершённый процесс и недоказанное отсутствие inference. Typed delivery conflict сохраняет свой HTTP status/code.

После перезапуска research v2 сначала публикует ответ из сохранённого history, затем вычисляет semantic progress. Crash до очистки activeTurnId и между очисткой и публикацией не вызывает преждевременного no-progress. GET не отправляет model request и не запускает repair; paused сохраняется. Инструкция оператора, архитектура, provider/Settings guide и основной workflow разделяют ND CLI от исторических App Server Goals. Recovery с потерей browser acknowledgement включён в desktop/mobile browser corpus.
