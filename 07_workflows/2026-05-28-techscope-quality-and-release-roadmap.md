---
id: techscope-quality-and-release-roadmap
type: workflow
status: active
created: 2026-05-28
updated: 2026-05-28
topics:
  - techscope
  - pritha
  - rebranding
  - branding
  - code-quality
  - testing
  - self-healing
  - agents-mother
  - harness-engineering
  - open-source
  - github
  - ci-cd
  - documentation
  - codex
tools:
  - Codex
  - AGENTS.md
  - node
  - sqlite3
  - python3
  - git
  - GitHub Actions
  - Agents Mother
  - Pritha
agent_platforms:
  - Codex
model_context:
  - mixed
runtime_environment:
  - codex-desktop
  - codex-cli
  - local-project
  - github-actions
config_surfaces:
  - AGENTS.md
  - 07_workflows
  - scripts
  - scripts/lib
  - launchd
  - .github
  - docs
  - package.json
  - requirements.txt
portability: codex-native
sources:
  - 07_workflows/2026-05-28-techscope-quality-audit-roadmap.md
  - 11_agents/reports/2026-05-28-techscope-agent-test-report.md
  - 05_decisions/2026-05-18-techscope-canonical-root.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-environment-compatibility.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - .logs/techscope-telegram-bot.err.log
  - .logs/techscope-web.err.log
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-audit-roadmap.md
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
    - 07_workflows/memory-indexing.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/memory-structure.md
  decisions:
    - 05_decisions/2026-05-18-techscope-canonical-root.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-agent-test-report.md
  templates:
    - 08_templates/agent-test-report.md
    - 08_templates/agent-post-creation-review.md
supersedes:
  - 07_workflows/2026-05-28-techscope-quality-audit-roadmap.md
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: quality and release roadmap v2 (+ Pritha rebrand, English release, secure-handoffs)
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Techscope quality improvement and open-source release from 2026-05-28 onward
temporal_status: current
---

# Roadmap: Techscope / Pritha Quality, Self-Testing & Open-Source Release

Status: active — local phases 0-14 complete; external GitHub publication pending
Owner: Techscope / user
Started: 2026-05-28
Updated: 2026-05-28 (added Pritha rebrand + English release + secure-handoffs)
Runtime: Codex thread + local scripts + GitHub Actions
Supersedes: `07_workflows/2026-05-28-techscope-quality-audit-roadmap.md`

## Product identity (Pritha)

Публичный продукт этого репозитория — **Pritha**, агент, который создаёт агентов.

- **Название:** Pritha (русская форма — Притха).
- **Категория:** Mother of Agents — AI Agent Creator.
- **Техническое описание:** spec-to-agent compiler.
- **Главный слоган:** *The AI agent that creates AI agents.*
- **Второй слоган:** *From spec to specialist.*
- **Полная формула:** *Pritha is an open-source AI Agent Creator — a spec-to-agent compiler that turns task descriptions into deployable AI agents.*

### Что переименовывается, а что нет

- **Pritha = переименованный «Agents Mother»** — слой/агент, который конструирует других агентов. Это и есть лицо open-source-продукта.
- **Techscope** — окружающий слой-копилка знаний — **остаётся** как внутреннее имя. Допустимо сохранять внутренние имена слоёв (`techscope`, исторический `agents mother`) там, где это удобно и не ломает совместимость.
- Цель ребрендинга — сделать `mother of agents` не маркетингом, а **частью архитектуры**: у агентов появляется наследуемая структура (lineage, traits, inheritance, mutation, evaluation).

### Архитектурный словарь Pritha

| Роль | Значение |
|---|---|
| **parent agent** | Pritha — корневой создатель |
| **child agents / descendants** | созданные специализированные агенты |
| **lineage** | происхождение и версия агента |
| **traits** | способности агента |
| **inheritance** | базовые правила: safety, стиль, tool policy |
| **mutation** | адаптация под конкретную задачу |
| **evaluation / trial** | испытание перед выпуском |

### Терминология продукта (внутренняя ↔ Pritha)

Мифологические термины — **только для README и docs** (красивое позиционирование). В CLI, коде и манифестах — технические имена. Двигаемся аккуратно, чтобы не перегрузить интерфейс.

| Обычный термин | Термин в мире Pritha |
|---|---|
| Agent spec | Seed |
| Agent template | Lineage |
| Created agent | Descendant / Agent |
| Base policy | Inheritance |
| Tool permissions | Capabilities |
| Evaluation | Trial |
| Version history | Genealogy |
| Agent registry | House / Registry |
| Agent creation | Genesis |

### CLI (технический, без мифологии)

```sh
pritha create agent.yaml        # бывш. agents-mother.mjs init/scaffold
pritha test research-agent      # бывш. agents-mother.mjs test
pritha publish research-agent   # новый: trial → release
pritha lineage research-agent   # происхождение/genealogy
```

### Модульная раскладка (Вариант A — locked 2026-05-28)

Логические модули: `pritha-core`, `pritha-cli`, `pritha-spec`, `pritha-runtime`, `pritha-evals`, `pritha-registry`.

> **Решение (locked):** в v0.1 это **внутренняя структура папок** `scripts/pritha/*`, а **не** публикуемые npm-пакеты. Один репозиторий, один тег `v0.1.0`, запуск через `git clone` + Codex. Никаких npm workspaces, build-step, lockfiles на пакет, независимого версионирования или publish-пайплайна — это нарушило бы принцип «lightweight & compact» и «просто склонировал и запустил».
>
> Извлечение модулей в публикуемые npm-пакеты (Вариант B) — **out of scope v0.1**, обратимое решение на будущее: рассматривается только по реальному спросу через отдельный decision-record, опираясь на уже модульную структуру.

## Release safety & handoff model

Этот roadmap-файл — **переносимый артефакт**. Текущая копия проекта может быть не рабочей средой.

- Рабочий проект находится на **другой машине**. Этот файл копируется туда, и кодинг-агент исполняет roadmap там.
- Инструкции по работе с GitHub-репозиторием (создание repo, push, проверка секретов, релиз) хранятся **в отдельной соседней папке `secure-handoffs/`** рядом с проектом — **вне** публикуемого репозитория. Это гарантирует, что локальные пути, токены, machine-specific конфиги и внутренние заметки **никогда** не попадают в публичный код.
- Любой push на GitHub проходит pre-push checklist (см. Phase 13) и **не тянет** локальные пути, секреты, runtime-state (`.queue/`, `.memory/*.sqlite`, `.logs/`, `.env*`).
- Публичный репозиторий — **на английском языке** (README, docs, CLI help, code comments, issue/PR templates). Русские curated-артефакты остаются внутренним knowledge-слоем и при публикации либо переводятся, либо исключаются осознанным решением.

## Цель

Безопасно довести Techscope до состояния, в котором его можно:

1. **Поддерживать** — без регрессий в intake pipeline, memory indexing, Telegram bot, web UI, Agents Mother.
2. **Самопроверять** — единая команда «зелёный/красный», проактивное самотестирование с явным контрактом.
3. **Опубликовать как open-source** на GitHub так, чтобы любой другой пользователь смог склонировать репозиторий, прочитать `README` и за 10 минут запустить базовый pipeline.
4. **Эволюционировать через Agents Mother (Pritha)** — успешные паттерны из roadmap проходят явный pattern review и при подтверждении становятся частью каталога scaffold-модулей, из которых Pritha собирает дочерних агентов по контракту.
5. **Опубликовать под именем Pritha** — ребрендинг «Agents Mother» → **Pritha** как часть архитектуры (lineage / traits / inheritance), с чистым английским репозиторием и безопасным handoff через `secure-handoffs/`.

## Принципы

1. **Baseline first.** Сначала фиксируем «как работает сейчас», только потом меняем.
2. **One phase per Codex thread.** Не смешиваем фазы. Следующая фаза — только если предыдущая прошла golden checks.
3. **Reversible diffs.** Каждое изменение должно быть откатываемым через git (Phase 0 включает version control).
4. **Dogfood before export.** Любой паттерн применяется на Techscope, и только потом рассматривается как кандидат для Agents Mother scaffold.
5. **Evidence over optimism.** После каждой фазы создаётся `agent-test-report` или phase audit-report с конкретными результатами команд.
6. **Lightweight by default.** Никаких тяжёлых фреймворков. Node built-in `--test`, минимальный `package.json`, никакого webpack/babel/jest. Зависимости добавляются только если без них нельзя.
7. **Open-source by construction.** Все артефакты пишутся так, как если бы их завтра прочёл сторонний пользователь.
8. **Pattern candidacy, not pattern promotion.** Успешный паттерн помечается `AM-CANDIDATE` в phase report. Промоция в `04_standards/` или в Agents Mother scaffold — только через отдельный review/decision.
9. **No silent autostart.** launchd, scheduler, фоновые сервисы — никогда без `--yes` пользователя.
10. **No secrets in repo.** `.env*`, токены, credentials, `.queue/*`, `.memory/*.sqlite`, `.logs/*` — никогда не коммитятся.

