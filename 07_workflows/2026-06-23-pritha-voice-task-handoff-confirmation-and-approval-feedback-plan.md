---
id: 2026-06-23-pritha-voice-task-handoff-confirmation-and-approval-feedback-plan
type: workflow
status: active
created: 2026-06-23
updated: 2026-06-23
topics:
  - pritha-voice-control
  - realtime
  - codex-sidecar
  - task-handoff
  - approval-feedback
  - control-center
tools:
  - OpenAI Realtime API
  - Codex App
  - Codex CLI
  - Pritha Control Center
  - Next.js
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
  - interfaces/control-center/src/components/voice/usePrithaRealtime.ts
  - interfaces/control-center/src/components/voice/VoiceControlPage.tsx
  - interfaces/control-center/src/app/api/realtime/codex-task/[id]/approval/route.ts
  - tests/control-center-codex-planning.test.mjs
  - tests/control-center-codex-safety.test.mjs
portability: environment-specific
sources:
  - current Codex thread operator request on 2026-06-23
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 04_standards/realtime-voice-control-ui.md
  - 07_workflows/realtime-voice-control-kit.md
  - 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/components/voice/usePrithaRealtime.ts
  - interfaces/control-center/src/components/voice/VoiceControlPage.tsx
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
  workflows:
    - 07_workflows/realtime-voice-control-kit.md
    - 07_workflows/2026-06-23-pritha-voice-codex-app-thread-routing-implementation-plan.md
  reviews: []
  decisions:
    - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-23
source_updated: 2026-06-23
source_version: local Pritha Control Center realtime flow inspected 2026-06-23
retrieved: 2026-06-23
verified: 2026-06-23
valid_for: Pritha Control Center realtime Voice Control task handoff and UI approval feedback
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
  - governance
subject:
  kind: workflow
  id: pritha-voice-task-handoff-confirmation-and-approval-feedback
privacy: public
retention: durable
review_status: implemented
confidence: high
---

# Implementation Plan: Voice Task Handoff Confirmation And Approval Feedback

Date: 2026-06-23
Status: implemented

## Objective

Make two small Voice Control behavior fixes without changing the working Codex
transport, sandbox policy, thread routing, prompt-budget guard or existing UI
decision-gate semantics.

1. Pritha must not create a Codex task card while the operator is still
   explaining a task. For agent creation, agent improvement, agent fixes,
   workspace-write implementation or other large tasks, Voice Control must ask
   for explicit spoken confirmation that the task brief is complete before it
   calls `run_codex_task`.
2. When the operator clicks `Approve` or `Reject` on a pending task card, the
   result must flow back into the live Voice Control session quickly enough that
   Pritha stops telling the operator to approve a task that has already been
   approved.

## Current Behavior

- `buildRealtimeInstructions()` tells Realtime to call `run_codex_task` after
  the operator clearly requests creation or implementation, but it does not
  require a final "the task spec is complete" confirmation.
- The `run_codex_task` tool accepts `operator_confirmation`, but it is optional
  and currently focused on safety/write approval rather than completeness of
  the spoken task brief.
- `codexTaskApprovalFor()` correctly holds workspace-write, deployment,
  destructive, service, credential and Control Center runtime changes as
  `decision_required`.
- `runToolCall()` creates a visible task card, but it starts polling only when
  the returned status is not `decision_required`.
- `VoiceControlPage.decideCodexTask()` already calls
  `realtime.watchCodexTask(taskId)` after a successful approve, so the existing
  UI path can be extended instead of replaced.
- `startCodexTaskPolling()` can send terminal and progress handoffs into the
  Realtime data channel, but it does not currently send a dedicated
  "approval was received" handoff.

## Target Behavior

### Spoken Handoff Protocol

Before `run_codex_task` is called for a deep task, Pritha should do this:

1. Listen until the operator appears to have finished describing the task.
2. Summarize the intended Codex task in one to three short points.
3. Ask a direct confirmation question, for example:
   "ТЗ полностью проговорено? Передавать это в Codex?"
4. Wait for a direct positive answer.
5. Only then call `run_codex_task`, passing the confirmation in
   `operator_confirmation`.

A pause, semantic VAD turn ending, "угу", or a partial acknowledgment is not
confirmation. If the operator says that they are not finished, adds more
requirements, changes the scope, or says "подожди", no Codex task should be
created yet.

