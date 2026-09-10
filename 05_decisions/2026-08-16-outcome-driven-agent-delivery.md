---
id: 2026-08-16-outcome-driven-agent-delivery
type: decision
status: accepted
created: 2026-08-16
updated: 2026-08-16
topics:
  - pritha
  - agents-mother
  - outcome-spec
  - autonomous-delivery
  - agent-evals
  - execution-ledger
tools:
  - Pritha
  - Codex
  - Codex App Server
  - Node.js
sources:
  - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
  - 04_standards/agent-trajectory-control-and-evidence.md
  - 04_standards/agent-creation-harness.md
  - scripts/agents-mother/index.mjs
  - scripts/agents-mother/contract.mjs
  - scripts/agents-mother/scaffold/index.mjs
  - https://learn.chatgpt.com/docs/app-server
related:
  reviews:
    - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-interface-experience.md
  workflows:
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-roadmap.md
    - 07_workflows/2026-08-16-outcome-driven-agent-delivery-coding-plan.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-16
source_updated: 2026-08-16
source_version: Pritha implementation decision v1; Codex App Server documentation verified 2026-08-16
retrieved: 2026-08-16
verified: 2026-08-16
valid_for: Pritha child-agent creation and delivery from 2026-08-16
temporal_status: current
review_date: 2026-09-16
memory_domain: governance
memory_domains:
  - governance
  - agent-building-knowledge
  - pritha-self
subject:
  kind: decision
  id: outcome-driven-agent-delivery
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Decision: outcome-driven agent delivery

Date: 2026-08-16
Status: accepted

## Context

Pritha reliably creates a contract-backed, researched and testable child-agent
scaffold, but the current pipeline stops before implementing the agent-specific
product. The contract mostly describes architecture. Its success criterion is a
free-form line, scaffold checks are mainly structural, and `improve` ends by
asking a human to hand the brief to Codex.

The desired behavior is different: Pritha should first make the expected final
experience explicit, then keep building, testing and repairing until that
outcome is independently verified or a concrete user decision is genuinely
required.

## Decision

1. Add a separate authored `agent-outcome-spec` beside each agent contract.
   The contract describes construction and boundaries; the Outcome Spec
   describes the result visible to the user.
2. Keep Markdown as the authored source of truth. Compile Trials into
   deterministic JSON stored under `PRITHA_STATE_ROOT`; generated JSON is never
   edited by hand.
3. Give the Outcome Spec two identities:
   - a semantic lock over the intended behavior and Trials;
   - a document lock that excludes mutable approval metadata.
4. Record explicit approval as host-written evidence outside the build
   executor's writable roots. This is tamper-evident operator evidence and an
   executor capability boundary when sandbox policy enforces it; it is not a
   cryptographic authorization boundary against the machine owner or a
   full-access process.
5. Require structured command argv in automated Trials. Shell command strings
   are not executable Trial input.
6. Implement Trial execution through a portable backend contract:
   - local structured process execution with `shell: false` and
     `isolation: none`;
   - Codex App Server `command/exec` with an explicit sandbox policy.
   Using App Server does not by itself prove isolation; evidence must record the
   effective policy, writable roots, network policy and Codex version.
7. Keep the runtime control plane vendor-neutral. Codex App Server is the first
   adapter, not the domain model, following the accepted recommendation
   `adopt-portable-invariants-with-vendor-adapters`.
8. Store each run in private run-scoped state with `run_id`, an append-only
   event log and an atomic ledger snapshot. Permit one active delivery run per
   target. Use stale-safe local locking and compare-and-swap; defer distributed
   leases and a background heartbeat service.
9. Bind every Trial result and completion claim to the Outcome Spec locks,
   contract fingerprint and observed workspace revision.
10. Limit generated coverage to V1 core functions, required deliverables,
    critical side-effect boundaries and critical recovery paths. Pritha
    proposes the matrix; the user reviews it rather than filling it manually.
11. Separate lifecycle meanings:
    - `verified`: machine-verifiable Trials passed;
    - `awaiting_acceptance`: human judgment or demo remains;
    - `accepted`: the user explicitly accepts the result;
    - `blocked`: a typed blocker includes one actionable question and options.
12. Autonomous coding uses a dedicated `pritha/build-*` branch and a disposable
    worktree. It never resets, stashes, overwrites or commits the user's active
    worktree. It never pushes, merges, deploys or provisions secrets without a
    separate explicit approval.
13. The build executor cannot modify the approved Outcome Spec, approval store,
    policy, budgets, ledger implementation or verifier.

## Consequences

- Agent creation gains a verifiable product target instead of ending at a
  structurally valid scaffold.
- Interview behavior becomes proposal-first: Pritha drafts an outcome, examples
  and Trials, then asks only questions whose answers materially change it.
- A green harness is no longer confused with a useful accepted agent.
- Runtime state remains private and rebuildable; tracked reports contain only
  redacted summaries and evidence references.
- App Server capability and schema must be probed at runtime because installed
  Codex versions may differ.
- Operator-judged Trials are allowed, but they prevent autonomous transition to
  `accepted`.

## Alternatives considered

- Extend the existing contract only: rejected because it is already large and
  mixes architecture with product acceptance.
- Use frontmatter YAML objects for Trials: rejected because Pritha's zero-
  dependency parser intentionally does not support that shape.
- Couple delivery directly to App Server: rejected because it conflicts with an
  accepted portability decision and makes testing/fallback harder.
- Treat a receipt file as absolute authorization: rejected as false assurance.
- Add leases, distributed heartbeats and multi-writer orchestration in v1:
  deferred as unnecessary for the initial single-host model.
- Require a separate assessment before this decision: rejected as duplicate
  ceremony; the architecture audit and accepted runtime assessment are recorded
  as evidence here.

## Temporal basis

- Source published: 2026-08-16.
- Source updated: 2026-08-16.
- Source version: current Pritha checkout and Codex App Server documentation.
- Retrieved: 2026-08-16.
- Verified: 2026-08-16.
- Valid for: the first production implementation of outcome-driven delivery.
- Freshness status: current.
- Temporal status: current.
- Supersedes: none.
- Superseded by: none.

## Review date

2026-09-16, or earlier after the first 5–10 real delivery runs.