## Golden checks (обязательный минимум)

Эти команды выполняются **до начала roadmap (baseline)**, **после каждой фазы** и **перед закрытием фазы в Codex**. Все должны завершаться с exit code 0, если иное не отмечено.

```sh
cd "${TECHSCOPE_ROOT:-$(pwd)}"

# 1. Markdown integrity
node scripts/validate-memory.mjs

# 2. Memory rebuild (idempotent)
node scripts/rebuild-memory.mjs

# 3. Memory stats sanity
node scripts/query-memory.mjs stats

# 4. Agents Mother self-inspection
node scripts/agents-mother.mjs test .

# 5. Telegram dry-run (без токена; проверяет queue + код)
node scripts/telegram-bot.mjs poll-once --dry-run
node scripts/telegram-bot.mjs queue-status

# 6. Опционально, если есть embeddings env
python3 scripts/embed-memory.py
node scripts/query-memory.mjs semantic "agent factory"
```

После Phase 0 эти проверки оборачиваются в `scripts/golden-checks.mjs` и доступны как одна команда.

После Phase 4 / 7 / 8 добавляются соответственно:

```sh
node scripts/smoke-test.mjs       # Phase 4 (Dogfooding)
node scripts/quality-gate.mjs     # Phase 7 (Quality gate)
node scripts/self-test.mjs        # Phase 8 (Self-test)
```

## Codex execution model

Каждая фаза выполняется как отдельный Codex thread по схеме:

1. Прочитать roadmap + предыдущий phase report.
2. Запустить golden checks → зафиксировать baseline.
3. Внести **только** изменения текущей фазы.
4. Запустить golden checks + phase-specific checks.
5. Записать `11_agents/reports/YYYY-MM-DD-techscope-quality-phase-N-report.md`.
6. Отметить `AM-CANDIDATE` паттерны явной секцией.
7. `node scripts/rebuild-memory.mjs && git add -A && git commit -m "phase N: <summary>"`.
8. Не переходить к Phase N+1.

Базовый prompt для Codex:

```text
Выполни Phase N из 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md.
Сначала golden checks (baseline), потом минимальный diff только для этой фазы,
потом повторные golden checks + phase-specific checks, затем audit-phase-report.
Не переходи к Phase N+1. Помечай AM-CANDIDATE-паттерны.
```

---

## Phase 0 — Foundation: git, baseline, golden checks harness

Status: complete
Risk: low
Depends on: —
Estimated effort: 1 Codex session
AM-pattern candidates: `audit-baseline-report`, `golden-checks-manifest`, `audit-log-append-only`

### Goal

Включить version control и зафиксировать текущее состояние. Без git дальнейшие фазы небезопасны.

### Deliverables

- `git init` + первый коммит со всем рабочим состоянием Markdown + scripts.
- Аудит `.gitignore`: подтвердить, что local-only runtime/cache/queue/env folders and raw-source holding areas are ignored, while the explicitly approved cleaned `.memory` portability snapshot remains tracked.
- `scripts/golden-checks.mjs` — единая обёртка с двумя режимами:
  - `--json` — машинный вывод;
  - default — человеко-читаемый отчёт + ненулевой exit при провале.
- `11_agents/reports/2026-05-28-techscope-quality-phase-0-baseline-report.md` со снапшотом:
  - количество документов / chunks / embeddings;
  - queue snapshot;
  - результат `agents-mother test .`;
  - список scripts с line counts;
  - известные path mismatches (`<USER_HOME>/*` ↔ актуальный root);
  - hash основных утилитарных функций (для будущего DRY-merge).
- `07_workflows/techscope-quality-audit-log.md` — append-only журнал прохождения фаз.

### Verification gate

- `git status` — только ожидаемые untracked (runtime state, `.env.local`).
- `node scripts/golden-checks.mjs` → pass.
- Baseline report записан в `11_agents/reports/`.

### Rollback

- Удалить новый harness; история git сохраняет snapshot.

### Do NOT change in this phase

- Логику intake, rebuild-memory, agents-mother.
- Шаблоны генерируемых файлов.

---

## Phase 1 — Portable root: убрать hardcoded paths

Status: complete
Risk: medium (риск сломать launchd)
Depends on: Phase 0
Estimated effort: 1–2 Codex sessions
AM-pattern candidates: `TECHSCOPE_ROOT-env`, `path-portability-check`, `home-aware-launchd-template`

### Goal

Устранить hardcoded `<TECHSCOPE_ROOT>` в скриптах, launchd-юнитах и манифестах. Сделать проект переносимым между машинами, пользователями и форками.

### Deliverables

- `scripts/lib/paths.mjs`:
  - `resolveTechscopeRoot()` — `TECHSCOPE_ROOT` env → git root → `process.cwd()`;
  - `resolveSiblingAgentPath(name)` — sibling под parent of root, если контракт не override.
- Обновлённые без hardcoded user paths:
  - `scripts/run-techscope-web.sh`,
  - `scripts/run-techscope-telegram-bot.sh`,
  - `launchd/com.techscope.web.plist`,
  - `launchd/com.techscope.telegram-bot.plist`.
- `launchd/README.md` с инструкцией: «замени `$HOME`, `$USER` плейсхолдеры на свои значения; не коммить заполненный plist в форк».
- `scripts/healthcheck.mjs` — проверяет `TECHSCOPE_ROOT`, наличие манифестов, sqlite, скриптов, path consistency.
- `05_decisions/YYYY-MM-DD-techscope-portable-root.md` — решение о env-first canonical root (заменяет user-hardcoded в `2026-05-18-techscope-canonical-root.md`).
- Обновить раздел canonical root в `AGENTS.md`: env-first, не user-hardcoded.

### Verification gate

- Golden checks pass из **другой** cwd через `TECHSCOPE_ROOT=...`.
- `node scripts/healthcheck.mjs` → pass.
- `node scripts/agents-mother.mjs test .` → pass без N/A по структуре.
- launchd-плейсхолдеры валидны (`plutil -lint`), но **не устанавливать** автоматически.
- `grep -rn "<USER_HOME>" scripts launchd interfaces memory tools operations` — пустой результат для каталогов исполняемого кода. (Артефакты в `03_reviews/`, `05_decisions/`, `11_agents/reports/` могут сохранять исторический контекст.)

### Rollback

- Revert `scripts/lib/paths.mjs`; восстановить shell-скрипты из git.

---

## Phase 2 — Operational reality fix

Status: complete
Risk: medium
Depends on: Phase 1
Estimated effort: 1 Codex session
AM-pattern candidates: `incident-as-operations-report`, `external-fetch-backoff`, `repo-cruft-cleanup`

### Goal

Закрыть конкретные runtime-инциденты, которые сейчас молча идут в `.logs/`, и подготовить чистый репозиторий для public release.

### Deliverables

- Telegram bot: добавить exponential backoff + jitter на `getUpdates fetch failed`; ограничить шум в логах (rate-limit одинаковых ошибок).
- Web service: проверить совместимость с Phase 1 portable root; убедиться, что после reload launchd плейсхолдеров сервис запускается.
- Cleanup репозитория:
  - удалить 0-byte файлы (`2026-05-15.md`, `Untitled.canvas`, `Untitled 1.canvas`);
  - все `.DS_Store` (через git rm и обновление `.gitignore`);
  - проверить, что `.env.local` **не** в git history (если есть — `git filter-repo` или начать историю с чистого слепка).
- `11_agents/reports/YYYY-MM-DD-techscope-agent-operations-report.md`:
  - инцидент Telegram getUpdates (диапазон времени, симптом, фикс);
  - инцидент web launchd (старый путь `Documents/New project`, фикс плейсхолдеров);
  - текущий статус сервисов.

### Verification gate

- Golden checks pass.
- 15-минутный sample логов: нет повторяющегося `fetch failed` или есть только агрегированные warnings.
- `git ls-files | grep -E '\.DS_Store|Untitled.*\.canvas|^2026-05-15\.md$'` — пустой результат.
- `operations/manifest.json.healthcheck_command` действительно завершается успешно.

---

## Phase 3 — Shared lib: устранение DRY-долга

