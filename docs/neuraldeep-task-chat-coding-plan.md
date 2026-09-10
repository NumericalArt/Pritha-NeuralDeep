---
id: neuraldeep-task-chat-coding-plan
type: workflow
status: implemented
created: 2026-09-05
updated: 2026-09-05
topics: [neuraldeep, task-chat, history, archive, attachments, capabilities, settings, memory, rollback]
tools: [Pritha, NeuralDeep, Codex CLI, TypeScript, Node.js, Playwright, Git]
sources:
  - mother-docs-neuraldeep-task-chat-adaptation-2026-09-05
  - neuraldeep-local-source-88a69c89ae16d21de4d5bd021d4a6f0b5a4599f4
  - mother-integrated-fleet-release-2026-09-05
related:
  decisions:
    - 05_decisions/2026-09-03-neuraldeep-task-chat-voice-architecture.md
  standards:
    - 04_standards/neuraldeep-task-chat-api-contract.md
    - 04_standards/pritha-good-state-alignment.md
  workflows:
    - 07_workflows/control-center-staged-release.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: neuraldeep-task-chat-adaptation
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Пошаговый план переноса Task Chat в Pritha NeuralDeep

> Реализация завершена и выпущена в ND 2026-09-08: [отчёт, версии и проверки](neuraldeep-roadmap-release-2026-09-08.md).
> Исходная инвентаризация ниже описывает baseline до реализации; она не является текущим списком открытых дефектов. CLI-only архитектура и capability gates сохранены.

## 1. Цель и границы

Перенести восстановление истории, локальный архив, полное копирование ответа,
оригинальные вложения, проверки возможностей моделей, загрузку предыдущих
страниц истории, исправления памяти и числовых Settings. Сохранить рабочую
архитектуру NeuralDeep и принятые локальные улучшения интерфейса.

Это план реализации, а не отчёт о готовом переносе. На этапе его составления
изучены инструкция матери, локальный код, целевые diff и тесты исходных
коммитов, локальные архитектурные решения и состояние Git. Выполнен только
inspection-fetch локального `pritha-upstream`; merge и cherry-pick не было.
Продуктовый код, пользовательские данные и сервисы не менялись. Каталог
провайдера, платные запросы, тесты реализации и production health в рамках
этого планирования не запускались.

Кодить последовательно небольшими коммитами. Перед A, B и C уточнять
соответствующую секцию этого плана по актуальному checkout; после каждого
этапа сохранять его локальные SHA, тестовые evidence, демонстрацию и результат
проверки отката. Следующий этап начинается после прохождения предыдущего.

## 2. Что установлено в текущем checkout

Базовый NeuralDeep HEAD: `88a69c89ae16d21de4d5bd021d4a6f0b5a4599f4`.
Основной checkout на `main` содержит незакоммиченные изменения.
Worktree `Pritha-NeuralDeep-task-chat-voice`, ветка
`integration/neuraldeep-task-chat-voice`, чистый и стоит на том же SHA, но
текущих незакоммиченных улучшений основного checkout в нём нет.

В таблицах далее `L` означает `interfaces/control-center/src/lib/codex-chat`,
`C` — `interfaces/control-center/src/components/codex`,
`API` — `interfaces/control-center/src/app/api/codex-chat/v1`.
Имена новых модулей и полей ниже — предлагаемая реализация, а не уже
существующий API.

| Наблюдение по коду | Следствие для плана |
| --- | --- |
| `L/cli-runtime.ts`, `L/neuraldeep-cli-runner.ts`, `scripts/neuraldeep-codex.mjs` реализуют `exec-json`/resume | Не переносить `app-server.ts` матери и её выбор Desktop/standalone |
| Есть `admission-coordinator.ts`, `voice-topic-store.ts`, `voice-topic-routing.ts`, `voice-task-links.ts` | Все новые отправки проходят существующее admission; сохраняются topic/generation/session и связь с карточками |
| Identity в private store и runtime уже не зависит от версии бинарника | Исправление A нельзя сводить к замене hash-алгоритма матери |
| Launcher учитывает `PRITHA_NEURALDEEP_CODEX_HOME`; store/runtime вычисляют identity от `stateRoot/codex-home` | Проверить и устранить расхождение effective home, не перехешируя существующие Voice topics без доказанной миграции |
| `normalizeChatBinding` подставляет текущую identity при отсутствии валидной старой и нормализует provider в NeuralDeep | Эти defaults не могут служить доказательством происхождения старой записи для Restore access или dedup |
| Реестр v2 хранит mirrored turns; чтение v1/v2 поддерживается; `safeTurns` и `upsertTurn` оставляют 200 ходов | Previous pages должны честно отражать доступный диапазон; уже утраченные ранние ходы нельзя объявлять восстановленными |
| `safeReceipts` ограничен 500 записями; обработчик CLI оставляет 100 items; assistant text обрезается до 256 000 символов | Проверить сохранность idempotency при длинной истории и полного ответа до добавления Copy response |
| Runtime сообщает `nativeHistory: true`, но `historyKind` равен `mirrored`, native read/list отсутствуют | Уточнить семантику capabilities, сохранив доступность локальной истории |
| Direct Chats и Voice Tasks уже есть; Legacy accordion уже отсутствует | Для этой части B нужны регрессионные проверки, а не повторная перестройка групп |
| `archived` и фильтрация существуют; archive/unarchive routes и полное copy отсутствуют | Добавлять поведение поверх локального store и его блокировок |
| `StartTurnInput` и launcher принимают только текст; `--image` в `exec-json` не предусмотрен | Вложения требуют отдельной адаптации CLI, а не только UI и файлового storage |
| Сервер каталога читает `modalities`, но Task Chat runtime не публикует `inputModalities` | Сохранить provenance и состояние unknown до UI/dispatch; одного `vision: true` недостаточно |
| Responses adapter ограничивает request 16 MiB, response 32 MiB и буферизует SSE | 100 MiB оригинала не означает возможность отправить его модели; учитывать JSON/base64 и историю resume |
| `thread.started` даёт session id, который сейчас записывается в поле receipt `nativeTurnId` | Не считать это подтверждённым native turn id или эквивалентом App Server client id |
| Settings API отвергает `codexAppThread*` | Переносить только применимые числовые поля, не возвращать App-specific настройки |
| Локальные Next 16.3.2, React 19.2.7, PostCSS override 8.5.26 отличаются от матери | Сохранить локальный lockfile; не понижать версии переносом release commit |
| Updater требует clean `main` и `origin/main`; настроен только read-only `pritha-upstream` | Обычный update/fleet rollout не является готовым способом выпуска NeuralDeep |
| В updater rollback вызывает restore build без проверки `failedStop.ok` | Исправление подтверждённого shutdown нужно до первого feature release |

