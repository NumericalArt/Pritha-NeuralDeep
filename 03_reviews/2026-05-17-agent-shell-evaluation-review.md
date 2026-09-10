---
id: 2026-05-17-agent-shell-evaluation-review
type: review
status: draft
created: 2026-05-17
updated: 2026-05-17
topics: [agent-shell-evaluation, ai-agents, coding-agents, codex-cli, codex-app, hermes, openclaw, claude-code, gemini-cli, user-experience, agent-memory, security]
tools: [codex, hermes, openclaw, claude-code, gemini-cli, obsidian, telegram, markdown]
sources:
  - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
  - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  - 01_sources/notes/2026-05-17-openclaw-hermes-codex-cli-advanced-user-source-note.md
  - 01_sources/signals/2026-05-17-youtube-transcript-openclaw-hermes-и-codex-cli-какой-ai-агент-выбрать-сейчас-signal.md
  - anonymous incoming video source (purged)
  - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
  - https://github.com/NousResearch/hermes-agent
  - https://hermes-agent.nousresearch.com/docs/user-guide/features/codex-app-server-runtime
  - https://github.com/openai/codex
  - https://openai.com/index/introducing-the-codex-app/
  - https://arxiv.org/abs/2603.07670
related:
  briefs:
    - 02_briefs/2026-05-17-openclaw-hermes-codex-cli-advanced-user-brief.md
  reviews:
    - 03_reviews/2026-05-17-openclaw-hermes-codex-cli-advanced-user-assessment.md
  standards:
    - 04_standards/agent-shell-evaluation.md
  workflows:
    - 07_workflows/media-intake-processing.md
    - 07_workflows/telegram-intake-bot.md
    - 07_workflows/llm-wiki-layer.md
---

# Review: agent-shell-evaluation

Date: 2026-05-17
Status: draft

## Question

Как Techscope должен сравнивать разные агентские среды и оболочки: Codex CLI/app, Hermes, OpenClaw, Claude Code, Gemini CLI and future agent runtimes?

Нужен единый evaluation contract, чтобы не смешивать:

- официальные возможности runtime;
- мнение блогеров и advanced users;
- реальные локальные эксперименты;
- UX для не-разработчиков;
- security posture and permission model.

## Options

1. Оценивать агентские среды ad hoc под каждую задачу.
2. Оценивать только по официальным docs/repo and feature lists.
3. Оценивать только по lived experience and community reports.
4. Использовать смешанную рубрику: official evidence + lived experience + local experiment + security/DX review.

## Comparison

| Option | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| Ad hoc | Быстро, мало overhead | Невоспроизводимо, легко поддаться hype | Низкий |
| Official docs only | Хорошо для capabilities and version facts | Плохо показывает реальные friction points | Средний |
| User reports only | Хорошо показывает UX pain and adoption | Субъективно, часто непроверяемо | Средний |
| Mixed rubric | Балансирует факты, опыт и локальную проверку | Требует дисциплины и шаблона | Высокий |

## Evaluation rubric

Для каждой среды фиксировать:

| Dimension | What to record | Why it matters |
| --- | --- | --- |
| Runtime identity | product/repo, version, date checked, provider/model | Agent surfaces change quickly |
| Operator profile | coder, semi-technical, non-coder, business user | Good UX differs by user class |
| Primary task fit | coding, research, ops, CRM, media intake, personal assistant | Avoid one-size-fits-all conclusions |
| Harness thickness | system files, persona, tools, memory, plugins loaded by default | Predicts context bloat and maintainability |
| Cold-start context | approximate startup token load and mandatory files | Shows baseline cost |
| Context growth | how much state accumulates over several tasks | Shows long-session failure risk |
| Memory model | files, wiki, vector DB, session search, learned skills | Determines recall and stale-memory risk |
| Write policy | who can write memory/skills/wiki and when | Prevents accidental standards drift |
| Tool transparency | visible tool/skill trace, logs, replayability | Required for debugging and trust |
| Permission model | approval modes, sandbox, allowlists, secrets handling | Core security boundary |
| Long-task behavior | can run for hours, resume, recover, report progress | Needed for coding and research agents |
| Portability | can move skills/rules/context between runtimes | Reduces lock-in |
| Cost predictability | token use, subscription/API model, rate limits | Affects practical adoption |
| Failure recovery | reset, rollback, memory lint, bad-state cleanup | Determines real reliability |
| Evidence quality | official docs, code, benchmark, user report, local test | Keeps claims honest |

## Evidence classes

Use explicit evidence labels:

| Evidence class | Examples | Weight |
| --- | --- | --- |
| `primary-docs` | official docs, changelog, repo README | High for capabilities |
| `source-code` | repo implementation, tests, issues | High for actual behavior |
| `local-experiment` | Techscope task run with logs and outputs | High for our use cases |
| `lived-experience` | advanced-user video, blog, forum report | High for UX; medium/low for architecture |
| `secondary-analysis` | benchmark article, comparison blog | Medium, requires source check |
| `generated-wiki` | `10_wiki/` pages | Navigation only |

## Expert notes

### Architecture

Agent shells are not interchangeable just because they can call the same model. Compare their harness boundaries: context injection, memory read/write, plugin routing, subagent semantics, queue behavior, permissions and state persistence.

Default Techscope baseline remains Codex-centered because this project already runs on Codex, Markdown source artifacts, local scripts, SQLite/embeddings and Obsidian/wiki layer.

### Security

Any agent with Telegram, CRM, filesystem, shell, browser, email or calendar access needs:

- single-user or explicit allowlist;
- scoped credentials;
- no secrets in repo;
- logs for external actions;
- human approval for destructive actions;
- separate treatment of raw external input because prompt injection can arrive through messages, web pages, transcripts, PDFs and screenshots.

Self-improving skills and auto-written memory must be reviewed like executable supply chain.

### Developer Experience

For developers, CLI/app surfaces and source-controlled harness files are acceptable. For non-coders, the correct interface is usually Telegram/web/app plus concise human-readable results. Do not expose implementation paths, queue ids and technical logs as the primary user-facing response.

### Product Pragmatist

Do not migrate Techscope to a new shell because one video likes it. Use this rubric when a concrete job appears: long coding task, business assistant, always-on Telegram agent, CRM workflow, media pipeline, research wiki, mobile-first assistant.

### Research Scout

Always record publication/release dates. Agent ecosystems are moving fast enough that a useful claim can become stale in weeks.

### Standards Editor

Create `04_standards/agent-shell-evaluation.md` as draft. Promote to active only after at least one local comparison task and 3-5 sources per major runtime.

## Recommendation

Adopt the mixed rubric as a draft working rule now.

Use it for all future comparisons of Codex, Hermes, OpenClaw, Claude Code, Gemini CLI and related environments. Do not use advanced-user opinions as proof of architecture, but do preserve them as high-value UX evidence.