Status: complete
Risk: medium (риск parser-регрессий)
Depends on: Phase 0, Phase 2
Estimated effort: 2 Codex sessions (1 скрипт за подсессию)
AM-pattern candidates: `scripts-lib-package`, `shared-frontmatter-parser`, `shared-env-loader`

### Goal

Убрать копии `loadEnv` / `parseFrontmatter` / `slug` / `today` / `transliterate` из 7 скриптов. Единый источник поведения снижает риск расхождения парсеров.

### Deliverables

- `scripts/lib/frontmatter.mjs` — точная копия текущего поведения; никаких «улучшений» до Phase 4 (тесты).
- `scripts/lib/env.mjs` — `.env` + `.env.local` loader.
- `scripts/lib/slug.mjs` — slug + transliterate (берём расширенную версию из `agents-mother.mjs` как baseline; документируем отличия).
- `scripts/lib/date.mjs` — `today()`, `now()`.
- `scripts/lib/README.md` — короткое описание API + правила импорта.
- Миграция скриптов **по одному**, с golden checks после каждого:
  1. `validate-memory.mjs`
  2. `rebuild-memory.mjs`
  3. `extract-signal.mjs`
  4. `process-intake.mjs`
  5. `telegram-bot.mjs`
  6. `llm-wiki.mjs`
  7. `agents-mother.mjs` (последним; включая шаблоны, генерируемые в дочерних агентов).

### Verification gate

- `node scripts/validate-memory.mjs` — `±0` файлов к baseline.
- `node scripts/rebuild-memory.mjs && node scripts/query-memory.mjs stats` — counts стабильны.
- Snapshot: hash таблиц `documents` row count + sample frontmatter полей.
- Golden checks pass после каждого мигрированного скрипта.

### Do NOT change in this phase

- Frontmatter schema fields.
- Парсер semantics (никаких новых YAML фич до Phase 4).

---

## Phase 4 — Dogfooding: Techscope проходит свой harness

Status: complete
Risk: low
Depends on: Phase 3
Estimated effort: 1–2 Codex sessions
AM-pattern candidates: `smoke-test-template`, `*-status-mjs-family`, `self-inspection-manifest`, `minimal-package-json`

### Goal

Techscope должен соответствовать тому harness profile, который Agents Mother генерирует своим детям. Закрыть `not-applicable` пункты из `2026-05-28-techscope-agent-test-report.md`.

### Deliverables

- `scripts/smoke-test.mjs` — быстрая проверка <30s:
  - manifests существуют и парсятся,
  - ключевые scripts существуют и executable,
  - `validate-memory` exit 0,
  - опционально: web health при достижимом `PORT`.
- `scripts/interface-status.mjs`
- `scripts/memory-status.mjs`
- `scripts/tools-status.mjs`
- `scripts/operations-status.mjs`
- Минимальный `package.json` (без зависимостей):
  - `"name": "techscope"`,
  - `"private": true`,
  - `"type": "module"`,
  - `"engines": { "node": ">=20" }`,
  - `"scripts": { "test": "node scripts/smoke-test.mjs", "check": "node scripts/golden-checks.mjs", ... }`.
- Обновить `operations/manifest.json` с smoke/health commands.

### Verification gate

- `npm test` (или `node scripts/smoke-test.mjs`) → pass.
- Все четыре `*-status.mjs` → exit 0 с JSON-output.
- Golden checks pass.
- `node scripts/agents-mother.mjs test .` → **нет** critical N/A по self-generated checks.

---

## Phase 5 — Test layer: regression safety net

Status: complete
Risk: medium
Depends on: Phase 4
Estimated effort: 1–2 Codex sessions
AM-pattern candidates: `node-test-harness`, `frontmatter-fixtures`, `scaffold-snapshot-tests`

### Goal

Добавить быстрые unit-тесты на pure functions и CLI-контракты — **встроенный** Node test runner, без heavy фреймворков.

### Deliverables

- `tests/` директория:
  - `tests/frontmatter.test.mjs` — fixtures из реальных артефактов (анонимизированные при необходимости).
  - `tests/slug.test.mjs`
  - `tests/paths.test.mjs`
  - `tests/golden-checks.test.mjs` — mock/spawn с `--dry-run`-флагами.
  - `tests/agents-mother-contract.test.mjs` — валидация enum-ов и required-полей контракта.
  - `tests/scaffold-snapshot.test.mjs` — генерация sibling-agent из frozen-фикстуры контракта; diff с golden snapshot.
- `tests/fixtures/` — минимальные Markdown-семплы и frozen contract.
- `tests/snapshots/` — golden output scaffold.
- `package.json` обновить:
  - `"test:unit": "node --test tests/**/*.test.mjs"`,
  - `"test": "npm run check && npm run test:unit"`.

### Verification gate

- `node --test tests/` → all pass.
- Intentionally break a fixture → test fails (доказывает, что тесты работают).
- Golden checks pass.

### Do NOT change in this phase

- Сам `agents-mother.mjs` (modularization — Phase 9).

---

## Phase 6 — Dependencies manifest + env doctor

Status: complete
Risk: low
Depends on: Phase 1, Phase 4
Estimated effort: 1 Codex session
AM-pattern candidates: `prerequisites-md`, `env-doctor-mjs`, `python-requirements-pinned`

### Goal

Явно зафиксировать внешние зависимости и автоматизировать их проверку. Без этого новый пользователь не сможет запустить проект.

### Deliverables

- `requirements.txt` (Python, pinned versions):
  - `sentence-transformers`,
  - `imageio-ffmpeg` (для `transcribe-media.mjs`),
  - `openai-whisper` или альтернатива.
- `docs/prerequisites.md`:
  - Node ≥ 20,
  - `sqlite3` CLI,
  - Python ≥ 3.10 + packages из `requirements.txt`,
  - опционально: Codex.app для CLI-интеграции.
- `scripts/env-doctor.mjs`:
  - проверяет `node`, `sqlite3`, `python3` + critical packages,
  - выводит actionable install hints (Homebrew / pip / pyenv),
  - exit 1 если critical deps отсутствуют, warning если optional.
- Интеграция в `healthcheck.mjs` и `golden-checks.mjs` как non-blocking warning, затем blocking после явного opt-in.

### Verification gate

- `node scripts/env-doctor.mjs` → pass на dev-машине.
- Fresh clone simulation в чистой папке: `git clone <local>; cd; node scripts/env-doctor.mjs` → перечисляет missing dep, если что-то снести.
- Golden checks pass.

---

## Phase 7 — Quality gate: один зелёный/красный командой

Status: complete
Risk: low
Depends on: Phase 4, Phase 5, Phase 6
Estimated effort: 1 Codex session
AM-pattern candidates: `quality-gate-mjs`, `audit-report-generator`, `phase-report-template`

### Goal

Единая команда «можно ли считать Techscope здоровым» — для Codex, локального pre-commit и будущего GitHub Actions.

### Deliverables

- `scripts/quality-gate.mjs`:

```text
quality-gate.mjs
├── env-doctor          (critical deps)
├── validate-memory
├── smoke-test
├── unit tests (node --test)
├── agents-mother test .
├── telegram dry-run
└── --json | --markdown summary
```

- `scripts/audit-report.mjs` — генерирует standardized phase/baseline report из output gate.
- `08_templates/techscope-audit-phase-report.md`.
- `.githooks/pre-commit` — документированный, **не** auto-installed; README объясняет `git config core.hooksPath .githooks`.

### Verification gate

- `node scripts/quality-gate.mjs` → pass.
- Намеренный регресс → gate fails с понятной причиной.
- Artifact-report записан.

### Pattern harvest

`quality-gate.mjs` — strong AM-CANDIDATE для optional scaffold module в Agents Mother. Промоция — через post-creation review.

---

## Phase 8 — Self-test + proactive operational pulse

Status: complete
Risk: medium (background-поведение)
Depends on: Phase 7
Estimated effort: 1–2 Codex sessions
AM-pattern candidates: `self-test-mjs`, `queue-health-mjs`, `scheduled-health-pulse`, `proactive-self-test-contract`

### Design constraints

- Default — manual / on-demand, **никакого** background service.
- Proactivity mode для Techscope: `manual` → optionally `scheduled` только после явного решения в `05_decisions/`.
- launchd-инсталляция — только через `--yes`, как в Agents Mother deploy rules.

### Deliverables

- `scripts/self-test.mjs`:
  - запускает subset quality-gate,
  - сравнивает с last baseline (`.memory/last-self-test.json` или последний phase report),
  - flag-ит регрессии: drop в document count, queue failed > 0, test failures.
- `scripts/queue-health.mjs`:
  - сообщает stale `awaiting_codex` / `pending` старше N дней,
  - informational, не auto-mutating.
