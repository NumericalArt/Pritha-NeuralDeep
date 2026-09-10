---
id: 2026-05-18-hermes-goal-autonomous-workflow-brief
type: brief
status: processed
created: 2026-05-18
updated: 2026-05-18
topics: [persistent-goals, hermes-agent, codex-cli, autonomous-agents, agent-orchestration, harness-engineering, agents-mother]
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
  reviews:
    - 03_reviews/2026-05-18-hermes-goal-agent-architecture-assessment.md
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
---

# Brief: Hermes `/goal` and persistent autonomous workflows

Date: 2026-05-18
Source: YouTube walkthrough plus official Hermes and Codex release/docs checks
Status: processed

## Summary

The useful idea in the video is persistent goal execution: a long-running agent loop bound to a measurable objective, monitored by a judge/evaluator, constrained by a budget and controlled with pause/resume/clear plus mid-run subgoals. This is a direct harness-engineering pattern for Techscope and Agents Mother.

The noisy parts are the hype, hosting sponsorship, adoption claims and business anecdotes. They should not drive decisions. The architecture signal is still strong because official Hermes docs and Codex release notes confirm the core mechanism.

## Key claims

- Hermes `/goal` keeps an objective alive across turns until achieved, paused, cleared or budget-limited.
- Hermes uses a judge model to decide whether to continue or stop.
- Hermes supports user steering during an active goal, including `/subgoal` as extra success criteria.
- Codex CLI 0.128.0 added persisted `/goal` workflows; Hermes docs explicitly credit the user-facing idea while claiming an independent Hermes implementation.
- Good goals require verifiable outcomes: passing tests, created files, committed repos, completed data backfill, contacted leads, or another concrete stop rule.
- Hermes-as-CEO / Codex-as-CTO is best understood as orchestrator/worker delegation, not as a literal management hierarchy.

## Agent environment profile

- Agent platforms: Hermes Agent, Codex, Claude Code.
- Model context: OpenAI/Codex models, OpenRouter-routed models, Hermes auxiliary judge model.
- Runtime environment: CLI, VPS/SSH, messaging gateway, Codex CLI worker runtime, long-running background loop.
- Config surfaces: slash commands, `config.yaml`, skills, toolsets, MCP, provider auth, gateway, local proxy.
- Portability: adapter-needed. The concept is portable; exact commands and persistence behavior are platform-specific.

## Evidence

- Hermes official docs describe persistent `/goal`, continuation, turn budget, user message preemption, persistence and judge configuration.
- Hermes v0.14.0 release notes include `/subgoal` and goal-loop changes.
- Codex CLI 0.128.0 release notes include persisted `/goal` workflows, app-server APIs, model tools, runtime continuation and TUI controls.
- OpenAI Codex CLI docs confirm Codex CLI's local terminal-agent model and authentication surface.
- The YouTube video demonstrates workflow usage but is secondary evidence and includes marketing content.

## Existing knowledge and freshness

- Related existing artifacts:
  - `01_sources/notes/2026-05-17-hermes-agent-source-note.md`
  - `02_briefs/2026-05-17-hermes-agent-architecture-brief.md`
  - `03_reviews/2026-05-17-hermes-agent-architecture-assessment.md`
  - `04_standards/agent-creation-harness.md`
  - `04_standards/agent-environment-compatibility.md`
- Relationship to existing knowledge: refines.
- Official/current sources checked:
  - Hermes goal docs
  - Hermes v0.14.0 release notes
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
- Artifacts to mark outdated or superseded: none.

## Risks and caveats

- Long-running goals can burn tokens, spend API credits, make unsafe external changes or drift into poorly scoped work.
- A judge model is useful but not authoritative; it can false-positive or false-negative completion.
- Mid-run steering is useful but can mutate the original task contract unless logged.
- Delegating to Codex workers from Hermes needs workspace isolation, permissions, logs and independent verification.
- Any gateway/messaging use must have user allowlists, command approval and secret redaction.
- Exact `/goal` availability and command behavior can change quickly; recheck before implementation.

## Recommendation

Treat persistent goals as a high-value architecture pattern for Techscope and Agents Mother. Do not adopt Hermes as the main runtime yet. Add an experimental Techscope pattern: `goal contract -> bounded execution loop -> independent evaluation -> logged result -> post-run review`.

## Next step

Create an experiment plan for Techscope-native goal contracts before testing Hermes itself:

- define a Markdown `agent-goal-contract` template;
- add a non-autostart `goal plan/status/log` CLI surface to Agents Mother;
- require acceptance criteria, budget, permissions, deployment target and rollback plan;
- use Codex thread execution manually at first;
- only later test Hermes `/goal` in an isolated sandbox.
