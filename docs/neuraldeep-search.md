---
id: neuraldeep-search
type: reference
status: active
created: 2026-09-10
updated: 2026-09-10
topics: [neuraldeep, search, research, settings, mcp, voice]
tools: [Node.js, SQLite, Next.js, MCP]
sources: [operator-neuraldeep-search-implementation-plan-2026-09-10]
related:
  workflows: [07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject: {kind: pritha, id: pritha-neuraldeep}
privacy: public
retention: durable
review_status: reviewed
confidence: high
verified: 2026-09-10
temporal_status: version-bound
---

# Общий поиск NeuralDeep

## Подключение и Settings

Settings → Search управляет новым общим SearchService. Для нового подключения NeuralDeep
по умолчанию выключен, режим Only when requested. Task Chat разрешён в конфигурации;
Voice, дочерние агенты и Research требуют отдельных переключателей. Существующий
legacy SearXNG сохраняется при начальной миграции. После первого сохранения SQLite —
единственный источник поисковых настроек. Search Off не выключает существующую
сеть shell/sandbox.

1. Проверить существующий NeuralDeep Keychain credential через раздел Keys.
2. Выбрать NeuralDeep и Only when requested, включить нужную поверхность, сохранить.
3. Check NeuralDeep quota выполняет GET quota. Test search явно расходует поисковую квоту.
4. Проверить источники на реальном запросе. Не включать Auto только на основании healthy.
5. Для дочернего агента дополнительно указать стабильный ID в Allowed child agents.
6. Для Research отдельно разрешить Deep Research и явно нажать Start research либо
   дать соответствующую команду в Chat/Voice.

Обычный GET Settings не выполняет Search/Crawl. Проверка наличия credential не
сохраняет ключ; кэшируется только состояние наличия. Configured не означает healthy.
Healthy основан на проверке провайдера; через пять минут результат становится stale.
Показываются последняя диагностика, quotas/reset, лимиты, кэш и последние операции.
Неизвестные единицы provider cost не переводятся в деньги.

Fallback выключен по умолчанию. Чтобы проверить SearXNG, выбрать его как primary,
сохранить и выполнить Test search, затем вернуть NeuralDeep и включить fallback.
Он действует только при временной ошибке ND и успешной проверке SearXNG за последние
пять минут. Пустая выдача, auth/quota error и недостаточная свежесть его не запускают.
Ни один запрос не устанавливает и не запускает Docker/SearXNG.

## Контракт и хранение

`scripts/search/service.mjs`: search, readPage, getStatus, diagnose.
`service.d.mts` содержит типы интерфейса. Context задаёт host: instance, owner,
turn/job, surface, explicit intent и AbortSignal. Модель передаёт только поисковые
аргументы; ни полномочия, ни модель Research в tool arguments не принимаются.

Результат: operation ID, provider, ok/partial/empty/failed/cancelled, sources,
retrieved_at, elapsed_ms, cached, warnings, структурированная error и quota snapshot.
Каждый source имеет ID, HTTPS URL, title, snippet/text, published_at отдельно от
retrieved_at, read, truncated, untrusted:true. Публикация с неизвестной датой остаётся
unknown. Пустая выдача не заменяет ошибки.

Внешняя private SQLite: `STATE_ROOT/private/search/search.sqlite` (локальный fallback
`.private/search` только для исторического colocated layout). Каталоги 0700, файлы
0600; symlink-подмена запрещена, SQLite WAL/BEGIN IMMEDIATE согласуют процессы.
Неизвестная schema version блокирует SearchService. История Chat не мигрирует.
Schema 1: settings/revision, metadata, budgets, operations, sources, cache, jobs.
Тексты и кэш удаляются при старте/обращении, операции через 7 дней, research reports
через 30 дней. Бюджеты turn сохраняются 30 дней, чтобы restart не обнулял счётчики.

По умолчанию: выдача 5/max10; запрос до1000 символов; snippets до1000;
страница12000/max20000; HTTP body после распаковки max2MiB; таймауты8s/20s;
concurrency2Search/1Read; Task Chat3+3, Voice1+1, Child3+3; кэш5min/30min.
Текущие сведения обходят поисковый кэш. Кэш разделён по instance/owner/provider/revision;
cache hit не расходует внешний бюджет. Source ID чужого владельца читать нельзя.
Локальный бюджет резервируется до сети, неопределённый исход считается потраченным.
Однократный явно включённый fallback использует тот же логический search permit,
но отдельную запись операции: это максимум две provider-попытки, а не повтор POST.
Provider quota — наблюдение, не резервирование общего API-ключа.

URL guard: публичный HTTPS, без userinfo, private/loopback/link-local/metadata IPv4/IPv6,
нестандартных портов и узнаваемых подписанных URL; значимые query parameters сохранены.
Read проверяет DNS всех ответов и возвращённые URL. NeuralDeep Crawl выполняет загрузку
удалённо: Pritha не может гарантировать его внутренние redirect-переходы. Не передавать
приватные/подписанные ссылки. Авторизация не следует redirects, POST не повторяется.
Данные страниц не являются инструкциями; UI использует безопасный Markdown renderer.

## Chat и Voice

Локальный stdio MCP использует официальный SDK с версиями в root package-lock.
Инструменты: web_search, read_page (ровно один source_id или url), research_start,
research_status, research_cancel. stdout только протокол, stderr диагностический.
Генератор `neuraldeep-codex.mjs` задаёт MCP и effective overrides для нового чата,
resume и execution workspace. PRITHA_SEARCH_CODE_ROOT отделён от TECHSCOPE_ROOT
execution workspace. Owner/turn берутся из host launcher и не сбрасываются при
перезапуске MCP. MCP необязателен для обычного текстового чата.

Stock CLI передаёт MCP tools в Responses namespace. Текущий ND transport нуждается
в переводе только namespace `mcp__pritha_search` в плоские function names; bridge
восстанавливает namespace в ответах и переводит соответствующую историю. Остальные
инструменты и sandbox/network policy остаются прежними. Основание MCP-конфигурации:
[официальная документация](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Voice использует тот же сервис, сохраняет имя web_search и добавляет read_page.
Режим deep направляет к отдельному research_start. Barge-in отменяет текущие Search/Read,
поздние результаты не озвучиваются. Отдельный Research продолжает работу после закрытия
вкладки/микрофона; его отменяют собственной командой. Диагностика, вызванная голосом,
сохраняет полномочия и бюджет Voice и не получает operator-доступ.

## Research

Persisted job: queued/running/completed/partial/failed/cancelling/cancelled/interrupted.
Один активный и до10 ожидающих jobs. Только Search/Read; ни shell, ни публикации,
ни записи проекта моделью. Host сохраняет Markdown с проверенными source IDs.
Каждое утверждение требует прочитанного источника. Ошибка синтеза не превращается
в успешный отчёт. Partial содержит собранные источники и причину неполноты.

Максимум10 searches,8pages,10model calls,60000 input tokens (консервативное
резервирование по UTF-8 bytes с запасом),8000output,5active minutes. В ожидании
общего provider admission активное время не расходуется; ожидание ограничено5min.
Выбрана та же модель задачи/Task Chat. При crash checkpoint сохраняет потраченные
резервы; неопределённый inference/инструмент не повторяется автоматически. Для
неизвестной длительности используется сохранённый deadline. Resume проверяет
остаток бюджета и доступ. Реальные usage receipts восстанавливаются только для
терминальных jobs после проверки владельца; чужой живой inference не завершается.

## HTTP API

Все маршруты проходят существующий request guard. JSON bodies ограничены16KiB.

| Method/path | Назначение |
|---|---|
| GET /api/settings/search | Настройки, capabilities, credential state, health, quotas, history |
| PATCH /api/settings/search | `{patch,expectedRevision}`; конфликт409 |
| POST /api/settings/search/diagnostics | `{kind:"quota"}` или `{kind:"search"}` |
| POST /api/search/research | `{question,requestKey}`; модель выбирает host; повтор ключа идемпотентен |
| GET /api/search/research | Operator job list, без private model messages |
| GET /api/search/research/:id | Job progress/report/sources/budget |
| POST /api/search/research/:id/cancel | Повторяемая отмена без новых эффектов |
| POST /api/search/research/:id/resume | Только interrupted/partial с оставшимся бюджетом |
| POST /api/search/research/wake | Локальный host wake с проверкой instance; не создаёт job |

Operator UI может видеть jobs поверхностей своего экземпляра. MCP/Voice могут
читать/отменять только jobs своего owner. Исследование из child запрещено.

## Проверки без production state

```sh
npm ci --ignore-scripts
npm --prefix interfaces/control-center ci --ignore-scripts
npm run test:search
npm run test:search:stock
node scripts/search/run-isolated.mjs /tmp/pritha-search-validation npm --prefix interfaces/control-center run build
node scripts/search/run-isolated.mjs /tmp/pritha-search-validation npm --prefix interfaces/control-center exec -- playwright test -c interfaces/control-center/playwright.search.config.ts
```

Runner принимает только пустой каталог либо каталог со своим test-marker, очищает
унаследованные runtime/provider overrides, задаёт отдельные state, port17420,
agent-parent, CODEX_HOME и фиктивный Keychain service. Playwright reuseExistingServer=false.
Live запускается только явно: `run-isolated.mjs --live ... node scripts/search/benchmark.mjs --live`.
Benchmark имеет отдельную вложенную SQLite, чтобы UI-тесты не меняли его настройки.
Полный старый unit suite запускается в очищенном окружении без принудительных instance
переменных: его fixtures сами задают изоляцию. Production .next/SQLite/history не нужны.

## Отключение и откат

Выключить Search либо поверхность и сохранить revision. Новые вызовы запрещаются,
активные Search/Read отменяются, queued Research становится cancelled, running —
cancelling с checkpoint. Chat продолжает обычные ответы. Полный rollback — только
штатным release manager с проверенной предыдущей сборкой/private state; общую историю
вручную не откатывать. Отдельная Search SQLite совместима с отсутствием её использования
старым кодом. Никаких cron/automation/новых постоянно работающих сервисов не создано.