- `05_decisions/YYYY-MM-DD-techscope-self-test-proactivity.md` — что и когда запускается.
- (опционально, требует `--yes`) `launchd/com.techscope.self-test.plist.template` — weekly quality-gate.
- (опционально) `07_workflows/prompts/run-self-test.md` — Codex heartbeat prompt.
- Дополнить `AGENTS.md`:

> В начале сессии Codex по запросу пользователя или при работе над scripts/infrastructure — предлагать `node scripts/self-test.mjs`, если последний self-test старше 7 дней.

### Verification gate

- `node scripts/self-test.mjs` → pass, comparison report записан.
- `node scripts/queue-health.mjs` → exit 0.
- Golden checks + quality-gate pass.
- launchd **не** установлен по умолчанию.

---

## Phase 9 — `agents-mother.mjs` modularization

Status: complete
Risk: high (3728-строчный monolith)
Depends on: Phase 5, Phase 7
Estimated effort: 2–4 Codex sessions
AM-pattern candidates: `multi-module-cli`, `scaffold-template-modules`, `contract-validation-module`

### Goal

Разбить monolith на сопровождаемые модули без изменения CLI surface. Это рискованная фаза — выполняется **только** после готовой test infrastructure.

### Target structure

```text
scripts/agents-mother/
  index.mjs              # CLI entry, re-exports current commands
  contract.mjs           # parse, validate, init, interview
  research.mjs
  scaffold/
    index.mjs
    templates/           # generated file templates as separate modules
      smoke-test.template.mjs
      interface-status.template.mjs
      ...
  test.mjs
  handoff.mjs
  operations.mjs
  registry.mjs
scripts/agents-mother.mjs # thin wrapper → import './agents-mother/index.mjs'
```

### Deliverables

- Zero CLI behavior change.
- Snapshot test (Phase 5 fixture) проходит без diff в generated scaffold.
- Unit-тесты на `validateContract`, `slug`, `resolveTargetPath`, шаблонные сборщики.

### Sub-phases (обязательная последовательность)

1. Extract `contract.mjs` + tests.
2. Extract `test.mjs` + tests.
3. Extract `scaffold/` + snapshot test.
4. Extract оставшиеся модули.

### Verification gate

- Все существующие команды работают: `questions`, `validate`, `list`, `registry`, `interview`, `init`, `research`, `scaffold`, `test`, `handoff`, `operations`, `deploy`, `evolve`.
- Если рядом существует FESPA26 или другой sibling agent: `test <path>` — unchanged classification.
- Snapshot diff scaffold = empty для frozen contract fixture.

---

## Phase 10 — Pritha rebrand (Mother of Agents)

Status: complete
Risk: high (cross-cutting rename; затрагивает CLI, манифесты, реестр, шаблоны)
Depends on: Phase 5 (tests), Phase 9 (modularization)
Estimated effort: 3–5 Codex sessions
AM-pattern candidates: `lineage-vocabulary`, `cli-rename-with-alias`, `seed-spec-format`, `genealogy-registry`, `brand-layer-separation`

### Goal

Переименовать слой-фабрику «Agents Mother» в **Pritha** так, чтобы `mother of agents` стала частью архитектуры (lineage / traits / inheritance / mutation / trial), **без поломки** существующей функциональности. Ребрендинг выполняется **только после** готовой test-инфраструктуры (Phase 5) и модуляризации (Phase 9), чтобы snapshot-тесты ловили любую регрессию.

> Это самая рискованная «косметическая» фаза: имя меняется в командах, манифестах, реестре и генерируемых шаблонах. Принцип — **alias-first, rename-second**: сначала добавляем новые имена как алиасы поверх старых, проверяем зелёным gate, и только потом переключаем дефолты.

### Что переименовывается

| Было | Стало | Совместимость |
|---|---|---|
| `scripts/agents-mother.mjs` | `scripts/pritha.mjs` (или `scripts/pritha/index.mjs` после Phase 9) | старый путь оставить тонким shim-ом с deprecation note на 1 релиз |
| CLI `node scripts/agents-mother.mjs <cmd>` | `pritha <cmd>` (bin в `package.json`) + старый вызов как alias | оба работают; golden checks проверяют оба |
| «Agents Mother» в README/docs/UX | **Pritha** | docs — только English (Phase 11) |
| `agent-spec` / contract | **Seed** (в docs); `agent-contract` остаётся техническим id | id и frontmatter `type` не меняем без отдельного decision |
| `11_agents/registry.md` | концептуально **House / Genealogy** | путь и `type: agent-registry` сохраняем; меняем только заголовки/нарратив |

### Что НЕ переименовывается в v0.1 (защита совместимости)

- **frontmatter `type`-значения** (`agent-contract`, `agent-test-report`, `agent-registry`, …) — менять только через отдельный decision + миграцию памяти (риск сломать `validate-memory.mjs` и индекс).
- **директории** `11_agents/`, `06_subagents/` — пути сохраняем; ребрендинг в нарративе, не в путях.
- **внутреннее имя `Techscope`** — остаётся (knowledge-слой).
- **`.memory/` schema, queue-статусы** — без изменений.

### Deliverables

- `scripts/pritha.mjs` (или `scripts/pritha/index.mjs`) — основной entry; `scripts/agents-mother.mjs` → тонкий shim, печатает deprecation note и делегирует.
- `package.json` `bin`: `{ "pritha": "scripts/pritha.mjs" }`.
- CLI-подкоманды: сохранить все текущие (`questions`, `init`, `validate`, `research`, `scaffold`, `test`, `handoff`, `operations`, `deploy`, `evolve`, `registry`, `list`) + добавить алиасы `create` (→ init/scaffold), `publish` (→ trial+release), `lineage` (→ genealogy view).
- `04_standards/agent-creation-harness.md` и `07_workflows/agents-mother.md` — добавить раздел «Pritha naming & lineage vocabulary» (нарратив), без слома существующих правил.
- `05_decisions/YYYY-MM-DD-pritha-rebrand.md` — фиксирует: что переименовано, что сохранено, alias-политику, английский репозиторий, источник имени.
- `08_templates/agent-project-contract.md` — добавить опциональные поля lineage-словаря (`lineage`, `traits`, `inheritance`, `mutation`) как **дополнительные**, не обязательные.
- Обновить help-тексты и usage-строки на английский (CLI — англоязычный для open-source).
- `secure-handoffs/`-заметка (sibling, вне репо): зафиксировать финальное имя repo (`pritha`) и owner.

### Migration safety (обязательная последовательность)

1. **Snapshot baseline** (из Phase 5): зафиксировать output `scaffold` для frozen contract fixture ДО ребрендинга.
2. **Alias layer**: добавить новые имена/подкоманды как алиасы; старые продолжают работать.
3. **Golden checks + snapshot**: scaffold output не изменился (или изменения только в нарративных строках, зафиксированы в snapshot diff).
4. **Switch defaults**: дефолтные сообщения/help → Pritha; старый CLI → deprecation shim.
5. **Docs follow**: только после зелёного gate — переход к Phase 11 (English docs с именем Pritha).

### Verification gate

- `node scripts/agents-mother.mjs test .` (старый путь, shim) → работает + печатает deprecation note.
- `node scripts/pritha.mjs test .` (или `pritha test .`) → идентичный результат.
- Snapshot scafford diff: **только** ожидаемые нарративные строки; никаких изменений в структуре генерируемых файлов.
- Golden checks pass.
- `node scripts/validate-memory.mjs` — `±0` файлов; `type`-значения не изменены.
- `node scripts/query-memory.mjs stats` — counts стабильны.

### Rollback

- Удалить `scripts/pritha*`, восстановить `agents-mother.mjs` из git, откатить нарративные правки в standards/workflows. Снапшот-тест подтверждает возврат.

### AM-pattern harvest hint

`cli-rename-with-alias` и `brand-layer-separation` — кандидаты для Pritha scaffold: каждый ребёнок-агент должен уметь иметь публичное имя + технический CLI без слома совместимости.

---

## Phase 11 — Open-source documentation pack (English-first)

Status: complete
Risk: low
Depends on: Phase 7, Phase 10 (rebrand)
Estimated effort: 2 Codex sessions
AM-pattern candidates: `oss-doc-pack`, `english-first-readme`, `getting-started-10-min`

### Goal

Сделать репозиторий «forkable за 10 минут» под именем **Pritha**: понятная **англоязычная** документация, лицензия, контрибьюшен-флоу, security policy. Английский — основной язык публичного репозитория.

### Deliverables (репозиторий-уровень)

