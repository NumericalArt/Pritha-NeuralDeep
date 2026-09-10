---
id: neuraldeep-roadmap-release-2026-09-08
type: agent-deployment-report
status: completed
created: 2026-09-08
updated: 2026-09-08
topics: [neuraldeep, roadmap, release, concurrency, history, budget, verification]
tools: [Pritha NeuralDeep, Codex CLI, Node.js, SQLite, Next.js, Playwright]
sources:
  - operator-full-neuraldeep-roadmap-implementation-2026-09-08
  - 07_workflows/2026-09-08-neuraldeep-roadmap-execution.md
  - https://neuraldeep.ru/docs
related:
  workflows:
    - 07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md
    - docs/neuraldeep-task-chat-concurrency-implementation.md
    - docs/neuraldeep-large-history-adaptation.md
    - 07_workflows/control-center-staged-release.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject: {kind: pritha, id: pritha-neuraldeep}
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_version: ND implementation a0fb828fb85f5778e08f23a21e65f5aa99e06e07; Codex CLI 0.153.0; Node 24.15.0; Next 16.3.2
verified: 2026-09-08
temporal_status: version-bound
---

# Pritha NeuralDeep: roadmap реализован и выпущен

Канонический экземпляр ND обновлён собственным pinned local updater и runtime
manager. Рабочий inference path: Task Chat / Voice → общий admission → stock
Codex CLI `exec` / `exec resume <exact ID>` → local Responses adapter → выбранная
модель NeuralDeep. Проверены `neuraldeep_cli`, `exec_resume`, ready и отсутствие
fallback. Истории, settings, provider/home identity и пользовательские данные
сохранены.

| Идентичность | Подтверждённое значение |
| --- | --- |
| Исходный ND main | `a31f036a9c74d863aee578ab4cb4c206d19b98ec` |
| Прежняя compiled версия | `45be62483af2` |
| Выпущенный code commit | `a0fb828fb85f5778e08f23a21e65f5aa99e06e07` |
| BUILD_ID | `Z1hKLk5I25uTdiar5S979` |
| Совместимый rollback floor | `1496520656ad414c13dff2fbecf60cdcbdeaf797` |
| Storage | coordination 3; history SQLite 1 / registry 3; usage ledger 2 |
| Runtime | Codex CLI 0.153.0; Node 24.15.0; Next 16.3.2; React 19.2.7 |
| Модель live acceptance | `qwen3.6-35b-a3b`, metadata и поведение проверены 2026-09-08 |

Финальный documentation commit идёт после code commit и не меняет исполняемый
код. Runtime сообщает действительную compiled identity, независимо от более
нового Git HEAD с этим отчётом. У ND нет `origin`; изменения сохранены в локальном
`main`. Материнский GitHub не назначался upstream отдельной ND архитектуры.

## Выполненные этапы

| Пакет | Результат |
| --- | --- |
| ND-0 | Сверены canonical target, source/compiled identity, baseline, версии и изоляция тестов |
| ND-1/2 | Durable receipts до платного dispatch, known/unknown usage, overshoot, продолжение того же run, идемпотентные budget amendments |
| ND-3/4 | Понятные provider/limit states, host verification, identity/readiness, selected scaffold, child `npm test`, process API lifecycle и защищённые Trials/handoff |
| ND-5 A/B/C/M/S | Устойчивая история, восстановление доступа и aliases, archive/полный Copy, originals и capability gates, bounded memory/settings |
| Concurrency ND0–ND5 | Per-chat drafts, durable admission/owners, summary SSE, точная очередь, Voice answer/handoff, owned Stop, worktrees и общие resource claims |
| History H0–H3 | Канонический immutable source, chunks/pagination, browser и CLI audit, migration/recovery и ограниченное потребление памяти |
| Cleanup A–G | Проверены и перенесены применимые улучшения; bounded probes, только идентичные helpers, проверенные dead exports, документация, UI и 44 scaffold templates |
| ND-6 и release | Полная автоматическая и браузерная приёмка, реальные ограниченные вызовы, staged build, согласованная копия состояния, managed rollout/rollback |

Полная последовательность пакетов, промежуточные результаты и source mapping:
[execution report](../07_workflows/2026-09-08-neuraldeep-roadmap-execution.md).
ND реализована по собственным контрактам и проверкам. Недоступные mother P1–P7
pins не выдаются за выполненный перенос: готовность матери не подменяет ND evidence.
Все результирующие ND commits находятся в проверяемом диапазоне
`a31f036a9c74d863aee578ab4cb4c206d19b98ec..a0fb828fb85f5778e08f23a21e65f5aa99e06e07`.

## Проверки

