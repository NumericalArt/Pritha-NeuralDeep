---
id: 2026-06-20-settings-page-codex-limits-coding-plan
type: workflow
status: draft
created: 2026-06-20
updated: 2026-06-20
topics:
  - pritha-control-center
  - settings
  - openai-api-keys
  - codex
  - realtime-voice
  - limits
  - responsive-design
tools:
  - Next.js
  - React
  - TypeScript
  - OpenAI Realtime API
  - OpenAI Admin API
  - Codex App
  - Codex CLI
sources:
  - docs/ui-design/2026-06-04-settings-page-implementation-guide.txt
  - docs/ui-design/2026-06-04-pritha-control-center-coding-plan.md
  - interfaces/control-center/src/components/settings/SettingsControlPage.tsx
  - interfaces/control-center/src/components/settings/VoiceSettingsSection.tsx
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
  - interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts
  - https://developers.openai.com/codex/auth
  - https://developers.openai.com/codex/models
  - https://developers.openai.com/codex/speed
  - https://developers.openai.com/codex/app-server
  - https://developers.openai.com/codex/pricing
  - https://developers.openai.com/api/docs/guides/realtime-costs
  - https://developers.openai.com/api/reference/administration/overview
  - https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs/
  - https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/completions/
  - https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/spend_alerts/methods/create
  - https://developers.openai.com/api/reference/typescript/resources/admin/subresources/organization/subresources/projects/subresources/rate_limits/methods/update_rate_limit
related:
  interfaces:
    - interfaces/control-center/
  workflows:
    - 07_workflows/2026-06-12-control-center-voice-page-roadmap.md
    - 07_workflows/2026-06-12-control-center-agents-page-roadmap.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/agent-interface-experience.md
supersedes: []
superseded_by: []
privacy: public
retention: design-draft
review_status: draft
confidence: high
---

# Settings Page Codex And Limits Coding Plan

## 0. Цель

Расширить `/settings` в Pritha Control Center так, чтобы страница стала
рабочей панелью настройки:

- локальных OpenAI API keys для Realtime Voice Control;
- внешней авторизации Codex App / Codex CLI через subscription auth;
- Codex runtime поведения: transport, model, reasoning, fast mode, sandbox,
  network, timeout;
- текущего Voice Control поведения без регрессий;
- будущих Limits с честными источниками данных и без fake quota;
- compact responsive UX без превращения Settings в тяжелую admin panel.

Основной UX: Settings остается одной страницей с вертикальным скроллом.
Верхняя линейка `General | Access | Codex | Voice | Limits | Proactivity`
работает как anchor navigation:

- click по пункту плавно скроллит к соответствующей секции;
- активный пункт подсвечивается через текущую видимую секцию;
- на desktop сохраняется right rail;
- на mobile tabs остаются горизонтально прокручиваемыми, без вложенных
  экранов и без больших модальных форм.

Это проще и устойчивее, чем делать шесть отдельных локальных tab-panels:
на мобильном пользователь видит одну последовательную Settings page, а верхнее
меню быстро переносит его к нужному месту.

## 1. Принятые Решения

### 1.1. Где хранить `OPENAI_API_KEY`

Решение v1: хранить как server-side Control Center secret в локальном
ignored env-store.

Порядок выбора файла:

1. Если задан `PRITHA_CONTROL_CENTER_ENV_FILE`, писать в этот файл.
2. Иначе писать в canonical root `.env.local`, найденный через
   `TECHSCOPE_ROOT` / git root / current working directory fallback.

Причины:

- `pritha-runtime.ts` уже читает root `.env`, root `.env.local`,
  process cwd `.env`, process cwd `.env.local` и затем
  `PRITHA_CONTROL_CENTER_ENV_FILE`;
- `.env.example` уже документирует `OPENAI_API_KEY` и
  `PRITHA_CONTROL_CENTER_ENV_FILE`;
- это совпадает со стилем проекта: env-first, без hardcoded user paths;
- ключ нужен серверу для создания ephemeral Realtime sessions, а не браузеру;
- это не Codex subscription credential и не должен попадать в `~/.codex`.

