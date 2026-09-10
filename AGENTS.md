---
id: AGENTS
type: artifact
status: processed
created: 2026-06-01
updated: 2026-07-13
topics:
  - privacy-preserving-intake
tools:[]
sources:
  - source-b7b25b93-4d88-4793-839d-8dcb96d902fb
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
    - 07_workflows/pritha-good-state-baseline.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
source_type: telegram
source_class: telegram
ingested_at: 2026-06-01
processed_at: 2026-06-01T21:03:38.467Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-b7b25b93-4d88-4793-839d-8dcb96d902fb
---

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

The following sections preserve the engineering knowledge and authoring rules.
They do not override the distribution's clean-install instructions above.


# Artifact: source-b7b25b93-4d88-4793-839d-8dcb96d902fb

Date: 2026-06-01
Status: processed
Source class: telegram
Retention: source-purged

## Назначение проекта

Этот проект используется как рабочая среда для отбора, обсуждения и фиксации технологических идей, практик, библиотек, архитектурных подходов и стандартов для будущих разработок.

Пользователь может помещать сюда:

- произвольные тексты;
- ссылки на статьи, сайты, документацию, video/audio platforms и видео;
- выдержки из Telegram, Medium, блогов, GitHub, документации и других источников;
- собственные мысли, вопросы и гипотезы.

Задача агента: превратить входящий материал в проверяемое знание, сравнить его с альтернативами, оценить применимость и при необходимости оформить как технологический стандарт или решение.

## Рабочий каталог и расположение агентов

Канонический публичный корень проекта - Pritha. Историческое имя Techscope
остается допустимым для внутренних путей, переменных, памяти, knowledge-base,
старых отчетов и совместимых CLI-команд. GitHub/local checkout для текущей
линейки должен называться `NumericalArt/Pritha-NeuralDeep`, если нет отдельного
миграционного blocker.

Канонический корень кода определяется env-first:

1. `TECHSCOPE_ROOT`, если переменная окружения задана.
2. Git root текущего checkout.
3. Текущий рабочий каталог как fallback.

Локальное runtime-состояние отдельного экземпляра определяется
`PRITHA_STATE_ROOT`. При заданной переменной все generated memory, setup,
private data, queues, logs, audit, snapshots, voice drafts и live agent
registry пишутся только во внешний state-root. Отсутствие переменной сохраняет
legacy layout внутри checkout исключительно для обратной совместимости, кроме
live agent memory: она всегда остаётся вне tracked `11_agents/`.
`PRITHA_AGENT_PARENT` задаёт единственный каталог sibling agents, доступный
этому экземпляру; Control Center не должен показывать агентов других Pritha.

Live contracts, outcome specs, research, reports, profiles и registry новых
child agents являются instance-local данными: они пишутся в
`<PRITHA_STATE_ROOT>/agents/`, а при отсутствии внешнего state-root — только в
gitignored `.private/agents/`. Tracked `11_agents/` содержит общую платформенную
историю и reference-материалы; новые child-agent артефакты не добавляются туда
без отдельного явного promotion/review решения.

Не зашивать абсолютные user-specific пути в исполняемые скрипты, launchd-шаблоны, manifest-файлы и generated scaffold. Исторические Markdown-артефакты могут содержать старые пути как контекст миграций, но не должны быть источником runtime-конфигурации.

Все новые агенты, создаваемые Pritha, должны размещаться в
`PRITHA_AGENT_PARENT`, если пользователь явно не указал другой путь. При
отсутствии переменной используется родитель `TECHSCOPE_ROOT`.

- `<parent-of-TECHSCOPE_ROOT>/Pritha` — агент-копилка и фабрика агентов;
- `<parent-of-TECHSCOPE_ROOT>/<agent-name>` — отдельный создаваемый или анализируемый агент;
- `<parent-of-TECHSCOPE_ROOT>/Techscope-migration-backups/` — резервные копии миграций.

Если checkout еще называется `Techscope`, это считается миграционным состоянием
совместимости, а не новым публичным именем проекта.

Не копировать в новых агентов секреты, `.env`, токены, приватные credentials, пользовательские данные, `.queue`, `.memory`, `.logs` или внутреннее состояние Pritha без отдельного явного решения.

## Главный рабочий цикл

1. Принять материал во входящий буфер.
2. Зафиксировать источник, дату добавления, дату публикации/выхода/обновления источника, версию технологии или софта при наличии, краткий контекст и исходную гипотезу.
3. Извлечь ключевые утверждения, практики, риски и открытые вопросы.
4. При необходимости проверить свежесть и первоисточники через интернет.
5. Сравнить материал с уже сохраненными артефактами по тем же topics/tools.
6. Явно определить, подтверждает ли новая информация старые выводы, уточняет их, противоречит им или делает их устаревшими.
7. Создать `signal` draft и для значимых материалов выполнить Codex-assisted refinement в текущем Pritha/Codex thread.
8. Обсудить материал с релевантными экспертными ролями из `06_subagents/`.
9. Сравнить идею с существующими стандартами в `04_standards/` и решениями в `05_decisions/`.
10. Сформировать один из результатов:
   - assessment в `03_reviews/`;
   - brief в `02_briefs/`;
   - review в `03_reviews/`;
   - новый или обновленный стандарт в `04_standards/`;
   - decision record в `05_decisions/`;
   - архивирование без внедрения в `09_archive/`.