Незакоммиченный scope пересекается с `C/CodexChatPage.tsx`,
`L/normalize.ts`, `CodexSettingsSection.tsx`, `globals.css` и их тестами.
Он включает reconnect/diagnostics, применение Settings и принятую палитру.
Отдельное изменение `tools/web-search/searxng-lock.json` и untracked private
данные не включать в перенос автоматически.

Зафиксированная палитра и её известные ограничения описаны в
[локальном решении](ui-design/2026-09-05-neuraldeep-color-transfer.md).
Там уже отмечены intermittent 503 у usage endpoint в isolated preview и
отдельные layout limitations. Это исходные наблюдения для повторной проверки,
а не заранее разрешённые исключения для нового релиза.

Автоматический Good State Alignment с предварительно выбранным внешним
state-root вернул `memory-index-missing`. Это не доказывает поломку живой
памяти: в P0 нужно подтвердить фактическое окружение сервиса и повторить
сверку. Для этого плана вручную сопоставлены baseline надёжности 2026-08-28,
[NeuralDeep decision 2026-09-03](../05_decisions/2026-09-03-neuraldeep-task-chat-voice-architecture.md)
и принятое решение о палитре. Decision уже заменяет предположение о native
App Server history на локальную mirrored-архитектуру.

## 3. Исходные коммиты и способ переноса

| Этап | Точный mother SHA | Использование |
| --- | --- | --- |
| A | `79ee5a403f813f483768850213481f7433cc1609` | Состояния истории, proof-before-recovery, обратимость и fixtures |
| B | `a1fd2faa54817fa847307f0738d51236eaa25739` | Локальное архивирование, aliases, copy helper/component и UI scenarios |
| C | `71f5be857702227acedc9a89f7c72b07a7af11a7` | Original storage, attachment UI, capability gates, previous pages |
| C fixture | `854a4203c7241bc274e6a12ebaca7265d80faf7e` | Типизированный history fixture; сравнивать весь B → этот candidate |
| Memory | `8be310d89ce530aecbab470ba4d339295b8af40e` | Env-first resolution в memory entrypoints |
| Settings / integration | `4c52125c7c29bea4b6ac8ffea09644acdc794424` | Числовые drafts, валидация до сохранения, актуальный Settings status |
| Executable release | `1c0ed2c42a20e02f1d1bf931001544e5eb113315` | Итоговая feature reference; узкая Finder fingerprint correction |
| Release tooling | `4467828d6b8e92dfbf0c360a1804f2809f4ce296` | Проверенный stop перед rollback, bounded retry, изоляция test helper |

В начале каждого этапа читать `git show <точный-SHA>` и сравнивать изменения
с локальными файлами. Для C отдельно читать `git diff <B-SHA>
<C-fixture-SHA>`. Новые чистые helpers/components переиспользовать выборочно;
gateway, store, normalizer, Voice runtime, Settings API и supervisor менять
локальными патчами. Число 518 тестов в mother report не является результатом
тестирования NeuralDeep.

## 4. Инварианты всех этапов

1. Единственный production inference path: NeuralDeep CLI → loopback Responses
   adapter → NeuralDeep. Provider/model substitution и App Server не добавлять.
2. Существующие чаты и Voice topics сохраняют model/effort, session id,
   generation, receipts, task links и явное разрешение continuation.
3. Один active turn на coordination key; общий FIFO и account concurrency.
   Неизвестный лимит равен одному; изменение лимита не прерывает active turn.
4. Чтение истории, Restore access, unarchive и разрешение отправки — отдельные
   действия. Ни одно из первых трёх не запускает старый prompt.
5. Restart и transport-ambiguous delivery не порождают новый native turn.
   Явное восстановление Voice остаётся в Voice Control с его recovery gates.
6. Архив меняет видимость в конкретном экземпляре. Работающие/ожидающие Voice
   задачи, approval/input, admission и процесс продолжают существующий цикл.
7. Private state, Keychain, account/billing/usage и audit сохраняют изоляцию.
   Новые endpoints используют текущие auth, same-origin и redaction guards.
8. Запись реестров — под текущими token-owned locks с reread, atomic write и
   last-known-good. Не держать lock при model/network execution; согласовать
   порядок нескольких locks и проверить отсутствие deadlock.
9. Сохраняются reconnect, per-chat drafts, dictation, music ducking, `/codex`
   redirect с query string и принятая палитра. Новые стили используют её tokens.
10. Документация и fixtures не содержат секретов, реальных разговоров,
    оригинальных пользовательских файлов, идентификаторов или private paths.

## 5. P0 — зафиксировать исходную точку и изолировать работу

**Результат:** воспроизводимый исходный snapshot, перечень текущих регрессий,
private recovery manifest и отдельное окружение разработки.

1. Повторить Git inventory; явно разделить base SHA, текущие функциональные
   изменения, palette patch и unrelated changes. Сохранить private diff/hashes
   без `git add .`, stash/reset и включения private файлов.
