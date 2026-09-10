---
id: 2026-05-21-openai-codex-goals-assessment
type: assessment
status: active
created: 2026-05-21
updated: 2026-06-20
topics:
  - codex
  - goals
  - agent-harness
  - long-running-work
  - evidence-based-completion
tools:
  - Codex
  - Codex Goals
  - AGENTS.md
agent_platforms:
  - Codex
model_context:
  - Codex app and CLI builds supporting Goals
runtime_environment:
  - codex-desktop
  - codex-cli
config_surfaces:
  - thread goal state
  - AGENTS.md
  - workflows
portability: codex-native
sources:
  - https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
  - https://developers.openai.com/codex/codex-manual.md
  - https://github.com/openai/openai-cookbook/commit/9b4e6279edd4dceb6b4b7da582482a7c882f7544
related:
  intakes:
    - 00_inbox/links/2026-05-21-openai-codex-goals-intake.md
  source_notes:
    - 01_sources/notes/2026-06-20-openai-codex-goals-source-note.md
  briefs: []
  reviews: []
  decisions: []
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/codex-goals-for-long-running-agent-work.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-09
source_updated: 2026-05-13
source_version: OpenAI Cookbook page published 2026-05-09; source notebook commit 9b4e6279edd4dceb6b4b7da582482a7c882f7544 on 2026-05-13; Codex manual fetched 2026-06-20; Codex Goals available from Codex 0.128.0 according to source
retrieved: 2026-05-21
verified: 2026-06-20
valid_for: Codex builds supporting Goals from 0.128.0 onward, subject to current Codex product behavior checked on 2026-06-20
temporal_status: current
recommendation: standard
---

# Assessment: OpenAI Codex Goals

Date: 2026-05-21
Status: active
Recommendation: standard

## One-paragraph read

OpenAI's official Cookbook page describes Codex Goals as persistent, thread-scoped completion contracts for tasks where the path is uncertain but the finish line can be verified. This is a strong fit for Techscope and Agents Mother because it converts vague continuation into an auditable loop: define outcome, evidence, constraints, boundaries, iteration policy and blocked stop condition, then let Codex continue only while the Goal remains active and evidence says the task is not complete.

## Why it matters

- Techscope already runs long tasks: building agents, processing media queues, researching architectures, checking official docs and writing standards.
- These tasks often need continuation across turns without repeatedly asking "continue".
- Goals formalize the missing harness primitive: durable objective plus evidence-based completion.
- Goals should reduce premature "done" claims if used with concrete tests, reports, command outputs or artifacts.

## Technical claims

- Goals are persistent objectives in Codex that keep a thread working toward a defined outcome across turns.
- Goals are for tasks where the next step depends on what Codex learns: profiling, patching, benchmarking, flaky tests or evidence-backed research.
- Goals are thread-scoped state, not global memory and not project-level instructions.
- Continuation is conservative: Codex continues only at safe boundaries when the thread is idle, the Goal is active and no user input/work is pending.
- Completion must be evidence-based, not model belief.
- Good Goals include outcome, verification surface, constraints, boundaries, iteration policy and blocked stop condition.
- According to the source, Goals require a Codex build that supports the feature and are available starting in Codex 0.128.0.
- Current Codex manual also documents Goal mode across the Codex app, IDE extension and CLI surfaces.
- If `/goal` is not visible, the current manual documents `features.goals` in `config.toml` and `codex features enable goals` as enablement paths.
- Current CLI documentation limits goal objectives to 4,000 characters; longer operating contracts should live in a file referenced by the Goal.

## Agent environment profile

- Agent platforms: Codex.
- Model context: Codex app/CLI builds with Goals support.
- Runtime environment: Codex thread, Codex desktop/app and possibly CLI depending feature availability.
- Config surfaces: `/goal` command, thread state, AGENTS.md, workflows.
- Portability: codex-native.
- Codex adaptation: use Goals as an execution-control layer for long Codex tasks; keep durable project rules in AGENTS.md and standards.
- Environment-specific caveats: do not assume Claude Code, Gemini CLI or Cursor have equivalent goal semantics.

