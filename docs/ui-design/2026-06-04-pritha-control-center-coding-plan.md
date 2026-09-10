---
id: 2026-06-04-pritha-control-center-coding-plan
type: implementation-plan
status: draft
created: 2026-06-04
updated: 2026-06-04
topics:
  - pritha-control-center
  - ui
  - child-agents
  - voice-control
  - responsive-design
tools:
  - Next.js
  - React
  - TypeScript
  - CSS
  - lucide-react
sources:
  - docs/ui-design/2026-06-04-pritha-control-center-spec-v0.4.txt
  - docs/ui-design/2026-06-04-agents-page-implementation-guide.txt
  - docs/ui-design/2026-06-04-voice-page-implementation-guide.txt
  - docs/ui-design/2026-06-04-settings-page-implementation-guide.txt
  - docs/ui-design/2026-06-04-dev-page-implementation-guide.txt
  - docs/ui-design/2026-06-04-mobile-ui-implementation-guide.txt
  - docs/ui-design/image_1P.png
  - docs/ui-design/image_2P.png
  - docs/ui-design/image_3P.png
  - docs/ui-design/image_4P.png
  - docs/ui-design/image_1PM.png
related:
  interfaces:
    - interfaces/manifest.json
    - interfaces/experiments/pritha-voice-control/
  memory:
    - 11_agents/registry.md
    - 07_workflows/agents-mother.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
privacy: public
retention: design-draft
review_status: draft
confidence: high
---

# Pritha Control Center Coding Plan

## 0. Goal

Build a new Pritha Control Center UI that reproduces the supplied desktop and
mobile designs:

- desktop `/agents` as the default control surface;
- mobile `/voice` as the default control surface;
- shared shell, tokens, glass panels, status strips and navigation;
- pages: `/agents`, `/voice`, `/settings`, `/dev`;
- no full chat UI in the web app;
- no dangerous backend actions without explicit confirmation;
- no cron, heartbeat, launchd, autostart or background polling enabled by this
  work.

The current repository has no existing Next app. It has a root Node package,
the legacy Techscope web UI, and an experimental Realtime voice UI under
`interfaces/experiments/pritha-voice-control/`. Therefore the new UI should be
isolated under `interfaces/control-center/` and integrated through explicit
manifest/scripts instead of rewriting the legacy web UI.

## 1. Design Inputs

Use the TXT files copied into `docs/ui-design/` as normative implementation text:

- `2026-06-04-pritha-control-center-spec-v0.4.txt`: product scope, state model,
  safety policy and MVP acceptance criteria.
- `2026-06-04-agents-page-implementation-guide.txt`: `/agents` visual and data
  spec.
- `2026-06-04-voice-page-implementation-guide.txt`: `/voice` visual, Realtime,
  task and decision spec.
- `2026-06-04-settings-page-implementation-guide.txt`: `/settings` compact
  settings spec.
- `2026-06-04-dev-page-implementation-guide.txt`: `/dev` read-only diagnostic
  spec.
- `2026-06-04-mobile-ui-implementation-guide.txt`: mobile shell, mobile voice
  and mobile agents spec.

Use PNG files as visual reference:

- `image_1P.png`: desktop Agents page.
- `image_2P.png`: desktop Voice page.
- `image_3P.png`: desktop Settings page.
- `image_4P.png`: desktop Dev page.
- `image_1PM.png`: mobile Voice and mobile Agents.

Important reconciliation:

- TXT mock data references `gpt-4o-realtime-preview`.
- The current working voice experiment uses `gpt-realtime-2`.
- Implementation must display the model reported by backend status when
  available. Mock fallback may use a neutral value from fixtures, but should not
  override live `gpt-realtime-2`.

## 2. Target Architecture

Create a self-contained app:

```text
interfaces/control-center/
  package.json
  next.config.mjs
  tsconfig.json
  eslint.config.mjs
  src/
    app/
      layout.tsx
      page.tsx
      agents/page.tsx
      voice/page.tsx
      settings/page.tsx
      dev/page.tsx
      api/
        health/route.ts
        status/route.ts
        agents/route.ts
        voice/status/route.ts
        dev/status/route.ts
    components/
      shell/
      primitives/
      status/
      agents/
      voice/
      settings/
      dev/
      mobile/
    data/
      mockAgents.ts
      mockVoice.ts
      mockSettings.ts
      mockDev.ts
    lib/
      env.ts
      routes.ts
      viewport.ts
      controlCenterState.ts
      agentsRegistry.ts
      siblingScan.ts
      healthchecks.ts
      safety.ts
      voiceBridge.ts
      format.ts
    styles/
      tokens.css
      globals.css
```

Add a root convenience script only after the app exists:

```json
{
  "scripts": {
    "control-center": "npm --prefix interfaces/control-center run dev",
    "control-center:build": "npm --prefix interfaces/control-center run build",
    "control-center:start": "npm --prefix interfaces/control-center run start"
  }
}
```

Update `interfaces/manifest.json` with a new adapter:

```json
{
  "name": "pritha-control-center",
  "mode": "local-control-center",
  "status": "experimental",
  "script": "npm --prefix interfaces/control-center run dev",
  "url": "http://127.0.0.1:3000"
}
```

Do not store real Tailscale URLs, tailnet names, device hostnames or secrets in
tracked files. Local Tailscale Serve instructions stay in local operator notes
or ignored state.

## 3. Implementation Phases

### Phase 0: Repo Setup And Decisions

1. Confirm `interfaces/control-center/` as the implementation path.
2. Create nested Next/React/TypeScript app with its own package lock.
3. Keep the root `package.json` dependency-light; do not add Next dependencies
   to the Techscope root unless there is a deliberate later consolidation.
4. Add `README.md` in `interfaces/control-center/` documenting:
   - purpose;
   - routes;
   - dev/build/start commands;
   - privacy boundaries;
   - no committed secrets;
   - no automatic background services.
5. Add a control center manifest:
   `interfaces/control-center/manifest.json`.
6. Add `.env.example` for control center only:
   - `PRITHA_CONTROL_CENTER_HOST=127.0.0.1`;
   - `PRITHA_CONTROL_CENTER_PORT=3000`;
   - optional pointers to Techscope root;
   - no real API keys.

Exit criteria:

- `npm --prefix interfaces/control-center run dev` serves a blank app.
- `/api/health` returns app name, port and timestamp.
- No existing `scripts/techscope_web.py` or voice experiment is broken.

### Phase 1: Design System Foundation

Implement shared foundation before pages:

1. `styles/tokens.css`
   - exact token families from guides: dark backgrounds, panel colors, borders,
     text, semantic accents, state backgrounds, radii, shadows, layout widths;
   - keep the palette multi-accent: green, orange, red, cyan, blue and purple,
     not only purple-on-navy.
2. `styles/globals.css`
   - global background gradients;
   - Inter/system font stack;
   - focus-visible style;
   - reduced-motion media query;
   - base button/input reset;
   - scrollbars for dark UI.
3. Primitives:
   - `Button`;
   - `IconButton`;
   - `Panel`;
   - `SegmentedControl`;
   - `StatusDot`;
   - `StatusPill`;
   - `ProgressBar`;
   - `ToastProvider`;
   - `ConfirmDialog`;
   - `Tooltip`.
4. Functional visual components:
   - `PrithaLogoPlaceholder`: fixed slot, no final logo hardcode.
   - `StatusOrb`: CSS/SVG status visual, not a random decorative background.
   - `VoiceOrb`: CSS/SVG waveform/orb with reduced-motion fallback.
5. Icons:
   - use `lucide-react` for standard UI icons;
   - use lightweight inline SVG only for agent-specific icons that lucide cannot
     express cleanly.

Exit criteria:

- A component sandbox or temporary page shows primitives on dark background.
- Buttons have visible focus states.
- Reduced motion disables pulse/wave animation.

### Phase 2: App Shell And Routing

Implement responsive shell:

1. Desktop shell:
   - `DesktopShell`;
   - fixed left sidebar width `254px`;
   - `Sidebar`;
   - `LanguageToggle`;
   - `AccessPanel`;
   - version/uptime footer;
   - main content area.