- `README.md` — **на английском**, public-facing landing для Pritha:
  - hero: *Pritha — The AI agent that creates AI agents. From spec to specialist.*,
  - короткое описание (spec-to-agent compiler, для кого),
  - 10-second / 10-minute quick start,
  - ссылка на `docs/architecture.md`,
  - badges (license, CI status — заполняются в Phase 13).
- `README.ru.md` — опциональная русская версия (вторичная, для исходной аудитории).
- `LICENSE` — MIT или Apache-2.0 (зафиксировать в `05_decisions/`).
- `CONTRIBUTING.md` (English):
  - как добавить intake / предложить Seed,
  - как предложить standard / decision,
  - правило: один phase per PR, golden checks обязательны,
  - правило: не коммитить `.env*`, `.queue/`, `.memory/*.sqlite`, `.logs/`, локальные пути.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `SECURITY.md` — куда репортить уязвимости; политика по секретам.
- `CHANGELOG.md` — формат Keep a Changelog; первая запись — Pritha v0.1.0.
- `.github/ISSUE_TEMPLATE/`:
  - `bug_report.md`,
  - `feature_request.md`,
  - `new-agent-seed.md` (предложение нового агента/Seed через Pritha).
- `.github/PULL_REQUEST_TEMPLATE.md` — чек-лист: golden checks pass, phase report, AM-candidate marked.

### Deliverables (`docs/`, English)

- `docs/getting-started.md` — fresh clone → first intake → first agent.
- `docs/architecture.md` — слои и pipeline + lineage vocabulary (parent/child/lineage/traits/inheritance/mutation/trial).
- `docs/pritha.md` — как пользоваться Pritha (бывш. `docs/agents-mother.md`): `pritha create / test / publish / lineage`.
- `docs/memory.md` — устройство `.memory/` и rebuildability.
- `docs/operations.md` — деплой как локальный сервис (опционально).
- `docs/contributing-workflow.md` — пример полного цикла intake → assessment → standard.
- `docs/prerequisites.md` (из Phase 6).
- `docs/realtime.md` — Realtime-2 cost/voice (нужен для Phase 12 wizard cost-warning).
- `docs/troubleshooting.md` — типовые ошибки (Telegram fetch failed, path mismatch, sqlite missing, deprecated `agents-mother` CLI).

### Verification gate

- Все ссылки в `README.md` живые.
- README/docs — на английском; терминология Pritha консистентна.
- Чистый clone в `/tmp` + следование `docs/getting-started.md` доводит до `node scripts/quality-gate.mjs` pass.
- `.env.example` покрывает все переменные, читаемые скриптами; ни один секрет/локальный путь не утекает в репозиторий.

---

## Phase 12 — First-run setup wizard (Codex-native bootstrap)

Status: complete
Risk: medium (interactive flow, секреты, опциональные внешние установки)
Depends on: Phase 6 (env-doctor), Phase 7 (quality-gate), Phase 8 (self-test), Phase 10 (rebrand), Phase 11 (docs)
Estimated effort: 2–3 Codex sessions
AM-pattern candidates: `first-run-setup-workflow`, `connector-selection-dialog`, `setup-manifest`, `secrets-collector-pattern`, `tailscale-integration-detection`, `codex-cli-integration-check`, `trigger-phrase-routing`, `minimal-default-config`, `realtime-voice-opt-in`, `completed-with-warnings-status`

### Resolved decisions (locked 2026-05-28)

| # | Решение |
|---|---|
| Q1 | **Минимальная конфигурация v0.1 = Codex dialog only.** Все остальные интерфейсы (Web, Telegram, Realtime-2, Obsidian) — opt-in во время диалога. |
| Q2 | **Realtime-2 поддерживается в v0.1.** При opt-in default mode = **always-on**. Wizard перед включением показывает явный warning о cost + privacy и предлагает альтернативу push-to-talk через `--reconfigure realtime`. |
| Q3 | **Tailscale — только manual `tailscale up`.** Никаких auth keys в `.env.local` в v0.1. Wizard детектит `tailscale status` и при наличии — предлагает использовать tailnet IP для Web HOST. |
| Q4 | **Codex CLI auth — smart detection.** Wizard сначала проверяет существующий `codex login` (через `codex --version` + light auth probe). Если auth есть — wizard не трогает его. Если нет — диалог: «API key (в .env.local) или `codex login` (subscription)?». |
| Q5 | **Claude Code — out of scope v0.1.** Wizard не пытается ничего детектить для Claude. Отдельный `agent-contract` в `11_agents/contracts/` оформляется как preparation для будущей Phase 15 dual-platform adapter (на v0.2+). |
| Q6 | **Секреты только в `.env.local` (mode 600).** Никаких macOS Keychain / 1Password CLI integration в v0.1. |
| Q7 | **Quality-gate red в конце → `completed-with-warnings`.** Setup завершается, `.techscope-setup.json.status = "completed-with-warnings"`, показывается список actionable hints + рекомендация запустить `node scripts/self-test.mjs` после исправлений. Setup НЕ возвращает non-zero exit code в этом случае — это не блокирует первый опыт пользователя. |

### Goal

Сделать так, чтобы новый пользователь, склонировав репозиторий из GitHub и открыв папку в Codex app, мог запустить проект **одним промптом** — без чтения документации, без ручного редактирования файлов, без понимания внутреннего устройства. Вся настройка происходит как диалог с Techscope-агентом в Codex thread; setup-скрипт — CLI-fallback для headless-окружения.

> Это финальный UX-слой для open-source-распространения. После завершения Phase 12 проект, склонированный из GitHub, готов к созданию первого ребёнка (descendant) через Pritha за один разговор.

### User-facing scenario

1. `git clone <repo>` + открыть папку в Codex app.
2. Промпт пользователя: **«запусти проект»** (или `setup`, `first run`, `start`, `bootstrap`).
3. Codex читает `AGENTS.md` → находит правило trigger phrase → открывает `07_workflows/first-run-setup.md` и ведёт пользователя по диалогу.
4. После диалога — quality-gate автоматически зелёный, агенты готовы к созданию.

### Dialog tree (зафиксирован 2026-05-28; расширяется при исполнении в Codex thread)

