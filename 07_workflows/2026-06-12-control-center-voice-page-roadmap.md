---
id: 2026-06-12-control-center-voice-page-roadmap
type: workflow
status: active
created: 2026-06-12
updated: 2026-06-24
topics:
  - pritha-control-center
  - realtime-voice
  - operator-ui
  - codex-sidecar
  - session-recall
  - curated-memory
  - file-intake
  - direct-codex-intake
tools:
  - Next.js
  - React
  - TypeScript
  - OpenAI Realtime API
  - WebRTC
  - Codex
  - SQLite
sources:
  - current-codex-thread:2026-06-12-voice-control-roadmap-review
  - current-codex-thread:2026-06-24-voice-control-task-queue-and-file-intake
  - interfaces/control-center/src/components/voice/VoiceControlPage.tsx
  - interfaces/control-center/src/components/voice/usePrithaRealtime.ts
  - interfaces/control-center/src/components/voice/PrithaStarScene.tsx
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/app/api/realtime/session/route.ts
  - interfaces/control-center/src/app/api/realtime/call/route.ts
  - interfaces/control-center/src/app/api/realtime/tool/route.ts
  - interfaces/control-center/src/app/api/realtime/status/route.ts
  - interfaces/control-center/src/app/api/realtime/codex-task/[id]/route.ts
  - interfaces/control-center/src/app/api/realtime/intake/route.ts
  - interfaces/control-center/src/app/api/realtime/event/route.ts
related:
  workflows:
    - 07_workflows/realtime-voice-control-kit.md
    - 07_workflows/memory-domain-routing.md
    - 07_workflows/user-memory-update.md
  standards:
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/memory-domains.md
    - 04_standards/user-memory-privacy.md
    - 04_standards/source-retention-and-anonymization.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - governance
subject:
  kind: interface-roadmap
  id: pritha-control-center-voice-page
privacy: internal
retention: durable
review_status: draft
confidence: high
---

# Roadmap: Control Center `/voice`

Status: active
Owner: Techscope/user
Started: 2026-06-12

## Purpose

The `/voice` page is Pritha's operator-facing realtime control surface. It
should let the user speak to Pritha, send typed commands, inspect tool and Codex
sidecar work, recover earlier details from the current session, and deliberately
promote important session conclusions into long-term Pritha memory.

It must not become a raw transcript archive. Raw realtime dialogue is ephemeral
debug/session state. Durable memory should contain curated summaries, decisions,
standards, reports and roadmap updates about Pritha, child agents, architecture,
UI behavior, safety and operations.

## Confirmed Product Decisions

- `/voice` is now a useful experimental operator console, not only a visual
  mockup.
- The main product goal is a live voice interface for serious Codex work:
  conversational task framing, follow-up questions and hands-free monitoring of
  complex Codex sidecar tasks.
- `/voice` must serve both mobile/iPhone use and desktop use.
- The target mode is balanced: live conversation with Pritha, but oriented
  toward useful work, task setup, task status and operator control rather than
  casual chat.
- Mobile should be almost fully voice-first, but the UI still needs a paste/text
  input for links, long snippets, file notes and external resource references.
- Realtime can start multiple Codex sidecar tasks. The browser hook now keeps a
  separate poller per `task_id`, but the UI still shows only one active task.
- The exact spoken answer from a past realtime session cannot be reconstructed
  unless it was captured before the browser state disappeared.
- Backend/tool-level evidence can be reconstructed from private task directories
  and telemetry, but that evidence is not the same as the full dialogue.
- The default policy remains: do not store raw transcripts in tracked memory.
- Current-session recall should be easy for the operator, but long-term memory
  should store curated summaries and decisions only.
- Current-session state should start with fast browser `sessionStorage`. A
  lightweight ignored `.private` journal is acceptable if it does not slow down
  realtime interaction.
- Current-session journal may preserve user turns, assistant turns, tool events,
  task ids and task results together.
- Private session retention can be indefinite initially, but should become a
  voice setting later.
- The main UI does not need to show full transcript by default. The operator can
  ask Pritha to recap verbally; transcript/dev detail can move behind developer
  or session-recovery surfaces.
- User-model preferences belong in `.private/user-memory/`, not tracked
  Markdown or `.memory/techscope.sqlite`.
- Architecture/UI/behavior decisions about Pritha and child agents may become
  tracked curated artifacts after review.
