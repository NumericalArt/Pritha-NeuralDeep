---
id: 2026-06-23-pritha-voice-codex-app-thread-routing-review
type: review
status: draft
created: 2026-06-23
updated: 2026-06-23
topics:
  - pritha-voice-control
  - codex-app
  - codex-sidecar
  - thread-routing
  - control-center
tools:
  - Codex App
  - Codex app-server
  - OpenAI Realtime API
  - Pritha Control Center
agent_platforms:
  - Codex
model_context:
  - gpt-realtime-2
  - Codex App
runtime_environment:
  - local-project
  - mac
  - control-center
config_surfaces:
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
  - interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts
  - interfaces/control-center/src/components/settings/CodexSettingsSection.tsx
portability: environment-specific
sources:
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts
  - interfaces/control-center/src/components/settings/CodexSettingsSection.tsx
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 07_workflows/agents-mother.md
related:
  intakes: []
  briefs: []
  decisions:
    - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/agent-interface-experience.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-06-23
source_version: local Pritha checkout inspected 2026-06-23
retrieved: 2026-06-23
verified: 2026-06-23
valid_for: Pritha Control Center realtime Codex App transport as of 2026-06-23
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: workflow
  id: pritha-voice-codex-app-thread-routing
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Review: Pritha Voice Codex App Thread Routing

Date: 2026-06-23
Status: draft

## Question

How should Pritha Voice Control route Codex App deep tasks so it avoids both old failures:

- one global Codex App thread accumulates every voice task, overflows context, and destabilizes App/CLI handoff;
- every new voice task creates a separate Codex UI thread, cluttering the UI and losing continuity for ongoing work on the same child agent or project theme.

## Current Findings

- `PrithaCodexAppServerClient.resolveTaskThread()` currently has only two real modes:
  - per-request thread by default: `VC · <project> · <branch> · task · <requestId>`;
  - global control-thread reuse only when `PRITHA_CODEX_APP_THREAD_ID`, `CODEX_APP_THREAD_ID`, or `PRITHA_CODEX_APP_REUSE_CONTROL_THREAD` is set.
- The existing registry stores thread hints by `projectRoot + branch + role`, with `role: "control"` used for saved App threads. It does not model a child-agent subject, workstream, lifecycle stage, or rotation generation.
- Planning can create additional Codex App threads before the execution turn. With `codexPlanningMode: "planner"` and `codexExecutionMode` allowing orchestrated steps, one operator task can create several App turns and potentially several UI threads unless planning and step execution share the same routing key.
- Existing safety fixes protect outbound prompt size and local task state, not Codex UI thread lifecycle. `codexPromptTokenBudget` compacts the prompt sent to App/CLI, but it does not cap accumulated App thread history.
- Settings expose transport, prompt budget, planner, execution mode, and timeout. They do not expose thread routing strategy or subject routing state.

Recent private task logs were inspected locally to confirm the symptom pattern, but private runtime paths and thread ids are intentionally not recorded in this tracked review.

## Options

### Option A: Keep per-request threads

This preserves the current safe default. It minimizes context overflow risk and makes each task easy to inspect in isolation.

It is a poor long-term fit for voice-driven agent development: Codex UI fills with short-lived task threads, planning can multiply threads, and work on one child agent loses thread continuity.

Fit: reject as default, keep as emergency mode.

### Option B: Return to one global control thread

This restores continuity and keeps the UI clean.

It recreates the original failure mode: all tasks accumulate in one App thread. Prompt-budget compaction does not guarantee the App thread itself stays small, because prior thread history still exists in Codex App.

Fit: reject except for explicit debugging via env override.

### Option C: Subject-scoped reusable threads

Create or resume one Codex App thread per stable subject, for example:

- `agent:fas`
- `agent:fespa26`
- `agent:funny-teacher`
- `pritha:control-center`
- `pritha:memory`
- `task:<explicit-workstream-slug>`

The Realtime tool should derive a `thread_scope` from structured arguments or deterministic classification. Codex App client should resolve threads by `projectRoot + branch + role + scopeKind + scopeId + generation`, not only by request id or global control role.

Fit: recommended baseline.

### Option D: Subject-scoped threads with rotation

Extend Option C with hard lifecycle controls:

- max turns per thread;
- max age;
- optional max estimated accumulated report chars;
- manual "start new thread for this agent" control;
- automatic rotation when a thread is stale or resume fails.

When rotating, create a compact handoff note in the new thread and store the canonical continuity in Pritha Markdown/private task state, not only in Codex App history.

Fit: recommended final shape.

### Option E: Session-contract transport instead of App thread state

Use local task files as the continuity source and treat Codex App as a mostly stateless executor.

This is architecturally clean, but the Pritha `codex-session` transport is currently reserved/unimplemented. It is too large for the immediate fix.

Fit: later iteration.