```text
1. Welcome
   ├── короткое описание Techscope
   ├── оценка времени (3–7 мин для минимальной конфигурации)
   └── упоминание: «дополнительные коннекторы можно добавить
        потом через `--reconfigure <section>`»

2. Environment check  → scripts/env-doctor.mjs
   ├── node, sqlite3, python3, sentence-transformers
   ├── для каждого missing — actionable install hint (brew / pip / pyenv)
   └── ничего не ставится автоматически без подтверждения

3. Choose interfaces (multi-select; ВСЕ дефолты — выключены, кроме Codex)
   ├── [x] Codex app dialog              # всегда on, primary, не настраивается
   ├── [ ] Web UI                        # read/search localhost
   ├── [ ] Telegram connector            # intake + chat with mother
   ├── [ ] Realtime-2 voice              # OpenAI Realtime API (opt-in, см. §4)
   └── [ ] Obsidian vault                # graph view of Markdown
   #
   # Минимальный путь: пользователь ничего не выбирает, идёт сразу к §7→§8→§10.
   # Это быстрый «just look at it» flow.

4. Per-connector configuration (только для выбранных в §3)

   4a. Web UI
       ├── HOST (default 127.0.0.1; если §5 даст tailnet IP — предложить его)
       ├── PORT (default 3000)
       └── validate: порт свободен

   4b. Telegram
       ├── token (BotFather link, hidden input, маска при выводе)
       ├── allowed user IDs (CSV)
       └── validate: getMe API call (non-blocking; ошибка → warning)

   4c. Realtime-2 voice
       ├── ШАГ 1: COST + PRIVACY WARNING
       │     ├── "Realtime API в always-on режиме держит микрофон
       │     │   открытым и продолжает биллиться при отсутствии речи."
       │     ├── "Расход примерно $X/час активного разговора
       │     │   (точная цифра — из текущих OpenAI rates на момент setup)."
       │     ├── "Для экономии и приватности можно выбрать push-to-talk."
       │     └── Подтверждение продолжения: yes / switch-to-ptt / skip
       ├── ШАГ 2: режим
       │     ├── default: always-on (по выбору пользователя в Q2)
       │     └── alternative: push-to-talk (переключается потом через
       │         `--reconfigure realtime`)
       ├── ШАГ 3: credentials
       │     ├── OPENAI_API_KEY → .env.local (если уже есть в Codex CLI
       │     │   auth — переиспользовать; не дублировать)
       │     ├── модель + voice (defaults из docs/realtime.md)
       │     └── validate: tiny realtime ping (non-blocking)

   4d. Obsidian
       └── путь к vault (default = root проекта)

5. Network (опционально; только если §3 включает Web UI или Realtime-2)
   └── Tailscale (manual-only flow)
       ├── detect: `tailscale status` returns code 0?
       ├── если нет:
       │     ├── показать install hint для текущей OS
       │     ├── НЕ устанавливать автоматически
       │     └── секция помечается `skipped`, можно вернуться позже
       ├── если есть:
       │     ├── показать текущий tailnet IP машины
       │     ├── предложить использовать его для Web HOST
       │     └── записать выбор в .techscope-setup.json
       └── никаких TS_AUTH_KEY в .env.local в v0.1

6. Codex CLI integration (smart detection; вызывается всегда, если §3
   содержит Realtime-2 или явный запрос пользователя)
   ├── detect: `codex --version` и light auth probe
   ├── есть валидный auth → wizard ничего не трогает,
   │   секция помечается `configured-externally`
   ├── нет CLI → предложить установку:
   │     ├── показать команду (`npm i -g @openai/codex` или аналог)
   │     ├── НЕ запускать автоматически
   │     └── если пользователь установил вручную — re-detect
   └── нет auth → диалог:
         ├── (a) API key в .env.local (OPENAI_API_KEY)
         ├── (b) `codex login` через CLI (subscription)
         └── (c) skip пока что (Realtime-2 секция помечается `pending-auth`)

7. Secrets consolidation
   ├── всё собранное → .env.local (mode 600, atomic write через temp+rename)
   ├── показать summary с маскированными значениями (последние 4 символа)
   ├── подтверждение перед записью
   ├── при существующем .env.local — backup в .env.local.bak (mode 600)
   ├── никаких альтернативных хранилищ в v0.1 (Q6)
   └── ни один секрет не уходит в .env.example, в логи, в Markdown,
        в `.techscope-setup.json`, в git

8. Quality gate
   ├── node scripts/quality-gate.mjs
   ├── зелёный → setup.status = "completed", переход к §9
   └── красный (Q7):
         ├── setup.status = "completed-with-warnings"
         ├── показать список actionable hints (по одному на failure)
         ├── ссылка на `node scripts/self-test.mjs` для диагностики
         ├── exit code = 0 (не блокирует первый опыт)
         └── переход к §9

9. Service install (opt-in, default NO; только при наличии хотя бы
   одного сетевого коннектора — Web/Telegram/Realtime)
   ├── "Установить launchd-сервисы (Mac) / systemd unit (Linux)?"
   ├── default: no
   ├── при yes — требует второго подтверждения и `--yes`-флага в CLI
   ├── на Linux/headless — показать unit template, НЕ ставить
   └── секция результата → operations report (Phase 2 паттерн)

10. First agent quick start
    ├── показать одну команду для создания первого ребёнка:
    │   `node scripts/agents-mother.mjs interview` (или
    │   фразу для Codex thread — "создай агента")
    ├── если §3 включал Telegram — показать pattern для intake
    ├── если §3 включал Realtime-2 — показать команду voice-режима
    ├── ссылка на docs/agents-mother.md
    └── финальное сообщение:
          "Если что-то надо переконфигурировать —
           `node scripts/setup.mjs --reconfigure <section>` или
           снова напиши 'запусти проект' в Codex."
```

### Deliverables

- `07_workflows/first-run-setup.md` — основной workflow, который Codex читает и исполняет в диалоге; включает diff-инструкции по каждой секции диалога и явные правила безопасности.
- `scripts/setup.mjs` — interactive CLI с той же логикой; использует `readline/promises`; работает в headless-режиме (Linux server, CI smoke test).
- `scripts/setup-status.mjs` — машинно-читаемый статус: что настроено, что pending; возвращает JSON.
- `.techscope-setup.json` — gitignored; per-user persistence: какие коннекторы выбраны, какие шаги завершены, версия bootstrap manifest-а. Идемпотентность: re-run пропускает completed шаги; `--reset` или `--only <connector>` для повторной настройки секции.
- `setup/manifest.schema.json` — JSON schema персистируемого состояния (для валидации и для других агентов через Agents Mother).
- `08_templates/first-run-setup-dialog.md` — шаблон для дочерних агентов (Agents Mother сможет генерировать собственный bootstrap для child-агентов).
- Расширенный `.env.example` — все переменные сгруппированы по коннекторам, каждая с однострочным описанием и примером.
- Дополнение `AGENTS.md` — секция «Trigger phrases»:

```markdown
## Trigger phrases

Эти фразы пользователя в Codex thread имеют специальный смысл — Codex
должен распознать их и выполнить связанный workflow вместо обычного
ответа в диалоге:

- "запусти проект" | "setup" | "first run" | "bootstrap" | "start"
  → выполнить 07_workflows/first-run-setup.md
- "проверь проект" | "self test" | "health"
  → выполнить node scripts/self-test.mjs (Phase 8)
- "создай агента" | "new agent" | "interview"
  → выполнить 07_workflows/agents-mother.md → interview
```

- Дополнение `docs/getting-started.md` — добавить раздел «10-second start»:
  - `git clone … && cd … && open -a Codex .`
  - В Codex thread написать «запусти проект».

### Безопасность (строго)

- **Никаких автоматических install-команд** без явного подтверждения пользователя. brew / npm / pip / Tailscale / Codex CLI — только после `yes` и только показом команды (wizard не запускает install сам).
- **Никаких background-сервисов** до Section 9; даже там — требует второго подтверждения и `--yes`.
- **Секреты только в `.env.local`** (Q6), режим `chmod 600`, atomic write через temp+rename, backup существующего в `.env.local.bak`, никогда не выводятся в stdout полностью (маска показывает последние 4 символа).
- **Realtime-2 always-on** (Q2) — обязательный двухэтапный gate: cost+privacy warning перед включением, опция switch-to-PTT всегда доступна. Wizard не пишет `OPENAI_API_KEY` в `.env.local`, если он уже доступен через `codex login` (Q4 smart detection).
- **Token validation** — non-blocking для Telegram (`getMe`) и Realtime (light probe); ошибки помечают секцию `failed` или `pending`, но не прерывают setup.
- **`.techscope-setup.json` — никогда в git**; добавляется в `.gitignore` в Phase 0 ретроактивно или в эту фазу. Никаких секретов внутри — только флаги «section configured».
- **Идемпотентность**: повторный запуск на уже настроенном проекте показывает summary и предлагает `--reset <section>` или `--reconfigure <section>`, ничего не ломает. Изменение existing `.env.local` всегда через backup.
- **Tailscale** (Q3) — только manual `tailscale up`. Никаких `TS_AUTH_KEY` в v0.1.
- **Claude Code** (Q5) — wizard не пытается детектить Claude Code. Если пользователь запускает wizard в Claude Code, его dialog проходит через CLI fallback (`scripts/setup.mjs`), который платформо-агностичен.

### Verification gate

- **Минимальный путь (Q1 default)**:
  1. `rm -rf .techscope-setup.json .env.local`
  2. В Codex thread: «запусти проект».
  3. Пользователь не выбирает ни одного opt-in коннектора в §3.
  4. Wizard проходит §1→§2→§3→§7→§8→§10 (§4–§6, §9 пропущены).
  5. `.techscope-setup.json.status = "completed"`, quality-gate зелёный.
  6. Время прохождения ≤ 3 мин на dev-машине.
- **Полный путь (все коннекторы)**:
  - Включить Web + Telegram (валидный токен) + Realtime-2 (always-on, валидный API key) + Obsidian.
  - §4c должен показать cost+privacy warning **до** записи `OPENAI_API_KEY`.
  - Все секции `status: configured`, quality-gate зелёный.
- **CLI fallback**: `node scripts/setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json` → `.env.local` создан, quality-gate зелёный, статус `completed`.
- **Re-run без изменений**: `node scripts/setup.mjs` → exit 0 + summary «already configured», `.env.local` не перезаписан, существующий `.env.local.bak` не создаётся.
- **Reconfigure**: `node scripts/setup.mjs --reconfigure realtime` → только §4c переспрашивается; `.env.local` атомарно обновляется, backup создан, остальные секции не трогаются.
- `node scripts/setup-status.mjs --json` → возвращает все секции с `status: configured | configured-externally | skipped | pending | failed | pending-auth`.
- **Telegram-валидация**: с заведомо невалидным токеном секция telegram отмечается `failed`, общий setup не падает, пользователь получает actionable hint, exit 0.
- **Tailscale-секция** при отсутствии `tailscale` — не падает, показывает install hint, помечает секцию `skipped`. С работающим Tailscale — предлагает tailnet IP для Web HOST.
- **Codex CLI smart detection** (Q4): с уже настроенным `codex login` wizard НЕ записывает `OPENAI_API_KEY` в `.env.local` и помечает секцию `configured-externally`. Без auth — диалог с тремя опциями.
- **Quality-gate red в конце** (Q7): искусственно сломать одну зависимость → setup завершается со `status: completed-with-warnings`, список actionable hints выведен, exit 0.