2. Mobile shell:
   - `MobileShell`;
   - `MobileHeader`;
   - `MobileBottomNav`;
   - safe-area handling;
   - hidden desktop sidebar below `768px`.
3. Navigation:
   - desktop nav: Agents, Voice, Settings, Dev (Read-only);
   - mobile nav: Voice, Agents, Settings;
   - no Dev in primary mobile nav.
4. Root route behavior:
   - initial simple approach: server/client redirect based on viewport or user
     agent;
   - desktop `/` -> `/agents`;
   - mobile `/` -> `/voice`;
   - keep explicit route URLs always valid.
5. Shared top header:
   - `PageHeader`;
   - `StatusStrip`;
   - `OpenInCodexButton`.

Exit criteria:

- All four routes render with correct shell.
- Desktop and mobile shells do not render simultaneously.
- Navigation active states match the designs.

### Phase 3: Static `/agents` Page

Build the Agents page first because it is the desktop default and defines most
shared patterns.

Components:

```text
components/agents/
  AgentsPageHeader.tsx
  AgentsGrid.tsx
  AgentCard.tsx
  AgentIcon.tsx
  AgentActionButton.tsx
  AgentUrlRow.tsx
  AddAgentCard.tsx
  RightRail.tsx
  PrithaStatusCard.tsx
  RecentActivityCard.tsx
  QuickActionsCard.tsx
  LineageLite.tsx
```

Data model:

```ts
type AgentState = "alive" | "missing" | "needs-check" | "unknown";
type AgentActivity = "active" | "inactive" | "unknown";
type AgentCardModel = {
  id: string;
  name: string;
  version: string;
  description: string;
  state: AgentState;
  activity: AgentActivity;
  url?: string;
  updateStatus?: "available" | "up-to-date" | "review-needed" | "none";
  issueText?: string;
  iconType: "bot" | "sail" | "cube" | "warning" | "box";
};
```

Implementation details:

1. Use mock data matching the screenshot.
2. Three-column desktop grid at `>=1280px`.
3. Two-column tablet grid.
4. One-column mobile list.
5. Card action rules:
   - `missing` -> only Restore;
   - `needs-check` -> only Check;
   - `alive + active` -> Stop;
   - `alive + inactive` -> Start;
   - URL row only for alive agents with URL.
6. Add New Agent:
   - opens modal: "Create new agents in Codex or Voice";
   - buttons: Open in Codex, Start Voice;
   - no creation form in MVP.
7. Start/Stop/Restore:
   - static phase shows confirmation modal and toast only;
   - no durable backend calls.
8. Lineage-lite:
   - SVG central Pritha node with child nodes;
   - hidden/collapsed by default on mobile.
9. Right rail:
   - Pritha Status;
   - Recent Activity;
   - Quick Actions.

Exit criteria:

- Desktop visually matches `image_1P.png`.
- Mobile `/agents` visually matches the right side of `image_1PM.png`.
- Missing agent never shows URL/Start/Stop.
- Needs-check agent never shows Start/Stop.

### Phase 4: Static `/voice` Page

Build Voice page with the new design, but keep live Realtime wiring as a later
controlled integration step.

Components:

```text
components/voice/
  VoiceSessionPanel.tsx
  VoiceVisualization.tsx
  VoiceControls.tsx
  QuickVoiceActions.tsx
  ConversationPanel.tsx
  CurrentContextCard.tsx
  ActiveTaskCard.tsx
  DecisionRequiredCard.tsx
  ConnectionCard.tsx
```

Data model:

```ts
type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "muted"
  | "working"
  | "decision_required"
  | "error";
type VoiceTask = {
  id: string;
  title: string;
  target: "Codex" | "Pritha" | "Child Agent";
  status: "queued" | "working" | "decision_required" | "done" | "failed";
  progress?: number;
  summary?: string;
};
type VoiceDecision = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: "pending" | "approved" | "declined";
};
```

Implementation details:

1. Desktop layout:
   - main voice session card;
   - conversation panel below;
   - right rail cards: Context, Active Task, Decision, Connection.
