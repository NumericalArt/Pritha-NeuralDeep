---
id: 2026-06-20-agent-loop-design-assessment
type: assessment
status: active
created: 2026-06-20
updated: 2026-06-20
topics:
  - agent-loops
  - loop-engineering
  - proactivity
  - scheduling
  - goal-loops
  - subagents
  - skills
  - worktrees
  - state-tracking
tools:
  - Codex
  - Claude Code
  - OpenClaw
  - Agent Skills
  - MCP
  - Git worktree
sources:
  - 00_inbox/links/2026-06-20-youtube-ai-agent-loops-claude-code-codex-intake.md
  - 00_inbox/links/2026-06-20-addy-osmani-loop-engineering-intake.md
  - 01_sources/notes/2026-06-20-ai-agent-loops-video-source-note.md
  - 01_sources/notes/2026-06-20-addy-osmani-loop-engineering-source-note.md
  - https://developers.openai.com/codex/codex-manual.md
  - https://docs.anthropic.com/en/docs/claude-code/overview
  - https://docs.anthropic.com/en/docs/claude-code/hooks-guide
  - https://docs.anthropic.com/en/docs/claude-code/skills
related:
  intakes:
    - 00_inbox/links/2026-06-20-youtube-ai-agent-loops-claude-code-codex-intake.md
    - 00_inbox/links/2026-06-20-addy-osmani-loop-engineering-intake.md
  source_notes:
    - 01_sources/notes/2026-06-20-ai-agent-loops-video-source-note.md
    - 01_sources/notes/2026-06-20-addy-osmani-loop-engineering-source-note.md
  signals:
    - 01_sources/signals/2026-06-20-agent-loop-design-source-batch-signal.md
  standards:
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/codex-goals-for-long-running-agent-work.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-skill-pack-lifecycle.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-07 to 2026-06-17
source_updated: 2026-06-20
source_version: Addy Osmani article 2026-06-07; How I AI video 2026-06-17 locally transcribed on 2026-06-20; Codex manual and Claude Code docs checked 2026-06-20
retrieved: 2026-06-20
verified: 2026-06-20
valid_for: Pritha loop design and child-agent proactivity policy as of 2026-06-20
temporal_status: current
recommendation: standard-update
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: assessment
  id: agent-loop-design
privacy: public
retention: durable
review_status: active
confidence: high
---

# Assessment: Agent Loop Design

Date: 2026-06-20
Status: active
Recommendation: standard-update

## One-paragraph read

The sources refine, but do not overturn, Pritha's existing scheduling policy. Loops should be treated as automated prompting systems with explicit triggers, state, tools, isolation, verifier roles, budgets and stop rules. The useful delta is a loop preflight checklist for Pritha child-agent contracts. The wrong takeaway would be to enable cron, heartbeat or goal loops by default.

## Why it matters

- Pritha already creates agents that may eventually need reports, queue cleanup, PR review, source processing and skill maintenance.
- Loop features in Codex and Claude Code make scheduled and goal-based work easier to create, which also makes accidental background autonomy easier.
- The video shows realistic product/engineering loops; the article explains the design layer above the individual agent harness.
- The risks map directly to existing Pritha concerns: hidden cost, untrusted input, notification spam, memory pollution, stale skills and comprehension debt.

## Technical claims

- Loop types should be separated: heartbeat, cron/scheduled, hook/event and goal loop.
- Effective loops need five support layers: worktree/isolation, skills, plugins/connectors, subagents and state tracking.
- Codex docs confirm automations, worktree selection for Git repositories, skills inside automations, `/goal` and subagents when explicitly requested.
- Claude Code docs confirm scheduled/routine workflows, `/loop`, hooks and skills; exact UI behavior should be treated as version-bound.
- Subagents are valuable for maker/checker separation and bounded parallel exploration, but they increase token use.
- Goal loops require measurable completion criteria; weak criteria produce runaway cost and low-quality output.

## Agent environment profile

- Agent platforms: Codex, Claude Code, OpenClaw as concept source.
- Model context: coding agents with automations, skills, connectors, subagents and goal loops.
- Runtime environment: local app/CLI, cloud routines, background worktrees, Git repositories, connected services.
- Config surfaces: Codex automations, `/goal`, skills, MCP/plugins, subagents; Claude routines/scheduled tasks, `/loop`, hooks and skills.
- Portability: adapter-needed.
- Codex adaptation: use Codex-native automations/goals/skills/subagents where available, but keep Pritha canonical policy in `04_standards/` and child-agent contracts.
- Environment-specific caveats: Claude Code hooks/routines and Codex automations/goals are not identical; do not copy prompts or UI steps without mapping runtime semantics.

## Existing knowledge check

- Related existing artifacts:
  - `04_standards/agent-proactivity-scheduling.md`
  - `04_standards/codex-goals-for-long-running-agent-work.md`
  - `04_standards/agent-team-operating-model.md`
  - `04_standards/agent-skill-pack-lifecycle.md`
  - `04_standards/agent-environment-compatibility.md`
- Relationship to existing knowledge: confirms and refines.
- Artifacts to mark outdated or superseded: none.

## Techscope adoption check

- Techscope/Agents Mother fit: adopt as standard update.
- Why: the loop preflight checklist closes a gap between high-level scheduling policy and concrete loop design.
- Implementation cost: low for standards/templates; medium if added to scaffold validation.
- Operational complexity: medium because real loops need connectors, auth, run logs, notification policy and kill switch.
- Current architecture impact: update `agent-proactivity-scheduling`; do not enable any background loop.
- Freshness/technology timing: current as of 2026-06-20, but Codex/Claude loop surfaces are moving quickly.
- Decision: update standard now; defer implementation automation.

## Risks and caveats

- Token/cost runaway from broad recurring loops or goal loops with weak stop criteria.
- Hidden autonomy: a loop can mutate files, send messages or update tickets without enough operator visibility.
- Connector risk: GitHub, Slack, Linear, Google and internal tools need scoped auth and audit.
- Comprehension debt: recurring loops can produce code or state changes faster than the user understands them.
- Version drift: video UI details and cross-tool parity claims may age quickly.
- Raw ASR transcript is secondary evidence and may contain recognition errors; conclusions are based on curated review, not verbatim transcript.

## Expert lenses

### Programming

Use loops for tasks with repeatable verification: PR readiness, CI triage, smoke-test maintenance, skill validation and source backlog cleanup. Keep write-heavy loops isolated in worktrees and require reviewable diffs.

### Agent Engineering

The key design artifact is a loop contract: trigger, schedule, state, tools, skill pack, subagent policy, verifier, budget and stop rule.

### DX

Good loops remove repetitive babysitting. Bad loops create noisy inboxes, mysterious branches and hard-to-debug cost spikes.

### Security

Every loop with connectors is a permission boundary. Background tool use needs sandbox, allowlist, log and kill switch.

### Evidence

The video is useful demonstration evidence; the Addy article is expert commentary; Codex and Claude docs are primary evidence for product capabilities.

### Product Pragmatism

Adopt the preflight checklist now. Build real loops only after a manual run proves value and the user explicitly selects the proactivity mode.

## Decision

Update `04_standards/agent-proactivity-scheduling.md` with loop preflight requirements and comprehension-debt warning.

## Next artifact

standard-update