### Tests (расширяют Phase 5)

- `tests/setup-state.test.mjs` — schema validation `.techscope-setup.json`.
- `tests/setup-cli.test.mjs` — `--non-interactive` режим с fixture-конфигом; проверка идемпотентности.
- `tests/trigger-phrases.test.mjs` — парсинг фраз и маршрутизация на правильный workflow.

### Rollback

- Удалить `scripts/setup*.mjs`, `07_workflows/first-run-setup.md`, секцию trigger phrases в `AGENTS.md`.
- `.techscope-setup.json` — gitignored, локальное состояние, удаляется руками.

### Follow-up considerations (после resolved decisions)

Эти пункты — не блокеры для старта Phase 12, но должны быть учтены и при необходимости вынесены в отдельные decision records или контракты:

- **Realtime-2 default mode = always-on (Q2).** Перед публичным release нужен короткий `05_decisions/YYYY-MM-DD-realtime-default-mode.md`, фиксирующий принятый trade-off (UX vs cost+privacy) и набор guard-механизмов: cost warning, easy switch to PTT, idle-timeout (предложить mic-suspend через N минут тишины).
- **Cost figures для Realtime warning.** §4c показывает «примерно $X/час». В Phase 12 wizard эта цифра берётся из `docs/realtime.md`, который должен быть создан в Phase 11 (OSS docs). Если на момент исполнения Phase 12 раздел отсутствует — wizard показывает «см. текущие OpenAI rates» без числа и помечает open-todo.
- **Claude Code adapter** (Q5 = out of scope v0.1). Сразу в Phase 12 создаётся `11_agents/contracts/YYYY-MM-DD-pritha-claude-code-adapter-agent-contract.md` как placeholder для будущей Phase 15. Сам adapter — не строится, но контракт фиксирует scope (CLAUDE.md auto-gen, .claude/skills, .claude/agents portage, без voice).
- **`.env.local` backup retention.** При повторных `--reconfigure` backup-файлы (`.env.local.bak.1`, `.env.local.bak.2`, …) могут накапливаться. Решение: rotate-логика на N=3 последних backup-ов. Документируется в `docs/troubleshooting.md`.
- **Tailscale install hint per OS** (Q3). Wizard показывает разный install hint в зависимости от detected OS (Mac brew cask / Linux curl install / Windows winget). Добавить в `scripts/lib/platform.mjs` (создаётся в этой фазе или в Phase 1 paths lib).
- **Quality-gate completed-with-warnings → self-test prompt** (Q7). После такого финала AGENTS.md должен иметь правило: при следующем заходе пользователя в Codex thread, если последний setup был completed-with-warnings, Codex проактивно предлагает запустить `self-test`. Это записывается в дополнение к секции «Trigger phrases».

### AM-pattern harvest hint

`first-run-setup-workflow` — сильный кандидат для Pritha selectable scaffold module. Каждый ребёнок-агент (descendant), у которого больше одного коннектора или внешний API, должен получать аналогичный wizard по контракту. Шаблон `08_templates/first-run-setup-dialog.md` рассчитан именно на это переиспользование. Промоция в scaffold-модуль — только через Phase 14 pattern review.

Также из принятых решений становятся кандидатами:

- `minimal-default-config` (Q1) — паттерн «всё opt-in, минимум по умолчанию» для всех будущих агентов.
- `realtime-voice-opt-in` (Q2) — обязательный cost+privacy gate перед включением Realtime API в любом дочернем агенте.
- `completed-with-warnings-status` (Q7) — non-blocking setup completion, чтобы первый опыт пользователя не блокировался.
- `codex-cli-smart-detection` (Q4) — переиспользуемый блок для интеграции с уже настроенным внешним auth.

---

## Phase 13 — GitHub deploy: репозиторий + CI (English, Pritha)

Status: complete-local; external GitHub publication pending
Risk: medium (риск утечки секретов и локальных путей при первом push)
Depends on: Phase 7, Phase 10 (rebrand), Phase 11 (docs), Phase 12 (wizard)
Estimated effort: 1–2 Codex sessions
AM-pattern candidates: `github-quality-workflow`, `markdown-validate-workflow`, `release-please-config`, `setup-wizard-ci-smoke`, `secure-handoff-folder`, `local-path-scrub`

### Secure handoff (обязательно)

- Все GitHub-операции (создание repo, push, релиз, ротация секретов) выполняются по инструкции из **соседней папки `secure-handoffs/`** (sibling рядом с проектом, **вне** репозитория).
- `secure-handoffs/` **никогда** не коммитится и не попадает в публичный repo. Там же — owner, имя repo (`pritha`), приватные заметки по машине.
- Репозиторий публикуется **на английском**: README, docs, CLI help, code comments, issue/PR templates.

### Pre-push checklist (обязательный)

- `git log --all -- .env .env.local '*.sqlite' '*.token' 'secrets/*'` — пусто.
- `git ls-files | xargs grep -nE '[A-Za-z0-9_-]{30,}'` — ручная проверка возможных токенов.
- `git ls-files | xargs grep -nE '/Users/[a-zA-Z]+|/home/[a-zA-Z]+'` — **нет** локальных абсолютных путей в трекаемых файлах.
- `gitleaks` / `trufflehog` локально (одноразово, без CI-зависимости).
- `.env.example` присутствует, `.env.local` — нет в истории.
- `secure-handoffs/` — не внутри repo и не в git history.
- `LICENSE` присутствует.
- `README.md` (English) пройден свежим взглядом; имя Pritha консистентно.

### Deliverables

- GitHub repo **`pritha`** (private → public flip после ручной верификации):
  - default branch `main`,
  - branch protection: required PR review, required status checks.
- `.github/workflows/quality-gate.yml`:
  - triggers: `pull_request`, `push` to `main`,
  - матрица: `ubuntu-latest`, Node 20 / 22,
  - steps: checkout → setup-node → setup-python → install deps → `node scripts/env-doctor.mjs` → `node scripts/quality-gate.mjs`.
- `.github/workflows/memory-validate.yml`:
  - triggers: `pull_request` с изменениями в `00_inbox/`, `01_sources/`, `02_briefs/`, `03_reviews/`, `04_standards/`, `05_decisions/`, `07_workflows/`, `08_templates/`, `11_agents/`,
  - запускает `validate-memory.mjs` + сравнивает counts.
- `.github/workflows/setup-wizard-smoke.yml`:
  - triggers: `pull_request` с изменениями в `scripts/setup*`, `07_workflows/first-run-setup.md`, `.env.example`,
  - запускает `node scripts/setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json` в чистом контейнере.
- `.github/dependabot.yml` — npm + pip + actions.
- `docs/release.md` — branch protection, release process, semver, tagging.
- Первый релиз: **Pritha `v0.1.0`** tag + GitHub Release с CHANGELOG.

### Verification gate

- PR-симуляция: создать throwaway PR с намеренным регрессом → quality-gate workflow fails.
- PR с зелёными checks → mergeable.
- Чистый clone из публичного репозитория проходит `docs/getting-started.md` без модификаций.

---

## Phase 14 — Pattern harvest и Pritha evolution

Status: complete
Risk: low
Depends on: Phases 0–8 (можно параллельно с Phase 11–13)
Estimated effort: 1 Codex session
AM-pattern candidates: все `AM-CANDIDATE`, накопленные в phase reports

### Goal

Закрыть roadmap evidence-driven и явно решить, какие паттерны Techscope переносит в Pritha (Agents Mother) selectable scaffold-module catalog.

### Deliverables

- `03_reviews/YYYY-MM-DD-techscope-quality-and-release-pattern-review.md`:
  - таблица всех `AM-CANDIDATE` из phase reports;
  - evidence (phase reports, test results, реальный pain в Techscope, который этот паттерн закрыл);
  - recommendation по каждому: `adopt-in-scaffold` | `document-only` | `reject` | `needs-experiment`.
  - отдельная секция «First-run setup as selectable scaffold module?» — решение про Phase 12 wizard.