2. Mobile layout:
   - header;
   - status chips;
   - voice card;
   - context/task/decision/quick actions;
   - no connection card by default.
3. Visualization:
   - CSS/SVG waveform and orb;
   - animation tied to state;
   - fallback for reduced motion.
4. Conversation panel:
   - compact transcript and command box;
   - not a full chat;
   - complex prompt -> "Continue in Codex or Voice" suggestion.
5. Buttons in static phase:
   - show mock/toast states only;
   - do not claim real microphone, Realtime, Codex task or approval execution.

Exit criteria:

- Desktop matches `image_2P.png`.
- Mobile `/voice` matches the left side of `image_1PM.png`.
- Page reads as voice control, not generic chat.

### Phase 5: Static `/settings` Page

Components:

```text
components/settings/
  SettingsTabs.tsx
  GeneralSettingsPanel.tsx
  LanguageSection.tsx
  AccessConnectionsSection.tsx
  AppearanceSection.tsx
  DataStorageSection.tsx
  PrithaSummaryCard.tsx
  LimitsOverviewCard.tsx
  ProactivityCard.tsx
```

Implementation details:

1. Tabs:
   - General active by default;
   - Access/Codex/Voice/Limits/Proactivity placeholders if not implemented.
2. General sections:
   - Language;
   - Access & Connections;
   - Appearance;
   - Data & Storage.
3. Right rail:
   - Pritha Summary;
   - Limits Overview;
   - Proactivity.
4. Interaction policy:
   - language switch is safe;
   - theme options may be planned except Dark;
   - snapshot retention changes require confirmation if destructive;
   - Clear Cache disabled or confirmation-required until backend exists;
   - no fake Codex limits;
   - no cron enable button.

Exit criteria:

- Desktop matches `image_3P.png`.
- Mobile settings is usable with stacked cards and bottom nav.
- Proactivity clearly says off/not installed.

### Phase 6: Static `/dev` Page

Components:

```text
components/dev/
  SystemReadinessPanel.tsx
  RegistrySummaryPanel.tsx
  DiscoveredFoldersPanel.tsx
  RecentLogsPanel.tsx
  WarningsPanel.tsx
  EnvironmentCard.tsx
  VoiceDiagnosticsCard.tsx
  MemoryIndexCard.tsx
  LatestReportsCard.tsx
```

Implementation details:

1. Keep `/dev` read-only.
2. Run Self-test button:
   - do not run directly in v1;
   - show modal with command `node scripts/self-test.mjs`;
   - Copy command / Open in Codex.
3. Registry Summary:
   - table with read-only raw preview modal.
4. Logs:
   - client-side filters only;
   - Clear hidden, disabled or "clear local view only".
5. Latest Reports:
   - read-only preview;
   - Open Folder only if safe, otherwise copy path.

Exit criteria:

- Desktop matches `image_4P.png`.
- No destructive/admin action is available.
- Dev is absent from primary mobile bottom nav.

### Phase 7: Read-Only Backend Aggregation

After static visual parity, add read-only data endpoints.

Endpoints:

```text
GET /api/health
GET /api/status
GET /api/agents
GET /api/voice/status
GET /api/dev/status
```

Backend sources:

1. Techscope root resolution:
   - env-first `TECHSCOPE_ROOT`;
   - git root fallback;
   - no user-specific path hardcoding.
2. Pritha registry:
   - parse `11_agents/registry.md`;
   - extract agent rows and recent reports;
   - registry is historical memory, not liveness source.
3. Sibling scan:
   - scan parent of Techscope root;
   - look for known child-agent folders;
   - never copy secrets or runtime state.
4. Operations manifests:
   - read `operations/manifest.json` when present;
   - validate start/stop/healthcheck metadata;
   - invalid manifest -> `needs-check`.
5. Healthchecks:
   - for read-only endpoint, only perform safe HTTP health probes with timeout;
   - no service start.
6. Voice status:
   - either read the new embedded voice state or proxy status from the existing
     experiment if still separate;
   - browser must never receive OpenAI API key.
7. Memory index:
   - read `.memory/techscope.sqlite` counts if available;
   - avoid rebuild.

