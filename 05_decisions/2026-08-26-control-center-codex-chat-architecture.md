---
id: 2026-08-26-control-center-codex-chat-architecture
type: decision
status: superseded
created: 2026-08-26
updated: 2026-09-03
topics:
  - pritha-control-center
  - codex-chat
  - codex-app-server
  - codex-cli
  - voice-control
  - thread-history
tools:
  - Codex App Server
  - Codex CLI
  - Pritha Control Center
  - Next.js
  - Server-Sent Events
sources:
  - https://learn.chatgpt.com/docs/app-server
  - https://learn.chatgpt.com/docs/non-interactive-mode
  - https://learn.chatgpt.com/docs/features/voice
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/lib/routes.ts
  - docs/ui-design/2026-06-04-pritha-control-center-spec-v0.4.txt
  - 03_reviews/2026-06-23-pritha-voice-codex-app-thread-routing-review.md
related:
  intakes: []
  briefs: []
  reviews:
    - 03_reviews/2026-06-23-pritha-voice-codex-app-thread-routing-review.md
  standards:
    - 04_standards/control-center-codex-chat-api-contract.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
supersedes:
  - docs/ui-design/2026-06-04-pritha-control-center-spec-v0.4.txt#section-7-rule-7-no-full-chat
superseded_by:
  - 05_decisions/2026-09-03-neuraldeep-task-chat-voice-architecture.md
freshness_status: historical
source_published: unknown
source_updated: unknown
source_version: "Codex App Server docs retrieved 2026-08-26; local bundled codex-cli 0.149.0-alpha.4.1; standalone codex-cli 0.135.0"
retrieved: 2026-08-26
verified: 2026-08-26
valid_for: Pritha Control Center Codex Chat v1 and the locally verified Codex runtimes
temporal_status: version-bound
review_date: 2026-10-26
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
  - agent-building-knowledge
subject:
  kind: decision
  id: control-center-codex-chat
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: Control Center Codex Chat architecture

Date: 2026-08-26
Status: superseded for Pritha NeuralDeep by
`05_decisions/2026-09-03-neuraldeep-task-chat-voice-architecture.md`

## Context

Pritha Control Center already has Voice Control. The Realtime model conducts a
live spoken conversation, turns an accepted brief into a Codex deep task and
shows a separate task card. The operator now also needs a conventional `/codex`
tab: editable text or dictated text goes directly to Codex, Codex streams its
work and returns a normal Markdown answer, and the operator can continue or
switch conversations.

The previous Control Center v0.4 specification explicitly excluded a full chat.
This decision intentionally replaces only that rule. It does not turn the rest
of Control Center into a Codex clone and does not merge Voice Control with the
new direct chat.

There are two locally installed Codex binaries:

- the binary bundled with ChatGPT/Codex desktop, currently
  `codex-cli 0.149.0-alpha.4.1`;
- standalone Codex CLI, currently `codex-cli 0.135.0`.

Both can expose the App Server protocol. Therefore "Codex App" versus "Codex
CLI" is primarily a **runtime binary and state-source choice**, not a choice
between rich chat and terminal output. `codex exec --json` is useful as a
fallback, but it is a weaker chat transport.

## Decision

Build one Codex Chat product surface backed by one server-side Codex Chat
Gateway. The gateway always prefers the App Server protocol, whichever approved
Codex binary supplies it.

```text
Browser /codex
  |  guarded same-origin HTTP + SSE
  v
Pritha Codex Chat Gateway
  |-- private thread/task-link registry
  |-- capability + runtime binding
  |-- normalized events and approval requests
  |
  +--> Desktop-bundled binary -> codex app-server over stdio
  |
  +--> Standalone CLI binary  -> codex app-server over stdio
  |
  +--> degraded fallback      -> codex exec --json / exec resume
  |
  +--> final fallback         -> existing private task queue/read-only state
```

The browser never connects directly to App Server and never receives its raw
JSON-RPC stream. Pritha owns the subprocess, performs the required
`initialize`/`initialized` handshake, normalizes version differences and
exposes a stable versioned HTTP/SSE contract.

## Runtime and protocol model

Settings must separate these concepts:

1. `preferredRuntime`: `auto`, `desktop_bundled`, or `standalone_cli`.
2. `chatProtocol`: resolved capability, normally `app_server`; the UI may show
   `exec_resume` only as a degraded state, not as an equivalent full-chat mode.
3. `taskFallbackEnabled`: whether a task may move to the next safe transport
   before its turn starts.
4. Existing Voice thread-routing settings remain independent:
   `per_task`, `control`, `subject_scoped`, `subject_scoped_rotate`.

The UI must show the effective runtime label, version, protocol and degraded
state. It may show a shortened binary location, but must not put user-specific
absolute paths into tracked files, telemetry or thread names.

