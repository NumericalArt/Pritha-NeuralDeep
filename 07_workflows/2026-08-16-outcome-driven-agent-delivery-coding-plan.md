---
id: 2026-08-16-outcome-driven-agent-delivery-coding-plan
type: workflow
status: active
created: 2026-08-16
updated: 2026-08-16
topics:
  - pritha
  - outcome-spec
  - build-loop
  - agent-evals
  - execution-ledger
tools:
  - Pritha
  - Node.js
  - Codex App Server
agent_platforms:
  - Codex
runtime_environment:
  - local-mac
  - cli
config_surfaces:
  - scripts/agents-mother/
  - scripts/lib/
  - scripts/pritha.mjs
  - 08_templates/agent-outcome-spec.md
portability: adapter-needed
sources:
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  - scripts/lib/frontmatter.mjs
  - scripts/lib/atomic-file.mjs
  - scripts/lib/markdown-content-lock.mjs
  - scripts/lib/paths.mjs
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  standards:
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-harness-evaluation.md
  workflows:
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-16
source_updated: 2026-08-16
source_version: implementation specification v2
retrieved: 2026-08-16
verified: 2026-08-16
valid_for: first production implementation
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: pritha-subsystem
  id: agents-mother-delivery
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Coding plan: outcome-driven agent delivery

## Constraints

- No new runtime dependency is required for v1.
- Authored structured data remains Markdown; generated plans/results are JSON.
- Commands are arrays of argv tokens, never shell strings.
- Runtime state belongs under `resolvePrithaStatePath("builds", ...)`.
- Existing Agents Mother aliases and low-level scaffold behavior remain
  compatible.
- All tracked reports pass secret and filesystem-path redaction.

## New authored artifact

Path:

```text
11_agents/contracts/YYYY-MM-DD-<agent>-agent-outcome-spec.md
```

Required frontmatter:

```yaml
type: agent-outcome-spec
status: draft | approved | superseded
contract_fingerprint: sha256:...
agent_slug: ...
interaction_mode: interface | headless | hybrid
outcome_semantic_lock: pending | sha256:...
outcome_document_lock: pending | sha256:...
approved_by: pending | user
approved_at: pending | ISO-8601
```

Derived Trial counts do not live in the authored document.

Required body sections:

```markdown
## Shape
- One-liner:
- Done when:
- Interaction mode:

## User-facing outcome
- Entry point:
- User journey goal:
- User journey start:
- User journey progress:
- User journey approval:
- User journey completion:
- User journey recovery:

### Surfaces
| Surface | Purpose | Primary action |

### Example sessions
#### Session: main-flow
```transcript
user: ...
agent: ...
```

## Headless outcome
- Trigger:
- Input contract:
- Output artifacts:
- Observability:
- Failure visibility:

## Deliverables
- ...

## Non-goals v1
- ...

## Trials
### Trial: smoke
- Statement:
- Kind: automated | operator-judged
- Covers: core:<id> | deliverable:<id> | safety:<id> | recovery:<id>
- Given:
- When argv: ["node", "scripts/smoke-test.mjs"]
- When cwd: .
- Then exit code: 0
- Then stdout contains:
- Then stdout excludes:
- Then stderr contains:
- Then artifact:
- Then artifact contains: relative/path :: expected text
- Then absent path:
- Then max duration ms:
- Pass criteria:
- Fixture:
- Timeout ms: 120000

## Demo script
1. ...
```

Repeated assertion labels are allowed. `When argv` must parse as a JSON array of
non-empty strings and may not contain shell operators. An automated Trial needs
at least one assertion. An operator-judged Trial needs explicit pass criteria.

## Deterministic identities

`outcome_semantic_lock` hashes a canonical JSON projection containing:

- contract fingerprint and agent slug;
- interaction mode and shape;
- interface/headless outcome fields;
- example sessions, deliverables and non-goals;
- normalized Trials and demo steps.

`outcome_document_lock` hashes the normalized Markdown document while replacing
both lock fields and mutable fields `status`, `outcome_spec_status`, `updated`,
`approved_by` and `approved_at` with placeholders.

Approval succeeds only after validation, writes the computed locks into the
document using compare-and-swap, and appends a host-owned approval event under
the private audit state. Delivery requires an exact event match.

## Generated artifacts

Run root:

```text
<state-root>/builds/<agent-slug>/<run-id>/
```

Files:

- `trial-plan.json`: deterministic compiled plan, without timestamps;
- `trial-result.json`: result bound to plan/spec/workspace identities;
- `build-state.json`: current compact ledger snapshot;
- `events.jsonl`: append-only material events;
- `executor/`: bounded executor outputs;
- `worktree/`: disposable Git worktree when Git mode is enabled.

Tracked reports are emitted only for a blocker and terminal verification or
acceptance. Reports contain relative or placeholder paths, not device paths.

## Modules

New modules:

- `scripts/agents-mother/outcome-spec.mjs` — parse, validate, propose, lock,
  approve and compile;
- `scripts/agents-mother/trial-runner.mjs` — backend-neutral assertions and
  evidence;
