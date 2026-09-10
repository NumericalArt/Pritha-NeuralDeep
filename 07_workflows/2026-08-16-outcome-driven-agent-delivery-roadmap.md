---
id: 2026-08-16-outcome-driven-agent-delivery-roadmap
type: workflow
status: active
created: 2026-08-16
updated: 2026-08-16
topics:
  - pritha
  - agents-mother
  - outcome-spec
  - autonomous-delivery
  - agent-evals
  - build-loop
tools:
  - Pritha
  - Codex
  - Codex App Server
  - Node.js
agent_platforms:
  - Codex
  - Pritha Control Center
runtime_environment:
  - local-mac
  - cli
  - control-center
config_surfaces:
  - scripts/agents-mother/
  - scripts/pritha.mjs
  - 08_templates/agent-outcome-spec.md
  - PRITHA_STATE_ROOT
portability: adapter-needed
sources:
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
  - scripts/agents-mother/index.mjs
  - scripts/agents-mother/contract.mjs
  - scripts/agents-mother/scaffold/index.mjs
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-interface-experience.md
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-16
source_updated: 2026-08-16
source_version: implementation roadmap v2
retrieved: 2026-08-16
verified: 2026-08-16
valid_for: Pritha outcome-driven delivery implementation
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

# Roadmap: outcome-driven agent delivery

## Outcome

Pritha should turn a user request into a working agent, not only a scaffold. A
run is allowed to stop before that only when it records a typed blocker with an
actionable question and bounded answer choices.

The delivery chain is:

```text
user intent
  -> proposed agent contract
  -> proposed user-visible Outcome Spec and Trials
  -> explicit approval evidence
  -> research and scaffold
  -> isolated build/fix/verify loop
  -> verified demonstration
  -> user acceptance or correction
```

## Product principles

- Ask for intent and irreversible choices; propose technical detail.
- Keep the approved outcome immutable to the executor.
- Treat deterministic evidence as stronger than executor claims.
- Keep card readiness, delivery verification, user acceptance and release
  readiness as separate states.
- Preserve user work and private state by construction.
- Prefer a small deterministic control plane around model-driven implementation.

## Phases

### Phase 0 — decision and compatibility baseline

- Record the architectural decision and v2 implementation contract.
- Verify current App Server command and Goal surfaces from official
  documentation and installed schema.
- Preserve accepted Good State behavior and existing CLI aliases.

Done when the decision is accepted and implementation surfaces are named.

### Phase 1 — Outcome Spec

- Add `agent-outcome-spec` template and validation.
- Generate a proposal from an agent contract.
- Add semantic/document locks and separate approval evidence.
- Compile deterministic Trial plans.
- Generate a bounded coverage matrix from V1 core functions and deliverables.

Done when equivalent input produces byte-identical plans and mutation tests
prove that semantic edits invalidate approval.

### Phase 2 — independent Trial runtime

- Add local structured-argv execution.
- Add an App Server `command/exec` adapter with sandbox evidence.
- Implement file/stdout/stderr/exit/duration assertions.
- Bind results to workspace revision and spec locks.

Done when both backends satisfy the same contract and unsupported isolation
fails closed.

### Phase 3 — durable delivery state

- Add private run directories, append-only events and atomic ledger snapshots.
- Add one-active-run-per-target locking and stale recovery.
- Add typed blockers, budgets and readiness state transitions.
- Emit redacted tracked reports on blocker and terminal verification.

Done when crash/resume and stale-workspace tests preserve authoritative changes.

### Phase 4 — build/fix/verify loop

- Prepare a dedicated branch and disposable worktree.
- Run Codex through a portable build-executor adapter.
- Repeat implementation and independent Trials until verified, budget exhausted
  or repeated failure becomes a typed blocker.
- Never let the executor edit the Outcome Spec, approval evidence or verifier.

Done when fixture agents can be brought from failing Trials to verified without
manual step-by-step prompting.

### Phase 5 — Pritha behavior and Control Center

- Make interview proposal-first and outcome-aware.
- Show contract, Outcome Spec, delivery run, blockers and evidence as separate
  card states.
- Expose approve, pause, resume, retry, accept and request-correction actions.

Done when CLI and UI expose the same lifecycle semantics.

### Phase 6 — correction and learning

- Convert user corrections into a new Outcome Spec revision with fresh approval.
- Preserve the former version and invalidate stale evidence.
- Capture post-creation lessons without automatically changing standards.
- Rebuild Pritha memory and use observed delivery metrics for defaults.

Done when a rejected demonstration can be revised and rerun without losing
lineage or rewriting history.

## Implementation checkpoint — 2026-08-16

| Phase | Status | Evidence or remaining boundary |
| --- | --- | --- |
| 0–4 | implemented | Decision, Outcome locks, portable Trial runtime, ledger and disposable-worktree build loop are covered by module and CLI end-to-end tests |
| 5 | implemented for CLI/read model | Interview, CLI and Control Center share lifecycle meanings; confirmation-gated mutating Control Center buttons remain a separate UI/API review |
| 6 correction | implemented for v1 | `outcome revise` preserves lineage, supersedes stale approval and requires a new approval and run |
| 6 learning | awaiting production evidence | Defaults stay unchanged until the first 5–10 real deliveries provide per-run measurements |

## Initial v1 boundaries

- One host and one active delivery run per target.
- No push, merge, deployment, scheduler enablement or secret provisioning.
- No distributed leases or background heartbeat service.
- App Server is an adapter; local execution remains available for trusted checks.
- Operator-judged Trials lead to `awaiting_acceptance`, never autonomous
  acceptance.
- Existing `scaffold` remains a low-level compatibility command while `deliver`
  becomes the outcome-driven orchestration surface.

## Measurement

For the first 5–10 real agents, store a per-run table rather than an averaged
marketing percentage:

- technically verified or blocked;
- questions asked before first build;
- build iterations and repeated-failure signatures;
- automated versus operator-judged coverage;
- correction size after demonstration;
- elapsed time and executor usage;
- blocker category and whether its question unlocked progress.

Defaults for iteration budget and repeated-failure threshold may change only
after this evidence exists.

## Main risks and controls

| Risk | Control |
| --- | --- |
| Executor moves the goal | spec and approval are outside writable roots; every result checks locks |
| Green structural checks mask missing behavior | generated coverage maps core functions and deliverables to Trials |
| Build destroys user edits | dirty active workspace blocks; all coding happens in a disposable worktree |
| Sandbox is assumed rather than proven | record effective policy and fail closed when required isolation is unavailable |
| Endless loop | iteration/time budgets and repeated-failure blocker |
| Bureaucratic interview | Pritha proposes defaults, sessions and coverage; asks only material questions |
| False completion | `verified`, `awaiting_acceptance`, `accepted` and `release-ready` remain distinct |
| Runtime state leaks into Git | state-root storage plus path/secret redaction in tracked reports |
