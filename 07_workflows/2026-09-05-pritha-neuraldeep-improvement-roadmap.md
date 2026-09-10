---
id: 2026-09-05-pritha-neuraldeep-improvement-roadmap
type: workflow
status: completed
created: 2026-09-05
updated: 2026-09-08
topics: [neuraldeep, agents-mother, codex-cli, delivery-budget, usage-accounting, recovery, task-chat, concurrency, voice-control, worktree, large-history, audit]
tools: [Pritha, NeuralDeep, Codex CLI, Node.js, SQLite, Next.js]
agent_platforms: [Pritha NeuralDeep, Codex]
runtime_environment: [local-mac, cli, control-center]
portability: adapter-needed
sources:
  - operator-neuraldeep-specialized-roadmap-request-2026-09-05
  - neuraldeep-local-main-31b438e9d51ee0982f0ee4a3c18d6e6210117562
  - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
  - 03_reviews/2026-09-05-pritha-budget-continuation-implementation-review.md
  - docs/neuraldeep-task-chat-concurrency-implementation.md
  - docs/neuraldeep-large-history-adaptation.md
  - docs/task-chat-large-history.md
  - https://learn.chatgpt.com/docs/config-file/config-advanced
  - https://neuraldeep.ru/docs
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-pilot-driven-improvement-roadmap.md
    - docs/neuraldeep-task-chat-adaptation.md
    - docs/neuraldeep-task-chat-concurrency-implementation.md
    - docs/task-chat-large-history.md
    - 07_workflows/control-center-staged-release.md
  briefs:
    - docs/neuraldeep-large-history-adaptation.md
  decisions:
    - 05_decisions/2026-09-05-delivery-budget-continuation.md
    - 05_decisions/2026-09-05-delivery-goal-lifecycle-and-accounting.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
refines: [docs/neuraldeep-task-chat-adaptation.md]
freshness_status: current
source_published: 2026-09-05
source_updated: 2026-09-08
source_version: "ND roadmap revision 13; implemented release a0fb828fb85f5778e08f23a21e65f5aa99e06e07; earlier sections retain their source-version context"
retrieved: 2026-09-05
verified: 2026-09-08
valid_for: next NeuralDeep implementation cycle; recheck runtime and provider before live pilot
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

# Pritha ND: завершение агентов через Codex CLI и NeuralDeep

**Revision 13 — реализовано и выпущено в канонической ND.**
[Итоговый отчёт и точные версии](../docs/neuraldeep-roadmap-release-2026-09-08.md).
Разделы 1–17 содержат исходную инвентаризацию и требования прежних revisions;
актуальный статус выполнения приведён в разделе 18 и итоговом отчёте.