This protocol applies to:

- `task_type=agent_creation`;
- `write_mode=workspace_write`;
- tasks about creating, improving, fixing, testing or scaffolding a child
  agent;
- broad Control Center, Voice Control, memory, operations or harness changes;
- any task the model would otherwise hand off to Codex as a multi-step
  implementation or review.

It does not block:

- quick spoken answers;
- `full_pritha_memory`;
- `inspect_pritha_files`;
- `inspect_codex_task`;
- read-only status checks and lightweight local inspection.

### Approval Feedback Protocol

When a task is waiting on a UI decision:

1. Voice UI should keep watching the task even while it is
   `decision_required`.
2. When approval changes from `pending` to `approved`, or when status leaves
   `decision_required` because the task started, the live Realtime session
   receives a short system/user-context message:
   "UI approval received for Codex task `<id>`. Status is now `<status>`.
   Continue from current task state; do not ask for this approval again."
3. When approval changes to `rejected`, the live session receives the matching
   rejection message and treats the task as terminal.
4. This handoff must be sent once per decision, logged in private events, and
   represented in sticky voice context so the model cannot keep repeating an
   old approval request.

## Non-goals

- Do not change which actions require UI approval.
- Do not weaken the existing safety gate for workspace writes, deployment,
  deletion, services, credentials or Control Center runtime changes.
- Do not add launchd, cron, background watchers or deployment actions.
- Do not change Codex App thread routing or revert the subject-scoped routing
  work.
- Do not store raw voice transcripts, secrets, private runtime paths or real
  task internals in tracked Markdown.
- Do not make approval by voice replace the UI decision gate for risky actions.

## Implementation Steps

### Phase 1: Add A Soft Handoff Guard

Update `interfaces/control-center/src/lib/realtime/pritha-runtime.ts`.

- Add explicit Realtime instructions for the spoken handoff protocol.
- Strengthen the `run_codex_task` tool description for
  `operator_confirmation`: it should carry the operator's explicit statement
  that the task brief is complete and ready for Codex.
- Add a small runtime guard before task files are written:
  `codexTaskNeedsHandoffConfirmation(args, task)`.
- If the guard applies and `operator_confirmation` does not record explicit
  final confirmation, return a soft tool result:

```json
{
  "ok": false,
  "status": "handoff_confirmation_required",
  "operator_note": "Before creating a Codex task, summarize the task and ask whether the full brief has been spoken."
}
```

This must not create `request.json`, `status.json`, a task card, or a Codex App
thread. The Realtime model should then ask the confirmation question in voice.

Keep the guard conservative: it is acceptable to ask one extra confirmation
before a write task; it is not acceptable to create a premature task card.

### Phase 2: Keep Watching Approval-gated Tasks

Update `interfaces/control-center/src/components/voice/usePrithaRealtime.ts`.

- In `runToolCall()`, call `startCodexTaskPolling(taskId)` for every created
  Codex task, including `decision_required`.
- Keep the existing `VoiceControlPage.decideCodexTask()` approve path that
  calls `realtime.watchCodexTask(taskId)`; it becomes an immediate refresh path,
  while polling remains the fallback.
- Add an in-memory ref such as
  `reportedCodexTaskApprovalDecisionsRef` or `lastTaskApprovalStatusRef` so the
  live session is notified only once per approval/rejection transition.
- In polling, detect:
  - `approval.status: pending -> approved`;
  - `approval.status: pending -> rejected`;
  - `status: decision_required -> running|queued|rejected|complete`.
- Send a concise conversation item into the Realtime data channel and call
  `requestResponse("codex_task_approval_received")` or
  `requestResponse("codex_task_rejected")`.
- Append a session event and private telemetry event for the handoff.

### Phase 3: Add Server-side Speakable Approval Feedback

Update `decidePrithaCodexTask()` in
`interfaces/control-center/src/lib/realtime/pritha-runtime.ts`.

- After approve, append Codex voice feedback:

```json
{
  "phase": "approval_approved",
  "priority": "high",
  "speakable": true,
  "voice_text": "Approve получен в UI. Codex-задача запущена или поставлена в очередь.",
  "requires_response": false
}
```