The gateway keeps a supervised App Server connection keyed by runtime provider
and state identity. It sends exactly one `initialize` request and then the
`initialized` notification per connection. At most one provider may own the
active lease for a thread at a time.

## Capability negotiation and version drift

At startup and whenever the selected binary changes, the gateway must:

1. resolve the binary env-first and verify its executable path;
2. record its `codex --version` value;
3. generate or load the version-specific App Server schema;
4. complete `initialize`/`initialized`;
5. probe the required stable chat methods;
6. build a capability map consumed by the adapter and UI.

Required full-chat core:

- `thread/start`, `thread/resume`, `thread/list`, `thread/read`;
- `thread/fork`, `thread/archive`, `thread/unarchive`;
- `turn/start`, `turn/steer`, `turn/interrupt`;
- streamed turn/item/agent-message events;
- command and file-change approvals;
- user-input requests and their resolution.

Experimental methods or fields must not be assumed. In particular, locally
generated schemas for the two current binaries differ, and neither current
local schema exposes the documented experimental `thread/turns/list` method.
Chat v1 therefore loads native history through `thread/read(includeTurns=true)`
and uses paginated turn APIs only when the capability probe explicitly proves
them.

SSE is the low-latency delivery path, not the sole source of completion truth.
The browser periodically reconciles the selected chat against `thread/read`,
with a faster cadence while a turn is active or the stream is reconnecting,
and also after focus, visibility and network-online transitions. A terminal
native turn clears any stale in-memory active lease and repairs the private
thread status. Read-only history calls may reconnect and retry once after a
confirmed App Server transport failure; a turn start is never replayed by this
recovery path.

## Fallback policy

The ordered resolver is:

1. preferred runtime using App Server;
2. alternate runtime using App Server;
3. persistent `codex exec --json`, continued with
   `codex exec resume <SESSION_ID>`;
4. existing private task queue or read-only task card.

Automatic fallback is allowed only before `turn/started` (or before an exec
process emits `turn.started`). After that boundary, blind replay is forbidden:
the first attempt may already have changed files, called tools or sent an
external side effect. A mid-turn failure becomes a visible recoverable error
with `Resume`, `Retry from checkpoint`, or `Start a new chat`; any replay needs
an explicit operator action and a fresh state check.

The exec fallback for direct chat must not use `--ephemeral`, because ephemeral
runs do not create resumable native history. Existing Voice task fallback may
remain ephemeral until its migration is implemented, but the UI must label such
work `Task record only · no native chat history`.

## Thread ownership and history

Use a linked hybrid model:

- the native Codex thread is canonical for the conversation transcript;
- Pritha stores only private relationship metadata, runtime binding, task links
  and bounded recovery/event state;
- Pritha does not duplicate a full native transcript in Markdown, SQLite or the
  tracked repository;
- a degraded exec transport may keep a bounded private mirror needed to render
  and resume the session.

Every known thread has a private binding like:

```json
{
  "chatId": "chat_opaque-pritha-id",
  "nativeThreadId": "native-thread-id",
  "runtimeProvider": "desktop_bundled",
  "runtimeVersion": "0.149.0-alpha.4.1",
  "stateIdentityHash": "sha256:opaque",
  "historyKind": "native",
  "origin": "chat",
  "projectId": "pritha",
  "cwdFingerprint": "sha256:opaque"
}
```

The browser and Pritha HTTP API address the stable `chatId`; the native Codex
id stays inside the binding. This lets a degraded exec chat exist before its
first `thread.started` event and lets Pritha rebind or fork a conversation
without changing browser URLs.

The state identity binds a thread to the Codex state root/account/profile that
created or indexed it. A thread id visible to both local binaries is not enough
to prove safe cross-runtime continuation. Before resuming through a different
provider, the gateway must perform a read-only `thread/read`, compare project,
state and capability data, and either rebind safely or require an explicit fork
or compact handoff.

## Relationship to Voice Control tasks

A Codex thread and a Pritha task card are different entities:

- a thread is a conversation containing many turns;
- a task card is an operational record for one accepted job;
- a Voice task link records the Pritha `chat_id`, `codex_thread_id` when one
  exists and every associated `turn_id` in order;
- CLI ephemeral or queue-only work has a task card but no native thread.

Voice Control keeps its accepted `subject_scoped` routing. Direct chat creates
ordinary chat threads by default and does not silently inject itself into the
subject-scoped Voice thread. The operator may explicitly choose `Continue in
this chat`; the gateway then validates the target binding and creates a task
link before starting a turn.

History is presented in three groups:

1. **My chats** — threads created in `/codex`.
2. **Voice work** — task-linked Codex threads, grouped by Voice subject scope;
   queue-only/ephemeral work appears as task records with no chat affordance.
3. **Other project sessions** — native Codex sessions discovered for the Pritha
   working directory. They are collapsed and read-only by default until the
   operator explicitly adopts or forks them.