Правила безопасности:

- не писать ключ в tracked files;
- не показывать значение ключа в API responses, UI, logs, audit events;
- показывать только readiness, source file label и masked suffix;
- файл создавать с mode `0600`, если возможно;
- перед записью делать backup рядом с env-store или в private backup folder;
- update должен быть confirmation-required;
- после успешной записи обновить `process.env.OPENAI_API_KEY` в текущем
  Next server process, чтобы Voice Control мог заработать без обязательного
  restart, если runtime это позволяет.

### 1.2. Что дает `OPENAI_ADMIN_API_KEY` для Limits

Admin API key не нужен для Realtime session creation. Он нужен только для
Administration API.

Что он дает:

- читать organization/project API usage и costs;
- группировать usage/costs по project, API key, model, line item,
  service tier, user где endpoint это поддерживает;
- смотреть и менять project rate limits;
- создавать/list/update/delete organization/project spend alerts;
- управлять organization resources, если key имеет соответствующие права.

Что он не дает:

- не является обычным `OPENAI_API_KEY`;
- не подходит для Realtime/Responses model calls;
- не является надежным источником ChatGPT/Codex subscription remaining limits;
- не заменяет Codex usage dashboard и CLI `/status`;
- не должен автоматически менять платформенные лимиты без явного approval.

Решение v1:

- `OPENAI_ADMIN_API_KEY` не обязателен;
- в Limits показывать optional карточку `Admin API telemetry`;
- если ключ не настроен, статус: `Admin API key not configured`;
- v1 не меняет remote OpenAI project rate limits и не создает spend alerts;
- write operations для rate limits/spend alerts вынести в deferred phase и
  сделать confirmation-required.

### 1.3. Fast Mode

Решение v1: добавить выбор Fast Mode в UI сразу.

Правила:

- UI показывает `Standard` / `Fast`;
- Fast доступен только для моделей, где Codex docs заявляют поддержку
  ChatGPT-auth fast mode: `gpt-5.5`, `gpt-5.4`;
- для `gpt-5.4-mini` и `gpt-5.3-codex-spark` показывать disabled/pending
  reason;
- при API-key auth Fast mode не считается включенным, потому что docs
  говорят, что API key usage идет по standard API pricing;
- для Codex CLI применять через config overrides:
  `-c service_tier="fast"` и `-c features.fast_mode=true`;
- для Codex App Server применять только если локально подтверждено, что
  текущая schema принимает service tier / fast mode field. Иначе сохранять
  настройку и показывать `Saved; app-server adapter pending`.

## 2. Target Information Architecture

Страница остается `/settings`.

Top anchor menu:

```text
General | Access | Codex | Voice | Limits | Proactivity
```

Sections:

1. `General`
   - Language
   - OpenAI API Key
   - Codex Subscription Auth
   - Appearance
   - Data & Storage
2. `Access`
   - текущий Access & Connections без изменения смысла
3. `Codex`
   - Deep Task Transport
   - Model
   - Reasoning Level
   - Speed
   - Sandbox
   - Network Access
   - Task Timeout
4. `Voice`
   - Sticky Context
   - Behavior Detail
   - Pritha Voice
   - Voice runtime status
5. `Limits`
   - Codex subscription usage status
   - Realtime local usage estimate
   - OpenAI API usage/cost telemetry
   - Deferred local pause policy preview
6. `Proactivity`
   - оставить текущую manual/planned/not installed карточку
   - не включать cron, heartbeat, launchd или background watcher

Right rail остается summary-only:

- Pritha Summary
- Capability Overview / Limits summary
- Proactivity summary

Right rail не должен дублировать все controls.

## 3. Backend/Data Model

### 3.1. Extend runtime settings

Текущий `PrithaRuntimeSettings`:

```ts
type PrithaRuntimeSettings = {
  deepTaskPrimaryTransport: "codex-app" | "codex-cli";
  codexModel: string;
  codexWorkdir: string;
  codexSandbox: "auto" | "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess: boolean;
  codexApproval: "never";
  codexTimeoutMs: number;
  voiceBehaviorProfile: VoiceBehaviorProfile;
  prithaVoice: PrithaVoiceId;
  updatedAt: string;
};
```