- `pritha evolve . --notes "quality and release roadmap patterns from 2026-05-28"` (старый `agents-mother.mjs evolve` — alias).
- `pritha registry` — обновлённый `11_agents/registry.md` (House / Genealogy).
- `07_workflows/techscope-quality-audit-log.md` — все фазы помечены complete.
- Для каждого `adopt-in-scaffold` паттерна — отдельный `05_decisions/YYYY-MM-DD-am-pattern-<name>.md` (только после явного согласия пользователя).

### Verification gate

- Review-артефакт существует, AM recommendations явные.
- Registry перестроен.
- **Никаких** изменений в `04_standards/` без отдельного decision per pattern.

### Promotion flow

```text
Phase report (AM-CANDIDATE)
       │
       ▼
Phase 14 pattern review
       │
       ▼
pritha evolve + registry
       │
       ├── adopt-in-scaffold ──► отдельное decision ──► 04_standards (по необходимости) ──► обновление scaffold templates
       ├── document-only      ──► пометка в registry, без изменения scaffold
       ├── reject             ──► короткое обоснование в review
       └── needs-experiment   ──► новый contract в 11_agents/contracts/
```

---

## Master timeline

| # | Phase | Hours | Sessions | Blocker |
|---|---|---|---|---|
| 1 | Phase 0 Foundation | 2–3 | 1 | — |
| 2 | Phase 1 Portable root | 3–5 | 1–2 | Phase 0 |
| 3 | Phase 2 Operational reality | 2–3 | 1 | Phase 1 |
| 4 | Phase 3 Shared lib | 4–6 | 2 | Phase 0, Phase 2 |
| 5 | Phase 4 Dogfooding | 3–4 | 1–2 | Phase 3 |
| 6 | Phase 5 Test layer | 3–5 | 1–2 | Phase 4 |
| 7 | Phase 6 Dependencies | 2 | 1 | Phase 1, Phase 4 |
| 8 | Phase 7 Quality gate | 2 | 1 | Phases 4–6 |
| 9 | Phase 8 Self-test | 2–4 | 1–2 | Phase 7 |
| 10 | Phase 9 AM modularization | 6–10 | 2–4 | Phase 5, Phase 7 |
| 11 | Phase 10 Pritha rebrand | 3–5 | 3–5 | Phase 5, Phase 9 |
| 12 | Phase 11 OSS docs (English) | 4–6 | 2 | Phase 7, Phase 10 |
| 13 | Phase 12 First-run setup wizard | 5–8 | 2–3 | Phases 6, 7, 8, 10, 11 |
| 14 | Phase 13 GitHub deploy (Pritha, EN) | 3–4 | 1–2 | Phases 7, 10, 11, 12 |
| 15 | Phase 14 Pattern harvest | 2 | 1 | Phases 0–13 |

Total: ~48–70 hours, 22–32 Codex sessions. Phases 1–8 — критический путь. Phase 9 (AM modularization) и Phase 10 (Pritha rebrand) — самые рискованные, выполняются только после готовой test infrastructure (snapshot-тесты ловят регрессии переименования). Phase 12 (setup wizard) — главный UX-слой публичного release; должен пройти и в Codex thread, и в headless CLI. Phase 13 — публикация под именем Pritha на английском, через `secure-handoffs/`.

## Audit log format

File: `07_workflows/techscope-quality-audit-log.md` (создаётся в Phase 0, append-only).

Запись на фазу:

```markdown
## Phase N — YYYY-MM-DD

- Codex thread: <optional reference>
- Baseline golden checks: pass | fail
- Phase-specific checks: pass | fail
- Golden checks after: pass | fail
- Report: 11_agents/reports/...
- AM-CANDIDATE patterns: [list]
- Open questions:
- Notes:
```

## Phase report template (минимум)

File naming: `11_agents/reports/YYYY-MM-DD-techscope-quality-phase-N-report.md`.

Секции:

1. **Summary** — что сделано, exit-status.
2. **Changes made** — список файлов (created / modified / deleted).
3. **Verification results** — каждая команда golden-checks + phase-specific → результат.
4. **Regressions observed** — что сломалось и как починено.
5. **Rollback instructions** — точная команда git revert / restore.
6. **AM-CANDIDATE patterns** — explicit list с описанием.
7. **Open questions** — что осталось обсудить.

## Success criteria (roadmap complete)

- [x] `git` инициализирован; runtime-state не tracked; история коммитов отражает каждую фазу.
- [x] `node scripts/quality-gate.mjs` — единая зелёная проверка, используемая локально и подготовленная для CI.
- [x] Techscope проходит собственный `agents-mother test .` **без** critical N/A.
- [x] Shared `scripts/lib/*`; нет копий парсеров; agents-mother modularized.
- [x] Portable root — никаких hardcoded `<USER_HOME>/*` в исполняемом коде.
- [x] `tests/` покрывают frontmatter, slug, paths, contract validation, scaffold snapshot.
- [x] Self-test + queue-health документированы; proactivity — explicit decision.
- [x] **Pritha rebrand** выполнен: `pritha` CLI работает, старый `agents-mother.mjs` — deprecation shim; snapshot-тесты scaffold зелёные; `type`-значения frontmatter не сломаны.
- [x] First-run setup wizard работает в headless CLI (`scripts/setup.mjs --non-interactive`) и задокументирован для Codex thread trigger phrase «запусти проект».
- [ ] Публичный репозиторий **`pritha`** — **на английском**, с зелёным CI, README + LICENSE + CONTRIBUTING + SECURITY; имя Pritha консистентно. Local release prep complete; external GitHub publication pending.
- [x] **Нет утечек**: ни локальных путей (`<USER_HOME>/...`), ни секретов, ни runtime-state в tracked repo; `secure-handoffs/` — вне репозитория. One-time `gitleaks`/`trufflehog` scan remains recommended before public flip.
- [ ] Чистый clone из публичного repo проходит сценарий «10-second start»: `git clone … && open -a Codex .` → «запусти проект» → quality-gate green без правок руками. Local/fresh-clone style checks passed; public clone pending remote.
- [x] `03_reviews/...-pattern-review.md` существует; решения по AM-promotion приняты явно.
- [x] Audit log заполнен по каждой фазе.

## Pattern candidacy summary

Все паттерны, собираемые в течение roadmap, проходят следующие фильтры **до** попадания в Agents Mother selectable scaffold-module catalog:

1. **Local proof** — паттерн реально применён в Techscope и закрыл конкретную проблему (есть evidence в phase report).
2. **Test coverage** — критичная логика паттерна покрыта unit-test-ом или snapshot-ом.
3. **Pattern review** — паттерн рассмотрен в Phase 14 review с явной рекомендацией.
4. **Explicit decision** — для `adopt-in-scaffold` создаётся отдельный `05_decisions/` artifact.
5. **Scaffold change** — только после decision; через отдельный PR с golden checks.

Никакой паттерн не становится стандартом или частью scaffold «по факту удачного запуска». Это защищает Agents Mother от cargo-cult-овых расширений.

## Связь с Agents Mother roadmap

| Эта roadmap (Techscope) | Agents Mother roadmap |
|---|---|
| Улучшает **сам Techscope** как reference implementation | Создаёт **новых агентов** |
| Dogfooding patterns | Scaffold templates |
| `quality-gate`, `self-test`, `env-doctor` | `test`, `handoff`, `operations` commands |
| Phase 14 → evolve / registry | Layer 10 Feedback and Evolution |

Agents Mother Layer 10 уже предусматривает feedback loop. Эта roadmap **кормит** Layer 10 evidence, но не заменяет governance: продвижение в scaffold — только после pattern review и при необходимости отдельного decision.

## Открытость к доработке

Этот roadmap — **рабочий документ**. Любая фаза может быть:

- **разделена** на подэтапы, если diff получился слишком большим (фиксируется в audit-log);
- **пропущена**, если phase report предыдущей фазы показал, что цель уже достигнута;
- **расширена**, если phase-specific checks выявили дополнительный риск;
- **отложена**, если зависимость сорвалась.

Каждое такое изменение оформляется как append в `07_workflows/techscope-quality-audit-log.md` и при существенной правке — как `refines` ссылка в новой версии этого workflow-а (по правилам lifecycle из `AGENTS.md`).

## Immediate next step (Codex)

```text
Начни Phase 0 из 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md.

Цель Phase 0: git init, .gitignore аудит, scripts/golden-checks.mjs,
baseline report в 11_agents/reports/, audit-log в 07_workflows/.

Не переходи к Phase 1. Запусти все golden checks (даже до создания
обёртки), зафиксируй результат в baseline report. Помечай AM-CANDIDATE
паттерны явной секцией.

В конце фазы:
  node scripts/rebuild-memory.mjs
  git add -A
  git commit -m "phase 0: baseline + golden checks harness"
```