Archive affects the native thread and its private relationship record. Deletion
is not part of Chat v1 because runtime support differs and deletion is
destructive; it requires a separate decision and confirmation design.

## User interface boundary

Add `/codex` to desktop and mobile navigation. The page is a two-pane surface
inside the existing Control Center shell:

- history rail: grouped threads, search, new chat and archive access;
- conversation pane: header, transcript/activity stream and sticky composer;
- mobile: the history rail becomes a drawer/chat picker;
- microphone: editable dictation into the composer, not a second Realtime voice
  agent and not automatic send;
- responses: rendered Markdown, progress summaries, collapsed tool activity,
  file/command changes, approvals, user-input cards and linked Voice task cards.

Raw hidden reasoning is never rendered. If a runtime emits a supported reasoning
summary, the gateway may expose it as a clearly labelled bounded progress
summary; raw reasoning text is dropped.

## Security and privacy

- All routes pass the existing Control Center API guard: loopback or trusted
  Tailnet host, same-origin mutation checks and Tailnet identity enforcement.
- App Server remains a local server-side `stdio` subprocess. Experimental
  WebSocket transport is not exposed to the browser.
- `cwd` is server-owned and restricted to the canonical Pritha checkout or an
  explicitly allowed project root. Browser input cannot select an arbitrary
  filesystem root.
- Approval requests remain scoped to exact `threadId`, `turnId`, `itemId` and
  `requestId`; stale or already-resolved approvals fail closed.
- Credentials, auth files, raw secret values, private state paths and raw
  untrusted tool output are never returned in history summaries.
- Private chat linkage lives under `<PRITHA_STATE_ROOT>/codex-chat/`, or under
  gitignored `.private/codex-chat/` for legacy compatibility.

## Alternatives considered

### Desktop-only integration

Rejected. It would provide rich history but fail on machines or deployments
where only standalone CLI exists.

### `codex exec` as the only backend

Rejected as the primary path. JSONL output and `exec resume` can preserve a
basic conversation, but approvals, interactive user questions, steering,
interrupts and native history management are weaker or harder to model.

### Two separate chat implementations

Rejected. A Desktop chat and a CLI chat would duplicate state, produce different
semantics and make switching settings destructive to continuity.

### Browser connected directly to App Server WebSocket

Rejected. The transport is experimental/unsupported and would expose a powerful
local agent protocol outside the existing server-side security boundary.

### Unified gateway with version adapters

Accepted. It gives one UI and one Pritha contract while still using either
installed runtime and preserving a bounded exec fallback.

## Consequences

- The first implementation is larger than a final-message-only chat because it
  must normalize events, approvals, history and runtime ownership.
- Desktop and standalone CLI can be implemented together: both normally use the
  same App Server adapter and differ only at binary resolution/capability edges.
- Current `PrithaCodexAppServerClient` can provide reusable pieces, but cannot be
  reused unchanged: it is task-shaped, starts a process per run, omits the
  required `initialized` notification, handles only a small event subset and
  closes after the final turn.
- The current hardcoded `/Applications/Codex.app/...` candidate must be replaced
  with capability-based discovery that recognizes the actual bundled path and
  env overrides without storing machine-specific paths in tracked artifacts.
- Existing Voice behavior and routes remain operational. `/voice`, `/agents`
  and `/settings` are regression surfaces for the implementation.

## Implementation gates

Before `/codex` is considered ready:

- both local binaries pass the common-core probe or expose an honest degraded
  capability result;
- initialization includes the `initialized` notification;
- a thread can be created, listed, read, resumed, forked and archived;
- one turn streams, can be interrupted and cannot be double-submitted;
- approvals and user-input requests round-trip with stale-request rejection;
- reconnect with `Last-Event-ID` does not duplicate transcript items;
- Voice task links survive server restart without copying the transcript;
- fallback never auto-replays after `turn.started`;
- desktop and 320 px mobile layouts pass the wireframe acceptance states;
- existing Control Center tests and build/typecheck remain green.

## Temporal basis

- Source published: unknown.
- Source updated: unknown; official pages were live when retrieved.
- Source version: Codex App Server documentation retrieved 2026-08-26;
  locally generated schemas from bundled `0.149.0-alpha.4.1` and standalone
  `0.135.0`.
- Retrieved: 2026-08-26.
- Verified: 2026-08-26.
- Valid for: Pritha Control Center Codex Chat v1 and the locally verified
  runtimes.
- Freshness status: current.
- Temporal status: version-bound.
- Supersedes: only the old Control Center v0.4 prohibition on a full web chat.
- Superseded by: none.

## Review date

2026-10-26, or earlier when either local Codex binary changes version, App
Server promotes WebSocket/paginated history to stable, or thread persistence
semantics change.