2. Для реализации подготовить отдельную ветку/worktree от выбранного
   source checkpoint. Предлагаемое имя —
   `pritha/build-neuraldeep-task-chat-evolution`. Перенести туда только
   проверенные исходные изменения, необходимые для сохранения текущего UX.
   Уже существующий worktree другой задачи автоматически не занимать.
3. Определить production code/state/home/profile, manager ownership,
   instance identity, Node/CLI version и build id read-only. Не подставлять
   `.codex` матери и не считать имя папки достаточным доказательством.
4. Подтвердить Good State через фактический env. При отсутствии индекса
   использовать authored baselines и восстановить только индекс нужного
   экземпляра отдельной локальной операцией; не запускать ML/provider ради
   простого поиска baseline.
5. Подготовить test root, test state, отдельные home/agent parent/instance id,
   свободные loopback ports, inert provider fixtures и пустой отдельный
   Keychain service name. Проверить, что env loading не возвращает production
   endpoints/credentials. Не копировать `.env`, sessions или registry матери.
6. Playwright сейчас использует `reuseExistingServer: true` и default port.
   Для этой серии ввести отдельный test config/guard: только test identity,
   явный baseURL, запрещён reuse чужого сервера, отдельный build directory.
   Реальные route-upload tests должны отвергать production identity.
7. Снять baseline targeted unit/contract tests и standalone typecheck в
   isolated worktree. Build выполнять вне live `.next`. Сохранить известные
   исходные failures; проверить usage-503 отдельно, не скрывая assertion.
8. До первой миграции сохранить согласованный private snapshot затрагиваемых
   registry/sidecars с hash manifest. Для native session files — read-only
   inventory и согласованный recovery snapshot при необходимости. Не читать
   содержимое секретов; credential storage не включать в перенос.

**Gate P0:** происхождение исходного кода и состояние production определены;
пользовательские изменения сохранены; fixture окружение не может обратиться
к боевому аккаунту. Необъяснённые provider/identity/admission failures исправить
до функционального переноса.

## 6. R0 — подготовить безопасный локальный выпуск

**Файлы:** `scripts/pritha-instance.mjs`, при необходимости новый узкий release
helper/CLI, `tests/pritha-instance-update.test.mjs`, deployment workflow.
`scripts/control-center-runtime.mjs` сохраняется владельцем lifecycle.

1. Выделить способ выпуска локального pinned commit без зависимости от
   отсутствующего `origin/main`. Предпочтение — узкий local-source режим
   существующей staged transaction: immutable source commit/tree manifest,
   проверенные target instance и roots, тот же manager и health-v2.
   Название/флаги этого режима определить при реализации: сейчас его нет.
2. Не делать `pritha-upstream` production origin и не ослаблять глобальный
   clean-checkout gate. Source candidate должен быть чистым и immutable.
   Если production checkout остаётся dirty, нельзя выдавать обычный updater за
   применимый: нужен проверенный release path, сохраняющий dirty файлы и
   доказывающий соответствие запускаемых server scripts выбранному snapshot.
3. Выборочно перенести `4467828`: успех manager только при успешной команде
   **и** JSON `ok === true`; пустой/невалидный ответ — ошибка. Повтор stop
   допустим один раз только для `control_center_did_not_stop_within_grace_period`.
4. Во всех rollback branches требовать подтверждённый stop до build swap.
   При ownership refusal/unconfirmed stop оставить обе сборки и recovery
   evidence; вернуть `rollback-stop-failed`, а не успешный rollback.
5. Применять Finder exception только к regular `.DS_Store`. Другие файлы,
   dotfiles, директории и symlinks с таким именем продолжают проверяться.
6. Сохранить локальный dependency configuration. Проверить установку native
   image dependencies и реальную image optimization на локальных Node/lockfile.
   Не переносить lockfile матери или App-default transport.
7. Проверить updater на fixtures: успешный release; ошибки build, swap, health,
   final Git/isolation; поздний stop; permanent stop failure; чужой owner;
   malformed manager JSON; обычный/подменённый `.DS_Store`. Если переносится
   music test helper, использовать его отдельный temporary root.

**Данные/миграция:** feature registry не меняется; новые release manifests
только private. **Demo:** fixture failed-health → подтверждённый rollback;
ownership refusal → обе сборки сохранены. **Gate R0:** rehearsal прошёл;
production lifecycle ещё не запускался. **Откат:** revert tooling commit;
сохранить manifests и обе сборки до подтверждённого восстановления.

## 7. A — история и подтверждённое восстановление доступа

### A1. Разделить storage identity и возможность чтения/продолжения

**Файлы:** `L/types.ts`, `L/private-store.ts`, `L/cli-runtime.ts`,
`L/normalize.ts`, `L/gateway.ts`; новые `L/storage-identity.ts` и
`L/history-access.ts` как локальные helpers; узкая общая функция resolution
с `scripts/neuraldeep-codex.mjs`, если нужна.

1. Описать read-only inventory известных raw v1/v2 bindings и реально
   существующих CLI transcript schemas. Для production records сохранять
   только обезличенные структурные выводы; fixtures создавать синтетически.
2. Централизовать resolution effective NeuralDeep home/profile для launcher и
   verification. Оставить стабильными текущие согласованные identity/topic
   keys. Для custom-home legacy records требовать доказательства, а не
   автоматически перепривязывать их к вновь вычисленному hash.
3. До нормализации различать подтверждённую identity и подставленный default.
   Проверять provider, original storage, workspace, native session id и
   Voice topic/generation. Неполная provenance означает preserved/unverified.
4. Ввести явный history status: loading, available/verified-empty,
   temporarily-unavailable, different-storage/unverified, unsupported-format,
   missing, recovery-available. Это независимый контракт от continuation.
