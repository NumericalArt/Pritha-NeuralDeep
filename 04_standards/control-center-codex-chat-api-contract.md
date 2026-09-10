---
id: control-center-codex-chat-api-contract
type: standard
status: superseded
created: 2026-08-26
updated: 2026-09-03
last_reviewed: 2026-09-03
owner: Pritha/user
topics:
  - pritha-control-center
  - codex-chat
  - api-contract
  - server-sent-events
  - codex-app-server
  - codex-cli
  - voice-task-linking
tools:
  - Next.js
  - TypeScript
  - Server-Sent Events
  - Codex App Server
  - Codex CLI
agent_platforms:
  - Codex
model_context:
  - runtime-advertised Codex models
runtime_environment:
  - local-web-app
  - browser
  - codex-desktop
  - codex-cli
config_surfaces:
  - interfaces/control-center/src/app/api/codex-chat/v1
  - interfaces/control-center/src/lib/codex-chat
  - interfaces/control-center/src/lib/security/api-guard.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - private Codex chat registry
portability: adapter-needed
sources:
  - https://learn.chatgpt.com/docs/app-server
  - https://learn.chatgpt.com/docs/non-interactive-mode
  - https://learn.chatgpt.com/docs/features/voice
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
  - interfaces/control-center/src/lib/realtime/codex-task/types.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/lib/security/api-guard.ts
related:
  decisions:
    - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
  reviews:
    - 03_reviews/2026-06-23-pritha-voice-codex-app-thread-routing-review.md
  briefs: []
  workflows:
    - docs/ui-design/2026-08-26-control-center-codex-chat-wireframe.md
supersedes: []
superseded_by:
  - 04_standards/neuraldeep-task-chat-api-contract.md
freshness_status: historical
source_published: unknown
source_updated: unknown
source_version: "Pritha Codex Chat API v1; verified against Codex App Server docs and local schemas from bundled 0.149.0-alpha.4.1 and standalone 0.135.0"
retrieved: 2026-08-26
verified: 2026-08-26
valid_for: Pritha Control Center Codex Chat API v1
temporal_status: version-bound
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
  - agent-building-knowledge
subject:
  kind: standard
  id: control-center-codex-chat-api
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Standard: Control Center Codex Chat API contract

Status: superseded for Pritha NeuralDeep by
`04_standards/neuraldeep-task-chat-api-contract.md`
Owner: Pritha/user
Last reviewed: 2026-08-26

## Rule

The `/codex` tab talks only to the versioned, same-origin Pritha API described
here. Browser code must not import version-specific Codex App Server types,
connect to App Server directly or parse raw `codex exec --json` events.

This is the normative v1 browser/gateway contract. The gateway may adapt to
different Codex binaries, but it must preserve these HTTP objects, event names,
state transitions and error semantics.

## Use when

- implementing the Control Center `/codex` tab;
- linking Voice Control task cards to native Codex conversations;
- adding a Desktop-bundled or standalone CLI App Server adapter;
- implementing persistent `codex exec resume` fallback;
- writing contract, adapter, route, SSE or browser-state tests.

## Avoid when

- calling App Server internally inside a version-specific adapter;
- reading private Codex task files through the existing Voice task API;
- building a generic remote/multi-user Codex service;
- exposing raw chain-of-thought, credentials, absolute private state paths or
  arbitrary filesystem roots.

## 1. Protocol and version

Base path:

```text
/api/codex-chat/v1
```

Rules:

- JSON encoding is UTF-8 and field names are `camelCase`.
- JSON requests use `Content-Type: application/json`.
- timestamps are RFC 3339 UTC strings such as `2026-08-26T17:02:11.104Z`;
- every identifier is opaque and case-sensitive;
- clients must not infer native Codex ids from Pritha ids;
- unknown response fields must be ignored;
- unknown enum values must render as `unsupported`, not crash the page;
- breaking changes require `/v2`; additive fields and new SSE event types may
  be added to v1.

All JSON success responses use:

```ts
type ApiSuccess<T> = {
  apiVersion: "1";
  requestId: string;
  data: T;
  replayed?: boolean;
};
```

All JSON error responses use the envelope defined in section 13. SSE is the
only route that does not use a JSON envelope.

## 2. Security boundary

Every endpoint is protected by the existing Control Center API guard before it
reaches the route handler:

- Host must be loopback or an allowed Tailnet host.
- Mutations must be same-origin (`Sec-Fetch-Site` and `Origin` checks).
- Tailnet requests must carry an allowed Tailscale user identity.
- A spoofed Tailnet identity header on loopback is stripped.

The server chooses the project root. No request body or query parameter in v1
accepts arbitrary `cwd`, a binary path, a Codex state directory, an auth file or
a shell command to launch Codex.

Request limits:

| Input | Limit |
| --- | ---: |
| JSON body | 256 KiB |
| turn text | 64,000 UTF-8 bytes |
| steer text | 16,000 UTF-8 bytes |
| thread title | 120 Unicode code points |
| thread search | 200 Unicode code points |
| task links submitted at once | 1 |
| list page size | 1–50; default 30 |
| turn page size | 1–50; default 20 |

## 3. Stable identifiers

```ts
type ChatId = `chat_${string}`;       // Pritha stable conversation id
type TurnId = `turn_${string}`;       // Pritha stable turn id
type ItemId = `item_${string}`;       // Pritha stable rendered item id
type RequestId = `request_${string}`; // pending approval/input id
type TaskId = string;                 // existing private Pritha task id
```

`ChatId`, `TurnId` and `ItemId` are generated by Pritha. Native App Server or
exec ids are held in the private binding and never used as route parameters.

## 4. Runtime and capability types

```ts
type RuntimeProviderId = "desktop_bundled" | "standalone_cli";
type RuntimeProtocol = "app_server" | "exec_resume" | "queue";
type Availability = "ready" | "degraded" | "unavailable";

type RuntimeCapabilityMap = {
  fullChat: boolean;
  nativeHistory: boolean;
  listThreads: boolean;
  readThread: boolean;
  forkThread: boolean;
  archiveThread: boolean;
  unarchiveThread: boolean;
  renameThread: boolean;
  pinThread: boolean;
  steerTurn: boolean;
  interruptTurn: boolean;
  commandApprovals: boolean;
  fileChangeApprovals: boolean;
  permissionApprovals: boolean;
  requestUserInput: boolean;
  historyPagination: boolean;
  audioInput: boolean;
};

type RuntimeModelOption = {
  id: string;
  label: string;
  effortIds: string[];
  serviceTierIds: string[];
  defaultEffortId: string | null;
};

type RuntimeProviderView = {
  providerId: RuntimeProviderId;
  label: string;
  availability: Availability;
  version: string | null;
  protocol: RuntimeProtocol | null;
  locationLabel: "Desktop bundled" | "Standalone CLI";
  stateIdentityHash: string | null;
  capabilities: RuntimeCapabilityMap;
  warning: string | null;
};

type RuntimeStatus = {
  preferredProvider: "auto" | RuntimeProviderId;
  effectiveProvider: RuntimeProviderId | null;
  effectiveProtocol: RuntimeProtocol | null;
  availability: Availability;
  fallbackEnabled: boolean;
  providers: RuntimeProviderView[];
  models: RuntimeModelOption[];
  selected: {
    modelId: string | null;
    effortId: string | null;
    serviceTierId: string | null;
    sandboxMode: "read_only" | "workspace_write" | "danger_full_access";
    approvalMode: "untrusted" | "on_request" | "never";
  };
  probedAt: string;
};
```

`stateIdentityHash` is an opaque one-way identity for the effective Codex state
root/account/profile. The browser never receives the underlying path or auth
identifier.

## 5. Thread, turn and item types

