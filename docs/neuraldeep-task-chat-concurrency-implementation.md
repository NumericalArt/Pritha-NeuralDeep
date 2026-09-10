---
id: neuraldeep-task-chat-concurrency-implementation-2026-09-08
type: workflow
status: implemented
created: 2026-09-08
updated: 2026-09-08
topics: [neuraldeep, task-chat, voice-control, concurrency, codex-cli, admission, recovery, worktree]
tools: [Pritha ND, NeuralDeep, Codex CLI, Node.js, TypeScript, SQLite, Git]
agent_platforms: [Pritha NeuralDeep, Codex]
model_context: [provider-selected-models, capability-gated]
runtime_environment: [local-mac, control-center, cli, responses-adapter]
config_surfaces: [Task Chat, Voice Control, NeuralDeep launcher, admission, provider-ledger]
portability: adapter-needed
sources:
  - operator-separate-cli-provider-instructions-request-2026-09-08
  - 07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md
  - neuraldeep-source-8307bec20fb3b6a312d4478eafb50157c1603786
  - docs/neuraldeep-task-chat-adaptation.md
  - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
  - https://learn.chatgpt.com/docs/non-interactive-mode
related:
  workflows:
    - 07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md
    - docs/neuraldeep-task-chat-adaptation.md
    - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
    - 07_workflows/control-center-staged-release.md
  reviews:
    - 03_reviews/2026-09-07-task-chat-parallel-execution-audit.md
    - 03_reviews/2026-09-08-task-chat-voice-concurrency-audit.md
  standards:
    - 04_standards/control-center-codex-chat-api-contract.md
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-09-08
source_updated: 2026-09-08
source_version: "Historical baseline 8307bec; implementation and local release a0fb828fb85f5778e08f23a21e65f5aa99e06e07"
retrieved: 2026-09-08
verified: 2026-09-08
valid_for: "Separate ND implementation planning; installed build and live provider behavior must be verified on the target instance"
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains: [agent-building-knowledge, pritha-self]
subject:
  kind: pritha
  id: pritha-neuraldeep
privacy: public
retention: durable
review_status: reviewed
confidence: medium
---

# Pritha ND / NeuralDeep: отдельная инструкция по параллельному Task Chat

> Реализация завершена и выпущена в ND 2026-09-08: [отчёт, версии и проверки](neuraldeep-roadmap-release-2026-09-08.md).
> Исходная инвентаризация ниже описывает baseline до реализации; она не является текущим списком открытых дефектов. CLI-only архитектура и capability gates сохранены.

## 1. Что переносится

Обеспечить независимую работу нескольких Task Chat/Voice задач в Pritha ND:
свободный ввод и отправку в соседние чаты, согласованную очередь, фоновые статусы,
точную остановку, ответы Voice, восстановление и изоляцию задач разработки.
Порядок исполнения отличается от материнского coding plan для Mac Mini:
`07_workflows/2026-09-08-task-chat-concurrency-coding-plan.md` в репозитории
материнской Pritha. Это сопутствующий исходный материал; его наличие в ND
checkout не предполагается. В ND передаются этот файл и общий roadmap;
точные mother commits и fixtures запрашиваются при сверке ND0.

В материалах и фактически найденном checkout продукт называется **Pritha ND /
NeuralDeep**. Это рабочая идентификация отдельной CLI-версии для данного плана;
если подразумевается другой экземпляр/поставщик, сначала заменить target mapping.
Название нельзя использовать как основание выбора чужого runtime или credentials.

Единственный inference path ND сохраняется:

```text
Task Chat / Voice
  → общий ND admission + logical owner + durable intent
  → NeuralDeepCliRunner / NeuralDeepCliRuntime
  → scripts/neuraldeep-codex.mjs exec-json
  → stock Codex CLI exec / exec resume <точный session ID>
  → локальный Responses adapter
  → выбранная модель NeuralDeep
```