Исходная редакция **revision 12**: [раздел 17](#17-большая-история-и-cli-аудит--revision-12)
добавляет большую историю и CLI-аудит к плану параллельного Task Chat/Voice
из [раздела 16](#16-task-chat-и-voice-concurrency--revision-11).
Исходные pins и evidence ниже относятся к указанным историческим сверкам;
добавление инструкций не означает повторной проверки runtime или реализации
этих пакетов в ND.

План подготовлен по фактическому NeuralDeep `main`
`31b438e9d51ee0982f0ee4a3c18d6e6210117562`. Он переносит цели улучшений
материнской Pritha на архитектуру ND. Реализация закрыта в ND; разделы 1–17 сохранены как исходные требования. Выпуск матери и четырёх канонических экземпляров не обновляет ND.

Результат: запрос проходит до проверенного агента и передачи результата;
лимит сохраняет работу и предлагает продолжение того же run. Токены, время,
итерации, ограничения аккаунта и неопределённость расхода различаются.
Лимит сам по себе не требует пересоздания агента или повторного согласования
неизменного результата.

## 1. Проверенная исходная точка

ND `main` чистый; private release manifest сообщает `deployed`, совпадение
HEAD с указанным pin и сохранение isolation fingerprints. Это evidence
предыдущего выпуска, а не новый тестовый прогон данного плана. Предыдущий
отчёт фиксирует 578 unit tests и browser evidence. Здесь выполнены чтение
кода, Git/runtime inventory и `codex --version`; модельные вызовы, смена
конфигурации и service lifecycle ND не запускались.

Путь: Task Chat или Agents Mother → `scripts/neuraldeep-codex.mjs` → stock
Codex CLI `exec`/`resume` → локальный Responses adapter → NeuralDeep.
App Server матери не является транспортом ND. Разрешённый launcher сообщает
CLI 0.153.0; fallback model slug в коде — `qwen3.6-35b-a3b`. Это не проверка
текущей доступности, цены или пригодности модели для конкретного агента.

| Источник в ND | Наблюдение | Следствие |
| --- | --- | --- |
| `scripts/neuraldeep-codex.mjs`, `codex-chat/cli-runtime.ts` | Отдельный Codex home, Keychain auth, provider `neuraldeep`, `exec_resume` | Сохранить CLI, profile и provider identity |
| `scripts/agents-mother/build-executors.mjs` | Build и отдельный модельный structured summary; capability probe тоже вызывает модель | Учитывать и резервировать каждый вызов, включая summary/probe |
| Тот же executor | Receipt возвращается после обоих успешных вызовов; timeout/failure бросает ошибку раньше; отсутствующий terminal usage сводится к нулю | Журнал до spawn; unknown и terminal result для каждого подшага |
| `scripts/agents-mother/delivery-loop.mjs` | Overshoot вызывает `token_usage_invalid`; budget revision предлагает новый run | Сохранять превышение в spent и продлевать тот же run |
| `scripts/neuraldeep/usage-ledger.mjs` | SQLite ledger v2, `usage_known`, session/model deltas, sources, billing snapshot/estimate | Развивать существующий ledger; исключить двойной учёт |
| `codex-chat/admission-coordinator.ts` | Очередь, ограничение одновременности, coordination keys и recovery | Общие lease/receipts для UI, Voice и delivery |
| `voice-topic-store.ts`, `voice-topic-routing.ts`, `voice-task-links.ts` | Темы/поколения связаны с CLI sessions и карточками | Сохранить связи при миграциях и продолжении |
| `scripts/neuraldeep/responses-adapter.mjs` | Loopback proxy, фиксированный HTTPS upstream, bounded тела, буферизация SSE | Не обещать live token cap или token-by-token streaming по одному UI |
| Updater: `07c234b`; canonical CLI path: `28cc130` | Pinned local release и verified rollback уже реализованы | Старые R0 blockers об origin и rollback больше не считать открытыми |

В ND есть подробный `docs/neuraldeep-task-chat-coding-plan.md` для A/B/C/M/S.
Его начало на `88a69c8`, dirty main и неподготовленном updater устарело после
консолидации. R0 реализован; остальные пункты проверяются по коду и tests,
а не по наличию документа. Этот roadmap дополняет его бюджетом и delivery.

[Codex Custom model providers](https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers)
подтверждает настройку provider и command-backed auth; совместимость будущих
параметров со старым binary всё равно требует локальной проверки.
[NeuralDeep Docs](https://neuraldeep.ru/docs) указывает на документацию
провайдера. Детальные Responses schemas, модели, тарифы и ограничения здесь
не подтверждены: получить датированное первичное evidence перед изменением
адаптера и live pilot. Retrieval date не заменяет source version/update date.

## 2. Сохранённые границы и правила переноса

- CLI-only execution, отдельный Codex home, Keychain, sandbox и profile identity;
  смена провайдера/модели только по разрешённому выбору.
- История, mirrors, request receipts, Voice topic/generation и private state.
  Archive не останавливает активный CLI процесс; старые prompts не replay'ятся.
- Accepted graphite palette, Settings и ND lockfile. Не понижать зависимости
  переносом release commit матери.
- Раздельные approvals Contract/Outcome, protected Trials, exact revision;
  verified, accepted и handed-off различаются.
- Agent artifacts и usage остаются instance-local. Shared evidence обезличено.

| Улучшение матери | Применение в ND |
| --- | --- |
| 0.1/0.2/0.6: probes, publication, env-first alignment | Небольшие helpers и поведенческие tests после проверки локального diff |
| 1.0/1.5: accounting/recovery | Инварианты поверх CLI receipt/session и существующего provider ledger |
| 1.1/1.4: amendments и host verification | Same-run API, versioned migration и общий admission |
| 1.2: Native Goal controller | Не копировать RPC; использовать host-owned run budget. Native Goal — только при доказанной CLI capability |
| 1.3: budget intent | Явный target run, scope, единицы и разрешённая величина |
| Фазы 2/3/4 | Identity/readiness/scaffold/Trials по применимости к CLI |
| Фазы 5/6/7 | Собственные provider fixtures, измерения и local release evidence |

## 3. ND-0 — контракт измерений и baseline

Оформить короткий decision: host run budget — основной механизм. Отсутствие
`thread/goal/*` в поддерживаемом CLI пути не блокирует создание агента и не
требует одноразового Goal waiver. Метка `host-budget-enforced` должна уточнять
границу: preflight между вызовами, timeout/process control и observed usage.
Остановка модели точно внутри токенного лимита остаётся `unverified` до
отдельного доказательства на этом runtime/provider.

Зафиксировать CLI/model/adapter versions и capability provenance. Проверить
расхождение custom `PRITHA_NEURALDEEP_CODEX_HOME` с identity/read paths старого
store: default normalization не доказывает происхождение старой записи.

Готовность: versioned accounting contract, Good State Alignment, private
snapshot registry/receipts/attachments/native history, fixtures старых budgets.
Probe с модельным вызовом явно объявляет расход до запуска.

## 4. ND-1 — полный расход и восстановление

До spawn каждый attempt получает durable ID/receipt с run, iteration, substep
(`probe`, `build`, `summary`), profile, model, reservation и worktree revision.
Launcher run ID связывается явно. `thread.started` сохраняет session ID
отдельно от attempt/turn ID; synthetic ID не выдаётся за native подтверждение.

Записывать terminal state и usage также при failed, interrupted, timeout и
summary failure. Известный overshoot увеличивает spent; неизвестный расход
остаётся unknown. Не складывать cumulative total с его delta, CLI usage с тем
же provider usage, reasoning/cached subsets с полным total. Смена модели,
reset counters и неполное событие получают coverage/reset признаки.
Wallet estimate, фактическое списание и subscription usage — разные величины.

Recovery сначала сверяет receipt, process ownership, session и worktree.
Потеря ответа не запускает build/summary повторно. Недоказанное завершение
оставляет recoverable reconciliation state и доступ к проверке результата.
Для следующего платного шага предлагается конкретное разрешение с видимой
неопределённостью, без стирания расхода.

Summary по возможности строится из проверенных outputs детерминированно.
Модельный summary, если нужен, имеет собственные reservation/receipt; его
ошибка не аннулирует build. Развивать существующий private ledger через
versioned migration и idempotent attempt key.

Готовность: failed build, successful build + failed summary, lost terminal,
restart, duplicate request, reset/model switch, overshoot и unknown fixtures.
Известный расход записан ровно один раз; recovery не повторяет side effects.

## 5. ND-2 — продолжение того же run

Адаптировать amendments матери: дополнительные токены/итерации/время с request
ID, actor и expected ledger version. Сохранить Contract/Outcome approval,
worktree, attempts и spent. Нет искусственного предела количества продлений;
каждое проверяет разрешённый объём. Elapsed extension даёт полезное время
от момента продолжения.

До следующего модельного вызова проверить остаток и reservations. Approved
Trials и сбор evidence готового результата доступны после лимита. Trial
subprocess не считается автоматически бесплатным: permissions и возможные
external costs сохраняются. Unknown не превращается в ноль.

Task Chat, Voice и Agents Mother используют общий binding к run и admission.
Живой CLI не получает конкурирующий resume; после tool activity нет
автоматического replay. Временный provider failure сохраняет очередь и работу.

Готовность: лимит в каждом подшаге допускает завершение в том же run;
повтор grant не удваивает cap, два контроллера не создают два процесса,
готовый результат проходит approved verification при исчерпанном бюджете.

## 6. ND-3 — UI, intent и ошибки провайдера

Показать цель результата, spent/cap/reserved, coverage, состояние продолжения,
«добавить бюджет» и «проверить готовый результат». Это бюджет run, а не Native
Codex Goal. Токены, модель, оценка рублей и ограничения аккаунта подписаны
отдельно. Числовые drafts и idempotency request сохраняются при reconnect.

«Продолжай» использует уже разрешённый остаток; «добавь N токенов» адресуется
выбранному run. Неоднозначные единицы/несколько runs требуют одного существенного
уточнения. Для неизменного результата весь Contract/Outcome не согласуется заново.

Различать credentials, billing, rate limit, access denied, model unavailable
и outage. Retry-After/ожидание не разрешает платный replay. Альтернативная модель
предлагается с объяснением совместимости, без молчаливой замены текущей.
Account API timeout не стирает историю или локальный ledger.

Mother 1.3 теперь даёт проверенный локальный pattern отдельного build budget
intent. Для ND сохранить explicit run → selected run → единственный bound run;
неверный explicit scope никогда не заменяется другим. Сначала записать private
typed request и разрешённый размер изменения, затем изменить ledger. Add/set
total различаются; iteration/time amendments не сбрасывают исходную дату или
spent. Прямое изменение бюджета не должно запускать CLI. Resume, явно выбранный
пользователем, имеет собственный receipt до возможного платного spawn. После
потери ответа или уже отправленного resume новый CLI процесс не создаётся.
Повтор старого запроса после нового прогресса сверяет сохранённый run.

В ND повторить негативные проверки неверного/чужого run, нескольких связанных
run, alias conflict, ошибочного account scope, unknown usage при понижении cap,
crash между budget commit и ответом. Panel selection, raw text hash и run binding
живут в своём private state. Проверенный mother UX и ledger contract переносимы;
native Goal endpoint и App Server RPC остаются неприменимыми к ND backend.

Готовность: desktop/mobile, lost response/reload, active/read-only session,
401/402/403/429/5xx, unknown price и stale account snapshot. Реальная
недоступность провайдера не скрывается обещанием безусловного завершения;
результат и путь восстановления остаются доступны.

## 7. ND-4 — identity, readiness, scaffold и handoff

Для ND-1/ND-3 учесть новый mother phase overview: отдельные run build receipts,
partial parent session snapshots и Trial invocation records с unknown usage.
Нельзя копировать App Server `tokenUsage.total` как семантику ND provider.
ND adapter должен доказать единицы и область CLI events, model/provider version,
особенности cumulative versus per-response counts, failed summary/probe и
сохранение каждого paid attempt до dispatch. При недостаточном evidence полный
total остаётся неопределённым; модель для summary или probe не становится
«бесплатной» из-за отсутствия usage. Сопоставимые бюджетные cohorts используют
observed context, отделённый от requested model/effort.

Mother host control v1 даёт дополнительный переносимый contract: immutable
task/run/project/Spec/approval/whole-plan binding, общий run lease и durable
request receipt до выполнения. В ND native identity должна подтверждаться
собственным CLI/session evidence, canonical cwd и выбранным provider profile.
App Server `thread/read`, `thread/goal/*` или mother TS gateway не переносятся
как обязательная зависимость. Host-only verification не запускает новый CLI
model process; approved commands могут иметь собственные побочные эффекты и
проверяются по argv/cwd/isolation/timeout/output/concurrency.

Сохранённый Trial plan нужно сверять целиком read-only компилятором с approved
Outcome, включая policy, assertions и demo. Старые locks, переписанные на
изменённый argv, не авторизуют команду. Формат v1 и старые immutable evidence
сохраняются. Lost response возвращает receipt; interrupted subprocess не
повторяется автоматически. Новый явный запуск допускается после сверки
terminal/ownership state. ND tests должны доказать exact binding, отсутствие
платного replay, no-goal-capability host completion и stale revision rejection.
Подготовленный demo остаётся reviewable; он не меняет acceptance/merge/deployment.

Адаптировать mother 3.1 → 2.5 → 2.1/2.3 → 2.2/2.4, затем 0.5/2.6/3.2/3.3.
Stable ID берётся из authored inputs; путь/отчёт не подменяет identity.
Использовать общий принцип mother `identity.mjs`: `agent_id`/child `subject.id`,
instance-qualified key, exact contract/Spec/project binding. Legacy attribution
и перенесённый префикс memory остаются диагностикой, а не основанием для
approval или платного CLI вызова. Проверить одинаковые имена, rename, чужой
Codex home/instance и ID/path conflict на ND fixtures. Identity не определяется
строкой provider/model и сохраняется при смене разрешённой модели.

Mother выявила различие CLI/UI Outcome document-lock algorithm. В ND сверить
его с canonical v1, включая `superseded_by` и вложенные mutable fields; применить
общий модуль только после проверки прежних locks. Не менять wire shape старого
immutable Trial plan ради нового ID. CLI run связывается существующими exact
Spec/contract/approval receipts. Не переносить App Server Goal RPC или иной
исполнитель ради совместимости read model; Task Chat ND остаётся оболочкой
собственного Codex CLI runner.

CLI агент не требует web UI или service manifest без выбранной операции.
Readiness разделяет verification, runtime, acceptance и handoff. CLI probe
не исполняет произвольные команды непроверенного документа.

До повторного пилота закрыть 4.0/4.1/4.2: scaffold соответствует runtime family,
Trial inputs защищены до build, evidence независимо от executor. Отсутствующий
ND Goal RPC заменяется host accounting contract; permissions/Trials сохраняются.

Готовность: synthetic CLI от accepted inputs до handoff, instance-local
идемпотентный profile, карточка без ложных web/service blockers.

## 8. ND-5 — Task Chat A/B/C, память и Settings

Исполнять локальный `docs/neuraldeep-task-chat-coding-plan.md` с уточнённой
исходной точкой: A — proof-based history recovery; B — архив/полный Copy;
C — оригиналы вложений и весь CLI → Responses → NeuralDeep путь. CLI input,
adapter payload и model capabilities проверяются отдельно. Хранение оригинала
не доказывает его интерпретацию. Attachment receipt использует ND-1/ND-2.

Для A/B и полного Copy выполнить ND-H0…ND-H3 из раздела 17 по
[инструкции большой истории](../docs/neuraldeep-large-history-adaptation.md).
Сначала проверить полный долговременный источник, затем pagination и bounded
read API: ограниченный private mirror не заменяет полную историю. Этот же
источник используется CLI-аудитом с отдельными правилами чтения и исполнения.

M/S переносятся по оставшемуся diff: effective home, собственная память,
числовые Settings и provider fields. Уже исправленный canonical CLI Usage
не чинить повторно без регрессии. Streaming — отдельная измеренная работа
после стабилизации receipts, payload limits и backpressure.

Параллельный Task Chat/Voice включён отдельным пакетом ND-C0…ND-C5
в разделе 16 по [детальной инструкции](../docs/neuraldeep-task-chat-concurrency-implementation.md).
Он использует общие receipts/admission из ND-1/ND-2 и сохраняет A/B/C,
модельные настройки и Voice associations этого раздела.

Готовность: read/download оригинала, сохранение draft при несовместимой модели,
история/Voice associations после миграции, проверки поддержанных MIME/моделей,
применение Settings после reload.

## 9. ND-6 — пилоты, калибровка и выпуск

После offline fixtures провести один synthetic CLI pilot на доступной модели
с явно выбранным бюджетом. Включить продолжение после лимита и recovery без
replay; provider outage моделировать fixture. Не провоцировать сбой сервиса.

Измерять probes/build/summary/research/embeddings по разным sources;
known/unknown coverage, estimate/actual отдельно; active/queued/user-wait time;
полезные уточнения, verification/acceptance. Калибровать по сопоставимым
model/version/task samples с указанным знаменателем. Токенные defaults
OpenAI не являются эмпирическим бюджетом NeuralDeep.

Перед выпуском: focused tests, typecheck, staged build, privacy, self-test,
desktop/mobile, strict `/codex`, `/task-chat`, `/settings`, `/agents`, `/voice`
и другие обязательные ND страницы плюс chunks/build identity. Использовать
ND pinned **local** updater и подтверждённый manager с private recovery
artifacts; origin/main матери не назначается upstream ND. Trusted-peer
проверка фиксируется отдельно от локального viewport.

## 10. Очередь и критерий завершения

| Очередь | Пакет | Результат |
| --- | --- | --- |
| Подготовка — выполнена | Сверка ND main, этот roadmap, CLI version | Проверяемые исходные точки и отделённые неизвестные |
| Первая реализация | ND-0 + ND-1 | Decision, durable receipts и учёт build/summary/probe, recovery tests |
| Вторая реализация | ND-2 | Same-run extension и host verification без Goal RPC blocker |
| Третья реализация | ND-3 | UI/intent/provider recovery с общим admission |
| Следующий блок | ND-4 | Identity/readiness/scaffold для повторного CLI |
| Отдельные UI пакеты | ND-5: A → B → C; M/S по diff | История, файлы и Settings |
| Большая история и CLI-аудит | ND-H0 → ND-H1/ND-H2 → ND-H3; раздел 17 | Полный durable source, bounded browser/audit reads и проверенная полнота Copy |
| Параллельный Task Chat/Voice | ND-C0 → ND-C1 → ND-C2 → ND-C3 → ND-C4 → ND-C5; раздел 16 | Независимые чаты, durable очередь, точный Stop, workspaces и локальные concurrency tests |
| Проверка результата | ND-6 | Измеренный CLI outcome, проверенный release и handoff |

ND-5 A/B может предшествовать ND-4 по пользовательскому приоритету; C зависит
от ND-1/2. Server refactor, timeout policies, cleanup/redaction, Sensors docs
и CLI getting-started соответствуют mother 0.3/0.4, 5.1–5.5 и 7.1–7.3, но
внедряются по конкретному ND diff. Techscope rename остаётся отложенным.

ND-C0 совмещается с ND-0; общий фундамент ND-C1 выполняется вместе с ND-1/2.
ND-C2/3 согласуются с ND-3/5. Повышать число одновременных mutating executions
можно после resource isolation ND-C4 и проверок ND-C5. Финальная приёмка
concurrency входит в ND-6; одинаковые migrations, ledger и тесты не дублируются.

ND-H0 согласуется с ND-5 A и ND-C1: единые source identity, generation и migration
map. После него ND-H1 развивает browser history/Copy, ND-H2 — headless audit;
эти потребители используют один источник. ND-H3 входит в ND-6 вместе с ND-C5.
Summary stream ND-C2 не должен перечитывать полную историю каждого чата.

Mother contract schema v2 теперь отдельно задаёт `agent_kind`, включая
`interactive-agent` для диалога через Codex CLI. Для ND-4 перенести совместимый
adapter и operations applicability с сохранением ND CLI/provider полей. Старые
принятые контракты не переклассифицировать: legacy-unclassified и advisory
предложение не дают readiness. Тип не назначает App Server и не разрешает
local service; отсутствие manifest допустимо по выбранным operations, а
повреждённый существующий manifest остаётся диагностикой. Изменение типа в
новой ревизии должно инвалидировать прежнюю Outcome approval.

Закрытие roadmap требует доказанного end-to-end outcome и acceptance.
Публикация плана или выпуск материнской Pritha сами по себе его не закрывают.

## 11. Полная трассировка mother roadmap и оставшиеся ND пакеты

План охватывает весь mother roadmap, включая небольшие helpers и public path.
Таблица задаёт требования переноса, а не утверждает, что mother или ND уже
прошли перечисленные проверки. На 2026-09-05 ND checkout содержит только
документационный commit `87cc59a` поверх code baseline `31b438e`; проверенный
ранее runtime остаётся отдельным evidence. Материнская ветка completion
уже добавила локальные 0.4/0.7 и native task intent 1.3, но эти изменения ещё
не являются установленным ND кодом.

| Mother ID | ND пакет | Что именно реализовать/проверить |
| --- | --- | --- |
| 0.1, 0.6 | ND-0 / runtime | Bounded probes и env-first Good State из собственного state-root; не читать main mother memory |
| 0.2, 0.4 | ND public package | Общая child-artifact policy. У ND нет обычного origin/main: publication base задаётся проверенным локальным ref либо будущим ND remote; отсутствие базы остаётся явным отказом, без фиктивного успешного audit |
| 0.3, 7.1 | ND getting-started | Реальные launcher/auth prerequisites → Contract/Outcome → CLI scaffold → Trials → handoff. Guide проверяется clean fixture с ND config, без OpenAI fallback |
| 0.5, 2.6, 3.2, 3.3 | ND-4 | Instance-local profile и authored mission, идемпотентность, handoff по типу результата, operations manifest только по выбранным возможностям |
| 0.7 | ND release | Сохранить уже работающий pinned local updater. Добавить проверку предыдущего BUILD_ID и страниц/chunks после rollback, validated readiness/request/strict deadlines. Не переносить mother fetch/origin semantics |
| 1.0, 1.7 | ND-0 | Host budget capability contract. Не вызывать отсутствующие Goal RPC и не требовать waiver для штатного CLI пути; mid-call token cutoff проверяется отдельно на ND provider |
| 1.1, 1.5 | ND-1 | Shared reservation/receipt на каждый paid attempt; parent Task Chat, delivery build, summary, probes и прочие phases имеют явный scope/coverage |
| 1.2, 1.3 | ND-3 | Run budget UI/typed intent с explicit target, add/set/units, pending recovery и сохранением drafted amount. Native task Goal endpoint матери не является ND API |
| 1.4 | ND-2 / ND-4 | Exact task/run/instance binding и узкое host действие approved verification/handoff; общий admission, отсутствие нового CLI/model spawn только ради изменения лимита |
| 1.6 | ND-6 | Калибровка по одинаковой модели/версии/effort/классу задачи; source, N и диапазон. Tokens, рублей estimate и wallet charge не смешиваются |
| 2.1 | ND-4 | Versioned agent_kind независимо от transport/provider; accepted legacy contracts сохраняют прежние locks |
| 2.2, 2.3, 2.4 | ND-4 | Раздельные evidence/runtime/action states; CLI не требует web/service; approved argv и path boundary, никакого выполнения команды из GET |
| 2.5, 3.1 | ND-4 | Stable identity и reconciliation по exact revision/Trial/approval/receipt, без substring attribution, самодельного acceptance или auto merge |
| 4.0, 4.1, 4.2 | ND-4 | Совместимый scaffold до mutation, protected host verifier с provenance/hash и negative-control Trial, один согласованный automated_trial_waiver |
| 5.1, 5.2 | ND runtime | Разделить probe execution/access cache/card projection после их semantic fixes. Общая policy для MJS/TS, bounded async I/O и invalidation; не связывать HTTP account timeout с уничтожением CLI задачи |
| 5.3 | ND runtime | Cleanup по terminal receipt и process ownership; failure виден, повтор идемпотентен, dirty/recoverable/foreign worktrees и session history сохраняются |
| 5.4 | ND privacy | Проверить каждый research/improve/summary writer, adapter error и usage export; redaction до locks, private host/provider IDs и credentials не публикуются |
| 5.5 | ND documentation | Sensors inventory: shipped claims → actual code/evals; отсутствующий harness явно остаётся предложением |
| 5.6 | Deferred | Сохранить Techscope env/index compatibility; отдельная миграция не нужна для создания агента |
| 6.1 | ND preparation | Ретроспектива mother и имеющихся ND попыток: source/version, measured/reported/unknown; отсутствие данных не заполняется нулями |
| 6.2 | ND-6 | Сначала измеренный CLI, затем service/job-runner/tool-server по capability gates; реальные расписания/службы — отдельные actions |
| 6.3 | ND-6 | Scope-specific empirical decision после наблюдений; success одного типа/модели не переносится на весь provider |
| 7.2, 7.3 | ND public package | Synthetic demo, changelog, explicit publication target, privacy guards, immutable release evidence. Не создавать ND remote и публичный release из одного факта подготовки roadmap |

Runtime/privacy/public packages имеют те же проверки, что ND-0…ND-6, и
входят в итоговую подготовку. Они не исключаются из плана словом «адаптация».
Порядок: сначала ND-0/1/2, затем identity/readiness и UI по зависимостям;
рефакторинг server отдельно после стабилизации semantics; public guide/demo
после рабочего scaffold и проверки полного сценария.

## 12. Evidence contract и приёмочные сценарии ND

### Граница task/run/attempt

Private binding должен связывать instance/state identity, native CLI session,
Task Chat ID, Voice topic/generation (если выбран), delivery run, target project
и approved spec/contract fingerprints. Agent display name, последняя открытая
карточка и текст ответа модели не разрешают выбрать run. Конфликт IDs и
неполное legacy evidence дают диагностируемый recovery path; новый run не
создаётся для обхода лимита или дефекта связывания.

У каждого paid attempt есть immutable request identity, phase/substep,
reservation, dispatched/terminal timestamps, observed process/session identity,
usage source и coverage. Частичное provider событие не подтверждает завершение
CLI процесса. Terminal CLI event не доказывает сохранение provider billing
snapshot. Host evidence сохраняет оба факта, включая рассогласование.

### Матрица отказов

| Сценарий | Обязательное наблюдаемое поведение | Где расширять существующие tests |
| --- | --- | --- |
| Ошибка capability probe до build | Расход/unknown probe сохранён, дальнейшее действие определено, агент/Contract не пересоздаются | `neuraldeep-cli-runner`, Agents Mother budget/executor tests |
| Build изменил файлы, summary упал | Build evidence и worktree доступны; summary не аннулирует продукт и не запускает build повторно | CLI runner, usage ledger, delivery loop |
| CLI timeout при незавершённом provider request | Own process state и receipt сверяются; неизвестный расход видим; нет автоматического replay | `neuraldeep-cli-runner`, `neuraldeep-responses-adapter` |
| Потерян HTTP ответ на grant/continue | Повтор с тем же request ID не меняет cap и не создаёт второй процесс | `neuraldeep-admission-coordinator`, `neuraldeep-task-chat-registry`, UI browser |
| Два UI/Voice/host controller | Один reservation/dispatch по точному binding; второй видит pending действие | Admission coordinator, `neuraldeep-task-chat-voice-invariants` |
| Смена effective Codex home | Подтверждённое происхождение session/registry; старое соответствие пути не угадывается | `neuraldeep-state-migration`, `neuraldeep-memory-runtime` |
| Модель сменилась или provider counter сбросился | Новый measurement segment; старый расход не уменьшается и не суммируется дважды | `neuraldeep-usage-ledger`, `control-center-neuraldeep-billing` |
| Rate/billing/auth/API failure | Typed reason, сохранённый draft/history/run; account error не лечится скрытым token extension | `neuraldeep-provider-errors`, `neuraldeep-account-snapshot` |
| Оригинал файла сохранён, модель его не приняла | Draft/attachment identity сохраняются; UI не утверждает, что файл прочитан | Responses adapter, registry, ND Task Chat browser |
| Trials после лимита | Approved argv/cwd/isolation и неизменные verifier inputs; outcome может стать verified при неполном accounting, но не автоматически accepted | Delivery loop, immutable Trial runner |
| Candidate health зелёный, chunk отсутствует | Verified stop → previous build restore → strict rollback health; следующий instance не обновляется | `pritha-instance-update` |

Имена в последней колонке относятся к существующим ND test surfaces, а не к
заявлению, что все новые cases уже реализованы. Для UI добавлять browser
сценарии на actual components/served candidate, а не только проверки строк.

### Provider evidence перед живым прогоном

Сохранить приватно: launcher/CLI version, adapter commit, model ID, reasoning
settings, dated primary provider source либо содержательный schema/version
context, supported input/output modalities, timeout/retry semantics и pricing
source с валютой/датой. Недоступная цена остаётся unknown; не подставлять
тариф OpenAI. Сам факт custom provider configuration не подтверждает поддержку
всех Responses полей, native Goal или App Server.

Измеримый прогон имеет явно выбранные ограничения на tokens/time/iterations,
учитывает probe и summary и использует синтетические данные. В отчёте отдельно:
implementation complete, runtime verified, pilot validated и user accepted.
Ручное тестирование пользователя начинается после технической подготовки;
до него нельзя отмечать соответствующие empirical/acceptance строки как pass.

### Финальный review пакета

Перед ND adoption сверить фактический local pin, Good State, own state/children,
focused provider/CLI/admission/ledger tests, полный self-test, typecheck,
staged build, desktop/mobile и strict health `/voice,/agents,/task-chat,/codex,/settings,/dev`
с JS chunks и build identity. Все failed/unknown проверки остаются явными.
Shared roadmap в матери и рабочая копия ND получают согласованную revision;
проверенные локальные ND implementation commits не смешиваются с mother history.


## 13. Итоговый перенос требований после mother preparation — revision 8

Mother final package подготовил full clean CLI fixture, private authored
handoff, `probe-plan`/approved argv, protected verifier declarations и один
structured waiver. ND переносит контракт поведения, сохраняя собственный
Codex CLI executor и NeuralDeep adapter. Нельзя заменять их mother App Server,
Goal RPC, OpenAI authentication или тарифами OpenAI.

- **ND-0/1/2:** кроме build учитывать отдельные model probe, summary и retries;
  durable attempt записывается до CLI spawn. Interrupted/unknown не равны нулю.
  Продолжение после лимита сохраняет task/run, previous spend и checkpoint;
  менять только бюджет не означает запускать модель. Host verification,
  handoff и cleanup не требуют ненужного provider call.
- **ND-4:** approved `Verifier input` хранит provenance/hash до lock, mutable
  product отделён от verifier; negative-control fail обязателен. Headless
  scaffold сохраняет выбранный CLI/runtime и service-none. Authored profile
  и отчёт хранятся только в own state-root; handoff идемпотентен, не меняет
  продукт и не выдаёт guide-prepared за accepted.
- **ND runtime:** argv probe связывает reviewed plan с manifest/revision/cwd,
  ограничивает timeout/output, не выполняется из GET. Async diagnostic queue
  и access cache имеют bounded size, inflight deduplication и invalidation.
  Завершать можно только собственный дочерний процесс/group; SDK/HTTP timeout
  не даёт права уничтожить чужой Codex CLI или весь session tree.
- **ND privacy:** JSON очищается по текстовым значениям до serialization/locks;
  regex по готовому JSON может повредить числа и schema. Отдельно покрыть
  provider error, model identifiers, summary, repository/pattern payload и
  публичную проекцию. Private evidence остаётся private, даже после redaction.
- **ND-6/public:** повторить собственный clean fixture без overrides, затем
  измеренный CLI pilot. Mother synthetic executor и interruption observation
  не подтверждают ND provider usage или active-Goal enforcement. Guide обязан
  описать собственные launcher/auth, model choice, response/usage support,
  recovery, run limits и ясный путь до canonical результата.

Provider failure matrix раздела 12 остаётся обязательной: 401/auth, 429/rate
limit, quota/balance, timeout, interrupted CLI, lost response, malformed output,
usage missing/conflicting, retry/duplicate dispatch и orphan process. Reconnect
не повторяет уже выполненный provider request без подтверждённого состояния.
По каждой строке нужны fixture, durable receipt и понятный операторский путь.

Статус этого deliverable: roadmap готов к отдельной ND реализации; код ND
не обновлён пакетом mother. Существующий `pritha-upstream` остаётся справочным
remote, `origin` не создаётся. Shared revision и локальная ND copy должны быть
побайтово одинаковы; версия ND engine и commit документации учитываются отдельно.

На финальной сверке 2026-09-06 обнаружен более новый независимый ND commit
`a3820b5` (dark/light/classic themes). Он сохраняется; roadmap копируется поверх
него отдельным документационным commit. Mother rollout не меняет эти темы.


## 14. Минорные улучшения после пилота — revision 9

Исходная сверка 2026-09-07: ND находилась на собственном `main` `45be624`
(документация revision 8), последняя функциональная точка — `a3820b5`.
Незавершённое исследование voice transport сохраняется. Описание чистого
checkout в разделе 1 относится к исторической исходной точке, а не к этой
повторной сверке. Mother cleanup реализован поверх восьми API/Goal follow-up
commits до `31e862c`; группы A–F заканчиваются кодом `20defc1`, с исправлением повторного
запуска lifecycle fixture в `c4b1791` и release health retries в `4208882`.
Это версия источника требований, а не заявление об обновлении ND engine.

Фактический ND scaffold пока допускает только `codex-native`; его workspace
исполняется собственным Codex CLI с NeuralDeep. Поддержка CLI/API child
адаптеров матери не появляется от копирования этого документа. Выбор
архитектуры создаваемого child и executor самой Pritha — разные решения.

| Пакет | Применение к ND | Условие завершения |
| --- | --- | --- |
| A1: выбранные модули | Единый selected для memory/skills/tools/redaction в существующем ND scaffold. Явные none/ephemeral приоритетнее текстовых эвристик; отсутствующее legacy поле сохраняет прежний default. Redaction остаётся при skills, Telegram и untrusted intake; host redaction обязателен. | Минимальный и полный ND контракты дают согласованные файлы, npm-команды, AGENTS/README и smoke; запуск через собственный CLI сохранён. |
| A2: child tests | `npm test` = smoke + `node --test tests/*.test.mjs`; структурные проверки выбранных файлов и JSON manifests. API lifecycle добавляется только вместе с отдельным ND API adapter. | Существующий ND child проверен в disposable copy. Passed/failed/missing/not-run и ревизия записаны приватно; handoff остаётся доступен с предупреждением. |
| C: bounded probes | Перенести JS sync helper с положительным timeout, shell:false и SIGKILL только для синхронных проб. Сохранить отдельные длительные бюджеты test/build/media. | SIGTERM-resistant fixture завершается; собственный CLI process/group и чужие PID различаются. Helper не заменяет ND async executor. |
| B/D: helpers и exports | Повторить поиск по ND, включая provider adapters, dynamic imports, tests и Markdown. Переносить только побайтно/семантически одинаковое. | Сохраняются разные JSON failure policies, Unicode slug и byte/text hashes; provider-only exports не удалены по mother inventory. |
| E: инструкции | Собственные launcher/auth/model/accounting команды в README, dated changelog, warning по новым conventional commit subjects; узкие operator-visible ошибки. | Никакие реальные provider credentials, billing snapshots или endpoints не попадают в Git; новая история не переписывается. |
| F: Task Chat | Локальные пути как code или через существующий ограниченный viewer; native file-change variants нормализованы; placeholder identity не становится агентом. Start/Serve используют карточки поверх собственного ND host controller. | Desktop/mobile: preview и cancel не запускают процесс, approve действует один раз; потерянный ответ восстанавливается по тому же request ID. Текст модели не авторизует действие. |

### Порядок и границы переноса

1. До кодинга снять Good State и точные ND CLI/provider/admission/ledger pins.
   Выполнить ND-0 и prerequisites из разделов 12–13: accounting probe/build/
   summary/retry, durable attempts, сохранение task/run после лимита.
2. A1 → A2 → C → B → D → E → F; группы с отличающейся семантикой получают
   собственную реализацию и focused tests. Не переносить mother native Goal
   activation, App Server RPC, desktop authentication или OpenAI тарифы.
3. `npm test` в child — выполнение кода проекта: host связывает план с
   exact argv/cwd, package scripts/hooks, manifest, whole workspace revision,
   instance и согласованным execution policy. GET только читает состояние.
   При отсутствии выполнения handoff показывает not-run/warning, без скрытого
   provider call и без объявления verified/accepted. Это не новый hard blocker
   создания агента; budgets/account limits также сохраняют путь продолжения.
4. Карточки Start/Serve связываются с canonical agent, исходной ND task/session,
   run/revision и свежими machine Trials. Operator Trials могут ждать запуска;
   operational approval не подменяет их и приёмку. Сохранить receipt до dispatch,
   explicit cancel и проверку stale/foreign/duplicate/unknown operation. После
   timeout/restart сначала reconcile собственного process/provider состояния,
   затем разрешённое продолжение. Network Serve остаётся отдельным решением.
5. Один полный ND self-test после групп, затем typecheck, staged build и
   desktop/mobile; не повторять ту же unit suite через отдельный npm test.
   Обязательно выполнить provider/CLI failure matrix раздела 12, strict pages
   с chunks и identity; реальные paid calls только в согласованном pilot.

A1 сохраняет legacy auto skills без выбранного pack, если прежний ND scaffold
создавал каталог и status-команду; явный none удаляет модуль. Решение о таком
legacy default фиксируется тестом. У матери readJson и slug не объединены из-за
различий, а не потому, что работа пропущена. Эти выводы требуют собственной
проверки на ND. Полный перенос inline templates, широкие declarations, split
server.ts и переименование Techscope остаются за пределами этого цикла.

Deliverable revision 9 — одинаковый roadmap в матери и ND, отдельный ND docs
commit поверх собственной истории. `pritha-upstream` остаётся read-only;
`origin` не создаётся. В отчёте раздельно фиксировать mother checkout/compiled
pin, ND engine pin, ND documentation pin, пройденные tests и ещё не выполненный
provider pilot. Тема интерфейса и локальное исследование voice transport
сохраняются. Обновление этого документа не означает реализации пакетов ND.

При переносе staged release учитывать наблюдение с MacBook: доступный health
endpoint ещё не доказывает готовность холодных SSR-страниц. Для временной
сетевой ошибки или HTTP 502/503/504 допустим один повтор с тем же ограниченным
request timeout; весь strict процесс также имеет конечный deadline. HTTP 500,
неверная identity, отсутствующий chunk и HTML вместо JavaScript остаются
ошибками выпуска. Не заменять проверку BUILD_ID текущим checkout SHA: после
rollback исходники могут быть новее фактически запущенной сборки. Эти проверки
относятся к host release и не разрешают повторять оплачиваемый provider request.


## 15. Закрытие ограничений cleanup — revision 10

Повторная сверка 2026-09-07: ND docs `320e56e`, engine `a3820b5`;
mother follow-up `aa9c775`, включая diagnostics `e1b0f69` и templates
`cc97d06`. Раздел 14 остаётся историей revision 9; этот раздел обновляет
требования к проверкам и отменяет перенос группы G на неопределённый срок.
Сам ND engine этим документационным выпуском не изменяется.

### Автоматические UI-проверки

У матери восстановлен полный настроенный Chromium suite: 33/33, без skipped,
flaky и неожиданных ошибок; desktop 1280 px и mobile 390 px. Причина прежнего
падения — устаревший test mock, который отдавал chat payload вместо delivery
списка; невалидное значение обрушало React-страницу. Теперь ошибочный список
сборок локализован в панели, а чат остаётся доступен. Длинные локальные пути
переносятся в компактных списках и не расширяют мобильную страницу.

Для ND создать свой disposable runner: отдельные source/state/agent-parent,
loopback port и build directory, без копирования private data, provider keys
или пользовательского Codex home. Build и запуск ограничены по времени;
cleanup завершает только собственную process group. Build metadata исходного
checkout восстанавливается. Не использовать работающий экземпляр для E2E
мутаций. При переносе fixtures сохранить форму ответов собственного ND host,
CLI session IDs, ledger и admission. Общий mock не должен перехватывать новый
endpoint с чужой схемой ответа. Malformed discovery проверять на обоих размерах.

Условия pass: весь настроенный suite завершается с нулём failed/skipped/flaky;
есть machine-readable report, browser assertions и серверные negative tests.
Отдельные browser clicks или открытый health endpoint не заменяют этот pass.
Синтетический Start/Serve проверяет интерфейс и receipt, но не доказывает live
provider или сетевой запуск. Реальные uploads/settings допускаются только в
изолированном state. Текущую подтверждающую кнопку/dialog ND проверять по его
accepted поведению, не возвращать устаревшие поля ради старого теста.

### Launchd и группа G

Отсутствующий необязательный legacy job — `not-installed`, только если plist
отсутствует и launchctl однозначно сообщает, что job не загружен. Явно требуемая
служба, сломанный installed job, чужой root, оставшаяся загруженная job без
plist и ошибка чтения launchctl остаются диагностическими ошибками. Проверять
собственные ND labels и runtime manager; не включать лишние службы, чтобы
погасить warning. Mother diagnostics подтверждены 11 тестами.

У матери G завершена: 41 шаблон вынесен в authored files, однопроходная
подстановка не исполняет содержимое контракта. 11 вариантов / 456 файлов и
11 scaffold reports побайтно совпали с исходником; 43 scaffold tests прошли.
В ND выполнять G после A1/A2 и стабилизации собственного output: сначала снять
его эталон, затем вынести только его шаблоны. Не копировать mother snapshots
или несуществующие ND CLI/API adapters. Сохранить escaping, newline, executable
content, private lineage и собственный provider bootstrap; проверять minimal,
full, memory, tools, skills и специальные символы на поддерживаемом codex-native.

Готовность этого блока ND: самостоятельные template regression fixtures,
launchd applicability tests, полный isolated E2E и strict staged pages/chunks
с точной build identity. Это добавляется к accounting/provider failure matrix,
а не заменяет её. Лимит сохраняет task/run и путь продолжения; diagnostics и
отсутствующий native Goal не создают жёсткого блока создания агента.

Revision 10 зеркалируется побайтно в mother и ND отдельным docs commit.
История, engine/provider, темы и незавершённое voice-исследование ND сохраняются.
Live ND pilot и реализация пакетов ND остаются отдельным будущим coding cycle;
их pass не следует из успешных тестов матери. Split server.ts, переименование
Techscope и широкое расширение declarations не добавляются в этот cleanup.

## 16. Task Chat и Voice concurrency — revision 11

В roadmap включена [отдельная инструкция реализации параллельного Task Chat
для NeuralDeep](../docs/neuraldeep-task-chat-concurrency-implementation.md).
Её статус — `draft`, исходная сверка ND — `8307bec20fb3b6a312d4478eafb50157c1603786`.
Это план будущей реализации: mother P1–P7 pins, локальные ND changes и evidence
заполняются по факту. Старые результаты cleanup не являются concurrency pass.

Для однозначной трассировки этапы инструкции `ND0…ND5` здесь обозначаются
**ND-C0…ND-C5**. Они отличаются от существующих бюджетных пакетов `ND-0…ND-6`.

| Пакет | Этап инструкции | Работа и связь с основным roadmap | Критерий готовности |
| --- | --- | --- | --- |
| ND-C0 | ND0 | Вместе с ND-0 сверить target, source/compiled pins, capabilities, baselines, оставшиеся A/B/C и переносимые mother diffs | Migration map, явные prerequisites и test matrix для фактической ND версии |
| ND-C1 | ND1 | Вместе с ND-1/2 развить существующий admission: транзакционные receipts до spawn, logical owner, generations, session aliases и crash recovery | Два процесса coordinator и duplicate create дают один spawn; corrupt state сохраняется; stale callback не освобождает нового владельца |
| ND-C2 | ND2 | В ND-3/5 добавить независимые drafts/sending, navigation guard и фоновые summary events | Медленная задача A не блокирует ввод в B/C; drafts и поздние ACK не меняют чужой чат; history/model/billing UI сохранён |
| ND-C3 | ND3 | Связать same-run continuation с очередью, Voice answers/handoff и адресным Stop wrapper/CLI/tools/adapter | Resume по точной session после безопасной границы; duplicate answer идемпотентен; Stop A сохраняет B и usage/partial result |
| ND-C4 | ND4 | Общие worktree/resource claims, provider capacity, attachments и accounting поверх ND-1/2/4 | Нет конфликтов writable resources и двойного расхода; unknown сохранён; original attachments проходят поддержанный initial/resume путь |
| ND-C5 | ND5 | Включить concurrency/crash/provider/browser matrix в ND-6 и отдельный pinned ND release | Собственный полный applicable suite, isolated desktop/mobile E2E, staged build, strict pages/chunks/identity и согласованный live smoke |

### Обязательные границы

- Единственный inference path остаётся launcher → stock Codex CLI `exec` /
  `exec resume <точный session ID>` → Responses adapter → выбранная модель ND.
  При `steerTurn=false` уточнение сохраняется в очереди; чужой App Server,
  `--last`, запись в закрытый stdin и второй resume живой session не подменяют steer.
- Task Chat, Voice и delivery используют общий admission/ownership. Compute slot,
  logical owner и session lock различаются; пауза Voice между шагами не передаёт
  тему соседнему чату. Usage ledger остаётся единственным источником расхода;
  при разных stores требуется идемпотентный accounting event/outbox и reconciliation.
- Capacity выбирается по проверенным local/provider ограничениям. Доступный ввод
  в несколько чатов не обещает одновременное выполнение всех запросов. Очередь,
  лимит и неизвестный расход сохраняют task/run, работу и явный путь продолжения.
- Stop проверяет принадлежность всего дерева процессов; disconnect/reload не
  отменяет выполнение. Recovery не replay'ит возможно принятый provider request.
  Миграции сохраняют историю, receipts, Voice links, originals и свежие usage записи.

До старта ND-C0 сверить фактический прогресс матери и ND: инструкция содержит
плановые зависимости, а не уже опубликованные mother concurrency commits.
Существующие ND admission/Voice guarantees сохраняются и повторно не реализуются.
Детальные cases, regression commands, migration и release contract находятся
в разделах 4–10 инструкции. При несовпадении с текущим ND кодом сначала обновить
локальную migration map и evidence; название одинакового файла у матери не
доказывает совместимость transport, provider или accounting.

Revision 11 и файл инструкции передаются вместе в mother и ND. Публикация
документов означает готовность плана; статус реализации ND-C0…ND-C5 и live pilot
остаётся незавершённым до собственного проверенного результата NeuralDeep.

## 17. Большая история и CLI-аудит — revision 12

Включена [инструкция адаптации большой истории для ND](../docs/neuraldeep-large-history-adaptation.md)
(`proposed`, source ND `8307bec`) и её обязательный
[контракт чтения Task Chat](../docs/task-chat-large-history.md) из mother commit
`774b2d1d39fb47e966a5e7f4f5f344986fc5a26c`. Статус `implemented` у материнского
контракта относится к матери. На исходной revision 12 реализация ND-H0…ND-H3
ещё предстояла; её завершение и собственный ND release отражены в разделе 18.
При переносе сохраняются `neuraldeep_cli`, выбранный provider и instance state.

| Пакет | Работа и зависимости | Критерий готовности |
| --- | --- | --- |
| ND-H0 — полный источник | Проверить native rollout выбранного CLI либо внедрить private append-only event store; согласовать с ND-5 A и ND-C1 | Доказана полнота источника либо явно отмечены невосстановимые legacy gaps; IDs, receipts, archive/resume bindings сохранены; projection пересоздаётся |
| ND-H1 — browser history | После ND-H0 перенести read contract, pagination, lazy Activity, original text chunks и полный Copy в собственный ND backend | Стабильные scoped cursors при append; ограниченные page bytes/cache; ошибки сохраняют текст/draft; Copy успешен только после всех original parts |
| ND-H2 — CLI-аудит | После ND-H0 использовать streaming/bounded reads и checkpoints отдельно от model context и audit execution | Измерен ограниченный рост памяти; source count/digest и completeness проверяемы; retry чтения не запускает новый audit или CLI resume |
| ND-H3 — приёмка и выпуск | Объединить history/crash/isolation fixtures с ND-C5/ND-6; проверить migration/rebuild и rollback на собственном ND | Большие fixtures, archive/restore, append, restart, полный Copy и CLI resume подтверждены; staged release имеет exact compiled identity |

В исходной сверке `safeTurns`/upsert ограничивает нормализованный private binding
200 ходами. До UI pagination проверить, где сохранились более ранние события.
Пагинация усечённой коллекции не восстанавливает потерянные ходы; migration
не создаёт выдуманную историю. Native JSONL активной session не переписывается.
Индексируемая projection со стабильными sequence/offset и item records строится
из полного источника под своим `PRITHA_STATE_ROOT`, вне tracked knowledge.

### Контракт чтения и сохранения результата

- Начальная страница — до 20 ходов, Activity — до 40 items. Page envelope
  ограничен 256 KiB, original text responses — 64 KiB с корректными границами
  Unicode; byte budget может уменьшить число записей на странице.
- Cursor привязан к instance, provider, source generation и chat; append
  сохраняет допустимую позицию, истечение cursor явно диагностируется.
  Original parts относятся к одной версии содержимого; preview, unloaded
  activity и unknown image state не выдаются за полный результат.
- Полный Copy собирает все сообщения ответа и original parts до подтверждения
  успеха. Ошибки чтения/clipboard сохраняются как ошибки; уже показанный текст
  и draft остаются. Поддержанные Activity данные не раскрывают private reasoning.
- Read path использует streaming/indexed reads, coalescing и bounded cache;
  чтение страницы не загружает весь registry. Timeout/retry чтения не вызывает
  `exec`, `resume`, повторный audit или переключение runtime/provider.
- CLI-аудит хранит completeness, count/digest, gaps и cursor/checkpoint отдельно
  от выбранного evidence для модели. Ограничение context не стирает исходную
  историю; скорость native `exec resume` проверяется на конкретном CLI/profile,
  а не выводится из ускорения браузера. Accounting/idempotency ND-1/2 сохраняются.

Обязательные fixtures: более 10 000 ходов, тысячи команд в одном ходе,
Unicode-сообщение более 10 MiB, archive/restore, append во время pagination,
ошибка чтения, restart, полный Copy, legacy gaps и повтор audit request.
Проверить bounded memory, instance/profile isolation и отсутствие лишнего spawn.
CLI resume проверяется в disposable audit fixture; платные вызовы остаются
частью согласованного live pilot, а не обычной read-only проверки.

Материнский App Server reader/fallback не переносится как ND transport.
Отсутствие data migration у mother patch не доказывает безопасность ND rollback:
для выбранного полного источника нужен собственный reviewed migration/rebuild
plan с сохранением новых данных. Выпуск выполняется через ND manager после
готовности кандидата и предусмотренного lifecycle approval. Для phone access
проверяется реальное trusted device; simulated mobile не доказывает сетевой путь.

Пакет передачи revision 12: roadmap, concurrency instruction из раздела 16,
`docs/neuraldeep-large-history-adaptation.md` и `docs/task-chat-large-history.md`.
Копии документов в mother и ND синхронизируются; это обновление плана, а не
свидетельство уже выполненного ND history migration, тестов или выпуска.

## 18. Реализация и выпуск — revision 13

**ND-0–ND-6, concurrency ND0–ND5, history H0–H3 и cleanup A–G выполнены.**
Группа G закрыта; полный Playwright засчитан после 51/51 успешных сценариев.
Полный self-test — 832/832, strict privacy и memory — pass. После установки
проверены 12 browser page/viewport cases, шесть обязательных страниц и chunks.

Канонический runtime использует compiled code
`a0fb828fb85f5778e08f23a21e65f5aa99e06e07`. Выполнены согласованная private
snapshot, migration и managed release; совместимый rollback также проверен
на фактическом экземпляре. Сохранены registry originals, native history,
settings и пользовательская незавершённая работа.

Live pilots: четыре CLI runs / шесть запросов к выбранной модели NeuralDeep;
initial/resume с PNG и файлами, затем исчерпание бюджета и продолжение того
же run/session без сброса spent/approvals и без повторного учёта receipts.
Статус каждой проверки, exact versions и ограничения находятся в
[итоговом отчёте](../docs/neuraldeep-roadmap-release-2026-09-08.md), подробная
последовательность — в [execution report](2026-09-08-neuraldeep-roadmap-execution.md).

Для проверенного CLI поддерживается очередь; live steer и native requests
остаются unavailable по архитектурному контракту. Provider/model/format
capabilities включаются только по собственным evidence. Реальный trusted peer
не проверялся в этом цикле. Это границы приёмки, а не перенос незавершённой G
или отсутствующего полного браузерного прогона на следующий цикл.
