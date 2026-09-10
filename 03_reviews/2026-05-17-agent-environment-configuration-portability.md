---
id: 2026-05-17-agent-environment-configuration-portability
type: review
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [coding-agents, agent-platforms, agent-configuration, portability, codex, claude-code, gemini-cli, github-copilot, cursor, windsurf]
tools: [Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf, AGENTS.md, CLAUDE.md, GEMINI.md, Agent Skills, MCP]
agent_platforms: [Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf]
model_context: [GPT-5.3-Codex, GPT-5.5, Claude Code, Gemini, Copilot]
runtime_environment: [cli, desktop-app, ide, cloud-agent, github, terminal]
config_surfaces: [AGENTS.md, CLAUDE.md, GEMINI.md, .cursor/rules, .github/copilot-instructions.md, .windsurf/rules, skills, mcp, hooks, plugins, subagents, memories]
portability: adapter-needed
sources:
  - 01_sources/notes/2026-05-17-agent-environment-configuration-source-note.md
  - https://developers.openai.com/codex/cli
  - https://developers.openai.com/api/docs/models/all
  - https://code.claude.com/docs/en/features-overview
  - https://code.claude.com/docs/en/sub-agents
  - https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md
  - https://code.visualstudio.com/docs/copilot/customization/custom-instructions
  - https://docs.cursor.com/en/context
  - https://docs.windsurf.com/windsurf/cascade/memories
  - https://arxiv.org/abs/2602.14690
  - https://arxiv.org/abs/2602.11988
  - https://arxiv.org/abs/2602.09185
related:
  intakes: []
  briefs: []
  decisions: []
  standards:
    - 04_standards/agent-environment-compatibility.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-02-09 to 2026-05-17
source_updated: 2026-05-17
source_version: Official docs and research observed 2026-05-17; arXiv 2602.14690 v4 2026-05-08
retrieved: 2026-05-17
verified: 2026-05-17
valid_for: Techscope agent environment comparison as of 2026-05-17
temporal_status: current
---

# Review: agent environment configuration portability

Date: 2026-05-17
Status: draft

## Question

How should Techscope store and interpret knowledge about different coding-agent environments without mixing up Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf and future tools?

## Options

- One universal `AGENTS.md` only.
- Separate per-tool files only.
- Common Techscope source of truth plus environment-specific adapters.

## Comparison

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| Universal `AGENTS.md` only | Simple, portable starting point, aligns with emerging practice. | Loses tool-specific features and loading behavior. | Good baseline, insufficient alone. |
| Per-tool files only | Uses every environment's native features. | Fragments source of truth and causes drift. | Useful for generated adapters, weak as primary memory. |
| Common source of truth plus adapters | Keeps Techscope coherent while preserving platform differences. | Requires explicit mapping and maintenance. | Best fit. |

## Agent environment profile

- Agent platforms: Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, Windsurf.
- Model context: GPT-5.3-Codex/GPT-5.5 class models, Claude Code, Gemini, Copilot-backed agents.
- Runtime environment: CLI, desktop app, IDE, cloud agent, GitHub, terminal.
- Config surfaces: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`, `.github/copilot-instructions.md`, `.windsurf/rules`, skills, MCP, hooks, plugins, subagents, memories.
- Portability: adapter-needed.
- Codex adaptation: keep `AGENTS.md` and Techscope Markdown as source of truth; translate external patterns into Codex workflows/skills/scripts when useful.
- Environment-specific caveats: Claude hooks/subagent memory, Gemini hierarchical memory, Cursor rule activation, Copilot instruction ordering and Windsurf memories are not Codex-native behaviors.

## Existing knowledge and temporal context

- Related existing artifacts:
  - `04_standards/agent-tool-integration-selection.md`
  - `04_standards/knowledge-freshness-lifecycle.md`
- Relationship to existing knowledge: refines
- Source published: 2026-02-09 to 2026-05-17
- Source updated: 2026-05-17
- Source version: official docs and research observed 2026-05-17; arXiv 2602.14690 v4 2026-05-08
- Retrieved: 2026-05-17
- Verified: 2026-05-17
- Valid for: Techscope agent environment comparison as of 2026-05-17
- Freshness status: current
- Temporal status: current
- Artifacts to mark outdated or superseded: none

## Expert notes

### Architecture

Use a two-layer design: canonical Techscope knowledge in Markdown, plus generated or documented adapters for tool-specific formats. The same concept can have multiple projections: Codex rules, Claude Code instructions, Gemini context, Copilot instructions or Cursor rules.

### Security

Environment-specific features often change the trust boundary. Claude hooks can execute on lifecycle events; skills may include scripts; MCP can expose external systems; CLI agents can run shell commands. Never copy a pattern without mapping permissions and execution semantics.

### Developer Experience

Developers benefit from one canonical source, but agent performance benefits from native configuration. The compromise is to keep canonical rules concise and generate small native files only when needed.

### Product Pragmatist

Codex remains the main implementation target. Other environments are research inputs and optional execution targets. This avoids overbuilding while preserving portability.

### Research Scout

The current research direction supports minimal context files and explicit configuration mechanisms. The latest official docs show rapid divergence in details, so every environment profile needs dates and versions.

## Recommendation

Adopt a Techscope standard: every new agent-related artifact should record platform profile fields and explicitly classify portability as `codex-native`, `portable`, `adapter-needed` or `environment-specific`.

## Next step

Create standard `04_standards/agent-environment-compatibility.md`.