5. Исправить misleading `nativeHistory` после проверки потребителей
   capability: локальное чтение остаётся доступным при недоступности upstream.
   Provider auth/outage не должен превращать сохранённый transcript в empty.
6. Чтение не выполняет rebind/replay/archive. Корректную mirrored history
   можно показывать при blocked continuation; invalid registry остаётся
   preserved/read-only согласно существующему recovery контракту.

### A2. Restore access и совместимая миграция

**Файлы:** `API/threads/[chatId]/restore-access/route.ts` (новый),
`C/CodexChatPage.tsx`, helpers/store A1; отдельный private migration journal.

1. Показать Restore access только после проверки исходного storage/session/
   workspace/profile. В POST повторить проверку, затем reread под lock и
   compare-and-swap ожидаемого binding revision/hash.
2. Сохранить before-image только изменяемых полей и migration receipt.
   Повторный POST возвращает тот же результат; конкурентное изменение
   вызывает conflict и не затирается. Registry v2 остаётся совместимым.
3. Не менять Voice topic id/generation, admission key, selected model,
   continuationEnabled и task links только ради доступа к истории. Если для
   конкретного legacy binding требуется cross-store миграция, сначала
   отдельная journaled схема и crash fixture; без неё оставить запись
   read-only с объяснением.
4. Для доказанно известного старого CLI формата допустим ограниченный
   read-only parser. Converted copy хранить отдельно, маркировать, связывать
   с hash/provenance оригинала; она не даёт автоматического права resume.
   Неизвестный формат сохраняется и объясняется без выдуманной конверсии.
5. Сохранить обработку ошибок и reconnect из текущего dirty patch. Loading,
   verified empty и failed fetch не объединять; предыдущий transcript при
   transient failure остаётся на экране.

**Тесты A:** новый `tests/neuraldeep-chat-history.test.mjs` и расширение
registry/voice-invariants tests: binary upgrade в том же home; другой home;
custom home override; неверные provider/session/workspace; missing identity;
valid empty; absent/corrupt history; primary/LKG corruption; transient error;
повторный Restore; конкурентная мутация; restart посередине миграции; откат.
Во всех recovery fixtures inference start count равен нулю.

**Demo A:** Direct и Voice старые записи читаются при наличии доказательств;
неподтверждённая запись сохраняется с объяснением; Voice continuation остаётся
под своими gates. **Gate A:** targeted tests, typecheck, candidate build,
desktop/mobile history scenarios и metadata rollback rehearsal прошли.
**Откат A:** предыдущая сборка + обратные изменения только полей конкретной
миграции при совпадающей ожидаемой версии; не восстанавливать весь старый
registry поверх новых пользовательских ходов.

## 8. B — локальный архив и полный Copy response

### B1. Архив и доказанные aliases

**Файлы:** `L/private-store.ts`, `L/gateway.ts`, `L/normalize.ts`,
`API/threads/route.ts`, новые archive/unarchive routes, `C/CodexChatPage.tsx`.

1. Dedup key строить только для доказанно общего storage/profile/provider,
   одинаковой группы и непустого native session id. Для отсутствующих ID и
   unverified records ключом остаётся `chatId`. Конфликтующие Voice topics/
   generations не сливать автоматически.
2. Объединять только list projection: все task links, alias names для поиска;
   исходные bindings, receipts и deep links сохраняются. Не заводить второй
   transcript и не объединять Direct с Voice по одному session id.
3. Добавить `setArchived` в существующую registry transaction. Обновлять
   видимость всех доказанных aliases; effective archive наследуется и поздно
   появившимся alias. Activity/Voice reconciliation не сбрасывают archived.
4. Разделить `status` исполнения и `archived`: текущий normalizer маскирует
   active как archived. Видимость не должна влиять на busy/admission/recovery.
5. Добавить POST archive/unarchive и SSE notifications. Для новых typed
   отправок из архивного чата требовать explicit unarchive; уже принятый
   dispatch и Voice queue не отменять. Повтор ранее принятого HTTP request
   с тем же id должен примиряться с receipt и не запускаться заново.
6. Добавить Show archived / Restore from archive, server-side filtering перед
   pagination и защиту от устаревших list responses. Deep link архивного alias
   открывает историю и действие восстановления. Legacy UI уже отсутствует;
   исторические ephemeral Voice cards по-прежнему не импортируются.

### B2. Полный текст одного ответа

**Файлы:** новые `L/copy-response.ts`, `C/CopyResponse.tsx`;
`L/normalize.ts`, item retention в `L/gateway.ts`, `C/CodexChatPage.tsx`, CSS.

1. Селективно перенести pure copy helper/component. Копировать только
   упорядоченные `assistant_message` одного turn, сохраняя Markdown, Unicode,
   код, ссылки и переносы. User/reasoning/tool activity не включать.
2. Устранить обрезку assistant text в 256 000 символов. Разделить retention
   текста ответа и bounded activity: `.slice(-100)` не должен удалять раннюю
   часть assistant response после длинной серии tool events.
3. Проверить объём HTTP/history responses и клиентские body limits. Большие
   страницы разбивать по согласованному byte budget; слишком большой ответ
   должен иметь явное состояние, не выглядеть полным после silent truncation.
   Сохранить защитные лимиты сырых tool logs и транспорта.
4. Кнопка отключена во всех nonterminal states, включая
   `waiting_for_provider`; доступна для completed/interrupted/failed partial
   response. Empty assistant response не копируется. Добавить Copied feedback,
   keyboard/focus и сообщение clipboard denial.

**Данные/миграция B:** архив использует существующее v2 поле; восстановление
уже обрезанного старого текста не обещается. Сохранение полного нового ответа
не меняет семантику Voice tasks и execution receipts.

