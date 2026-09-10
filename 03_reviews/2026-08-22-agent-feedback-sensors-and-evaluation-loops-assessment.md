---
id: 2026-08-22-agent-feedback-sensors-and-evaluation-loops-assessment
type: assessment
status: reviewed
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
agent_platforms:
  - Codex
  - portable-agent-harnesses
model_context:
  - mixed
runtime_environment:
  - codex-desktop
  - codex-cli
  - api
  - local-model
config_surfaces:
  - AGENTS.md
  - agent-contract
  - eval-suite
  - validators
  - telemetry
portability: portable
sources:
  - 01_sources/signals/2026-08-22-agent-feedback-sensors-and-evaluation-loops-signal.md
  - https://mitchellh.com/writing/my-ai-adoption-journey
  - https://openai.com/index/harness-engineering/
  - https://martinfowler.com/articles/harness-engineering.html
  - https://www.martinfowler.com/articles/sensors-for-coding-agents.html
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
  - https://github.com/karpathy/autoresearch/blob/master/program.md
  - https://opentelemetry.io/blog/2026/genai-observability/
  - https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
  - https://arxiv.org/abs/2604.25850
  - https://arxiv.org/abs/2605.13357
related:
  intakes: []
  briefs:
    - 02_briefs/2026-05-15-harness-engineering-codex-agents-brief.md
  reviews:
    - 03_reviews/2026-06-02-agent-harness-engineering-source-batch-review.md
    - 03_reviews/2026-05-31-openai-harness-engineering-agent-readable-repo-assessment.md
  decisions:
    - 05_decisions/2026-08-16-outcome-driven-agent-delivery.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-feedback-sensors-and-evaluation-loops.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: pattern
  id: agent-feedback-sensors-and-evaluation-loops
privacy: public
retention: durable
review_status: reviewed
confidence: high
freshness_status: current
source_published: 2025-11-26 to 2026-05-27
source_updated: 2026-05-27
source_version: primary-source synthesis verified 2026-08-22
retrieved: 2026-08-22
verified: 2026-08-22
valid_for: Pritha child-agent design and harness evolution
temporal_status: current
recommendation: standard
---

# Assessment: Agent Feedback Sensors and Evaluation Loops

Date: 2026-08-22
Status: reviewed
Recommendation: standard

## One-paragraph read

Adopt the pattern as a dedicated Pritha standard. Existing standards already
require outcome-bound Trials, traces and deterministic fixes, but they do not
give Agents Mother one explicit algorithm for sensor placement, verification
layers, rapid iteration and conversion of incidents into cheaper enforcement.
Primary sources strongly support that missing layer. Recent papers add useful
taxonomies and reported gains, but remain provisional evidence rather than the
authority for the standard.

## Why it matters

Agent failures often come from the harness rather than from raw model
capability: the agent cannot see that it is wrong, can rewrite the evaluator,
repeats an ineffective action, reports success without durable state, or
receives feedback too late. A reusable sensor design lets Pritha turn these
failure modes into contract fields, executable checks and measurable learning
loops for every new agent.

## Technical claims

- Guides and sensors are complementary feedforward and feedback controls.
- Fast deterministic sensors should precede slower semantic or human review.
- Final-state and artifact grading is stronger than grading the final message.
- Stochastic behavior requires multiple trials and a distribution of results.
- Production traces must connect model calls, tool calls, state changes and the
  final outcome for useful failure attribution.
- A locked evaluator boundary prevents reward hacking and false completion.
- One bounded change per loop makes causal attribution and rollback practical.

## Agent environment profile

- Agent platforms: Codex-native first, portable across agent harnesses.
- Model context: model-independent; thresholds and prompt/tool fit are
  version-bound.
- Runtime environment: local, CLI, API service or hybrid.
- Config surfaces: contract, Outcome Spec, validators, tests, eval suite,
  traces, runtime metrics and human approval evidence.
- Portability: portable.
- Codex adaptation: encode the sensor map in the project contract, implement
  host-run checks, and keep protected verifier inputs outside executor writes.
- Environment-specific caveats: hook names, trace schemas and tool permissions
  vary; preserve the control intent rather than copying platform syntax.

## Existing knowledge check

- Related existing artifacts: agent creation harness, harness evaluation,
  trajectory control and outcome-driven delivery.
- Relationship to existing knowledge: refines and operationalizes.
- Artifacts to mark outdated or superseded: none.

## Techscope adoption check

- Techscope/Agents Mother fit: adopt.
- Why: it turns recurring agent feedback into a repeatable design gate.
- Implementation cost: medium.
- Operational complexity: medium; low for deterministic local checks, higher
  for production telemetry and calibrated semantic graders.
- Current architecture impact: additive Markdown contract and workflow layer;
  no runtime activation or background service is implied.
- Freshness/technology timing: core practices are stable; specific telemetry
  schemas and vendor eval products remain version-bound.
- Decision: create a portable standard and workflow, then require a sensor map
  in future agent contracts.

## Evidence quality and qualification

- Official engineering articles and documentation directly support the core
  practices: fast agent-readable checks, final-state grading, multiple grader
  types, trace observability and durable handoff state.
- The `constrain, inform, verify, correct` grouping is a useful synthesis, not a
  formal OpenAI taxonomy found in the official harness article.
- Recent arXiv work on harness observability and runtime responsibilities is
  directionally consistent but not treated as settled standard evidence.
- The incoming commercial secondary guide is useful for incremental constraint
  building and removable, model-adaptive harness layers. Its named frameworks,
  organizational anecdotes, time estimates and benchmark claims are not used
  as authority without their primary evidence.
- Reported benchmark improvements are not portable without task, model,
  harness, evaluator and version context.

## Expert lenses

- Architecture: place sensors at control boundaries and keep evaluator state
  independent from mutable execution state.
- Security: validate consequential actions before execution; protect fixtures,
  approvals and completion evidence from agent writes.
- Developer experience: make failures concise, local and actionable, with the
  exact remediation when it can be stated safely.
- Product pragmatism: start with 20–50 representative tasks only when scale
  warrants it; small agents may begin with a few critical Trials and invariants.
- Standards: separate universal rules from project-specific thresholds and
  stochastic graders.

## Risks and trade-offs

- Excessive sensors can slow the loop and create noisy failures. Order them by
  cost and scope; run the cheapest applicable checks first.
- Harness controls can outlive the model weakness that motivated them. Version
  their rationale and periodically test whether simplification preserves the
  outcome and guardrails.
- Agent-generated tests can encode the same misunderstanding as the code. Use
  protected fixtures, hidden checks, mutation tests or human calibration where
  correctness is difficult to state.
- Single-metric optimization invites gaming. Pair the primary outcome with
  safety, quality, cost and integrity guardrails.
- Full prompt or transcript capture can expose private data. Prefer bounded,
  redacted event fields and explicit retention policies.

## Freshness check

- Official/current sources checked: OpenAI, Anthropic, Thoughtworks/Martin
  Fowler, OpenTelemetry and the referenced public repository program.
- Freshness status: current.
- Source published: 2025-11-26 to 2026-05-27.
- Source updated: 2026-05-27.
- Source version: primary-source synthesis verified 2026-08-22.
- Retrieved: 2026-08-22.
- Verified: 2026-08-22.
- Valid for: Pritha child-agent design and harness evolution.
- Temporal status: current.
- Temporal compatibility with existing artifacts: compatible and additive.