Добавить:

```ts
type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
type CodexServiceTier = "standard" | "fast";

type PrithaRuntimeSettings = {
  ...
  codexReasoningEffort: CodexReasoningEffort;
  codexServiceTier: CodexServiceTier;
};
```

Defaults:

```ts
codexModel: "gpt-5.5" if no env/config value exists
codexReasoningEffort: "medium"
codexServiceTier: "standard"
```

Env compatibility:

- keep `PRITHA_REALTIME_CODEX_MODEL`;
- optionally support `PRITHA_REALTIME_CODEX_REASONING_EFFORT`;
- optionally support `PRITHA_REALTIME_CODEX_SERVICE_TIER`.

Normalization:

- accept only known effort values;
- map UI label `very_high` to stored `xhigh`;
- if unsupported service tier is received, fallback to `standard`;
- clamp timeout as current code already does.

### 3.2. Runtime settings route

Update:

- `interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts`

Add payload fields:

```ts
codexReasoningEffort?: string;
codexServiceTier?: string;
```

Validation:

- invalid effort returns `400 invalid_codex_reasoning_effort`;
- invalid tier returns `400 invalid_codex_service_tier`;
- saving voice settings must not accidentally erase codex settings;
- saving codex settings must not accidentally erase voice settings.

Recommended split:

- keep one backend route for now to reduce migration risk;
- split UI into separate components;
- later, if needed, introduce `/api/settings/codex-runtime`.

### 3.3. Apply model/reasoning/speed to Codex CLI

Update `runCodexCliTask` in `pritha-runtime.ts`.

Current CLI args already apply:

- `-m <model>` when `settings.codexModel` exists;
- sandbox;
- network config;
- timeout.

Add:

```ts
if (settings.codexReasoningEffort) {
  args.push("-c", `model_reasoning_effort="${settings.codexReasoningEffort}"`);
}

if (settings.codexServiceTier === "fast" && modelSupportsFastMode(settings.codexModel)) {
  args.push("-c", `service_tier="fast"`);
  args.push("-c", "features.fast_mode=true");
}
```

Important:

- do not use Fast mode for API-key auth if auth status says API-key only;
- if auth status cannot be determined, allow setting to be saved but include
  warning in status;
- do not silently pass invalid model names.

### 3.4. Apply model/reasoning to Codex App Server

Update:

- `interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts`

Current app-server call hardcodes:

```ts
effort: effortForTask(payload.taskType)
```

Change to inject settings into client:

```ts
type CodexAppServerClientOptions = {
  ...
  getRuntimeSettings?: () => {
    codexModel: string;
    codexReasoningEffort: CodexReasoningEffort;
    codexServiceTier: CodexServiceTier;
  };
}
```

Then pass:

```ts
model: settings.codexModel || undefined,
effort: settings.codexReasoningEffort || effortForTask(payload.taskType),
```

Fast mode for app-server:

- first inspect generated schema or run a controlled local smoke test;
- do not invent a field name;
- if unsupported, show UI status `Fast saved; not applied to Codex App Server`.

### 3.5. Codex auth status/actions

Add a small server module:

```text
interfaces/control-center/src/lib/settings/codex-auth.ts
```

Responsibilities:

- locate Codex binary using existing `codexBin()` logic or a shared helper;
- run safe read-only diagnostics:
  - `codex --version`;
  - `codex doctor` only if output is bounded and sanitized;
  - maybe `codex debug models --bundled` for model catalog if cheap and safe;
- never read or return `~/.codex/auth.json`;
- never expose access tokens;
- classify:
  - `codex_cli_installed`
  - `codex_app_server_available`
  - `auth_status: unknown | ready | missing | needs_user_action`
  - `auth_method: unknown | chatgpt | api_key | access_token`

Routes:

```text
GET  /api/settings/codex-auth
POST /api/settings/codex-auth/login-plan
POST /api/settings/codex-auth/device-login-plan
```