```ts
type ThreadGroup = "my_chats" | "voice_work" | "other_sessions";
type ThreadOrigin = "chat" | "voice" | "external" | "exec_fallback";
type HistoryKind = "native" | "mirrored" | "task_only";

type ThreadStatus =
  | "not_loaded"
  | "idle"
  | "active"
  | "system_error"
  | "archived";

type RuntimeBindingView = {
  providerId: RuntimeProviderId | null;
  version: string | null;
  protocol: RuntimeProtocol;
  stateIdentityHash: string | null;
  compatibility: "bound" | "compatible" | "probe_required" | "mismatch";
};

type TaskLinkView = {
  taskId: TaskId;
  shortId: string | null;
  label: string;
  origin: "voice" | "chat";
  mode: "shared_thread" | "result_reference" | "degraded_no_thread";
  subjectScope: {
    kind: "agent" | "pritha" | "task" | "control";
    id: string;
    label: string;
    generation: number;
  } | null;
  status: string;
  linkedAt: string;
};

type ThreadSummary = {
  chatId: ChatId;
  title: string;
  preview: string;
  group: ThreadGroup;
  origin: ThreadOrigin;
  status: ThreadStatus;
  activeFlags: Array<"waiting_on_approval" | "waiting_on_input" | "streaming">;
  pinned: boolean;
  archived: boolean;
  historyKind: HistoryKind;
  createdAt: string;
  updatedAt: string;
  runtime: RuntimeBindingView;
  taskLinks: TaskLinkView[];
};

type TurnStatus =
  | "queued"
  | "in_progress"
  | "waiting_for_approval"
  | "waiting_for_input"
  | "completed"
  | "interrupted"
  | "failed";

type MessageView = {
  id: ItemId;
  role: "user" | "assistant";
  markdown: string;
  status: "streaming" | "completed" | "failed";
  createdAt: string;
};

type BaseItemView = {
  id: ItemId;
  status: "pending" | "in_progress" | "completed" | "failed" | "declined";
  startedAt: string | null;
  completedAt: string | null;
};

type ChatItemView =
  | (BaseItemView & {
      kind: "assistant_message";
      message: MessageView;
    })
  | (BaseItemView & {
      kind: "reasoning_summary";
      markdown: string;
    })
  | (BaseItemView & {
      kind: "command";
      commandPreview: string;
      cwdLabel: string | null;
      outputPreview: string | null;
      exitCode: number | null;
    })
  | (BaseItemView & {
      kind: "file_change";
      changes: Array<{
        path: string;
        operation: "add" | "modify" | "delete" | "rename" | "unknown";
      }>;
      diffPreview: string | null;
    })
  | (BaseItemView & {
      kind: "tool";
      toolName: string;
      displayName: string;
      summary: string | null;
    })
  | (BaseItemView & {
      kind: "web_search";
      query: string;
      statusText: string | null;
    })
  | (BaseItemView & {
      kind: "plan";
      steps: Array<{
        label: string;
        status: "pending" | "in_progress" | "completed";
      }>;
    })
  | (BaseItemView & {
      kind: "task_link";
      task: TaskLinkView;
    })
  | (BaseItemView & {
      kind: "notice";
      tone: "info" | "warning" | "error";
      text: string;
    })
  | (BaseItemView & {
      kind: "unsupported";
      label: string;
    });

type TurnView = {
  turnId: TurnId;
  status: TurnStatus;
  userMessage: MessageView;
  items: ChatItemView[];
  pendingRequestIds: RequestId[];
  startedAt: string;
  completedAt: string | null;
  error: { code: string; message: string } | null;
};
```

The server bounds `outputPreview` to 16 KiB and `diffPreview` to 64 KiB per
item. File paths are project-relative whenever possible. Unsupported native
items become a harmless `unsupported` card.

Raw reasoning text is discarded. Only an upstream-supported reasoning summary,
already intended for user display, may become `reasoning_summary`.

## 6. Pending request types

```ts
type PendingRequestView = {
  requestId: RequestId;
  chatId: ChatId;
  turnId: TurnId;
  itemId: ItemId | null;
  kind:
    | "command_approval"
    | "file_change_approval"
    | "permission_approval"
    | "user_input"
    | "mcp_elicitation";
  title: string;
  reason: string | null;
  expiresAt: string | null;
  resolved: boolean;
  presentation:
    | {
        type: "command";
        commandPreview: string;
        cwdLabel: string | null;
        availableDecisions: Array<"accept" | "acceptForSession" | "decline" | "cancel">;
        proposedExecpolicyAmendment: string[] | null;
      }
    | {
        type: "file_change";
        paths: string[];
        grantRootLabel: string | null;
        availableDecisions: Array<"accept" | "acceptForSession" | "decline" | "cancel">;
      }
    | {
        type: "permission";
        network: string[];
        filesystem: string[];
        scopes: Array<"turn" | "session">;
      }
    | {
        type: "questions";
        questions: Array<{
          id: string;
          header: string;
          question: string;
          options: Array<{ id: string; label: string; description: string }>;
          allowFreeform: boolean;
        }>;
      }
    | {
        type: "elicitation";
        message: string;
        mode: "form" | "url";
        url: string | null;
        schema: Record<string, unknown> | null;
      };
};
```

`GET /threads/{chatId}` returns unresolved requests so refreshing the browser
does not lose an approval or question.

## 7. HTTP routes

