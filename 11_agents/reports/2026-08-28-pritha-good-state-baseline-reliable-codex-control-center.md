---
id: 2026-08-28-pritha-good-state-baseline-reliable-codex-control-center
type: agent-operations-report
status: accepted
created: 2026-08-28
updated: 2026-08-28
topics:
  - pritha
  - good-state-baseline
  - control-center
  - codex-chat
  - runtime-reliability
  - launchd
  - tailscale
  - dictation
tools:
  - Pritha
  - Codex
  - Next.js
  - launchd
  - Tailscale
  - Web Speech API
  - Git
  - GitHub
sources:
  - source-pritha-good-state-confirmation-2026-08-28
  - 07_workflows/pritha-good-state-baseline.md
related:
  workflows:
    - 07_workflows/pritha-good-state-baseline.md
    - 07_workflows/control-center-staged-release.md
  standards:
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-28
source_updated: 2026-08-28
source_version: pritha-good-state-2026-08-28-reliable-codex-control-center
retrieved: 2026-08-28
verified: 2026-08-28
valid_for: Accepted four-instance Pritha Control Center release with reliable Codex Chat runtime and documented UI limitations
temporal_status: version-bound
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
subject:
  kind: good-state-baseline
  id: reliable-codex-control-center
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Good State Baseline: Reliable Codex Control Center

Date: 2026-08-28
Status: accepted

## Accepted Scope

This baseline captures the accepted Control Center state after the reliability,
runtime-isolation and Codex Chat work. It covers four instance-specific
production services from one pinned release:

| Instance | Local port | Role |
| --- | ---: | --- |
| `main` | `3420` | primary |
| `dasha` | `4420` | replica |
| `sasha` | `5420` | replica |
| `marina` | `6420` | replica |

The accepted scope includes the overall Codex Chat interface, native thread
history, resilient request handling, the runtime manager, launchd ownership,
staged fleet release and the existing Voice, Agents, Settings, music and
trusted private-access behavior.

Two operator observations are deliberately recorded as known limitations, not
as accepted behavior: a long Codex transcript can prevent the composer from
being reached by scrolling, and chat dictation does not yet offer an explicit
language setting.

Trusted private-access URLs and device identities are intentionally omitted.
They remain private runtime state and must be inspected through the local setup
tools when needed.

## Operator Acceptance Signal

The operator accepted the overall result with “Да, выглядит всё нормально” and
then explicitly requested “Фиксируем Good State Baseline.” The same acceptance
included two qualifications:

1. the composer must remain reachable when a chat exceeds one viewport;
2. Russian dictation language and the actual transcription path must be made
   explicit.

The qualifications are open follow-up work and must not be interpreted as
features that this baseline protects from being fixed.

## Git Anchor

- Branch: `main`.
- Baseline tag:
  `pritha-good-state-2026-08-28-reliable-codex-control-center`.
- Code anchor before this report:
  `bfe7c654ddf7cebfeaac2f08c7c1fed164d0413b`.
- Main implementation anchor:
  `4cd6795 feat: harden Control Center runtime and Codex Chat`.
- Runtime adoption and release hardening continued through:
  `120eceb`, `da2e9ed`, `93613d3`, `66c9bfb`, `591eff5` and `bfe7c65`.
- The annotated baseline tag points to the commit containing this report.

## Recent Work Cycle

### Isolated production runtime

- Each instance has a distinct launchd label, port, state root, runtime lock,
  private logs and service identity.
- Production starts through the canonical runtime manager and local Next.js
  binary rather than a temporary terminal or development process.
- Stop and restart operations verify process ownership, working identity,
  service label and health identity instead of killing an arbitrary port
  listener.
- Process exits, restart throttling and circuit-breaker state are retained as
  private diagnostics; transient HTTP failures do not restart the service.

### Safe release and fleet behavior

- Releases are built in staging, swapped atomically and checked before the
  displaced build is removed.
- Fleet rollout is pinned and ordered `main -> dasha -> sasha -> marina`, with
  stop-on-first-error behavior and per-instance rollback anchors.
- All four accepted instances are clean, match the same remote commit and
  return their expected instance identity.

### Resilient Codex Chat

- HTTP responses are bounded and validated before JSON parsing, so raw parser,
  proxy and HTML errors are not shown to the operator.
- Backend-offline, runtime-unavailable, reconnecting and turn-failed states are
  distinct.
- The last loaded transcript remains visible during reconnect; native Codex
  history remains canonical.
- Message delivery uses stable client and idempotency identities; an unknown
  delivery is reconciled before any operator-controlled retry.
- Registry and summary writes use private atomic files, serialized queues and
  last-known-good recovery.
- Codex App Server resources are disposed when Control Center exits; turns are
  never replayed automatically.

## Accepted Behavior

- All four Control Centers remain healthy on their established ports with
  matching release and instance identities.
- Control Center survives the completion of an individual Codex task and is
  independently recoverable by launchd after an actual process exit.
- Codex Chat can create and select native chats, send a turn, restore history
  and show activity without duplicating a turn after uncertain delivery.
- Existing native Codex history and private bindings are preserved without a
  destructive migration or permanent browser transcript copy.
- Friendly typed errors replace raw messages such as
  `Unexpected end of JSON input`.
- `/voice`, `/agents`, `/codex` and `/settings` load and reference valid
  production JavaScript chunks.
- Voice Control, music ducking, Agents, Settings and trusted private access
  retain their established behavior.

## Protected Baseline Invariants

- Production lifecycle remains owned by the runtime manager and instance
  launchd service; temporary Codex sessions and raw port kills are forbidden.
