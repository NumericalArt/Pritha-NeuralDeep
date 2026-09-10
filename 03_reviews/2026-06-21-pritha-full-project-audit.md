---
id: 2026-06-21-pritha-full-project-audit
type: review
status: draft
created: 2026-06-21
updated: 2026-06-21
topics:
  - project-audit
  - security
  - code-quality
  - installation
  - cross-platform
tools:
  - node
  - python
  - next.js
  - launchd
  - codex
  - sqlite
sources:
  - local-repo:<PRITHA_ROOT>
  - github:NumericalArt/Pritha
related:
  intakes: []
  briefs: []
  reviews: []
  decisions:
    - 05_decisions/2026-05-28-pritha-public-snapshot-scrub.md
  standards:
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/user-memory-privacy.md
subject:
  kind: pritha-self
  id: pritha
review_status: draft
confidence: high
recommendation: review
---

# Полный аудит проекта Pritha

Дата: 2026-06-21
Статус: draft
Объект: сам проект Pritha (локальный checkout `<PRITHA_ROOT>` + публичный репозиторий `github.com/NumericalArt/Pritha`).
Метод: чтение конфигов, скриптов, хуков, scaffold/intake/realtime-кода; прямые проверки git/gh; запуск проверочных скриптов через subagent-исследование.
Важно: это только находки и рекомендации. Никакие исправления в рамках аудита не применялись.

---

## 0. Резюме

Проект зрелый, дисциплинированный по безопасности и хорошо документированный для своей основной среды (macOS + Codex). Живых секретов в трекаемых файлах нет, scaffold нового агента не тащит секреты родителя, опасные действия (launchd, deploy, voice-write) спрятаны за явным opt-in. Главные слабые места не «дыры», а несогласованности:

1. дефолт записи Codex в Control Center не совпадает с задекларированным в `.env.example`;
2. в публичный снапшот просочились машинно-специфичные пути `<USER_HOME>/...`;
3. нет единой «склонировал и запустил» установки, а инструкции в README/docs расходятся;
4. сильная привязка операционного слоя к macOS (launchd, zsh, mlx-whisper) без разделения для Linux/Windows;
5. наследие имени `techscope` vs публичное `Pritha` и дублирование инфраструктурного кода.

Локальная версия и GitHub идентичны (`main` == `origin/main`, 0/0, дерево чистое), поэтому при клонировании пользователь не теряет функциональность кода/памяти; теряется только «запущенность» UI и сервисов, которые по дизайну поднимаются вручную.

### Таблица severity

| # | Находка | Ось | Severity |
|---|---------|-----|----------|
| S1 | Дефолт `codexWorkspaceWriteAllowed()` = запись разрешена при пустой env, вопреки `.env.example=0` | Безопасность | Высокий |
| S2 | Утечка `<USER_HOME>/...` в трекаемые файлы и снапшот `.memory` | Безопасность/Приватность | Средний |
| S3 | UI-аппрув Codex только по regex ключевых слов; implementation+write может пройти без гейта | Безопасность | Средний |
| S4 | `pre-push-audit --strict` падает и не запускается в CI; gitleaks не в CI | Безопасность | Средний |
| Q1 | Дублирование root-резолва и парсинга env (5 скриптов + TS + scaffold) | Качество | Средний |
| Q2 | Нет линтера/форматтера (eslint/prettier) | Качество | Низкий |
| Q3 | Naming drift `techscope` vs `Pritha`, `TECHSCOPE_*` vs `PRITHA_*` | Качество | Низкий |
| Q4 | Мёртвые/стейл-артефакты (`mockAgents`, `voiceMock`, отсутствующий `control-center-runtime.mjs`) | Качество | Низкий |
| I1 | Нет единого bootstrap; setup не ставит deps и ничего не запускает | Установка | Средний |
| I2 | README не упоминает `pip install` и `npm ci` для control-center; инструкции расходятся | Установка | Средний |
| I3 | Нет `package-lock.json` в корне; control-center на `latest`-версиях | Установка/Воспроизводимость | Средний |
| C1 | UI не воспроизводится «из коробки» (отдельный `npm ci` + build, ключи) | Консистентность | Средний |
| C2 | Машинно-специфичный `allowedDevOrigins` (Tailscale) в `next.config.mjs` | Консистентность | Низкий |
| C3 | Пустое описание репозитория, нет релизов/тегов | Консистентность | Низкий |
| X1 | macOS-привязки: launchd/launchctl, zsh-обёртки, хардкод путей | Кросс-платформа | Средний |
| X2 | `requirements.txt` безусловно пинит `mlx-whisper` (Apple Silicon) → pip падает на Linux/Windows | Кросс-платформа | Средний |
| X3 | POSIX-допущения: `sh -lc`, `ln -sf`, executable-бит, `HOME`, `python3` | Кросс-платформа | Средний |