- Long-term memory should cover Pritha architecture, child-agent architecture,
  child-agent creation history, UI/UX decisions, voice/realtime behavior,
  memory policy, deployment/operations and useful Pritha improvements.
- Long-term memory should skip one-off queries, prices/weather, disposable
  Codex tasks, casual chat and debugging sessions with no durable conclusion.
- Pritha may save long-term memory automatically based on its own weighed
  Codex/Pritha judgment, with metadata about the dialogue and target artifact
  type, without requiring a manual review step each time.
- Pritha chooses the artifact type for saved memory: roadmap update, review,
  decision, standard, report or private user-memory note.
- User preferences may be stored either in local-private memory or, when they
  are product/Pritha-relevant rather than personal, in tracked curated memory.
- Full raw transcript retention is not a primary product requirement. If debug
  retention exists, it does not need a prominent operator UI.
- The main task list should show active and completed Codex tasks from the
  current session, capped at five visible tasks.
- The Codex task list should stay in creation order, not last-activity order.
  Progress polling, completion and refresh must update a task in place rather
  than moving its card.
- For each Codex task, the UI should show `task_id`, status, progress, result
  excerpt and elapsed time.
- The voice interface should support up to five parallel Codex tasks before
  stronger queue controls are needed.
- Context focus is needed, but sticky context must be explained and made
  inspectable. Reset action name: `Reset Voice Context`.
- Standalone disabled approval placeholders should not appear in the operator
  UI. Codex task approval belongs directly on the relevant Codex task card.
- Real approval gates are required for deletion, service install, deployment,
  publication and credential writes. Voice confirmation alone is not enough for
  these gates unless the approved action is represented by a concrete task card
  or future backend decision object.
- Keep one stop control: `Stop Listening`. Keep mute and add real microphone
  sensitivity/gain control.
- Quick actions and visible transcript create noise on the main surface. Move
  them to developer/session detail later if needed.
- `Open in Codex` should eventually open the current project and provide a ready
  prompt for Codex, but `/voice` should not create Codex tasks without realtime
  just for this.
- Implementation should proceed through the roadmap sequentially with checks and
  tests, preserving the current visual concept but replacing decorative parts
  with functional controls.

## Latest Test Evidence

The June 8 voice test exposed and then confirmed the Codex result handoff
problem:

- `2026-06-08T14:21:26Z`: realtime started a Codex task to collect the current
  Bitcoin price.
- The task `2026-06-08T14-21-26-938Z-ca5f1add` completed successfully with BTC
  around `$63,728` from three USD sources.
- `2026-06-08T14:23:45Z`: realtime started a second Codex task to check the
  first task status.
- The exact final spoken realtime answer was not logged.
- A later test at `2026-06-08T19:49:31Z` showed the bug clearly: the UI had only
  one active poller, so a status-check task replaced polling for the main task.
- The hook was then changed to keep multiple pollers keyed by `task_id`.
- Realtime instructions were changed so Pritha should not start a separate
  Codex task only to poll status.
- Telemetry now records `codex_task_polling_started`,
  `codex_task_terminal_snapshot`, `codex_task_result_handoff_sent` and
  `codex_task_result_handoff_skipped`.

This roadmap treats those observations as product evidence, not as retained raw
dialogue.

## Current Interface Inventory

Desktop elements currently visible after the first V.12/V.13/V.14 slice:

- Page header: title `Voice Control` and subtitle. `Open in Codex` is hidden on
  `/voice` until it has a truthful action.
- Voice session panel: phase/status, model, key/error indicator, wave
  visualization, Three.js Pritha star scene with fallback drawing, timer,
  subtitle, mute, primary start/stop button and microphone sensitivity control.
- Paste Command panel for links, file notes, long commands and external context
  during an active realtime session. It is text-only in the current
  implementation.
- Codex Tasks card: compact list of up to five current-session Codex sidecar
  tasks in creation order with status, progress, elapsed time, result excerpt,
  handoff state and Details/Refresh actions. Approval actions appear on a task
  row only when that task requires approval.
- Current Session card: private browser session journal count, task event count,
  latest event and optional recap handoff to Pritha during an active session.
- Connection card: realtime key/session readiness, Codex readiness, remote audio
  status, latency and reconnect action.