**Тесты B:** новый `tests/neuraldeep-chat-archive-copy.test.mjs`; active/queued
Voice archive; activity race; restart; late alias; same native id в другом
home/группе; search по alias/task link; deep links; concurrent pagination;
ответ более 300 000 символов и более 100 activity items; clipboard denial;
terminal/nonterminal states. Проверять вызовы настоящего admission interface,
не подменять весь gateway фиктивным успешным ответом.

**Demo/Gate B:** Direct/Voice lists, active archive, reload/restore, полный
multiline copy на desktop/mobile; targeted tests, typecheck/build и health
candidate. **Откат B:** вернуть сборку; archived metadata сохранить либо
обратно изменить только операции этой миграции. Архив не является удалением.

## 9. C — вложения и возможности конкретного NeuralDeep transport

Этап разбит на четыре последовательных коммита. Upload UI выпускается только
в составе согласованного C: промежуточные storage/transport изменения сначала
проверяются на isolated candidate. Новый feature-flag framework не требуется.

### C1. Capability contract и пределы транспорта

**Файлы:** `src/lib/settings/codex-model-catalog.ts`,
`codex-model-catalog-server.ts`, `L/types.ts`, `L/cli-runtime.ts`, новый
`L/attachment-policy.ts`; fixtures каталога/CLI/adapter.

1. Получить актуальную authoritative NeuralDeep model metadata через текущий
   адаптер каталога; сохранить дату, revision/hash и source. Перечислить
   **каждую доступную модель**, а не только default. Отсутствующее, устаревшее
   или противоречивое поле остаётся `unknown`; не выводить vision из имени.
2. Разделить provider-advertised modality и подтверждённую transport
   capability. Опубликовать в runtime поддерживаемые inputs и причину
   unsupported/unknown; catalog failure не превращать в молчаливое text-only.
3. Заполнить матрицу ниже для initial CLI execution, resume и, где применимо,
   typed continuation существующего Voice topic. У всех путей может быть общий
   runner, но каждый call site должен корректно передавать новые поля.
4. Recheck при submit и перед реальным admission dispatch после ожидания:
   provider/model/catalog/CLI revision могли измениться. Использовать модель
   binding/topic, а для нового чата — explicit выбранную модель. Глобальные
   Settings не меняют модель существующего чата.
5. Image support учитывать по всей conversation, включая ранние страницы и
   текстовый follow-up после image turn. Не считать отсутствие image в текущей
   странице доказательством text-only history.
6. Отдельно вычислить storage limit и provider payload limit. При текущих
   16 MiB у adapter budget включает base64, JSON и всю пересылаемую историю.
   Проверять final body до upstream вызова; oversized/unsupported image
   сохраняется как оригинал, draft остаётся, dispatch блокируется. Не сжимать,
   не заменять текстовым описанием и не выбрасывать файл автоматически.

Матрица заполняется evidence, а не предполагаемыми значениями:

| Поле для каждой model × path | Что фиксировать |
| --- | --- |
| Identity | Provider, exact model id/revision, metadata source/time, CLI/adapter version |
| Text / image | `supported`, `unsupported` или `unknown`, отдельно для модели и полного transport |
| Original access | Доступ CLI tools к точным private bytes в выбранном sandbox; hash verification |
| Image chain | Browser → private original → CLI flag/input → serialized Responses body → provider |
| Limits | MIME/formats, bytes/count/dimensions если объявлены; final encoded request budget |
| Resume/history | Предыдущие изображения сохраняются в request; несовместимое продолжение блокируется |
| Errors | Auth, access, billing/quota, rate limit, transient, unsupported input и oversized различимы |
| Evidence | Fixture ids и отдельно exact model/date/result синтетического live smoke, если выполнен |

### C2. Private storage оригиналов

**Файлы:** новый `L/attachment-store.ts`,
`API/attachments/[attachmentId]/route.ts`, `L/http.ts`, `L/types.ts`,
`interfaces/control-center/next.config.mjs`; shared private-json/lock helpers
использовать без ослабления их текущих гарантий.

1. Ввести streaming PUT с client-generated stable attachment id и безопасным
   filename metadata; GET отдаёт original по opaque id под текущей авторизацией.
   Публичный объект не содержит абсолютного пути, native id или credential.
2. Хранить в private chat-root: immutable original + versioned metadata с
   size/hash, media kind, createdAt, retention/reference state. Atomic publish,
   файлы 0600, директории 0700; повреждённая metadata не удаляет оригинал.
3. Лимиты по умолчанию: 10 files/message, 100 MiB/file, 250 MiB/message,
   10 GiB/instance. Публиковать лимиты до upload; отдельно объяснять более
   строгие image/provider ограничения C1.
4. Проверять ID, filename/control characters, actual length, quota, hash,
   realpath containment, regular-file status и symlinks. Проверять файл через
   безопасно открытый handle; тестировать подмену между verify/read/send.
   Client MIME/name — недоверенные данные; archive/source/HTML/SVG не выполнять.
5. Для upload/reference/cleanup/quota использовать instance-scoped
   межпроцессную блокировку или reservations под существующим lock protocol.
   In-memory upload queue матери сама по себе не обеспечивает локальную
   multi-process гарантию. Не держать chat/admission lock весь большой upload.
6. Unreferenced drafts старше 24 часов удаляются только при следующем upload;
   referenced originals никогда не истекают автоматически, включая archive,
   failed/partial turn и retention за пределами 200 ходов UI mirror.
   При неопределённой ссылке после crash выбирать сохранение.
7. GET: `no-store`, `nosniff`, safe Content-Disposition/CSP, same-origin.
   Preview/download не меняют bytes. Проверить реальные Next proxy/body limits
   установленной версии без копирования всей `next.config` матери.

### C3. Durable delivery через существующие CLI и admission

