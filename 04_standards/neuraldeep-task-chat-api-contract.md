---
id: neuraldeep-task-chat-api-contract
type: standard
status: active
created: 2026-09-03
updated: 2026-09-03
last_reviewed: 2026-09-03
owner: Pritha/user
topics:
  - pritha-control-center
  - task-chat
  - voice-control
  - neuraldeep
  - api-contract
  - recovery
tools:
  - Next.js
  - TypeScript
  - NeuralDeep Responses adapter
  - Codex CLI
  - Server-Sent Events
sources:
  - 05_decisions/2026-08-22-neuraldeep-codex-provider.md
  - 05_decisions/2026-09-03-neuraldeep-task-chat-voice-architecture.md
  - interfaces/control-center/src/lib/codex-chat/types.ts
  - interfaces/control-center/src/lib/codex-chat/gateway.ts
  - interfaces/control-center/src/lib/codex-chat/voice-task-links.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
related:
  decisions:
    - 05_decisions/2026-08-22-neuraldeep-codex-provider.md
    - 05_decisions/2026-09-03-neuraldeep-task-chat-voice-architecture.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
supersedes:
  - 04_standards/control-center-codex-chat-api-contract.md
superseded_by: []
freshness_status: current
source_published: 2026-09-03
source_updated: 2026-09-03
source_version: Pritha NeuralDeep Task Chat API v1 at integration branch
retrieved: 2026-09-03
verified: 2026-09-03
valid_for: Pritha NeuralDeep Task Chat and persistent Voice topics
temporal_status: version-bound
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
subject:
  kind: standard
  id: neuraldeep-task-chat-api
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Standard: NeuralDeep Task Chat API contract

## Rule

`/task-chat` is the primary operator surface. `/codex` is a compatibility-only
server redirect that preserves its query string. Browser code talks only to the
guarded, same-origin `/api/codex-chat/v1` contract and never launches or parses
NeuralDeep/Codex processes itself.

All inference for Task Chat, persistent Voice cards and Agent Mother must pass
through `scripts/neuraldeep-codex.mjs`, stock Codex `exec-json`/resume, and the
loopback NeuralDeep Responses adapter. App Server, desktop-bundled Codex,
standalone fallback and automatic model substitution are prohibited production
paths in this repository. Compatibility enum values may remain in TypeScript
while older registry data is readable, but runtime status publishes only:

```json
{
  "preferredProvider": "neuraldeep_cli",
  "effectiveProtocol": "exec_resume",
  "fallbackEnabled": false,
  "provider": "neuraldeep"
}
```

## Routes