- Voice Context card: Sticky Context is default-on, shows auto session context
  state, active tool chips are labelled by tooltip, and `Reset Voice Context`
  sends a reset message into the active realtime conversation.

Mobile elements currently visible:

- Top status chips for Pritha, Codex and Realtime, now driven by status loading
  state instead of showing `Key missing` while status is still unknown.
- Mobile voice card with model, realtime/key status, visualizer, timer, primary
  start/stop control, mute and microphone sensitivity control.
- Paste Command panel.
- Codex Tasks card.
- Current Session card.
- Voice Context card.

The main transcript and quick actions are no longer visible in the operator
surface. Realtime dialogue still feeds the bounded current-session journal and
can be recapped into the live realtime session on demand.

## Backend-Bound Elements

These elements are already meaningfully connected to backend or browser runtime
state:

- `GET /api/realtime/status` backs model, voice, transcription model, tool list,
  OpenAI key readiness, memory readiness, Codex availability, Codex mode,
  write-enabled flag and private runtime root.
- `POST /api/realtime/session` creates an ephemeral realtime session and returns
  the selected model, voice and tool names.
- `POST /api/realtime/call` exchanges browser SDP for the provider answer SDP.
- Browser WebRTC owns local microphone capture, remote audio playback and data
  channel events.
- Browser Web Audio owns the microphone gain/sensitivity control when the
  session is active. Before start, the slider stores the gain for the next
  session.
- A bounded current-session journal is kept in `sessionStorage` and includes
  user, assistant, tool, task and system events while the React session is
  alive.
- `POST /api/realtime/tool` executes the narrow realtime tools:
  `full_pritha_memory` and `run_codex_task`.
- `full_pritha_memory` can read memory status, recent/open documents, read
  curated artifacts and run full memory search via indexed text or Markdown
  fallback plus semantic/entity retrieval when available.
- `run_codex_task` writes private task request/status/prompt/result files and
  starts Codex exec when available, with queue fallback.
- `GET /api/realtime/codex-task/:id` reads task status and result excerpts.
- The browser hook polls Codex tasks by `task_id` and sends a completion message
  back to realtime when result text is available.
- The browser hook renders active/completed Codex task rows from a capped
  current-session task list.
- `POST /api/realtime/event` writes private telemetry for client-side handoff
  and polling events.
- Connection latency is measured client-side from session start to remote audio.

## Unbound Or Placeholder Elements

These visible or implied elements still need backend, routing or product
binding:

- `Open in Codex` is hidden on `/voice`, but still needs a real action later.
- There is no selectable memory/context focus yet.
- Selectable context focus is still missing. Sticky Context currently sends a
  compact automatic session/task recap, not a user-selected artifact focus.
- Task recovery exists from recent private Codex task metadata, but filtering,
  search and archived/completed grouping are not implemented yet.
- Mobile and desktop now have typed/paste command input, but only during an
  active realtime session.
- Paste Command cannot yet accept clipboard screenshots, dropped files,
  attached PDFs or other binary/document inputs.
- There is a browser session id and `sessionStorage` journal, but no server-side
  `.private/.../sessions/` read model yet.
- Current-session search/recap exists. Pinned details are still deferred.
- Curated session-summary writing exists as a conservative v1 classifier; it
  still needs evals, duplicate detection and better artifact routing.
- There is no memory routing UI that distinguishes tracked Pritha knowledge
  from local-private user-model memory.
- There is no visible event/handoff timeline for `handoff_sent` versus
  `handoff_skipped`.
- Page reload loses current browser transcript and active UI state, even though
  the session journal can recover bounded event summaries and private task
  directories remain readable by id.
- Realtime API key configuration still depends on `PRITHA_CONTROL_CENTER_ENV_FILE`
  pointing from `Techscope/.env.local` to an external private env file. This
  works, but should become explicit in Voice Settings/operations.

## Excess Or Duplicated Elements

Remove, merge or rename these until they are truthful:

- `AppShell` now renders page children once. `/voice` also renders either the
  desktop or mobile branch by media query, so hidden duplicate voice controls no
  longer create extra WebGL contexts.
- The standalone Decision Gate card has been removed. Future cross-task
  approvals should return only with real backend state and clear routing to the
  action being approved.
- Static `Pritha Ready` mobile chip should become data-driven or disappear.
- Tool chips have tooltips, but still need a details menu for debugging.
- Header status strip and Connection card should have distinct jobs: header =
  compact readiness, connection card = session diagnostics.

