---
id: agent-trajectory-control-and-evidence
type: standard
status: draft
created: 2026-07-24
updated: 2026-08-16
last_reviewed: 2026-08-16
owner: Pritha/user
topics:
  - agent-engineering
  - production-agents
  - long-running-agents
  - trajectory-security
  - evidence-based-completion
  - observability
  - incident-response
  - human-approval
  - outcome-economics
tools:
  - Pritha
  - Codex
  - Git worktree
  - container
  - CI
agent_platforms:
  - Pritha
  - Codex
  - portable agent harnesses
model_context:
  - mixed hosted and local models
runtime_environment:
  - local worktree
  - isolated container
  - durable worker
  - CI
  - production control plane
config_surfaces:
  - agent-contract
  - AGENTS.md
  - spec.md
  - plan.md
  - run contract
  - agent-outcome-spec
  - delivery ledger
  - trial-plan.json
  - trajectory events
  - evidence bundle
portability: portable
sources:
  - 03_reviews/2026-07-24-production-agent-operating-layer-assessment.md
  - https://openai.com/index/safety-alignment-long-horizon-models/
  - https://openai.com/index/a-scorecard-for-the-ai-age/
  - https://huggingface.co/blog/security-incident-july-2026
  - https://allenai.org/blog/shippy-deep-dive
  - https://developers.googleblog.com/evolving-spec-driven-development-conductor-now-supports-antigravity/
  - https://developers.googleblog.com/en/building-scalable-ai-agents-with-modular-prompt-transpilation/
  - https://developer.nvidia.com/blog/mastering-agentic-techniques-ai-agent-reinforcement-learning/
  - 03_reviews/2026-08-09-agent-runtime-control-plane-research-assessment.md
  - https://arxiv.org/abs/2608.00808
  - https://arxiv.org/abs/2608.01964
  - https://github.com/AMAP-ML/LongHorizon-Harness
  - https://arxiv.org/abs/2607.26637
  - https://arxiv.org/abs/2608.02499
  - https://github.com/Trae1ounG/SWE-Touch
  - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  assessments:
    - 03_reviews/2026-07-24-production-agent-operating-layer-assessment.md
    - 03_reviews/2026-06-01-production-agent-controls-assessment.md
  standards:
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/codex-goals-for-long-running-agent-work.md
    - 04_standards/agent-minimal-core-extension-surface.md
  workflows:
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-07-13
source_updated: 2026-08-16
source_version: Pritha trajectory control standard v3; Outcome Spec, immutable Trials, single-writer delivery ledger and post-commit verification integrated 2026-08-16
retrieved: 2026-07-24
verified: 2026-08-16
valid_for: Pritha and child-agent runs that are long-running, proactive, parallel, permission-bearing or capable of external side effects
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: standard
  id: agent-trajectory-control-and-evidence
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Standard: Agent Trajectory Control and Evidence

Status: draft
Owner: Pritha/user
Last reviewed: 2026-08-16

## Rule

Every long-running, proactive, parallel, permission-bearing or externally
acting agent must execute against a versioned run contract and produce
independent evidence of completion.

Per-tool permission checks remain mandatory, but they are not sufficient. The
control plane must evaluate the cumulative trajectory: changing plans,
transferred data, granted authority, external destinations, side effects,
elapsed time, cost and attempts to modify the agent's own rules.

The executor may propose completion. It must not be the only authority that
accepts completion or approves an irreversible external action.

## Use When

- a task may run across compaction, session restart or more than one worker;
- the trigger is a schedule, email, webhook, queue, CI event or background
  watcher;
- the agent writes code, uses shell, calls network tools, handles private data
  or receives temporary credentials;
- two or more agents work in parallel;
- the agent can publish, deploy, pay, delete, send, merge or mutate production;
- an operation needs pause, rollback, audit or incident investigation.

## Lightweight Exception

A one-shot, local, read-only task with no private data or external side effects
may use a minimal contract:

- objective;
- allowed inputs and tools;
- stop condition;
- final evidence.

The exception ends as soon as the run gains network write access, credentials,
background execution, parallel workers or an irreversible action.

## Required Run Contract

Record before execution:

- `run_id`;
- trigger type and triggering event identifier;
- objective and acceptance criteria;
- immutable hash or version of the task specification and applicable
  instructions;
- allowed plan-change policy;
- executor identity, harness version and selected runtime route;
- worktree, container, VM or other isolation boundary;
- mutable-state isolation for ports, caches, databases, temporary files and
  service accounts;
- tool and network allowlists;
- credential lease class, scope, expiry and revocation path;
- time, cost, token, tool-call and retry budgets;
- concurrency, idempotency and dedupe policy;
- checkpoints and rollback anchor;
- independent monitor and verifier;
- human approval gates;
- expected evidence bundle;
- pause, kill, escalation and incident path;
- trace privacy, location and retention.