- Port ownership is never inferred from a listener alone.
- Instance identity, state roots, private logs, locks and release state remain
  isolated.
- Fleet rollout remains pinned, staged, sequential and rollback-capable.
- Native Codex threads remain the canonical transcript and private registry
  damage must never erase or replace history with an empty file.
- Reconnect and retry behavior must not clear a loaded transcript, create
  parallel retry storms or duplicate a Codex turn.
- Private URLs, local paths, credentials, raw logs and transcript copies remain
  outside tracked artifacts.
- A fix for the known scrolling and dictation-language limitations is aligned
  with this baseline when these invariants remain intact.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| Good State Alignment | pass | The accepted Control Center behavior and privacy/runtime guardrails are preserved. |
| Git alignment | pass | `main` is clean, matches `origin/main` and all four instances use code anchor `bfe7c65`. |
| Fleet status | pass | `main`, `dasha`, `sasha` and `marina` report expected identity, clean checkout and healthy release. |
| Strict Control Center health | pass | Health v2, `/voice`, `/agents`, `/codex`, `/settings` and referenced JavaScript chunks passed. |
| Full self-test | pass | Same-day self-test passed with no regressions; unit suite passed 488/488. |
| Markdown memory validation | pass | Same-day validation passed for 744 tracked Markdown files before this report. |
| Privacy audit | pass | Same-day strict audit found no raw/provenance retention findings. |
| Runtime ownership | pass | Service is installed, loaded and running; listener ownership and instance health match; circuit is closed. |
| Codex Chat visual review | qualified pass | Overall chat is accepted; long-transcript composer reachability remains an open defect. |
| Dictation implementation review | qualified pass | Browser speech recognition is present; explicit Pritha language/model selection remains open. |

## Known Limitations And Acceptable Warnings

### Long-chat scrolling

In the current Codex layout, conditional banners and transcript content share a
four-row implicit grid. With no banner present, a long transcript can occupy an
`auto` row and grow beyond the available height, while the composer is placed
in the flexible row. The result is that the user cannot always scroll down to
the input area. This is a known defect, not accepted behavior.

The aligned fix must give the transcript the only flexible, internally
scrollable region and keep the header, banners and composer in bounded rows. It
must be verified with long history on desktop and mobile and must preserve
automatic scroll-to-latest behavior.

### Chat dictation language

The Codex Chat `Dictate` button currently uses the browser Web Speech API. It
sets recognition language from `navigator.language`, falling back to `en-US`.
The sidebar language control is currently local presentation state, offers only
English as an enabled option and does not configure dictation. Consequently,
Russian speech can be interpreted with an English browser locale. This is a
known product limitation, not a microphone failure.

The Codex Chat dictation path is separate from Voice Control: Voice Control has
an explicitly configured OpenAI Realtime transcription model, while the browser
dictation implementation does not expose or select a model.

### Environment warnings

- The same-day environment check reports Python 3.9 as supported but recommends
  Python 3.10 or newer for new setups.
- The launchd root audit still reports absent historical Dasha web and Telegram
  labels. The new instance-specific Control Center services are healthy and are
  not affected by these legacy labels.

## Private And Runtime Exclusions

The following are explicitly excluded from this tracked baseline:

- `.env` and runtime environment contents;
- API keys, auth keys, credentials and private user memory;
- raw Tailscale URLs, tailnet names, device identities and peer details;
- absolute user-specific checkout or state paths;
- private Codex registry, receipts, transcripts and native thread data;
- logs, locks, PIDs, process-group IDs, audit events and circuit state;
- generated SQLite, embeddings, queues, snapshots, releases and setup state.

## Regression Signals

Treat future changes as regressions if any of these occur:

- a Control Center is launched from a temporary terminal or development
  process;
- a process is stopped only because it owns an expected port;
- any instance reports another instance identity, state or release;
- a temporary HTTP failure causes a process restart;
- Codex history disappears during reconnect or registry recovery;
- a lost response creates a duplicate native turn;
- raw JSON parser, proxy HTML, stack traces or private server bodies reach the
  UI;
- `/voice`, `/agents`, `/codex`, `/settings` or their production chunks fail;
- private URLs, absolute local paths, credentials, logs or transcripts enter
  tracked artifacts;
- a scrolling fix makes the composer or latest messages unreachable on another
  viewport;
- a dictation change silently couples Codex Chat to Voice Control settings or
  sends audio to a new service without an explicit architecture/privacy
  decision.

## Future Alignment Notes

1. Fix the Codex conversation layout so the transcript owns the flexible
   scroll area and the composer remains reachable for arbitrarily long chats.
2. Add a real dictation-language setting with at least browser/auto, `ru-RU`
   and `en-US` choices, persist it privately and pass it explicitly to the
   recognition path.
3. Decide separately whether chat dictation should remain browser-managed or
   move to an explicit OpenAI transcription endpoint. That decision must name
   the model, language behavior, privacy boundary, audio retention and fallback.
4. Keep the sidebar language setting semantically honest: it must either
   configure the relevant UI/dictation behavior or be clearly labelled as a
   future option.

## Recovery Notes

To compare or recover this state:

1. Inspect this report and annotated tag
   `pritha-good-state-2026-08-28-reliable-codex-control-center`.
2. Confirm that all four instance statuses match the expected identity and
   pinned release before making runtime changes.
3. Rerun strict Control Center health, self-test, fleet status, privacy audit
   and Markdown validation.
4. Compare the runtime manager, staged release, Codex Chat request/state logic,
   private atomic storage and health contract against the tagged version.
5. Prefer a narrow repair over broad rollback. A rollback must preserve private
   native Codex history and instance state.