Base path: `/api/codex-chat/v1`.

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/runtime` | Sanitized NeuralDeep runtime, model and provider state |
| `GET` | `/threads` | Cursor page filtered by `group`, `search` and `archived` |
| `POST` | `/threads` | Idempotent chat creation, optionally with one atomic `initialTurn` |
| `GET` | `/threads/{chatId}` | Metadata and continuation state; history remains separate |
| `GET` | `/threads/{chatId}/turns` | Cursor page of mirrored turns |
| `POST` | `/threads/{chatId}/turns` | Idempotent typed turn |
| `GET` | `/threads/{chatId}/events` | Normalized SSE activity |
| `POST` | `/threads/{chatId}/interrupt` | Interrupt active execution |
| `POST` | `/threads/{chatId}/turns/{turnId}/recovery` | Explicit retry, resume or cancel |
| `POST` | `/threads/{chatId}/task-links` | Idempotent Voice/task linkage or continuation enablement |
| `POST` | `/ui-activity` | Content-free allowlisted UI reliability event |

`GET /api/realtime/codex-task/{id}` returns a `task_chat` link only when a task
contains the explicit persistent NeuralDeep sidecar schema. Old ephemeral and
queue-only task directories return `task_chat: null` and stay in Voice Control.

## Threads and groups

The stable browser identifier is `chatId`; the private NeuralDeep session id is
never a route parameter or telemetry field.

- `my_chats`: direct Task Chat threads; continuation is enabled at creation.
- `voice_work`: persistent Voice topics; initially read-only in Task Chat.
- `other_sessions`: retained for additive compatibility but not populated by
  App Server discovery.

Every NeuralDeep transcript is `mirrored`: the private registry contains the
bounded turns needed to render and recover an `exec_resume` session. Native
App Server history is unavailable and must not be claimed.

Thread list requests accept `group=all|my_chats|voice_work|other_sessions`, a
search string of at most 200 code points, an opaque cursor and `limit=1..50`.
The Voice page includes a sanitized `sync` state. Metadata and turn history are
loaded independently so reconnecting cannot erase the last visible transcript.

## Atomic first delivery and idempotency

`POST /threads` requires `Idempotency-Key` equal to `clientThreadId`. It may
include:

```json
{
  "clientThreadId": "client_thread_opaque",
  "source": "chat",
  "settings": { "modelId": "model", "effortId": "high" },
  "initialTurn": {
    "clientMessageId": "client_message_opaque",
    "input": [{ "type": "text", "text": "..." }]
  }
}
```

Binding, receipt and queued first turn are one private registry transaction.
Repeating exactly the same request returns the same chat and turn with
`replayed: true`; reusing either id with different content returns
`idempotency_conflict`. A transport-ambiguous response is never replayed
automatically. The browser retains the exact pending payload per chat and first
reconciles the server state.

Typed turn creation uses `Idempotency-Key = clientMessageId` with the same
content-conflict rule. A Voice thread rejects typed turns until explicit
continuation is enabled and rejects them while its Voice topic has queued or
active cards.

## Persistent Voice topic contract

One logical topic is the hash-derived identity of:

```text
stateIdentityHash + scope.kind + scope.id + scope.generation
```

Only a further hash is written to operational journals. The topic registry
privately binds the topic to one `chatId`, one NeuralDeep `sessionId`, and the
model/effort selected on its first card.

- Same scope and generation reuse the same session with `--resume`.
- `continue_task_id` selects the exact parent generation.
- `thread_reset=true` creates the next generation and a new session.
- Global model changes do not mutate an existing topic.
- A missing resume session or session mismatch fails closed; no fresh session
  is silently substituted.
- Each new persistent card is mirrored in Task Chat before admission.

The task-local `thread-links.json` file is an explicit write-ahead recovery
record with schema `pritha-neuraldeep-voice-task-link-v1`. The incremental
reconciler scans no more than 200 recent task directories, compares file
signatures, and ignores every other schema. This is the boundary that keeps
historical ephemeral cards out of Task Chat.

## Admission and ordering

Task Chat and Voice share one in-process admission coordinator and one private
restart ledger. Every attempt records only a safe attempt/workload id, surface
and hashed coordination key.

- At most one active turn per coordination key/session.
- Admission is FIFO across Task Chat and Voice.
- Different keys may run concurrently up to the sanitized NeuralDeep account
  limit; an unknown or invalid limit is exactly one.
- Lowering the limit does not interrupt admitted turns and blocks new admission
  until capacity is available.
- Cancelling a waiting attempt removes it from the queue.
- Waiting for operator input or approval pauses the key.
- An unresolved predecessor failure blocks later cards until an explicit
  operator recovery decision.
- A Control Center restart never replays queued or in-progress work.

`waiting_for_provider`, `billing_required`, `access_denied`, `auth_required`
and `rate_limited` are visible provider states. They do not select another
provider or model. A Voice runner that needs one answer emits the private
operator-input protocol, pauses the topic and resumes the same session only
after the answer is recorded.

## Explicit Voice continuation

A Voice thread opens with `continuationState=read_only`. `Continue in Task Chat`
posts an idempotent `shared_thread` task link. The server enables continuation
only after it verifies:

1. the chat and topic share the current `stateIdentityHash`;
2. a resumable session id is bound to both records;
3. no Voice card for the topic is active or queued;
4. the topic is not waiting for recovery, approval or operator input.

The action never forks, substitutes or reconstructs a session.

## Private storage and crash recovery

The chat registry remains additive version 2 so the previous NeuralDeep build
can read it after rollback. Voice topics and admission state use version 1
sidecars under the same private state root.

Every mutation:

- takes the registry lock inside `PRITHA_STATE_ROOT`;
- rereads after acquiring the lock;
- atomically writes primary plus last-known-good data;
- never holds the lock during network or model execution;
- releases a lock only with the owning token;
- preserves evidence before recovering a dead-PID stale lock.

If the primary file is corrupt, last-known-good repairs it. If both copies are
invalid, the store becomes read-only and no unrelated Voice session starts.
On restart, active records become `control_center_restarted` or
`resume_confirmation_required`. A terminal write-ahead sidecar may complete an
interrupted cross-registry update, but it may not launch inference.

## Privacy boundary

The browser must not receive the topic id, session id, state-root path,
credential, arbitrary writable absolute path, raw stderr or unbounded tool
output. Public task details expose a topic hash and bounded redacted excerpts.
OpenAI-family environment variables are removed from every inference child.

UI activity accepts only an allowlist of structural fields and rejects unknown
keys. It must contain no message text, URL, session id or filesystem path.
Voice prompts omit private topic and Task Chat identifiers.

## Required acceptance

A release is blocked unless typecheck, targeted Task Chat/Voice/provider tests,
the full suite, NeuralDeep tests, production build, desktop/mobile E2E, strict
privacy and secret audits, Good State alignment, real isolated NeuralDeep
session/parallel checks, and strict route health all pass.

Candidate testing uses a separate port and test state root. Production service
or deployment changes require a new explicit operator authorization and must
use the runtime manager. A failed health, read-only registry, wrong provider
route, stuck admission lock or duplicated session id triggers rollback to the
recorded release; the Voice topic sidecar remains untouched.
