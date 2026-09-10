---
id: 2026-08-22-agent-feedback-sensors-and-evaluation-loops-signal
type: signal
status: refined
created: 2026-08-22
updated: 2026-08-22
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
  - source-738d63ad-6eaa-43d9-b2c9-a81d65456720
  - source-85441619-5ac3-4021-944b-31575abc05d4
related:
  intakes: []
  source_notes: []
  assessments:
    - 03_reviews/2026-08-22-agent-feedback-sensors-and-evaluation-loops-assessment.md
  briefs: []
  reviews:
    - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
  standards:
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
generated_from:
  - source-738d63ad-6eaa-43d9-b2c9-a81d65456720
  - source-85441619-5ac3-4021-944b-31575abc05d4
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: source-material
memory_domains:
  - source-material
subject:
  kind: signal
  id: agent-feedback-sensors-and-evaluation-loops
privacy: public
retention: source-purged
review_status: reviewed
confidence: high
anonymous_source_id: source-738d63ad-6eaa-43d9-b2c9-a81d65456720
anonymous_source_ids:
  - source-738d63ad-6eaa-43d9-b2c9-a81d65456720
  - source-85441619-5ac3-4021-944b-31575abc05d4
---

# Signal: Agent Feedback Sensors and Evaluation Loops

Date: 2026-08-22
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

An agent becomes dependable when its harness provides fast, actionable and
tamper-resistant feedback at the point where an error can still be corrected.
Instructions guide behavior, but they do not replace executable constraints,
state checks, outcome evaluation, traces and human judgment.

The reusable design pattern is a layered control loop:

1. constrain unsafe or impossible actions before execution;
2. inform the agent with concise task and project guidance;
3. verify the resulting state with the cheapest adequate sensor;
4. correct the harness or agent behavior from attributable evidence;
5. preserve the failure as a regression fixture or stronger rule.

This five-step formulation is Pritha's synthesis across sources. It must not be
presented as a formally named OpenAI framework.

## Technical details

- Feedforward controls include contracts, concise `AGENTS.md` maps, schemas,
  examples, skills and architectural rules.
- Feedback sensors include validators, tests, types, linters, structural
  checks, browser or artifact checks, eval graders, traces, runtime metrics,
  review comments and user corrections.
- Deterministic sensors should run as close to the action as possible. Semantic
  or stochastic graders belong later in the loop and require calibration.
- A successful final message is not proof of success. Verify the durable final
  environment state, produced artifact or external side effect.
- Evaluators, gold fixtures, approval evidence and completion rules must remain
  outside the executor's writable boundary when their integrity matters.
- One bounded change per iteration improves failure attribution. Compare its
  outcome, safety, latency and cost before keeping it.
- Repeated production failures should descend toward cheaper enforcement:
  incident to regression task, then to invariant or pre-action validator when
  the rule becomes universal and exception-free.

## Agent design implications

Every new agent contract should contain a sensor map covering pre-action,
in-loop, post-action, pre-commit or offline, production and periodic checks.
Each sensor needs an owner, trigger, observed state, failure message, recovery
action, cost tier and integrity boundary.

The minimum verification ladder is:

1. code invariants and deterministic validators;
2. representative domain evals with multiple trials where behavior is
   stochastic;
3. explicit human review for consequential or genuinely ambiguous judgments.

LLM-as-judge is an inferential sensor, not an invariant and not sole authority
for irreversible actions, user acceptance or completion.

## Candidate rules

- Never claim success unless the required durable state exists and is freshly
  verified.
- Run irreversible-action validation before the tool call.
- Detect repeated identical tool calls, stalled progress and exhausted budgets.
- Use bounded retry with backoff and circuit breaking for external systems.
- Keep a primary outcome metric together with safety, quality and integrity
  guardrails; never optimize one proxy alone.
- Treat prompt, tool schema, model, context policy and verifier changes as
  versioned harness changes that require affected regression checks.
- Build controls incrementally from observed failures and keep them removable:
  a sensor or middleware layer that no longer improves representative outcomes
  should be simplified or retired after regression comparison.
- Every recurring correction must produce a durable harness improvement or an
  explicit decision explaining why it remains a human judgment.

## Noise removed

- Promotional claims that a single framework or model makes an agent reliable.
- Unverified attribution of a four-part formal framework to OpenAI.
- Benchmark gains without harness, evaluator, version and task context.
- Advice that depends on retaining the original media transcript or identity.

## Verification required

- Calibrate inferential graders against representative human judgments.
- Recheck OpenTelemetry semantic conventions before binding production schemas.
- Re-run domain evals whenever the model, prompt, tools, context policy or
  completion verifier changes materially.

## Codex refinement required

Completed. Claims were separated into primary-source support, secondary
synthesis and provisional research evidence before promotion.

## Source links

- Primary technical references are recorded in the linked assessment and
  standard, not in this incoming signal.
- The incoming secondary source batch is retained only through anonymous source
  identifiers; raw provenance and transcript were purged.