**Файлы:** `L/gateway.ts`, `L/private-store.ts`, `L/cli-runtime.ts`,
`L/neuraldeep-cli-runner.ts`, `scripts/neuraldeep-codex.mjs`,
`scripts/neuraldeep/responses-adapter.mjs`, `scripts/neuraldeep/provider-error.mjs`,
typed request routes; новый private attachment-delivery sidecar при
необходимости backward compatibility.

1. Добавить `attachments?: string[]` к first turn и subsequent turn, сохранив
   старый text-only клиент. Один text input может быть пустым только при
   непустых валидных attachments. Проверить все truthiness guards локального
   `newDirectBinding/createThreadWithFirstTurn`: сейчас они требуют turnText.
2. Hash/idempotency учитывает exact text, упорядоченные stable attachment IDs,
   immutable content hashes и explicit settings. Повтор с иными файлами,
   порядком или settings — conflict. Старый text-only hash contract не менять
   без совместимого чтения старых receipts.
3. До native dispatch durable записать user input/attachment metadata,
   clientThreadId/clientMessageId, binding model/effort, accepted turn receipt
   и dispatch intent. Сохранить существующую atomic first binding + first
   receipt + queued turn transaction. Retention оригиналов должна переживать
   crash между каждым из этих действий.
4. Новые данные, которые прежний `normalizeChatBinding` отбросит при записи,
   хранить в versioned private sidecar либо обеспечить и доказать старому
   reader их round-trip. Сам факт «additive v2» такой гарантии не даёт.
   Sidecar — metadata/journal, не второй полный transcript; UI user text
   остаётся без внутреннего manifest с private paths.
5. Передавать original files в CLI tool environment минимально необходимым
   способом. Не использовать `--add-dir` для всего private state/credential
   root: этот параметр расширяет writable scope. Доказать чтение точного
   original в read-only/workspace-write modes без повышения sandbox/network.
6. Для images расширить launcher parser и argument builder только способом,
   поддерживаемым установленным stock CLI в exec **и** resume. Проверить
   serialized Responses inputs на локальном recording upstream. Если CLI
   metadata/transport не пропускают images, возвращать unsupported/unknown;
   App Server не добавлять ради этой функции.
7. Non-image документы/source/audio/video/archive доступны только как originals
   для запрошенной обработки проверенными tools. Не обещать native media
   understanding, не запускать автотранскрипцию, распаковку или выполнение.
8. Пропускать turn через существующий FIFO/admission. Вложения не меняют
   Voice task sidecars, model pinning, recovery, billing acknowledgement,
   rate-limit retry policy или credential redaction.
9. Разделить gateway accepted receipt, native session identity и evidence
   конкретного native turn. `nativeTurnId = sessionId` не является достаточным
   подтверждением. Сопоставлять launch/workload/CLI events и проверенный
   read-only native record, если его формат даёт такую возможность.
10. При lost acknowledgement после native acceptance рестарт и повтор того же
    HTTP payload возвращают существующий turn/неопределённый delivery status;
    второй native launch запрещён. Если CLI не предоставляет доказуемый
    per-turn idempotency/reconciliation, оставлять `delivery_unknown` и
    сохранённый input, а не обещать автоматический exactly-once recovery.
    Повторять можно только доказанно неотправленную попытку. Явное решение
    оператора о новой попытке выполнения — отдельная recovery operation.
11. Проверить старые receipts за пределом 500, crash после accepted/до
    session event, event/receipt write и completion write. Потеря записи из
    bounded registry не должна разрешать повтор старого native dispatch.
    Нужна durable acceptance ledger/tombstone, а не один recent-turn lookup.

### C4. UI вложений и предыдущие страницы истории

**Файлы:** новые `C/useChatAttachments.ts`, `C/ChatAttachments.tsx`,
`C/CodexChatPage.tsx`, `L/types.ts`, `L/gateway.ts`, CSS и E2E fixtures.

1. Picker, drop, image paste, preview, uploading/ready/error, remove/retry;
   attachment-only создание и продолжение. Stable IDs сохраняются при retry;
   список файлов и draft изолированы по chat/new-chat key.
2. Unknown delivery фиксирует exact pending payload до reconciliation.
   Поздний upload/reply не очищает новые drafts и не переносит файлы в другой
   чат. Отказ capabilities/HTTP/JSON сохраняет draft и оригиналы. После reload
   accepted attachments восстанавливаются из server metadata; pending
   recovery не должен зависеть только от React state.
3. Добавить Previous/Load earlier с existing opaque cursor contract, retry,
   cancellation при смене чата, merge по стабильному turn id и сохранением
   scroll anchor. SSE/latest refresh не удаляет уже загруженные старые страницы.
4. В первом переносе пагинация работает по подтверждённо доступной mirrored
   history. Сохранить существующий 200-turn runtime contract, но явно показывать
   partial/unknown completeness, если более ранние данные недоступны. Не
   объявлять весь чат пустым или полным по одной последней странице.
5. Нужный для старых записей read-only parser из A может расширить доступный
   диапазон только при доказанной схеме/provenance и без replay. Если требуется
   unlimited future history, оформить отдельную storage migration с cold
   pages/WAL и old-build round-trip test; не прятать её внутрь UI commit.
   Это явное ограничение первого переноса, а не заявление о восстановлении
   уже отброшенных 201+ ходов.
6. Conversation-level image/reference metadata и durable receipts из C3 живут
   независимо от окна 200 turns: history truncation не отменяет retention и
   не разрешает несовместимый text-only resume.

**Тесты C:** новые `neuraldeep-chat-attachments`/`capabilities`/`delivery` tests,
расширение launcher/adapter/registry/admission tests; отдельный
`neuraldeep-task-chat-evolution.spec.ts`. Переносить сценарии из полного
B → `854a420` diff с типизированными `TurnView` fixtures; заменить mother
App Server stubs на NeuralDeep fixtures и реальные boundaries.