Не включать материнский App Server, Codex App как transport, OpenAI inference
или скрытый переход к другой модели. Наличие установленного Codex Desktop
не делает его разрешённым транспортом ND. В отличие от shared App Server матери,
несколько ND-исполнений означают несколько CLI процессов и относящихся к ним
adapter ресурсов; их ёмкость и завершение проверяются отдельно.

Документ подготовлен по read-only source inspection. Код ND, её конфигурация,
история, задачи и службы в рамках написания инструкции не менялись. Исправления
матери ещё не реализованы; инструкция станет точным transfer guide после
заполнения mother pins и локальных ND evidence. Выпуск матери не обновляет ND.

## 2. Что уже обнаружено в ND

Исходная точка чтения: `8307bec20fb3b6a312d4478eafb50157c1603786`.
Это source HEAD доступного checkout, не утверждение о текущей installed build.
Все пути далее относятся к **ND checkout**; одноимённый файл матери может
иметь другой контракт. Перед исполнением перечитать фактическую версию.

| Код ND | Подтверждённое свойство / следствие |
| --- | --- |
| `interfaces/control-center/src/lib/codex-chat/admission-coordinator.ts` | Общий coordinator для `task_chat` и `voice`, очередь, paused keys, account limit и private ledger уже есть |
| Тот же coordinator | Active/waiting/paused находятся в памяти; JSON journal сам по себе не даёт cross-process locking. Restart переводит queued/active в `resume_confirmation_required` |
| Тот же coordinator | При ошибке чтения, кроме отсутствующего файла, initialize сейчас начинает с empty ledger. Перед расширением concurrency проверить recovery без потери свидетельств |
| `codex-chat/gateway.ts` | Есть `putIfAbsentByClientThreadId`; create создаёт binding до CLI dispatch. Материнский F2 нельзя автоматически объявлять воспроизведённым в ND |
| Gateway и Voice runtime | Coordination key — Voice topic либо state/chat binding. Нужна проверка aliases одной native session, а не простая замена ключа |
| `codex-chat/cli-runtime.ts` | `exec_resume`, `fallbackEnabled=false`, `steerTurn=false`, native approvals/input=false; stdin закрывается после передачи prompt |
| `codex-chat/neuraldeep-cli-runner.ts` | Общий runner, JSONL parsing, tool activity, completed/failed events и классификация provider failures |
| `voice-topic-store.ts`, `voice-topic-routing.ts`, `voice-task-links.ts` | Уже реализованы subject scopes/generations, session binding, task links, ожидание и блокировка после predecessor failure |
| `scripts/neuraldeep-codex.mjs` | Изолированный home, Keychain, конкретный model/provider, wrapper и local adapter; signal forwarding к CLI |
| `scripts/neuraldeep/usage-ledger.mjs` | SQLite ledger v2 и `usage_known`; его accounting нельзя заменить новым счётчиком Task Chat |
| `components/codex/CodexChatPage.tsx` | Global `sending`, один pending new chat и общий new draft key ещё присутствуют |

Это инвентаризация и список границ для проверки, не полный повторный аудит ND.
Материнские findings V1–V4 в ND воспроизводить по смыслу: там другой Voice runner
и уже есть predecessor handling. Сохранять более сильные местные гарантии.

## 3. Таблица адаптации