v1 behavior:

- do not launch long-running interactive login automatically from the browser;
- return exact operator command and explanation:
  - `codex login`
  - `codex login --device-auth`
  - `codex app .`
- if a later implementation starts an interactive login process from UI, it
  must be explicit confirmation-required and surface logs without secrets.

### 3.6. OpenAI key status and mutation

Add:

```text
interfaces/control-center/src/lib/settings/env-store.ts
interfaces/control-center/src/lib/settings/openai-credentials.ts
interfaces/control-center/src/app/api/settings/openai-credentials/route.ts
```

GET response:

```ts
type OpenAICredentialsStatus = {
  openaiApiKey: {
    name: "OPENAI_API_KEY";
    configured: boolean;
    status: "ready" | "missing";
    source: "process_env" | "control_center_env_file" | "root_env_local" | "unknown";
    storageTarget: string;
    maskedValue?: string;
    lastUpdated?: string;
    browserExposure: "ephemeral_only";
    purpose: "Realtime Voice Control server-side session creation";
  };
  adminApiKey: {
    name: "OPENAI_ADMIN_API_KEY";
    configured: boolean;
    status: "ready" | "missing" | "optional";
    source: ...;
    browserExposure: "server_only";
    purpose: "Optional read-only Admin API telemetry for Limits";
  };
};
```

POST body:

```ts
{
  name: "OPENAI_API_KEY" | "OPENAI_ADMIN_API_KEY",
  value: string,
  confirmation: "save-openai-key"
}
```

Rules:

- reject empty values;
- basic format validation only, not a network test by default;
- optional `validate: true` can call a cheap server-side endpoint later;
- write through env-store helper;
- update `process.env[name]`;
- append private audit event without value.

Do not reuse child-agent credential drawer directly because this is not a
child-agent `.env.local`; it is Control Center / Pritha runtime configuration.

### 3.7. Limits data model

Add local type:

```ts
type SettingsLimitsState = {
  codexSubscription: {
    status: "unavailable" | "manual" | "ready";
    source: "codex_usage_dashboard" | "codex_cli_status" | "codex_app_server" | "none";
    remainingPercent?: number;
    detail: string;
  };
  realtimeUsage: {
    status: "ready" | "collecting" | "unavailable";
    today: RealtimeUsageBucket;
    week: RealtimeUsageBucket;
    estimatedCostUsd?: number;
  };
  openaiApiUsage: {
    status: "missing_admin_key" | "ready" | "failed" | "not_configured";
    todayCostUsd?: number;
    monthCostUsd?: number;
    groupedBy?: "project" | "api_key" | "model";
  };
  localPausePolicy: {
    enabled: boolean;
    thresholdPercent: number;
    action: "warn_only" | "block_codex_deep_tasks";
    source: "planned" | "local";
  };
};
```

v1:

- show `codexSubscription.status = manual/unavailable` unless a real adapter
  exists;
- collect Realtime usage from local events if implementation is already
  available; otherwise show `collecting`;
- Admin API telemetry is optional and read-only;
- local pause policy is visible as planned, not enforcing until a later phase.

Deferred enforcement plan:

- if a reliable remaining-limit source reports `< 30%`, block only expensive
  actions:
  - `run_codex_task`;
  - new Codex App/CLI deep tasks;
  - optional long Realtime sessions if configured.
- do not block `/settings`, `/agents`, `/dev`, status checks, or user-visible
  explanation;
- voice should answer with a short budget/limit message instead of pretending
  work started.

## 4. Frontend Component Plan

### 4.1. Split settings sections

Current file:

```text
interfaces/control-center/src/components/settings/SettingsControlPage.tsx
```

It is already too large. Split carefully:

```text
interfaces/control-center/src/components/settings/
  SettingsControlPage.tsx
  SettingsAnchorTabs.tsx
  SettingsSectionFrame.tsx
  LanguageSection.tsx
  OpenAIKeysSection.tsx
  CodexAuthSection.tsx
  AccessSection.tsx
  AppearanceSection.tsx
  CodexSettingsSection.tsx
  VoiceSettingsSection.tsx
  DataStorageSection.tsx
  LimitsSettingsSection.tsx
  ProactivitySettingsSection.tsx
  SettingsRail.tsx
```

