---
id: neuraldeep-agent-creation-reliability-implementation
type: review
status: implemented-pending-release
created: 2026-09-23
updated: 2026-09-24
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
review_status: implementation-pending-release
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
| WP8: incremental SSE | Реализован отдельным изменением | Bounded UTF-8/CRLF parser, публичный incremental текст, отложенные tools, backpressure, metadata heartbeat; targeted transport tests |
| Общая проверка и реальный corpus | Шесть исходных случаев закрыты; готовых продуктов 0/6 | 1370/1370 unit на MacBook для 56ef520, 14 desktop/mobile scenarios, stock CLI 0.153/0.154. Шестой случай прошёл research с первого ответа, но выявил отказ stream identity на build probe. Последняя поправка проходит отдельную проверку; реальные неуспехи не заменены |

## WP0

Отсутствующий импорт `creation-preparation-control.mjs` добавлен в gateway fixture. Незаполненная обязательная dependency теперь даёт явную ошибку с именем модуля, а не молчаливый пустой объект. Повторные GET и approvals/replay проверяются существующими тестами. Перенос старого локального отчёта выполнен без изменения содержимого; рабочая сборка ещё не переключалась.

## WP1

Хост до запуска executor сохраняет связь creation job → delivery → iteration → launcher run. Каждый provider request сохраняет эту связь рядом со своим request hash. Повторная привязка к другой задаче запрещена.

Для старых данных используется точная host executor receipt с совпадающими delivery/attempt/launcher IDs. Префикс строки, время и название модели доказательством принадлежности не являются. Неразрешимая связь остаётся явно неизвестной.

Карточка разделяет подтверждённый итог, измеренную часть незакрытых исполнений, ожидающие и остановленные неизвестные запросы, удержанный резерв. При settlement тот же запрос не начисляется повторно; cached input уже включён в input. Проекция не переписывает ledger.

## Повторное чтение delivery и конфликты действий

Перед дополнительной серией 2026-09-24, до первого оплаченного запроса,
обнаружено изменение creation revision при обычном GET завершённого build.
Причина: в сохранённую creation job попадал весь `taskDelivery`, включая
вычисляемый `budget.elapsedMs`. Новый отсчёт времени отличался от предыдущего
snapshot; следующий GET и даже reconciliation перед POST меняли revision.
Это могло отвергать действие оператора как `creation_revision_stale`, хотя
ни работа, ни approvals, ни учтённый расход не изменялись.

Теперь `taskDelivery` возвращается как актуальная read-only проекция со своей
revision, а durable creation checkpoint хранит стабильные данные исполнения.
Прежние snapshots не мигрируются только из-за чтения. Изменение подтверждённого
расхода, состояния, recovery evidence и остальных данных исполнения по-прежнему
обновляет creation revision и отвергает действительно устаревшее действие.
Регрессия воспроизведена тестом до исправления; проверены повторные GET,
актуальный clock в ответе и отмена с revision, полученной до очередного GET.
Отдельный negative control сохраняет отказ при изменении реального usage.

## Проверки и выпуск

Журналы этапов и подтверждения состояния сохраняются в private implementation bundle. Полный suite, TypeScript, production build, transport/stock-CLI/browser acceptance и реальный ограниченный corpus ещё обязательны перед итоговым заключением. Приёмка человеком и settlement неизвестного расхода остаются отдельными действиями.

## WP3

Новая execution policy закрепляет модель, configured prompt budget и время итерации. Все фазы одной итерации используют абсолютные soft/hard deadlines. Admission после soft deadline отказывает до reservation; завершение уже начатого запроса разрешено до request deadline с отдельным settlement grace. Wrapper завершает только свой процесс. Причины остановки и transport timing записываются отдельно; потерянный final usage остаётся unknown. Legacy jobs сохраняют прежние 12 минут и закреплённый executor.

## Реальный отказ подготовки и согласование таймеров