## Implementation Progress On 2026-06-12

- V.12 is mostly implemented: misleading transcript/quick-action/cancel/Open in
  Codex controls were removed or hidden; paste command, mute and mic sensitivity
  are visible; key status distinguishes checking/configured/missing; hidden
  WebGL scenes no longer allocate renderers.
- V.13 is implemented as a v1 operator feature: recent Codex tasks recover from
  private task directories after refresh, task rows include details/refresh
  actions, task detail drawer shows request/status/result/log excerpts, safe
  relative paths and telemetry-derived handoff state. Remaining hardening:
  richer task filtering and a more compact mobile task detail presentation.
- V.14 is implemented as a v1 current-session recall feature: session id,
  bounded `sessionStorage` journal, `Earlier This Session` drawer, search,
  compact recap and manual recap-to-Pritha action exist. Recovery now happens
  after React hydration so a stored journal cannot cause mobile/desktop
  hydration mismatch. Remaining hardening: ignored `.private/.../sessions/`
  cross-device recovery and optional pinned details if a future workflow proves
  them useful.
- V.15 is implemented as a conservative v1 memory promotion path: bounded
  session events can be automatically classified as tracked curated memory,
  local-private user memory or skip; tracked writes create a review artifact
  without raw transcript and run memory validation/rebuild. Remaining hardening:
  stronger classifier/evals, better artifact type selection and operator-visible
  history of memory writes.
- V.16 is implemented as a v1 sticky-context path: Sticky Context is default-on,
  can be toggled off in Settings, sends a compact session/task context item when
  realtime connects, records telemetry, and exposes `Reset Voice Context`.
  Remaining hardening: selectable artifact/task focus, context inspection,
  per-agent defaults and a clearer reset/history model.
- V.17 is not started: Decision Gate has no backend approval state.
- 2026-06-24 UI cleanup: Codex task cards keep stable creation order across
  polling/readback updates; the non-functional `Brief` action was removed; the
  standalone `Decision Gate` placeholder was removed because approval is handled
  on concrete Codex task cards.
- V.18 is partially implemented: private telemetry routes, connection card
  signals, task handoff state and task detail drawer exist. Cross-page floating
  task dock was removed after mobile/Child Agents QA because it obscured the
  primary operator surface. Remaining hardening: provider/data-channel
  diagnostics drawer and explicit sandbox/timeout display per task row.
- V.19 is partially implemented: desktop/mobile viewport checks, overflow
  checks, interactive fake-mic lifecycle checks and star nonblank checks are now
  part of the manual verification path.

## Verification On 2026-06-12

- `npm --prefix interfaces/control-center run typecheck`: passed.
- `npm --prefix interfaces/control-center run build`: passed with the existing
  Turbopack NFT trace warning through `src/lib/realtime/pritha-runtime.ts`.
- `GET /api/realtime/status` on `127.0.0.1:3420`: key configured, Codex
  available, model `gpt-realtime-2`.
- `GET /api/realtime/status` on
  `https://<TAILSCALE_HOST>:3420`: key configured and Codex
  available.
- `POST /api/realtime/session`: returns model, voice, two tools and an
  ephemeral client secret; secret value was not printed.
- Browser desktop `/voice`: no visible `Key missing`, one visible WebGL canvas,
  no console errors, `Start Listening` button enabled, mute disabled with
  explanatory title before microphone connection.
- Browser mobile viewport `390x844`: no visible `Key missing`, one visible
  WebGL canvas, no console errors.
- Desktop and mobile mic sensitivity slider tests changed visible percentages
  and were reset to `100%`.
- Desktop and mobile star screenshots were pixel-checked as nonblank and
  visually show the Pritha star/web.
- `GET /api/realtime/codex-task?limit=2`: returned recent private Codex tasks
  with status, paths, handoff state and telemetry count.
- `GET /api/realtime/codex-task/:id`: returned request, status detail, result
  availability, safe paths, stdout/stderr excerpts and telemetry.
- `POST /api/realtime/session-memory`: saved
  `03_reviews/2026-06-12-voice-v13-v15-implementation-smoke-voice-session-memory.md`
  as a tracked curated memory artifact and ran validation/rebuild successfully.
