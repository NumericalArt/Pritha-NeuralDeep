---
id: 2026-06-12-control-center-agents-page-roadmap
type: workflow
status: active
created: 2026-06-12
updated: 2026-06-12
topics:
  - pritha-control-center
  - child-agents
  - operator-ui
  - runtime-classification
  - control-planning
tools:
  - Next.js
  - React
  - TypeScript
  - ControlCenterStatus
sources:
  - interfaces/control-center/src/app/agents/page.tsx
  - interfaces/control-center/src/components/agents/AgentsOperatorExperience.tsx
  - interfaces/control-center/src/components/agents/AgentCard.tsx
  - interfaces/control-center/src/components/agents/AgentsGrid.tsx
  - interfaces/control-center/src/components/agents/LineageLite.tsx
  - interfaces/control-center/src/components/agents/RightRail.tsx
  - interfaces/control-center/src/components/shell/Sidebar.tsx
  - interfaces/control-center/src/components/settings/SettingsControlPage.tsx
  - interfaces/control-center/src/lib/control-center/server.ts
  - docs/ui-design/2026-06-04-agents-page-implementation-guide.txt
  - docs/ui-design/2026-06-04-control-center-appendix-a-unimplemented-surfaces.txt
related:
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
  standards:
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-proactivity-scheduling.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - child-agents
  - agent-building-knowledge
subject:
  kind: interface-roadmap
  id: pritha-control-center-agents-page
privacy: internal
retention: durable
review_status: draft
confidence: high
---

# Roadmap: Control Center `/agents`

Status: active
Owner: Techscope/user
Started: 2026-06-12

## Purpose

The `/agents` page is a read-only and control-planning dashboard for Pritha
child agents. It may inspect registry, contracts, profiles, manifests, health
checks and audit logs, but it must not pretend that Pritha can start, stop,
restore, schedule or mutate an agent until the backend exposes a verified and
audited capability.

Codex is a planner and diagnostician in this surface, not a fallback executor
for unknown processes. Unknown or unmanaged agents stay on `Run Check` until a
human accepts a better manifest/classification.

## Confirmed Product Decisions

- `Lineage (lite)` is not the future Three.js lineage graph. It is a static MVP
  SVG from the first design pass and should be postponed until the real
  Three.js/3D visualization phase.
- The future lineage surface is allowed to be primarily beautiful. It should use
  real agent nodes and inspectable metadata when available, but it does not need
  to become an operational runtime-summary panel.
- `Add New Agent` should become `Open in Codex / Create Plan`, not a direct
  scaffold or mutation button.
- Draft/scaffold agents, such as the Pritha Claude Code Adapter, should be
  hidden by default behind a `Drafts` filter.
- `View All Reports`, if kept, should open `/dev`, not a separate `/agents`
  reports drawer for now.
- `Open Voice` in the right rail is redundant with the left sidebar navigation
  and should be removed unless a later mobile/phone workflow needs it.
- Header `Child Agents` should not also carry a duplicate numeric pill when the
  status strip already says `Agents: N total`.
- Language selection stays global in the sidebar as a dropdown. Settings also
  has a dropdown, but it controls the default language. English is the selected
  and only enabled language for now.

## Runtime Classification Rule

The current safe classifier distinguishes nine runtime classes:

- `web_service`
- `scheduled_job`
- `codex_project`
- `cli_worker`
- `interface_adapter`
- `tool_server`
- `external_service`
- `scaffold`
- `unknown`

Only `web_service` and `scaffold` are proven against current local examples.
Other classes exist as safe model vocabulary and will become more precise as
new manifests and agents appear.

The safe fallback for unclassified agents is:

```ts
runtimeKind: "unknown"
primaryCardAction: "run_check"
executionMode: "manual_only"
```

The future safe CTA for this state is `Define Operations` or `Ask Codex to
Classify`, never `Start`.

## Current Interface Inventory

Already visible on desktop:

- Header: `Child Agents`, count and status strip.
- Agent card grid.
- Disabled `Add New Agent` card.
- `Lineage (lite)` bottom panel.
- Right rail with `Pritha Status`, `Recent Activity` and `Quick Actions`.
- Operator drawer opened from agent cards.
- Sidebar navigation, language toggle, access card, version and uptime.

Already visible on mobile:

- Summary chips.
- Mobile agent cards.
- `Run Manual Audit`.
- Shared operator drawer behavior.

## Backend-Bound Elements

These elements are already meaningfully connected to backend/read-model data:

- `/agents` loads `getControlCenterStatus()`.
- Agent list is derived from registry, profiles, contracts, lifecycle reports
  and sibling-folder operations manifests.
- Counts are backend-derived: child agents, alive, missing, needs-check and
  active.
- Right rail `Pritha Status` uses backend readiness and summary.
- Agent cards use backend fields for name, mission, version, folder status,
  health status, local URL, runtime kind, execution mode and truthful action
  labels.
- The runtime classifier is implemented server-side and does not fall back to
  Codex execution for unknown agents.
- Local `web_service` health probes can call `/api/health` for agents with a
  local upstream/health URL.
- `Open URL` uses the backend-provided local URL.
- Operator drawer loads:
  - `GET /api/agents/:id/actions/:action/plan`;
  - runtime kind;
  - execution mode;
  - command readiness;
  - preflight checks;
  - blockers, risks and safety warnings.
- `Run Manual Check` posts to `POST /api/agents/:id/actions/check`, writes audit
  JSONL and refreshes the UI.
- `Run Manual Audit` posts to `POST /api/agents/actions/manual-audit`, writes
  fleet audit entries and refreshes the UI.
- `Recent Activity` reads operator audit entries.
- `latestReports` exists as a fallback/read-model feed.
- Settings access mode is backend-bound through `status.access` and can already
  prefer Tailscale when available.

## Unbound Or Placeholder Elements

These elements are visible but still need backend, routing or product binding:

- `View Details` in `Pritha Status`: should either be removed as duplicate
  navigation or renamed `Open Diagnostics` and route to `/dev`.
- `View All Reports`: should either be removed or route to `/dev`.
- `Open Voice`: should be removed from Quick Actions as duplicate navigation.
- `Check for Updates`: remains disabled until update-suggestion backend exists.
- `Add New Agent`: should be renamed and converted to `Open in Codex / Create
  Plan`.
- `View Full Lineage`: should disappear until the real graph model exists.
- `Copy URL`: button is visible but copy behavior is not implemented.
- Sidebar access card: LAN/URL/connection state should come from
  `status.access`.
- Sidebar version and uptime should come from backend status, not static text.
- Sidebar language toggle is visual only and should become a dropdown.
- Settings language control should become a default-language dropdown.
- Header status strip is static and should become fully data-driven for Pritha,
  voice, proactivity, agents and connection states.
- Draft/scaffold agent visibility needs a filter.
- Right rail `Pritha Status` still uses a static orb; it should reuse the
  Three.js star visual from `/voice` in compact mode.
- Sidebar QR button needs a real QR modal that uses the backend Tailscale voice
  URL when available.

## Excess Or Duplicated Elements

Remove or downgrade these until they are truthful:

- `Lineage (lite)` as a pseudo-graph. It currently suggests real ancestry while
  only showing a static SVG plus counts.
- Dead buttons: `View Details`, `View All Reports`, `Open Voice`, `View Full
  Lineage`.
- Disabled `Add New Agent` occupying a full card with a mutation-like label.
- Two-button language toggle in sidebar while Settings has a separate language
  control.
- Repeated manual-check entries in Recent Activity without grouping.
- Header `Child Agents` count pill duplicates `Agents N total` in the status
  strip; prefer one count, likely the status strip.
- Header status strip and right-rail `Pritha Status` duplication unless the
  header stays compact and the right rail stays detailed.

## Manual Audit Semantics

`Run Manual Audit` is a non-mutating fleet diagnostic. In the current backend it
runs manual checks for child agents, writes operator-audit JSONL entries and
refreshes the UI.

The planned audit should check:

- registry row exists and parses;
- sibling folder is present or intentionally missing/draft;
- operations manifest exists and passes required fields;
- runtime classifier result and unknown/scaffold fallback;
- health endpoint result for local `web_service` agents;
- report/profile/contract evidence availability;
- required secret names and readiness statuses, without reading or displaying
  secret values.

It must not start agents, stop agents, edit manifests, install services, rotate
secrets, run cron, run launchd or apply updates.

## Access And QR Semantics

The sidebar `Access` card should use the same backend data as Settings:

- prefer Tailscale when `status.access.tailscale === "ready"`;
- otherwise show LAN when LAN is ready;
- otherwise show localhost;
- never hardcode an IP/port in the component.

`Show QR for Voice` should open a local modal containing a QR code for
`status.access.tailscaleVoiceUrl` when available. Scanning it from a phone on
the same tailnet should open `/voice` through the Tailscale HTTPS URL. If
Tailscale Serve is not configured, the modal should show the exact missing
state and point the user to Settings/Dev diagnostics rather than inventing a
URL.

