---
id: agent-minimal-core-extension-surface
type: standard
status: active
created: 2026-06-11
updated: 2026-06-11
last_reviewed: 2026-06-11
owner: Techscope/user
topics:
  - agent-engineering
  - agent-architecture
  - harness-engineering
  - extension-surface
  - session-state
  - pritha
tools:
  - Pritha
  - Codex
  - Pi
  - Agent Skills
  - CLI
  - MCP
  - TypeScript
agent_platforms:
  - Codex
  - Pritha
  - Pi
model_context:
  - mixed
runtime_environment:
  - codex-desktop
  - codex-cli
  - local-terminal
  - sdk
  - rpc
  - messaging-gateway
config_surfaces:
  - agent-contract
  - AGENTS.md
  - skills
  - extensions
  - MCP
  - settings
  - manifests
portability: portable
sources:
  - 03_reviews/2026-06-11-pi-agent-architecture-assessment.md
  - 02_briefs/2026-06-11-pi-agent-harness-patterns-brief.md
  - https://alejandro-ao.com/pi-architecture/
  - https://github.com/earendil-works/pi
  - https://pi.dev/
  - https://pi.dev/news/2026/5/7/pi-has-a-new-home
  - https://www.npmjs.com/package/@earendil-works/pi-coding-agent
  - https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
  - https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/
  - https://lucumr.pocoo.org/2026/1/31/pi/
  - 04_standards/agent-creation-harness.md
  - 04_standards/agent-tool-integration-selection.md
  - 04_standards/agent-skill-pack-lifecycle.md
  - 04_standards/agent-interface-experience.md
  - 04_standards/agent-untrusted-input-security.md
  - 04_standards/agent-harness-evaluation.md
related:
  decisions: []
  reviews:
    - 03_reviews/2026-06-11-pi-agent-architecture-assessment.md
    - 03_reviews/2026-05-17-openclaw-agent-architecture-assessment.md
    - 03_reviews/2026-05-27-local-agent-harness-benchmark-assessment.md
  briefs:
    - 02_briefs/2026-06-11-pi-agent-harness-patterns-brief.md
  standards:
    - 04_standards/agent-creation-harness.md
    - 04_standards/agent-tool-integration-selection.md
    - 04_standards/agent-skill-pack-lifecycle.md
    - 04_standards/agent-interface-experience.md
    - 04_standards/agent-untrusted-input-security.md
    - 04_standards/agent-harness-evaluation.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-05
source_updated: 2026-06-10
source_version: Pi repo commit 406a2214aa1dce746a1902605daf04e6727349dc; @earendil-works/pi-coding-agent 0.79.1; Techscope standard v1
retrieved: 2026-06-11
verified: 2026-06-11
valid_for: Pritha-created child-agent architecture and scaffold contracts from 2026-06-11 onward
temporal_status: current
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - governance
subject:
  kind: standard
  id: agent-minimal-core-extension-surface
privacy: public
retention: durable
review_status: active
confidence: high
---

# Standard: Agent Minimal Core and Extension Surface

Status: active
Owner: Techscope/user
Last reviewed: 2026-06-11

## Rule

Future Pritha-created agents should start from a minimal, inspectable core and an explicit extension surface. The core should do only the stable work that every selected runtime needs: context assembly, model/provider call, tool execution policy, session state, event stream, configuration loading, safety hooks and interface adapter boundary.

Optional capabilities must be contract-selected modules, not default inheritance. This includes extra tools, skills, MCP connectors, memory layers, subagents, plan mode, permission gates, custom UI, background workers, schedulers, model routers, package systems and deployment adapters.

Pi is the reference evidence for this pattern, not the default implementation. Use Pi's architecture to improve Pritha contracts and scaffolds, but choose the actual runtime through `agent-harness-evaluation`.

## Use when

- designing a new Pritha child agent;
- deciding what belongs in the agent core versus a selected module;
- adding skills, tools, MCP, custom UI, memory or package loading to a scaffold;
- adapting patterns from Pi, OpenClaw, Hermes, Codex, Claude Code, Gemini CLI or other harnesses;
- reducing context bloat, tool sprawl or unreviewed extension behavior.

## Avoid when

- the task is a one-off analysis and no durable agent scaffold is being created;
- a regulated or high-assurance environment requires a fixed, locked-down runtime with no dynamic extension surface;
- the source, package, extension or skill cannot be reviewed and pinned;
- a requested feature is actually a security boundary and must be implemented below the agent process.

## Required practices

- In every non-trivial `agent-contract`, record:
  - `core_runtime`;
  - `extension_surface`;
  - `selected_modules`;
  - `skipped_modules`;
  - `module_readiness`;
  - `module_trust_level`;
  - `runtime_isolation_profile`.