## Правила качества

- Не принимать материал как истину без разделения на факты, мнения, маркетинг и гипотезы.
- Для быстро меняющихся тем проверять актуальность и дату источников.
- Всегда фиксировать временную метку источника: когда вышел материал, когда была обновлена документация, к какой версии относится информация, когда мы ее получили и когда проверили.
- Для софта, моделей, API, библиотек и протоколов указывать версионный контекст: release/version/tag/commit/spec date, если он доступен.
- Проверять temporal compatibility: совместим ли вывод с текущей датой, текущей версией технологии и более свежими источниками.
- Предпочитать первоисточники: официальную документацию, спецификации, репозитории, changelog, RFC, статьи авторов технологии.
- Если источник вторичный, явно отмечать это.
- Всегда фиксировать trade-offs: стоимость внедрения, vendor lock-in, сложность поддержки, риски безопасности, влияние на DX, влияние на скорость разработки.
- Не превращать интересную идею в стандарт без сравнения с альтернативами.
- Если данных недостаточно, оформлять вопрос как open question, а не как вывод.
- Сохранять результат так, чтобы через несколько месяцев было понятно, почему решение было принято.

## Trigger phrases и first-run setup

Если пользователь открывает свежий checkout и пишет `запусти проект`, `стартуй проект`, `стартуй Pritha`, `начни Pritha`, `setup`, `first run`, `bootstrap` или `start`, действовать по workflow `07_workflows/first-run-setup.md`. Такая фраза считается явной командой на безопасный локальный bootstrap: создать локальный setup-state, установить выбранные локальные зависимости, пересобрать SQLite memory index, пересобрать embeddings и проверить semantic memory. CLI fallback:

```sh
node scripts/bootstrap.mjs prepare --profile neuraldeep
```

Если пользователь пишет `проверь проект`, `self test` или `health`, запускать или предлагать:

```sh
node scripts/self-test.mjs
```

Если пользователь пишет `создай агента`, `new agent` или `interview`, переходить к Pritha interview:

```sh
node scripts/pritha.mjs interview
```

Interview должен быть proposal-first: сначала выяснить наблюдаемый конечный
результат, пользователя, интерфейс или headless input/output, границы v1 и
существенные риски. Runtime, memory, tools, research, Git-режим, бюджеты и
coverage Pritha предлагает сама из стандартов и задаёт дополнительный вопрос
только когда ответ materially меняет результат или необратимое действие.
Interview создаёт два разных authored artifacts: архитектурный
`agent-contract` и пользовательский `agent-outcome-spec`; их approval нельзя
смешивать.

Если пользователь просит `tailscale`, `private access`, `phone access` или доступ к локальному Control Center с другого доверенного устройства, использовать `docs/tailscale-private-access.md` и `scripts/tailscale-setup.mjs`. По умолчанию Codex может выполнять только read-only команды:

```sh
node scripts/tailscale-setup.mjs plan --app control-center
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs auth-status
```

Не запускать реальные mutating Tailscale actions без separate explicit user approval непосредственно перед действием: `install --yes`, `serve --yes`, `off --yes`, `tailscale up`, auth-key команды, Funnel/public exposure, launchd/cron/service changes. Codex должен объяснить пользователю, что peer access считается непроверенным, пока Tailscale URL не открыт с телефона или другого trusted peer device. Реальные Tailscale URLs, tailnet names, device names и auth keys не записывать в tracked Markdown, reports, setup state intended for Git или `.memory`; использовать placeholders.

Если последний `.techscope-setup.json` имеет `status: completed-with-warnings`, при следующем заходе в Codex thread проактивно предложить `node scripts/self-test.mjs` и коротко перечислить warnings. Не включать Telegram, Realtime, Tailscale, launchd, cron, heartbeat или другие долгоживущие процессы без явного подтверждения пользователя.

## Операционная самопроверка

При запросе пользователя о состоянии проекта, при работе над `scripts/`, `launchd/`, `.githooks/`, `operations/`, memory/indexing infrastructure или если `.memory/last-self-test.json` старше 7 дней, предлагать или запускать:

```sh
node scripts/self-test.mjs
```

`self-test` и `queue-health` являются ручными проверками по умолчанию. Не включать cron, heartbeat, launchd, background service или scheduled pulse без явного подтверждения пользователя и отдельного deployment/operations report. `queue-health` только сообщает stale/failed jobs и не меняет очередь автоматически.

Production и Tailscale-facing Control Center не запускаются из временной
Codex-сессии. Использовать только `scripts/control-center-runtime.mjs` и
workflow `07_workflows/control-center-staged-release.md`: никаких raw kill по
порту, live-build swap, cron или network health watchdog. `plan`/`status`
read-only; `install`/`start`/`stop`/`restart`/`uninstall` требуют отдельного
непосредственного approval и `--yes`. После UI-изменений обязательны strict
health с `/codex` и проверка JavaScript chunks.

## Good State Baseline