- `scripts/agents-mother/execution-backends.mjs` — local and App Server command
  adapters;
- `scripts/agents-mother/delivery-ledger.mjs` — run state, events, locking and
  blockers;
- `scripts/agents-mother/delivery-worktree.mjs` — disposable Git worktree and
  protected Trial-input checkpoints;
- `scripts/agents-mother/build-executors.mjs` — portable Codex/manual build
  executor boundary;
- `scripts/agents-mother/workspace-revision.mjs` — Git/non-Git state identity;
- `scripts/agents-mother/delivery-loop.mjs` — worktree, executor, verify and
  lifecycle transitions;
- `08_templates/agent-outcome-spec.md` — authored template.

Changed modules:

- `scripts/lib/paths.mjs` — add private `builds` state layout;
- `scripts/lib/atomic-file.mjs` — stale-safe local lock ownership;
- `scripts/lib/redaction.mjs` — filesystem path normalization for reports;
- `scripts/agents-mother/index.mjs` — CLI and proposal-first interview handoff;
- `scripts/agents-mother/contract.mjs` — outcome lookup metadata and delivery
  policy fields;
- `scripts/agents-mother/scaffold/index.mjs` — carry Outcome Spec lineage into
  generated harness and report;
- `scripts/validate-memory.mjs` — register `agent-outcome-spec`;
- standards, workflow, self-model and `AGENTS.md` — record behavior.

## Backend contracts

Trial backend input:

```js
{
  argv: string[],
  cwd: string,
  timeoutMs: number,
  sandbox: {
    required: boolean,
    type: "readOnly" | "workspaceWrite" | "externalSandbox" | "none",
    writableRoots: string[],
    networkAccess: boolean
  }
}
```

Output:

```js
{
  backend,
  isolation: "none" | "sandboxed" | "unavailable",
  effectivePolicy,
  exitCode,
  stdout,
  stderr,
  durationMs,
  timedOut,
  runtimeVersion
}
```

The local backend returns `isolation: none`. If a Trial requires sandboxing, it
must not be accepted through that backend. App Server uses `command/exec`; it
must not substitute unsandboxed `thread/shellCommand` or `process/spawn`.

Build executor input contains only the approved outcome, latest Trial failures,
allowed worktree and remaining budget. Its result is a claim until Trials verify
the resulting workspace.

## Ledger invariant

Every nonterminal state must contain exactly one of:

- a non-empty `next_action`; or
- one or more typed blockers.

Every blocker contains:

```json
{
  "code": "typed_code",
  "summary": "bounded explanation",
  "question": "one answerable question",
  "options": [
    { "id": "stable-id", "label": "short choice", "effect": "what changes" }
  ],
  "evidence_refs": []
}
```

Terminal states are `verified`, `awaiting_acceptance`, `accepted`, `failed`,
`abandoned` and `cancelled`. `verified` never implies user acceptance or release
readiness.

## Git policy

- Refuse to use an active dirty worktree as a build surface.
- Create `pritha/build-<run-id>` from a recorded base revision.
- Add a disposable worktree under private run state.
- Never push or merge.
- Never bypass hooks.
- Host code may commit a verified checkpoint on the delivery branch.
- Rollback, if needed, is allowed only inside the disposable worktree and only
  to a recorded checkpoint created by the current run.
- A non-Git project may run Trials but autonomous coding returns a typed blocker
  unless its contract explicitly selects no-Git in-place execution.

## CLI

```text
pritha outcome init <contract>
pritha outcome validate <outcome-spec>
pritha outcome revise <approved-outcome-spec>
pritha outcome approve <outcome-spec> --approved-by user
pritha outcome compile <outcome-spec> [--run-id <id>]
pritha trial run <outcome-spec> --project <path> [--backend local|app-server]
pritha deliver <outcome-spec> --project <path> [--executor codex-app-server]
pritha delivery status <run-id>
pritha delivery resume <run-id>
pritha delivery accept <run-id> --accepted-by user
```

Low-level `scaffold`, `test`, `handoff` and legacy `agents-mother.mjs` commands
remain available.

## Test matrix

- parsing and validation codes for every required Outcome Spec field;
- deterministic compile and semantic/document lock mutation tests;
- approval evidence match, missing, stale and executor-writable rejection;
- structured argv rejection for strings, shell operators and traversal cwd;
- all assertion types and bounded output;
- local/App Server backend contract parity and isolation fail-closed behavior;
- workspace revision change invalidates evidence;
- stale lock recovery, active lock rejection and CAS conflict;
- ledger invariant and blocker question/options invariant;
- crash/resume and repeated-failure transition;
- dirty user worktree preservation;
- no push/merge/deploy/secret-write commands in the autonomous path;
- tracked report path redaction;
- CLI compatibility and fixture end-to-end delivery.

## Definition of done

The implementation is ready when an approved fixture Outcome Spec can be
compiled, executed against a failing fixture agent, repaired through a fake or
real executor adapter, independently verified, resumed after interruption and
reported without changing the spec or the user's active worktree.