- After reject, append matching `approval_rejected` voice feedback.
- Keep the existing progress events; this only adds a voice-safe semantic event
  for the existing polling and sticky-context path.

### Phase 4: UI Copy And State Hygiene

Update `VoiceControlPage.tsx` only if needed after Phase 2.

- Keep the current card buttons and safety copy.
- After approve/reject, make the local task state visibly move away from
  `decision_required` as soon as the response returns.
- Do not add a new modal or second approval surface.

### Phase 5: Tests

Prefer focused static/behavioral tests consistent with the existing test
surface.

Add or extend tests so they verify:

- Realtime instructions contain the handoff confirmation protocol.
- `run_codex_task` can return `handoff_confirmation_required` before writing
  task files.
- `operator_confirmation` is required by runtime logic for agent creation and
  workspace-write Codex handoffs.
- Voice polling starts for `decision_required` tasks.
- Approval and rejection paths append speakable voice feedback.
- The client has a one-shot approval handoff event so Pritha does not repeat
  "approve the task" after approval was already clicked.

Suggested commands:

```sh
node --test tests/control-center-codex-planning.test.mjs
node --test tests/control-center-codex-safety.test.mjs
node --test tests/control-center-codex-thread-routing.test.mjs
node scripts/validate-memory.mjs
```

Run broader `node scripts/self-test.mjs` only after the implementation is done
or before publishing, because the current project already has a passing
self-test from 2026-06-23.

## Acceptance Criteria

- While the operator is still explaining a task, no Codex task card appears.
- For a child-agent creation/improvement/fix task, Pritha first summarizes the
  brief and asks whether it is complete.
- If the operator says "нет", "подожди", "я еще не закончил" or continues adding
  requirements, no Codex task is created.
- After explicit confirmation, `run_codex_task` creates the task normally and
  existing approval gates still apply.
- If the task needs UI approval and the operator clicks `Approve`, Voice Control
  acknowledges the approval within one polling cycle or immediately through the
  UI refresh path.
- After approval, Pritha no longer tells the operator to approve that same task.
- Rejecting the task is also reflected in the live voice session.
- Existing Codex App/CLI task execution, prompt budgeting, thread routing and
  safety approval reasons continue to pass their current tests.

## Rollback Plan

- If the handoff guard is too strict, keep the Realtime instruction change but
  narrow the guard to `task_type=agent_creation` and `write_mode=workspace_write`
  only.
- If approval feedback causes duplicate spoken updates, keep server-side voice
  feedback and remove the client-side immediate data-channel handoff; polling
  and sticky context remain enough.
- If polling approval-gated tasks is too chatty, keep watching them but reduce
  the frequency after the first minute while preserving immediate
  `watchCodexTask()` on UI approve.
- Do not roll back the existing UI decision gate or safety reasons to solve a
  voice UX issue.

## Implementation Order

1. Add tests for the new expected behavior.
2. Add Realtime instruction and runtime soft guard.
3. Start polling `decision_required` tasks and add one-shot approval/rejection
   handoff.
4. Add server-side speakable approval feedback.
5. Run focused tests and memory validation.
6. Manually test one voice scenario:
   - start explaining a task;
   - pause before finishing;
   - confirm no card appears;
   - finish the brief;
   - confirm handoff;
   - approve the UI card;
   - confirm Voice Control stops asking for approval.

## Implementation Result

Implemented on 2026-06-23 in:

- `interfaces/control-center/src/lib/realtime/pritha-runtime.ts`
- `interfaces/control-center/src/components/voice/usePrithaRealtime.ts`
- `tests/control-center-codex-planning.test.mjs`
- `tests/control-center-codex-safety.test.mjs`

Verification passed:

- `node --test tests/control-center-codex-planning.test.mjs`
- `node --test tests/control-center-codex-safety.test.mjs`
- `node --test tests/control-center-codex-thread-routing.test.mjs`
- `node --test tests/control-center-voice-settings.test.mjs`
- `npm --prefix interfaces/control-center run typecheck`
- `npm --prefix interfaces/control-center run build`
- `node scripts/validate-memory.mjs`
- `npm run check`
- `npm test`

Known build note: `next build` still reports the existing Turbopack NFT trace
warning for `next.config.mjs` through `src/lib/control-center/server.ts`; the
build completes successfully and the warning is not introduced by this workflow.