- Browser desktop `/voice`: five recovered Codex task rows, Details/Refresh
  controls, working task detail drawer, working `Earlier This Session` drawer,
  one visible WebGL canvas and no console errors.
- Browser mobile viewport `390x844`: recovered task rows, Details controls,
  recall/promote controls, one visible WebGL canvas, no `Key missing` and no
  console errors.
- Final post-fix QA on `2026-06-12`: desktop and mobile `/voice` on
  `127.0.0.1:3420` and
  `https://<TAILSCALE_HOST>/voice` show `gpt-realtime-2`
  ready, `Start Listening` enabled, one visible Three.js canvas, five recovered
  Codex task rows, no `Key missing`, no horizontal overflow and no fresh
  browser console errors.
- Screenshot pixel sanity check confirmed the Pritha star/web is nonblank:
  desktop canvas crop `278x278` had `13125` bright star pixels; mobile canvas
  crop `208x208` had `8617` bright star pixels.
- Final checks after the hydration-safe session journal fix:
  `typecheck` passed, `next build` passed with the known Turbopack NFT trace
  warning, `validate-memory` passed for 515 Markdown files, `rebuild-memory`
  indexed 515 documents / 4570 chunks, embeddings restored 4396 vectors,
  `self-test` passed and `git diff --check` passed.
- Final checks after the Sticky Context/session-persistence/Codex write-mode
  pass:
  - `typecheck` passed.
  - `next build` passed with the known Turbopack NFT trace warning.
  - `GET /api/realtime/status` returned key configured, model
    `gpt-realtime-2`, Codex CLI available and `write_enabled: true`.
  - `POST /api/realtime/session` returned an ephemeral client secret and the
    updated tools schema.
  - Browser desktop `/voice` at `1440x900`: no horizontal overflow, no console
    errors, `Start Listening` enabled, Sticky Context visible, five Codex task
    rows visible, Three.js star rendered via WebGL.
  - Browser mobile `/voice` at `390x844`: no horizontal overflow, no console
    errors, `Start Listening` enabled, Sticky Context visible, five Codex task
    rows available, Three.js star rendered via WebGL.
  - Mobile mic sensitivity changed visible value `100% -> 135% -> 100%`.
  - Settings Sticky Context toggle changed localStorage `1 -> 0 -> 1`.
  - Interactive fake-mic lifecycle: Start Listening reached `Listening`, mute
    became active, star state became `listening`, navigation to `/agents` kept
    the session alive through the shared realtime provider, return to `/voice`
    preserved `Stop Listening`, and Stop returned to `Ready`.
  - `run_codex_task` smoke task
    `2026-06-12T20-45-59-340Z-4d358cb6` with
    `task_type=agent_creation` and `write_mode=workspace_write` started in
    Codex exec mode with sandbox `workspace-write` and completed without
    creating a child agent or service.
  - Private telemetry recorded `sticky_context_sent` with
    `reason: realtime_connected`.
  - Automatic memory promotion was guarded so recovered `sessionStorage` events
    do not create duplicate tracked memory drafts on every page load; recovered
    terminal Codex task readbacks update UI task rows without appending new
    session-journal events.
  - `git diff --check` passed.

## V.12: UI Truth Cleanup

Goal: remove misleading controls and make current behavior explicit without
adding new durable actions.

Deliverables:

- Hide or wire `Open in Codex`.
- Remove the main transcript panel; keep only paste/text intake for links and
  long commands.
- Keep a single end-session control: `Stop Listening`.
- Keep mute and add microphone sensitivity/gain control.
- Hide Current Context `Clear` while memory focus is fixed.
- Remove disabled approval placeholders from the main surface; show approval
  only when attached to a concrete task/action.
- Remove quick actions from the main voice UI.
- Add labels/tooltips to active tool chips.
- Do not add mobile transcript to the main screen yet.

Acceptance criteria:

- No visible action looks more powerful than it is.
- The user can tell whether a button changes the realtime session, only the
  local view, or durable memory.
- Mobile has access to recent dialogue before any long-term memory work starts.

## V.13: Active Codex Task Queue UI

Goal: make parallel Codex sidecar tasks inspectable.

Deliverables:

- Change hook state from one `activeTask` to an `activeTasks` map/list.
- Render active and recently completed task rows with title, status, progress,
  result availability and handoff state.
- Keep task rows in stable creation order; polling and refresh update rows in
  place rather than sorting by latest activity.