Дополнительная серия 24 сентября остановилась в первом случае ещё на interview:
локальный adapter прервал живой ответ через 930008 мс, последний byte получен
на 929969 мс. Final usage отсутствует. Это не доказательство сетевого отказа:
runtime receipt содержит `timedOut: true`, а причина — локальный `provider_timeout`.
Верхний срок шага был 1800000 мс, но chat CLI не передавал deadline адаптеру.
Кроме того, idle timeout самого Codex CLI составлял 960000 мс: изменение только
адаптера оставило бы второй преждевременный обрыв для буферизованного brief.

Новые jobs закрепляют execution policy v2. Для подготовки gateway рассчитывает
абсолютный deadline из сохранённого времени итерации и остатка общего active-time
budget и передаёт его через CLI в adapter и runtime receipt. Уже начатый запрос
может использовать оставшееся время шага, но до hard deadline остаётся отдельный
settlement grace (30 секунд при обычных лимитах). Новый запрос не допускается в
последнюю минуту; для короткого окна этот порог уменьшается. Adapter не обрезает
v2 deadline прежними 930 секундами, а Codex idle timeout согласован с тем же
пределом. Внешний runner сохраняет абсолютный hard stop. Старые jobs с execution
policy v1 не мигрируют; сроки build/probe и общий token budget не расширяются.

Локальные `provider_timeout`, `iteration_deadline` и `provider_iteration_deadline`
отделены от upstream outage и отмены оператором. Они не запускают автоматическое
outage continuation. Карточка сообщает, что запрос остановила Pritha, сохраняет
unknown usage и запрещает новый dispatch до подтверждения учёта и завершения.
Настоящий HTTP 504 и разрыв соединения по-прежнему остаются provider outage.

До исправления пять регрессионных проверок отказали. Проверяются медленный
успешный ответ после 930 секунд, hard stop живого потока без выдуманного usage,
отказ нового dispatch после soft deadline/suspend, неизменность старой policy,
передача deadline gateway → CLI → adapter и сохранение причины в карточке.
Проверки используют управляемые часы и fixtures, без платных запросов.

