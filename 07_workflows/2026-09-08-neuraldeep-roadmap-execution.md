---
id: 2026-09-08-neuraldeep-roadmap-execution
type: workflow
status: completed
created: 2026-09-08
updated: 2026-09-08
topics: [neuraldeep, delivery-budget, concurrency, large-history, release, verification]
tools: [Pritha NeuralDeep, Codex CLI, SQLite, TypeScript, Playwright]
sources: [operator-full-neuraldeep-roadmap-implementation-2026-09-08, 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md]
related:
  workflows: [07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md, docs/neuraldeep-task-chat-concurrency-implementation.md, docs/neuraldeep-large-history-adaptation.md, 07_workflows/control-center-staged-release.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: pritha
  id: pritha-neuraldeep
privacy: public
retention: durable
review_status: reviewed
confidence: medium
source_version: ND baseline a31f036 / compiled 45be624; released code a0fb828fb85f5778e08f23a21e65f5aa99e06e07; completion recorded in roadmap revision 13
verified: 2026-09-08
---

# NeuralDeep: последовательная реализация roadmap revision 12

## Исходная точка и границы

Пользователь поручил полностью реализовать roadmap, самостоятельно выбирать
путь и обновить именно NeuralDeep без повторных подтверждений. Это разрешение
относится к подготовке, тестам и управляемому обновлению ND. Новые постоянные
службы, смена provider, публикация приватных данных и обновление других Pritha
не входят в эту реализацию.

Source baseline `a31f036` сохраняет engine `a3820b5`, темы и инструкции revision 12.
Read-only manager status подтвердил работающий ND service, ownership и health;
compiled source — `45be624`, BUILD_ID хранится в private evidence. Исследование
альтернативного voice transport сохранено без изменения. Работа выполняется
в отдельной ветке `codex/neuraldeep-roadmap-implementation` и worktree; тесты
используют отдельные state/agent-parent/home, несуществующий test Keychain service
и inert upstream. Native sessions и production registries туда не копируются.

Good State Alignment: aligned. Сохраняются история, draft, Voice/topic bindings,
явный same-run recovery, CLI-only NeuralDeep inference, palette/settings, provider
ledger, private isolation и manager-owned staged release с проверенным rollback.

## Последовательность и evidence

| Этап | Пакеты roadmap | Статус | Проверка результата |
| --- | --- | --- | --- |
| 0 | ND-0, ND-C0, local release inventory | complete | Baseline tests, actual source/compiled/provider pins, immutable docs baseline, isolated workspace |
| 1 | ND-1/2, ND-C1 | complete | Durable attempts before paid spawn, preserved unknown/overshoot, same-run amendments, transactional admission/recovery |
| 2 | ND-3/4, cleanup A1/A2 | complete | Host budget/verification, identity/readiness, modular ND scaffold, protected Trials and handoff |
| 3 | ND-5 A/B/C/M/S, ND-H0/H1/H2 | complete | Durable complete history, bounded reads, archive/full Copy, originals/capabilities, memory/settings |
| 4 | ND-C2/C3/C4 | complete | Independent drafts/status, queue/Voice handoff, exact process Stop and resource/worktree isolation |
| 5 | Runtime/privacy/public, cleanup C/B/D/E/F/G | complete | Bounded probes, applicable diagnostics, reviewed helpers, template equivalence, operator UI and own getting-started |
| 6 | ND-C5, ND-H3, ND-6 | complete | Full applicable suite, isolated E2E, provider failure matrix, staged build, measured synthetic CLI pilot |
| 7 | ND managed release and final evidence | complete | Local main pin, private consistent recovery snapshot, exact compiled identity, strict pages/chunks, own state preservation |

Статус меняется только по фактически выполненной работе. Подготовка fixtures,
успешные mother tests и наличие этого документа не означают выполнения ND.
Результат технических проверок отделяется от user acceptance и проверки
реального trusted phone. Тариф и неподтверждённые provider capabilities не
угадываются; synthetic pilot использует собственный разрешённый provider.

## Проверки первого пакета

- Исходный baseline: 34/34 focused tests и TypeScript.
- После адаптации ledger/loop/launcher: 52/52 focused tests, без skip.
- Дополнительная матрица phase receipts, failed summary, checkpoint failure,
  recovery/outbox, usage identity, shared admission и process descendants:
  32/32 tests, без skip. Эти наборы частично пересекаются; числа не суммируются.
- TypeScript после передачи host admission в Task Chat/Voice: pass.
- Подтверждены отдельные probe/build/summary attempts, сохранение overshoot/unknown,
  однократный accounting replay, два процесса SQLite coordinator, сохранение
  более 500 idempotency guards и corrupt legacy input, session alias exclusion.

Реализация ещё не выпущена. Оставшиеся интерфейсы, устойчивый history source,
общие workspace claims, окончательный recovery/release и живой pilot находятся
в следующих пакетах; данные проверки не заменяют полную приёмку roadmap.

## Второй пакет: host delivery и scaffold

Реализованы устойчивые instance IDs и классификация агента, отдельная проекция
готовности результата, неизменяемые входы Trials, host verification/handoff,
связь Task Chat с конкретной delivery-сборкой и same-run budget intent без
вызова модели. Чат и Voice сохраняют свой NeuralDeep CLI transport. Расход
родительской сессии читается из существующего provider ledger; дополнительный
счётчик не создан. Cumulative usage разделяется по фактическому home/profile;
первый переход со старого unscoped counter явно остаётся unknown.

Scaffold учитывает выбранные memory/skills/tools/redaction, поддерживает
headless CLI и API process без фиктивной службы или SDK-зависимости, создаёт
`npm test` и структурные/lifecycle-проверки. Handoff запускает тестовую команду
по проверенному плану. Сбой сохранения Trial intent останавливает проверку до
команды и до следующего платного build, сохраняя текущую сборку.

Проверки: полный `npm test` — **687/687**, без skip/cancel; TypeScript — pass.
Перепроверка первоначальных регрессий — 55/55. Privacy audit и memory validation
в полном golden run — pass. Self-test, итоговый build и browser/release evidence
будут записаны отдельно; эти результаты не означают выпуска установленной ND.

## Диагностика C и применимость legacy launchd

Пакет host delivery/scaffold зафиксирован локальным commit `1da5164`.
Синхронные диагностические команды теперь используют ограниченный timeout и
`SIGKILL`; existing argv/env/stdin/output limits сохранены. Foreground bootstrap
не превращён в диагностический probe. Quality-gate выполняет unit-файлы
последовательно, очищает instance/ND-home overrides для fixtures и предупреждает
о commit hygiene относительно локального `main`, не предполагая ND origin.

Launchd audit отличает отсутствующие необязательные legacy jobs от настоящей
ошибки запроса, отсутствующего required job, другого root и незагруженной
установленной службы. Реальных lifecycle-команд в этом пакете не выполнялось.

Self-test после исправлений — **pass**, unit **695/695**, без skip/cancel,
**0 warnings / 0 regressions**; strict privacy и memory validation — pass.
В изолированном index: 712 documents, 6807 chunks, 6591 local embeddings.
Это self-test source-кандидата; установленный ND UI и его release identity
будут проверены отдельно после staged build. Чужой preview, обнаруженный на
первоначальном тестовом порту, сохранён; проверки перенесены на свободный порт.

## История H и доступ A/B

Новая instance-private SQLite history сохраняет immutable CLI source events и
UTF-8 originals, индексирует turns/items/receipts/task links и восстанавливает
проекцию по проверяемой цепочке hashes. Public API отдаёт последние 20 turns,
activity по 40 items, страницы до 256 KiB и originals до 64 KiB. Старые позиции
сохраняют границу source snapshot; другой instance/chat/item отвергается.
Ранее утраченные записи не выдумываются: migration помечает legacy gaps.

CLI JSONL читается с backpressure и сохранением оригинала перед нормализацией.
Event IDs включают конкретный turn; одинаковые CLI item IDs разных запусков не
перезаписываются. Permanent receipts и task links не зависят от окна интерфейса.
Другой живой admission worker не помечается завершённым при открытии registry.

Чтение истории не проверяет provider/credentials и не запускает модель.
Headless `node scripts/neuraldeep/history-audit.mjs --json` открывает существующую
SQLite read-only, фиксирует snapshot, проверяет source digest/count и полноту,
не выдаёт raw transcripts в отчёт. Restore access проверяет native index/header,
provider/home/profile/workspace и CAS revision; сохраняет before-image и receipt.
Неподтверждённая provenance остаётся read-only. Archive использует отдельную
visibility projection для проверенных aliases, не меняет execution status и
наследуется поздними aliases. UI поддерживает originals, полный Copy response,
ленивую activity, ранние страницы и локальный архив.

**Storage/rollback floor:** это согласованная H migration, заменяющая ранний
план additive registry v2. Исходные registry v1/v2 и LKG сохраняются побайтно;
обе legacy writer-точки получают version 3 marker с generation/source hashes.
Старый writer отвергает marker вместо записи пустой истории. После новых записей
откат ниже первого H-compatible commit не является рабочим runtime rollback:
нужна совместимая сборка/forward repair, новые source events не затираются старым
snapshot. Этот floor должен учитываться в final release transaction и rehearsal.

Evidence до финальной приёмки: 10 001 turns, 2500 command items, несколько
assistant parts и original свыше 10 MiB с Unicode, cross-process create,
переполнение старого receipt window, corrupt/write-failure/rebuild/cursors,
read-only audit с bounded heap и повтор без исполнения, archive/late aliases,
proof mismatch и JSONL backpressure — pass. Общий прогон: 703/705; две fixture
ошибки старого host-store API исправлены, их повтор 3/3. Итоговый self-test,
build и desktop/mobile browser acceptance фиксируются отдельным evidence.

Финальный self-test пакета H: **pass**, **0 warnings / 0 regressions**;
полный unit suite **706/706** и strict privacy/memory stages прошли. Отдельный audit fixture
проверяет snapshot при concurrent append и ограниченный рост heap. Проверка
TypeScript — pass. Browser/build acceptance и managed rollout ещё впереди.

В сверке следующего этапа установлены stock CLI 0.153.0 flags `--image` для
initial exec и exact-ID exec resume. Это согласуется с
[официальным CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
и [non-interactive resume](https://learn.chatgpt.com/docs/non-interactive-mode).
Read-only GET собственного ND model catalog 2026-09-08 подтвердил 21 service
model, из них 11 chat models; у всех service records есть input modalities.
Метаданные сохраняются отдельно от доказательства полного transport path;
платных inference calls для этой сверки не было.

## Настройки S

Числовые поля ND используют редактируемые string drafts и проверяются на Save
без округления до секунд или автоматической подстановки. `10.001` секунды
сохраняются как `10001` ms; смена единиц сохраняет точность и пустой ввод.
API отклоняет неправильные JSON/types/ranges до catalog и persistence.
Неуспешный или неполный ответ не меняет сохранённый UI snapshot; Voice Settings
также сохраняют draft при HTTP/JSON error. App-specific поля не возвращены.

Pure numeric и настоящий POST route: **21/21** targeted checks; TypeScript pass.
Полный self-test S: **pass**, 0 aggregate warnings / 0 regressions, strict
privacy/memory pass. Desktop/mobile interaction входит в финальную приёмку.

## Память M

Python загружает только path settings до выбора индекса и ML imports. Process
env имеет приоритет; `.env`, `.env.local`, runtime.env сохраняют first-file
precedence. Node query/status/golden/health используют instance configuration;
read-only query и semantic search не создают пустую DB при отсутствии индекса.
Локальный индексатор пересчитывает только отсутствующие/изменённые chunks,
сохраняя валидные embeddings обоих providers и выбранный NeuralDeep provider.
Native NeuralDeep embedding query не требует загрузки local ML dependency.

Два code/state roots, direct Python/Node invocation, missing DB, запрет лишних
ML imports и secret loading, fingerprint сохранённых vectors, incremental
update и NeuralDeep selection: **12/12** targeted checks. Полный self-test M
**pass**, strict privacy/memory pass; платные provider calls не выполнялись.

## Вложения C — storage и capability foundation

Оригиналы сохраняются в instance-private storage, с отдельной cross-process
SQLite mutex для upload/quota/reference. Chat/admission locks не удерживаются
на время передачи файла. Принимаются exact bytes, сохраняются hash и receipt
публикации; interrupted publish примиряется только с совпадающими bytes/name.
Переполнение квоты, неверный размер, symlink, повреждение и stalled upload
оставляют объяснимую ошибку. Referenced originals не истекают; старые draft
очищаются при upload. Verified FD используется для download и отдельного CLI
snapshot, поэтому работа tools не меняет private original.

Streaming PUT/GET сохраняют safe headers и existing API guard. JSON API теперь
ограничивает bytes во время чтения. Next proxy limit выше 100 MiB original-file
limit, чтобы проверка upload не принимала обрезанный proxy prefix. Большой
upload через настоящий сервер ещё входит в browser acceptance.

Model metadata сохраняет unknown/conflicting modalities отдельно от boolean
UI labels; pricing-only model не получает выдуманную vision/tools capability.
Exact CLI/adapter/model/path evidence и synthetic provider smoke обязательны
для объявления attachment dispatch проверенным. В этой части выполнены только
fixtures, не live inference. Read-only launcher commands больше не переписывают
config и не создают отсутствующий Codex home. Model selection не подменяется
первой строкой каталога.

Targeted storage/routes/capabilities: **16/16**; TypeScript pass; полный self-test
C foundation — **pass**, strict privacy/memory pass. Подключение original refs
к delivery, CLI/adapter и UI, live capability matrix и browser tests продолжаются.

### Provider dispatch и проверка stock CLI

Каждый исходящий Responses payload получает durable claim до fetch. Повтор
того же payload в том же run после потери ответа возвращает conflict до второго
upstream call; unknown usage сохраняется. Встроенные CLI retries отключены,
отсутствие наблюдаемой tool activity не разрешает новый платный attempt.
JSONL чтение launcher ограничено по bytes и учитывает backpressure.
Adapter проверяет размер, JSON, exact model и original image hash до dispatch;
подключение этой проверки к chat manifest продолжается.

Полный self-test dispatch — **pass**, strict privacy/memory и TypeScript pass.
Отдельная проверка установленного stock CLI **0.153.0** с локальным fake upstream:
initial image, exact-ID resume, file tool read и resume с изображением прошли;
4 synthetic Responses requests, одна native session, exact PNG bytes.
Это доказательство CLI/adapter transport, не возможностей реальной модели.
Платных inference calls не было; private fixture не содержит production state.

### Вложения C: delivery, history и browser drafts

Original refs входят в атомарную запись turn/receipt; постоянный indexed history
lookup учитывает доказанные aliases native session. Projection rebuild сохраняет
references, их hash/size нельзя заменить. Accepted create/turn возвращается по
исходному immutable input до повторной проверки модели, архива или наличия файла.
Перед CLI создаётся собственная копия и manifest с exact model/path/session;
launcher проверяет private evidence и saved references, adapter дожидается
проверки exact encoded image bytes. Local input errors отделены от provider outage.

У каждого нового draft — свой ID, revision и immutable submitted snapshot.
Отправка A не блокирует B, поздний ACK не переключает выбранный draft и не
очищает новый ввод. Browser IndexedDB разделён по instance identity; незавершённые
receipts и original File переживают reload, повтор использует прежние IDs.
Upload/drop/paste, original preview/download и понятный capability status добавлены.
Production originals и browser copies не меняются при создании dispatch copy.

Обнаруженная сборкой граница Turbopack исправлена: project root охватывает
собственные общие scripts; Next больше не генерирует лишние инструкции в checkout.
Изолированный Playwright desktop/mobile: **10/10, 0 skips, 0 retries**. Проверены
параллельные drafts, late ACK, reload/unknown delivery с новым вводом, interrupted
upload с прежним ID, attachment-only send и download. Настоящий HTTP upload/download
**100 MiB** совпал по SHA-256; **100 MiB + 1 byte** отклонён с 413 без original.
Модель в browser fixtures не вызывалась. Real provider capability evidence и
полный mixed-runtime concurrency/release pilot остаются отдельными gates.

Итоговая проверка этого пакета: **737/737 unit tests**, 0 skips; полный self-test
**pass**, 0 aggregate warnings / 0 regressions; TypeScript, strict privacy и
Markdown validation pass. Один прежний source-shape assertion обновлён под
сохранённый fallback error code; отдельные behavioral tests проверяют новый
input error contract и отсутствие автоматического платного retry.

### ND concurrency: очередь, владельцы и recovery receipts

Admission принимает exact native-session key до compute claim. Aliases одной
session ожидают один слот; разные profiles не смешиваются. Voice получает
logical owner атомарно с claim и сохраняет его между CLI шагами и во время
вопроса. Новая попытка продолжения получает отдельный ID и новую owner generation;
старый release не освобождает её. Provider wait без dispatch можно повторно
допустить по прежнему ID с новым lease token; после runtime attachment этот
путь запрещён. Standalone CLI обновляет provider capacity во время ожидания.

Direct Task Chat сохраняет execution settings и исходный текст до dispatch.
`Send after completion` создаёт самостоятельный receipt с точным predecessor;
параллельный соседний чат остаётся доступен. Cancel использует queue revision,
edit сохраняет оригиналы и создаёт новый message ID при следующей отправке.
Повтор старой отмены или recovery не останавливает новую попытку. Recovery
проверяет подтверждение выхода предыдущего runtime, сохраняет историю и unknown
usage и при необходимости запускает один exact-session resume перед зависимой
очередью. Stop из UI передаёт ожидаемый turn ID. Dictation привязана к draft,
в котором началась, включая поздний результат после navigation.

Полный self-test пакета: **753/753 unit tests**, 0 skips, **pass**, 0 aggregate
warnings / 0 regressions; TypeScript, strict privacy и Markdown validation pass.
Полный текущий draft/attachment/queue browser suite: **12/12 desktop/mobile**,
0 skips / 0 retries. Две старые проверки формы исходного кода обновлены под
immutable execution settings и привязку dictation к исходному draft; behavioral
tests отдельно проверяют запрет расширения permissions и сохранение новых
ограничений. Это проверка данной части: полная ND concurrency acceptance,
process-tree recovery, resource/worktree isolation, summary events, Voice request
CAS, provider smoke и managed ND release продолжаются. Каноническая ND этой
записью не обновляется; её production state не использовался в fixtures.


## ND-C3: подтверждённая остановка CLI и восстановление дерева процессов

Краткоживущий supervisor принадлежит одному launcher attempt. Перед stock CLI
он сообщает session identity по отдельному private pipe; launcher сохраняет
её и dispatch authorization транзакционно до команды Start. Потеря launcher
закрывает этот pipe и завершает принадлежащую ему CLI session. Отдельная
постоянная служба, другой transport или provider не добавлены.

Остановка адресуется live pipe. Supervisor проверяет свою текущую POSIX session
перед каждым сигналом и escalation. Старый PID из журнала никогда не является
адресом сигнала. Чтение процесса не извлекает argv, environment или credentials.
Stock stdout/stderr проходят с backpressure; большой UTF-8 output сохраняется.
Событие turn.completed и закрытие launcher отдельно не освобождают admission:
нужны proof завершения дерева и закрытого принадлежащего ему adapter.

Private runtime receipt хранит worker start identity, process evidence и
известность usage. После аварии read-only reconciliation подтверждает отсутствие
исходного worker и его CLI session; потерянный usage остаётся unknown. Если
наблюдавшийся потомок отделился в другую session и ещё жив, завершение остаётся
неподтверждённым. Произвольно созданные и мгновенно отделившиеся daemons не
объявляются полностью наблюдаемыми; задачи не получают разрешения на постоянные
службы из наличия supervisor. Legacy attempts без доказанной process identity
остаются unresolved, их нельзя завершить переданным вызывающим кодом boolean.

Проверки: **7/7** supervisor/process tests, **31/31** launcher/admission/delivery
integration cases, TypeScript pass. Проверены зависший grandchild, соседняя
работа, авария launcher, ошибка checkpoint до stock spawn, потеря exit evidence,
неизменность receipt при duplicate dispatch и завершение после natural exit
наблюдавшегося detached child. Наборы не суммируются с полным suite.

Воспроизводимая отдельная приёмка stock CLI:
`node scripts/neuraldeep/stock-cli-acceptance.mjs --synthetic --report <private-report.json>`.
Она использует fresh synthetic state/home/project и локальный fake upstream;
production history/config/token туда не копируются. На **Codex CLI 0.153.0**
прошли initial image, exact-ID resume с прежним изображением, чтение original
text через CLI tool и resume с новым изображением. Все три process trees
завершены, **4 synthetic provider requests / 0 paid calls**. Эта проверка не
подтверждает реальные multimodal capabilities или тариф NeuralDeep.

Контракт процесса сверен с [Node.js 24.15.0 child_process documentation](https://nodejs.org/download/release/v24.15.0/docs/api/child_process.html):
kill acknowledgement не означает termination; закрытие stdio и exit различаются,
обычный kill родителя не завершает произвольных потомков. Полный source self-test
этого пакета и итоговая managed ND установка фиксируются следующим evidence.

Итоговый self-test пакета: **pass**, **763/763** tests, без skip/cancel,
**0 warnings / 0 regressions**; strict privacy и memory validation прошли.
Первый полный прогон выявил два тестовых дефекта: ограничение длины исходного
текста функции и чтение удалённого helper из ещё не обновлённого Git index.
Хрупкая проверка заменена двумя behavioral cases: cleanup только после
подтверждённого release; при unconfirmed exit working files сохраняются и UI
получает ошибку. После исправлений выполнен полный повтор. Установленный ND
runtime в этом пакете не менялся; Voice CAS, workspace isolation и общий выпуск
остаются следующими этапами roadmap.

## ND-C3: ответы Voice, решения оператора и передача управления

Host вопросы получают immutable ID до публикации. Общий private SQLite journal
принимает ответ по task/topic/generation/revision до изменения файлов и нового
CLI attempt. Task Chat, карточка Voice и инструмент Voice используют один
контракт; свободное продолжение не закрывает чужой вопрос. Повтор возвращает
прежний receipt, другой ответ конфликтует. После сбоя ответ сохраняется;
отдельный recovery intent сначала проверяет выход прежнего runtime и не
разрешает автоматический платный replay. Native CLI input/approval capabilities
остаются false.

Host task lock сериализует Start, Stop, answer, approval и recovery между
процессами. Вложенное продолжение разрешено только внутри живой операции;
запоздалый callback заново получает lock. Stop требует ID отображённой попытки,
legacy PID без доказанной process identity не используется для сигнала. Чтение
старого partial result не превращает его в завершённую работу. Сохранённые
sandbox/network permissions могут только сужаться при продолжении задачи.

Передача Voice → Task Chat проверяет последнюю задачу, поколение темы и revision
истории. Topic registry lock и admission/session barriers проверяют завершение
всего workflow. Handoff сохраняется отдельной idempotent history operation;
logical owner generation меняется только на безопасной границе. Поздний ACK не
меняет выбранный чат. JSON вход ограничен, карточка вопроса читает отдельный
малый endpoint без transcript или provider probe.

Targeted operator/process checks **15/15**, Voice/handoff regression **17/17**;
включены два Node writers, conflicting answers, потерянный checkpoint,
permissions ceiling, stale generation/revision и повтор handoff. Наборы
пересекаются и не суммируются. Browser typed answer прошёл **2/2 desktop/mobile**:
точный question envelope, отсутствие нового произвольного turn, сохранение
принятого ответа. Полный self-test этого пакета фиксируется после прогона.

Итоговый self-test пакета Voice — **pass**, **778/778**, 0 skips/cancel,
**0 aggregate warnings / 0 regressions**; TypeScript и strict privacy/memory
validation прошли. После первого pass 777/777 добавлена отдельная проверка
original answer без нормализации whitespace/обрезки. Browser case дополнен
queued successor: вопрос предыдущей задачи остаётся доступным, **2/2** pass.
После этих изменений выполнен полный повтор. Exact-session execution,
usage и permissions сохраняются; managed ND release ещё не выполнялся.

## ND-C4: workspaces и ресурсы выполнения

Новые mutating Direct/Voice задачи получают отдельный проверенный detached
worktree; существующая native session сохраняет точный cwd. Не переносятся
uncommitted/private файлы, home или credentials. Checkout отключает hooks,
fsmonitor и внешние Git filters; allocation записывается до filesystem effects.
Agent subject выбирается по точному ID, создание резервирует только один новый
target и instance-local agent metadata. Общий parent не выдаётся writable root.
Исследовательский scratch сохраняется для последующего exact resume.

В общем SQLite admission хранятся requirements и held resource claims. Пересечение
каталогов допускает нескольких readers либо одного writer; вопрос, failure и
неподтверждённый exit сохраняют резервирование. Full-access запуск сериализуется
со всеми остальными ND effects. Launcher сверяет фактические cwd/sandbox/add-dir
с receipt и проверяет native session cwd до dispatch. Изоляция распространяется
на управляемые ND задачи; произвольные внешние клиенты не входят в её ledger.

Каждый CLI запуск получает собственный private TMPDIR. Для workspace-write
одни и те же roots передаются initial/resume; общий `/tmp` исключён. Источники:
[Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
и behavioral acceptance установленного stock CLI **0.153.0**. Synthetic adapter:
5 запусков, 8 локальных provider requests, **0 paid calls**; initial/resume images,
чтение original file, запись в cwd и add-dir, отказ записи соседу и в общий tmp,
разные temporary directories, подтверждённый exit всех деревьев — **pass**.

Focused workspace/admission/queue: **24/24**, Voice links/invariants сохраняются.
Первый full self-test: 784/788; четыре прежние фикстуры обновлены под обязательные
workspace inputs и session-bound scratch, затем focused regressions **18/18**.
Финальный self-test: **788/788 pass, 0 failed/skipped**, aggregate warnings и
regressions отсутствуют; memory/strict privacy и TS — **pass**.
Worktree results остаются session-bound и требуют отдельного review/application;
этот пакет не применяет их автоматически к исходному checkout.

## ND-C2 / ND-H2: компактные списки и фоновые события

Список Task Chat использует индексируемую rebuildable SQLite projection:
bounded metadata, последние links и execution state; originals, полные receipts
и transcripts в list/heartbeat не читаются. Signed keyset cursor привязан к
instance/generation и фильтрам. Поиск сохраняет Unicode case handling.
Изменения второго writer, alias archive и rebuild проверены отдельно.

Общий SSE сообщает durable изменения и счётчики Direct/Voice. UI обновляет
соседние строки и выбранную историю с coalescing; navigation и draft не меняются.
Queued, running, provider/operator wait и workspace conflict различаются.
Отключение подписки закрывает только её таймер; CLI продолжает работу.
Voice readback теперь читает bounded UTF-8 previews и JSONL tails, сообщает
неполное превью/ошибку чтения, сохраняя оригиналы и их полный history API.

Focused history/Voice/projection: **25/25**, summary route/UI: **9/9**.
Browser global completion/request: **2/2 desktop/mobile**; реальные initial SSE
frame и cancel на development fixture — **pass**, без model dispatch.
Первый full self-test: **793/793 pass, 0 skipped**, TS/memory/privacy pass.
Одновременный browser run обнаружил прежний shell status bug: locked memory
index приводил к HTTP 500. Статистика теперь читается read-only с bounded wait
и явным `busy/unavailable`, неизвестные counts не считаются измеренным нулём.
Реальный development fixture под EXCLUSIVE lock: memory state `busy` и
`/task-chat` **HTTP 200**; после unlock исходная БД сохранена. Focused memory/SSE:
**5/5 pass**. Финальный self-test: **794/794 pass, 0 skipped**, aggregate
warnings/regressions отсутствуют; TS, memory и strict privacy — **pass**.
Совместный browser run: **16/16 desktop/mobile, 0 failed/skipped/retries**.

## Cleanup B: только идентичные helpers

Повторная AST-сверка текущего ND обнаружила две оставшиеся группы идентичного
`parseArgs`: 3 callers с equals grammar и 2 без неё. Они используют уже имеющиеся
`parseLongArgsWithEquals` / `parseLongArgs`; грамматики не объединяются.
Идентичный tagged text hash delivery ledger использует существующий `sha256Text`.
Другие одноимённые hash/JSON helpers сохраняют разные контракты (file/text,
prefix, JSON serialization, failure handling); generated child helpers не
получают зависимость от private mother runtime. Focused CLI regressions — pass.
Focused CLI: **22/22**. Первый self-test: 792/794; updater fixtures получили
новую общую parser dependency, production release/rollback logic не меняется.
Финальные ledger/updater проверки: **32/32**. Self-test: **794/794 pass**,
0 failed/skipped, aggregate warnings/regressions отсутствуют; memory validation,
rebuild и strict privacy — **pass**.

## Cleanup D: проверенные неиспользуемые экспорты

Сверка source, tests, declarations, Markdown и namespace/dynamic imports дала
25 кандидатов в восьми `scripts/lib` модулях: 21 внутреннее определение стало
private, четыре определения без local/external callers удалены. Одиннадцать radar
helpers сохранились внутри модуля. Используемые `createAsyncProbeRunner` и
`parseLongArgsWithEquals` сохранены. Public CLI/child contracts не меняются.
Focused frontmatter, paths, maintenance, GitHub/research и privacy: **64/64 pass**.
Self-test: **794/794 pass**, 0 failed/skipped; aggregate warnings/regressions
отсутствуют. Memory validation/rebuild и strict privacy — **pass**.

## Cleanup E: документация и видимые ошибки

Русская памятка описывает именно CLI-only ND, раздельные Contract/Outcome и
same-run budget. Changelog восстановлен по августовским/сентябрьским commit
pins; текущие изменения обозначены Unreleased до managed release. UI materials
перемещены из `UI-design/` в `docs/ui-design/`, ссылки обновлены; bytes изображений
сохранены. Conventional commit warnings уже действуют в quality-gate и повторно
не добавлялись. Ошибки загрузки Voice task/details, accepted-state list и
перехода к следующему треку показаны оператору; best-effort telemetry, unmount
cleanup и local theme fallback сохранены. TypeScript и memory validation — pass;
focused Voice/music/quality regressions — **29/29 pass**.
Первый self-test: **793/794**; восстановлена ожидаемая ссылка «канонический
README», единственная причина failure. Финальный self-test: **794/794 pass**, 0 failed/skipped, aggregate
warnings/regressions отсутствуют; memory/rebuild/strict privacy — **pass**.

## Cleanup F: пути, файловые операции и decision cards

Адаптирован просмотренный mother pin `20defc19c2b35ec42a5abca0ffe04788f5c20a8c`.
Локальные Markdown paths показываются читаемым текстом; разрешённые app links
и HTTPS links остаются ссылками. Файловый сервер с произвольным доступом не
добавляется. Structured CLI file operations распознают add/update/move/delete;
неизвестная операция сохраняет unknown. Placeholder-only reports остаются в
diagnostics, не создавая «Unclassified agent».

Карточки Start/Tailscale Serve привязаны к исходной ND task/session, delivery
run, canonical revision, manifest, readiness и plan hash. GET только готовит
план, POST требует Origin, exact idempotency key и явное решение; ND durable
session control исключает конкурирующий turn. Started receipt сохраняется при
потере ответа; новый request не обходит незавершённую операцию. В тестах lifecycle
и Tailscale выполняются fake runtime, реальные службы не запускались.
Добавлены ND theme styles для delivery, operations и result-readiness.

Focused identity/normalize/links/operations/delivery: **45/45 pass**, TS — pass.
Desktop/mobile: **2/2 pass**; readable paths, cancellation, lost response/reload,
same decision ID и отсутствие horizontal overflow. Первый self-test: **797/798**, palette check обнаружил неизвестный CSS token;
использован существующий `--nd-error`. Визуальная проверка также уточнила
формы бюджета, checkbox и bounded scroll на телефоне. Palette/themes: **9/9**, повторный desktop/mobile: **2/2**. Финальный self-test:
**798/798 pass**, 0 failed/skipped, aggregate warnings/regressions отсутствуют;
memory/rebuild и strict privacy — **pass**.

## Cleanup G: собственные шаблоны ND

Из текущего ND scaffold вынесены **44** multiline/comment-body шаблона в
`scaffold/templates/*.tmpl`. Из mother `cc97d0643eafaba98be0af1ba12f10cb4d63a1e5`
использован просмотренный single-pass renderer и принцип frozen fixtures;
материнские scaffold/runtime templates не копировались. Placeholder values
остаются literal strings, JavaScript не исполняется, отсутствующие slots дают
ошибку. Native child scripts сохраняют прежние байты и самостоятельность.

До изменения генератора сняты SHA-256/size/path snapshots: **456 файлов** в
11 вариантах (minimal, CLI, API, Markdown, SQLite, external memory, Voice/Telegram,
launchd, repository и escaping). Private old/new comparison подтвердил также
**11/11** scaffold reports. Tracked snapshot проверяет каждый файл без обновления
hashes «под результат». Focused module/API lifecycle/scaffold/snapshot: **43/43
pass**, включая **12/12** extraction/literal-slot tests. Self-test: **810/810
pass**, 0 failed/skipped, aggregate warnings/regressions отсутствуют; memory
validation/rebuild и strict privacy — **pass**. Production build и TypeScript
— **pass**. Scaffold вызывается отдельным CLI из полного checkout; он не входит
в server/client bundle, все 44 шаблона входят в source package. Сборщик выдал
43 dynamic-filesystem tracing warnings: 97 NFT traces / 1523 references, 0
private-state/secret-filename findings в проверенном тестовом build. Это отдельные
build warnings, не нулевое число предупреждений вообще. Installed ND пока не
обновлялась; итоговый кандидат повторно собирается перед managed release.

## ND-C3: сообщения во время Voice и устойчивая граница передачи

Во время активной Voice workflow Task Chat принимает отдельные typed intents
с точными task/topic generation и неизменяемым original input. Несколько сообщений
сохраняют порядок; ACK означает сохранение, а dispatch использует только явный
`exec resume` точной session после завершения всех захваченных predecessor workflows
и доказанного выхода их процессов. Новая Voice-задача не обходит эту границу
через predecessor priority. Ожидание ответа Voice не передаёт ownership typed-чату.

H receipt записывается до SQLite handoff barrier. Разрыв между этими записями
оставляет видимое состояние для reconciliation без spawn; replay HTTP не создаёт
вторую попытку. Барьер учитывает native aliases, поздний session event, несколько
typed followers и idempotent cancellation. Failed/unknown predecessor и смена
generation не разрешают автоматическое продолжение. Отмена сохраняет original,
receipt и прежнюю ошибку Voice; расход не сбрасывается.

Coordination `user_version=2` — новый rollback floor. Проверена migration v1→v2
и отказ фактического прежнего writer открывать v2. Прежняя installed сборка не
считается совместимой точкой отката после этой migration; перед managed release
нужен кандидат с поддержкой v2, H/native receipts и очереди передачи.

Voice question/approval остаётся отдельной карточкой. Stop этой карточки отправляет
точный `expected_attempt_id`; соседний CLI и typed очередь не подменяют адресата.
Форма допускает независимый draft, имеет ограниченную прокрутку и мобильную кнопку
без горизонтального переполнения. Native steer/approvals/input capabilities не менялись.

Проверки: полный self-test **819/819**, 0 skipped/failed; memory validation/rebuild
и strict privacy — pass. После небольшого UI дополнения: Voice/UI invariants
**18/18**, TypeScript — pass; полный текущий Task Chat Playwright desktop/mobile
**20/20**, 0 retries/skips/failures, включая настоящий HTTP upload 100 MiB и отказ
100 MiB + 1. Снимки desktop/mobile просмотрены. Ранние browser failures относились
к устаревшему имени вкладки и повторному открытию уже открытого mobile drawer в
фикстуре; итоговый прогон выполнен после исправлений. Это полный набор Task Chat,
остальные три E2E-файла Control Center проверяются отдельным финальным прогоном.
Платные provider calls и production lifecycle в этом пакете не выполнялись.

## ND-C4: host actions и окончательный coordination rollback floor

Start/serve decision cards и host verification/handoff используют общий ресурс
`execution-effects` с CLI admission. Такие несандбоксированные действия получают
exclusive claim, поэтому не пересекаются с уже работающими ND процессами и
не допускают новый CLI до освобождения claim. Budget/bind metadata сохраняет
узкий session/run control: изменение бюджета не захватывает общий exclusive
claim и не блокирует собственный последующий платный вызов, который отдельно
проходит обычный runtime admission.

Только точный owner освобождает host claim. Исчезновение server PID не считается
доказательством выхода запущенного им host tool; неизвестное действие сохраняет
claim и требует сверки сохранённой operation receipt. Read-only
`heldHostControls()` включается в проверку drain перед выпуском. Сигналы чужим
процессам и автоматическое удаление неизвестных claims не добавлялись.

Окончательная схема coordination — **user_version=3**, заменяющая промежуточную
v2 предыдущего пакета. Проверены v1→v3, v2→v3 с сохранением handoff receipts,
отказ настоящих прежних writers v1/v2 и защита от stale release. Rollback floor
для выпуска обязан включать этот пакет вместе с H/Voice/usage совместимостью;
промежуточный `681567b` больше не является совместимым writer.

Focused resource/gateway/operations — **32/32**, migration/workspace — **17/17**,
полный финальный self-test этого пакета — **822/822**, 0 failed/skipped;
memory validation/rebuild, strict privacy и TypeScript — pass. Первый общий
прогон обнаружил устаревшее static CSS ожидание `flex-shrink: 0`; оно уточнено
для ограниченной прокрутки composer, а браузерный сценарий дополнен проверкой
доступности header и полной кнопки отправки. Runtime и production state ND
на момент этого промежуточного пакета ещё не переключались.

## Финальная приёмка кандидата и безопасный schema upgrade

Полный применимый self-test: **832/832**, 0 failed/skipped, warnings/regressions
пусты. Проверены TypeScript, memory validation/rebuild, strict privacy и diff.
Полный Playwright-набор четырёх specs: **51/51**, без skip/retry; desktop/mobile,
три темы на шести ширинах, история/drafts/Voice, агенты, Settings, Dev и реальные
HTTP upload 100 MiB / отказ 100 MiB + 1. Исправлены перенос длинных diagnostics
и отмена устаревшего запроса загрузки Settings, сбрасывавшего выбор модели.

Live synthetic acceptance выполнен отдельно от unit tests через настоящий
**Codex CLI 0.153.0 → local Responses adapter → NeuralDeep qwen3.6-35b-a3b**.
Два запуска, четыре provider requests: initial и resume по тому же точному ID,
PNG и чтение разных original text files. Оба owned process tree завершены,
оба adapter закрыты; usage известен и записан ровно один раз на run:
**37 663 total tokens**, включая 16 768 cached input tokens как подмножество.
Ни synthetic homes, ни их sessions не переносятся в production. Проверено
актуальное account/model metadata; [документация NeuralDeep](https://neuraldeep.ru/docs)
использована как справка, а не как замена behavioral evidence.

Rollback floor: **1496520656ad414c13dff2fbecf60cdcbdeaf797**; coordination 3,
history SQLite 1 / registry 3, usage 2. Собрана отдельная резервная сборка этого
pin, проверены strict health шести страниц и chunks в изолированном preview.
Менеджер принимает `--rollback-artifact <private-artifact-directory>`, проверяет
полный source pin, ancestry, storage compatibility, BUILD_ID и digest всех
исполняемых файлов. При откате сохраняет новые данные и проверяет точную
compiled identity; неуспешная резервная сборка также останавливается manager.
Прежняя compiled `45be624` не является допустимым writer после migration.

Release maintenance блокирует новый CLI dispatch до открытия/migration stores
и host delivery actions; снять lock может только его owner. Read-only drain
включает held host effects и unknown runtime exit. Private snapshot использует
SQLite backup с WAL, сохраняет native history и originals, исключает credentials
и generated memory/cache. Это recovery evidence до migration, а не разрешение
восстановить старый snapshot поверх свежих receipts/usage/работы. Поведенческие
проверки artifact/managed rollback — 26; gateway maintenance — 19; release-state
WAL/host ownership/corrupt legacy — 3 (все входят в итоговые 832).

Кандидат прошёл локальный pinned release. Факт переключения и итоговые версии
зафиксированы в [release report](../docs/neuraldeep-roadmap-release-2026-09-08.md).

## Завершение канонического выпуска

Установлен `a0fb828fb85f5778e08f23a21e65f5aa99e06e07`, BUILD_ID
`Z1hKLk5I25uTdiar5S979`. Первый cold start превысил health window; manager
успешно вернул совместимый `1496520656ad414c13dff2fbecf60cdcbdeaf797`, сохранив
новую схему и данные. Повторный штатный выпуск с ограниченным startup window
120 s / request 20 s завершён успешно. Это наблюдение timeout, не доказанная
первопричина задержки. Strict health, chunks и exact identity — pass.

Сохранены 2 chats / 22 turns / 278 items / 22 receipts, исходные registry bytes
и 6 native files. Audit подтвердил originals и hash chain из 325 events.
Private consistent snapshot: 1 414 файлов, две SQLite backup с WAL.
Пользовательская review-заметка возвращена с прежним SHA-256; maintenance снят.
Browser на установленном экземпляре: 12/12 page/viewport checks, без page errors
и mutating UI requests. CLI-only runtime ready, fallback false.

Дополнительный live synthetic budget pilot выполнил ещё два CLI calls:
реальный measured overshoot → blocked budget → идемпотентный grant → exact-session
resume в том же delivery run. Spent, approvals и единственный accounting record
на attempt сохранены. Общая live приёмка: 4 runs / 6 provider requests,
55 554 total tokens; 23 056 cached input и 497 output входят в total.
Private evidence для выбранной модели разрешает проверенные PNG/files
initial/resume paths; чужие test homes, credentials и sessions не переносились.