Data transformation:

```text
registry + reports -> remembered agents and history
sibling scan -> exists/missing
operations manifest -> actionable or needs-check
healthcheck -> active/inactive
ports/access config -> URL row
reports -> recent activity/latest reports
```

Exit criteria:

- Static mock can be replaced with live read-only state.
- If backend read fails, UI degrades to clear warning state.
- No endpoint mutates files.

### Phase 8: Live Voice Integration

The current `interfaces/experiments/pritha-voice-control/server.mjs` already
implements a working Realtime bridge with tools:

- `get_pritha_status`;
- `search_pritha_memory`;
- `read_pritha_artifact`;
- `queue_codex_task`.

Integration options:

1. Preferred: move the Realtime server/tool code into
   `interfaces/control-center/src/server/voice/` or equivalent server-only
   module, then expose it through Next route handlers.
2. Transitional: keep the experiment server separate and have Control Center
   link/proxy to it while the UI is rebuilt.

Implementation requirements:

1. Server-side key boundary:
   - no OpenAI API key in browser;
   - browser receives only session/ephemeral Realtime access through server.
2. Tool surface:
   - preserve narrow tools;
   - keep Codex bridge read-only by default;
   - write mode only with explicit operator confirmation and env.
3. Realtime client protocol:
   - do not create a new response while another response is active;
   - batch function-call outputs after `response.done`;
   - handle `conversation_already_has_active_response` by queueing one retry,
     not by spamming `response.create`.
4. Transcript:
   - show compact transcript;
   - do not store real transcripts in tracked repo.
5. Voice status:
   - show Realtime connection, model, server mode, latency/quality if known.

Exit criteria:

- `/voice` can start/stop live voice session.
- Tool calls appear in task/context UI.
- Model display reflects live `gpt-realtime-2` when that is active.
- Existing voice experiment tests are ported or preserved.

### Phase 9: Controlled Actions

Only after read-only backend and live voice are stable, implement durable or
semi-durable actions.

Action categories:

Read-only:

- view agents/status/diagnostics;
- open/copy URL;
- view lineage-lite;
- view raw registry/logs/reports.

One-click safe:

- switch language;
- switch route/tab;
- copy URL;
- clear selected UI context;
- client-side log filters.

Confirmation-required:

- start agent;
- stop agent;
- restore missing agent;
- apply update;
- rollback;
- run manual audit if it writes reports;
- change Codex model/profile;
- change API budget;
- connect beyond localhost;
- start voice tool that can create Codex tasks;
- any durable memory write.

Not allowed in v1:

- delete child agent;
- edit raw memory;
- enable cron;
- install launchd/service;
- run background heartbeat;
- automatic source polling;
- full web chat agent.

Implementation order:

1. Start/Stop dry-run modal using `operations/manifest.json`.
2. Start/Stop real action only if manifest explicitly supports it and user
   confirms.
3. Restore guided flow:
   - show source contract/reports/modules;
   - final confirmation;
   - call Pritha restore/scaffold command;
   - run readiness check;
   - write recovery/evolution report.
4. Update suggestions:
   - display from reports/audits first;
   - apply update only after snapshot and confirmation.
5. Snapshots:
   - 2 snapshots per child agent;
   - exclude secrets/env/logs/queues/runtime state;
   - store full snapshot outside curated memory;
   - store metadata in reports/memory.

Exit criteria:

- No durable action is possible without confirmation.
- Missing agent restore cannot silently create a folder.
- Start/Stop never hardcodes per-agent commands.

### Phase 10: Responsive QA And Visual Regression

Verification should include at least these viewports:

- desktop `1536x1024` to match supplied references;
- desktop `1280x900`;
- tablet `1024x768`;
- mobile `390x844`;
- mobile `430x932`.

Use Playwright or the in-app Browser plugin during implementation:

1. Open `/agents`, `/voice`, `/settings`, `/dev`.
2. Capture screenshots for desktop.
3. Capture screenshots for mobile emulation.
4. Check:
   - no text overlap;
   - no cards inside cards except intended repeated item cards;
   - no horizontal scroll on mobile except explicit tables/logs;
   - bottom nav does not cover content;
   - all icon-only buttons have labels;
   - focus states visible;
   - reduced-motion mode disables pulse-heavy animations.

