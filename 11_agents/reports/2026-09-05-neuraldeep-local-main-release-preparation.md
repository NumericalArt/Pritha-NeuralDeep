---
id: neuraldeep-local-main-release-preparation-2026-09-05
type: agent-deployment-report
status: prepared-awaiting-lifecycle-approval
created: 2026-09-05
updated: 2026-09-05
topics: [neuraldeep, control-center, local-main, palette, staged-release, rollback]
tools: [Git, Node.js, Next.js, Playwright]
sources: [operator-local-neuraldeep-consolidation-request-2026-09-05, operator-palette-acceptance-2026-09-05]
related:
  decisions: [docs/ui-design/2026-09-05-neuraldeep-color-transfer.md]
  workflows: [07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: agent
  id: pritha-neuraldeep
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Neural Deep: сведение локального main и подготовка выпуска

## Границы

Только экземпляр `neuraldeep-main`, порт 7420. Другие checkout, рабочие
экземпляры и интерфейсы дочерних агентов не изменялись. GitHub/origin не
создавался; fetch/push из основной Pritha не выполнялся. Tailscale Serve и
production launchd не перенастраивались.

До коммитов сохранены private backup исходного diff, refs, статуса и новых
авторских файлов. Runtime `private/` исключён из Git; его содержимое сохранено
на месте. История чатов, настройки, credentials и пользовательские данные не
включались в коммиты или проверочную копию.

## Сведённые изменения

Исходный `main`: `88a69c89ae16d21de4d5bd021d4a6f0b5a4599f4`.
Обе локальные ветки `integration/neuraldeep-cli` и
`integration/neuraldeep-task-chat-voice` уже входили в него: уникальных
неперенесённых коммитов нет. Дополнительный integration worktree чистый и
оставлен на месте. Удаление веток, reset и stash не применялись.

| Коммит | Содержание |
| --- | --- |
| `e8be0aa` | Сохранённые функциональные правки Task Chat, истории и Settings |
| `ce88ae0` | Принятая графитовая палитра, исходная звезда, спецификация, screenshot и визуальные тесты |
| `cb207a6` | Сохранённые пути локального поиска; исключение runtime private-файлов |
| `b7490a5` | Существовавший проект плана дальнейшего Task Chat, без реализации будущих возможностей |
| `07c234b` | Локальный pinned staged release, проверка страниц/chunks/build identity и безопасная остановка перед откатом |
| `28cc130` | Канонический путь CLI: устранение пустого Usage-ответа при запуске через filesystem alias |

Документ дальнейшего Task Chat сохраняет статус `proposed`. Его наличие не
означает, что все описанные в нём будущие возможности реализованы.

## Проверки

- Production-сборка настоящего приложения и TypeScript: pass в одноразовой
  проверочной копии с отдельным state-root, inert agent, пустым Keychain service
  и loopback-only provider endpoint. Рабочая production `.next` не менялась.
- Полный unit-прогон: 576/576; после CLI regression tests полный self-test
  повторно выполнил 578/578, quality gate и восстановление embeddings: pass.
- 13 тестов обновлятора: локальная работа без origin и любого remote access,
  clean-main/full-SHA guards, отказ при изменении state, успешный выпуск,
  откат после ошибки запуска, недоступного chunk и неверного build ID;
  сохранение обеих сборок при неподтверждённой остановке.
- Новый CLI-тест сначала воспроизвёл пустой ответ через symlink, затем прошёл
  после исправления. Usage API проверочной копии вернулся к HTTP 200 с валидным
  контрактом. Импорт CLI по-прежнему не запускает main.
- Privacy audit и `git diff --check`: pass.
- Финальный browser-прогон: 17 pass, 4 skipped (живые managed-agent сценарии
  отсутствуют в inert fixture), 0 fail. Включены Task Chat/recovery/history,
  агентские панели, настройки NeuralDeep billing/model capabilities, Voice,
  мобильная навигация, 75 geometry cases на шести ширинах и Canvas fallback.
- Strict private HTTPS health прежней production-сборки: 6 страниц, 13
  JavaScript chunks, 0 ошибок. После переключения эта проверка повторяется.

Ранние прогоны на копии без `.git` и с общими instance env для всех unit tests
были некорректны; они не используются как итоговое evidence. Повторный прогон
в полноценном disposable Git checkout прошёл полностью. Изолированный
outcome-delivery CLI test однажды упал, затем прошёл отдельно и в двух полных
прогонах. Подавление тестов или их assertions не применялось.

Первая чистая UI-сборка была построена до подключения inert agent; поэтому её
статические страницы и runtime API имели разные тестовые данные. Финальная
проверочная сборка использует одинаковый instance env при build/start.

## Ограничения и accepted behavior

Геометрия, шрифты, анимация, звезда и palette acceptance не пересматривались.
Подробные измерения шести ширин и известный исходный overflow на синтетических
длинных путях сохранены в palette decision. Для проверки отсутствующих
managed-agent/billing сценариев production actions и платный inference не
запускались.

Сохраняются существующие build warnings о динамических filesystem imports и
warning окружения о рекомендованной версии Python. Изолированный preview не
устанавливается как launchd service; соответствующие сообщения runtime status
не являются проверкой production ownership. Встроенный self-test также
показывает legacy service warnings; чужие сервисы не исправлялись.

## Выпуск ещё не выполнен

`update --source local --expected-commit <full-SHA> --plan` проходит на чистом
локальном `main`. Перед применением план необходимо повторить с окончательным
HEAD, включающим этот отчёт. Переход к production stop/start допускается только
после отдельного непосредственного подтверждения пользователя.

Обновлятор собирает `.next-pritha-staging`, сохраняет предыдущую сборку и
проверяет protected-state fingerprints. После подтверждённой остановки только
нужного сервиса переключает сборку, запускает её и проверяет release identity,
шесть страниц и JavaScript chunks. При ошибке использует bounded rollback;
если остановка для отката не подтверждена, файлы потенциально живой сборки не
заменяются.

Текущий private HTTPS endpoint отвечает идентичностью `neuraldeep-main`, но
пока обслуживает прежнюю production-сборку. После выпуска обязательны повторные
локальные и Tailscale health/page/chunk проверки. Доступ с другого устройства
считается подтверждённым только после открытия ссылки пользователем на trusted
peer. Реальный URL хранится только в private evidence и сообщении пользователю.
