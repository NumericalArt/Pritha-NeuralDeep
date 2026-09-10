---
id: 2026-05-18-hermes-goal-agent-architecture-assessment
type: assessment
status: processed
created: 2026-05-18
updated: 2026-05-18
topics: [persistent-goals, hermes-agent, codex-cli, autonomous-agents, harness-engineering, agent-orchestration, agents-mother, proactivity]
tools: [Hermes Agent, Codex CLI, Claude Code, Agent Skills, MCP, VPS, SSH, OpenRouter]
agent_platforms: [Hermes Agent, Codex, Claude Code]
model_context: [GPT-5.5, OpenAI models, OpenRouter models, model-agnostic Hermes providers]
runtime_environment: [cli, vps, ssh, messaging-gateway, codex-cli, background-agent]
config_surfaces: [slash-commands, config.yaml, skills, toolsets, mcp, gateway, OpenAI-compatible local proxy, provider-auth]
portability: adapter-needed
sources:
  - anonymous incoming video source (purged)
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/goals
  - https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16
  - https://github.com/openai/codex/releases/tag/rust-v0.128.0
  - https://developers.openai.com/codex/cli
related:
  intakes:
    - 00_inbox/links/2026-05-18-youtube-hermes-goal-insane-intake.md
  notes:
    - 01_sources/notes/2026-05-18-hermes-goal-youtube-source-note.md
  briefs:
    - 02_briefs/2026-05-18-hermes-goal-autonomous-workflow-brief.md
    - 02_briefs/2026-05-17-hermes-agent-architecture-brief.md
  reviews:
    - 03_reviews/2026-05-17-hermes-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-environment-compatibility.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-16
source_updated: unknown
source_version: Hermes Agent v0.14.0 / v2026.5.16; Codex CLI 0.128.0
retrieved: 2026-05-18
verified: 2026-05-18
valid_for: persistent goal-loop design snapshot as of 2026-05-18
temporal_status: version-bound
recommendation: experiment
---

# Assessment: Hermes `/goal` as a long-running agent harness pattern

Date: 2026-05-18
Status: processed
Recommendation: experiment

## One-paragraph read

This is genuinely useful for Techscope, but the value is not the video's hype. The durable insight is that long-running autonomy needs a goal contract: explicit objective, acceptance criteria, independent judge, bounded continuation, pause/resume controls, subgoals, persistence, logs and post-run verification. That pattern should influence Agents Mother. Hermes itself remains an experiment candidate, not a default runtime.

## Why it matters

Agents Mother is moving toward creating and operating real agents. Once agents can deploy services, run Telegram/web interfaces and perform proactive work, "just keep going" becomes dangerous. A persistent goal loop gives autonomy a harness: it tells the agent what success means, how long it may try, when it must stop and how the user can steer it.

## Technical claims

- Persistent goals are stronger than prompt-only loops because the objective is stored and reused across turns.
- The judge/evaluator should be logically separate from the executor.
- Turn budget and pause/resume controls are not nice-to-have; they are required safety controls.
- Subgoals are a useful mid-run steering mechanism.
- Goals need concrete acceptance criteria, not "make it good" objectives.
- Orchestrator/worker setups such as Hermes-as-CEO / Codex-as-CTO can be useful if each worker has a scoped contract, isolated workspace and verification gate.

## Agent environment profile

- Agent platforms: Hermes Agent, Codex, Claude Code.
- Model context: GPT-5.5 and other OpenAI models; OpenRouter/Hermes provider routing; auxiliary judge model.
- Runtime environment: CLI, VPS/SSH, messaging gateway, Codex CLI worker, background execution.
- Config surfaces: slash commands, `config.yaml`, skills, toolsets, MCP, gateway, provider auth.
- Portability: adapter-needed.
- Codex adaptation:
  - Implement Techscope-native goal contracts in Markdown and scripts first.
  - Map `/goal` to `goal-contract + run log + evaluator report`, not to a blind always-on loop.
  - Keep source of truth in Techscope artifacts, not Hermes memory.