Если после внесенных изменений пользователь явно или неформально дает понятный позитивный acceptance-сигнал о текущем состоянии Pritha, выбранного clone, feature surface или child agent, нужно предложить или выполнить workflow `07_workflows/pritha-good-state-baseline.md`. Не привязываться к фиксированным фразам: сигнал может быть техническим, бытовым, эмоциональным или ласковым, если смысл ясен - это состояние нравится и его стоит сохранить.

Good State Baseline фиксирует не только git-точку, но и смысловую память о том, что именно понравилось: над чем работали в последнем цикле, какая конфигурация принята, какие проверки прошли, какие предупреждения допустимы, какие runtime/private файлы не входят в baseline и по каким признакам будущие изменения считаются регрессией.

Если такой позитивный сигнал приходит через browser Realtime Voice Control, Pritha должна использовать узкий tool `record_good_state_signal`, а не запускать Codex-задачу только ради фиксации сигнала. Этот tool создает private voice-confirmed Good State Alignment signal в Control Center. Голосовое подтверждение пользователя достаточно для такой private фиксации; Pritha не должна ссылаться на несуществующее UI-одобрение или говорить, что сигнал "не завершен". Полная tracked baseline фиксация - Markdown report, git commit, annotated tag, push and memory rebuild - является отдельным recovery-point workflow только если пользователь явно просит именно Git/tag baseline.

Перед любым изменением Pritha, ее runtime, интерфейсов, памяти, agent harness или child-agent шаблонов нужно выполнить пропорциональную сверку с Good State Baseline по стандарту `04_standards/pritha-good-state-alignment.md`. По умолчанию достаточно смотреть последние 3 релевантных accepted baseline для затронутого scope через:

```sh
node scripts/good-state-alignment.mjs --scope "<affected surface>" --limit 3
```

Эта сверка не должна превращаться в постоянные запросы подтверждения. Если изменение сохраняет accepted behavior, является добавлением, тестом, документацией или внутренним refactor без изменения пользовательского поведения, продолжать работу без прерывания пользователя. Явное подтверждение нужно только если планируемое изменение materially conflicts с недавним baseline: ломает зафиксированное поведение, удаляет принятую возможность, ослабляет privacy/security/runtime guardrail, обходит recovery anchor или делает невозможными проверки, которые baseline считал обязательными.

Канонический результат:

- tracked baseline report в `11_agents/reports/YYYY-MM-DD-pritha-good-state-baseline-short-title.md`;
- git commit с baseline report и связанными workflow/template изменениями;
- git tag вида `pritha-good-state-YYYY-MM-DD-short-title`;
- push commit and tag на GitHub, если пользователь не запретил публикацию;
- пересборка локальной памяти после записи Markdown.

Не записывать в tracked baseline report реальные секреты, auth keys, private credentials, raw Tailscale URLs, tailnet names, device-specific identifiers, `.env`, `.private`, `.memory-private`, `.queue`, `.logs`, `.snapshots` или пользовательские private memory values. Для приватных endpoints использовать placeholders и ссылаться на локальные setup state как на непубликуемый источник.

## GitHub publication and push

## Экспертные роли

Для сложных материалов агент должен мысленно или через доступных субагентов рассмотреть тему с разных углов. Базовые роли описаны в `06_subagents/`:

- `architecture.md`: архитектура, границы систем, масштабирование, сопровождаемость.
- `security.md`: безопасность, приватность, supply chain, доступы, секреты.
- `developer-experience.md`: удобство разработки, onboarding, локальная среда, тестирование.
- `product-pragmatist.md`: практическая ценность, срок внедрения, соответствие задачам.
- `research-scout.md`: поиск первоисточников, альтернатив, актуальности.
- `standards-editor.md`: превращение выводов в понятные правила и decision records.

## Форматы артефактов

- Входящие тексты: `00_inbox/texts/YYYY-MM-DD-short-title.md`.
- Входящие ссылки: `00_inbox/links/YYYY-MM-DD-short-title.md`.
- Заметки по источникам: `01_sources/notes/`.
- Смысловые выжимки: `01_sources/signals/YYYY-MM-DD-topic-signal.md`.
- Краткие разборы: `02_briefs/YYYY-MM-DD-topic.md`.
- Экспертные оценки: `03_reviews/YYYY-MM-DD-topic-assessment.md`.
- Сравнительные обзоры: `03_reviews/YYYY-MM-DD-topic.md`.
- Технологические стандарты: `04_standards/topic.md`.
- Решения: `05_decisions/YYYY-MM-DD-topic.md`.
- Контракты новых агентов: `11_agents/contracts/YYYY-MM-DD-agent-name-agent-contract.md`.
- Спецификации конечного результата: `11_agents/contracts/YYYY-MM-DD-agent-name-agent-outcome-spec.md`.
- Отчеты о создании агентов: `11_agents/reports/YYYY-MM-DD-agent-name-scaffold-report.md`.
- Отчеты outcome-driven delivery: `11_agents/reports/YYYY-MM-DD-agent-name-agent-delivery-report.md`.
- Отчеты о тестировании агентов и существующих проектов: `11_agents/reports/YYYY-MM-DD-project-name-agent-test-report.md`.
- Отчеты о передаче агента пользователю: `11_agents/reports/YYYY-MM-DD-project-name-agent-handoff-report.md`.
- Операционные отчеты агентов: `11_agents/reports/YYYY-MM-DD-project-name-agent-operations-report.md`.
- Отчеты о deployment-действиях агентов: `11_agents/reports/YYYY-MM-DD-project-name-agent-deployment-report.md`.
- Post-creation reviews агентов: `11_agents/reports/YYYY-MM-DD-project-name-agent-post-creation-review.md`.
- Good State Baseline для принятых пользователем состояний Pritha или child agents: `11_agents/reports/YYYY-MM-DD-pritha-good-state-baseline-short-title.md`.
- Профили child agents: `11_agents/profiles/agent-id.md`.
- Реестр созданных агентов: `11_agents/registry.md`.
- Маркетинговые тексты Pritha: `12_marketing/pritha/*.md`.

