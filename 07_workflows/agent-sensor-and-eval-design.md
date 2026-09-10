---
id: agent-sensor-and-eval-design
type: workflow
status: experimental
created: 2026-08-22
updated: 2026-08-22
topics:
  - agent-engineering
  - feedback-sensors
  - agent-evals
  - observability
  - rapid-feedback-loops
tools:
  - Codex
  - OpenTelemetry
sources:
  - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
  - 04_standards/agent-harness-evaluation.md
  - 04_standards/agent-trajectory-control-and-evidence.md
related:
  standards:
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-trajectory-control-and-evidence.md
  workflows:
    - 07_workflows/agents-mother.md
  templates:
    - 08_templates/agent-project-contract.md
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: workflow
  id: agent-sensor-and-eval-design
privacy: public
retention: durable
review_status: reviewed
confidence: high
---

# Workflow: Agent Sensor and Eval Design

Status: experimental

## Goal

Turn an accepted agent outcome and risk model into executable constraints,
fast feedback sensors, representative evals, production metrics and a durable
improvement loop before scaffold or delivery is considered ready.

## Inputs

- draft agent contract;
- independently authored Outcome Spec and Trial coverage;
- selected tools, permissions, runtime and deployment mode;
- critical side effects and human approval boundaries;
- comparable failures from Pritha memory and current project evidence.

## Algorithm

### 1. Define claims and failure modes

For every core outcome, critical side effect and recovery path, write:

- the claim that must be true;
- the observable final state;
- likely failure modes;
- consequence if undetected;
- who can authoritatively decide success.

Include at minimum false completion, repeated or stalled execution, stale
state, invalid tool arguments, partial side effects, unavailable dependencies,
budget exhaustion and evaluator tampering.

### 2. Choose the lowest adequate verification layer

For each claim, decide in this order:

1. Can an exception-free deterministic invariant enforce it?
2. If not, can a representative domain eval grade it?
3. If not, what explicit human judgment or approval is required?

Do not classify a model-based grader as deterministic. Do not encode nuanced
product judgment as a brittle invariant merely to automate it.

### 3. Place the sensor

Map each selected sensor to one or more placements:

- pre-action;
- in-loop;
- post-action;
- pre-commit/local;
- CI/offline;
- production;
- periodic drift/entropy review.

Prefer early placement when it can prevent damage. Prefer post-action read-back
when an external API can acknowledge a call without producing the intended
durable state.

### 4. Specify the sensor contract

Record for every sensor:

| Field | Required content |
| --- | --- |
| ID | stable project-local identifier |
| Claim/risk | what it proves or detects |
| Class | deterministic, inferential or human |
| Trigger | when and how often it runs |
| Evidence | exact state, artifact, event or judgment observed |
| Result | pass, fail, unknown, timeout or infrastructure error |
| Message | concise cause and safe remediation |
| Recovery | retry, rollback, degrade, escalate or stop |
| Budget | latency, cost, sample rate and timeout |
| Integrity | who may modify sensor, fixtures and results |
| Retention | redaction and storage policy |
| Readiness | planned, implemented, ready, degraded or blocked |

### 5. Protect the verifier

- Keep evaluator code, gold fixtures, Outcome Spec locks, approval evidence and
  baseline outside the executor's writable roots.
- Bind results to the exact agent/harness version and workspace revision.
- Treat protected-input mutation, stale evidence and symlink escape as policy
  failures rather than successful Trials.
- If protection is impossible, mark the evidence untrusted and require an
  independent run or human review.

### 6. Define balanced metrics

Choose:

- one primary verified outcome metric;
- safety and permission guardrails;
- semantic quality guardrails;
- latency, token and cost limits;
- trajectory measures for repetition, retries, repairs and handoffs;
- operational SLOs if deployed;
- learning measures for recurrence and incident conversion.

State the keep/revert thresholds before running an improvement experiment.

### 7. Run the fast loop

```text
hypothesis
  -> one bounded change
  -> deterministic sensors
  -> affected regression and capability evals
  -> compare outcome + guardrails + latency + cost
  -> keep | revert | escalate
  -> record attribution and next hypothesis
```

Run neighboring cases with the original reproduction to detect local
overfitting. Use multiple trials for stochastic behavior.

At a major model/runtime change, run the same loop in simplification mode:
remove or narrow one harness layer, re-run representative cases and retain the
simpler form only when outcomes and guardrails remain acceptable.

### 8. Convert incidents into cheaper controls

For each repeated failure:

1. create a minimal redacted reproduction;
2. add a regression task and neighboring cases;
3. promote to an invariant only if the rule is universal and exception-free;
4. otherwise keep the semantic eval or human boundary;
5. verify the fix against the baseline and guardrails;
6. record owner, recurrence and false positives.

### 9. Gate readiness

Sensor design is ready only when:

- completion has an independent fresh verifier;
- consequential tools have pre-action controls;
- execution has time/step/token/cost/retry bounds and non-progress detection;
- critical side effects have post-action read-back;
- Outcome Trials cover core outcomes and recovery paths;
- evaluator integrity and evidence lineage are explicit;
- human judgment and acceptance boundaries are explicit;
- selected operational sensors have readiness states;
- the incident-to-regression owner and review cadence are named.

## Output

Write the result into `Sensor and feedback design` in the agent contract. Put
detailed task matrices in the Outcome Spec/Trial plan and implementation-level
sensor manifests in the child project. Record later changes in scaffold,
delivery and post-creation reports.

## Retrieval cues for Pritha

Use this workflow when a user asks how a new agent will:

- know that it is wrong;
- prove completion or a durable side effect;
- avoid infinite or repeated tool loops;
- measure quality, latency, cost or regressions;
- improve from incidents or user corrections;
- use tests, metrics, traces, validators or LLM-as-judge;
- run a fast experimentation or self-improvement cycle.
