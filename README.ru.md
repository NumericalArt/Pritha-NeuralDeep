# Pritha NeuralDeep

Pritha ND создаёт и развивает агентов через **Codex CLI → локальный Responses
adapter → выбранную модель NeuralDeep**. Task Chat, Voice и Agents Mother
сохраняют отдельные задачи, историю и учёт расхода в private state экземпляра.
Архитектура и установка см. [канонический README](README.md).

Создание агента начинается с двух документов: **Agent Contract** описывает
устройство, разрешения и границы; **Outcome Spec** — наблюдаемый результат,
демонстрацию и Trials. Они согласуются отдельно. Лимит бюджета сохраняет ту же
сборку: можно добавить токены, время или итерации и продолжить её с прежним
расходом. Проверка результата, приёмка пользователем и запуск сервиса — разные
действия.

- [Roadmap NeuralDeep](07_workflows/2026-09-05-pritha-neuraldeep-improvement-roadmap.md)
  и [отчёт выполнения](07_workflows/2026-09-08-neuraldeep-roadmap-execution.md).
- [Task Chat и Voice: параллельная работа](docs/neuraldeep-task-chat-concurrency-implementation.md).
- [Большая история и CLI-аудит](docs/neuraldeep-large-history-adaptation.md).
- [Управляемый выпуск](07_workflows/control-center-staged-release.md).

Для локальной диагностики: `node scripts/self-test.mjs`. Подготовка свежего
checkout и memory index: `node scripts/bootstrap.mjs prepare --profile local`.
Обновление ND использует её собственный manager и проверенный local commit;
выпуск материнской Pritha сам по себе NeuralDeep не обновляет.
