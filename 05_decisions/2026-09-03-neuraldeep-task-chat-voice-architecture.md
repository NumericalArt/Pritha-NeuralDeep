---
id: 2026-09-03-neuraldeep-task-chat-voice-architecture
type: decision
status: accepted
created: 2026-09-03
updated: 2026-09-03
topics:
  - pritha-control-center
  - task-chat
  - voice-control
  - neuraldeep
  - session-persistence
  - concurrency
tools:
  - NeuralDeep Responses adapter
  - Codex CLI
  - Next.js
  - TypeScript
sources:
  - 05_decisions/2026-08-22-neuraldeep-codex-provider.md
  - source-pritha-task-chat-voice-port-plan-2026-09-03
  - mother-pritha-commits-c91bf41-through-1f0e689
related:
  decisions:
    - 05_decisions/2026-08-22-neuraldeep-codex-provider.md
  standards:
    - 04_standards/neuraldeep-task-chat-api-contract.md
    - 04_standards/realtime-voice-control-for-codex-agents.md
  reports:
    - 11_agents/reports/2026-08-28-pritha-good-state-baseline-reliable-codex-control-center.md
supersedes:
  - 05_decisions/2026-08-26-control-center-codex-chat-architecture.md
superseded_by: []
freshness_status: current
source_published: 2026-09-03
source_updated: 2026-09-03
source_version: Pritha source commit 1f0e689 adapted to NeuralDeep integration branch
retrieved: 2026-09-03
verified: 2026-09-03
valid_for: Pritha NeuralDeep Task Chat and persistent Voice topic implementation
temporal_status: version-bound
review_date: 2026-10-03
memory_domain: governance
memory_domains:
  - governance
  - pritha-self
subject:
  kind: decision
  id: neuraldeep-task-chat-voice-architecture
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: NeuralDeep Task Chat and persistent Voice topics

## Context

Mother Pritha changed Codex Chat into Task Chat and unified direct chats with
Voice task threads. Pritha NeuralDeep needs the behavior without importing the
mother implementation's App Server, desktop binary selection, fallback chain
or provider substitution. Existing NeuralDeep model selection, account limits,
billing, usage ledger and typed provider errors are protected work.

The 2026-08-28 Good State baseline protects reliable history, idempotent
delivery, runtime-manager ownership, private storage and non-destructive
recovery. Its statement that App Server history is canonical cannot remain true
in the NeuralDeep-only fork. This decision intentionally replaces only that
transport/history assumption: the reliability and privacy invariants remain.

## Decision

Use one Task Chat gateway, one shared NeuralDeep CLI process runner and one
admission coordinator for direct Task Chat turns and persistent Voice cards.

```text
Task Chat typed turn -----+
                         +--> shared FIFO admission --> neuraldeep-codex.mjs
Voice persistent card ---+          |                    exec-json / --resume
                                    v                              |
                         private chat/topic/link stores            v
                                                       loopback Responses adapter
                                                                  |
                                                               NeuralDeep
```

There is no alternate inference branch. Provider or model errors become typed
operator states and never mutate the selected provider/model.

## Session ownership

One Voice subject scope plus generation owns exactly one persistent NeuralDeep
session. The first `thread.started` event atomically binds its session id.
Later cards use `--resume`; a different returned id is
`runtime_identity_mismatch`. `thread_reset` is the only normal way to create a
new generation/session, and it also captures the then-current model and effort.

Direct chats own independent coordination keys. A Voice thread is mirrored
into Task Chat for visibility but remains read-only until an explicit,
validated continuation action. This prevents a typed turn from overtaking an
active Voice card or silently changing the operational queue.

## Ordering and failure semantics

The admission limit comes from the sanitized NeuralDeep account snapshot with
a short cache. Missing, malformed or stale-without-value data resolves to one.
At most one turn for a session is active. Different sessions may run in
parallel up to the limit.

Successful completion releases the next same-topic card. Waiting for approval
or one operator answer pauses it. An unresolved failure moves successors to an
explicit predecessor-confirmation state. Restart records never trigger replay;
the operator chooses resume, retry or cancel after state reconciliation.

## Storage and compatibility

Keep `codex-chat/registry.json` at schema version 2 and normalize older v1/v2
records into additive NeuralDeep fields. Store Voice topic identity in a
separate version 1 registry. Both stores use short token-owned locks,
last-known-good recovery and timestamped backups. Task-local persistent link
sidecars form the recovery journal across the two stores.

This gives rollback compatibility: the previous NeuralDeep release can read
the main registry and ignores the new sidecars. Rollback must not delete them.

## UI consequences

- `/task-chat` is canonical and `/codex` preserves query parameters while
  redirecting.
- History has `Direct Chats` and `Voice Tasks`; there is no Legacy accordion.
- Selection, drafts and unknown-delivery payloads are isolated by group/chat.
- List pagination cannot replace a deliberate New Chat draft when a slow
  response arrives.
- Voice queue and recovery state are visible, but session/topic identity is not.
- Voice cards show `Open in Task Chat` only for the explicit persistent schema.
- Mobile history is a drawer; route loading/status and horizontal-overflow
  protection apply to Voice, Agents, Settings and Task Chat.

## Rejected alternatives

- Port mother Pritha wholesale: rejected because it reintroduces App Server and
  desktop/standalone provider selection.
- Keep Voice runs ephemeral: rejected because cards in one logical topic could
  not share history or safely continue in Task Chat.
- One global serial queue: rejected because it ignores a known NeuralDeep
  parallel allowance and unnecessarily blocks independent topics.
- Unlimited parallelism when account data is missing: rejected because it can
  violate provider limits; fail-safe concurrency is one.
- Replay unfinished work after restart: rejected because a previous turn may
  have executed tools or external effects.
- Replace a denied/unavailable model automatically: rejected because it breaks
  billing transparency, topic identity and operator intent.

## Operational consequences

The feature ships as one coherent release without a feature flag, but production
switching is outside implementation authorization. A candidate must run with a
separate port and private test state. Only the runtime manager may perform the
eventual production switch or rollback after a separate operator approval.

## Acceptance criteria

The implementation is acceptable only when automated evidence proves:

- v1/v2 registry compatibility and concurrent mutation safety;
- same-topic session reuse/FIFO and different-topic parallelism;
- limit-one behavior when account concurrency is unknown;
- generation reset and model/effort pinning;
- no duplicate session turns between Task Chat and Voice;
- explicit continuation of the same verified session;
- exclusion of old ephemeral cards;
- exact idempotency and no replay after ambiguous delivery/tool activity;
- typed provider/billing/auth/access handling without substitution;
- explicit restart recovery and corrupt-registry fail-closed behavior;
- redirect, desktop/mobile, reconnect, draft and content-free telemetry behavior;
- NeuralDeep-only execution, privacy/secret audits and strict route health.

## Review date

Review on 2026-10-03 or earlier if NeuralDeep changes its Responses protocol,
account limit schema, session-resume behavior or billing/error contract.