## Existing knowledge check

- Related existing artifacts:
  - `01_sources/signals/2026-05-17-2026-05-17-telegram-telegram-user-45-codex-desktop-cli-поддерживает-режим-копать-отсюда-до-об-signal.md`
  - `01_sources/notes/2026-06-20-openai-codex-goals-source-note.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/codex-goals-for-long-running-agent-work.md`
  - `07_workflows/agents-mother.md`
  - `07_workflows/agents-mother-roadmap.md`
- Relationship to existing knowledge: confirms and refines.
- Artifacts to mark outdated or superseded: the older Telegram-derived `/goal` verification item is resolved by official OpenAI docs and current Codex manual; the signal remains useful as history, but its uncertainty is superseded.

## Freshness check

- Official/current sources checked:
  - OpenAI Cookbook page: `https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex`
  - Current Codex manual fetched 2026-06-20: `https://developers.openai.com/codex/codex-manual.md`
  - OpenAI Cookbook source notebook commit: `9b4e6279edd4dceb6b4b7da582482a7c882f7544`
- Freshness status: current.
- Source published: 2026-05-09.
- Source updated: 2026-05-13.
- Source version: OpenAI Cookbook page published 2026-05-09; source notebook commit `9b4e6279edd4dceb6b4b7da582482a7c882f7544` on 2026-05-13; Codex manual fetched 2026-06-20; Codex Goals available from Codex 0.128.0 according to source.
- Retrieved: 2026-05-21.
- Verified: 2026-06-20.
- Valid for: Codex builds supporting Goals from 0.128.0 onward, subject to current Codex product behavior checked on 2026-06-20.
- Temporal status: current.
- Temporal compatibility with existing artifacts: compatible with Techscope's harness and Agents Mother standards; it adds a Codex-native continuation mechanism.
- Notes: recheck if Codex changes Goal command syntax, lifecycle controls, budget behavior or availability in app/CLI.

## Programming relevance

Score: 4/5

- Strong for complex implementation tasks, migrations, performance work and test-driven loops.
- Less relevant for one-off edits or simple explanations.

## Agent engineering relevance

Score: 5/5

- Directly improves harness design for long-running agent work.
- Provides a scoped alternative to vague autonomy.
- Useful for Agents Mother, FESPA26 queue refinement, Techscope memory audits and research-to-standard workflows.

## DX impact

Score: 4/5

- Reduces repeated prompting.
- Forces clearer completion criteria.
- Gives the user lifecycle controls: start, pause, resume, clear.

## Evidence quality

Score: 5/5

- Official OpenAI Cookbook source.
- Includes product semantics, examples and caveats.

## Practicality

Score: 4/5

- Easy to adopt as a workflow rule.
- Requires Codex build support.
- Requires the user/agent to write strong Goals rather than vague ones.

## Leverage

Score: 5/5

- High leverage across every Techscope long-running coding, research and agent-creation workflow.

## Risk

Score: 2/5

- Main risk is over-broad Goals causing unnecessary work.
- Another risk is treating Goal completion as truth without evidence; the source explicitly warns against this.

## Expert lenses

### Programming

Use Goals when implementation requires iterative evidence: tests, benchmarks, repro steps, generated artifacts or migration checks.

### Agent Engineering

Goals are a harness primitive: persistent objective, lifecycle state, continuation policy and evidence-based completion.

### DX

The user should not need to repeatedly say "keep going" when the finish line is clear and verifiable.

### Security

Goals do not remove boundaries. File/tool/resource permissions and project rules still apply.

### Evidence

Every Goal should name the verification surface before work begins.

### Product Pragmatism

Adopt immediately as a draft standard for complex Codex work; avoid for trivial tasks.

## Decision

Create a standard: `04_standards/codex-goals-for-long-running-agent-work.md`.

## Next artifact

standard
