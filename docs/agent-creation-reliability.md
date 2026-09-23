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
| WP3: deadlines | Запланирован | — |
| WP4: применимое исследование | Запланирован | — |
| WP5: effective settings | Запланирован | — |
| WP6: независимые Trials | Запланирован | — |
| WP7: интерфейс и инструкции | Запланирован | — |
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