| Method | Route | Purpose | Success |
| --- | --- | --- | --- |
| `GET` | `/runtime` | effective runtime and capabilities | `200` |
| `GET` | `/threads` | grouped/searchable thread page | `200` |
| `POST` | `/threads` | create a Pritha chat binding | `201` or idempotent `200` |
| `GET` | `/threads/{chatId}` | thread metadata and pending requests | `200` |
| `PATCH` | `/threads/{chatId}` | rename and/or pin | `200` |
| `GET` | `/threads/{chatId}/turns` | normalized turn history page | `200` |
| `POST` | `/threads/{chatId}/fork` | fork native/mirrored history | `201` |
| `POST` | `/threads/{chatId}/archive` | archive | `200` |
| `POST` | `/threads/{chatId}/unarchive` | unarchive | `200` |
| `POST` | `/threads/{chatId}/turns` | start one new turn | `202` |
| `POST` | `/threads/{chatId}/turns/{turnId}/steer` | add input to active turn | `202` |
| `POST` | `/threads/{chatId}/turns/{turnId}/interrupt` | interrupt active turn | `202` |
| `GET` | `/threads/{chatId}/events` | thread SSE stream | streaming `200` |
| `POST` | `/threads/{chatId}/requests/{requestId}/resolve` | resolve approval/input | `200` |
| `POST` | `/threads/{chatId}/task-links` | explicit Voice/task linkage | `201` or idempotent `200` |

There is no `DELETE` route in v1.

## 8. Runtime and history routes

### `GET /runtime`

Response data is `RuntimeStatus`.

The route is `Cache-Control: no-store`. A probe older than 60 seconds may be
returned immediately while the server schedules one bounded refresh; a changed
result is emitted as `runtime.changed` on open thread streams.

### `GET /threads`

Query:

```ts
type ListThreadsQuery = {
  group?: ThreadGroup | "all"; // default "all"
  archived?: "true" | "false"; // default "false"
  search?: string;
  cursor?: string;
  limit?: string;               // integer 1..50, default 30
};
```

Response:

```ts
type ThreadPage = {
  data: ThreadSummary[];
  nextCursor: string | null;
};
```

Sorting is pinned first, then `updatedAt` descending. Group filtering happens
before pagination. `other_sessions` is restricted to exact approved project
working-directory fingerprints and is read-only until adopted or forked.

### `POST /threads`

Headers:

```text
Idempotency-Key: <UUID or 8..128 printable ASCII characters>
```

Body:

```ts
type CreateThreadRequest = {
  clientThreadId: string; // UUID generated once by the browser
  title?: string;
  source: "chat";
  settings?: {
    modelId?: string;
    effortId?: string;
    serviceTierId?: string;
  };
};
```

Response data:

```ts
type ThreadDetail = {
  thread: ThreadSummary;
  activeTurnId: TurnId | null;
  pendingRequests: PendingRequestView[];
  streamUrl: string;
};
```

The gateway selects and binds a provider. With App Server it calls
`thread/start`. With exec fallback it creates a mirrored Pritha chat first and
binds the native session after the first `thread.started` event.

Repeating the same `clientThreadId` and identical body returns the existing
chat with `200` and `replayed: true`. Reusing it with a different body returns
`409 idempotency_conflict`.

### `GET /threads/{chatId}`

Response data is `ThreadDetail`. This call never resumes a native thread merely
to display metadata.

### `PATCH /threads/{chatId}`

Body:

```ts
type UpdateThreadRequest = {
  title?: string;
  pinned?: boolean;
};
```

At least one field is required. Unknown or unsupported upstream metadata is
reported as `409 capability_unavailable`; Pritha does not pretend the change
was persisted.

### `GET /threads/{chatId}/turns`

Query:

```ts
type ListTurnsQuery = {
  cursor?: string;
  direction?: "older" | "newer"; // default "older"
  limit?: string;                 // integer 1..50, default 20
};
```

Response:

```ts
type TurnPage = {
  data: TurnView[];      // always chronological within this page
  olderCursor: string | null;
  newerCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
  snapshotAt: string;
};
```

Cursors are opaque, short-lived and bound to `chatId`, direction and history
snapshot. A mismatched or expired cursor returns `400 invalid_cursor`.

The adapter may implement this by reading full native history and slicing it.
It may use an upstream paginated method only when the runtime capability probe
explicitly enables `historyPagination`.

### Fork, archive and unarchive

`POST /threads/{chatId}/fork` body:

```ts
type ForkThreadRequest = {
  clientThreadId: string;
  title?: string;
  fromTurnId?: TurnId; // omitted means fork complete history
};
```

