---
id: 2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan
type: workflow
status: active
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
  - Node.js
  - TypeScript
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
  - interfaces/control-center/src/lib/realtime/codex-task/types.ts
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
  - interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts
  - interfaces/control-center/src/components/settings/CodexSettingsSection.tsx
  - tests/control-center-codex-thread-routing.test.mjs
portability: environment-specific
sources:
  - 03_reviews/2026-06-23-pritha-voice-codex-app-thread-routing-review.md
  - interfaces/control-center/src/lib/realtime/codex-task/codex-app-server-client.ts
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/app/api/realtime/runtime-settings/route.ts
  - interfaces/control-center/src/components/settings/CodexSettingsSection.tsx
  - 04_standards/realtime-voice-control-for-codex-agents.md
related:
  reviews:
    - 03_reviews/2026-06-23-pritha-voice-codex-app-thread-routing-review.md
  decisions:
    - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/agent-interface-experience.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-06-23
source_version: implementation plan v1
retrieved: 2026-06-23
verified: 2026-06-23
valid_for: Pritha Control Center realtime Codex App thread routing implementation
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - governance
subject:
  kind: workflow
  id: pritha-voice-codex-app-thread-routing
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Coding Implementation Plan: Pritha Voice Codex App Thread Routing

Date: 2026-06-23
Status: active
Owner: Pritha / Codex

## Objective

Change Pritha Voice Control so Codex App tasks are routed to stable, bounded
threads:

1. Work on the same child agent or Pritha subsystem should reuse one Codex App
   thread for continuity.
2. The system must not return to the old global one-thread model that caused
   context overflow and transport failures.
3. One operator task must not create multiple Codex UI threads for planner,
   execution and step runs.
4. Runtime settings and task cards must make the chosen route visible and
   reversible.
5. Durable memory must remain in Pritha artifacts/task state, not only in Codex
   App thread history.

## Confirmed Product Decision

Operator decision on 2026-06-23: make `subject_scoped` the new default
immediately, with `per_task` retained as the settings fallback. This reduces
Codex UI thread clutter while preserving a quick rollback path.

## Target Behavior

Default routing mode:

```ts
type CodexAppThreadRoutingMode =
  | "per_task"
  | "control"
  | "subject_scoped"
  | "subject_scoped_rotate";
```

Phase 1 default:

```ts
codexAppThreadRoutingMode: "subject_scoped"
```

Supported behavior:

- `per_task`: one App thread per Pritha Codex task id. Planner, execution and
  step runs for the same task must reuse that one task thread.
- `control`: one project/branch control thread. This remains an explicit
  debug/compatibility mode, not the default.
- `subject_scoped`: one active App thread per stable subject such as
  `agent:fas`, `agent:fespa26`, `pritha:control-center` or `pritha:memory`.
- `subject_scoped_rotate`: target mode for phase 2; same as subject-scoped but
  with generation rotation.

## Non-goals

- Do not implement the reserved `codex-session` transport in this change.
- Do not make Codex App thread history the canonical memory store.
- Do not store raw voice transcript, private runtime paths, credentials, real
  Tailscale hostnames or secrets in tracked Markdown, registry entries or
  thread names.
- Do not add background services, schedulers, launchd changes or long-running
  watchers.
- Do not remove the existing prompt-budget guard.

## Phase 0: Baseline And Guardrails

1. Record current behavior:
   - `PrithaCodexAppServerClient.resolveTaskThread()` defaults to per-request
     thread creation.
   - env overrides allow global control-thread reuse.
   - registry keys currently do not include subject scope.
2. Keep compatibility:
   - old `PRITHA_CODEX_APP_THREAD_ID`;
   - old `CODEX_APP_THREAD_ID`;
   - old `PRITHA_CODEX_APP_REUSE_CONTROL_THREAD`;
   - existing registry file shape.
3. Add tests before/with code changes so regressions are visible:
   - routing mode type exists;
   - default setting is explicit;
   - `run_codex_task` accepts explicit subject fields;
   - planner and step tasks preserve `threadScope`;
   - app-server client resolves named threads before creating new ones.

Verification for phase 0:

```sh
node --test tests/control-center-codex-thread-routing.test.mjs
node scripts/validate-memory.mjs
```

## Phase 1: Add Thread Scope Data Model

Update `interfaces/control-center/src/lib/realtime/codex-task/types.ts`.

Add:

```ts
export type PrithaCodexThreadScopeKind = "agent" | "pritha" | "task" | "control";

export type PrithaCodexThreadScopeSource = "explicit" | "derived" | "fallback" | "override";

export type PrithaCodexThreadScope = {
  kind: PrithaCodexThreadScopeKind;
  id: string;
  label: string;
  source: PrithaCodexThreadScopeSource;
  generation: number;
};
```