## Comparison

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| Per-request threads | Low overflow risk, simple | UI clutter, no continuity, planner can multiply threads | Emergency fallback |
| Global control thread | Maximum continuity, clean UI | Recreates overflow/failure mode | Debug only |
| Subject-scoped reuse | Balances continuity and UI hygiene | Needs routing schema, tests, migration | Recommended baseline |
| Subject-scoped + rotation | Adds overflow protection to scoped reuse | More implementation work and UI surface | Recommended target |
| Session-contract | Best long-term separation | Not implemented, larger design change | Future |

## Recommended Design

Implement `codexAppThreadRoutingMode`, defaulting to `subject_scoped`.

Suggested modes:

- `per_task`: current behavior, one App thread per request id.
- `control`: existing global control-thread reuse, env/debug only.
- `subject_scoped`: one active App thread per stable subject.
- `subject_scoped_rotate`: subject-scoped with automatic generation rotation.

Add a `threadScope` object to Codex task state and payload:

```json
{
  "kind": "agent",
  "id": "fas",
  "label": "FAS",
  "source": "explicit|derived|fallback",
  "generation": 1
}
```

Derivation rules:

- Prefer explicit structured tool args such as `subject_kind`, `subject_id`, `project`, or `agent`.
- For `agent_creation`, derive from requested agent name when available.
- For implementation/review tasks mentioning an existing sibling agent with `AGENTS.md`, derive `kind=agent`, `id=<agent-slug>`.
- For Control Center/realtime/memory work, derive stable Pritha scopes such as `pritha-control-center`, `pritha-memory`, `pritha-operations`.
- Fallback to `task:<requestId>` only when no stable subject can be derived.

Thread names should be human-readable and stable:

```text
VC · pritha · main · agent · fas · g1
VC · pritha · main · pritha · control-center · g1
```

Planning and execution must use the same `threadScope`. Step orchestrator steps must also use the same scope unless a step explicitly targets a different subject. Otherwise, the planner fix will still leave UI clutter.

## Context Control

Do not rely on Codex App thread history as the canonical memory.

Use the App thread for interactive continuity, but store durable continuity in:

- task cards under private runtime state;
- curated Markdown artifacts when the result is knowledge;
- child-agent contracts/reports/profiles for agent lifecycle;
- optional compact handoff notes injected into a newly rotated App thread.

Rotation policy should be conservative at first:

- rotate on stale registry/resume failure;
- expose manual reset in runtime settings or task card;
- then add automatic thresholds after observing real App thread size behavior.

## Implementation Complexity

Baseline subject-scoped reuse is medium complexity:

- extend `PrithaCodexTaskPayload` / task JSON with `threadScope`;
- add runtime setting normalization and API persistence;
- update `run_codex_task` argument schema/instructions;
- update `codexAppClientForTask()` and `PrithaCodexAppServerClient.resolveTaskThread()`;
- extend registry key and saved metadata;
- keep backward compatibility with existing registry entries;
- add unit tests for per-task, control, subject reuse, stale fallback, planner reuse, and step reuse.

Rotation is medium-high complexity:

- add generation and thresholds;
- store `turnCount` or approximate counters;
- add manual reset action;
- optionally archive old threads if Codex app-server API supports it in the current surface;
- inject a bounded handoff note into the new thread.

No external documentation check was needed for this review because the current behavior is determined by local Pritha code and the already available app-server calls in the existing implementation.

## Expert Notes

### Architecture

The right boundary is not "one thread per voice session" or "one thread forever"; it is "one thread per durable work subject, with rotation." This matches child-agent lifecycle better than request-level routing.

### Security

The router must not use raw voice transcript as a direct registry key. Use sanitized slugs from known child-agent projects, explicit structured args, or bounded classifier output. Do not persist secrets, private runtime logs, real Tailscale names, or raw transcript content into thread names or tracked reports.

### Developer Experience

Expose the active thread scope in task status and progress. Otherwise the operator cannot tell whether a FAS task reused the FAS thread or created a new one.

### Product Pragmatist

Implement subject-scoped routing first, with manual reset. Add automatic rotation only after the basic reuse behavior is proven. This addresses UI clutter and continuity without reintroducing the old single-thread overflow.

### Research Scout

The current local code is enough evidence for the immediate design. If implementation depends on thread archiving, token usage events, or current app-server API details beyond `thread/start`, `thread/resume`, `thread/list`, `thread/name/set`, and `thread/inject_items`, verify the current Codex manual/app-server surface before coding that part.

## Recommendation

Adopt Option D as the target, but implement it in two phases:

1. `subject_scoped` routing with explicit `threadScope`, shared planner/execution scope, registry migration, task status visibility, and tests.
2. Rotation controls: manual reset first, then automatic thresholds if real use still risks thread growth.

Do not make `control` reuse the default again. Keep `per_task` as a configurable fallback and safety valve.
