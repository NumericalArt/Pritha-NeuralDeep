# Pritha NeuralDeep — installation instructions for coding assistants

On “set up and start this project”, “start Pritha”, or equivalent:
1. Read START_HERE.md. Work from this folder; do not use another Pritha checkout.
2. Run `node scripts/bootstrap.mjs prepare --profile neuraldeep`.
3. Run `node scripts/bootstrap.mjs start --profile neuraldeep` in a persistent terminal.
4. Show the localhost address and direct the user to Settings → NeuralDeep.
Never ask for API keys in chat; use the local settings form. Do not import sibling
agents, private histories or host credentials. Do not enable Tailscale/autostart.
The installation assistant can be Cursor, Codex, Claude Code or another tool.
Codex CLI is still a runtime dependency for Pritha's internal agent execution.

Этот файл — короткий рабочий контракт, который Codex загружает в каждую задачу.
Полный свод инженерных правил и правил авторинга знаний лежит в
[`docs/engineering-rules.md`](docs/engineering-rules.md). Перед работой в
перечисленных ниже областях прочитай соответствующий раздел полностью:

| Область работы | Раздел `docs/engineering-rules.md` |
| --- | --- |
| Создание, исследование, scaffold, delivery child agents | «Agents Mother» |
| Intake: Telegram, ссылки, медиа, тексты | «Обработка входящих медиа и ссылок» |
| Оценка новой информации, assessments | «Экспертная оценка новой информации» |
| Новые Markdown-артефакты, frontmatter, пути | «Форматы артефактов» |
| Устаревание и замещение знаний | «Актуальность и замещение знаний» |
| Правила других агентских сред | «Совместимость агентских сред» |
| Изменение `04_standards/` | «Когда обновлять стандарты» |
| `10_wiki/` | «Generated LLM Wiki Layer» |
| Good State Baseline | «Good State Baseline» |

## Назначение

Pritha — локальная фабрика агентов и база знаний. Она превращает входящий
материал в проверяемое знание (сравнение с альтернативами, стандарты, решения)
и создаёт специализированных child agents по контракту. Публичное имя — Pritha;
историческое имя Techscope допустимо во внутренних путях, переменных и CLI.

## Корни, состояние и агенты

- Корень кода: `TECHSCOPE_ROOT`, иначе Git root, иначе текущий каталог.
- Состояние экземпляра: `PRITHA_STATE_ROOT`. Generated memory, setup, private
  data, очереди, логи, audit, snapshots и live agent registry пишутся только туда.
- Каталог child agents: `PRITHA_AGENT_PARENT`; Control Center не показывает
  агентов других экземпляров Pritha.
- Live contracts, Outcome Specs, research, reports и profiles новых агентов —
  instance-local данные в `<PRITHA_STATE_ROOT>/agents/` (fallback — gitignored
  `.private/agents/`). Tracked `11_agents/` — только история и reference-материалы.
- Не зашивать абсолютные пользовательские пути в скрипты, launchd-шаблоны,
  manifest-файлы и generated scaffold.
- Не копировать в новых агентов секреты, `.env`, токены, пользовательские данные,
  `.queue`, `.memory`, `.logs` или внутреннее состояние Pritha.

## Знания

- Authored Markdown — источник истины. SQLite/FTS/relations/embeddings —
  generated индексы, пересобираются `node scripts/rebuild-memory.mjs`.
- Каждый новый артефакт начинается с YAML frontmatter по шаблонам `08_templates/`.
- Сырые входящие материалы (`00_inbox/`, `01_sources/notes/`,
  `01_sources/signals/`, `12_marketing/`) — локальные данные экземпляра. Они
  индексируются локально, но не коммитятся; в Git остаются только README и
  `01_sources/registries/`.
- Курируемые знания (`02_briefs/`–`08_templates/`, `10_wiki/`, `11_agents/`)
  публикуются вместе с платформой.
- `privacy: local-private` и `memory_domain: user-model` не попадают в tracked
  Markdown или `.memory/techscope.sqlite`; для них `.private/user-memory/` и
  `.memory-private/`.

## Правила качества

- Разделять факты, мнения, маркетинг и гипотезы; не принимать материал как истину.
- Фиксировать даты источника (выход, обновление, получение, проверка) и
  версионный контекст софта, моделей, API и протоколов.