Публичный endpoint NeuralDeep `/api/public/tier-limits` на 24 сентября всё ещё
возвращает `gateway_timeout_sec: 900`. Наблюдаемые bytes после 900 секунд
показывают, что это значение нельзя считать гарантией terminal response с usage
к заданной секунде. Поведение провайдера и скорость модели остаются отдельным
неподтверждённым ограничением; более длинный локальный срок не доказывает, что
реальная модель завершит ответ. См. [документацию провайдера](https://neuraldeep.ru/llms-full.txt).

Исходные шесть случаев остаются 0/6. Дополнительная серия — 0/1 выполненных
случаев, ещё два не запущены по заранее согласованному правилу остановки при
unknown usage. Лимит неуспешного случая удержан целиком; retries и замены нет.

## WP4

Research protocol v2 отделяет выбранные возможности от advisory memory seeds. Его исходная contract policy 2 сохраняется для старых jobs; новые jobs закрепляют `researchTopicPolicyVersion: 3` и contract `research_topic_policy: 3`. Отрицательные требования не включают Voice, Telegram, RAG. Исторический failed/draft материал используется как урок; повторные разделы ограничены на документ.

Хост выполняет не более 12 обязательных тем, по два последовательных acquisition attempts на тему за generation, каждый не более одного Search и одного Read; независимые лимиты Search Settings сохраняются. Policy 3 сначала читает известный первоисточник по теме, а при отсутствии такого адреса выбирает релевантный результат Search внутри разрешённых domains. Эти операции используют web/search quota, а не модельный token budget. Время операций входит в active-time budget. Exact topic, primary-domain list, каждый attempted URL, search/read receipts, read page, excerpt и SHA-256 сохраняются до model selection. Reload не сбрасывает счётчики. Незавершённая операция не повторяется автоматически.

Модель одним bounded запросом выбирает точные выдержки и объясняет совместимость; tools отключены. Хост проверяет topic/source identity, exact quote, поля, freshness/version rule, coverage и synthesis, затем публикует locked report с CAS. Это проверка происхождения и структурной полноты, а не математическое доказательство истинности интерпретации. Допустима одна оплаченная структурная коррекция из прежнего бюджета. Неизвестный usage не даёт права повторить запрос. Невыбранные/неподдержанные источники остаются явным блокером с возможностью пересмотра требования.

## Дополнительные отказы реального research и их устранение

В реальном LLM-app случае первый ответ точно скопировал опубликованные host
excerpts для пяти тем. Все пять состояли из склеенных несмежных строк, тогда как
проверка требовала непрерывный фрагмент исходной страницы. Это дефект контракта
между выдачей хоста и валидатором, а не доказательство искажения цитат моделью.
Ограниченная коррекция сохранила валидные факты, но стоила ещё одного запроса.

Новые jobs закрепляют `researchSelectionVersion: 2`. Хост выдаёт отдельные
проверенные passages (не более восьми на страницу) со стабильными source-bound
IDs; модель выбирает `passageId`. Текст цитаты подставляет хост. Чужой ID,
другая тема, неизвестная цитата и одновременный `quote` не проходят. Внешний
текст остаётся недоверенным; checks hash/freshness, темы и synthesis сохранены.
Старые jobs без поля или с selection v1 сохраняют прежний формат, replay не
мигрирует их; версия проверяется в context packet и неизменяема в job.

После валидной публикации выявлен второй дефект: registry-only / adoption none
блокировался только из-за устаревших метаданных рекомендательных GitHub rows.
Теперь именно такой необязательный lookup завершается с предупреждением;
старые даты и candidate blockers остаются. Это не объявляет metadata свежими
и не разрешает заимствование. Required research, явный выбор repository и
selected-module по-прежнему требуют прежних доказательств; контрольные тесты
подтверждают, что старый registry их не закрывает.

Если все темы источников уже закрыты, но другой обязательный host gate остаётся
блокирован, tool-free research останавливается с его причиной до нового
платного запроса. Модель без инструментов не может исправить repository gate.
Сохранённые факты, approvals и расход при этом остаются доступными.

## WP5 — Settings и пределы

Повторно проверена документация NeuralDeep от 2026-09-23: `https://neuraldeep.ru/llms-full.txt`. Для Qwen 3.8/3.6 `reasoning_effort` не управляет thinking. Каталог теперь отделяет advertised reasoning от действующего effort; Qwen получает «не применяется». Это не переключение на noreason. Неверифицированные `chat_template_kwargs` в Responses не внедряются. Default model не подменяет выбранный model ID при невалидном значении.

Versioned profile закрепляет provider-declared context (Qwen 262144), application output cap, requested/effective effort и статус transport verification. Исходный profile v1 задавал 8192; изменение v2 после реальных проверок описано ниже. CLI получает context declaration, а reservation проверяется отдельно. Byte reserve остаётся консервативной оценкой; tokenizer не заявлен. Все фазы новой job используют её model ID и timeout, а не последующие изменения Settings. UI показывает configured prompt budget как настройку общего чата, отдельно от preparation caps. Research v2 передаёт один context packet без coding prompt и дублированной tool history. 39/39 исходных профильных тестов пройдены.

## Предел ответа: реальные проверки и профиль v2

После исправления локали две независимые исходные задачи (малый CLI и публичный API) завершили первый запрос без пригодного ответа. Расход — 9805 и 9803 токена, включая ровно 8192 output tokens в каждом случае. Входной запрос около 7 КиБ; ответ завершился за 239–250 секунд, до deadline. Подтверждён выход на предел ответа, а не переполнение контекста или timeout. Отдельный reasoning usage отсутствовал: нельзя утверждать, что все output tokens были reasoning, или считать нормализованный ноль доказательством отсутствия thinking.

В profile v2 для Qwen с thinking предел ответа увеличен до 16384. Полный резерв включает этот предел до отправки; общий миллион на создание, квоты подготовки, число запросов и deadlines сохранены. Старые profiles/preparation policies остаются 8192. Это проверяемая гипотеза устранения обрыва, её успешность должна определяться оставшимися исходными случаями. Модель не подменяется, недоказанные thinking kwargs не добавляются, неудачные случаи не заменяются новыми.

Adapter сохраняет только структурные terminal metadata: status, число типов output, наличие публичного текста, достигнутый output cap, nullable reasoning count и ограниченный incomplete reason. Содержимое ответа, reasoning, provider IDs и сообщения ошибок туда не попадают. Empty response на границе лимита получает `neuraldeep_output_limit`; неизвестная ошибка больше не маскируется советом проверить вложение. Final usage сохраняется и при format error; автоматического оплаченного повтора нет.

## WP6

Installed stock Codex sandbox проверен реальным отрицательным тестом против доступного host loopback server. Даже при `network_access=true` в тестовом config команда с явной host policy получает EPERM/EACCES. Исправлен устаревший plural `--permissions-profile` на поддерживаемый `--permission-profile`; Network denial входит в probe. Без успешного probe sandbox Trial не исполняется. Local backend по-прежнему не считается доказательством отсутствия inference.

Locked host-template verifier запускается из созданной хостом копии вне writable product worktree; SHA-256 сверяется с approved Outcome. Контрольные неправильные продукты отвергнуты: smoke stub, fabricated digest, потерянные ссылки, неправильный язык, игнорирование scoped bearer и потеря persistence. Source errors, provider 429/malformed/disabled, восстановление и restart проверяются контролируемыми upstream fixtures. 43/43 targeted tests пройдены, включая installed stock sandbox. Эти проверки не закрывают operator-judged Trials и не доказывают качество реального LLM ответа.

## WP7

Оператор видит доступное локальное восстановление отдельно от новых запросов модели. Unknown usage не превращается в обещание успешной сверки. Сообщения объясняют изменённый source, устаревшие Trials, незавершённый процесс и недоказанное отсутствие inference. Typed delivery conflict сохраняет свой HTTP status/code.

Реальная загрузка источников выявила промежуток, когда persisted job ещё
`pending`, а host step уже выполняется. Прежний GET предлагал Continue, который
POST отклонял как active step. Теперь read-only projection учитывает активные
host operations: скрывает конфликтующие действия, показывает подготовку и
оставляет pause/cancel. Это не меняет записанный status, revision, бюджет или
закреплённую execution policy. Проверяются повторный GET без dispatch, отмена
запроса источников через pause и возвращение допустимых действий после остановки.

После перезапуска research v2 сначала публикует ответ из сохранённого history, затем вычисляет semantic progress. Crash до очистки activeTurnId и между очисткой и публикацией не вызывает преждевременного no-progress. GET не отправляет model request и не запускает repair; paused сохраняется. Инструкция оператора, архитектура, provider/Settings guide и основной workflow разделяют ND CLI от исторических App Server Goals. Recovery с потерей browser acknowledgement включён в desktop/mobile browser corpus.

## WP8

Обычные Responses проходят incremental normalizer с ограничением 32 МиБ всего и 8 МиБ на событие. Явные публичные message deltas поступают до terminal; reasoning сохраняет свой тип. Несовместимые output_text-on-reasoning события ждут канонического результата. Стабильные IDs, namespace Search и восстановление отсутствующего terminal message сохраняются. Текст, который противоречит terminal snapshot, не объявляется завершённым.

Tool events удерживаются до EOF, complete terminal и проверки целых аргументов. Host accounting записывается до выдачи завершённого инструмента. При неполном ответе tool completion не выпускается. Parser обрабатывает разрезанный UTF-8/CRLF, размер кадра, нарушенный порядок, backpressure и disconnect. После начала потока ошибка приходит как response.failed; нет автоматического replay. Полученный final usage сохраняется даже при ошибке формата, отсутствующий остаётся unknown. Ошибки протокола отделены от outage, чтобы форматный отказ не вызывал автоматический повтор.

Tool-free brief/research v2 сохраняют буферизацию для проверки всего ответа до доступа executor. Host heartbeat показывает только время/байты/состояние; reasoning и приватный ответ не входят в progress receipt. Stock-CLI совместимость проверяется отдельно перед выпуском.

### Совместимость идентификаторов потока

Шестой реальный случай получил completed ответы с public text и final usage,
но incremental adapter отверг две квитанции как `neuraldeep_stream_identity`.
Перед этим native command probe выполнил требуемую команду. Это локальная
ошибка нормализации, не output cap и не доказанное отсутствие tools у модели.
Сырые SSE этих ephemeral probes не сохранялись: точный вариант расхождения
ID по старому журналу восстановить нельзя. Известны слой, код, завершённый
upstream response, количество элементов, usage и отсутствие timeout.

Детерминированно воспроизведены два отвергавшихся случая: пустой message
placeholder перед каноническим terminal message с другим ID; и переименованный
terminal message с тем же полным публичным текстом. Теперь пустой placeholder
не выдаётся как начавшееся сообщение. Для уже переданного текста сохраняется
его ID только при взаимно однозначном полном совпадении всех текстовых частей.
Общий префикс, позиция, изменённый текст или неоднозначность не дают права
исправить ID. Reasoning не превращается в публичный ответ; инструменты всё ещё
ждут полного terminal/EOF и записи usage. Stock fixture включает оба варианта.

Build probe сохраняет безопасный код provider/adapter error в phase receipt и
показывает его в причине остановки. Если первая фаза не прошла, вторая платная
schema-фаза больше не отправляется. Успешный tool probe по-прежнему требует
отдельной успешной проверки schema. Исправленная совместимость не проверялась
скрытым повтором шестого реального случая.

На созданном scaffold также обнаружен macOS `.DS_Store`: это единственное
незарегистрированное изменение исходного каталога, из-за которого recovery
показывал `creation_source_changed`. Новые scaffolds включают `.DS_Store` в
обычный Git ignore. Старые child files и approvals не изменены; остальные
изменения source по-прежнему блокируют adoption.

## Замечания общей проверки

Production build, 12 desktop/mobile browser scenarios и installed CLI synthetic transport/legacy creation прошли. Первый полный unit run: 1328/1329; единственный отказ — тестовый TS-loader не разрешал новый model-execution-profile import. Fixture исправлен; повторный полный локальный suite: 1334/1334. Stock CLI 0.153 локально и 0.154 на MacBook прошли synthetic transport и создание по research v2: четыре preparation sessions, неправильный продукт отклонён, проверенный принят в target, человеческая приёмка не выставлена. Synthetic usage не является замером производительности настоящей модели.

Полный suite на MacBook: 1332/1334. Full env-doctor прошёл после выбора установленного Python из Anaconda. Второй отказ выявил реальный дефект: установленный macOS `/usr/bin/env` не поддерживает `-C`. Sandbox backend теперь меняет command cwd через Node без shell, независимо от writable root. Проверяются запрет сети, каталог с пробелами, буквальные аргументы и exit code. Recovery использует тот же выбор Trial backend, что и delivery, вместо отсутствующего поля policy.

Пользователь разрешил шесть реальных созданий: два CLI без LLM, два публичных API и два NeuralDeep-продукта, по 1 000 000 токенов, всего не более 6 000 000. Корпус запускается последовательно в отдельном экземпляре MacBook. План, prompts, release, модель Qwen 3.8-27B и число попыток фиксируются до первого запроса. Неизвестный расход останавливает последующие задания. Неуспешные попытки не заменяются новыми; финальная приёмка человеком остаётся отдельной. Результаты сохраняются в instance audit, а не дописываются задним числом в исходные задания.

## Дефект, найденный настоящим запуском на MacBook

Кандидат `49c4a65` прошёл полный self-test на MacBook, но первый реальный job выявил зависимость process ownership probe от локали пользовательского сеанса. В `ru_RU.UTF-8` macOS `ps lstart` выдаёт десять полей вместо ожидаемых девяти; прежний parser отбрасывал строки и завершался с `process_snapshot_invalid`. SSH/C locale и synthetic CLI этого не воспроизводили. Ошибка происходила до создания runtime receipt; вслед за этим сохранялись unknown и `creation_execution_unconfirmed`.

Системный `ps` теперь получает `LC_ALL=C`; непонятная непустая строка делает весь snapshot недостоверным и не отбрасывается молча. Host runtime receipt создаётся до ранних probes. Если stock executor не запускался, finally сохраняет `no_stock_dispatch`; новый такой отказ имеет доказанный нулевой расход и явную локальную причину. Это не отменяет проверку ownership и не разрешает отправку без неё. 34/34 process/launcher/accounting tests и 19/19 повторных launcher/accounting tests прошли локально, включая настоящий probe под русской локалью и отсутствие сети при раннем отказе.

Историческая неразрешённая квитанция первого job не восстанавливается задним числом и не объявляется нулём. Этот прогон остаётся неуспехом. Для оставшихся пяти исходных заданий протокол дополняется явно до запуска: весь первый лимит 1 млн удерживается как worst-case allocation, остаётся максимум 5 млн; candidate SHA каждого задания записывается отдельно. Первое задание не заменяется и не продолжается. Такие результаты нельзя выдавать за шесть успешных проходов на одном неизменном выпуске.

Stock-CLI receipt также выявил расхождение между показанным profile output cap 8192 и прежним общим build cap 16384. Допуск build теперь использует profile cap, отдельно от preparation caps; меньший явный лимит сохраняется. Добавлен stock acceptance нового research v2, включая host page collection, точные excerpts и единственный model selection без shell. Host source publication читает журнал внутри lock; retrieval date из будущего отклоняется с допуском на пять минут расхождения часов.

## Research-дефекты, найденные четвёртым реальным случаем

После успешного brief четвёртый исходный случай на 9c508ed остановился на
`primary_page_empty`. Saved Search/Read evidence подтвердило три отдельные причины:
шаблон `minimal until scaffold profile is selected` стал обязательной зависимостью;
первый разрешённый по domain URL оказался нерелевантным (MDN User-Agent Client Hints,
затем npm-страница чужого runtime); вся последняя страница из 16000 символов была
одной строкой, которую прежний excerpt extractor полностью отбрасывал при лимите
2400 байт. Вторая попытка читала тот же источник; сообщение всё ещё обещало повтор.

Topic policy 3 исключает template placeholders и корректно обрабатывает русские
отрицания. Для известных тем она задаёт проверенные первичные страницы; Node.js
использует официальные Markdown API pages без длинного HTML оглавления. При
поиске недостаточно совпадения domain: результат должен иметь слова темы в
URL/title/snippet. Это heuristic relevance filter, не доказательство правильности
интерпретации. Точные факты и compatibility по-прежнему проверяются отдельным gate.
Источники: [Node HTTP](https://nodejs.org/api/http.md),
[Node Process](https://nodejs.org/api/process.md),
[MediaWiki Search](https://www.mediawiki.org/wiki/API:Search),
[OWASP XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).
Доступность адресов проверена 2026-09-23; переходы Learn/HTTP и Learn/exit,
возвращавшие 404, в policy не включены.

Новая обработка длинной строки выделяет ограниченные фрагменты по целым Unicode
code points. Итоговая выдержка не больше 2400 UTF-8 байт. Quote должен совпадать
не только с excerpt, но и с непрерывным фрагментом оригинального текста: модель
не может склеить удалённые места в одну поддельную цитату.

Для подтверждённо пустой страницы или snippet вместо Read разрешён один переход
к другому источнику внутри прежних двух attempts, без вмешательства оператора.
Credential/quota/transport failure автоматически не повторяется. После двух
ошибок сообщение честно указывает исчерпание, а reload сохраняет URL, receipts и
счётчики. Незавершённый dispatch остаётся unconfirmed и не повторяется.

Policy 2 и legacy topics воспроизводятся прежними модулями и не переписываются.
Новые правила не разрешают изменять старые approvals, research files или release
pins. Четвёртый реальный случай остаётся зафиксированным неуспехом на 9c508ed;
его исходники не исправлялись вручную. Реальные ограничения, расходы и результаты
оставшихся исходных случаев публикуются отдельно в instance verification report.