## Per-Agent Secret Management

Each child agent needs its own safe secret-configuration flow. Agent cards and
drawers may show only readiness metadata, never raw values.

Recommended UI:

- a `Secrets` / `Credentials` action in the operator drawer or card overflow
  menu;
- a per-agent secrets drawer with required and optional secrets discovered from
  `.env.example`, agent contract and operations/interface manifests;
- statuses such as `configured`, `missing`, `optional`, `inherited`,
  `invalid`, `needs rotation`;
- masked display only, for example `sk-...abcd`, if a suffix is stored;
- validation buttons that call provider-safe checks only when available.

Recommended backend:

- write values only to the target agent's private runtime config, normally
  `<agent>/.env.local` with file mode `0600`;
- update files atomically through temp+rename and keep bounded private backups;
- never write secrets to tracked Markdown, `.env.example`, reports, audit logs,
  browser-visible JSON or memory indexes;
- store only non-secret metadata in manifests/reports: required variable names,
  configured/missing status, provider kind and last checked timestamp;
- support OpenAI, Telegram, Anthropic and later WhatsApp/other connector keys
  through typed secret definitions;
- keep OpenAI API keys server-side for Realtime agents; browsers receive only
  ephemeral Realtime credentials;
- treat Codex App/CLI/subscription auth as configured externally by default, not
  as a secret collected through the agent UI.

No existing Techscope/Pritha key should be copied into a child agent without an
explicit per-agent confirmation.

## C.12: UI Truth Cleanup

Goal: remove misleading controls and duplicate actions without adding runtime
mutation.

Deliverables:

- Remove `Open Voice` from `/agents` Quick Actions because the left navigation
  already has `/voice`.
- Remove `View Details` or rename it `Open Diagnostics` and route it to `/dev`.
- Remove `View All Reports` or route it to `/dev`.
- Implement `Copy URL`.
- Replace `Add New Agent` with `Open in Codex / Create Plan`.
- Hide scaffold/draft agents by default and add a `Drafts` filter.
- Remove/postpone `Lineage (lite)` until the real Three.js lineage phase.
- Remove the header count pill and keep the count in the status strip.
- Replace sidebar language toggle with a dropdown where English is selected and
  other languages are planned/disabled.
- Replace Settings language segmented control with a default-language dropdown.
- Replace the right rail static orb with the compact Pritha Three.js star
  visual already used on `/voice`.

Acceptance criteria:

- No visible button is dead unless it is explicitly disabled with a truthful
  reason.
- No card suggests direct scaffold/start/stop power that does not exist.
- Draft agents are not mixed into the default active-agent grid.
- Unknown agents show `Run Check` or future `Define Operations`, not `Start`.
- `Voice` and `/dev` remain reachable from the left navigation even if duplicate
  right-rail buttons are removed.

## C.13: Backend Binding Pass

Goal: make existing static shell/status elements data-driven.

Deliverables:

- Bind sidebar access state, host URL and connection mode from `status.access`.
- Bind version and uptime from backend status.
- Bind status strip from backend voice, proactivity, Codex and connectivity
  statuses.
- Bind right rail `Pritha Status` to the same status model used by `/dev`.
- Add a QR modal backed by `status.access.tailscaleVoiceUrl`.
- Group `Recent Activity` by latest result per agent, with a compact link to the
  full audit/report view in `/dev`.
- Add a reports list/read model for `/dev` if current latest reports are
  insufficient.

Acceptance criteria:

- Static `LAN`, URL, version and uptime values are gone.
- Header `Voice` changes when backend voice status changes.
- Sidebar access agrees with Settings and shows Tailscale when Tailscale is the
  active ready path.
- QR modal opens a real phone `/voice` URL or a truthful unavailable state.
- Recent Activity is useful after repeated manual checks.
- `/agents` and `/dev` agree on report/audit data.

## C.14: Per-Agent Secrets And Credentials

Goal: safely configure credentials for each child agent without leaking secrets
into repo, memory, logs or browser-readable status.

Implementation status, 2026-06-12: v1 shipped for local child-agent folders.
The Control Center discovers credential definitions from
`operations/manifest.json` and `.env.example`, exposes only readiness/masked
metadata, and writes values only to the child agent's private `.env.local`
store. Provider validation is local format validation only; no secret is sent to
OpenAI, Telegram, Anthropic, WhatsApp or any other provider from the validation
button.