- Предпочитать первоисточники; вторичный источник помечать явно.
- Записывать trade-offs: стоимость, lock-in, поддержка, безопасность, DX.
- Не делать стандарт без сравнения с альтернативами; при нехватке данных —
  open question, а не вывод.

## Trigger phrases

- `запусти проект`, `стартуй Pritha`, `setup`, `first run`, `bootstrap`, `start`:
  workflow `07_workflows/first-run-setup.md`, CLI
  `node scripts/bootstrap.mjs prepare --profile neuraldeep`.
- `проверь проект`, `self test`, `health`: `node scripts/self-test.mjs`.
- `создай агента`, `new agent`, `interview`: `node scripts/pritha.mjs interview`.
  Interview proposal-first: сначала наблюдаемый результат, пользователь,
  интерфейс, границы v1 и риски; остальное Pritha предлагает сама из стандартов.

## Agents Mother: неизменяемые правила

Полные правила — раздел «Agents Mother» в `docs/engineering-rules.md`.

- Два отдельных документа с отдельным approval: `agent-contract` (устройство и
  границы) и `agent-outcome-spec` (что получит пользователь, Trials).
- Scaffold — только из контракта со статусом `accepted` и после research gates
  (память Pritha, первичная документация, GitHub-research по policy контракта).
  Найденный на research-этапе код нельзя clone/install/execute/vendor.
- Реализация — только в ветке `pritha/build-*` в disposable worktree. Executor
  не меняет Outcome Spec, approvals, budgets, ledger, verifier и protected Trial
  inputs; не делает push, merge, deployment, service enablement и запись секретов.
- `verified`, `awaiting_acceptance`, `accepted`, merge-ready и deployment-ready —
  разные состояния. Приёмка — только явным решением пользователя.
- Каждый child `AGENTS.md` содержит harness evolution protocol. Scaffold
  модульный: копируются только слои, выбранные контрактом.
- Автозапуск, launchd, cron, heartbeat, deployment и долгоживущие процессы —
  только после отдельного явного подтверждения пользователя.

## Операции и доступ

`self-test` и `queue-health` — ручные проверки. Не включать cron, heartbeat,
launchd, Telegram, Realtime, background service или scheduled pulse без явного
подтверждения пользователя.

Production и Tailscale-facing Control Center не запускаются из временной
Codex-сессии. Использовать только `scripts/control-center-runtime.mjs` и
workflow `07_workflows/control-center-staged-release.md`: никаких raw kill по
порту, live-build swap, cron или network health watchdog. `plan`/`status`
read-only; `install`/`start`/`stop`/`restart`/`uninstall` требуют отдельного
непосредственного approval и `--yes`.

Если пользователь просит `tailscale`, `private access`, `phone access` или доступ к локальному Control Center с другого доверенного устройства, использовать `docs/tailscale-private-access.md` и `scripts/tailscale-setup.mjs`. По умолчанию Codex может выполнять только read-only команды:

```sh
node scripts/tailscale-setup.mjs plan --app control-center
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs auth-status
```

Не запускать реальные mutating Tailscale actions без separate explicit user approval непосредственно перед действием: `install --yes`, `serve --yes`, `off --yes`, `tailscale up`, auth-key команды, Funnel/public exposure, launchd/cron/service changes. Codex должен объяснить пользователю, что peer access считается непроверенным, пока Tailscale URL не открыт с телефона или другого trusted peer device. Реальные Tailscale URLs, tailnet names, device names и auth keys не записывать в tracked Markdown, reports, setup state intended for Git или `.memory`; использовать placeholders.

## Good State

Перед изменением Pritha, её runtime, интерфейсов, памяти, harness или шаблонов
child agents сделать пропорциональную сверку с принятыми состояниями:
`node scripts/good-state-alignment.mjs --scope "<affected surface>" --limit 3`.
Подтверждение нужно только при материальном конфликте с baseline. Позитивный
acceptance-сигнал пользователя — повод предложить
`07_workflows/pritha-good-state-baseline.md`.

## Язык

Основной язык проекта — русский. Имена файлов — ASCII kebab-case.