Visual acceptance:

- `/agents` matches `image_1P.png` in structure, density, colors and card
  states.
- `/voice` matches `image_2P.png` and mobile `image_1PM.png`.
- `/settings` matches `image_3P.png`.
- `/dev` matches `image_4P.png`.

### Phase 11: Build, Run, And Tailscale

Local dev:

```sh
npm --prefix interfaces/control-center run dev
```

Production-style local testing:

```sh
npm --prefix interfaces/control-center run build
npm --prefix interfaces/control-center run start
```

Tailscale:

- app binds to `127.0.0.1`;
- expose through Tailscale Serve only for trusted devices;
- do not commit Serve URLs or Tailnet names;
- for iPhone/operator testing prefer production mode if dev caching causes
  blank/stale pages;
- HTML should return:
  `Cache-Control: no-store, max-age=0, must-revalidate`.

Next config should add no-store headers for operator pages if needed.

### Phase 12: Tests

Minimum tests:

1. Unit tests:
   - agent state -> primary action;
   - registry parse -> agent rows;
   - sibling scan merge -> alive/missing/needs-check;
   - URL visibility rules;
   - capability status rendering;
   - safety policy action classification.
2. Component tests or Playwright:
   - desktop `/agents`;
   - mobile `/agents`;
   - desktop `/voice`;
   - mobile `/voice`;
   - `/settings`;
   - `/dev` read-only controls.
3. API tests:
   - `/api/health`;
   - `/api/status`;
   - `/api/agents` with fixture registry;
   - backend degradation when registry/memory is unavailable.
4. Existing repo tests:
   - root `npm test`;
   - existing `tests/pritha-voice-control.test.mjs` until voice is migrated.

### Phase 13: Suggested Milestones

Milestone A: Design Pack And Static Shell

- copy TXT design instructions into `UI-design`;
- create coding plan;
- create app scaffold;
- implement tokens, global CSS, shells and routes.

Milestone B: Static Desktop Pages

- `/agents`;
- `/voice`;
- `/settings`;
- `/dev`;
- mock data;
- desktop visual QA.

Milestone C: Mobile UI

- mobile shell;
- mobile `/voice`;
- mobile `/agents`;
- mobile `/settings`;
- bottom nav;
- mobile visual QA.

Milestone D: Read-Only Backend

- registry parser;
- sibling scan;
- operations manifest reader;
- health probes;
- memory/dev status endpoints;
- replace mock data where safe.

Milestone E: Live Voice

- migrate or bridge existing Realtime voice experiment;
- preserve tool surface;
- verify Realtime response lifecycle;
- verify iPhone/Tailscale behavior.

Milestone F: Controlled Actions

- confirmations;
- Start/Stop through manifest;
- guided Restore;
- snapshot metadata;
- update suggestion flow.

## 4. Risks And Decisions To Preserve

1. Do not turn the web UI into full Codex chat.
2. Do not implement cron/proactivity as a side effect of Settings.
3. Do not fake Codex quota.
4. Do not show dangerous Dev actions as active buttons.
5. Do not let browser receive OpenAI API key.
6. Do not hardcode child-agent start/stop commands.
7. Do not hardcode absolute user-specific paths in runtime code.
8. Do not commit Tailscale URLs, Tailnet names, device names, transcripts or
   private Codex outputs.
9. Keep final Pritha logo replaceable through a placeholder component.
10. Use SVG/CSS for lineage and voice/status visuals; no Three.js in MVP.

## 5. First Implementation Recommendation

Start with Milestone A + `/agents` static implementation.

Reason:

- `/agents` is desktop default and defines the sidebar, status strip, card
  language, right rail and lineage-lite.
- It exercises the hardest data rules: remembered vs existing vs active vs
  missing vs needs-check.
- It can be implemented safely with mock data and no backend side effects.

After `/agents` reaches visual parity, implement `/voice` static UI, then wire
the existing Realtime experiment into the new design.