- Environment-specific caveats:
  - Hermes `/goal`, `/subgoal`, SessionDB persistence and gateway FIFO continuation are Hermes-specific.
  - Codex CLI `/goal` lifecycle comes from Codex CLI release behavior and may differ from Codex Desktop or this current Codex app thread.
  - Claude Code examples in the video are anecdotal unless separately verified.

## Existing knowledge check

- Related existing artifacts:
  - `03_reviews/2026-05-17-hermes-agent-architecture-assessment.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-environment-compatibility.md`
- Relationship to existing knowledge: refines.
- Artifacts to mark outdated or superseded: none.

## Freshness check

- Official/current sources checked:
  - Hermes official goal docs
  - Hermes v0.14.0 / v2026.5.16 release notes
  - OpenAI Codex CLI 0.128.0 release notes
  - OpenAI Codex CLI docs
- Freshness status: current.
- Source published: 2026-05-16.
- Source updated: unknown.
- Source version: Hermes Agent v0.14.0 / v2026.5.16; Codex CLI 0.128.0.
- Retrieved: 2026-05-18.
- Verified: 2026-05-18.
- Valid for: persistent goal-loop design snapshot as of 2026-05-18.
- Temporal status: version-bound.
- Temporal compatibility with existing artifacts: compatible with 2026-05-17 Hermes architecture snapshot; adds a more specific goal-loop mechanism.
- Notes: exact CLI behavior should be rechecked immediately before hands-on implementation.

## Programming relevance

Score: 5/5

Persistent goals directly affect coding-agent workflows: refactors, migration tasks, test repair, data backfills, E2E testing and multi-step project generation.

## Agent engineering relevance

Score: 5/5

This is core agent harness design: bounded autonomy, evaluator separation, progress state, persistence, user preemption and stop conditions.

## DX impact

Score: 4/5

Good goal contracts can make long tasks easier to hand off. Bad goal contracts can create opaque runaway work. DX depends on status visibility and concise logs.

## Evidence quality

Score: 4/5

The video is secondary and promotional, but the core mechanism is confirmed by official Hermes docs and Codex release notes. Adoption and business-impact claims remain weak evidence.

## Practicality

Score: 4/5

Practical to implement as a Techscope-native contract and review workflow now. Direct Hermes/Codex nested orchestration needs sandbox testing first.

## Leverage

Score: 5/5

High leverage for Agents Mother: goal contracts can become the control surface for deployment, proactive work, test loops, research tasks and post-creation improvement.

## Risk

Score: 5/5

High if connected to real secrets, production services, Telegram gateways or paid APIs without budgets and approvals. Long-running agents multiply small mistakes.

## Expert lenses

### Programming

Best immediate use cases: test repair loops, migration with acceptance tests, scaffold completion, deployment smoke checks and post-creation review. Avoid vague app-generation goals without tests.

### Agent Engineering

Add a first-class goal object with fields for objective, acceptance criteria, budget, allowed tools, disallowed actions, current state, artifacts, evaluator verdict and next action.

### DX

Users need short status summaries, not raw loop logs. Telegram responses should say what changed, what passed, what failed and what needs approval.

### Security

Require explicit permissions, budget, rollback plan and secret boundaries. Prohibit autonomous external outreach, purchases, account changes or destructive shell operations unless a specific contract grants them.

### Evidence

Separate confirmed product capabilities from video anecdotes. The confirmed items are enough for an experiment, not enough for a standard.

### Product Pragmatism

Implement the smallest useful slice in Techscope first: contract templates and logs. Run Hermes only after we know exactly what we want to measure.

## Decision

Create an experiment track for Techscope persistent goal contracts. Do not make Hermes `/goal` a production dependency yet.

## Next artifact

experiment
