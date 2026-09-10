---
id: 2026-06-20-ai-agent-loops-video-source-note
type: source-note
status: processed
created: 2026-06-20
updated: 2026-06-20
topics:
  - agent-loops
  - automation
  - codex
  - claude-code
  - cron
  - heartbeat
  - hooks
  - goal-loops
  - subagents
  - skills
tools:
  - YouTube
  - Codex
  - Claude Code
  - OpenClaw
  - Agent Skills
  - MCP
  - mlx-whisper
sources:
  - source-edee1fe0-1ed3-46f0-b75b-f9b417179f64
related:
  intakes:
    - 00_inbox/links/2026-06-20-youtube-ai-agent-loops-claude-code-codex-intake.md
  signals:
    - 01_sources/signals/2026-06-20-agent-loop-design-source-batch-signal.md
  assessments:
    - 03_reviews/2026-06-20-agent-loop-design-assessment.md
  standards:
    - 04_standards/agent-proactivity-scheduling.md
    - 04_standards/codex-goals-for-long-running-agent-work.md
    - 04_standards/agent-team-operating-model.md
    - 04_standards/agent-skill-pack-lifecycle.md
source_type: video
source_class: video
ingested_at: 2026-06-20T00:00:00-07:00
processed_at: 2026-06-20T00:00:00-07:00
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-edee1fe0-1ed3-46f0-b75b-f9b417179f64
agent_platforms:
  - Codex
  - Claude Code
  - OpenClaw
model_context:
  - Codex app and CLI builds supporting automations, goals, skills and subagents
  - Claude Code builds supporting routines/scheduled tasks, hooks, skills and subagents
runtime_environment:
  - codex-app
  - codex-thread
  - codex-automation
  - claude-code
  - local-machine
  - cloud-routine
config_surfaces:
  - /goal
  - automations
  - skills
  - MCP connectors
  - subagents
  - hooks
  - routines
portability: adapter-needed
source_published: 2026-06-17
source_updated: 2026-06-17
source_version: YouTube video JoXbk2fm7jM, local ASR with mlx-community/whisper-small-mlx on 2026-06-20; 27502 transcript chars, 483 segments
retrieved: 2026-06-20
verified: 2026-06-20
valid_for: practitioner loop-design claims as of 2026-06-17, cross-checked against current Codex and Claude Code docs on 2026-06-20
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
subject:
  kind: source-note
  id: ai-agent-loops-video
privacy: public
retention: source-purged
review_status: processed
confidence: medium
---

# Source Note: AI Agent Loops In Claude Code And Codex Video

Date: 2026-06-20
Status: processed
Source class: video
Retention: source-purged

## Public references checked

- YouTube oEmbed metadata: `How to write AI agent loops in Claude Code and Codex`, channel `How I AI`.
- Local YouTube metadata via `yt_dlp`: video id `JoXbk2fm7jM`, duration `29:07`, upload date `2026-06-17`.
- Lenny's Newsletter episode page: `How to design AI agent loops: schedules, goals, and subagents in Claude Code and Codex`, published and modified 2026-06-17.
- Current Codex manual fetched 2026-06-20.
- Claude Code docs for overview, scheduled tasks/common workflows, hooks and skills checked 2026-06-20.

## Local transcription

- Path: local ASR, not YouTube captions.
- Pipeline: `yt_dlp` video download -> `ffmpeg` mono 16 kHz audio extraction -> `mlx_whisper` ASR.
- Model: `mlx-community/whisper-small-mlx`.
- Language hint: `en`.
- Transcript size: 27,502 normalized characters.
- Segment count: 483.
- Retention: raw video, audio and transcript were transient and not stored in tracked memory.

## Core claims from the video

- A loop is an automated prompting pattern: the user does not type every next prompt manually.
- The useful taxonomy is human message prompts, heartbeat loops, cron/scheduled loops, hook-triggered loops and goal loops.
- Heartbeat is presented as regular interval sensing or checking; cron/scheduled loops are calendar-based; hooks react to lifecycle or external events; goal loops run until a measurable outcome is met or the agent is blocked.
- Effective loops need clean workspaces, reusable procedural knowledge, tool access, subagents/verifiers and state tracking.
- The video's five loop support pieces are worktrees, skills, plugins/connectors, subagents and state tracking.
- The "onboarding an employee" mental model is useful: define the job, cadence, tools, expected output, escalation path and success criteria.
- The Claude Code demo creates a daily aging-PR review routine, checks PRs older than 12 hours, delegates babysitting to threads/subagents where possible and posts to Slack when human review is needed.
- The Codex demo creates a weekly skills-identification automation from recent PRs/reviews, asks it to identify missing skills, then uses subagents and goal loops to validate candidate skills.
- Goal-based loops are described as the hardest loop type to write well because they need precise evaluation and stopping criteria.
- Warning signs: broad recurring loops can burn tokens quickly; weak validation criteria make goal loops expensive and low-signal.

## Verification notes

- Codex manual confirms automations, worktree choice for Git repositories, skill use inside automations, thread automations, `/goal`, skills and explicitly requested subagent workflows.
- Codex manual also confirms that subagents do not spawn automatically and should be explicitly requested; this is important for Pritha loop design.
- Claude Code official docs confirm routines/scheduled tasks, desktop scheduled tasks, `/loop`, hooks, skills and subagent-related skill behavior. Treat exact UI labels from the video as version-bound.
- The video is a practitioner demo and includes sponsorship/ad content. Sponsorship sections are not used as evidence for architecture.

## Durable follow-up

- Use this source to refine `agent-proactivity-scheduling`, not to create a new default for background autonomy.
- Keep default Pritha child-agent proactivity at `none` or `manual`.
- Promote loop preflight requirements: trigger/cadence, worktree isolation, skill contract, connector permissions, subagent/verifier plan, state file, budget and stop rule.
