---
id: control-center-runtime-reliability
type: standard
status: active
created: 2026-08-27
updated: 2026-08-27
last_reviewed: 2026-08-27
owner: Pritha
topics:
  - control-center
  - runtime
  - launchd
  - reliability
  - instance-isolation
  - codex-chat
tools:
  - Next.js
  - Node.js
  - launchd
  - Codex App Server
sources:
  - source-operator-approved-control-center-reliability-plan-2026-08-27
related:
  workflows:
    - 07_workflows/control-center-staged-release.md
  standards:
    - 04_standards/control-center-codex-chat-api-contract.md
    - 04_standards/pritha-good-state-alignment.md
  reports:
    - 11_agents/reports/2026-07-02-pritha-good-state-baseline-voice-ducking-control-centers.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-27
source_updated: 2026-08-27
source_version: control-center-runtime-reliability-v1
retrieved: 2026-08-27
verified: 2026-08-27
valid_for: Pritha Control Center production lifecycle, fleet release and Codex Chat recovery
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
  - agent-building-knowledge
subject:
  kind: standard
  id: control-center-runtime-reliability
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Standard: Control Center Runtime Reliability

## Core rule

Production and Tailscale-facing Control Center instances run only through
`scripts/control-center-runtime.mjs` and an instance-specific launchd service.
Temporary Codex terminal sessions, `npm run dev`, `npm run start`, raw port
kills, cron and health watchdogs are not production lifecycle mechanisms.

Read-only inspection is always safe:

```sh
node scripts/control-center-runtime.mjs plan
node scripts/control-center-runtime.mjs status --json
```

`install`, `start`, `stop`, `restart` and `uninstall` require a separate,
immediate operator approval and `--yes`.

## Instance identity

Every service binds all of these values as one identity:

- instance id and role;
- checkout root and external state-root;
- configured loopback port;
- launchd label `com.numericalart.pritha.control-center.<instance-id>`;
- wrapper PID, Next.js child PID and process group;
- `/api/health` instance and release identity.

An operation that cannot prove the complete owner returns `owner_mismatch` and
does not signal the process. Occupying the expected port is never sufficient
proof of ownership. Locks are private and scoped to one state-root.

Installation also refuses to load a competing service over an unowned
listener. A legacy terminal-launched process may be removed only as a one-time,
separately approved migration after its process group, cwd, port and checkout
identity have all been verified read-only.

## Restart boundary

launchd may restart the wrapper only after the process exits. HTTP failures,
Codex runtime failures and temporary health failures do not restart Control
Center. Five unexpected exits within five minutes open the circuit. The
wrapper then exits successfully so launchd stops retrying, and only an explicit
operator `start --yes` clears the circuit.

`SIGTERM` is forwarded to the verified Next.js process group. After 15 seconds,
`SIGKILL` is allowed only after re-verifying that the child still belongs to
that exact group.

## Data and error boundaries

- Logs and structured lifecycle events remain under the instance state-root,
  use private permissions and bounded rotation.
- Private JSON uses a unique UUID temporary file, file sync, close and atomic
  rename, serialized per logical resource.
- Native Codex history is the canonical transcript. Browser storage must not
  persist a transcript copy.
- A damaged private chat registry is restored from a valid last-known-good
  backup; if both copies are invalid, chat bindings become read-only and are
  never replaced with an empty registry.
- UI clients read response bodies once, enforce a size limit, validate content
  type and API envelopes, and never expose proxy bodies, HTML, stack traces or
  JSON parser messages.
- A lost send acknowledgement becomes `delivery_unknown`. Reconciliation runs
  before a user-authorized retry, which reuses the same idempotency key and
  unchanged payload. Automatic turn replay is prohibited.

## Fleet and regression boundary

The release order is `main → dasha → sasha → marina`; one target commit is
pinned for the whole run and rollout stops at the first failure. Voice, music
ducking, Agents, Settings, Codex Chat, private Tailscale access and accepted
instance ports remain regression-protected behavior.

Tracked files may contain only a launchd template with placeholders. Generated
absolute paths, private endpoints, credentials, runtime state and logs must not
enter Git-authored artifacts.