| Материнское улучшение | Реализация ND | Что не переносить буквально |
| --- | --- | --- |
| Durable ownership / admission | Развить существующий coordinator и stores, общие ключи/attempts | Второй независимый диспетчер поверх ND admission |
| Идемпотентный create + first message | Проверить существующий put-if-absent и ledger до spawn, добавить cross-process/crash contract | Создание native thread через `thread/start` |
| Независимые drafts и navigation guard | Адаптировать UI reducer/hooks по local binding types | Полную замену provider-specific страницы без diff review |
| Фоновые статусы | Нормализовать JSONL/task state в общую summary API/SSE | Предположение о token-by-token upstream streaming |
| Уточнение активного turn | Пока capability false — очередь до завершения процесса | `turn/steer`, дописывание в закрытый stdin, конкурентный resume |
| Stop | Адресно остановить owned wrapper + CLI + adapter; подтвердить exit | Закрытие общего сервера, kill по порту или имени `codex` |
| Voice answer / handoff | CAS task/topic/request/generation, существующие links и predecessor state | Независимый typed start, обходящий ожидание Voice |
| Approvals/input | Существующие host/operator requests; native запросы только при доказанной CLI capability | Выдуманные App Server RPC requests или auto-approval |
| Worktree / resources | Точный cwd при exec/resume, sandbox/add-dir и resource admission | Смена cwd старой session или широкие writable roots всех агентов |
| Capacity / accounting | Host cap + provider policy + existing usage ledger | Фиксированное «3 разрешено провайдером» и двойной учёт токенов |
| Release / rollback | Проверенный локальный ND manager/updater и local source pin | Требование материнского origin/main поверх иной ND Git topology |

## 4. ND0 — target, baseline и пакет исходных изменений

1. Подтвердить канонический ND checkout через её runtime manager. Отделить main
   от старых dev worktrees, source HEAD от compiled build, state-root от CODEX_HOME
   и `PRITHA_NEURALDEEP_CODEX_HOME`. Не угадывать пути по имени каталога.
2. Read-only проверить local Git status, собственные AGENTS/baselines, private
   runtime plan/status, версии launcher/stock CLI/Node/adapter, model selection,
   recovery state и active processes. Не выводить Keychain token, environment dump,
   account identifiers и private endpoints в shared report.
3. Сохранить чужую незавершённую работу. Для исполнения создать отдельный worktree
   и отдельные state/home/test projects; production state туда не копировать.
4. Получить точные mother commits P1–P7 из delivery report, прочитать каждый diff.
   Переносить поведение, schemas и tests небольшими пакетами. Не делать wholesale
   checkout файлов, blanket cherry-pick или downgrade lockfile/runtime modules.
5. Проверить локальный статус предыдущих A/B/C: history recovery, archive/copy,
   attachments, model capabilities. Старые guides не доказывают, что всё внедрено.
   Незавершённые prerequisites включить отдельными строками local plan; не объявлять
   полноценную параллельную работу с вложениями, пока их собственный pipeline не готов.
6. Согласовать внутреннюю модель execution IDs/owner generation с существующими
   task/topic/session/run IDs и accounting. Принимаемый deliverable — конкретная
   migration map и test matrix, без ненужного переписывания delivery engine.

В [существующей ND roadmap](../07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md)
старые R0 blockers updater уже пересмотрены. Не восстанавливать их как открытые
без проверки актуального кода. Установка новой concurrency-функции всё равно
требует своего exact pin, собственной приёмки и lifecycle approval.

## 5. ND1 — устойчивый admission, receipts и logical owner

Основные файлы: `codex-chat/admission-coordinator.ts`, `private-store.ts`,
`voice-topic-store.ts`, `voice-task-links.ts`, gateway и Voice entrypoints.

- Сделать acquire/dispatch/finish и изменения bindings транзакционными в пределах
  поддерживаемой process topology. Предпочтителен private SQLite coordination
  backend с теми же инвариантами, что у матери; использовать существующие ND
  primitives после проверки, не создавать второй ledger расхода.
- Уникальный immutable intent/receipt существует до spawn. Связать
  `clientThreadId → chatId → attemptId → launcher run ID → native session ID`
  и `voice task → topic/generation → execution owner`. CLI может сообщить session
  только после старта: до этого owner держит reservation chat/topic scope.
- При получении `thread.started` атомарно проверить session identity и aliases.
  Если две записи ведут в одну native session/profile, обе конкурируют за один
  execution key. Разные homes/profiles не смешиваются. Не сокращать более сильную
  ND identity до материнского hash одного пути без provenance proof.