Каждый новый Markdown-артефакт должен начинаться с YAML frontmatter по шаблонам из `08_templates/`. Минимальные поля:

- `id`: стабильный идентификатор.
- `type`: `intake`, `brief`, `assessment`, `review`, `decision`, `standard`, `workflow`, `agent-contract`, `agent-outcome-spec`, `scaffold-report`, `agent-delivery-report`, `agent-test-report`, `agent-handoff-report`, `agent-operations-report`, `agent-deployment-report`, `agent-post-creation-review`, `agent-registry`, `child-agent-profile`, `signal`, `wiki-page`, `marketing-section`, `marketing-copy` или `template`.
- `status`: текущее состояние.
- `created`: дата создания.
- `updated`: дата последнего изменения.
- `topics`: ключевые темы.
- `tools`: технологии, модели, библиотеки или сервисы.
- `sources`: источники.
- `related`: связанные intake, briefs, assessments, reviews, decisions, standards или workflows.
- `supersedes`: какие старые артефакты новый материал заменяет или уточняет.
- `superseded_by`: каким новым артефактом заменен старый материал.
- `memory_domain` / `memory_domains`: семантический домен памяти по стандарту `04_standards/memory-domains.md`, если применимо.
- `subject`: объект с `kind` и `id`, если артефакт явно относится к Pritha, child agent, стандарту, workflow, marketing narrative или другому устойчивому субъекту.
- `privacy`, `retention`, `review_status`, `confidence`: использовать для новых curated artifacts, когда важно зафиксировать границы доступа, долговечность и степень уверенности.

Markdown-файлы являются canonical authored knowledge и главным GitHub source of truth для памяти. SQLite/FTS/relations/embeddings являются локальными generated indexes: они должны полностью пересоздаваться из tracked Markdown, `.memory/schema.sql` и bootstrap/rebuild scripts, но не требуют длинной Git-истории бинарных snapshot-файлов. Fresh clone или обновлённый checkout должен запускать `node scripts/bootstrap.mjs prepare --profile neuraldeep`, чтобы восстановить полноценную `.memory/techscope.sqlite` и embeddings локально.

`privacy: local-private` и primary `memory_domain: user-model` не должны попадать в tracked Markdown или `.memory/techscope.sqlite`; для этого использовать `.private/user-memory/` и `.memory-private/`, которые не коммитятся.

## Generated LLM Wiki Layer

`10_wiki/` используется как экспериментальный generated synthesis layer для навигации, гипотез и Obsidian graph view.

- `10_wiki/pages/` может содержать agent-generated wiki pages.
- `10_wiki/index.md` и `10_wiki/log.md` являются производными файлами слоя.
- Generated wiki pages можно использовать для поиска связей и первичной ориентации.
- Для выводов, стандартов и решений всегда возвращаться к исходным curated artifacts из `02_briefs/`, `03_reviews/`, `04_standards/`, `05_decisions/` и к указанным `sources`.
- Generated wiki page не может сама по себе быть основанием для изменения стандарта или решения.
- Если generated wiki page выглядит зрелой, следующий шаг: review или decision, а не прямое изменение `04_standards/`.

## Agents Mother

Pritha может создавать и развивать новых агентов по техническому заданию
пользователя. Перед созданием нового агента обязательно оформить
`agent-contract`: назначение, пользователь, функции v1, отложенные функции,
runtime family, интерфейс, deployment target, модель проактивности, память,
инструменты, права доступа, секреты, тесты, критерии готовности и план обучения
пользователя. Отдельно оформить `agent-outcome-spec`: видимый конечный результат,
journey или headless contract, deliverables, non-goals, примеры, demo и Trials.
Contract описывает устройство и границы; Outcome Spec — то, что пользователь
должен получить. Оба документа имеют отдельный review/approval.

Scaffold допускается только из `agent-contract` со статусом `accepted`.
Экспериментальный scaffold из `draft` возможен только с явным
`--allow-draft-scaffold` и должен быть помечен как исключение. Перед scaffold
нужно выполнить Pritha memory research по контракту; если выбранные API,
runtime, модели, deployment или внешние интеграции могли измениться, нужно
проверить первичную документацию и отразить это в scaffold report.

GitHub repository research для нового агента управляется контрактом. Контракт
должен выбрать policy `auto`, `required`, `registry-only` или `not-applicable`,
релевантные scopes `agent-harness`, `agent-memory`, `agent-evals`, `mcp-tools`,
`agent-skills`, `agent-interface`, `agent-voice`, `agent-operations` и adoption
mode `none`, `reference-only` или `selected-module`. Research сначала
ищет в curated registry, затем при разрешенной policy выполняет bounded online
discovery; полученный shortlist является только advisory evidence. На research
этапе нельзя clone, install, execute, vendor, link, activate найденный код или
автоматически менять registry. Shortlist ограничен десятью уникальными
репозиториями; все явно выбранные reference-only репозитории сохраняются в
пределах этого hard limit.