Extend `PrithaCodexTaskPayload`:

```ts
threadScope?: PrithaCodexThreadScope;
```

Extend internal task JSON with:

```json
{
  "thread_scope": {
    "kind": "agent",
    "id": "fas",
    "label": "FAS",
    "source": "derived",
    "generation": 1
  }
}
```

Compatibility rule:

- Missing `threadScope` must fall back to `task:<requestId>` in `per_task` mode
  or `control` in legacy reuse mode.

## Phase 2: Runtime Settings

Update `PrithaRuntimeSettings` in
`interfaces/control-center/src/lib/realtime/pritha-runtime.ts`.

Add:

```ts
export type CodexAppThreadRoutingMode =
  | "per_task"
  | "control"
  | "subject_scoped"
  | "subject_scoped_rotate";
```

Add settings:

```ts
codexAppThreadRoutingMode: CodexAppThreadRoutingMode;
codexAppThreadMaxTurns: number;
codexAppThreadMaxAgeHours: number;
```

Phase 1 behavior:

- `codexAppThreadRoutingMode` is active.
- `codexAppThreadMaxTurns` and `codexAppThreadMaxAgeHours` are stored and shown.
- Thresholds are enforced only when the operator selects
  `subject_scoped_rotate`; plain `subject_scoped` keeps one active generation
  until manual reset or stale/resume fallback.

Recommended defaults:

```ts
codexAppThreadRoutingMode: "subject_scoped";
codexAppThreadMaxTurns: 24;
codexAppThreadMaxAgeHours: 168;
```

Normalization:

- invalid mode -> `subject_scoped`;
- max turns clamped to `4..100`;
- max age clamped to `1..720`.

Update:

- `defaultRuntimeSettings()`;
- `normalizeRuntimeSettings()`;
- `updatePrithaRuntimeSettings()` private event payload;
- `RuntimeSettingsPayload` in runtime settings API;
- POST validation in `runtime-settings/route.ts`.

## Phase 3: Explicit And Derived Scope

Extend `run_codex_task` tool schema in `realtimeTools()`.

Add optional fields:

```json
{
  "subject_kind": "agent|pritha|task|control",
  "subject_id": "string",
  "subject_label": "string",
  "thread_reset": false
}
```

Voice instruction update:

- When operator names a child agent, pass `subject_kind=agent` and
  `subject_id=<agent-name-or-slug>`.
- When task is about Control Center, pass `subject_kind=pritha` and
  `subject_id=control-center`.
- When task is about memory/indexing, pass `subject_kind=pritha` and
  `subject_id=memory`.
- Use `thread_reset=true` only when the operator explicitly asks to start a new
  Codex App thread for that subject.

Add helper functions in `pritha-runtime.ts`:

```ts
function normalizeThreadScopeKind(value: unknown): PrithaCodexThreadScopeKind | null
function normalizeThreadScopeId(value: unknown): string
function deriveCodexThreadScope(args: CodexTaskArgs, task: Record<string, unknown>): PrithaCodexThreadScope
function knownChildAgentScopeFromText(root: string, text: string): PrithaCodexThreadScope | null
function prithaSubsystemScopeFromText(text: string): PrithaCodexThreadScope | null
```

Derivation order:

1. Explicit `subject_kind + subject_id`.
2. Existing sibling child-agent project matched by exact slug/name/alias.
3. `agent_creation` requested name, if extractable and safe.
4. Known Pritha subsystem:
   - control center / realtime / voice -> `pritha:control-center`;
   - memory / sqlite / embeddings / wiki -> `pritha:memory`;
   - tailscale / operations / service -> `pritha:operations`;
   - agents mother / scaffold / contract -> `pritha:agents-mother`.
5. Fallback `task:<requestId>`.

Safety rules:

- slug ids must be lowercase ASCII, max 64 chars.
- labels max 80 chars.
- never use raw transcript chunks as ids.
- if extraction is uncertain, fallback to task scope.

## Phase 4: Registry V2 With Compatibility

Current registry path stays the same unless env overrides it:

```text
~/.config/voice-codex/projects.json
```

New entry shape:

```ts
type VoiceCodexThreadEntry = {
  projectRoot: string;
  projectSlug: string;
  branch: string;
  role: "control" | "task" | "subject" | "worktree";
  scopeKind?: PrithaCodexThreadScopeKind;
  scopeId?: string;
  scopeLabel?: string;
  generation?: number;
  routingMode?: CodexAppThreadRoutingMode;
  threadName: string;
  threadId: string;
  sessionId: string | null;
  turnCount?: number;
  createdAt?: string;
  updatedAt: string;
};
```

New registry key:

```ts
projectRoot::branch::role::scopeKind::scopeId::generation
```

Compatibility:

- If an old key has only `projectRoot::branch::control`, continue reading it for
  `control` mode.
- Do not rewrite the whole registry during normal reads.
- Only save new v2 entries when resolving/saving a scoped thread.

Thread name helpers:

```ts
function scopedThreadName(projectRoot, branch, scope) {
  return `VC · ${projectSlug(projectRoot)} · ${branch || "main"} · ${scope.kind} · ${scope.id} · g${scope.generation}`;
}

function perTaskThreadName(projectRoot, branch, requestId) {
  return `VC · ${projectSlug(projectRoot)} · ${branch || "main"} · task · ${shortId}`;
}
```

Important fix:

- For all modes, including `per_task`, resolve by registry or exact thread name
  before creating a new thread. `per_task` should mean one thread per task, not
  one new thread per planner/execution/step call.

## Phase 5: Codex App Client Routing

Update `PrithaCodexAppServerClient`.

Constructor options:

```ts
getRuntimeSettings?: () => {
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  codexServiceTier: CodexServiceTier;
  codexAppThreadRoutingMode: CodexAppThreadRoutingMode;
  codexAppThreadMaxTurns: number;
  codexAppThreadMaxAgeHours: number;
};
```

Routing:

```ts
private async resolveTaskThread(connection, payload, timeoutMs) {
  if (overrideThreadId) return resolveControlThread(...);
  if (reuseControlThread || mode === "control") return resolveControlThread(...);
  if (mode === "per_task") return resolveNamedTaskThread(...);
  return resolveScopedThread(...);
}
```

`resolveNamedTaskThread()`:

- derive thread name from request id;
- check registry using `role=task`, `scopeKind=task`, `scopeId=requestId`;
- list exact thread by name/cwd;
- resume if found;
- create if missing;
- save registry with `role=task`.

`resolveScopedThread()`:

- read `payload.threadScope`, or fallback to `task:<requestId>`;
- use `role=subject`;
- check registry exact key;
- if stale resume fails, create a new thread and save generation;
- list exact thread by name/cwd before creating;
- progress event includes `thread_scope`, `thread_name`, `thread_id`.

Do not change `turn/start` output schema in this phase.

Thread report injection:

- keep existing report injection;
- add `thread_scope` and `routing_mode` to the JSON report;
- keep truncation limits;
- do not include private runtime paths.

## Phase 6: Preserve Scope Through Planner And Steps

Update task building in `runCodexTask()`:

1. Create `taskId`.
2. Build `task`.
3. Derive `thread_scope`.
4. Store `thread_scope` in `request.json`.
5. Include it in `buildPrithaCodexTaskPayload()`.

Update `buildPlanningTask(task)`:

- preserve `id`;
- preserve `thread_scope`;
- add `codex_task_phase: "planning"`.

Update `runCodexStepOrchestrator()`:

- preserve `thread_scope` in every `stepTask`;
- add `codex_task_phase: "step"`;
- do not let step-specific text reclassify subject unless future design adds
  explicit multi-subject steps.

Acceptance:

- one voice task with planner + execution uses one App thread in `per_task`;
- five follow-up FAS tasks use the same `agent:fas` App thread in
  `subject_scoped`;
- a Control Center task uses `pritha:control-center`;
- an ambiguous one-off task falls back to `task:<requestId>`.

## Phase 7: UI And Operator Visibility

Update runtime settings API:

- GET returns routing settings.
- POST accepts routing settings.

Update `CodexSettingsSection.tsx`:

- add "Thread Routing" select:
  - Subject scoped;
  - Per task;
  - Control thread;
  - Subject scoped + rotation.
- add number inputs for max turns and max age, disabled/help-texted if rotation
  is not active.
- keep concise copy:
  - Subject scoped keeps one thread per agent/subsystem.
  - Per task is fallback for isolation.
  - Control is debug/legacy.

Update task list/detail UI if needed:

- show `thread_scope.kind:id`;
- show routing mode;
- show thread name if available;
- show generation.

Avoid:

- exposing raw thread ids in prominent UI unless needed for debugging;
- adding a destructive reset button in phase 1.

Phase 2 may add:

- "Start new thread for this subject" action on task card or settings.

## Phase 8: Tests

Add `tests/control-center-codex-thread-routing.test.mjs`.

Because current control-center tests mostly inspect TS source from Node, phase 1
tests can follow that pattern, with targeted source checks:

- `PrithaCodexThreadScope` exists in `types.ts`;
- `CodexAppThreadRoutingMode` exists in `pritha-runtime.ts`;
- runtime settings include `codexAppThreadRoutingMode`;
- settings route accepts and validates routing mode;
- settings UI exposes "Thread Routing";
- `run_codex_task` schema exposes `subject_kind`, `subject_id`,
  `subject_label`, `thread_reset`;
