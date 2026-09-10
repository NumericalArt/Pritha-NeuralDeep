---
id: 2026-05-28-pritha-realtime-tool-defaults-setup-report
type: agent-operations-report
status: complete
created: 2026-05-28
updated: 2026-05-28
topics: [pritha, realtime, voice-control, setup, tool-surface, codex-cli, memory]
tools: [Pritha, Codex CLI, Realtime, Techscope Memory]
agent_platforms: [Codex]
model_context: [GPT-5 Codex]
runtime_environment: [local-project, macos, cli]
config_surfaces: [AGENTS.md, scripts, docs, standards, reports]
portability: codex-native
sources:
  - AGENTS.md
  - README.md
  - docs/pritha.md
  - docs/realtime.md
  - 04_standards/agent-creation-harness.md
  - scripts/setup.mjs
  - setup/manifest.schema.json
related:
  briefs:
    - 02_briefs/2026-05-28-pritha-product-identity-self-knowledge-brief.md
  reports:
    - 11_agents/reports/2026-05-28-pritha-module-readiness-and-tooling-clarification-report.md
  standards:
    - 04_standards/agent-creation-harness.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: realtime-tool-defaults-v1
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha v0.1 local setup and descendant voice-control planning
temporal_status: current
---

# Pritha Realtime Tool Defaults Setup Report

Date: 2026-05-28
Status: complete

- Agent name: Techscope

## Summary

Clarified and implemented the setup rule for Pritha voice-control descendants:
when realtime voice is selected, the default realtime tool surface is internet
access, agent memory access and Codex CLI sidecar access.

## Changes Made

- Added default realtime tools to `scripts/setup.mjs`: `internet`, `memory`,
  `codexCli`.
- Setup state now records `realtime.enabled`, `realtime.mode` and selected
  realtime tools.
- Setup sections now include `realtime.tool.internet`,
  `realtime.tool.memory` and `realtime.tool.codexCli`.
- `.env.local` generation now records `TECHSCOPE_REALTIME_TOOLS` for selected
  realtime tools.
- Schema and tests were extended to cover the realtime tool surface.
- Documentation and standards now state that voice control is not complete
  unless the selected tool surface is visible in readiness checks.

## Marketing And Product Identity Update

Pritha's product self-description now includes the shorthand:

- Pritha is a harness for an agent that builds the harness of a new agent.
- The lineage model is genetic: Seed, inheritance, mutation, trial and
  Descendant.
- A Claude Code version is coming as a future adapter path; v0.1 remains
  Codex-native.

## Result

Realtime voice setup is now explicit instead of implicit. If memory search or
Codex CLI is unavailable, setup exposes the missing piece instead of hiding it
behind a generic voice-enabled status.