Credential identifiers may be logged. Credential values must never appear in
the run contract, tracked Markdown or model-visible evidence.

## Trajectory Event Record

Record structured events sufficient to reconstruct material state changes
without storing private chain-of-thought:

- run start, pause, resume, cancel and finish;
- objective/specification version and every approved revision;
- concise plan revision with reason and affected boundary;
- tool invocation class, target and material side effect;
- files, records or external resources created, changed or deleted;
- network destination and data classification;
- credential lease grant, use class, expiry and revocation;
- public artifact, message, PR, deployment, payment or production-mutation
  attempt;
- attempt to change instructions, policies, monitors, gates or permissions;
- worker handoff, branch/worktree ownership and merge decision;
- deterministic check result;
- monitor alert and policy decision;
- verifier and human approval decision;
- accumulated time, cost, retries and budget state;
- checkpoint, rollback and incident reference.

Prefer append-only structured events. Summarize tool inputs and outputs when raw
payloads contain secrets, personal data, copyrighted material or untrusted
content.

## Execution Ledger

Every resumable or multi-round run must maintain a compact machine-readable
ledger separate from conversational memory. At minimum record:

- objective/specification version;
- current lifecycle state and reason code;
- workspace or external-state revision;
- verified facts and their evidence references;
- unverified executor claims;
- created or changed artifacts;
- next action, blocker and owner;
- budget and policy state;
- last successful independent verification.

Do not promote an executor claim to a verified fact because it was summarized,
repeated, compacted or written to memory. Promotion requires deterministic or
independent evidence.

The ledger is an execution primitive, not authored long-term knowledge. Store it
in runtime state with the privacy and retention policy of the run. Promote only
curated, non-sensitive lessons to tracked Markdown.

For Pritha agent delivery, the ledger has a stronger liveness invariant. Every
non-terminal state contains exactly one actionable `next_action` or a non-empty
list of typed blockers. Each blocker records an owner, a bounded question and
answer choices; free text such as “something failed” is not a valid pause state.
Ledger updates are single-writer, stale-lock recoverable and compare-and-swap
guarded so that two resume attempts cannot silently overwrite each other.

## Document Outcome, Thread Goal and Trial Plan

Pritha uses three related but non-interchangeable control surfaces:

- the approved `agent-outcome-spec` is the durable product outcome and source of
  truth across threads;
- a Codex thread Goal, when used, controls one bounded implementation session
  and must cite rather than replace the Outcome Spec;
- generated `trial-plan.json` is the deterministic executable projection of the
  signed Trial blocks and is never hand-edited.

The build executor may propose source changes but cannot revise the Outcome
Spec, its compiled plan, approval evidence or verifier. Changing the product
goal requires a new user-reviewed Outcome Spec revision and invalidates stale
evidence. Changing only an implementation tactic does not.

Machine verification and human acceptance are also separate. Passing every
Trial for an exact committed revision yields `verified` or
`awaiting_acceptance`; only explicit user evidence yields `accepted`.

## Workspace and External-State Freshness

Evidence is valid only for the state it observed. Bind checks and completion
claims to a `workspace_revision` or equivalent state token such as Git SHA,
database version, object ETag, API revision or normalized snapshot hash.

Before a write, resume or completion decision:

1. compare the current state token with the token used by the plan and evidence;
2. classify any change as expected, authoritative user/external change, worker
   output or unexplained drift;
3. preserve authoritative changes;
4. invalidate or selectively rerun stale checks;
5. record the new state token and reconciliation decision.

For coding agents, eval at least one case where a user edits a critical file
after the agent has read it. The agent must detect the stale workspace and must
not overwrite the user's newer intent from cached context.

## Typed Pause and Resume

Use structured states and reason codes rather than free-text status alone.
Recommended lifecycle states are `running`, `input_required`, `paused`,
`budget_exhausted`, `blocked`, `verifying`, `complete`, `cancelled` and
`failed`.

Resume must revalidate:

- run-contract and instruction version;
- workspace/external-state revision;
- credential lease and permission scope;
- remaining budgets;
- pending external effects and approval gates;
- monitor and verifier availability.

Protocol- or vendor-specific statuses should map into this internal lifecycle;
they must not become the only source of truth.

## Monitor Independence

- Run trajectory monitoring outside the executor's editable instruction and
  tool surface whenever risk is high.
- Prefer deterministic policy for hard limits, destination allowlists,
  credential expiry and irreversible-action gates.
- The executor must not be able to disable or rewrite its own monitor, budget
  caps, audit sink or approval policy.
- A monitor may pause the run and request review. It must not silently broaden
  permissions to help the run finish.
- Evaluate sequences and cumulative authority, not only isolated calls.

## Isolation

A Git worktree is a source-control boundary, not a complete security boundary.

For parallel or untrusted work, separately isolate as needed:

- process and filesystem;
- network and destination policy;
- credentials and service accounts;
- ports and local services;
- database schema or instance;
- build and package caches;
- temporary directories;
- queues and object-store prefixes;
- cloud project, namespace or account.

Use ephemeral credentials and disposable workers for unattended high-risk
execution. Do not run such work on a personal workstation containing
irreplaceable data.

## Completion and Evidence

An evidence bundle should contain:

- original specification version;
- final diff, artifact or state identifier;
- deterministic test, lint, build, schema or state-query results;
- independent verifier result against the original specification;
- screenshot, structured log or receipt for UI and integration behavior;
- policy and budget summary;
- unresolved warnings and accepted exceptions;
- rollback anchor;
- human approval for irreversible external effects.

The verifier should use a fresh context when practical and must not inherit the
executor's unsupported completion assumptions.

Green tests alone are not proof. For critical changed behavior, consider
mutation, negative, adversarial or fault-injection checks that demonstrate the
test can detect a planted error.

## Human Gates

Require explicit human approval immediately before:

- publishing a public artifact;
- merging or deploying to production;
- sending a consequential external message;
- spending money or accepting a financial obligation;
- deleting or irreversibly transforming material data;
- granting persistent credentials or expanding permissions;
- weakening security, privacy, retention or monitoring rules.

The agent may prepare the action and evidence. It may not remove or redefine
the gate.

## Incident-to-Eval Loop

When a run violates policy or exposes a new failure mode:

1. Pause the run.
2. Revoke or expire credentials.
3. Isolate the worker and preserve the minimum needed evidence.
4. Redact secrets and personal data.
5. Identify the earliest detectable signal across the trajectory.
6. Convert the incident into a minimized regression fixture.
7. Add neighboring variants so the fix is not overfit to one transcript.
8. Apply the lightest effective fix: deterministic policy, tool constraint,
   instruction, harness change, model route or post-training.
9. Re-run held-out safety and capability evals.
10. Redeploy gradually with monitoring and rollback.

Do not store raw attack payloads, credentials or private runtime traces in
tracked knowledge. Store a neutral incident summary and fixture identifier.

## Outcome Economics

Compare models, routes and harnesses by accepted work:

```text
accepted-result cost =
  inference
  + retries
  + isolation and infrastructure
  + human review
  + correction and rollback
  + expected loss from unsafe or incorrect action
```

Track at least:

- acceptance rate;
- reruns per accepted result;
- time to accepted result;
- human review minutes;
- rollback or reopen rate;
- evidence completeness;
- safety-policy violations;
- infrastructure and isolation cost.

Do not route solely by token price. A cheap attempt that increases retries,
review or failure risk may be the expensive route.

## Local Incident Fallback

A local model may be selected for sensitive forensic or continuity work only
when the contract defines:

- pinned model and runtime;
- representative evals;
- no-egress or allowlisted network policy;
- isolated compute and storage;
- hardware/context limits;
- healthcheck and fallback;
- private trace retention;
- human owner.

Local does not mean safe, free or capable. It changes the data boundary and
failure mode; it does not remove the need for isolation, verification or
untrusted-input controls.

## Relationship to Existing Standards

- `agent-proactivity-scheduling` selects triggers, scheduler ownership,
  cadence, retry and kill-switch behavior.
- `codex-goals-for-long-running-agent-work` defines a thread-scoped outcome and
  evidence contract for Codex.
- `agent-runtime-placement` selects deterministic, local, small-hosted,
  frontier-hosted or human routes by task class.
- `agent-team-operating-model` selects roles, worker count, handoffs and
  verifier topology.
- `agent-untrusted-input-security` governs prompt injection, permissions,
  external content and supply-chain boundaries.
- `agent-harness-evaluation` determines whether the whole harness succeeds
  reliably in its actual environment.
- `outcome-driven-agent-delivery` separates the durable Outcome Spec from the
  thread Goal and implements the ledger, immutable Trial and acceptance
  invariants for Pritha-created agents.
- This standard joins those decisions into one controlled run and evidence
  trail.

## Promotion Checklist

Before this standard becomes active:

- validate the event and run-contract field names against current Pritha
  contract/template work;
- test one local read/write coding run and one scheduled or simulated
  event-driven run;
- verify sensitive events remain outside tracked Markdown;
- test monitor pause, credential revocation and rollback behavior;
- test a fresh-context verifier;
- measure the overhead of evidence collection;
- confirm the standard does not require enterprise machinery for one-shot,
  local, read-only tasks.

## Temporal Validity

- Primary evidence window: 2026-07-13 through 2026-08-16.
- Retrieved and verified: 2026-08-16.
- Valid for: Pritha and child-agent production architecture from 2026-07-24
  until a material change in runtime, monitoring, workspace-concurrency or
  incident evidence.
- Recheck when: Pritha adds a durable worker runtime, autonomous credential
  management, production deployment permissions, a fleet control plane or a
  local forensic route.