Для `reference-only` current evidence topic `github-repository-review` должен
точно соответствовать каждому canonical repository из контракта. Для
`selected-module` v1 разрешена ровно одна публичная repository и только
directory module: GitHub должен подтвердить exact pin, tree SHA и module path,
а внутри этой directory на том же pin должна быть module-local LICENSE или
поддерживаемый manifest. Evidence фиксирует license source URL, Git blob SHA,
SHA-256 содержимого, safely detected SPDX и `license_scope: module-local`.
License metadata текущего HEAD является только advisory и не заменяет эту
проверку. Security review, exact permissions, contract-specific eval, явное
user approval, current external evidence и synthesis с памятью Pritha также
обязательны.

Для `reference-only` и `selected-module` locked synthesis обязан содержать
`repository_adoption_recommendation: proceed | hold | reject`. Только `proceed`
делает полный research gate пригодным для scaffold; `hold` оставляет его
`pending`, а `reject` переводит overall gate в `failed`. Свободный текст
architecture decision не заменяет этот machine-readable выбор.

Invalid policy/mode и неизвестный или смешанный repository scope должны
завершаться до network request без эха входного значения; policy
`not-applicable` несовместима с любым adoption mode кроме `none`. Retrieval date
сама по себе не доказывает свежесть источника: нужны source published/updated
dates либо содержательный version context и temporal compatibility для каждого
авторизующего repository evidence item, а не только для topic в целом. Внешний
version-based fallback дополнительно требует locked
`temporal_compatibility_status: compatible`; значения `incompatible` и `unknown`
не авторизуют scaffold. Внешний
текст проходит redaction и prompt-injection quarantine; repository payload,
external evidence, synthesis и полный rendered research document защищаются
content locks. Evidence обязано совпадать с exact contract binding, а не только
иметь тот же topic id.

Vendored child skills должны проходить deterministic `skills-status` до чтения
`SKILL.md`. Manifest, lock и frontmatter связываются по hash, source paths,
version, source, trust/review/risk levels и required toolsets; shared redaction и
prompt-injection scanner применяется также к candidate metadata. Для выбранного
repository module child smoke/healthcheck читает только bounded regular manifest
и сверяет его с generated content hash и `repository_research_lock`.

Для такого сценария использовать:

- workflow `07_workflows/agents-mother.md`;
- стандарт `04_standards/agent-creation-harness.md`;
- стандарт `04_standards/memory-domains.md`;
- стандарт `04_standards/pritha-self-model.md`;
- стандарт `04_standards/agent-runtime-placement.md`;
- стандарт `04_standards/agent-team-operating-model.md`;
- стандарт `04_standards/agent-untrusted-input-security.md`;
- стандарт `04_standards/agent-harness-evaluation.md`;
- стандарт `04_standards/agent-skill-pack-lifecycle.md`;
- стандарт `04_standards/agent-interface-experience.md`;
- workflow `07_workflows/agent-skill-pack-selection.md`;
- шаблон `08_templates/agent-project-contract.md`;
- шаблон `08_templates/agent-outcome-spec.md`;
- шаблон `08_templates/agent-scaffold-report.md`;
- шаблон `08_templates/agent-delivery-report.md`;
- шаблон `08_templates/agent-operations-report.md`;
- шаблон `08_templates/agent-deployment-report.md`;
- шаблон `08_templates/agent-post-creation-review.md`.

Для нетривиальных агентов контракт должен отдельно определить runtime placement: какие классы задач выполняются детерминированным кодом, какие через локальные модели, какие через малые hosted-модели, а какие требуют frontier-модели или Codex. Нельзя считать локальную модель "бесплатной" или автоматически подходящей: нужны eval-примеры, healthcheck, fallback, privacy rules и понятная cost/quality мотивация.

Если агент должен покрывать несколько устойчивых доменов, иметь специалистов, расписания, ежедневные/еженедельные отчеты, worker-runtime или несколько потоков уведомлений, контракт обязан определить `team_mode`: `single-agent`, `coordinator-plus-workers`, `specialist-team` или `external-harness-team`. По умолчанию не дробить агента на команду без причины: разделение нужно только если оно уменьшает context/tool sprawl или отражает реальные пользовательские workflow.

Если новый агент принимает внешние сообщения, email, Telegram-посты, ссылки, сайты, media transcripts, файлы, скриншоты или другой некурированный ввод, контракт обязан определить `untrusted_input_policy`: источники, риск-уровень, лимиты токенов/медиа/стоимости, карантин, scanner/validation слой, запрет прямого влияния raw input на tools/memory и human approval gates.

Предпочтительный путь реализации для v1: `codex-native` агент в соседней папке `<parent-of-TECHSCOPE_ROOT>/<agent-name>` с опциональным Telegram-интерфейсом. Telegram считается interface adapter, а не обязательной частью каждого агента.

