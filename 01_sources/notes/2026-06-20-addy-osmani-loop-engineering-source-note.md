---
id: 2026-06-20-addy-osmani-loop-engineering-source-note
type: source-note
status: processed
created: 2026-06-20
updated: 2026-06-20
topics:
  - loop-engineering
  - agent-loops
  - coding-agents
  - automation
  - worktrees
  - skills
  - connectors
  - subagents
  - state-tracking
  - verification
tools:
  - Codex
  - Claude Code
  - Agent Skills
  - MCP
  - Git worktree
sources:
  - source-8d01cbd3-72d9-4c00-bf48-9e0fcd86c840
related:
  intakes:
    - 00_inbox/links/2026-06-20-addy-osmani-loop-engineering-intake.md
  signals:
    - 01_sources/signals/2026-06-20-agent-loop-design-source-batch-signal.md
  assessments:
    - 03_reviews/2026-06-20-agent-loop-design-assessment.md
  standards:
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/agent-environment-compatibility.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-skill-pack-lifecycle.md
source_type: article
source_class: article
ingested_at: 2026-06-20T00:00:00-07:00
processed_at: 2026-06-20T00:00:00-07:00
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-8d01cbd3-72d9-4c00-bf48-9e0fcd86c840
agent_platforms:
  - Codex
  - Claude Code
model_context:
  - coding agents with automations, skills, connectors, subagents and goal loops
runtime_environment:
  - codex-app
  - claude-code
  - git-worktree
  - scheduled-automation
config_surfaces:
  - automations
  - /goal
  - skills
  - MCP connectors
  - subagents
  - hooks
  - state files
portability: adapter-needed
source_published: 2026-06-07
source_updated: 2026-06-07
source_version: Addy Osmani Loop Engineering article, retrieved 2026-06-20
retrieved: 2026-06-20
verified: 2026-06-20
valid_for: loop-engineering practitioner framing as of 2026-06-07, cross-checked against Codex and Claude Code docs on 2026-06-20
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: source-note
  id: addy-osmani-loop-engineering
privacy: public
retention: source-purged
review_status: processed
confidence: medium
---

# Source Note: Addy Osmani Loop Engineering

Date: 2026-06-20
Status: processed
Source class: article
Retention: source-purged

## Public references checked

- Addy Osmani article: `Loop Engineering`, dated 2026-06-07.
- Current Codex manual fetched 2026-06-20.
- Claude Code docs for overview, hooks and skills checked 2026-06-20.

## Core claims

- Loop engineering is a layer above single-agent harness engineering: instead of prompting the agent manually, the operator designs the system that prompts, checks, records state and decides the next run.
- The article's building blocks are automations, worktrees, skills, plugins/connectors, subagents and persistent state.
- Persistent state can be simple: Markdown file, task board or other external memory outside a single conversation.
- Worktrees reduce mechanical collision between parallel agents, but do not remove human review bandwidth as the bottleneck.
- Skills prevent repeated re-derivation of project procedures and should be written down once for repeated loop use.
- Connectors/MCP let the loop act in real tools such as issue trackers, databases, staging APIs and messaging channels.
- Subagents are most valuable when maker/checker responsibilities are split; verifier agents matter more when the loop runs unattended.
- The loop does not remove engineer responsibility. Verification, product understanding and judgment remain human responsibilities.
- The article warns about comprehension debt and cognitive surrender: faster loops can widen the gap between what the codebase does and what the operator understands.

## Verification notes

- Codex manual confirms automations, skills, plugins, MCP, worktrees, goals and explicitly requested subagent workflows.
- Claude Code docs confirm routines/scheduled tasks, hooks and skills; exact cross-product parity should be treated as a practitioner comparison, not a standard.
- The article is high-value expert/practitioner commentary, not an official product spec.

## Durable follow-up

- Fold the building-block checklist into Pritha's scheduling/proactivity standard.
- Do not promote unattended loop autonomy as a default.
- Add a comprehension-debt warning to loop design: every recurring agent loop needs a human-readable run summary and review path.
