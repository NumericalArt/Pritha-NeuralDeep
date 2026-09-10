---
id: agent-environment-compatibility
type: standard
status: draft
created: 2026-05-17
updated: 2026-05-17
last_reviewed: 2026-05-17
owner: Techscope/user
topics: [agent-architecture, agent-platforms, agent-configuration, portability, codex, claude-code, gemini-cli, github-copilot, cursor, windsurf, hermes-agent, mimiclaw, embedded-agents]
tools: [Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, Hermes Agent, MimiClaw, AGENTS.md, Agent Skills, MCP]
agent_platforms: [Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, Hermes Agent, MimiClaw]
model_context: [GPT-5.3-Codex, GPT-5.5, Claude Code, Gemini, Copilot, model-agnostic Hermes providers, Anthropic/OpenAI cloud APIs for embedded agents]
runtime_environment: [cli, desktop-app, ide, cloud-agent, github, terminal, messaging-gateway, vps, cron, esp32-s3, freertos, microcontroller, serial-cli, ota]
config_surfaces: [AGENTS.md, CLAUDE.md, GEMINI.md, .cursor/rules, .github/copilot-instructions.md, .windsurf/rules, .hermes.md, HERMES.md, SOUL.md, skills, mcp, hooks, plugins, subagents, memories, toolsets, mimi_secrets.h, nvs, spiffs, serial-cli]
portability: adapter-needed
sources:
  - 01_sources/notes/2026-05-17-agent-environment-configuration-source-note.md
  - 03_reviews/2026-05-17-agent-environment-configuration-portability.md
  - https://developers.openai.com/codex/cli
  - https://code.claude.com/docs/en/features-overview
  - https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html
  - https://code.visualstudio.com/docs/copilot/customization/custom-instructions
  - https://docs.cursor.com/en/context
  - https://docs.windsurf.com/windsurf/cascade/memories
  - https://arxiv.org/abs/2602.14690
  - https://arxiv.org/abs/2602.11988
  - 03_reviews/2026-05-17-mimiclaw-embedded-agent-assessment.md
  - https://github.com/memovai/mimiclaw
related:
  decisions: []
  reviews:
    - 03_reviews/2026-05-17-agent-environment-configuration-portability.md
  briefs: []
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-02-12 to 2026-05-17
source_updated: 2026-05-17
source_version: Techscope draft standard v3; official docs observed 2026-05-17; Hermes Agent v0.14.0 observed 2026-05-17; MimiClaw v0.1.1/main observed 2026-05-17
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Techscope agent knowledge ingestion and future agent design from 2026-05-17 onward
temporal_status: current
---

# Standard: agent-environment-compatibility

Status: draft
Owner: Techscope/user
Last reviewed: 2026-05-17

## Rule

Every Techscope artifact about coding agents, LLM agents, agent tooling or agent configuration must identify the agent environment it describes and whether the idea is portable to Codex.

Codex is the primary implementation target for Techscope. Other environments are valuable research sources, but their patterns must be translated through an environment compatibility layer before becoming Techscope standards.

## Use when

- ingesting material about Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, Devin, OpenClaw, Hermes Agent, MimiClaw or other agents;
- comparing coding-agent workflows;
- extracting reusable agent design patterns from blogs, videos, docs or repositories;
- creating standards that may later be implemented across multiple agent environments;
- deciding whether to create Codex-native scripts/skills/workflows or tool-specific adapters.

## Avoid when

- the material is not about agents, coding tools, model runtime behavior, memory, context, tool use or workflow configuration;
- the source does not identify the environment and cannot be verified;
- the pattern depends on a proprietary runtime behavior that cannot be inspected or reproduced.

## Required practices

- Record `agent_platforms`, `model_context`, `runtime_environment`, `config_surfaces` and `portability`.
- Treat `AGENTS.md` and Techscope Markdown artifacts as the canonical project-level knowledge layer.
- Use environment-native files only as adapters or projections unless the whole project is explicitly targeting that environment.
- Do not copy `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md` or `.windsurf/rules` patterns into Codex without mapping semantics.
- Distinguish context files, skills, subagents, hooks, MCP, plugins and memories. Similar names do not guarantee identical behavior.
- Prefer minimal, high-signal instructions. Repository context files can increase cost or reduce task success when they encode unnecessary requirements.
- Add temporal metadata for every environment profile, because product behavior and model availability change quickly.

## Agent environment compatibility