Response data is `ThreadDetail` with `201`.

Archive and unarchive bodies are empty JSON objects `{}`. Response data is the
updated `ThreadSummary`. Archiving an active thread returns `409 turn_active`.

## 9. Turn routes

### `POST /threads/{chatId}/turns`

Headers require `Idempotency-Key`.

Body:

```ts
type StartTurnRequest = {
  clientMessageId: string; // UUID, unique inside chat
  input: [{ type: "text"; text: string }];
  settings?: {
    modelId?: string;
    effortId?: string;
    serviceTierId?: string;
  };
};
```

Exactly one non-empty text item is accepted in v1. Browser voice dictation edits
this text before submit and does not change the API shape.

Response data with `202`:

```ts
type AcceptedTurn = {
  turn: TurnView;
  streamUrl: string;
};
```

Only one active turn is allowed per chat. Starting another returns
`409 turn_active`; the client may call steer or interrupt explicitly.

The gateway records an attempt before invoking Codex. It may try the next
provider only before the upstream emits/acknowledges `turn.started`. It must not
auto-replay after that boundary.

### `POST /threads/{chatId}/turns/{turnId}/steer`

Body:

```ts
type SteerTurnRequest = {
  clientMessageId: string;
  input: [{ type: "text"; text: string }];
};
```

The turn must be active and the capability must be available. Response data is
`{ turnId, accepted: true }` with `202`.

### `POST /threads/{chatId}/turns/{turnId}/interrupt`

Body is `{}`. Response data is `{ turnId, accepted: true }` with `202`.
Completion is authoritative only when SSE emits `turn.interrupted` or
`turn.completed` with an interrupted status.

## 10. Resolve approval or user input

`POST /threads/{chatId}/requests/{requestId}/resolve` requires an
`Idempotency-Key` and one of these bodies:

```ts
type ResolveRequestBody =
  | {
      kind: "command_approval";
      turnId: TurnId;
      decision: "accept" | "acceptForSession" | "decline" | "cancel";
      execpolicyAmendment?: string[];
    }
  | {
      kind: "file_change_approval";
      turnId: TurnId;
      decision: "accept" | "acceptForSession" | "decline" | "cancel";
    }
  | {
      kind: "permission_approval";
      turnId: TurnId;
      scope: "turn" | "session";
      granted: {
        network: string[];
        filesystem: string[];
      };
    }
  | {
      kind: "user_input";
      turnId: TurnId;
      answers: Array<{
        questionId: string;
        optionId?: string;
        text?: string;
      }>;
    }
  | {
      kind: "mcp_elicitation";
      turnId: TurnId;
      action: "accept" | "decline" | "cancel";
      content: Record<string, unknown> | null;
    };
```

Rules:

- `chatId`, `turnId`, `requestId` and pending native request must match.
- A grant must be a subset of the requested permissions.
- `execpolicyAmendment` is accepted only when it exactly matches an amendment
  proposed by the pending request.
- An identical repeated resolution returns `200` with
  `{ requestId, resolved: true, alreadyResolved: true }`.
- A different resolution after completion returns `409 request_conflict`.
- An expired or upstream-cleared request returns `410 request_expired`.

## 11. Voice task linking

`POST /threads/{chatId}/task-links` is used only after the operator explicitly
chooses a relationship such as `Continue in this chat`.

Body:

```ts
type CreateTaskLinkRequest = {
  taskId: TaskId;
  mode: "shared_thread" | "result_reference";
};
```

The server reads the existing private task record and derives label, short id,
subject scope and status. The browser cannot submit or overwrite those fields.

For `shared_thread`, the gateway validates runtime/state compatibility before
linking. Future Voice task turns append both Pritha `turnId` and native
`turnId`, when present, to the task record. `result_reference` creates only a
visible cross-link and does not change routing.

Queue-only or ephemeral Voice work is represented internally with
`mode: "degraded_no_thread"`; it cannot be upgraded to `shared_thread` without
starting or forking a persistent chat.

## 12. SSE stream contract

Route:

```text
GET /threads/{chatId}/events
Accept: text/event-stream
Last-Event-ID: <opaque event id>   # optional
```

Clients unable to set `Last-Event-ID` may pass `?afterEventId=<encoded-id>`.
When both are present, the header wins.

