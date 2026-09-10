---
id: 2026-08-16-pritha-outcome-driven-agent-delivery-operations-report
type: agent-operations-report
status: complete
created: 2026-08-16
updated: 2026-08-16
topics:
  - pritha
  - agents-mother
  - outcome-spec
  - autonomous-delivery
  - agent-evals
  - control-center
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
  - scripts/lib/
  - interfaces/control-center/
  - AGENTS.md
  - 04_standards/
  - 07_workflows/
portability: adapter-needed
sources:
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
  - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  workflows:
    - 07_workflows/agents-mother.md
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/pritha-self-model.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-16
source_updated: 2026-08-16
source_version: outcome-driven delivery implementation v1
retrieved: 2026-08-16
verified: 2026-08-16
valid_for: Pritha outcome-driven child-agent delivery v1
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - child-agents
subject:
  kind: pritha-subsystem
  id: agents-mother-delivery
privacy: public
retention: durable
review_status: complete
confidence: high
---

# Pritha outcome-driven agent delivery operations report

Date: 2026-08-16
Status: complete

## Result

Pritha now treats scaffold generation as an intermediate step and has a
working outcome-driven delivery control plane. The implemented chain is:

```text
proposal-first interview
-> accepted agent contract
-> separate Outcome Spec and explicit host approval
-> deterministic Trial plan
-> researched scaffold with a clean local Git baseline
-> disposable worktree build/fix/verify loop
-> verified or awaiting_acceptance
-> explicit user acceptance or a new correction revision
```

The run cannot remain in an undefined middle state: every active ledger state
has exactly one next action or one or more typed blockers with a concrete
question and bounded answer options.

## Implemented surfaces

| Surface | Result | Notes |
| --- | --- | --- |
| Outcome Spec | complete | Separate Markdown source of truth, validation, coverage, semantic/document locks and host-side approval evidence |
| Trial compiler/runtime | complete | Deterministic JSON plan, structured argv, local and App Server adapters, bounded/redacted evidence and artifact freshness |
| Delivery ledger | complete | Atomic snapshot, append-only events, CAS, stale-lock recovery, target ownership, budgets and typed blockers |
| Autonomous build | complete | `pritha/build-*` disposable worktree, protected Trial inputs, independent post-commit verification and no active-worktree mutation |
| Correction | complete for v1 | `outcome revise` creates a lineage-preserving draft, supersedes the prior approval and requires fresh approval plus a new run |
| Scaffold | complete | Carries Outcome lineage and initializes a clean local Git baseline without a remote |
| Control Center | complete for read model | Separates contract, Outcome and delivery states and reads current private ledger state |
| Realtime Voice/Codex planning | complete | Uses proposal-first intake and the full contract/outcome/research/scaffold/delivery/card gate |
| Self-knowledge | complete | Decision, standards, workflow, `AGENTS.md` and Pritha self-model describe the new behavior |

## Safety and integrity controls

- The build executor cannot write the authored Outcome Spec, approval store,
  run ledger or host verifier state.
- Resume and acceptance recheck the exact approval, contract fingerprint and
  Outcome locks; a changed goal cannot inherit stale verification.
- Contract-selected Trial backend policy is reapplied on resume.
- Trial evidence is bound to a workspace revision and to content-sensitive
  asserted artifacts even when Git ignores those artifacts.
- A crash-truncated final ledger event is ignored during recovery, while
  corruption in an earlier event remains a hard failure.
- Executor changes to protected Trial entrypoints or fixtures become a typed
  blocker; discard is permitted only after a recorded user choice and only in
  the verified disposable worktree.
- No delivery path pushes, merges, deploys, changes remotes, enables services,
  provisions secrets or bypasses Git hooks.
- Tracked delivery reports redact user-specific filesystem paths and secrets;
  live run state stays outside authored Git memory.

## Verification

The implementation was exercised with module tests, adversarial integrity
tests and a CLI end-to-end fixture covering accepted contract, Outcome
proposal, approval, scaffold, delivery, stale-approval rejection and explicit
user acceptance.

- Outcome-delivery and directly affected regression tests: 97 passed, 0
  failed.
- Control Center TypeScript validation: passed.
- Repository-wide unit suite: 430 passed, 5 failed out of 435.
- Memory and embedding rebuilds: completed successfully; a semantic query about
  verified agent delivery retrieves the updated creation-harness standard and
  Agents Mother workflow.

All five full-suite failures have the same pre-existing local data-integrity
cause: four patient post-creation review artifacts reuse one frontmatter `id`.
The memory validator reports three duplicate occurrences, and four wrapper or
bootstrap tests fail transitively when they invoke that validator. Those
user-owned artifacts were not rewritten as part of this change. The latest
self-test also reports two stale queue items and recommends Python 3.10 or newer
instead of the installed Python 3.9; neither warning was changed by this
implementation.

## Operational boundaries

- No background service, heartbeat, scheduler or long-running delivery worker
  was enabled.
- No remote, push, merge, deployment or secret mutation was performed.
- App Server integration is covered through the portable adapter contract and
  simulated protocol tests; a real model-driven child-project repair should be
  observed during the first production delivery run before tuning budgets.
- Control Center currently presents the lifecycle and live blockers. Mutating
  approve/resume/accept controls remain CLI/Codex-operated until dedicated
  confirmation-gated HTTP actions receive their own review.
- Defaults for iteration budget and repeated-failure threshold remain
  provisional until evidence from the first 5–10 real agent deliveries exists.

## Next evidence

1. Resolve duplicate IDs in the local patient review series through a separate
   artifact-lineage decision, then rerun memory validation and self-test.
2. Run one real, initially failing child-agent Outcome through the App Server
   executor and record iteration, blocker and acceptance metrics.
3. After the user accepts this Pritha state, capture a Good State Baseline as a
   separate recovery-point workflow if requested.
