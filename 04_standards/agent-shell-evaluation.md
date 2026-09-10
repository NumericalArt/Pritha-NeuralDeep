---
id: agent-shell-evaluation
type: standard
status: draft
created: 2026-05-17
updated: 2026-06-02
last_reviewed: 2026-06-02
owner: Techscope/user
topics: [agent-shell-evaluation, ai-agents, coding-agents, codex-cli, codex-app, hermes, openclaw, claude-code, gemini-cli, user-experience, agent-memory, security]
tools: [codex, hermes, openclaw, claude-code, gemini-cli, obsidian, telegram, markdown]
sources:
  - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
  - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://github.com/NousResearch/hermes-agent
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
  - https://github.com/openai/codex
  - https://openai.com/index/introducing-the-codex-app/
  - https://arxiv.org/abs/2603.07670
  - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
related:
  reviews:
    - 03_reviews/2026-05-17-agent-shell-evaluation-review.md
    - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
    - 03_reviews/2026-06-02-codex-surfaces-enterprise-deployment-source-batch-review.md
  briefs:
    - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  workflows:
    - 07_workflows/media-intake-processing.md
    - 07_workflows/telegram-intake-bot.md
    - 07_workflows/llm-wiki-layer.md
supersedes: []
---

# Standard: agent-shell-evaluation

Status: draft
Owner: Techscope/user
Last reviewed: 2026-06-02

## Rule

При сравнении агентских сред нельзя оценивать только "качество ответа" или популярность инструмента. Нужно фиксировать runtime, дату, модель/provider, memory model, tool surface, permission model, context overhead, operator profile, evidence class and local fit.

Этот стандарт пока draft. Он задает рабочую рубрику, но не является окончательным выбором между Codex, Hermes, OpenClaw, Claude Code, Gemini CLI or future runtimes.

Для Codex отдельно фиксировать surface, а не только название продукта. Codex
может означать CLI, desktop app, IDE extension, cloud task, app-server,
MCP-server worker, MCP client, workspace agent or Bedrock-backed provider path.
Эти поверхности имеют разные operator profiles, sandboxing, auth, cloud/local
boundaries, feature availability and governance model.

## Use when

- Появляется материал о новой агентской среде, coding agent, autonomous agent, CLI agent or app shell.
- Нужно решить, что использовать для нового проекта или нового агента.
- Нужно сравнить Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI or related runtimes.
- Источник является мнением продвинутого пользователя, блогера или community report, и его нужно отделить от official docs.
- Агент будет работать через Telegram, web UI, CRM, Obsidian/wiki, shell, filesystem or other tool surface.

## Avoid when

- Материал не связан с агентами, coding workflows, tool use, memory, automation or developer workflows.
- Нужно быстро зафиксировать intake без оценки. В этом случае сначала использовать `expert-information-assessment`.
- Есть только generated wiki page без curated source artifact.

## Required practices

Каждая оценка агентской среды должна содержать:

| Field | Required meaning |
| --- | --- |
| Runtime identity | exact product/repo/surface/version/date checked |
| Surface profile | CLI, app, IDE, cloud, app-server, MCP worker, workspace agent, Bedrock-backed provider or mixed |
| Operator profile | coder, semi-technical, non-coder, business user |
| Primary task fit | coding, research, ops, CRM, media intake, personal assistant |
| Harness thickness | default context, tools, persona, memory and plugins |
| Cold-start context | approximate baseline context load if measurable |
| Context growth | observed or expected growth during long sessions |
| Memory model | files, wiki, vector DB, session search, generated skills, other |
| Write policy | who/what can write memory, skills, wiki, standards or decisions |
| Tool transparency | logs, visible tool calls, replayability, traces |
| Permission model | approvals, sandbox, allowlists, credential scope |
| Provider boundary | direct OpenAI, ChatGPT sign-in, API key, local provider, AWS Bedrock or other enterprise provider |
| Long-task behavior | progress, resume, timeout, recovery, queue semantics |
| Portability | ability to move skills, instructions, memory and workflows |
| Cost predictability | token cost, subscription/API model, rate limits |
| Failure recovery | reset, rollback, memory lint, bad-state cleanup |
| Evidence class | primary-docs, source-code, local-experiment, lived-experience, secondary-analysis, generated-wiki |

## Evidence weighting

- `primary-docs` and `source-code`: strong for capability claims.
- `local-experiment`: strongest for Techscope adoption decisions.
- `lived-experience`: strong for UX/adoption friction, weak for architecture until verified.
- `secondary-analysis`: useful for scouting, must link to primary sources.
- `generated-wiki`: navigation only; never enough for standards or decisions.

## Safety rules

- Do not promote a runtime-specific claim to standard without checking source date and version.
- Do not let self-improving skills or generated memory affect standards without provenance and review.
- Treat prompts, skills, MCP servers, plugins and generated wiki pages as supply-chain inputs.
- For Telegram/CRM/business agents, require allowlist, scoped credentials, logs and human approval for destructive actions.
- For non-coder users, user-facing bot/app responses must be concise and meaningful, not raw queue paths or implementation logs.

## Examples

### Good evaluation question

Should Techscope use Hermes as an always-on Telegram-controlled business assistant shell, while keeping Codex as the coding/repo-editing baseline?

Required evidence:

- Hermes official docs/repo for capabilities;
- local install or controlled experiment;
- community reports from the same release window;
- security review for Telegram, filesystem and credentials;
- comparison against current Codex-based Techscope workflow.

### Bad evaluation question

Which agent is best?

This is too broad. Split by task, operator, memory model, security boundary and runtime surface.

## Related decisions

- 05_decisions/2026-05-15-memory-architecture.md
- 05_decisions/2026-05-15-local-embeddings.md
- 05_decisions/2026-05-15-obsidian-sync.md

## Promotion criteria

Promote this standard from `draft` to `active` only after:

- at least one local comparison task using this rubric;
- at least 3-5 dated sources per major runtime being compared;
- one security pass for Telegram/tool/credential risks;
- one update to `07_workflows/media-intake-processing.md` or related workflow showing how the rubric is applied in normal intake.
