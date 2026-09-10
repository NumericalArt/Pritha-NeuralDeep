---
id: neuraldeep-search-verification-2026-09-10
type: agent-test-report
status: reviewed
created: 2026-09-10
updated: 2026-09-10
topics: [neuraldeep, search, research, regression, release]
tools: [Node.js, SQLite, Playwright, Codex CLI]
sources: [operator-neuraldeep-search-implementation-plan-2026-09-10]
related:
  workflows: [07_workflows/control-center-staged-release.md]
  references: [docs/neuraldeep-search.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject: {kind: pritha, id: pritha-neuraldeep}
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_version: base 354993a108556f15a1a574a09b4890ad94fefd1b; Node 24.15.0; Codex CLI 0.153.0
verified: 2026-09-10
temporal_status: version-bound
---

# Search: реализация и приёмка

Дополнение при выпуске: штатный manager дважды откатил candidate после таймаута
legacy `/codex`; строгая проверка предыдущей сборки прошла. Проверка кода выявила,
что этот redirect предварительно рендерил AppShell с host-диагностикой. Добавлено
раннее временное перенаправление `/codex` → `/task-chat` в Next config. Desktop/mobile
проверяют HTTP 307, сохранение повторяющихся и Unicode query-параметров и загрузку
целевой страницы. Порог health и правила rollback не ослаблялись.

Код реализован в отдельном checkout. Рабочие .next, state-root, история, очереди
и Keys production не использованы как тестовые хранилища. Исходная приёмка ниже
выполнена до обновления сервиса; попытки выпуска отмечены отдельно выше.
Реальный API использован только в явно обозначенных live-проверках; ключ читался
из существующего Keychain, не копировался в конфигурацию/аргументы/Git.

## Проверенная реализация

Общий SearchService, SQLite/revisions/budgets/cache, NeuralDeep Search/Crawl/Quota,
SearXNG fallback, SSRF/redirect/body/deadline guards, Settings, Chat MCP,
Voice dispatch/cancellation, ограниченный Research runner/API/UI и child stdio adapter.
Root dependencies устанавливаются штатным bootstrap/updater до сборки Control Center.

Research покрывает idempotency, owner scope, очередь, отмену, interrupted/resume,
резервирование inference, общий provider admission, usage recovery и source-bound report.
При Search Off новые вызовы запрещаются; queued jobs отменяются немедленно,
running jobs переходят к отмене с сохранённым checkpoint.

## Проверки

- Полный unit suite: 933/933, fail0. Дополнительные целевые Search/Research проверки —34/34.
- Production build и TypeScript typecheck: pass.
- Settings desktop/mobile: сохранение, Off, тестовый поиск, revision409,
  cross-origin403, отсутствие автоматического исследования, idempotent job/cancel,
  отсутствие фиктивного completed-report при недоступном credential.
- Установленный stock CLI: обнаружение MCP, реальный вызов/результат, новый чат и
  resume с тем же session ID. Synthetic provider; платных запросов0.
- Живые модели: Qwen3.6-35b-a3b и Kimi-k2.6 вызвали MCP web_search, получили официальный
  источник и ответили со ссылкой из результата. Один первоначальный Kimi turn после
  успешного поиска превысил180s; отдельный повтор с effort low прошёл. Общая настройка
  модели пользователя не изменялась. Это ограниченная проверка, не SLA model latency.
- Live Voice HTTP handler: NeuralDeep Search вернул источник; после Off тот же handler вернул disabled. Микрофон/STT/TTS в этой проверке не использовались.
- Privacy audit: pass. Self-test: pass; отдельная тестовая память, production history
  не копировалась. Предупреждение env-doctor о Python3.9 — существующий baseline.
- Strict health тестового сервера: pass, включая /voice, /agents, /task-chat, /codex,
  /settings и JavaScript chunks. Production identity проверяется ещё раз после релиза.
- Bootstrap и штатный update/rollback:21/21, включая возврат старой сборки/private state,
  проверку ownership и отказ опасного rollback при неподтверждённой остановке.
- Snapshot brief-desk-nd:10/10 существующих тестов workflow/approval/publication receipt.
  Production дочерний агент не патчился и не перезапускался.

## Live benchmark и решение о включении

Заранее зафиксировано30 RU/EN cases: документация10, текущие версии5, новости5,
сравнения3, российские/русские источники3, неоднозначные2, ожидаемо нерезультативные2.
Ожидания заданы до API-вызовов. Сохранены operation/source IDs, latency, неизвестные
publication dates, результаты чтения и отдельные факты незавершённых проверок.

Финальный изолированный прогон:30Search,6Crawl; p95 Search3554ms; официальный домен
в top-3 для8/10 документационных запросов. Это только проверяемый proxy полезности,
не доказательство релевантности каждого документа. Критерий90% не пройден уже по нему.

Первый прогон был остановлен по существу после18 успешных Search/8Crawl: параллельный
UI-тест изменил тестовые настройки. Его не смешивали с финальной метрикой.
Benchmark перенесён в собственный вложенный state, выполнен заново. Всего benchmark
в пределах50Search/20Crawl:48Search/14Crawl. Проверки моделей — отдельные маленькие
интеграционные проверки. Crawl остановлен с запасом10 дневных операций общего ключа.

Наблюдения: текущий Node.js запрос выводил сторонние страницы вместо release authority;
новостной запрос мог находить публикацию другого месяца; несуществующие package names
получали нерелевантные непустые результаты. Publication dates в нормализованной выдаче
неизвестны. Отсюда нельзя делать вывод о текущей версии/дате. В интерфейсе/инструкциях
сохранены предупреждения, обязательность чтения первоисточника и ограничения бюджета.

**Решение: NeuralDeep доступен для пилота по запросу. Auto и статус единственного
стандартного поискового движка не включаются.** Качество требует дальнейшей отдельной
оценки; повторные платные прогоны автоматически не планируются.

## Исправления, найденные проверками

- Старые test loaders адаптированы к новому intent-модулю; поведенческие тесты сохранены.
- DNS timeout/late result, источник другого owner, malformed vs empty и expire-on-read.
- Отдельный MCP code root сохранил sandbox execution workspace.
- Native Responses namespace переводится только для Search: иначе ND-модели не видели tools.
- Recovery не завершает usage живого другого worker; повтор inference после crash запрещён.
- После восстановления времени budgets повторно проверяются до dispatch.
- Child research запрещён; исходная поверхность сохраняет права контроля job.
- SearXNG health привязан к проверенному endpoint; смена адреса требует новой проверки.

## Выпуск и граница эксплуатации

Код A и B находится в одном проверяемом изменении; включение выполняется двумя этапами:
A — Settings + Task Chat, затем Voice; B — Research и интеграция child после приёмки A.
Все новые ND-поверхности исходно выключены глобальным Search switch.

Перед реальной сменой сервиса нужно отдельное непосредственное разрешение оператора,
как требует workflow. До него не выполнять main fast-forward, live build swap,
launchd actions или изменение конфигурации production child. Другие экземпляры вне scope.
После разрешения: подтвердить clean main и исходный SHA, перенести точный reviewed commit,
запустить pinned local update через штатный manager и strict health с совпадением
commit/build. Если main изменился — сначала rebase/review/retest, без reset чужих правок.

Child patch `docs/patches/brief-desk-shared-search.patch` проверен на отдельном snapshot.
Перед применением сверить его контекст и текущий child файл, подготовить private backup,
передать launcher `PRITHA_SEARCH_CODE_ROOT`, `PRITHA_SEARCH_STATE_ROOT`, instance и
existing Keychain service. Owner фиксирован brief-desk-nd. Установить Child allowlist
в Settings. API key в новый .env не копируется. Сохраняется существующий более строгий
allowlisted/pinned HTTPS reader для child через общий host; это уточнение плана B,
чтобы не ослаблять текущую защиту при переходе на удалённый Crawl. Parent Search/Crawl
не использует локальный downloader. Legacy путь оставлен для управляемого rollback;
удалять его до эквивалентности реальных брифов нельзя.

Проверки записи в Telegram/публикации не выполнялись: task не разрешает отправку сообщений.
Пилот реальных брифов заканчивается до публикации. UI/model fixtures проверяют сохранение
существующей границы одобрения. Изоляция приложения не защищает от произвольного процесса
с правами того же macOS-пользователя.