- Сохранять Voice logical ownership между подшагами и при ожидании. Compute slot,
  live-process limit, topic reservation и native session lock — разные величины.
  Освобождение слота не означает право другой задачи продолжить session.
- Preserve existing pause/predecessor semantics. Terminal failure/unknown не
  отпускает очередь в той же теме автоматически; точный операторский resume
  после reconciliation обновляет owner/request revision.
- Переделать восстановление corrupt admission registry: сохранить повреждённые
  данные, показать recoverable error и запретить недоказанные новые dispatch.
  Ограничение подробного journal в 500 записей не должно удалять активные,
  queued, unresolved entries или постоянные idempotency guards.
- Atomic rename JSON не считать cross-process транзакцией. Два инстанса store
  и два Node-процесса проверяются отдельным тестом. Stale callbacks с прежним
  owner generation не могут finish/release новую попытку.
- При migration транзакционный backend — единственный writer новых canonical
  receipts/ownership. Legacy JSON сохраняется как migration input/projection;
  native rollout и необходимые существующие bounded mirrors не удалять.

Gate: concurrent create даёт один CLI spawn; busy, lost ack, restart и duplicate
answer не создают другой процесс. Corrupt journal не выглядит как отсутствие
активных работ. Прежние ND queue/Voice cases продолжают проходить.

## 6. ND2 — независимый интерфейс и фоновые события

Адаптировать материнский P3: per-chat/per-draft sending, независимые pending/new
draft IDs, immutable submitted snapshot, revision и navigation guard.
Сохранить ND model selection, provider errors, ledger display, palette и Settings.

При queued acceptance показывать именно «В очереди», при live CLI — «Выполняется».
Существующую ND семантику Send/admission не менять молча ради материнского HTTP
контракта. Отдельный «Отправить после завершения» адресует уже работающую session.
ACK подтверждает принятие Pritha, а не завершение или применение ввода моделью.

Summary API использует общий durable execution state. JSONL нормализуется в
одном месте и связывается с attempt/session до обновления task row. Нет отдельного
read всех transcript на каждый heartbeat. Подписка выбранного чата и общий
summary stream не отменяют CLI при unmount/reconnect.

Показать причины `waiting_for_provider`, `waiting_for_operator`, capacity,
workspace conflict, unknown delivery и stale evidence понятными сообщениями.
Не выдавать upstream HTML/stack trace как ответ ассистента. Буферизация SSE
в Responses adapter может задерживать содержательные события; elapsed timer
не должен изображать реальное продвижение модели.

Gate: A slow/unknown, B и C доступны; два новых draft не смешиваются; поздний
ACK не меняет selection; hidden completion/request появляется без reload;
прежние billing/model/history states не исчезают.

## 7. ND3 — сообщения во время работы, Voice answer и точная остановка

### Очередь вместо неподтверждённого steer