Обязательные случаи: binary/image/document/source/audio/video/archive/unknown;
exact bytes/hash до CLI и после reload/download; upload interruption/retry;
count/size/message quota/instance quota и concurrent uploads; границы с/без
Content-Length; expiry draft/retained original; symlinks и corrupt metadata;
missing original; unknown/unsupported image model; model/catalog revision
changes; historical images вне текущей страницы; resume payload/base64 limit;
реальный guarded upload route больше default proxy limit; restart и lost ack
с assertion **native launch/turn count = 1**; read-only/cross-instance denial.

**Demo/Gate C:** desktop/mobile picker/drop/paste, attachment-only send,
unsupported image с сохранённым draft, original history download, previous
pages после failed fetch и refresh. Fixture transport pass не доказывает
понимание изображения моделью. Для заявляемой end-to-end provider capability
нужен разрешённый smoke с синтетическими файлами и точной моделью; без него
соответствующая строка остаётся unverified и dispatch блокируется.

**Откат C:** предыдущая проверенная сборка; originals и referenced metadata
сохранить. После запуска старой сборки cleanup не должен удалять неизвестные
ей ссылки. Если безопасная запись старым reader не доказана, fallback
оставляет затронутые новые записи read-only до forward repair; откат только
UI не выдавать за полноценную backward compatibility.

## 10. M — исправления памяти отдельным коммитом

**Файлы:** `scripts/pritha_python_compat.py`, `embed-memory.py`,
`semantic-search.py`, `query-memory.mjs`, `memory-status.mjs`,
`golden-checks.mjs`, `healthcheck.mjs`; проверить
`embed-memory-neuraldeep.mjs` и `tests/neuraldeep-memory-runtime.test.mjs`.

1. Перенести env resolution по mother memory commit с локальным precedence:
   explicit process env сильнее файлов; сначала требуемые path settings,
   затем выбор instance indexes, затем ML/provider imports по необходимости.
2. Python helper загружает только allowlisted path configuration. Не делать
   полный import `.env` и не переносить unrelated credentials в ML процесс.
3. Сохранить локальные NeuralDeep embeddings/provider selection и fingerprint
   existing embeddings. Не заменять кастомный semantic-search вариантом матери
   и не пересчитывать всё через другой provider автоматически.
4. Fixtures: два code/state roots, `.env`/`.env.local`/runtime.env precedence,
   direct Python и Node entrypoints, отсутствующий index, отсутствие лишнего
   ML import/secret loading, сохранение валидных embeddings.

**Данные:** меняется resolution, не содержимое memory sources. Любая нужная
пересборка — только своего generated index после snapshot; не копировать DB
между экземплярами. **Demo:** direct query/status выбирают ожидаемый index.
**Gate M:** memory fixtures и targeted self-test stages проходят без provider
вызовов. **Откат:** revert resolution patch и только затронутый generated index;
новые authored Markdown, user memory и credentials сохраняются.

## 11. S — числовые Settings отдельным коммитом

**Файлы:** новый `src/lib/settings/runtime-numbers.ts`,
`src/components/settings/CodexSettingsSection.tsx`, при необходимости
`VoiceSettingsSection.tsx`, `src/app/api/realtime/runtime-settings/route.ts`,
`src/app/settings/page.tsx`; numeric unit/route/E2E tests.

1. Взять pure contract матери только для полей NeuralDeep:
   `codexTimeoutMs` 10 000..3 600 000 ms,
   `codexPromptTokenBudget` 4 000..120 000,
   `codexMaxPlanSteps` 1..10. Сверить эти диапазоны с runtime перед coding.
   `codexAppThreadMaxTurns/MaxAgeHours` не добавлять в Save payload: локальный
   API намеренно возвращает `legacy_codex_app_setting_unsupported`.
2. Editable drafts — strings, включая пустую строку. Парсить только на Save,
   показывать field error, не clamp/reset на каждый keypress.
3. Timeout UI поддерживает seconds/milliseconds: до трёх десятичных знаков
   секунд, integer milliseconds без потери точности (`10.001 s = 10001 ms`).
   Unit switch не создаёт новый timer/delay и не меняет dispatch semantics.
4. API валидирует JSON object, finite safe integers/types/ranges до любой
   записи. Запретить `null`, boolean, numeric string, arrays, NaN/Infinity,
   дроби и out-of-range согласно контракту. Malformed JSON не превращать в `{}`.
5. Сохранить drafts после network/HTML/JSON/API failures; saved state обновлять
   только после валидного success. Учитывать существующие dirty indicators
   и Apply button. Billing confirmation, model/effort validation, ultra-inline
   constraint и sandbox/network coupling сохраняются.
6. `deepTaskPrimaryTransport` остаётся `codex-cli`. Settings status читает
   текущие данные; изменение глобальной модели не меняет bound chats/topics.

**Данные:** формат сохранённых numeric значений остаётся прежним; автоматической
перезаписи текущих настроек нет. **Тесты/Demo:** empty draft, units/exact ms,
bounds, rejected saves и success/reload на desktop/mobile; сохранность модели,
billing gate и CLI routing. **Откат:** предыдущий UI/API; корректные сохранённые
значения остаются совместимыми. Не восстанавливать весь старый settings file
поверх более позднего выбора пользователя.

## 12. Общий набор проверок и порядок запуска

Все команды реализации выполняются в isolated worktree с заранее проверенным
test env. Не запускать эти команды с default production paths/baseURL.

