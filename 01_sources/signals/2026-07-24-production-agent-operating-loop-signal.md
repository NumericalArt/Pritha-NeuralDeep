---
id: 2026-07-24-production-agent-operating-loop-signal
type: signal
status: refined
created: 2026-07-24
updated: 2026-07-24
topics:
  - production-agents
  - long-running-agents
  - agent-harness
  - trajectory-security
  - evidence-based-completion
  - multi-agent-orchestration
  - specification-management
  - outcome-economics
tools:
  - Pritha
  - Codex
  - Git worktree
  - Agent Skills
  - MCP
sources:
  - source-6294b317-9576-41d5-9b79-c93701227700
related:
  intakes:
    - 00_inbox/texts/2026-07-24-production-agent-operating-layer-intake.md
  assessments:
    - 03_reviews/2026-07-24-production-agent-operating-layer-assessment.md
  standards:
    - 04_standards/agent-trajectory-control-and-evidence.md
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-untrusted-input-security.md
source_type: text
source_class: mixed
ingested_at: 2026-07-24T11:41:47Z
processed_at: 2026-07-24T11:41:47Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-6294b317-9576-41d5-9b79-c93701227700
generated_from:
  - source-6294b317-9576-41d5-9b79-c93701227700
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: pritha
  id: production-agent-operating-layer
privacy: anonymized
retention: durable
review_status: verified
confidence: high
---

# Signal: Production Agent Operating Loop

Date: 2026-07-24
Status: refined
Source class: mixed text synthesis
Retention: source-purged

## Core Signal

The useful unit of production-agent design is no longer one model response or
one tool call. It is a controlled run:

```text
trigger → versioned task contract → runtime route → isolated executor
        → trajectory monitor → deterministic checks → independent verifier
        → human gate for irreversible effects → evidence and incident feedback
```

Model quality still matters, but durable value accumulates in the harness:
tools, permissions, state, isolation, tests, observability, recovery and
execution evidence.

## Confirmed Patterns

- Long-running and event-driven work needs durable task state outside model
  context, explicit pause/stop behavior and run history.
- Prompts, skills and task specifications behave like build artifacts: modular,
  versioned, statically checked and reviewed before promotion.
- Per-action allowlists are necessary but insufficient. A sequence of
  individually plausible actions can form an unsafe trajectory.
- Parallel agents are useful only with isolated mutable state and a separate
  verification path. A Git worktree isolates files and branches, not ports,
  credentials, databases, caches or external side effects.
- The executor must not be the only authority declaring completion.
- Cost should be measured per accepted result, including retries, human review,
  infrastructure, latency, rollback and risk.
- A local open-weight route can be a privacy and incident-response capability,
  but only after task-specific evals and an isolation/no-egress plan.

## Pritha Implications

- Keep existing scheduling, runtime-placement, team and eval standards.
- Add a cross-cutting trajectory-control standard rather than a new default
  agent runtime.
- Require a versioned run contract for long-running, proactive, parallel or
  externally acting child agents.
- Log plan revisions, permission changes, network destinations, side effects,
  public-artifact attempts, human decisions and final evidence without storing
  secrets or private chain-of-thought.
- Turn real failures into redacted incident-derived eval fixtures.
- Preserve small, contract-selected teams. Do not make a fleet orchestrator a
  default dependency.

## External Project Signal

- Study Grok Build as an open reference implementation, not as a community
  dependency: its public repository is periodically synchronized from an
  internal monorepo and does not accept external pull requests.
- Treat Orca, Herdr and Agent Orchestrator as evidence for the worktree and
  feedback-loop pattern. Evaluate only if Pritha needs their operator UX.
- Treat Kimi Code as an alternative harness reference with substantial overlap
  with Pritha's existing CLI, skills, hooks, MCP and subagent surfaces.
- Treat Gutcheck's mutation gate as a promising verification experiment, not
  proof of production readiness.
- Treat Agents-A1-4B as a lab candidate. Its long-horizon scores are
  first-party claims and need Pritha-specific evaluation.
- Do not classify Kimi K3 as independently inspectable open weights until the
  weights, license, model card and reproducible evaluations are available.

## Candidate Rule

An agent may claim completion only when its run contract is satisfied and an
evidence surface independent of the executor supports the claim. High-impact
external actions additionally require an immutable human or policy gate.

## Noise Removed

Vendor benchmark rankings, volatile star counts, anecdotal productivity
multipliers and unenumerated social-network sentiment were not promoted into
durable conclusions.