Новый агент должен быть подготовлен как рабочий, проверяемый scaffold: `AGENTS.md` или runtime-native instructions, `README.md`, `.env.example`, workflows/scripts, smoke test или healthcheck, user handoff/training guide. После scaffold создавать `scaffold-report` и индексировать его в память Pritha.

Scaffold readiness не является готовым агентом. Для outcome-driven delivery
нужны approved Outcome Spec и host-owned approval evidence. Markdown Trials
компилируются в deterministic `trial-plan.json` внутри private state-root; JSON
не редактируется руками. Build/fix loop идёт до `verified`,
`awaiting_acceptance` или typed blocker. Любое активное состояние ledger обязано
иметь ровно одно: `next_action` либо непустой список blockers. Каждый blocker
обязан содержать один вопрос и 2–5 вариантов ответа.

Автономная реализация работает только в отдельной ветке `pritha/build-*` и
disposable Git worktree. Нельзя stash/reset/overwrite активный пользовательский
worktree. Новый scaffold с `Build Git mode: disposable-worktree` получает
чистый локальный baseline commit без remote/push, чтобы delivery могла сразу
создать отдельный worktree. Executor не может менять approved Outcome Spec, approval store,
budgets, ledger, verifier или protected Trial inputs. Он не делает push, merge,
deployment, service/scheduler enablement и secret provisioning. Локальный Trial
backend честно имеет `isolation: none`; если Trial требует sandbox, использовать
подтверждённый App Server `command/exec` backend или остановиться fail-closed.
`verified`, `awaiting_acceptance`, `accepted`, merge-ready и deployment-ready —
разные состояния.

Каждый generated child `AGENTS.md` должен содержать harness evolution protocol:
при любой доработке harness сначала проверять локальный проект и контракт,
затем искать релевантные standards/workflows/decisions/reports в памяти
Pritha, затем при необходимости проверять свежую официальную документацию, и
только потом вносить минимальное изменение с тестами.

Интерфейсы, память, данные, skills, MCP, инструменты и operations новых агентов должны быть модульными. Pritha собирает каждого будущего агента из минимально достаточного набора модулей, выбранных контрактом: нужные части harness, memory, data layer, skills, MCP servers, tools, evals, interface adapters и operations добавляются, ненужные не копируются. Каждый scaffold получает manifest-файлы для соответствующих выбранных слоев; тяжелые слои памяти вроде SQLite, embeddings, graph DB или external vector store добавляются только если это следует из `agent-contract`.

При research/init нового child agent Pritha не должна начинать с копирования или подробного изучения уже существующих child agents. Сначала использовать контракт, `agent-building-knowledge` standards/workflows и `pritha-self` capabilities/limitations. `child-agents` profiles/reports использовать только как evidence успешных или неудачных паттернов, которые нужно проверить на fit с новым контрактом.

В конце setup/init нового агента Pritha должна проверить и явно констатировать readiness выбранных модулей: harness, memory, data, skills, MCP, tools, interfaces, operations и внешние коннекторы. Не выбранные модули помечаются как `skipped`; выбранные, но неработающие - как `failed` или `pending-auth`.

Если в setup/init выбран voice control через realtime, Pritha по умолчанию должна подготовить realtime tool surface: доступ к интернету, доступ к памяти агента и доступ к Codex CLI sidecar. Эти инструменты считаются выбранными модулями realtime-интерфейса, поэтому их readiness нужно проверить и записать в setup state. Если Codex CLI, память или интернет-доступ недоступны, setup не должен молча считать voice-интерфейс готовым.

Для быстрого переноса проверенного voice-control паттерна использовать FESPA26 reference pack: `node scripts/voice-control-kit.mjs plan`, `node scripts/voice-control-kit.mjs list`, `node scripts/voice-control-kit.mjs copy --target <agent-path>`. В descendants копировать полный кодовый pack только если контракт явно выбирает browser Realtime voice + Codex deep-task transport; иначе добавлять только `realtime-voice` placeholder и ссылки на стандарт/workflow.

Минимальный scaffold не является финальным пределом агента. Любой descendant можно дальше достраивать через его нативный интерфейс, прежде всего через Codex App/Codex thread, а также через выбранные в контракте интерфейсы. Если агент получает ссылку, статью, video/audio material, GitHub repo или другой интернет-ресурс, который не относится напрямую к его предметной задаче, он не должен автоматически смешивать этот материал с предметной памятью. Такой ресурс нужно обработать как meta-improvement input: оценить, может ли он улучшить harness, память, tools, skills, MCP, UX, evals, safety или operations самого агента; затем оформить review/brief/decision внутри памяти агента или передать выводы обратно в Pritha как кандидат для улучшения будущих агентов.

Операционный слой новых агентов должен быть явным и настраиваемым. Автозапуск может быть выбран в контракте как `optional`, `launchd-on-approval` или `external`, но Pritha не устанавливает и не включает его автоматически. Любой `launchd`, `launchctl`, cloud deployment или долгоживущий процесс требует отдельного явного подтверждения пользователя.