Response headers:

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-store
Connection: keep-alive
X-Accel-Buffering: no
```

Frame:

```text
id: <opaque-event-id>
event: <event-type>
data: {"apiVersion":"1","eventId":"...","occurredAt":"...","chatId":"chat_...","turnId":"turn_... or null","itemId":"item_... or null","requestId":"request_... or null","payload":{}}

```

Envelope:

```ts
type ChatEvent<T = Record<string, unknown>> = {
  apiVersion: "1";
  eventId: string;
  occurredAt: string;
  chatId: ChatId;
  turnId: TurnId | null;
  itemId: ItemId | null;
  requestId: RequestId | null;
  payload: T;
};
```

Normative event types:

| SSE `event` | Payload |
| --- | --- |
| `connection.ready` | `{ runtime: RuntimeBindingView; latestEventId: string }` |
| `stream.reset` | `{ reason: "cursor_expired" | "server_restarted"; refresh: true }` |
| `runtime.changed` | `{ runtime: RuntimeStatus }` |
| `runtime.degraded` | `{ from: RuntimeProviderId; to: RuntimeProviderId | null; protocol: RuntimeProtocol; reason: string }` |
| `thread.updated` | `{ thread: ThreadSummary }` |
| `thread.archived` | `{ archived: true }` |
| `thread.unarchived` | `{ archived: false }` |
| `turn.started` | `{ turn: TurnView }` |
| `turn.status` | `{ status: TurnStatus; activeFlags: ThreadSummary["activeFlags"] }` |
| `turn.completed` | `{ turn: TurnView }` |
| `turn.interrupted` | `{ turn: TurnView }` |
| `turn.failed` | `{ turn: TurnView; retryMode: "resume" | "checkpoint" | "new_chat" }` |
| `message.delta` | `{ delta: string }` |
| `message.completed` | `{ message: MessageView }` |
| `item.started` | `{ item: ChatItemView }` |
| `item.output.delta` | `{ delta: string; stream: "stdout" | "stderr" | "summary" }` |
| `item.completed` | `{ item: ChatItemView }` |
| `diff.updated` | `{ diffPreview: string; changedPaths: string[] }` |
| `approval.requested` | `{ request: PendingRequestView }` |
| `input.requested` | `{ request: PendingRequestView }` |
| `permission.requested` | `{ request: PendingRequestView }` |
| `request.resolved` | `{ requestId: RequestId }` |
| `task.linked` | `{ task: TaskLinkView }` |
| `heartbeat` | `{}` |

Rules:

- Events are ordered per `chatId`.
- `message.delta` and `item.output.delta` are append-only and may be empty only
  when the upstream explicitly signals a boundary.
- Completion snapshots replace accumulated client state for that object and
  make delivery resilient to missed deltas.
- Heartbeat is emitted every 15 seconds while the connection is open.
- The gateway retains at most 10,000 recent normalized events per chat and at
  least 30 minutes when memory permits. The buffer is private and untracked.
- If `Last-Event-ID` cannot be replayed, the server emits `stream.reset` and
  closes; the browser reloads thread metadata and recent turns, then reconnects.
- A browser reconnect must de-duplicate by `eventId`, `turnId` and `itemId`.
- SSE is the live fast path. `GET /threads/{chatId}/turns` is the authoritative
  recovery snapshot when an event or connection transition is missed.
- Bootstrap, SSE recovery and browser lifecycle recovery share one
  reconciliation coordinator. It allows one in-flight reconciliation and uses
  jittered backoff `1s → 2s → 5s → 10s → 30s`; no independent polling loop is
  allowed. Focus, visible and network-online transitions reset recovery and
  trigger one immediate reconciliation.
- Losing SSE never clears the selected transcript. The most recent successful
  in-memory snapshot remains visible as read-only stale history until native
  reconciliation succeeds. A transcript is cleared only when the operator
  actually selects a different chat.
- A terminal native turn returned by history clears a stale server-side active
  lease and repairs the private thread status before the next thread-list read.
- A failed read-only `thread/read` may be retried once. The adapter resets the
  App Server process only for a confirmed transport failure; it does not reset
  on a semantic RPC error and never replays `turn/start`.

## 13. Error contract

```ts
type ApiError = {
  apiVersion: "1";
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: Record<string, string | number | boolean | null>;
  };
};
```

`message` is safe for operator display. `details` must not contain raw upstream
payloads, tokens, auth state, full absolute paths or command output.

| HTTP | Code | Meaning |
| ---: | --- | --- |
| `400` | `invalid_request` | malformed JSON or invalid field |
| `400` | `invalid_cursor` | expired/mismatched history cursor |
| `400` | `field_limit_exceeded` | a field exceeds its contract limit |
| `403` | `thread_access_denied` | thread is outside approved project/state scope |
| `404` | `thread_not_found` | unknown `chatId` or missing native record |
| `404` | `turn_not_found` | unknown turn in this chat |
| `404` | `task_not_found` | task link target not found |
| `409` | `idempotency_conflict` | same key, different request |
| `409` | `turn_active` | a new turn cannot start yet |
| `409` | `turn_not_active` | steer/interrupt target is not active |
| `409` | `thread_runtime_mismatch` | provider/state binding failed validation |
| `409` | `capability_unavailable` | selected runtime cannot perform operation |
| `409` | `request_conflict` | pending request already resolved differently |
| `409` | `fallback_confirmation_required` | safe automatic fallback boundary was crossed |
| `410` | `request_expired` | upstream cleared or timed out the request |
| `413` | `payload_too_large` | HTTP body exceeds 256 KiB |
| `429` | `rate_limited` | local or upstream limit; retry with backoff |
| `503` | `runtime_unavailable` | no usable runtime for this operation |
| `503` | `runtime_incompatible` | handshake/schema/core capability failed |
| `504` | `upstream_timeout` | bounded upstream operation timed out |
| `500` | `internal_error` | sanitized unexpected gateway failure |

When an upstream JSON-RPC error has a safe stable mapping, use the mapped code.
Otherwise return `runtime_incompatible`, `upstream_timeout` or `internal_error`;
never pass the raw upstream message to the browser by default.

The browser normalizes transport failures separately from API errors:

```ts
type ControlCenterRequestError = {
  kind: "network" | "gateway" | "api" | "invalid_response";
  code: string;
  message: string;
  retryable: boolean;
  httpStatus: number | null;
  requestId: string | null;
};
```

The client reads a bounded response body once, validates HTTP status and
`Content-Type`, then validates `apiVersion` and the success/error envelope.
Empty `502/503/504` responses map to `control_center_unavailable`; connection
failure maps to `network_unreachable`; malformed JSON at `2xx` maps to
`invalid_server_response`. Raw HTML, proxy text, stack traces and parser errors
such as `Unexpected end of JSON input` are never shown.

## 14. Idempotency and concurrency

- `Idempotency-Key` is required on thread create, turn start, fork, request
  resolution and task-link creation.
- On thread creation the key must equal `clientThreadId`; on turn start it must
  equal `clientMessageId`.
- The gateway stores the hash of the method, canonical route, normalized body
  and result for 24 hours in private state.
- Same key + same hash returns the original result and `replayed: true`.
- Same key + different hash returns `409 idempotency_conflict`.
- `clientMessageId` adds a permanent per-chat duplicate guard even after the
  24-hour idempotency record expires.
- One active turn per chat is enforced with a server-side lease.
- Approval/input resolution uses compare-and-set on the unresolved request.
- A gateway restart rebuilds active state from native thread read/status plus
  private attempt records; uncertain attempts are surfaced for recovery and are
  never silently reissued.
- A missed upstream completion notification is repaired by the next native
  history read; a recovered terminal turn removes the stale active lease.
- If HTTP delivery ends before the turn acknowledgement arrives, the browser
  marks the request `delivery_unknown`, retains the editable draft and first
  reconciles native history plus the private receipt. It never replays the turn
  automatically. An explicit retry reuses the same `clientMessageId`, the same
  `Idempotency-Key` and byte-equivalent text; a changed draft cannot use that
  retry.

## 15. Adapter mapping

| Pritha operation | App Server adapter | Exec fallback |
| --- | --- | --- |
| connect | spawn `app-server --listen stdio://`; `initialize`; `initialized` | verify `codex exec --json` and resume support |
| create chat | `thread/start` | create mirrored binding; defer process |
| list chats | `thread/list` + private grouping | private mirrored list |
| read metadata | `thread/read(includeTurns=false)` | private binding/status |
| read turns | `thread/read(includeTurns=true)` and slice; paginated method only when probed | bounded private mirror |
| start turn | resume if needed, then `turn/start` | first `codex exec --json`; later `codex exec resume <SESSION_ID> --json` |
| steer | `turn/steer` | unavailable unless an exact runtime capability is proven |
| interrupt | `turn/interrupt` | terminate the owned exec process, then mark interrupted |
| fork | `thread/fork` | create a new mirrored chat with compact explicit handoff |
| rename | `thread/name/set` | private mirrored title |
| pin | `thread/metadata/update` | private mirrored pin |
| archive/unarchive | native methods | private mirrored state |
| resolve request | response to the matching server-initiated JSON-RPC request | unavailable; surface degraded limitation |
| stream | normalize App Server notifications/server requests | normalize JSONL events |

