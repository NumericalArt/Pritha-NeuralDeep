---
id: task-chat-large-history
type: workflow
status: implemented
created: 2026-09-08
updated: 2026-09-10
topics: [task-chat, history-pagination, runtime-compatibility]
tools: [Pritha, Codex, Next.js]
sources: [https://learn.chatgpt.com/docs/app-server]
related:
  workflows: [07_workflows/control-center-staged-release.md]
  standards: [04_standards/pritha-good-state-alignment.md]
supersedes: []
superseded_by: []
memory_domain: pritha-self
subject:
  kind: workflow
  id: task-chat-large-history
privacy: public
retention: durable
review_status: reviewed
confidence: high
source_version: Codex App bundled 0.153.4 and standalone CLI 0.153.0; local schema and read-only RPC verification
verified: 2026-09-08
---

# Task Chat: bounded history loading

Pritha loads recent conversation text separately from activity and long message
bodies. This applies to Task Chat backed by either `desktop_bundled` or
`standalone_cli`. It does not patch the Codex desktop application itself, the
terminal UI of `codex resume`, or another project's CLI audit harness.

## Read contract

- `GET /api/codex-chat/v1/threads/{chatId}/history`: latest 20 turns at most,
  chronological within the page; older pages use the returned cursor.
- `GET .../history/turns/{turnId}/items?cursor=...`: up to 40 native activity
  entries per read, with long bodies deferred.
- `GET .../history/items/{itemId}/content?cursor=...`: complete original bodies
  in Unicode-safe parts. Continue until `complete: true`; never use a preview
  as a successful full copy.
- Page responses including the envelope stay below 256 KiB; text part responses
  stay below 64 KiB. Byte budgets can produce fewer entries than count limits.
- The existing `/turns` contract is preserved for older consumers. Consumers
  must opt into the new routes and `events?view=compact` to receive the benefit.

The first page includes user text and the last assistant message per turn.
`itemsState: not_loaded` describes incomplete activity, not empty activity.
`imageInputsState: unknown` must not be interpreted as evidence that no images
exist. Original user messages, plans, search queries, tool results, command
output, file diffs and available reasoning summaries can be read through
Activity. Raw private reasoning is not exposed.

## Native and compatibility readers

A dedicated connection initializes the app-server experimental API and accepts
only `thread/read`, `thread/turns/list` and `thread/items/list`. It is separate
from the execution connection. History retries do not resume tasks, create
turns, switch providers, or restart an executing connection.

Both pagination schemas must exist. A runtime that explicitly rejects native
pagination uses a compatibility projection of `thread/read(includeTurns=true)`.
Permission, workspace and storage identity errors never authorize fallback.
The provider, version, state identity, chat and canonical workspace scope all
signed cursors. An item response must match its requested turn.

Compatibility reads are coalesced. Native history remains canonical: projections
and original text parts are process-local caches with a 30-second lifetime and
64 MiB aggregate serialized payload budget. This budget is not a hard process
RSS limit: JSON parsing and transient objects also consume memory. Each native
response line has a separate 64 MiB hard framing limit. Oversize compatibility
history produces `history_response_too_large` and recommends a paginated runtime;
Pritha does not update binaries or edit native session files automatically.

An append invalidates the latest compatibility projection but preserves its
existing older-page snapshot until expiry or eviction. Expired cursors produce
an explicit recoverable error; the UI retains displayed text. Original text
chunks use a content hash: a cached original remains consistent, and a changed
message after cache expiry cannot silently splice two versions together.

## Browser behavior and diagnosis

Initial loading shows a slow state after 2.5 seconds. The server operation has
an absolute 25-second budget including startup and a maximum of one transport
retry per read; the browser allows 35 seconds for network transfer and decoding.
Older turns and Activity load explicitly. Reconnects coalesce refresh requests,
retain loaded older text and drafts, and avoid pulling the viewport to the
bottom when the user is reading earlier messages. Switching chat aborts obsolete
requests. Partial read errors preserve the text already displayed.

The NeuralDeep Task Chat browser loads original message text automatically when
its visible end approaches the viewport. There are no “Read original text” or
“Read more text” controls in messages or Activity. At most two visible-text
requests run together, each capped at 64 KiB; long content waits for the reader
to scroll to its next part instead of being fetched in full on initial load.
Closed Activity does not fetch its deferred bodies. On failure, displayed text
remains readable and “Retry loading text” retries the missing part. Switching
chats aborts active reads and removes queued work for the previous chat.

Task Chat does not mount the agent delivery panel or ask for a delivery run ID.
Delivery services and explicit textual budget commands remain available. An
entry point from an agent's card is deferred. The NeuralDeep composer keeps its
height while the transcript scrolls, including on narrow or short viewports;
large Voice controls keep their own bounded scroll area.

Compact SSE retains bounded live deltas and sends invalidation notifications
instead of complete turns and command output. The browser then uses the bounded
read routes. Copy response collects all assistant messages and every original
text part before reporting success. Browser clipboard denial remains an error.

Private telemetry records hashed chat references, provider, response bytes and
read/preparation durations. Browser metrics separate time to response headers,
body transfer, JSON decode and scheduling of the next rendered frame. The last
metric is an approximation, not a browser paint trace. No message text, source
URLs, native thread IDs or cursors belong in telemetry.

## Release and rollback

Use the managed staged-release workflow after separate lifecycle approval.
Build and test in an isolated checkout; verify `/task-chat`, `/codex`, health
identity and all referenced JavaScript chunks before rollout. Keep the previous
compiled build for rollback. The patch introduces no native transcript migration,
private registry rewrite, background monitor or service registration. Rolling
back the code restores the earlier reader without reversing a data migration.

An actual phone on its trusted private access route remains a required final
acceptance check. Desktop and simulated mobile browser tests cannot establish
that a particular phone's network path is healthy.