---

## 1. Безопасность

### 1.1 Что сделано хорошо

- Секреты живут только в gitignored `.env.local` (атомарная запись, режим 0600); трекается лишь `.env.example` с плейсхолдерами (`.gitignore:7-18`, `scripts/setup.mjs:364`).
- В трекаемых файлах нет живых ключей/токенов (нет совпадений `sk-`, `ghp_`, `AKIA`, токенов Telegram, `OPENAI_API_KEY=<value>`). История git без `.env`/`.env.local`.
- В `package.json` нет `preinstall`/`postinstall`/`prepare` — `npm install` не выполняет проектного кода.
- Git-хуки не активны на свежем клоне: нужен ручной `git config core.hooksPath .githooks` (`.githooks/README.md`). `pre-commit` гоняет quality-gate, `pre-push` отсутствует.
- launchd/cron/долгоживущие сервисы не ставятся автоматически: в `launchd/` лежат только шаблоны с плейсхолдерами; установка — явное действие пользователя.
- Scaffold нового агента (`scripts/agents-mother/scaffold/index.mjs`) пишет только свежие шаблоны и НЕ копирует `.env`/`.env.local`/`.memory`/`.queue`/`.logs`/`.private`/токены; отказывается перезаписывать существующие файлы; в генерируемый `AGENTS.md` зашита инструкция «не копировать секреты».
- Telegram-intake fail-closed: пустой `TECHSCOPE_TELEGRAM_ALLOWED_USER_IDS` → deny-all; текст/URL/Telegram-ID/имена файлов не сохраняются в трекаемую память; скачивание медиа в intake отключено (`scripts/process-intake.mjs`).
- Память user-model (`.private/user-memory/`, `.memory-private/`) gitignored и не трекается (`04_standards/user-memory-privacy.md`).

### 1.2 S1 (Высокий) — дефолт записи Codex не совпадает с декларацией

`.env.example` декларирует безопасный дефолт:

```35:37:<PRITHA_ROOT>/.env.example
PRITHA_REALTIME_CODEX_MODE=exec
PRITHA_REALTIME_CODEX_WRITE_ENABLED=0
PRITHA_REALTIME_CODEX_TIMEOUT_MS=300000
```

Но рантайм Control Center при незаданной переменной берёт `"explicit"`, что трактуется как **запись разрешена**:

```2214:2217:<PRITHA_ROOT>/interfaces/control-center/src/lib/realtime/pritha-runtime.ts
function codexWorkspaceWriteAllowed() {
  const value = env("PRITHA_REALTIME_CODEX_WRITE_ENABLED", env("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", "explicit")).toLowerCase();
  return value !== "0" && value !== "false" && value !== "disabled" && value !== "read-only";
}
```

Voice-эксперимент при этом дефолтит безопасно:

```233:234:<PRITHA_ROOT>/interfaces/experiments/pritha-voice-control/server.mjs
  if (env("TECHSCOPE_VOICE_CODEX_WRITE_ENABLED", "0") !== "1") return "read-only";
```

Риск: пользователь, поднявший Control Center без копирования значений из `.env.example`, получает Codex с правом записи в workspace, хотя документация утверждает обратное. Это прямое расхождение «декларация vs поведение» в самом чувствительном месте.

### 1.3 S2 (Средний) — машинно-специфичные пути в публичном снапшоте

`<USER_HOME>/...` присутствует примерно в 10 трекаемых файлах вне `.memory/` и переиндексирован в снапшот памяти:

- `03_reviews/2026-06-12-voice-...-voice-session-memory.md`, `03_reviews/2026-06-14-voice-...-voice-session-memory.md`
- `11_agents/contracts/2026-06-12-stupidjoke-agent-contract.md`
- `11_agents/reports/2026-06-12-stupidjoke-agent-*.md` (несколько файлов)
- `scripts/launchd-root-audit.mjs` + `tests/launchd-root-audit.test.mjs` (здесь путь — осознанная константа проверки stale-root, но всё равно «прошит» `<LEGACY_TECHSCOPE_ROOT>`)
- `.memory/techscope.sqlite` (~17 MiB) и `.memory/last-rebuild.sql` (~18 MiB) переиндексируют те же пути.

Это не учётные данные, но fingerprint пользователя и раскладки машины в публичном репозитории. Расходится с намерением `05_decisions/2026-05-28-pritha-public-snapshot-scrub.md`; `pre-push-audit --strict` именно на этом и падает (находка `local-absolute-paths`).

### 1.4 S3 (Средний) — аппрув Codex в Control Center только по ключевым словам

UI-гейт ставит задачу на подтверждение, лишь если текст задачи совпал с regex (`deploy|publish`, `delete|remove`, `secret|credential|token`, `launchctl|launchd|cron`) — `pritha-runtime.ts:2327-2347`. При этом `codex exec` запускается с `approval_policy="never"` на уровне CLI (`~2734-2750`). Поэтому задача `task_type=implementation` + `write_mode=workspace_write` с «безобидной» формулировкой, не попавшей под regex, может выполниться с записью без UI-подтверждения — если запись включена (см. S1). Модель сама выбирает `task_type`/`write_mode`. Гейт по содержимому — слабее, чем гейт по самому факту записи.

Хорошее: запись в память требует `operator_confirmation`; секреты дочерних агентов пишутся через API в `.env.local` 0600 и маскируются; Control Center по умолчанию слушает localhost.

### 1.5 S4 (Средний) — release-аудиты не в CI

- CI (`.github/workflows/quality-gate.yml`) запускает только `quality-gate.mjs`. Он включает `privacy-audit --strict`, но НЕ `pre-push-audit --strict`.
- `privacy-audit.mjs` проверяет intake/URL/Telegram-ID и raw-paths (`scripts/lib/privacy.mjs`), но не ключи API и не абсолютные пути.
- `pre-push-audit.mjs` шире (история секретов, абсолютные пути, forbidden tracked files, portable-memory-snapshot), но запускается только вручную и сейчас красный.
- `.gitleaks.toml` — лишь allowlist хэшей для `.memory/last-rebuild.sql`; gitleaks/trufflehog в CI не запускаются.

Итог: репозиторий может пройти CI, но не пройти release-аудит (сейчас так и есть из-за S2). Перед публичным «флипом»/релизом нет автоматической сетки безопасности.

---

## 2. Чистота и качество кода

### 2.1 Q1 (Средний) — дублирование инфраструктурного кода

Канон резолва корня:

```18:25:<PRITHA_ROOT>/scripts/lib/paths.mjs
export function resolveTechscopeRoot(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  if (process.env.TECHSCOPE_ROOT) {
    const envRoot = path.resolve(process.env.TECHSCOPE_ROOT);
    if (existsSync(envRoot)) return envRoot;
  }
  return gitRootFromCwd(cwd) || cwd;
}
```

Но 5 скриптов используют свой вариант без git-fallback (`self-test.mjs:8-11`, `golden-checks.mjs`, `quality-gate.mjs:9-11`, `queue-health.mjs`, `audit-report.mjs`):

```9:11:<PRITHA_ROOT>/scripts/quality-gate.mjs
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_ROOT = process.env.TECHSCOPE_ROOT ? path.resolve(process.env.TECHSCOPE_ROOT) : "";
const ROOT = ENV_ROOT && existsSync(ENV_ROOT) ? ENV_ROOT : DEFAULT_ROOT;
```

Control Center переопределяет резолв ещё раз в TS (`pritha-runtime.ts:199`), а парсинг env реализован в `scripts/lib/env.mjs`, в `interfaces/control-center/src/lib/.../env-store.ts` и в генерируемых scaffold-скриптах (4-я копия, читает только `.env`, без `.env.local`). При нормальном checkout поведение совпадает, но при stale `TECHSCOPE_ROOT` или запуске вне репо варианты расходятся.