Проверенный локальный контракт `exec_resume` не предоставляет активный steer:
`steerTurn=false`, prompt записывается один раз и stdin закрывается. Официальная
[документация Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
описывает последующий `exec resume` по session ID; это не доказательство
поддержки ввода в уже запущенный процесс.

1. При отправке сообщения в работающую session сохранить queued intent с точным
   predecessor, topic generation, model/settings, attachments и payload hash.
2. Подтвердить завершение owned процесса и состояние predecessor. Для Voice
   дождаться допустимой границы всего workflow, не паузы между CLI шагами.
3. Повторно проверить identity, scope, permissions, budget/capability и provider
   readiness; только затем запустить один `exec resume <SESSION_ID>` под admission.
   Не использовать `--last`: соседний параллельный запуск меняет «последнюю» session.
4. При failed/unknown predecessor оставить очередь видимой и приостановленной.
   Provider retry/backoff не разрешает повтор уже возможно принятого задания.
5. Cancel queued действует до dispatch по expected revision. Новая версия текста
   не использует старый message ID/hash. После dispatch отменяется execution,
   но не удаляется receipt или результат уже произошедших действий.

Если потребуется немедленное изменение работающего CLI задания, доступное
действие — отдельно выбранное пользователем «Остановить, затем продолжить».
Оно подтверждает exit/recovery, сохраняет partial history и создаёт новый intent
для того же разрешённого session continuation. Остановка не откатывает выполненные
файловые/внешние действия. Не имитировать steer записью в файлы истории, TUI
keystrokes, App Server sidecar или вторым concurrent resume.

В будущем `steerTurn` можно включить только по exact stock CLI/launcher/provider
capability, с contract и behavioral tests. До этого честная очередь — готовый
поддерживаемый вариант, а live steer остаётся unavailable.

### Voice и запросы оператора

Ответ из Task Chat и Voice проходит существующий task/topic service через CAS
по task/request/generation. Сохранить predecessor blocking, exact approval phrases
и связь UI request с runtime operation. Свободное typed continuation не закрывает
вопрос другой карточки. Повтор того же ответа возвращает прежний результат,
другой ответ после разрешения — conflict.

`requestUserInput=false` и native approval flags нельзя менять только ради общих
компонентов матери. Host-level вопросы/approvals продолжают работать своим
контрактом; native runtime requests — только при поддерживаемом CLI протоколе.
Grant не расширяет исходные permissions, и CLI не получает full access как
компенсацию отсутствующего интерактивного approval.

Передача управления Voice → Task Chat сохраняет history/topic links/budget,
меняет owner generation после безопасной границы и инвалидирует старые callbacks.
Новая independent Voice task получает отдельную topic generation/session по
явному смыслу запроса. Привычное subject-scoped продолжение остаётся.

### Stop и дерево процессов

`cli-runtime.ts` останавливает launcher; launcher перенаправляет сигнал stock CLI.
Проверить всю цепь wrapper → CLI → tools и локальный adapter. Подтверждение
`child.kill()` не доказывает, что дочерние процессы и порт adapter освобождены.
Ввести owned attempt/process-group metadata и проверку generation/start identity
перед каждым сигналом, включая delayed escalation. Не трогать CLI соседнего чата,
другой wrapper или общий service по совпадению PID/порта/имени программы.

После restart без надёжного process handle сначала reconcile. Старый PID не
даёт разрешения на kill. Stop должен оставить receipt, partial result и usage
с корректным known/unknown status. Общий admission slot освобождается после
доказанного завершения соответствующего runtime, а не по закрытию SSE браузера.

## 8. ND4 — workspaces, модель, лимиты и расход

### Изоляция ресурсов

Адаптировать материнский P5 к launcher `--cwd`, resume и ND sandbox policy.
Новый mutating task получает проверенный worktree, собственные output/temp files
и минимальные `--add-dir`. Existing session не меняет cwd/home/profile молча.
Для общего checkout или non-Git — одна разрешённая запись за раз до готовности
другого безопасного isolation mode. Worktree lifecycle не копирует secrets,
runtime state, native history, queue, Voice topics или provider credentials.

Проверить уникальность adapter listener, output-last-message paths, request logs
и temporary schemas у A/B/C. Общие порты, Git refs, databases, child projects,
MCP writes и применение результата защищаются отдельными resource claims.
Остановка A не закрывает adapter B; очистка A не удаляет неприменённый результат.

### Provider limits и error handling

Effective limit учитывает configured local cap, проверенный provider/account cap
и число live процессов. При unknown metadata не поднимать capacity по предположению;
показывать неизвестность и использовать проверенный консервативный режим. Account
cap может быть общим для других клиентов: локальная очередь не обещает точный
общий учёт чужих запусков. Снижение лимита не останавливает текущие задачи.

Сохранить отдельные классы credentials, billing, access denied, model unavailable,
rate limit, outage и unsupported input. `Retry-After` управляет временем ожидания,
но не идемпотентностью. Даже отсутствие наблюдаемого tool activity не доказывает,
что provider не принял запрос. После possible dispatch допускается reconciliation,
а новый платный attempt требует доказанного безопасного перехода/явного intent.
Модель не заменяется автоматически при rate limit или неизвестной multimodality.

Текущие тарифы, модельный каталог и upstream schemas данным документом не
подтверждаются. Перед изменением adapter получить authoritative version/date
evidence для конкретных используемых endpoints/models; не использовать название
модели как признак возможностей.

### Usage и budget

Связать execution attempt с существующим launcher/provider ledger run ID.
Не суммировать повторно CLI usage и provider usage одного запроса, cumulative
totals и deltas, cached/reasoning subsets и total. Неизвестный расход не равен нулю.
Планирующий, build, summary и capability probe учитываются как самостоятельные
вызовы, если реально вызывают модель. Queue wait не считается model execution time.

Admission store хранит ownership/reservations; provider usage ledger остаётся
источником фактического расхода. Если между ними нет общей транзакции, использовать
идемпотентный accounting event/outbox и recovery reconciliation по attempt ID,
а не две независимо увеличиваемые суммы. Interrupted/failed/lost-terminal
attempt также оставляет usage coverage и известный overshoot.

Сохранить отдельный roadmap same-run budget continuation; UI concurrency не
должна пересоздавать run, сбрасывать spent, approvals Contract/Outcome или скрывать
unknown usage. Readiness/probe, который вызывает модель, не входит в бесплатный
read-only статус или обычный unit test.

### Вложения

Перенос concurrency сохраняет original bytes и message references. Для каждой
используемой модели проверить цепь browser → private original → CLI initial/resume
→ Responses adapter → provider. Успешный upload или наличие `--image` у stock CLI
не доказывает поддержку wrapper/adapter/модели. При unsupported/unknown оставить
draft/original и объяснить ограничение; не удалять файл и не превращать ввод
молча в text-only. Предыдущая история с изображениями тоже участвует в проверке
совместимости следующей выбранной модели. Квоты и retention — instance-local.

## 9. ND5 — тесты, release и rollback

### Автоматические проверки

Использовать mother race fixtures как контракт, но локальные fake CLI/adapter
и synthetic homes. Обязательны:

- A Direct + B Voice + C Direct: процессы независимы, общий cap соблюдён;
- два concurrent create одного ID: один binding, один spawn, один native session;
- несколько aliases одной session и два процесса coordinator: один владелец;
- два Voice tasks одного subject/generation и независимая новая тема;
- waiting question/predecessor failure, одновременный typed/voice answer и stale handoff;
- enqueue/cancel/edit/restart и явный resume по точному ID, без `--last`;
- crash до spawn, после spawn до session event, после tool activity и до receipt;
- corrupt ledger, переполнение истории journal и disk-write failure;
- malformed/duplicate JSONL, terminal event без exit и exit без terminal event;
- stop A с проверкой оставшегося B, wrapper crash, зависший tool child и старый PID;
- provider 401/402/403/404/429/5xx, unknown readiness/usage, потеря terminal ответа;
- worktree/sandbox/shared resource conflicts, original attachments и model switch;
- accounting event replay не удваивает расход; unknown не становится zero.

Существующие тесты ND, которые нужно включить в regression run:

```sh
node --test tests/neuraldeep-admission-coordinator.test.mjs tests/neuraldeep-cli-runner.test.mjs tests/neuraldeep-task-chat-registry.test.mjs tests/neuraldeep-task-chat-voice-invariants.test.mjs tests/neuraldeep-voice-task-links.test.mjs tests/neuraldeep-task-chat-ui.test.mjs tests/neuraldeep-provider-errors.test.mjs tests/neuraldeep-usage-ledger.test.mjs tests/neuraldeep-responses-adapter.test.mjs tests/neuraldeep-state-migration.test.mjs tests/neuraldeep-codex-config.test.mjs tests/neuraldeep-cli-entrypoint.test.mjs
npm --prefix interfaces/control-center run typecheck
node scripts/validate-memory.mjs
node scripts/privacy-audit.mjs --strict
git diff --check
```

Добавить behavioral concurrency/crash tests и browser desktop/mobile cases;
перед выпуском — полный applicable suite, self-test и staged build. Fake upstream
проверяет сериализацию/маршрутизацию, но не качество или тариф модели NeuralDeep.
Реальный synthetic smoke ограничить несколькими разрешёнными calls с учётом
расхода; указать exact model/CLI/adapter и tested initial/resume path в local report.

### Выпуск только ND

1. В локальном report указать mother full pins, локальные resulting commits,
   diff mapping, capability matrix, tests и migration/rollback plan.
2. Прочитать актуальный ND updater workflow, выполнить его read-only plan/status.
   Не предполагать наличие origin или совместимость материнского CLI update command.
   Поддерживаемый локальный pinned release path выбирается из фактического кода.
3. Перед migration прекратить новые dispatch и дождаться безопасного drain.
   Unknown attempt не считать завершённым. Сохранить consistent private backup
   coordination/receipts, topics/links, mirrors/native history, attachments и usage
   ledger, включая правильную обработку SQLite WAL. Не переносить данные матери.
4. Подготовить staged build и exact rollback-compatible commit. Новая schema
   не должна открываться старым writer как пустой state. После новых записей
   старые JSON/DB snapshots не восстанавливаются поверх свежей работы целиком.
5. Получить требуемое собственным workflow непосредственное lifecycle approval
   после готовности кандидата, затем выполнить только проверенную manager transaction.
   Предыдущее разрешение обновить мать или исторический fleet release ND не авторизует.
6. Проверить exact compiled identity, собственный provider path и state fingerprints,
   `/voice`, `/agents`, `/task-chat`, `/codex`, `/settings` и их JavaScript chunks.
   Убедиться, что не появился App Server/OpenAI fallback. Выполнить смешанный
   synthetic pilot и отдельно проверить trusted-device доступ, если он нужен.
7. При failure остановить прогрессию и выполнить проверенный managed rollback.
   Сохранить новые receipts/usage/оригиналы и checkpoint работы. Не лечить ошибку
   удалением темы, сменой home/model или replay старого prompt.

Raw port kills, замена live build из временной сессии, автоматический запуск
фоновых сервисов, public exposure и перенос Keychain/config/history запрещены
границами существующего проекта. Инструкция не вводит новые постоянные службы.

## 10. Пакет передачи и критерий завершения

| Часть | Что должно быть заполнено после реализации |
| --- | --- |
| Mother source | Полный commit каждого переносимого изменения, schema/capability versions и fixtures |
| ND source | Local base/resulting commit и объяснение архитектурных отличий |
| Storage | Migration receipt, authoritative stores, rollback floor и exclusions |
| Runtime | Launcher/CLI/adapter versions, exact provider/model и подтверждённые возможности |
| Evidence | Unit/contract/browser/build/privacy/self-test, process ownership, live smoke и strict health |
| Limitations | Steer/native requests unavailable, provider metadata unknown, непроверенный peer — где применимо |
| Release | Compiled build identity и результат ND manager transaction; без private значений в shared Markdown |

Мать считается источником проверенных контрактов после её P7. ND считается
готовой только после локального выполнения ND0–ND5. Честное отсутствие live
steer при наличии работающей очереди соответствует CLI-контракту; включение
ложного capability для визуального совпадения с матерью — регрессия.

Ориентир после получения mother fixtures: **10–18 рабочих дней** одного
знакомого с ND разработчика на полный concurrency scope, включая workspaces,
recovery, tests и один local release. Незавершённые A/B/C, крупные provider adapter
изменения и ожидание live approval оцениваются отдельно. После ND0 пересчитать
объём: уже реализованные admission/Voice гарантии не разрабатывать повторно.

Этот документ `refines` старые ND adaptation/roadmap и сохраняет CLI-only
архитектуру. Он не переносит статус выполнения матери на ND и не заменяет
местные contracts, privacy, budget и release requirements.