- `buildPlanningTask()` preserves `thread_scope`;
- `runCodexStepOrchestrator()` preserves `thread_scope`;
- app-server client has `resolveNamedTaskThread` and `resolveScopedThread`;
- app-server client calls thread list/resume before `thread/start`.

If practical during implementation, add a higher-value behavior test by
extracting pure helpers into a small module that Node can import after TypeScript
transpilation using the existing TypeScript test pattern from
`control-center-codex-safety.test.mjs`.

Suggested focused command:

```sh
node --test tests/control-center-codex-thread-routing.test.mjs tests/control-center-codex-planning.test.mjs tests/control-center-codex-prompt-budget.test.mjs tests/control-center-voice-settings.test.mjs
```

Final verification:

```sh
npm --prefix interfaces/control-center run typecheck
node scripts/validate-memory.mjs
node --test --test-concurrency=1 tests/**/*.test.mjs
```

Run full `node scripts/self-test.mjs` only if the change touches memory rebuild,
operations, bootstrap, launchd, queue-health or other broader infrastructure.

## Phase 9: Manual Smoke Test

Use queue mode or mocked App availability first if needed.

Manual App smoke:

1. Set routing mode to `subject_scoped`.
2. Start a voice task about FAS:
   - expected scope: `agent:fas`;
   - expected thread name: `VC · pritha · <branch> · agent · fas · g1`.
3. Start a second FAS task:
   - expected: same thread name and registry entry;
   - expected: no additional Codex UI thread for FAS.
4. Start a Control Center task:
   - expected scope: `pritha:control-center`;
   - expected different thread from FAS.
5. Switch mode to `per_task`:
   - one new task creates one task thread;
   - planner/execution/steps reuse that one task thread.
6. Switch back to `subject_scoped`.

Do not use destructive tasks for smoke. Use read-only or tiny no-op review tasks.

## Phase 10: Rotation

Rotation triggers:

- registry resume fails;
- manual `thread_reset=true`;
- `subject_scoped_rotate` mode and `turnCount >= codexAppThreadMaxTurns`;
- `subject_scoped_rotate` mode and age exceeds `codexAppThreadMaxAgeHours`.

Rotation behavior:

- increment generation;
- create new thread;
- save new registry entry;
- inject the normal task report with subject scope and routing mode.

Follow-up enhancement:

- add a richer compact handoff note with last task ids and durable artifact refs,
  without private paths, secrets or raw logs.

Do not archive old threads until current Codex app-server archive support is
verified. If archive support is unclear, leave old threads visible and rely on
generation naming.

## Rollback Plan

Immediate runtime rollback:

- set `codexAppThreadRoutingMode` to `per_task` in settings.

Compatibility rollback:

- env override `PRITHA_CODEX_APP_REUSE_CONTROL_THREAD=1` still routes to old
  control-thread behavior for debugging.
- env override `PRITHA_CODEX_APP_THREAD_ID` still forces one known thread.

Code rollback:

- the new registry fields are additive;
- old registry entries remain readable;
- task JSON with `thread_scope` remains harmless for older code.

## Implementation Order

1. Add types and runtime settings.
2. Add explicit tool args and derivation helper.
3. Add `thread_scope` to task JSON and payload.
4. Update App client registry model and named-thread resolver.
5. Preserve scope through planner and step orchestrator.
6. Add settings API/UI.
7. Add tests.
8. Run focused tests and typecheck.
9. Run memory validation.
10. Do manual smoke with safe read-only tasks.

## Acceptance Criteria

- Default behavior no longer creates one Codex App UI thread per voice task when
  the subject is the same stable agent or subsystem.
- Work on FAS reuses an `agent:fas` thread.
- Work on Pritha Control Center uses a separate `pritha:control-center` thread.
- Planner, execution and step runs for one task share the same thread route.
- `per_task` is still available and creates at most one thread per task id.
- Global control-thread reuse is not the default.
- Prompt budget guard still compacts outbound prompts before App/CLI transport.
- Task status/progress exposes thread scope and routing mode.
- No tracked Markdown contains private thread ids, private runtime paths, real
  Tailscale hostnames, secrets or raw voice transcript.
- Focused tests, Control Center typecheck and memory validation pass.

## Follow-up Decision Candidate

After this change ships, create a short decision record for the confirmed
default:

```text
05_decisions/YYYY-MM-DD-pritha-voice-codex-app-thread-routing.md
```

The decision should record that `subject_scoped` became the default immediately
on 2026-06-23, with `per_task` as fallback and `subject_scoped_rotate` available
when generation rotation is desired.