### 2.2 Q2 (Низкий) — нет линтера/форматтера

Ни в корне, ни в `interfaces/control-center` нет eslint/prettier/biome и `devDependencies` для них. Качество держится на `golden-checks.mjs` + `node --test` (+ ручной `tsc --noEmit` в control-center). ESLint упомянут только в дизайн-доке `docs/ui-design/...coding-plan.md`, но не внедрён.

### 2.3 Q3 (Низкий) — naming drift

Публично «Pritha», внутри всё ещё `techscope`: имя npm-пакета `"techscope"` (`package.json:2`), `.techscope-setup.json`, `.memory/techscope.sqlite`, схемы (`techscope-setup-state-v1`, `techscope-quality-gate-v1`), launchd-метки `com.techscope.*`, и семейство env `TECHSCOPE_*`. Новый слой использует `PRITHA_*` с fallback на `TECHSCOPE_*`. По `AGENTS.md` имя `Techscope` допустимо для внутренних путей/совместимости, так что это осознанный долг, но для нового читателя путано.

### 2.4 Q4 (Низкий) — мёртвый/стейл-код

- `interfaces/control-center/src/data/mockAgents.ts` — демо-данные `mockAgents` не используются в проде (страницы берут реальные данные через `getControlCenterStatus()`).
- `voiceMock` в `mockControlCenter.ts` нигде не импортируется.
- `scripts/control-center-runtime.mjs` ожидается scaffold-шаблонами и снапшот-тестом, но в самом репо отсутствует (генерится только в дочерних агентах) — потенциальная путаница.

### 2.5 Тесты

26 unit-файлов в `tests/` (paths, frontmatter, slug, privacy, quality-gate, setup, env-doctor, agents-mother-*, scaffold-snapshot, voice, launchd-root-audit и т.д.). Вне покрытия: `telegram-bot.mjs`, `process-intake.mjs`, `techscope-web.mjs`, основной `control-center/server`, а Playwright-e2e существует, но в CI не запускается.

### 2.6 Прочее

- Два web-UI одновременно «active» в `interfaces/manifest.json`: legacy `techscope-web` (порт 3000) и экспериментальный Control Center (3420).
- TODO/FIXME/HACK в `scripts/` и `interfaces/` не найдены.
- Обработка ошибок единообразна (`process.exit(1)` после печати, структурный `run()` в `status-lib.mjs`), но общего модуля логирования/ошибок нет; `env-doctor.mjs` работает только с `process.env`, не резолвит корень.

---

## 3. Простота установки с GitHub

### 3.1 I1 (Средний) — нет единого self-executing bootstrap

`node scripts/setup.mjs` пишет `.env.local` (`TECHSCOPE_ROOT` + выбранные коннекторы) и гоняет `quality-gate.mjs`, но НЕ ставит npm/pip-зависимости и ничего не запускает (`scripts/setup.mjs:347-381`). Это осознанная политика:

```62:64:<PRITHA_ROOT>/07_workflows/first-run-setup.md
4. Do not install dependencies, launch services, enable launchd, start cron,
   run background queues or publish anything without a separate explicit user
   confirmation.
```

То есть «минимум действий, полное разворачивание, автозапуск Pritha» сейчас не достигается одной командой: нет скрипта, который последовательно ставил бы pip-deps, `npm ci` для control-center, выполнял setup и (опционально, по флагу) запускал интерфейс.

### 3.2 I2 (Средний) — расходящиеся и неполные инструкции

- `README.md` (10-min start) → clone, `cp .env.example .env`, `env-doctor`, `quality-gate`, `pritha create`.
- `docs/getting-started.md` → `setup.mjs --non-interactive --config tests/fixtures/setup-minimal.json`.
- `07_workflows/first-run-setup.md` → Codex-диалог «запусти проект» или `setup.mjs`.

`README` не упоминает `python3 -m pip install --user -r requirements.txt` и `npm --prefix interfaces/control-center ci`. Без pip-зависимостей quality-gate упирается в env-doctor и завершается `completed-with-warnings`; без `npm ci` не поднимается UI.

### 3.3 I3 (Средний) — воспроизводимость зависимостей