- Add task detail drawer with request, status, result excerpt and safe relative
  paths.
- Show telemetry-derived state: polling started, terminal snapshot, handoff
  sent/skipped and skip reason.
- Add a small concurrency hint: target up to 5 parallel Codex tasks until a
  stronger queue UI exists.
- On page load, optionally read recent private Codex task metadata so the UI can
  recover after refresh.

Acceptance criteria:

- Starting a second Codex task never hides the first task from the operator.
- Completed tasks show whether their result was sent back to realtime.
- The operator can inspect a task without opening the filesystem manually.

## V.14: Current Session Recall

Goal: let the user easily refer back to earlier details in the current `/voice`
session without treating raw dialogue as permanent memory.

Deliverables:

- Assign a browser `session_id` when the voice page loads.
- Keep a bounded in-browser session journal of user turns, assistant turns, tool
  calls, task ids, task results and key handoff events.
- Mirror that journal to `sessionStorage` so a refresh can recover the current
  session on the same device.
- Add an `Earlier This Session` panel or drawer with search, pinned details and
  compact recap.
- Skip `Pin` for now unless a future workflow proves it useful.
- Add a compact session recap action only if it stays unobtrusive.
- Make the realtime model aware of the recap only when the user sends it or
  asks to use it; do not silently stuff the whole transcript into every turn.

Acceptance criteria:

- The user can ask "what were the exact details from earlier in this session?"
  and the UI can surface or send a compact recap.
- Refreshing the page does not immediately erase the current session journal.
- The current-session journal is not written to tracked memory by default.

## V.15: Curated Long-Term Memory From Important Dialogues

Goal: save important Pritha/child-agent design conversations as curated memory,
not raw chat logs.

Deliverables:

- Add an automatic `Save Memory Note` / `Promote Session Summary` path driven by
  Pritha/Codex judgment, not a required manual click.
- Generate a draft summary with:
  - why the dialogue matters;
  - decisions made;
  - UI/backend behavior clarified;
  - child-agent implications;
  - risks and open questions;
  - suggested target artifact type and path.
- Route Pritha/child-agent architecture summaries to tracked curated artifacts
  such as workflows, reviews, decisions, standards or lifecycle reports.
- Route user preferences to `.private/user-memory/` and keep them out of
  `.memory/techscope.sqlite`.
- Do not require operator review before every tracked memory write, but include
  dialogue metadata, source thread/session id and confidence so the write is
  auditable.
- Never save full raw transcripts, personal chatter, secrets, credentials,
  private provenance or long source excerpts.
- After a tracked memory write, run `node scripts/validate-memory.mjs` and
  rebuild the memory index.

Acceptance criteria:

- Important architecture/UI/behavior dialogue can become durable Pritha memory.
- The UI clearly shows what will be saved and where.
- User-model details remain local-private.
- Raw dialogue retention remains off by default.

## V.16: Context Focus And Memory Scope

Goal: make "Current Context" a real control instead of a static card.

Deliverables:

- Add selectable context focus: none, artifact, search result, child agent,
  roadmap, task result or pinned session note.
- Add true `Clear Context` that removes selected focus from future voice turns.
- Show whether the selected focus will be sent to realtime, only displayed in
  UI, or used for a Codex task.
- Add server-side validation before reading artifacts into focus.
- Make sticky context obvious on mobile.

Acceptance criteria:

- The user can see and reset what Pritha is supposed to remember for the next
  turn.
- Context focus cannot silently leak into unrelated future requests.

## V.17: Decision Gates

Goal: connect approval UI to real pending decisions without bringing back a
decorative standalone approval card.

Deliverables:

- Define decision types: memory write, file edit, Codex implementation,
  deployment/service change, publication, deletion and broad system change.
- Add backend state for pending decision, evidence, proposed action, risk and
  expiry if a future action is not already represented by a Codex task card.
- Require explicit approval for durable writes and system changes.
- Log decisions to private telemetry and, when appropriate, curated reports.

Acceptance criteria:

- Approve/Decline appears only when a concrete pending action exists.
- The voice model cannot treat a decorative approval card as real permission.

## V.20: Paste/File Intake And Direct Codex Analysis

Status: implemented first slice on 2026-06-24.

Goal: let the operator paste or drop screenshots, images, PDFs and other files
into the Voice Control intake without confusing live command text with material
that should become a Codex analysis task.