- Полный self-test: **832/832**, 0 failed/skipped; quality gate, TypeScript,
  memory validation/rebuild и strict privacy — pass; aggregate warnings/regressions пусты.
- Полный Playwright: **51/51**, без skip/retry. Четыре specs, desktop/mobile,
  три темы на шести ширинах, drafts/Voice/очередь/операции, агенты, Settings/Dev,
  upload настоящих 100 MiB и отказ 100 MiB + 1. Theme geometry сравнивается с
  принятой палитрой; прежнее исключение Settings 795 px при viewport 768 px
  явно остаётся в baseline теста.
- После установки: **12/12** browser page/viewport checks на настоящем ND,
  0 page errors, 0 mutating UI requests; strict `/voice`, `/agents`, `/task-chat`,
  `/codex`, `/settings`, `/dev`, все соответствующие chunks и exact identity — pass.
- Offline race/crash/ownership/provider fixtures входят в 832: два Node-процесса,
  aliases, concurrent create, stale callbacks/PID, unknown exit, corrupt journal,
  queued cancellation/restart, Voice CAS и failed predecessor, sandbox/resources,
  provider error matrix, idempotent usage и восстановление после лимита.
- G: 44 templates; 456 generated files в 11 вариантах сохранены побайтово.
  API lifecycle проверен отдельно. G завершена.

Live synthetic acceptance: **4 CLI runs / 6 provider requests** на выбранной
модели. Initial и exact-session resume проверены с PNG и разными original text
files. Отдельный pilot исчерпал искусственный лимит, увеличил бюджет того же
run и продолжил ту же session; spent/overshoot и approvals сохранились,
повтор grant/receipt не удвоил учёт. Каждый процесс и adapter завершён.
Расход известен: **55 554 total tokens**, из них **23 056 cached input tokens**
как подмножество и **497 output tokens**. Эти величины не складываются повторно.
Чужие production задачи и upstream outage для теста не запускались.

Private attachment evidence привязан к действительным ND home/provider,
CLI version, adapter hash и выбранной модели. Включены проверенные initial/resume
пути для PNG и файлов. Другие модели/форматы требуют своих evidence; original
bytes сохраняются и при unknown/unsupported capability. Тариф не выводится из
имени модели; текущие metadata не заменяют поведенческий тест.

## Состояние, миграция и откат

До обновления read-only drain подтвердил 12 завершённых попыток и отсутствие
owned CLI/host effects. После verified manager stop подготовлена private snapshot:
**1 414 файлов, 2 согласованные SQLite backup**, включая WAL data и native history.
Credentials, другие homes и generated memory/cache в native transfer не включались.
Незавершённая пользовательская review-заметка сохранена и возвращена без изменения.

Сохранились **2 chats, 22 turns, 278 items, 22 receipts**. Исходные registry bytes
совпадают с migration input; все **6 native history files** совпадают по SHA-256.
Read-only CLI audit проверил originals и hash chain из **325 source events**.
Legacy gaps маркируются честно: ранее не записанный текст не выдумывается.

Первый cold start превысил окно healthcheck. Менеджер остановил candidate и
успешно запустил отдельную совместимую сборку rollback floor; strict health,
chunks и её exact identity прошли. Новые SQLite/receipts не восстанавливались
из старого snapshot. Изолированный staged build работал; повторный managed
release с ограниченным окном startup 120 s / request 20 s успешно установлен.
Первопричина задержки не объявляется доказанной. Maintenance снят после
проверки состояния; новая работа разрешена.

Для следующих schema upgrades доступны `release-artifact.mjs`,
`neuraldeep/release-maintenance.mjs` и `neuraldeep/release-state.mjs`. Updater
принимает `--rollback-artifact <private-directory>`, сверяет source ancestry,
storage versions, BUILD_ID и digest. Резервная сборка, не прошедшая strict health,
также останавливается manager. Старые writers до rollback floor не открывают
новую схему как пустое состояние; старый snapshot нельзя накатывать поверх новых
receipts, usage, originals или пользовательской работы.

## Сохранённые архитектурные границы

Live steer и native runtime approvals/input остаются unavailable для проверенного
CLI-контракта; поддерживаются очередь, точный Stop и host/operator requests.
Автоматической смены модели, App Server transport или OpenAI fallback нет.
Реальный trusted-phone доступ в этом цикле не проверялся; локальный mobile
viewport не выдаётся за peer acceptance. Existing build tracing warnings
проверены на отсутствие private state в traced artifacts; doctor recommendation
для Python ≥3.10 отделена от успешно работающего текущего runtime.

Техническая реализация и локальный выпуск завершены. Пользовательская оценка
нового поведения остаётся отдельной от автоматической технической приёмки.