Для транспорта Pritha Voice Control + Codex ограничения должны совпадать с
Codex thread по возможностям разработки. Voice не должен превращать
реализацию, scaffold или настройку child agent в read-only режим. Рискованные
действия - service install/uninstall, scheduler/cron/launchd enablement,
deployment/publish, deletion, credential/secret writes, danger-full-access -
должны переводиться в UI decision gate на карточке Codex task. Без нажатия
Approve задача не запускается; Reject завершает ее как отклоненную. Секретные
значения не передаются голосом и не записываются из model context: использовать
credential UI child agent или `.env.example` placeholders.

При проектировании нового агента обязательно обсудить, где он будет развернут: локальный Mac, Mac mini, VPS, cloud, embedded/user device, внешний runtime или пока нигде. От этого зависят permissions, секреты, network boundary, логирование, healthcheck, backup и способ остановки агента.

Также обязательно определить runtime isolation profile: `none`, `process-only`, `project-folder`, `container`, `sandbox` или `remote-sandbox`. Для always-on, внешне доступных, проактивных, messaging-based или permission-heavy агентов нужно явно решить, где проходит граница между host control plane и agent execution boundary, где хранятся credentials, какая network policy применяется и нужен ли operator approval flow. Если sandbox не используется, причина должна быть записана в контракте.

Проактивность агента также должна быть отдельным архитектурным решением. Контракт должен явно выбрать `none`, `manual`, `scheduled`, `heartbeat`, `event-driven`, `queue-watcher` или `hybrid`, а также указать trigger sources, schedule/heartbeat interval, idle behavior и user interruption policy. Нельзя добавлять фоновый “пульс”, heartbeat, queue watcher, cron/хронос или proactive notifications без явной записи в контракте.

Deployment должен быть максимально автоматизирован, но отделен от scaffold. Каждый новый агент получает `scripts/deploy-service.mjs` с командами `plan`, `status`, `install`, `uninstall`. `plan` и `status` являются read-only. `install` и `uninstall` требуют явный флаг `--yes`; install допустим только если контракт и `operations/manifest.json` выбрали `service_mode: launchd` и `autostart: launchd-on-approval`. После deployment-команд создавать `agent-deployment-report`.

После создания, тестирования, handoff, operations или deployment нового агента нужно фиксировать обратную связь через `agent-post-creation-review` и обновлять `11_agents/registry.md`. Удачные scaffold/deployment/proactivity patterns не становятся стандартами автоматически: сначала нужен evidence в lifecycle reports и post-creation review, затем отдельное решение о промоции в `04_standards/`.

После первой реально рабочей версии нового агента обязательно сохранять review взаимодействия с пользователем: исходный запрос, уточняющие вопросы, пользовательские коррекции, изменения по результатам тестов, провалившиеся предположения и продуктовые решения, которые не очевидны из финального кода. Для небольшого агента это может быть секция внутри `agent-post-creation-review`; для существенного агента создавать отдельный report в `11_agents/reports/` с `type: agent-post-creation-review`.

Agents Mother может работать и с уже существующей папкой проекта. При проверке существующего проекта она должна определить, есть ли там агентный harness (`AGENTS.md`, manifest-файлы, scripts, Telegram adapter и другие сигналы). Если harness отсутствует, следующий шаг - обсудить с пользователем, какого агента добавить, и оформить `agent-contract`. Если harness есть, следующий шаг - тестировать, фиксировать `agent-test-report` и обсуждать улучшения.

CLI:

- `node scripts/agents-mother.mjs questions`
- `node scripts/agents-mother.mjs interview`
- `node scripts/agents-mother.mjs init --name ... --mission ...`
- `node scripts/agents-mother.mjs outcome init <contract-path>`
- `node scripts/agents-mother.mjs outcome validate <outcome-spec-path>`
- `node scripts/agents-mother.mjs outcome revise <approved-outcome-spec-path>`
- `node scripts/agents-mother.mjs outcome approve <outcome-spec-path> --approved-by user`
- `node scripts/agents-mother.mjs outcome compile <outcome-spec-path>`
- `node scripts/agents-mother.mjs research <contract-path> [--github-mode auto|online|registry-only|skip] [--github-limit 5] [--github-timeout-ms 15000] [--github-fixture <json>]`
- `node scripts/agents-mother.mjs scaffold <contract-path>`
- `node scripts/agents-mother.mjs trial run <outcome-spec-path> --project <project-path>`
- `node scripts/agents-mother.mjs deliver <outcome-spec-path> --project <project-path>`
- `node scripts/agents-mother.mjs delivery status|resume|accept <run-id>`
- `node scripts/agents-mother.mjs test <project-path>`
- `node scripts/agents-mother.mjs handoff <project-path>`
- `node scripts/agents-mother.mjs operations <project-path>`
- `node scripts/agents-mother.mjs deploy <project-path> plan|status|install|uninstall [--yes]`
- `node scripts/agents-mother.mjs evolve <project-path> [--notes ...]`
- `node scripts/agents-mother.mjs registry`
- `node scripts/agents-mother.mjs validate <contract-path>`

## Экспертная оценка новой информации

Если пользователь приносит новую порцию информации и спрашивает, насколько она интересна или полезна для программирования, LLM-агентов, coding agents или других агентных систем, использовать:

- стандарт `04_standards/expert-information-assessment.md`;
- workflow `07_workflows/expert-information-assessment.md`;
- шаблон `08_templates/assessment.md`.

Оценка должна отделять:

- просто интересное;
- практически полезное;
- применимое сейчас;
- достойное эксперимента;
- достойное стандарта.

Каждая новая технология, архитектурный паттерн или workflow должны отдельно примеряться к самой Pritha/Agents Mother. В assessment нужно явно указать `Pritha/Agents Mother fit`: `adopt`, `experiment`, `watch` или `skip`, с причиной. Учитывать пользу для миссии Pritha, стоимость переделки, сложность эксплуатации, свежесть технологии, риск устаревания, доказательность и переносимость в будущих агентов. Интересная идея не внедряется автоматически: если она избыточна, слишком сложна, слабо подтверждена или неактуальна для текущей архитектуры, она сохраняется как знание без изменения Pritha.

Особое внимание уделять применимости к agent engineering: tool use, memory, evals, retrieval, browser automation, coding workflows, CI/CD, safety, local-first workflows, orchestration, prompts, subagents и переносимым стандартам для будущих проектов.

## Обработка входящих медиа и ссылок

Любой новый материал, поступивший через Telegram, media platform, файл, ссылку, текст или другой канал, должен проходить полный intake pipeline:

1. Сохранить intake.
3. Извлечь ссылки transiently.
5. Для поддерживаемых remote/local media запустить локальную транскрибацию во временном untracked workspace, если источник доступен и есть совместимый adapter.
6. Создать signal artifact в `01_sources/signals/`: сжатую техническую выжимку без воды, рекламы, повторов, raw paths, URLs, identifiers or transcript fragments.
8. Пометить автоматический signal как `heuristic-draft` и `needs-codex-refinement`.
9. Для полезных материалов выполнить Codex-assisted refinement прямо в этом Pritha/Codex thread по `07_workflows/prompts/signal-extraction-harness.md`, без внешних LLM-сервисов.
10. Создать assessment draft в `03_reviews/`.
11. Сопоставить материал с уже имеющимися standards, decisions, reviews и wiki pages.
12. Пересобрать memory index and embeddings.
13. Запустить `node scripts/privacy-audit.mjs --strict`.

Telegram bot должен запускать этот pipeline автоматически для каждого сохраненного сообщения.

Если Telegram intake содержит медиа, требующее содержательной интерпретации, автоэтап не считается полным завершением. Такой intake должен оставаться в состоянии `awaiting_codex` до Codex-assisted media review в текущем Pritha/Codex thread. Только после закрытия media-review job материал считается `complete`.

Экспертная оценка выполняется как консилиум expert lenses: Programming, Agent Engineering, DX, Security, Evidence и Product Pragmatism. Для сложных материалов дополнительно использовать роли из `06_subagents/`.

Результат оценки может становиться recommendation для создания или настройки новых и существующих агентов, но не является стандартом до оформления review/decision/standard.

## Актуальность и замещение знаний

Pritha должна вести живую карту знания, а не только накопительный архив. Для быстро меняющихся тем агент обязан фиксировать `source_published`, `source_updated`, `source_version`, `retrieved`, `verified` и `temporal_status`, если эти данные применимы.

Каждая новая порция информации должна сравниваться с уже сохраненными материалами по тем же `topics`, `tools` и близким semantic-запросам. Для софта, моделей, API, библиотек и протоколов нужно проверять свежие первоисточники: official docs, changelog, release notes, specs, repository, issue/PR discussions авторов технологии.

В результате сравнения явно записывать одно из состояний:

- `confirms`: новое подтверждает старое;
- `refines`: новое уточняет старое;
- `contradicts`: новое противоречит старому;
- `supersedes`: новое заменяет старое;
- `uncertain`: данных недостаточно.

Если новый материал делает старый вывод неверным, слабым или неактуальным, старый артефакт нужно явно пометить `status: outdated` или `status: superseded`, добавить `superseded_by`, а в новом артефакте указать `supersedes`. Неактуальные материалы не удалять: история полезна, если видно, когда и почему вывод был заменен.

## Совместимость агентских сред

Pritha собирает знания о разных агентских средах: Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, Hermes Agent, OpenClaw и других. Нельзя автоматически переносить правила одной среды в другую.

Для материалов про coding agents, LLM agents, agent tooling и agent configuration агент обязан фиксировать:

- `agent_platforms`: какие среды обсуждаются;
- `model_context`: модель или семейство моделей, если известно;
- `runtime_environment`: CLI, desktop app, IDE, cloud agent, GitHub, browser, API или другая среда запуска;
- `config_surfaces`: какие файлы и механизмы используются: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`, skills, MCP, hooks, plugins, subagents, memories;
- `portability`: `codex-native`, `portable`, `adapter-needed` или `environment-specific`.

Codex остается основной рабочей средой проектирования для этого проекта. Внешние практики нужно переводить в Codex-совместимую форму, а не копировать буквально.

## Когда обновлять стандарты

Обновлять `04_standards/` только если:

- идея применима к нескольким будущим проектам;
- есть достаточно фактов и сравнений;
- понятны условия применения и исключения;
- есть ясные последствия для архитектуры, разработки или эксплуатации.

Если идея перспективная, но не зрелая, создать review или brief вместо стандарта.

## Язык

Основной язык проекта: русский. Названия файлов держать в ASCII и kebab-case, чтобы они были удобны для CLI и Git.