В корне нет `package-lock.json` (хотя у корня и нет npm-зависимостей). `interfaces/control-center/package.json` тянет `next`/`react`/`typescript` как `"latest"` — установки в разное время дадут разные версии. Python-deps запинены (`requirements.txt`), но см. X2.

---

## 4. Консистентность local ↔ GitHub ↔ пользователь

### 4.1 Подтверждённая парность

- `git rev-list --left-right --count origin/main...HEAD` → `0  0`; `git diff --stat origin/main..HEAD` пуст; дерево чистое. Код, Markdown и снапшот `.memory` идентичны origin. **Функциональность кода при клонировании не теряется.**
- Снапшот памяти (`.memory/techscope.sqlite`, `last-rebuild.sql`, `schema.sql`) трекается, поэтому пользователь получает rebuildable память (по дизайну `AGENTS.md`/`.memory/README.md`).

### 4.2 C1 (Средний) — UI не воспроизводится «из коробки»

Клон даёт исходники и снапшот памяти, но НЕ запущенный UI:
- Control Center требует отдельный `npm --prefix interfaces/control-center ci` + `build`.
- voice/realtime требуют ключей (`OPENAI_API_KEY`) и Codex CLI.
- Флот дочерних агентов на страницах зависит от соседних папок на диске пользователя, которых у него нет.

То есть UI-«поверхность» у пользователя по умолчанию беднее, чем у вас локально, пока он не выполнит установку и не задаст ключи.

### 4.3 C2 / C3 (Низкий)

- `interfaces/control-center/next.config.mjs` содержит `allowedDevOrigins` с конкретным Tailscale-хостом (`*.ts.net`) — у пользователя не совпадёт; в dev это может мешать.
- Репозиторий публичный, но **описание пустое** и **нет релизов/тегов** — снижает «считываемость» и доверие нового пользователя; нет явной отметки версии для клона.

---

## 5. Кросс-платформенность (Windows / Linux / Android)

### 5.1 X1 (Средний) — привязка к macOS в операционном слое

- launchd-шаблоны и `launchctl bootstrap/bootout` в `operations/manifest.json`; `scripts/launchd-root-audit.mjs` (на не-Darwin корректно skip).
- zsh-обёртки `scripts/run-techscope-web.sh`: `#!/bin/zsh`, zsh-специфичный `${0:a:h}`, хардкод `/usr/bin/python3`, `/Applications/Codex.app/...`, Homebrew-путей, и похоже машинный IP в `HOST`.

### 5.2 X2 (Средний) — `requirements.txt` ломает pip вне macOS

```1:3:<PRITHA_ROOT>/requirements.txt
sentence-transformers==5.1.2
imageio-ffmpeg==0.6.0
mlx-whisper==0.4.3
```

`mlx-whisper` — только Apple Silicon. `pip install -r requirements.txt` на Linux/Windows падает. В `env-doctor.mjs:198-207` это уже трактуется как platform-conditional (critical на macOS, warning иначе), и CI на Ubuntu ставит подмножество без mlx-whisper — но сам `requirements.txt` не разделён, поэтому документированная команда установки на чужой платформе не работает.

### 5.3 X3 (Средний) — POSIX-допущения

- `sh -lc 'command -v ...'` — `scripts/env-doctor.mjs:142`, `scripts/pre-push-audit.mjs:30` (нет на чистом Windows без Git Bash/WSL).
- `ln -sf` без Windows-fallback — `scripts/media/core/tooling.mjs:81`.
- проверка executable-бита — `scripts/smoke-test.mjs:39-45` (на Windows `+x` не сохраняется).
- хардкод `python3` (не `py -3`), `process.env.HOME` без `USERPROFILE` — `scripts/lib/module-readiness.mjs:26`.

### 5.4 Сводка по платформам

| Платформа | Состояние |
|-----------|-----------|
| macOS | Основная цель; launchd, mlx-whisper, zsh, Codex.app |
| Linux | Core рабочий (CI на Ubuntu зелёный без mlx-whisper); нет launchd; транскрипция медиа требует альтернативного Whisper |
| Windows | Несколько поломок (`sh -lc`, `ln -sf`, zsh, `python3`, executable-бит); реально — через WSL |
| Android | Не поддерживается (тяжёлый ML-стек, Codex-центричность) |