Deliverables:

- Add secret definitions to agent contracts/manifests:
  - variable name;
  - provider kind;
  - required/optional;
  - validation method;
  - storage target;
  - browser exposure policy.
- Add a card/drawer `Secrets` action.
- Add a per-agent credential drawer for OpenAI, Telegram, Anthropic and future
  connector keys.
- Add backend endpoints for:
  - list required secret metadata;
  - write/update a secret;
  - remove a secret;
  - run a safe validation check;
  - return masked readiness only.
- Use `<agent>/.env.local` or another explicitly private per-agent store with
  atomic writes, mode `0600` and bounded backups.
- For Realtime voice agents, keep `OPENAI_API_KEY` server-side and issue only
  ephemeral credentials to the browser.
- Treat Codex auth as external/local by default. Show status, but do not ask for
  a Codex API key unless a future runtime explicitly requires one.

Acceptance criteria:

- A new voice child agent can receive an OpenAI API key safely.
- A Telegram/WhatsApp/Anthropic-capable agent can declare and configure its own
  required credentials.
- No secret value appears in tracked files, Markdown reports, JSONL audit logs,
  status APIs or screenshots.
- Agent cards show only readiness states such as `Credentials missing` or
  `Credentials ready`.

## C.15: Agent Creation Planning

Goal: make new-agent creation a Codex planning handoff, not a web mutation.

Deliverables:

- `Open in Codex / Create Plan` opens a drawer or handoff panel with:
  - create contract;
  - import existing folder;
  - ask Codex to draft agent plan.
- No scaffold or file mutation happens from the first click.
- Draft contract/report writing requires explicit confirmation.
- The drawer should explain that Codex prepares a plan/PR/manifest proposal.

Acceptance criteria:

- The UI can start a planning conversation without creating an agent.
- The first persistent artifact is a confirmed draft contract/report.
- If the planned agent requires secrets, the plan defines secret names and
  storage policy but does not collect values until the per-agent secrets drawer.

## C.16: Update Suggestions

Goal: add read-only update/drift intelligence.

Deliverables:

- Backend read model for update suggestions.
- Manual audit against profiles, contracts, manifests and reports.
- UI states:
  - `No updates`;
  - `Review suggested`;
  - `Manifest drift`;
  - `Profile stale`.
- No automatic update application.

Acceptance criteria:

- `Check for Updates` becomes enabled only when it has a safe backend.
- Suggestions explain evidence and next action.

## C.17: Three.js Lineage / Agent Map

Goal: build the beautiful Three.js lineage/agent visualization after the
current UI is truthful and stable.

Deliverables:

- Define a minimal graph model from registry, contracts, reports, parent-child
  evidence, runtime class and lifecycle state.
- Implement a Three.js `Lineage` / `Agent Map` view.
- Include filters for runtime class, draft/active, health and lifecycle state.
- `View Full Lineage` returns only when it opens this real graph.
- The graph can be visually expressive, but nodes and displayed metadata must be
  grounded in backend data.

Acceptance criteria:

- Every node and edge has inspectable evidence.
- The graph never invents ancestry from layout alone.
- Static SVG lineage is removed.

## C.18: Runtime Executor Gate

Goal: only after manifests and ownership are structured, consider real runtime
controls for explicitly managed agents.

Deliverables:

- Require `control_center_managed: true`.
- Require structured start/stop/check commands.
- Require runtime-specific executor contracts per class.
- Require confirmation phrase for mutation.
- Write audit before and after action.
- Avoid arbitrary port killing and ad hoc shell execution.
- Keep Codex as planner/diagnostician, not implicit executor.

Acceptance criteria:

- `Start`, `Stop`, `Run Now`, `Pause` or `Resume` appear only for supported,
  managed runtime classes.
- `unknown`, `scaffold`, unmanaged and external agents do not gain executor
  controls by default.

## Open Product Questions

- Should `Open in Codex / Create Plan` deep-link to a Codex thread when that is
  available, or first ship as a copyable planning prompt/handoff panel?
- Should the `Drafts` filter be a simple toggle in the header or a segmented
  control with `Active`, `Drafts`, `All`?
- Should `View Details`/`View All Reports` remain as contextual shortcuts to
  `/dev`, or should `/agents` rely only on the left sidebar for navigation?
- Should per-agent secrets live only in `<agent>/.env.local` for v1, or do we
  also want a host-side secret store abstraction for agents running outside the
  local filesystem?
