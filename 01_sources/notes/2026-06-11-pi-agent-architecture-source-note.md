---
id: 2026-06-11-pi-agent-architecture-source-note
type: source-note
status: processed
created: 2026-06-11
updated: 2026-06-11
topics:
  - pi
  - coding-agents
  - agent-architecture
  - harness-engineering
  - agent-extensibility
  - agent-security
tools:
  - Pi
  - TypeScript
  - Node.js
  - Agent Skills
  - CLI
  - TUI
  - JSONL
sources:
  - source-42905ea0-d653-4825-9d86-9f9cd2d5db39
related:
  intakes:
    - 00_inbox/links/2026-06-11-pi-agent-architecture-intake.md
  signals:
    - 01_sources/signals/2026-06-11-pi-agent-architecture-signal.md
  assessments:
    - 03_reviews/2026-06-11-pi-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
source_type: video
source_class: video
ingested_at: 2026-06-11T16:44:39Z
processed_at: 2026-06-11T16:44:39Z
retention_status: source-purged
usefulness: high
evidence_quality: high
anonymous_source_id: source-42905ea0-d653-4825-9d86-9f9cd2d5db39
agent_platforms:
  - Pi
  - Codex
  - Pritha
model_context:
  - multi-provider tool-calling models
runtime_environment:
  - local-terminal
  - nodejs
  - tui
  - sdk
  - rpc
config_surfaces:
  - AGENTS.md
  - .pi
  - skills
  - extensions
  - prompt templates
  - settings.json
portability: adapter-needed
source_published: 2026-06-05
source_updated: 2026-06-10
source_version: Pi repo commit 406a2214aa1dce746a1902605daf04e6727349dc; @earendil-works/pi-coding-agent 0.79.1 published 2026-06-09
retrieved: 2026-06-11
verified: 2026-06-11
valid_for: Pi architecture and package metadata as checked on 2026-06-11
temporal_status: version-bound
privacy: public
retention: source-purged
review_status: processed
confidence: high
---

# Source Note: Pi agent architecture

Date: 2026-06-11
Status: processed
Source class: video
Retention: source-purged

## Public references checked

- YouTube metadata via oEmbed: `PI Architecture EXPLAINED | Agent Loop, Tools, TUI and More`, Alejandro AO.
- Written version: Alejandro AO Pi Architecture article, published 2026-06-05.
- Official website and docs entrypoint: Pi official docs.
- Official repository: earendil-works/pi, shallow clone checked at commit 406a2214aa1dce746a1902605daf04e6727349dc from 2026-06-10.
- Official package metadata: `@earendil-works/pi-coding-agent` version `0.79.1`, modified/published on 2026-06-09.
- Official migration note: Pi new-home announcement from 2026-05-07.
- Background primary/near-primary context: Mario Zechner's Pi article, Mario's MCP/CLI article, and Armin Ronacher's Pi/OpenClaw article.

## Verification summary

- The project is a TypeScript monorepo with package layers for provider API, agent runtime, coding-agent CLI/session system and TUI.
- Current canonical home is `earendil-works/pi`; old `badlogic/pi-mono` and `@mariozechner/*` package names are historical/deprecated context.
- Pi's README and docs confirm the minimal harness philosophy, four default tools, sessions, branching, compaction, project trust, extensions, skills, prompt templates, packages, SDK and RPC mode.
- Security docs confirm that project trust is not a sandbox and that stronger isolation must come from container, VM, micro-VM, OpenShell or another OS/runtime boundary.

## Durable follow-up

- Use `03_reviews/2026-06-11-pi-agent-architecture-assessment.md` for the evidence-weighted evaluation.
- Use `04_standards/agent-minimal-core-extension-surface.md` as the reusable Pritha design rule.
- Do not treat the raw video or transcript as canonical memory; use curated artifacts and public primary references.
