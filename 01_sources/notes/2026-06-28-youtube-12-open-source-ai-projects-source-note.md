---
id: 2026-06-28-youtube-12-open-source-ai-projects-source-note
type: source-note
status: processed
created: 2026-06-28
updated: 2026-06-28
topics:
  - open-source-ai-projects
  - agent-building-knowledge
  - github-research
  - agent-skills
  - mcp
  - multimedia-agents
tools:
  - YouTube
  - GitHub
  - gh
  - Agent Skills
  - MCP
sources:
  - source-2lmBj-XQq0I-2026-06-28
related:
  intakes:
    - 00_inbox/links/2026-06-28-youtube-12-open-source-ai-projects-intake.md
  signals:
    - 01_sources/signals/2026-06-28-open-source-agent-building-repos-signal.md
  reviews:
    - 03_reviews/2026-06-28-open-source-agent-building-repos-review.md
  registries:
    - 01_sources/registries/github-agent-building-repos.md
source_type: video
source_class: video
ingested_at: 2026-06-28T00:00:00-07:00
processed_at: 2026-06-28T00:00:00-07:00
retention_status: source-purged
usefulness: high
evidence_quality: medium
anonymous_source_id: source-2lmBj-XQq0I-2026-06-28
agent_platforms:
  - Codex
  - Claude Code
  - MCP-capable agents
  - Hermes Agent
model_context:
  - hosted coding agents
  - agent skills
  - local media models
runtime_environment:
  - codex-thread
  - local-machine
  - browser
  - mcp-server
  - desktop-app
config_surfaces:
  - AGENTS.md
  - SKILL.md
  - MCP server manifests
  - package manifests
  - pyproject/package configs
portability: adapter-needed
source_published: "2026-06-23 inferred from YouTube search snippet retrieved 2026-06-28; exact page metadata unavailable"
source_updated: "GitHub repository HEADs checked 2026-06-28"
source_version: "YouTube video 2lmBj_XQq0I; public description and repository HEAD metadata checked 2026-06-28"
retrieved: 2026-06-28
verified: 2026-06-28
valid_for: repository-discovery and agent-building candidate registry as of 2026-06-28
temporal_status: current
memory_domain: source-material
memory_domains:
  - source-material
  - agent-building-knowledge
subject:
  kind: source-note
  id: youtube-12-open-source-ai-projects
privacy: public
retention: source-purged
review_status: processed
confidence: medium
---

# Source Note: YouTube 12 Open-Source AI Projects

Date: 2026-06-28
Status: processed
Source class: video
Retention: source-purged

## Public references checked

- YouTube oEmbed metadata for `2lmBj_XQq0I`: title `You NEED to try these 12 open-source AI projects RIGHT NOW`, channel `Matthew Berman`.
- YouTube watch page public description and chapter text, fetched 2026-06-28.
- YouTube search snippet, retrieved 2026-06-28, indicated the video was published "5 days ago"; exact publish metadata was not exposed in fetched HTML.
- GitHub REST/API metadata, file trees, README files and selected source files for all repositories listed below, checked 2026-06-28.

## Extraction limits

- `yt_dlp` and `youtube-transcript-api` transcript attempts were blocked by YouTube anti-bot checks.
- No browser cookies or user account credentials were used.
- Repository conclusions below are therefore grounded in the video description plus primary GitHub inspection, not a full transcript.

## Extracted GitHub repositories

| Video/display label | Source repository/ref from video | Canonical repository checked | Notes |
| --- | --- | --- | --- |
| Loop Skill / Loop Library | `Forward-Future/loop-library` | `Forward-Future/loopy` | GitHub redirected the video-listed repository to `Forward-Future/loopy`. |
| OpenMontage | `calesthio/OpenMontage` | same | Agentic video production system. |
| Deer Flow | `bytedance/deer-flow` | same | Long-horizon super-agent harness. |
| Anthropic Cybersecurity Skills | `mukul975/Anthropic-Cybersecurity-Skills` | same | Large dual-use cybersecurity skill library. |
| HyperFrames | `heygen-com/hyperframes` | same | HTML-to-video framework with agent skills and hosted MCP option. |
| Codebase Memory MCP | `DeusData/codebase-memory-mcp` | same | Static binary MCP/code intelligence graph. |
| Matt Pocock Skills | `mattpocock/skills` | same | Engineering/productivity skill pack. |
| gstack | `garrytan/gstack` | same | AI engineering skill suite plus browser automation stack. |
| Unlimited OCR | `baidu/Unlimited-OCR` | same | One-shot long-horizon OCR/model inference repo. |
| SkillSpector | `nvidia/skillspector` | `NVIDIA/SkillSpector` | GitHub canonical capitalization differs. |
| Palmier Pro | `palmier-io/palmier-pro` | same | macOS AI-native video editor with MCP. |
| Hermes Agent | `nousresearch/hermes-agent` | `NousResearch/hermes-agent` | GitHub canonical capitalization differs; prior Pritha artifacts already exist. |
| Voicebox | `jamiepine/voicebox` | same | Local AI voice studio with MCP server. |