The adapter owns a map between Pritha ids and native ids. It must generate/load
schemas for the exact selected binary version and must not assume that fields
observed in the newer bundled runtime exist in the older standalone CLI.

The locally verified common App Server core is sufficient for rich chat on both
current binaries. Differences such as audio input, extra metadata/section
methods or deletion remain capability-gated and outside the required v1 core.

## 16. Fallback and recovery state machine

```text
idle
  -> resolving_runtime
  -> starting_turn
       | upstream has not acknowledged turn.started
       +-> try next safe provider
       |
       | upstream acknowledged turn.started
       v
     in_progress
       -> waiting_for_approval | waiting_for_input
       -> completed
       -> interrupted
       -> failed_recoverable  (never auto-replay)
```

For a bound native chat, changing global runtime settings does not silently move
that chat. The header shows `Bound to <provider>`. A different provider may be
used only after a read-only compatibility probe and one of:

- safe rebind to the same native thread;
- explicit fork;
- explicit compact handoff to a new chat.

## 17. Persistence and privacy

Canonical transcript ownership:

- `historyKind=native`: Codex rollout/thread is canonical; Pritha stores no full
  transcript copy.
- `historyKind=mirrored`: bounded private transcript/event mirror is canonical
  for the degraded session.
- `historyKind=task_only`: only the existing task card exists.