Implemented direction:

- Plain text without links still goes directly to the active realtime voice
  session.
- Files, screenshots pasted from the clipboard and text containing URLs create a
  Codex sidecar analysis task through `/api/realtime/intake`.
- Files are staged only under private temporary `voice-intake` storage, with
  generated safe filenames and a manifest. They are not written to tracked
  memory. Terminal task readback does not purge staging immediately; private
  staging remains available to Codex for about two hours and is then removed by
  TTL cleanup with a private audit event.
- The current limits are 8 files, 10 MiB per file and 25 MiB total per intake.
- URL intake is routed to Codex as well. Media-hosted URLs tell
  Codex to use the existing transient media transcription workflow when useful
  and to return a voice-ready summary instead of retaining a full transcript.
- Document Processor is intentionally not used for this path. The chosen v1
  behavior is direct Codex analysis with bounded private staging.

Open questions:

- Whether PDF/image/page-count limits need to be stricter than byte limits after
  real usage data.
- Whether successful intake summaries should be promoted only to ephemeral
  Voice Context or optionally offered as curated memory candidates.
- Whether mobile Safari clipboard behavior needs a separate capture affordance
  beyond file picker and paste handling.

## V.18: Observability And Recovery

Goal: make debugging realtime/tool failures possible from the UI.

Deliverables:

- Add a developer details drawer for recent private telemetry events.
- Show realtime data-channel state, last error, provider error code and audio
  readiness.
- Show Codex mode, sandbox, timeout and write-enabled status.
- Add clear reasons for handoff skipped: `channel_closed`, `empty_result`,
  timeout or failed task.
- Add a manual `Refresh Task Status` action for task rows.

Acceptance criteria:

- After a failed voice test, the operator can tell whether the failure was
  microphone, realtime provider, data channel, tool execution, Codex task, task
  polling or result handoff.

## V.19: Mobile And Visual QA

Goal: make the phone experience first-class.

Deliverables:

- Test `/voice` on desktop and mobile viewports after each visual change.
- Verify the Three.js star scene renders nonblank and remains framed.
- Keep transcript, task status and primary controls reachable on mobile.
- Avoid overflowing model/error/status text on narrow screens.
- Keep the visualizer expressive but secondary to task/session state.

Acceptance criteria:

- Mobile can start a call, inspect earlier turns, inspect Codex task status and
  promote a session summary without switching devices.

## Recommended Next Batch

Harden the newly implemented V.13-V.16 path before moving to approval gates and
cross-device recovery.

Reason:

- V.13 now exposes Codex task detail/recovery; next it needs filtering,
  compact mobile details and clearer task lifecycle states.
- V.14 now gives same-device current-session recall; next it needs optional
  ignored `.private/.../sessions/` persistence for recovery across reloads or
  devices.
- V.15 now writes curated memory; next it needs eval examples, duplicate
  detection, artifact-type routing and an operator-visible memory-write history.
- V.16 now sends automatic Sticky Context; next it needs selectable context
  focus, per-agent/per-voice-session defaults and a clearer context inspection
  surface.
- Voice sessions now survive route changes inside Control Center. Next, test
  iOS Safari behavior for background tabs, screen lock and switching away from
  the browser, because OS/browser suspension can still interrupt WebRTC outside
  our React lifecycle.

## Open Product Questions

- Exact implementation of ignored `.private/.../sessions/` should be tested for
  latency impact before making it cross-device recovery.
- Sticky Context v1 is automatic. Open question: should v2 expose a compact
  "what is pinned now" inspector, or keep the operator surface voice-first and
  show details only in dev/session drawers?
- Automatic long-term memory needs a safe classifier: which dialogues become
  roadmap/review/decision/standard/private user-memory notes.
- `Open in Codex` needs a concrete transport: open current project directly if
  possible, otherwise provide a ready prompt and path.
- Cross-page realtime persistence is solved for internal Control Center routes.
  Cross-tab, browser-background and iOS lock-screen persistence need device
  testing and may require explicit product limits rather than code-only fixes.

## Current Dialogue Memory Note

This roadmap itself is the curated memory note for the 2026-06-12 dialogue about
`/voice`. It intentionally preserves product decisions, architecture boundaries,
known bugs, roadmap phases and open questions, while omitting raw dialogue and
personal/private content.
