---
id: 2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief
type: brief
status: draft
created: 2026-05-17
updated: 2026-06-01
topics:
  - openclaw
  - hermes
  - codex-cli
  - ai-agents
  - user-experience
  - non-professional-users
  - agent-memory
  - llm-wiki
  - telegram-agents
tools:
  - openclaw
  - hermes
  - codex
  - obsidian
  - telegram
  - youtube
  - mlx-whisper
sources:
  - source-1a9cb686-2cd6-4f6d-bb1f-e2335cfb5570
related:
  workflows:
    - 07_workflows/privacy-preserving-intake.md
source_type: telegram
source_class: telegram
ingested_at: 2026-05-17
processed_at: 2026-06-01T21:03:38.435Z
retention_status: source-purged
usefulness: medium
evidence_quality: medium
anonymous_source_id: source-1a9cb686-2cd6-4f6d-bb1f-e2335cfb5570
---

# Artifact: source-1a9cb686-2cd6-4f6d-bb1f-e2335cfb5570

Date: 2026-05-17
Status: draft
Source class: telegram
Retention: source-purged

Date: 2026-05-17
Status: draft

## Summary

Видео полезно как UX-свидетельство продвинутого пользователя, который не является профессиональным разработчиком, но активно использует агентские системы. Его главный практический вывод: выбор агентской среды для реальной работы определяется не "самым умным" ответом, а стабильностью контура, управлением памятью, стоимостью контекста, прозрачностью tools/skills and recovery after restart.

## Key claims

- Agent shells differ mainly by harness thickness: how much context, tools, persona and memory they inject before the model answers.
- Rich/personal shells can be pleasant for individual use, but may accumulate context and become costly or unstable under heavy customization.
- Hermes-like self-improving skill workflows are attractive for business/autonomous tasks, but the claim must be verified against official Hermes docs and observed behavior.
- For non-coders, a useful agent must accept ordinary requests through Telegram or another familiar UI and hide command-line repair work.

## Evidence

- Karpathy LLM Wiki gist, 2026-04-04, describes raw sources, generated wiki and schema as separate layers, with index/log operations.
- NousResearch `hermes-agent` repo describes skill learning, multi-provider support, gateways, memory/search and subagent delegation.
- Hermes Codex runtime docs say Codex app-server integration is opt-in and that some Hermes loop tools such as delegate_task/memory/session_search/todo are not available in stateless Codex runtime mode.
- OpenAI Codex repo/docs position Codex CLI as a local coding agent; OpenAI Codex app article frames app/CLI/IDE/cloud as related but distinct surfaces.
- arXiv memory survey frames agent memory as a write-manage-read loop and highlights privacy governance, contradiction handling and latency budgets.
- Community reports found during web check broadly match the "thin wrapper vs heavy shell" tension: some users prefer Codex as the core agent with a small messaging wrapper, while some Hermes/OpenClaw switchers report mixed results around setup, bloat and token usage.

## Risks and caveats

- Exact "OpenClaw/OpenClow/Crab" identity is unclear and must be pinned before project-specific conclusions.
- Some web sources around OpenClaw/Hermes look promotional or inconsistent; prefer official repo/docs and dated community reports.
- Self-improving skills and auto-written wiki memory increase stale-memory, prompt-injection and accidental-permission risks.
- Business/CRM agent recommendations need separate privacy/security review before implementation.

## Recommendation

Accept as a significant UX/adoption signal. Do not convert directly into a standard.

Add a reusable comparison rubric for future agent architecture materials:

- operator type: coder, semi-technical, non-technical;
- runtime/shell: Codex CLI, Codex app, Hermes, OpenClaw, Claude Code, Gemini CLI, etc.;
- cold-start context and context growth;
- memory model and write policy;
- tool/skill transparency;
- long-task reliability;
- recovery path after bad state;
- cost predictability;
- security boundary and approval model;

## Next step