## Repository snapshot

| Repo | License | Stars | Last pushed | Primary code/shape |
| --- | --- | ---: | --- | --- |
| `Forward-Future/loopy` | MIT | 1,982 | 2026-06-27 | Cloudflare-style Loop Library website plus installable Loopy skill. |
| `calesthio/OpenMontage` | AGPL-3.0 | 26,723 | 2026-06-28 | Python tools, YAML pipeline manifests, large skill catalog and agent instructions. |
| `bytedance/deer-flow` | MIT | 75,202 | 2026-06-28 | Python/FastAPI/LangGraph backend, Next.js frontend, sandbox/memory/MCP/skills. |
| `mukul975/Anthropic-Cybersecurity-Skills` | Apache-2.0 | 22,566 | 2026-06-26 | Thousands of skill files/scripts mapped to security frameworks. |
| `heygen-com/hyperframes` | Apache-2.0 | 31,945 | 2026-06-28 | Bun/TypeScript monorepo, renderer/CLI/studio/packages and skills. |
| `DeusData/codebase-memory-mcp` | MIT | 19,321 | 2026-06-28 | C static binary, tree-sitter/LSP graph indexing, npm/PyPI wrappers. |
| `mattpocock/skills` | MIT | 149,169 | 2026-06-25 | Skill-only repository with engineering/productivity procedures. |
| `garrytan/gstack` | MIT | 117,673 | 2026-06-25 | TypeScript/Bun skill suite, browser daemon, security/path controls. |
| `baidu/Unlimited-OCR` | MIT | 11,496 | 2026-06-28 | Minimal Python inference script plus model/paper assets. |
| `NVIDIA/SkillSpector` | Apache-2.0 | 11,246 | 2026-06-28 | Python LangGraph scanner, static/semantic analyzers, MCP wrapper. |
| `palmier-io/palmier-pro` | GPL-3.0 | 9,290 | 2026-06-28 | Swift macOS app, MCP server, timeline/editor/agent tool executors. |
| `NousResearch/hermes-agent` | MIT | 204,886 | 2026-06-28 | Python/TS multi-surface personal agent runtime with gateway/cron/MCP/skills. |
| `jamiepine/voicebox` | MIT | 35,346 | 2026-06-28 | Tauri/React/FastAPI local voice app with MCP and TTS/STT backends. |

## Code inspection notes

- `Forward-Future/loopy` separates public loop catalog code from installable skill code. The skill treats loops as bounded feedback systems with discovery, audit, run, debrief and publish workflows.
- `OpenMontage` is instruction-driven: YAML pipeline manifests and Markdown skills drive stages; Python is mainly tools, persistence and provider adapters.
- `deer-flow` has a clearer harness/app split than a simple demo: backend agent factory, lead agent, memory storage, middleware, gateway routers, skill management and frontend.
- `Anthropic-Cybersecurity-Skills` includes many `SKILL.md` files plus executable helper scripts. It is valuable as a skill-schema corpus but high-risk as active content.
- `hyperframes` is a TypeScript monorepo with CLI, core, engine, producer/player/studio packages, a skills layer and docs for a hosted MCP path.
- `codebase-memory-mcp` exposes a static binary MCP package with npm/PyPI wrappers and code graph internals; wrapper code includes security checks for HTTPS download and safe extraction.
- `mattpocock/skills` is a compact procedural skill corpus with explicit user-vs-model invocation rules and practical engineering skills.
- `gstack` combines skill routing with a persistent browser daemon, content-security layers, canary checks, path validation and a broad workflow suite.
- `Unlimited-OCR` is mostly a model inference reference: `infer.py` starts SGLang/vLLM-style server requests, supports image/PDF modes and long context parsing.
- `SkillSpector` is directly relevant to Pritha governance: a CLI/MCP skill scanner built as a LangGraph workflow with static pattern nodes, optional LLM analysis and report generation.
- `Palmier Pro` shows native app + MCP integration: Swift MCP HTTP server bound to localhost, tool definitions/executor, agent panel and timeline editing actions.
- `Hermes Agent` refreshes prior Pritha knowledge: current code includes tool guardrails, memory manager, skill bundles, cron scheduler, gateway platform adapters and a Hermes-tools-as-MCP bridge for Codex app-server runtime.
- `Voicebox` shows a local voice I/O agent module: FastAPI backend, Tauri desktop, MCP tools such as speak/transcribe/profile discovery and local TTS/STT backends.

## Durable follow-up

- Update `github-agent-building-repos` with all repositories as candidate/accepted-for-review entries.
- Use SkillSpector as a strong candidate for future external skill review gates.
- Treat skill repositories as untrusted supply-chain input until pinned, scanned and reviewed according to `agent-skill-pack-lifecycle`.
- Treat multimedia projects as capability references for future child agents, not as default dependencies.