- Keep `AGENTS.md` concise. Put detailed reusable procedure in workflows, standards, skills, scripts or docs.
- Define the default tool surface narrowly. Add broad integrations through `agent-tool-integration-selection`.
- Prefer progressive discovery for large tool catalogs. Do not inject every possible tool schema into every turn.
- Treat skills as procedural memory with progressive disclosure. Apply `agent-skill-pack-lifecycle` before activation.
- Treat MCP as an optional service boundary, not a default feature. Apply `agent-mcp-connector-lifecycle` when selected.
- Treat extensions and packages as executable supply-chain inputs. Require provenance, source review, pinning, trust level, permissions and eval coverage.
- Make project-local resources trust-gated, but do not call that a sandbox.
- Record whether extension hot reload is allowed. Default: development-only and trusted-local only.
- Store durable session state as structured entries where possible: model-visible messages, tool results, custom extension entries, model changes, branch summaries, compaction entries and file-operation details.
- For long-running agents, use structured compaction or handoff summaries that preserve goal, constraints, progress, blockers, key decisions, next steps and touched files.
- If branching or review side quests matter, design the session model so a branch can be summarized and rejoined without losing the main task.
- Keep UI separate from runtime. Telegram, CLI, web UI, voice and Codex thread should be adapters unless the contract deliberately chooses a coupled product.
- Offer headless or machine-readable control surfaces when useful: status command, JSON output, RPC, SDK, event stream or local API.
- Do not allow external/untrusted input to activate extensions, install packages, alter tools, update memory or trigger side effects without the policy in `agent-untrusted-input-security`.
- If the agent can write files, call shell, send messages, deploy, spend money or access private data, record approval gates and runtime isolation separately from project trust.
- Before selecting Pi, OpenClaw, Hermes or another non-Codex runtime, apply `agent-harness-evaluation` with task-relevant evals.

## Agent environment compatibility

- Agent platforms: Codex-native agents, Pritha descendants, Pi-based agents and other local coding-agent harnesses.
- Model context: portable pattern; concrete prompts/tool schemas are model-bound and need eval.
- Runtime environment: local CLI/TUI, Codex thread, messaging gateway, SDK/RPC worker, web/operator UI.
- Config surfaces: `agent-contract`, `AGENTS.md`, manifests, skills, extensions, MCP configs, settings and operations files.
- Portability: portable as an architecture rule; implementation is adapter-needed.
- Codex adaptation: in Codex-native agents, implement extension surfaces as repo-local scripts, skills, workflows, manifests and explicit tool policies rather than dynamic TypeScript extension loading by default.
- Environment-specific caveats: runtime isolation and package execution differ by host. Do not copy Pi's host-permission default into external-facing agents.

## Contract checklist

For each selected module, record:

| Field | Meaning |
| --- | --- |
| `module_name` | Stable module identifier. |
| `module_type` | core, skill, extension, tool, MCP, memory, UI, scheduler, deployment, eval, operations. |
| `source` | local, generated, vendored, npm, git, MCP server, SaaS, custom. |
| `version_or_pin` | tag, commit, package version or local hash. |
| `trust_level` | trusted-local, reviewed, candidate, untrusted, pending-auth. |
| `permissions` | filesystem, shell, network, secrets, messaging, deployment, spend. |
| `activation` | always, on-demand, command, event, scheduler, manual. |
| `readiness` | ready, skipped, pending-auth, failed, not-selected. |
| `evals` | smoke/eval cases required before handoff. |

## Temporal validity

- Source published: 2026-06-05 for Alejandro AO's Pi architecture article/video.
- Source updated: 2026-06-10 for the checked Pi repository commit; 2026-06-09 for `@earendil-works/pi-coding-agent` `0.79.1`.
- Source version: Pi commit `406a2214aa1dce746a1902605daf04e6727349dc`; package `0.79.1`; Techscope standard v1.
- Retrieved: 2026-06-11.
- Verified: 2026-06-11.
- Valid for: Pritha-created child-agent architecture and scaffold contracts from 2026-06-11 onward.
- Freshness status: current.
- Temporal status: current for the design rule, version-bound for Pi implementation details.
- Recheck when: Pi changes package architecture, extension security, session format, compaction semantics, package system, project trust model, or when Pritha adopts a concrete Pi-based runtime.

## Examples

- A small Codex-native research agent can have no dynamic extensions. Its extension surface is a set of reviewed scripts, workflows and skills selected by contract.
- A local coding agent can support packageable capabilities, but each package needs a lock entry, source review, trust level and smoke test before activation.
- A Telegram-facing agent can use the same task/session runtime as a CLI, but Telegram remains an interface adapter with queueing, approval and concise replies.
- A review side quest can run in a branch or separate session, summarize findings, then return to the main implementation path.

## Related decisions

- `04_standards/agent-creation-harness.md`
- `04_standards/agent-tool-integration-selection.md`
- `04_standards/agent-skill-pack-lifecycle.md`
- `04_standards/agent-interface-experience.md`
- `04_standards/agent-untrusted-input-security.md`
- `04_standards/agent-harness-evaluation.md`
