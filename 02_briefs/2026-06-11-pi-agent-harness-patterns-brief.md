---
id: 2026-06-11-pi-agent-harness-patterns-brief
type: brief
status: draft
created: 2026-06-11
updated: 2026-06-11
topics:
  - pi
  - coding-agents
  - agent-architecture
  - harness-engineering
  - extension-surface
  - session-state
tools:
  - Pi
  - TypeScript
  - Node.js
  - Agent Skills
  - CLI
  - TUI
  - JSONL
sources:
  - 00_inbox/links/2026-06-11-pi-agent-architecture-intake.md
  - 01_sources/notes/2026-06-11-pi-agent-architecture-source-note.md
  - 01_sources/signals/2026-06-11-pi-agent-architecture-signal.md
  - https://alejandro-ao.com/pi-architecture/
  - https://github.com/earendil-works/pi
  - https://pi.dev/
  - https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
  - https://lucumr.pocoo.org/2026/1/31/pi/
related:
  intakes:
    - 00_inbox/links/2026-06-11-pi-agent-architecture-intake.md
  source_notes:
    - 01_sources/notes/2026-06-11-pi-agent-architecture-source-note.md
  signals:
    - 01_sources/signals/2026-06-11-pi-agent-architecture-signal.md
  assessments:
    - 03_reviews/2026-06-11-pi-agent-architecture-assessment.md
  standards:
    - 04_standards/agent-minimal-core-extension-surface.md
freshness_status: current
source_published: 2026-06-05
source_updated: 2026-06-10
source_version: Pi repo commit 406a2214aa1dce746a1902605daf04e6727349dc; @earendil-works/pi-coding-agent 0.79.1
retrieved: 2026-06-11
verified: 2026-06-11
valid_for: Pi architecture patterns as checked on 2026-06-11
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - source-material
subject:
  kind: pattern
  id: pi-agent-harness-patterns
privacy: public
retention: durable
review_status: draft
confidence: high
---

# Brief: Pi agent harness patterns

Date: 2026-06-11
Source: Alejandro AO article/video, Pi repository/docs, npm metadata, Mario Zechner and Armin Ronacher background articles
Status: draft

## Summary

Pi is a strong reference for future Pritha child-agent design because it demonstrates a small, inspectable coding-agent core surrounded by explicit customization mechanisms: extensions, skills, prompt templates, packages, session branching, compaction, SDK/RPC and a TUI adapter. The most useful lesson is architectural discipline, not direct adoption of Pi as our default runtime. Pritha should preserve a minimal core for each descendant and add capabilities only through contract-selected modules with reviewed provenance and security boundaries.

## Patterns worth extracting

### 1. Layer the agent stack

Pi separates provider API normalization, core agent loop/state, coding-agent session/resources and terminal UI. Pritha should mirror this conceptually: runtime, memory, tools, interface and operations are separate modules selected by the contract, not one inseparable bundle.

### 2. Keep the default tool surface narrow

Pi starts from a small coding tool set and lets additional capabilities come through skills or extensions. This reinforces Techscope's existing rule: choose CLI/script, skill, MCP, browser or manual boundary deliberately, and prefer progressive discovery over eager tool loading.

### 3. Treat extension APIs as a real product surface

Extensions can register tools, commands, UI components, event handlers and persistent state. For Pritha, extensions should be described in a manifest with risk level, trust level, hooks, permissions, readiness and test cases.

### 4. Store sessions as structured state, not only chat text

Pi's session format supports model messages, tool results, model changes, thinking-level changes, custom extension state, compaction and branch summaries. Future agents should not flatten all durable state into transcript prose; structured entries are easier to inspect, migrate, summarize and replay.

### 5. Use session trees for side quests

Branching allows a repair, review or experiment to happen without poisoning the main path. This is relevant for Pritha-created coding agents: a review branch can inspect work and return summarized findings to the main branch.

### 6. Make compaction structured and file-aware

Pi compaction keeps a summary plus the boundary of retained messages and tracks read/modified files. Pritha should require compaction/handoff summaries to preserve goal, constraints, progress, blockers, decisions, next steps and touched files.

### 7. Separate UI from runtime

Pi supports interactive TUI, print/JSON, RPC and SDK embedding. Pritha should treat Telegram, web UI, voice, CLI and Codex thread as adapters around a task/session runtime when the agent's scope justifies that separation.

### 8. Trust gates are not sandboxes

Pi's project trust is useful for deciding whether to load project-local resources, but Pi explicitly says it is not a security boundary. Pritha should keep this distinction: project trust, package approval and runtime isolation are separate contract fields.

### 9. Packageability is useful only with supply-chain discipline

Bundling extensions, skills, prompts and themes as packages is powerful, but package installs execute code and can change agent behavior. External packages should remain candidate-only until pinned, reviewed and eval-covered.

### 10. Self-extension is productive but high-risk

Pi can help write its own extensions. This is a good development loop for trusted local work, but future agents should not self-enable new tools, permissions or packages in production without human approval and a recorded readiness check.

## Relationship to existing Techscope knowledge

- Confirms `agent-creation-harness`: child agents should be assembled from selected modules rather than cloned from one universal bundle.
- Refines `agent-tool-integration-selection`: Pi provides a concrete case for "primitives before features" and skills/CLI before broad MCP when that fits the task.
- Refines `agent-skill-pack-lifecycle`: skills are procedural memory with progressive disclosure, but still require provenance and trigger evals.
- Refines `agent-interface-experience`: UI is a harness boundary. The same runtime can support TUI, SDK, RPC or other adapters.
- Confirms `agent-untrusted-input-security`: project trust and extension loading must be separated from sandboxing and external-input policy.
- Confirms `agent-harness-evaluation`: before choosing Pi as runtime, test it against the actual agent workload.

## Recommendation

Promote the reusable design rule into `04_standards/agent-minimal-core-extension-surface.md`. Do not select Pi as Pritha's default runtime. Treat Pi as an architecture reference and candidate runtime for future child agents only after task-specific evaluation.
