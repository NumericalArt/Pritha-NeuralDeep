---
id: 2026-06-02-agent-harness-engineering-source-batch-review
type: review
status: draft
created: 2026-06-02
updated: 2026-06-02
topics:
  - harness-engineering
  - agent-evals
  - long-running-agents
  - coding-agents
  - agent-operations
  - code-as-harness
  - pritha
tools:
  - Codex
  - Claude Agent SDK
  - LangChain
  - Cursor
  - arXiv
sources:
  - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://openai.com/index/unrolling-the-codex-agent-loop/
  - https://openai.com/index/harness-engineering/
  - https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering
  - https://www.langchain.com/blog/the-anatomy-of-an-agent-harness
  - https://arxiv.org/abs/2603.28052
  - https://martinfowler.com/articles/harness-engineering.html
  - https://cursor.com/blog/continually-improving-agent-harness
  - https://arxiv.org/abs/2605.18747
related:
  signals:
    - 01_sources/signals/2026-06-02-agent-harness-engineering-source-batch-signal.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-harness-evaluation.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-tool-integration-selection.md
supersedes: []
superseded_by: []
source_type: article
source_class: mixed
ingested_at: 2026-06-02
processed_at: 2026-06-02T00:00:00Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-harness-batch-2026-06-02
recommendation: standard
freshness_status: current
source_published: 2025-11-26 to 2026-05-18
source_updated: mixed
source_version: official source batch verified 2026-06-02
retrieved: 2026-06-02
verified: 2026-06-02
valid_for: Pritha harness, eval and child-agent scaffold design
temporal_status: current
---

# Review: Agent Harness Engineering Source Batch

Date: 2026-06-02
Status: draft
Recommendation: standard

## One-Paragraph Read

This batch is highly useful for Pritha, but mostly as consolidation and
refinement. It confirms that harness quality, not only model choice, determines
agent reliability. The portable knowledge is lifecycle-shaped: durable
handoffs, agent-readable repositories, outcome-based evals, trace mining,
self-verification, feedback sensors, per-model harness tuning and sandboxed code
execution. Specific frameworks and benchmark rankings should remain evidence,
not defaults.

## Source Verdicts

| Date | Source | Verdict | Pritha fit |
| --- | --- | --- | --- |
| 2025-11-26 | Anthropic: Effective harnesses for long-running agents | adopt | Long-running scaffold handoff pattern: initializer, feature list, progress log, git history, init script, clean-state session endings. |
| 2026-01-09 | Anthropic: Demystifying evals for AI agents | adopt | Strongest eval vocabulary: task, trial, grader, transcript/trace, outcome, suite, eval harness vs agent harness. |
| 2026-01-23 | OpenAI: Unrolling the Codex agent loop | adopt | Codex-specific mechanics for prompt construction, tools, AGENTS.md, skills, compaction and cache-sensitive context ordering. |
| 2026-02-11 | OpenAI: Harness engineering | already adopted, refine | Confirms agent-readable repo, durable docs/checks/observability; already in Pritha memory. |
| 2026-02-17 | LangChain: Improving Deep Agents | adopt with caveat | Trace-driven harness improvement, self-verification middleware and loop detection; keep framework-specific claims non-default. |
| 2026-03-10 | LangChain: Anatomy of an Agent Harness | adopt as map | Useful taxonomy: model + harness, filesystem, sandbox, tools, memory/search, compaction, skills, hooks, subagents. |
| 2026-03-30 | arXiv: Meta-Harness | experiment/watch | Formalizes harness code as optimization target; do not automate Pritha harness mutation without curator/evals. |
| 2026-04-02 | Martin Fowler/Thoughtworks: Harness engineering for coding agent users | adopt | Best team mental model: feedforward guides, feedback sensors, computational vs inferential controls, maintainability/architecture/behavior harnesses. |
| 2026-04-30 | Cursor: Continually improving our agent harness | adopt with caveat | Production improvement loop: offline/online evals, keep-rate, tool error taxonomy, per-model baselines, model-specific harness tuning. |
| 2026-05-18 | arXiv: Code as Agent Harness | watch/adopt as map | Broad survey framing code as substrate for reasoning/actions/memory/verification; too broad for direct scaffold defaults. |

## Consolidated Patterns

### Long-Running Handoff

Long-running agents fail when each context window starts cold or when the agent
tries to complete too much at once. The portable pattern is to initialize the
project with:

- structured feature/task list;
- progress log;
- git commit history;
- init/run script;
- basic health or smoke test;
- instruction to make one bounded increment;
- clean-state handoff at the end of every session.

### Outcome-Based Evals

Agent evals should grade final environment state, not only text. A task can have
multiple trials, graders and assertions. A transcript/trace records the path,
but the outcome is the state after the run. This maps well to Pritha scaffold
reports, smoke tests, healthchecks and hidden graders.

### Trace-Driven Improvement

Harness changes should be driven by traces and failure taxonomy:

- tool-call errors;
- timeout or loop patterns;
- missing context;
- early stopping;
- skipped verification;
- model/provider-specific tool mistakes;
- user correction signals.

Repeated failures should become rules, tests, skills, middleware, status
commands or scaffold changes.

### Feedforward And Feedback

Pritha should distinguish:

- feedforward guides: AGENTS.md, standards, skills, architecture docs,
  constraints, examples;
- feedback sensors: tests, linters, type checks, browser checks, logs, traces,
  review agents, runtime metrics.

Computational controls are deterministic and cheap. Inferential controls are
semantic, slower and probabilistic. Use both, but keep human judgment for
behavioral correctness where automated signals are weak.

### Model-Specific Harness Tuning

Different models may prefer different tool formats, prompt styles, context
management and verification loops. Pritha should record harness/model
compatibility as version-bound evidence and avoid assuming one scaffold is
optimal for every model.

### Code As Harness

Code, scripts, filesystem state, tests, sandboxes, tools and logs are not just
implementation details. They are the substrate through which agents reason,
act, remember and verify. This supports Pritha's Markdown-plus-scripts design,
but code execution must remain bounded by sandbox and approval policy.

## Relationship To Existing Memory

- Confirms `agent-creation-harness`.
- Strengthens `agent-harness-evaluation`.
- Refines `agent-runtime-placement` and `agent-tool-integration-selection`.
- Compatible with recent MCP/skills lifecycle work.
- Does not supersede existing OpenAI harness assessment; it adds a wider
  multi-source synthesis.

## Techscope Adoption Check

- Techscope/Agents Mother fit: adopt.
- Implementation cost: low for standards updates, medium for scaffold support,
  high for automated harness optimization.
- Operational complexity: medium.
- Current architecture impact: add review vocabulary and optional modules, not
  mandatory heavy machinery.
- Decision: update standards now; defer code-level tools until a child-agent
  scaffold needs them.

## Promotion Guidance

Promote as principles:

- durable handoff artifacts;
- environment-state evals;
- trace-driven harness improvement;
- computational/inferential guide/sensor split;
- model-specific harness compatibility;
- sandboxed code-as-harness.

Do not promote as defaults:

- any single vendor framework;
- leaderboard/benchmark rankings;
- automated harness self-mutation;
- broad subagent teams;
- unbounded code execution.

## Next Steps

- Update `agent-creation-harness` with long-running handoff and guide/sensor
  vocabulary.
- Update `agent-harness-evaluation` with Anthropic eval terms and trace-driven
  improvement.
- Add a future Pritha scaffold option for `long-running-agent` only when a
  contract selects long-horizon work.
