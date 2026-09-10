---
id: 2026-06-20-agent-loop-design-source-batch-signal
type: signal
status: refined
created: 2026-06-20
updated: 2026-06-20
topics:
  - agent-loops
  - loop-engineering
  - automation
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
  - source-edee1fe0-1ed3-46f0-b75b-f9b417179f64
  - source-8d01cbd3-72d9-4c00-bf48-9e0fcd86c840
related:
  intakes:
    - 00_inbox/links/2026-06-20-youtube-ai-agent-loops-claude-code-codex-intake.md
    - 00_inbox/links/2026-06-20-addy-osmani-loop-engineering-intake.md
  source_notes:
    - 01_sources/notes/2026-06-20-ai-agent-loops-video-source-note.md
    - 01_sources/notes/2026-06-20-addy-osmani-loop-engineering-source-note.md
  assessments:
    - 03_reviews/2026-06-20-agent-loop-design-assessment.md
  standards:
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/codex-goals-for-long-running-agent-work.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-skill-pack-lifecycle.md
generated_from:
  - source-edee1fe0-1ed3-46f0-b75b-f9b417179f64
  - source-8d01cbd3-72d9-4c00-bf48-9e0fcd86c840
signal_quality: high
extraction_mode: codex-assisted
refinement_status: codex-refined
harness: 07_workflows/prompts/signal-extraction-harness.md
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: signal
  id: agent-loop-design
privacy: public
retention: source-purged
review_status: processed
confidence: high
---

# Signal: Agent Loop Design Source Batch

Date: 2026-06-20
Status: refined
Signal quality: high
Extraction mode: codex-assisted
Refinement status: codex-refined

## Core signal

- Treat loops as automated prompting systems, not as magic autonomy.
- The practical loop taxonomy is heartbeat, cron/scheduled, hook/event and goal loop.
- A production-capable loop needs more than cadence: isolation, reusable skills, connectors/tool permissions, subagent/verifier design, state tracking, budgets and stop conditions.
- Goal loops are high leverage but high risk because weak success criteria burn tokens and produce false completion.
- Subagents are useful inside loops primarily to split maker/checker work or parallelize bounded read-heavy tasks; they are not free and should not spawn without explicit loop design.
- Persistent state is the spine of a loop. Without state, recurring runs re-discover the same facts and forget partial progress.
- The strongest adoption delta for Pritha is a loop preflight checklist, not a new default to enable background proactivity.

## Technical details

- Video source was locally transcribed with `mlx-whisper`; raw transcript is not retained.
- Addy Osmani article was processed as a separate source.
- Current Codex manual confirms automations, worktrees, skills, MCP/plugins, `/goal` and explicitly requested subagents.
- Claude Code docs confirm routines/scheduled tasks, `/loop`, hooks and skills; exact parity claims remain environment-specific and version-bound.

## Agent design implications

- Pritha child agents should keep `proactive_mode: none | manual` by default.
- Any loop selected by a child-agent contract needs a declared trigger, scheduler owner, worktree/isolation policy, tool/connectors, skill set, subagent policy, state store, budget, run log and kill switch.
- Scheduled PR review and weekly skill-identification are good candidate workflows only after connector authorization, notification policy and cost controls are explicit.
- Skills generated or recommended by a loop must still pass the skill lifecycle: review, pinning, eval and activation policy.
- Goal-based validating subagents should receive specific success criteria and bounded task scope.

## Candidate rules

- Before enabling any loop, require a loop preflight: trigger, cadence, workspace, tools, state, verifier, stop condition and budget.
- Use cron/scheduled loops for named recurring outputs.
- Use heartbeat only for cheap sensing and deterministic checks before model work.
- Use hooks for lifecycle/event enforcement, not broad exploratory work.
- Use goal loops only when completion can be verified by tests, artifacts, state or an explicit blocker report.
- Keep maker/checker split for unattended write-heavy loops.
- Every recurring loop must produce a human-readable run summary to control comprehension debt.

## Noise removed

- Sponsorship sections and creator hype are excluded from the conclusions.
- Exact UI labels from product demos are treated as version-bound and not standardized directly.

## Verification required

- Recheck Codex and Claude Code docs before implementing cross-tool loop adapters.
- Test any Pritha loop manually before scheduling it.
- Verify connector permissions and notification outputs in a disposable workspace.