### 5.5 Минимальные шаги к Win/Linux

1. Разделить `requirements.txt` → `requirements-core.txt` (sentence-transformers, imageio-ffmpeg) + `requirements-macos.txt` (mlx-whisper); в доках/setup ставить по платформе.
2. Заменить `sh -lc 'command -v'` на Node-резолв (`which`/`where`/спавн с `shell:true`, как уже сделано в `tooling.mjs`).
3. Заменить `ln -sf` на `fs.symlink` с junction-fallback (или copy) на Windows.
4. Платформенно гейтить или убрать executable-проверки в `smoke-test.mjs`.
5. Заменить zsh-обёртки на Node-энтрипоинты (`scripts/techscope-web.mjs` уже существует).
6. `os.homedir()` вместо `process.env.HOME`.
7. Добавить опциональный `scripts/bootstrap.mjs` (pip + npm ci + setup), сервисы — только за явными флагами.

---

## 6. Состояние GitHub (приложение)

- Репозиторий: `github.com/NumericalArt/Pritha`, **PUBLIC**, лицензия MIT, описание пустое, **релизов нет**.
- `pushedAt`: 2026-06-21; default branch `main`.
- CI (`Quality Gate`): последний прогон на `main` — **success** (коммит про установку control-center deps); перед ним два **failure**.
- Открытые PR: 2 dependabot (`sentence-transformers 5.6.0`, `actions/checkout 7`), оба с **красным** CI.
- Удалённые ветки: `main`, dependabot-ветки; локально также `backup/pre-privacy-rewrite-...`, `pritha-lifecycle-voice-permissions`, второй remote `numericalart`.
- Local ↔ origin/main: 0 ahead / 0 behind, дерево чистое — полная парность.

---

## 7. Рекомендации (без выполнения), по приоритету

Высокий:
1. **S1:** привести дефолт `codexWorkspaceWriteAllowed()` к `.env.example` — при незаданной env считать запись запрещённой (`0`/read-only). Сейчас декларация и поведение противоречат друг другу.

Средний:
2. **S3:** требовать UI-аппрув для любого `write_mode=workspace_write`, а не только при совпадении ключевых слов.
3. **S2:** заскрабить `<USER_HOME>/...` в трекаемых отчётах/voice-session-memory и в `stupidjoke-*`, заменить на плейсхолдеры/`<project-root>`; пересобрать `.memory`-снапшот; для `launchd-root-audit.mjs` хранить пример-путь как нейтральную константу/фикстуру.
4. **S4:** добавить `pre-push-audit --strict` (и/или gitleaks) в CI как release-gate; либо расширить `privacy-audit` проверкой абсолютных путей.
5. **I1/I2/I3:** добавить опциональный `scripts/bootstrap.mjs`; синхронизировать README/docs (включить `pip install` и `npm ci`); запинить версии control-center и добавить lockfile.
6. **C1:** в README явно описать, что нужно для запуска UI/voice (deps, build, ключи), чтобы ожидания пользователя совпадали с локальным опытом.
7. **X1/X2/X3:** шаги из §5.5 (split requirements, Node-замены POSIX-вызовов, Node-энтрипоинты).
8. **Q1:** консолидировать резолв корня на `resolveTechscopeRoot()` и единый парсер env.

Низкий:
9. **Q2:** добавить eslint/prettier (или biome) хотя бы в control-center.
10. **Q3:** зафиксировать политику именования `techscope`/`Pritha` (где остаётся legacy, где переименовываем) одним решением.
11. **Q4:** удалить/пометить мёртвые `mockAgents`/`voiceMock`; прояснить статус `control-center-runtime.mjs`.
12. **C2/C3:** убрать машинный Tailscale-хост из `next.config.mjs` (через env); заполнить описание репозитория и выпустить первый тег/релиз.

---

## 8. Что НЕ является проблемой (для контекста)

- Отсутствие автозапуска сервисов и неактивные git-хуки на клоне — это сознательная и правильная модель безопасности, не баг.
- Коммит `.memory/techscope.sqlite` — осознанный portability-слой по `AGENTS.md` (а не нарушение, при условии что снапшот заскраблен).
- Эти моменты не нужно «чинить»; их трогаем только в части скраба путей (S2).