Private root:

```text
<PRITHA_STATE_ROOT>/codex-chat/
  registry.json
  idempotency/
  events/
  mirrors/
  runtime-capabilities/
```

Legacy fallback when `PRITHA_STATE_ROOT` is absent:

```text
.private/codex-chat/
```

These paths are gitignored. Tracked Markdown receives only architecture,
standards and manually curated decisions—not transcripts, ids, runtime paths or
operator messages.

## 18. Required tests

Contract tests must cover:

1. every request/response schema and size limit;
2. API guard rejection for untrusted host, cross-site mutation and untrusted
   Tailnet identity;
3. exactly one `initialize` plus `initialized` per App Server connection;
4. bundled and standalone capability maps built from their exact schemas;
5. create/list/read/resume/fork/archive on both full-chat providers;
6. chronological history pagination with opaque cursor validation;
7. SSE ordering, reconnect, duplicate suppression and `stream.reset`;
8. command, file, permission and user-input request round-trips;
9. one-active-turn lease, steer and interrupt;
10. no automatic replay after `turn.started`;
11. exec fallback without `--ephemeral`, including `exec resume`;
12. Voice `shared_thread`, `result_reference` and degraded task-only links;
13. raw reasoning, secrets and unbounded output never reach browser fixtures;
14. 320 px mobile client can recover all pending actions through the same API.

## Agent environment compatibility

- Agent platforms: Codex-native Pritha Control Center.
- Model context: runtime-advertised Codex models; model ids are not hardcoded by
  this contract.
- Runtime environment: local Next.js server, browser, Desktop-bundled Codex or
  standalone CLI.
- Config surfaces: versioned routes, gateway/adapters, private registry,
  existing API guard and runtime settings.
- Portability: adapter-needed.
- Codex adaptation: generate or load schemas from the selected Codex binary and
  normalize only proven capabilities.
- Environment-specific caveats: binary location, state roots and available
  methods vary by installed runtime; none are browser-controlled.

## Temporal validity

- Source published: unknown.
- Source updated: unknown; official pages were live when retrieved.
- Source version: API v1, App Server documentation retrieved 2026-08-26, local
  generated schemas from bundled `0.149.0-alpha.4.1` and standalone `0.135.0`.
- Retrieved: 2026-08-26.
- Verified: 2026-08-26.
- Valid for: Pritha Control Center Codex Chat API v1.
- Freshness status: current.
- Temporal status: version-bound.
- Recheck when: either Codex binary changes version, App Server history or
  transport maturity changes, or the Control Center becomes multi-user/remote
  beyond the current trusted-device model.

## Related decisions

- `05_decisions/2026-08-26-control-center-codex-chat-architecture.md`
