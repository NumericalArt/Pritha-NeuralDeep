---
id: agent-feedback-sensors-and-evaluation-loops
type: standard
status: draft
created: 2026-08-22
updated: 2026-08-22
last_reviewed: 2026-08-22
owner: Pritha/user
topics:
  - agent-engineering
  - harness-engineering
  - feedback-sensors
  - agent-evals
  - observability
  - rapid-feedback-loops
tools:
  - Codex
  - OpenTelemetry
sources:
  - 01_sources/signals/2026-08-22-agent-feedback-sensors-and-evaluation-loops-signal.md
  - 03_reviews/2026-08-22-agent-feedback-sensors-and-evaluation-loops-assessment.md
  - https://martinfowler.com/articles/harness-engineering.html
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://openai.com/index/harness-engineering/
  - https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
related:
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  reviews:
    - 03_reviews/2026-08-22-agent-feedback-sensors-and-evaluation-loops-assessment.md
    - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-trajectory-control-and-evidence.md
  workflows:
    - 07_workflows/agent-sensor-and-eval-design.md
    - 07_workflows/agents-mother.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: standard
  id: agent-feedback-sensors-and-evaluation-loops
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2025-11-26 to 2026-05-27
source_updated: 2026-05-27
source_version: Pritha draft standard v1
retrieved: 2026-08-22
verified: 2026-08-22
valid_for: agent contracts, scaffolds, delivery loops and post-creation evolution
temporal_status: current
---

# Standard: Agent Feedback Sensors and Evaluation Loops

Status: draft
Owner: Pritha/user
Last reviewed: 2026-08-22

## Rule

Every non-trivial agent must have an explicit feedback system that can detect
incorrect actions, stalled trajectories and false completion early enough to
recover. Instructions are feedforward guidance; they do not count as proof.
Success is established by fresh evidence about the required final state.

Design the harness as five cooperating functions:

1. **Constrain** actions with permissions, schemas, budgets and invariants.
2. **Inform** the agent with concise maps, contracts, examples and state.
3. **Verify** actions and outcomes with the cheapest adequate sensor.
4. **Correct** through bounded recovery or a minimal harness change.
5. **Learn** by preserving the failure as an eval, check or documented human
   judgment.

This is Pritha's operational synthesis. It is not attributed as a formally
named framework from any one source.

## Required verification ladder

Use the earliest layer capable of enforcing the rule:

1. **Invariant layer** — deterministic, fast and exception-free checks:
   schemas, types, ranges, permissions, state versions, idempotency keys,
   durable-state existence, budgets and structural rules. A rule that calls a
   model or admits contextual exceptions is not an invariant.
2. **Domain-eval layer** — representative tasks and graders for semantic or
   end-to-end correctness. Keep fixtures and graders protected; run multiple
   trials when outputs are stochastic; grade final state and artifacts.
3. **Human-judgment layer** — product taste, ambiguous correctness,
   consequential approval and user acceptance. Record the judgment boundary;
   do not fabricate autonomous acceptance.

An LLM-as-judge is an inferential domain sensor. Calibrate it against humans,
record model and rubric versions, and do not use it as sole authority for
irreversible actions, completion or acceptance.

## Sensor placement

| Placement | Required concerns | Typical sensors |
| --- | --- | --- |
| Pre-action | authorization, schema, budget, state freshness, irreversible approval | allowlists, typed validation, CAS/version check, idempotency, approval evidence |
| In-loop | repetition, non-progress, timeout, retry exhaustion, dependency failure | duplicate-call detector, turn/step budget, progress predicate, bounded retry/backoff, circuit breaker |
| Post-action | real side effect and usable artifact | state read-back, artifact existence/hash, test, browser/UI check, external receipt |
| Pre-commit/local | cheap code and structure regressions | formatter, linter, type check, unit test, structural rule, fast smoke test |
| CI/offline | wider behavior and non-local risk | regression/capability suites, security, mutation, performance, calibrated semantic graders |
| Production | drift, reliability and user-visible failure | trace tree, SLOs, latency, tool errors, abort/escalation, sampled quality, user corrections |
| Periodic | entropy and sensor decay | docs drift, dependency health, dead code, flaky-test and coverage-quality audits |

Run the cheapest relevant sensor first and stop expensive evaluation when an
earlier hard gate fails.

Keep the harness incrementally enforceable and removable. Add controls from
observed risks and representative failures rather than speculative complexity.
When a model or runtime changes, test whether an old sensor or middleware layer
still improves outcomes; simplify or retire it only after the same regression
and guardrail comparison used to adopt it.

## Sensor contract

Every selected sensor must record:

- the risk or claim it observes;
- placement and trigger;
- input and observed state;
- deterministic or inferential class;
- pass/fail/unknown result and timeout behavior;
- actionable, bounded failure message;
- automatic recovery, escalation or rollback path;
- latency/cost tier and sampling policy;
- owner and retention policy;
- integrity boundary: who may read or modify the sensor, fixture and result.

Selected sensors may be `planned`, `implemented`, `ready`, `degraded` or
`blocked`. A missing selected sensor cannot be reported as skipped.

## Non-negotiable invariants

- Never claim success unless the contract's durable completion state exists and
  a fresh verifier confirms it.
- Validate permissions and irreversible-action approval before the tool call.
- Keep protected evaluators, gold fixtures, approval evidence and completion
  rules outside the executor's writable boundary.
- Detect repeated identical or equivalent tool calls and enforce bounded turns,
  time, tokens, cost and retries.
- External calls use bounded retry with backoff; persistent failure activates a
  circuit breaker, graceful degradation or human escalation.
- A prompt, model, context policy, tool schema, permission or verifier change is
  a versioned harness change and triggers affected regression checks.
- Raw private prompts, transcripts and tool payloads are not retained merely
  for observability; capture the minimum redacted evidence allowed by policy.

## Metrics

Use a balanced scorecard rather than one proxy:

- **Outcome:** task pass rate, verified final-state existence, constraint
  violations, user-visible correctness.
- **Trajectory:** tool errors, repeated calls, steps/turns, retries, repair
  iterations, state read/write mismatches, handoff failures.
- **Efficiency:** latency, token and monetary cost, compute, time to first valid
  result.
- **Operations:** success, abort and escalation rates, availability, SLOs,
  circuit-breaker activations and recovery time.
- **Learning:** incident recurrence, failures converted to fixtures or
  invariants, sensor coverage and useful trigger rate.

Define one primary outcome metric plus explicit safety, quality, cost and
integrity guardrails. Reject improvements that raise the primary metric by
violating a guardrail.

## Rapid improvement loop

For each iteration:

1. state one falsifiable failure hypothesis;
2. reproduce it in an isolated task or trace;
3. make one bounded change to the mutable harness or agent;
4. run the fastest applicable deterministic sensors;
5. if they pass, run the affected regression and capability evals;
6. compare outcome, guardrails, latency and cost to the versioned baseline;
7. keep, revert or escalate the change;
8. record failure attribution, evidence and the next hypothesis.

Do not let the executor modify the evaluator, protected fixtures, baseline or
approval evidence to obtain a pass. When this separation cannot be guaranteed,
the result is untrusted.

## Incident descent algorithm

When a human, trace or production metric finds a failure:

1. capture a minimal redacted reproduction and classify the failure;
2. add it to the relevant regression suite, including neighboring cases;
3. determine whether the desired rule is universal and exception-free;
4. if yes, promote it to a deterministic invariant or pre-action validator;
5. if no, keep it as an eval or explicit human-review boundary;
6. rerun the original and neighboring cases;
7. record recurrence, false-positive cost and the rationale for its layer.

The goal is not to eliminate human judgment. It is to move recurring,
well-specified failures toward faster and cheaper enforcement.

## Minimum contract coverage

Before an agent contract is accepted, it must define at least:

- critical completion state and its independent verifier;
- pre-action controls for consequential tools;
- loop budgets and non-progress detection;
- post-action read-back or artifact checks;
- representative Outcome Trials and protected grader boundary;
- production or operational signals appropriate to deployment;
- human approval and ambiguity boundaries;
- metric baseline and guardrails;
- incident-to-regression ownership and cadence.

Small local/manual agents may mark production and periodic sensors
`not-applicable` with reasons. They may not waive completion verification,
permission checks or bounded execution.

## Relationship to other standards

- `agent-creation-harness` defines the full agent architecture and inventory.
- `agent-harness-evaluation` defines fair harness/model comparison and
  outcome-bound evaluation.
- `agent-trajectory-control-and-evidence` defines durable event, budget and
  evidence integrity semantics.
- This standard defines sensor placement, layered verification and the learning
  loop that connects incidents to harness changes.

## Temporal validity

- Source published: 2025-11-26 to 2026-05-27.
- Source updated: 2026-05-27.
- Source version: Pritha draft standard v1.
- Retrieved: 2026-08-22.
- Verified: 2026-08-22.
- Valid for: agent contracts, scaffolds, delivery loops and post-creation
  evolution.
- Freshness status: current.
- Temporal status: current.
- Recheck when: grader models, OpenTelemetry GenAI semantic conventions,
  runtime permission mechanisms or the protected Trial architecture changes.