Keep changes incremental:

1. First extract without behavior changes.
2. Then add anchor behavior.
3. Then add new API key and Codex sections.
4. Then move Codex controls out of Voice.

### 4.2. Anchor tabs behavior

`SettingsAnchorTabs` props:

```ts
type SettingsSectionId =
  | "general"
  | "access"
  | "codex"
  | "voice"
  | "limits"
  | "proactivity";

type SettingsAnchorTabsProps = {
  activeSection: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
};
```

Implementation:

- use refs for each section;
- click calls `scrollIntoView({ behavior: "smooth", block: "start" })`;
- use `IntersectionObserver` or bounded scroll listener to update active tab;
- respect reduced motion;
- no route changes required in v1;
- optional hash update can be deferred.

Mobile:

- `.settings-tabs` horizontal scroll;
- selected tab auto-scrolls into view;
- keep hit targets at least 44px high;
- no nested tabs inside each section.

### 4.3. General section

`GeneralSettingsSection` can be a wrapper containing:

- `LanguageSection`
- `OpenAIKeysSection`
- `CodexAuthSection`
- `AppearanceSection`
- `DataStorageSection`

Language:

- replace dropdown with two-segment display if easy, but keep Russian disabled;
- if reusing existing `LanguageDropdown`, make sure UI still clearly shows
  English active and Russian unavailable/planned.

OpenAI keys:

- compact status rows;
- one `Configure` button per key;
- inline edit or small modal with password input;
- no raw value after save;
- show backend messages clearly.

Codex subscription auth:

- status chips for Codex App Server and Codex CLI;
- commands shown in copyable read-only blocks;
- no password/token fields;
- no instruction to paste ChatGPT credentials into the app.

### 4.4. Codex section

Use compact controls:

- transport segmented/select;
- model select with custom option fallback;
- reasoning segmented control:
  - Low
  - Medium
  - High
  - Very High
- speed segmented control:
  - Standard
  - Fast
- sandbox select;
- network switch;
- timeout number input;
- save button.

Model options v1:

```ts
[
  { id: "gpt-5.5", label: "GPT-5.5", fast: true, recommended: true },
  { id: "gpt-5.4", label: "GPT-5.4", fast: true },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", fast: false },
  { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", fast: false, availability: "Pro research preview" },
  { id: "", label: "Codex default", fast: false }
]
```

If `Fast` is selected and model changes to unsupported:

- either switch speed back to `Standard`;
- or keep disabled with visible status and do not apply at runtime.

Preferred v1: switch to `Standard` and show a short status note.

### 4.5. Voice section

Keep current voice behavior controls:

- Sticky Context
- Behavior Detail
- Pritha Voice
- save voice runtime if needed

Remove from Voice section:

- Deep Task Transport
- Codex Sandbox
- Network Access
- Task Timeout

Those belong in Codex section.

Important migration:

- `VoiceSettingsSection` may still call the same runtime settings API;
- it should preserve Codex fields when saving;
- avoid duplicate save buttons that race and overwrite each other.

Safer approach:

- create shared hook `useRuntimeSettings()`;
- both `CodexSettingsSection` and `VoiceSettingsSection` use patch-style save;
- backend already merges patch with current settings.

### 4.6. Limits section

v1 UI states:

- `Codex Subscription Limits`
  - status: `Manual`
  - text: `Use Codex usage dashboard or CLI /status until a reliable adapter is installed.`
  - no fake percent.
- `Realtime Usage`
  - status from local telemetry if implemented, otherwise `Collecting`
  - show today's and week's known tokens if available.
- `OpenAI API Costs`
  - if admin key missing: `Admin API key not configured`
  - if configured and read-only fetch implemented: show daily/monthly costs.
- `Local Pause Policy`
  - disabled/planned in v1;
  - visible planned threshold: 30%;
  - explanation: future enforcement blocks new expensive Codex tasks, not the
    whole Control Center.