| Уровень | Проверка |
| --- | --- |
| Каждый этап | Новые meaningful unit/contract fixtures + существующие tests непосредственно затронутых модулей; typecheck; `git diff --check` |
| A/B/C candidate gates | Production build вне live `.next`; focused Playwright desktop/mobile; read-only/history/privacy; rollback fixture |
| Provider regression | `tests/neuraldeep-cli-runner.test.mjs`, `neuraldeep-responses-adapter`, `neuraldeep-provider-errors`, account/usage/config tests |
| Voice regression | `neuraldeep-admission-coordinator`, `neuraldeep-task-chat-registry`, `neuraldeep-voice-task-links`, `neuraldeep-task-chat-voice-invariants` |
| UI/Settings | Task Chat UI, Codex Chat, NeuralDeep billing tests; новый evolution spec и numeric Settings spec; принятая palette spec |
| Final full | `npm run test:unit`, `npm --prefix interfaces/control-center run typecheck`, isolated production build, `node scripts/privacy-audit.mjs --strict`, NeuralDeep secret/network audits, isolated `node scripts/self-test.mjs` |
| Live acceptance | Существующие session/parallel acceptance scripts только после проверки их env/target и разрешения живых provider запросов; synthetic data, explicit model |
| Release | Strict health-v2 identity, `/voice`, `/agents`, `/task-chat`, `/settings`, `/codex` redirect/query и все referenced JS chunks |

Проверять full suite последовательно: не совмещать несколько тяжёлых builds и
live health, чтобы не смешивать resource contention с дефектами. Не повторять
успешный полный прогон без новых изменений/оснований. Не отключать test для
получения green. Skip платного/живого сценария отмечается как unverified,
а не pass. Viewport 390px не является проверкой реального телефона/clipboard.

## 13. Выпуск, rollback и условия остановки

1. Зафиксировать итоговый local commit и source manifest; пройти R0/A/B/C/M/S
   gates. Candidate из inert test env не переносить как production artifact.
2. Подготовить свежую instance-specific staging build, dependency evidence,
   private recovery snapshot, точные protected fingerprints и previous build.
   Долгие active задачи сначала должны завершиться; pending/approval/input
   состояния сохранить. Перед миграцией и switch подтвердить quiescence или
   протестированный compatibility protocol; архивирование не используется
   для остановки задач.
3. Непосредственно перед первым production lifecycle действием получить
   отдельное подтверждение согласно
   [локальному staged-release workflow](../07_workflows/control-center-staged-release.md):
   «Immediately before the first real service action, obtain explicit operator
   approval». Одобрение плана/кода/палитры не считается этим действием.
4. Выпустить только NeuralDeep через проверенный R0 путь и его manager:
   confirmed stop → staged swap → managed start → strict identity/pages/chunks
   → проверить сохранённую историю, model binding и account/Voice diagnostics.
   Основная Pritha и другие экземпляры не входят в этот rollout.
5. При неуспешных health/identity/isolation проверках остановить rollout.
   Confirmed manager stop обязателен до restore previous build. Ownership
   refusal/unconfirmed stop сохраняет обе сборки и требует operator action;
   raw kill по порту, live-build overwrite и success-report запрещены.
6. Data rollback использует migration journal и field-level compare-and-swap.
   Не откатывать unrelated новые turns, Voice topic state, receipts, settings,
   credentials или originals. Конфликт с последующей активностью означает
   narrow forward repair/read-only affected record, а не full-state restore.
7. После recovery проверить реальное rollback health, старый reader/writer и
   отсутствие повторных CLI launches. Не удалять previous build до завершения
   всех gates и принятой точки восстановления. Private backup path хранится
   только в private manifest, в tracked report — ссылка на его logical id.

Останавливать соответствующий этап при неподтверждённой identity, потере
receipts/originals, duplicate dispatch, обходе Voice admission, credential
leak, model/provider substitution, необъяснённой порче registry либо провале
rollback rehearsal. Unknown image support блокирует только несовместимую
отправку; рабочий text-only NeuralDeep path должен сохраняться.

## 14. Очередь коммитов и критерий завершения

| Порядок | Коммит/результат | Зависимость |
| --- | --- | --- |
| 0 | P0: pinned source, protected dirty changes, isolated fixtures и baseline evidence | Начало |
| 1 | R0: local staged source path + confirmed-stop rollback tests | До любого production release |
| 2 | A1: storage/history contract и identity proofs | P0 |
| 3 | A2: Restore access + migration/crash/rollback fixtures | A1 |
| 4 | B1: local archive + verified alias projection | Gate A |
| 5 | B2: full assistant retention + Copy response | B1 |
| 6 | C1: NeuralDeep model/transport capability contract | Gate B |
| 7 | C2: private original storage + guarded routes | C1 |
| 8 | C3: durable attachment delivery через CLI/admission | C2 |
| 9 | C4: attachment UI + previous pages + complete C acceptance | C3 |
| 10 | M: instance-aware memory entrypoints | Gate C; отдельно от chat migration |
| 11 | S: numeric Settings drafts/API | M; отдельно от model/transport изменения |
| 12 | Final integration, local delivery report, managed release | Все gates + lifecycle approval |

Для каждого этапа в evidence записываются: mother SHA → local SHA, touched
files, data/API change, migration/backup logical id, fixtures и фактические
команды/результаты, operator demo, release status, rollback status и exclusions.
Нельзя отметить этап выполненным только по существованию кода.

Итоговый delivery report должен отдельно перечислить сохранённые отличия:
CLI-only inference, NeuralDeep Responses normalization, mirrored history,
Voice topic/generation/model binding, shared admission, account/Keychain/usage,
числовые Settings без App-specific полей и локальные dependency/palette
настройки. Отдельно указать доступный history range, unknown model capability,
непроверенные live сценарии и peer/physical-phone status.

Перенос завершён, когда заявленные функции проверены на конкретном NeuralDeep
candidate, существующие provider/Voice сценарии сохраняются, data rollback
отрепетирован и локальный release подтверждён фактическими checks. До этого
использовать точные статусы `planned`, `implemented`, `verified-candidate`,
`deployed`; не смешивать их.