- Agent platforms: Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, Hermes Agent, MimiClaw.
- Model context: GPT-5.3-Codex/GPT-5.5 class models, Claude Code, Gemini, Copilot-backed agents, model-agnostic Hermes providers, Anthropic/OpenAI cloud APIs for embedded agents.
- Runtime environment: CLI, desktop app, IDE, cloud agent, GitHub, terminal, messaging gateway, VPS/server, cron, ESP32-S3/FreeRTOS microcontroller.
- Config surfaces: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`, `.windsurf/rules`, `.hermes.md`, `HERMES.md`, `SOUL.md`, skills, MCP, hooks, plugins, subagents, memories, toolsets, `mimi_secrets.h`, NVS, SPIFFS, serial CLI.
- Portability: adapter-needed.
- Codex adaptation: keep canonical rules in `AGENTS.md`, `04_standards/`, `07_workflows/` and `08_templates/`; create Codex scripts/workflows first; generate or document tool-specific projections only when needed.
- Environment-specific caveats: Claude Code subagent memory/hooks, Gemini hierarchical memory, Copilot instruction ordering, Cursor rule activation and Windsurf UI memories are not equivalent to Codex behavior.

## Portability classes

| Class | Meaning | Example |
| --- | --- | --- |
| `codex-native` | Directly applies to Codex project work. | `AGENTS.md` rules, Techscope scripts, Codex skills/workflows. |
| `portable` | Concept applies broadly with small wording changes. | Keep instructions concise; verify with tests; use MCP for auth-heavy services. |
| `adapter-needed` | Useful, but requires a mapping layer. | Translate `CLAUDE.md` or `GEMINI.md` context into `AGENTS.md` plus workflow notes. |
| `environment-specific` | Depends on a runtime feature. | Claude hooks, Gemini tiered memory, Cursor rule activation modes. |
| `unknown` | Source does not provide enough environment detail. | Blog post says "my agent" without tool/version. |

## Environment map

| Environment | Canonical files/features | Techscope treatment |
| --- | --- | --- |
| Codex | `AGENTS.md`, skills, MCP, subagents, CLI/app workflows, approval modes | Primary implementation target. |
| Claude Code | `CLAUDE.md`, skills, subagents, agent teams, hooks, MCP, plugins, memory | Research source; translate patterns into Codex-compatible workflows. |
| Gemini CLI | `GEMINI.md`, configurable context filenames, skills, MCP, memory commands | Research source; useful for hierarchical context and memory ideas. |
| GitHub Copilot/VS Code | `.github/copilot-instructions.md`, `AGENTS.md`, instruction files, prompt files, custom agents | Adapter target for GitHub/IDE workflows. |
| Cursor | `.cursor/rules`, user rules, `AGENTS.md`, legacy `.cursorrules` | Adapter target for IDE-specific rule activation. |
| Windsurf | `.windsurf/rules`, memories, workflows, `AGENTS.md` | Adapter target; durable shared knowledge should be rules/AGENTS.md, not only UI memory. |
| Hermes Agent | `.hermes.md`/`HERMES.md`, `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, skills, toolsets, gateway, memory providers, MCP, plugins | Architecture research target and possible external runtime; keep Techscope source of truth outside Hermes memory. |
| MimiClaw | `mimi_secrets.h`, serial CLI/NVS config, SPIFFS files, `SOUL.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`, `cron.json`, `SKILL.md`, Telegram/WebSocket channels | Embedded-agent research target; useful for low-power hardware-agent patterns, not a Codex replacement. |

## Temporal validity

- Source published: 2026-02-12 to 2026-05-17.
- Source updated: 2026-05-17.
- Source version: Techscope draft standard v3; official docs observed 2026-05-17; Hermes Agent v0.14.0 observed 2026-05-17; MimiClaw v0.1.1/main observed 2026-05-17.
- Retrieved: 2026-05-17.
- Verified: 2026-05-17.
- Valid for: Techscope agent knowledge ingestion and future agent design from 2026-05-17 onward.
- Freshness status: current.
- Temporal status: current.
- Recheck when: Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, Hermes Agent or MimiClaw change context loading, skills, subagents, MCP, memory, hooks, toolsets, gateway, firmware, OTA, channel authorization or custom-agent behavior.

## Examples

- A Claude Code article about hooks should be stored as `environment-specific` unless we build an explicit Codex/launchd/script equivalent.
- A Gemini CLI article about hierarchical context files should be stored as `adapter-needed`; the transferable concept is layered context, not the literal `GEMINI.md` behavior.
- A Copilot article about `.github/copilot-instructions.md` should be mapped to `AGENTS.md` plus optional Copilot adapter if we target VS Code/GitHub.
- A general article about keeping context files short is `portable`, but should still cite which agents were evaluated.
- A Hermes Agent article about autonomous skill creation should be stored as `adapter-needed`; the transferable concept is reviewed procedural memory, not unreviewed self-modifying skills.
- A MimiClaw article about ESP32-S3 agents should be stored as `adapter-needed`; the transferable concept is constrained always-on agent architecture, not the literal firmware/config model.

## Related decisions

- `04_standards/agent-tool-integration-selection.md`
- `04_standards/knowledge-freshness-lifecycle.md`