Do not add heavy charts in v1. Use small rows and chips.

## 5. CSS Plan

Reuse existing classes:

- `.settings-layout`
- `.settings-tabs`
- `.settings-tab`
- `.settings-section`
- `.settings-rowline`
- `.settings-switch`
- `.codex-transport-status`
- `.side-card`

Add minimal new classes:

```css
.settings-section-group
.settings-anchor-target
.settings-section-stack
.settings-status-grid
.settings-secret-row
.settings-chip-row
.settings-segmented-control
.settings-mini-form
.settings-command-row
.settings-source-note
```

Responsive constraints:

- desktop `settings-layout` remains grid with right rail;
- below existing breakpoint, right rail moves below;
- mobile uses one column and horizontal tabs;
- all controls must fit within parent width;
- long paths / URLs / model ids use `overflow-wrap: anywhere`;
- no nested cards inside cards; repeated rows inside one settings section are
  rowlines, not inner card stacks.

## 6. API Endpoints

### v1 required

```text
GET  /api/realtime/runtime-settings
POST /api/realtime/runtime-settings
GET  /api/settings/openai-credentials
POST /api/settings/openai-credentials
GET  /api/settings/codex-auth
POST /api/settings/codex-auth/login-plan
GET  /api/settings/limits
```

### deferred

```text
POST /api/settings/codex-auth/start-login
POST /api/settings/openai-credentials/validate
POST /api/settings/limits/admin-api/read-costs
POST /api/settings/limits/admin-api/update-rate-limit
POST /api/settings/limits/admin-api/create-spend-alert
POST /api/settings/limits/pause-policy
```

Deferred endpoints that mutate remote OpenAI/admin state must require explicit
confirmation and private audit logging.

## 7. Implementation Phases

### Phase 1: Non-behavioral refactor

Files:

- `SettingsControlPage.tsx`
- new extracted section components

Tasks:

1. Extract current sections into individual files.
2. Keep rendered order identical.
3. Run typecheck and current e2e.

Exit criteria:

- `/settings` looks and behaves the same;
- existing tests pass;
- no raw secret appears in DOM.

### Phase 2: Anchor navigation

Tasks:

1. Replace static `SettingsTabs` with anchor-aware tabs.
2. Add refs and active section detection.
3. Keep all sections on one page.
4. Tune mobile horizontal scroll.

Exit criteria:

- clicking each top item scrolls to section;
- active underline follows scroll;
- mobile has no horizontal page overflow.

### Phase 3: OpenAI credentials status/storage

Tasks:

1. Implement env-store helper.
2. Implement OpenAI credentials API.
3. Add `OpenAIKeysSection`.
4. Add masked status only.
5. Add save flow with confirmation.

Exit criteria:

- missing key is shown as missing;
- saving test key writes only to ignored env-store in local dev;
- API never returns raw key;
- browser DOM never includes raw key;
- current process env updates after save.

### Phase 4: Codex auth status

Tasks:

1. Implement read-only Codex auth/status endpoint.
2. Add `CodexAuthSection`.
3. Show safe commands for login/device-login/open-app.
4. Do not read `auth.json`.

Exit criteria:

- UI tells whether Codex binary/app-server are available;
- login actions are instructions/plans, not background interactive processes;
- no subscription credential field exists.

### Phase 5: Codex runtime settings

Tasks:

1. Extend `PrithaRuntimeSettings`.
2. Extend runtime settings route validation.
3. Add `CodexSettingsSection`.
4. Move Codex controls out of `VoiceSettingsSection`.
5. Apply model/reasoning/speed to CLI.
6. Apply model/reasoning to App Server.
7. Gate Fast mode by model/auth/transport support.

Exit criteria:

- selected model persists;
- selected reasoning persists;
- CLI task args include model/reasoning and fast config when supported;
- App Server uses selected model and reasoning or clearly reports unsupported
  fast adapter;
- Voice settings still save sticky context/profile/voice.

### Phase 6: Limits section v1

Tasks:

1. Implement `/api/settings/limits` with honest current statuses.
2. Add `LimitsSettingsSection`.
3. Show Admin API key missing/configured state.
4. Show Realtime local usage only if backed by stored events.
5. Add planned pause policy UI text, disabled.

Exit criteria:

- no fake Codex quota;
- no remote Admin API mutations;
- missing admin key state is clear;
- UI explains 30% future threshold without enforcing it.

### Phase 7: Verification and regression pass

Commands:

```sh
npm --prefix interfaces/control-center run typecheck
npm --prefix interfaces/control-center run build
npm --prefix interfaces/control-center run test:e2e
```

If e2e is slow or environment-dependent, at least run typecheck and build, then
document why e2e was skipped.

Manual checks:

- `/settings` desktop: all anchor tabs scroll correctly.
- `/settings` mobile: no overflow; tabs usable; controls fit.
- `/voice`: sticky context and voice settings still work.
- `/api/realtime/runtime-settings`: old fields preserved.
- `/api/settings/openai-credentials`: raw secrets never returned.
- save flows do not touch tracked files.

## 8. Test Plan

Add or update tests:

1. Runtime settings unit test:
   - accepts `codexReasoningEffort`;
   - rejects invalid effort;
   - accepts `codexServiceTier`;
   - preserves voice fields.

2. Secret safety test:
   - POST fake `OPENAI_API_KEY`;
   - response contains masked value only;
   - response does not contain raw key;
   - target env file contains value;
   - DOM test confirms raw key absent.

3. Settings e2e:
   - visits `/settings`;
   - clicks all anchor tabs;
   - verifies expected section headings;
   - checks no overflow and no raw secrets.

4. Codex settings e2e:
   - select model;
   - select reasoning;
   - select Fast for supported model;
   - save;
   - reload;
   - values persist.

5. Limits e2e:
   - no fake percentage shown when no adapter exists;
   - Admin API missing state shown when no admin key configured.

## 9. Safety Rules During Implementation

- Do not commit `.env.local`, `.private`, `.memory-private`, queues, logs,
  tokens or credentials.
- Do not modify `~/.codex/auth.json`.
- Do not run `codex login` automatically from a page load.
- Do not enable launchd, cron, heartbeat, queue watcher or service install.
- Do not call OpenAI Admin write endpoints in v1.
- Do not show fake Codex remaining limits.
- Do not block the whole Control Center for future budget policy; only block
  new expensive task starts when enforcement is later implemented.
- Keep UI compact: rowlines and section groups, not nested cards.

## 10. Deferred Work

1. Real Codex subscription remaining-limits adapter:
   - investigate whether current Codex App Server or CLI exposes machine-readable
     status equivalent to `/status`;
   - if not, keep dashboard/manual state.

2. Realtime usage collector:
   - persist `response.done.usage`;
   - persist transcription usage;
   - aggregate daily/weekly;
   - estimate cost from model pricing with clear caveat.

3. Admin API telemetry:
   - read costs/usage with `OPENAI_ADMIN_API_KEY`;
   - group by project/API key/model;
   - cache results;
   - avoid frequent polling.

4. Remote OpenAI limit management:
   - list project rate limits;
   - optional update project rate limits;
   - create/update spend alerts;
   - every write requires explicit confirmation and audit event.

5. Local pause policy:
   - threshold default 30%;
   - action `block_codex_deep_tasks`;
   - source can be Codex remaining limits if reliable, otherwise local budget.

## 11. Done Criteria

The implementation is complete when:

- Settings is one responsive page with working anchor tabs.
- General includes Language, OpenAI API keys, Codex subscription auth,
  Appearance and Data & Storage.
- Access remains functional.
- Codex tab controls model, reasoning, speed, transport, sandbox, network and
  timeout.
- Voice tab keeps current voice behavior settings and no longer owns Codex
  runtime controls.
- Limits shows honest current state and no fake quota.
- Proactivity remains unchanged/manual/planned.
- Secrets are never exposed to browser or logs.
- Existing Voice Control and Codex task flow still work.
- Typecheck/build/e2e or documented verification passes.
