---
id: 2026-05-18-techscope-agents-mother-scenario-review
type: review
status: draft
created: 2026-05-18
updated: 2026-05-18
topics: [agents-mother, agent-factory, harness-engineering, agent-scaffolding, codex, techscope, agent-specification]
tools: [codex, markdown, openai-agents-sdk, codex-cli, claude-code, langgraph]
sources:
  - 00_inbox/texts/2026-05-18-techscope-agents-mother-scenario-intake.md
  - 04_standards/agent-shell-evaluation.md
  - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
  - https://developers.openai.com/api/docs/guides/agents
  - https://github.com/openai/codex
  - https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
  - https://www.anthropic.com/engineering/building-effective-agents
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://www.langchain.com/blog/runtime-behind-production-deep-agents
related:
  intakes:
    - 00_inbox/texts/2026-05-18-techscope-agents-mother-scenario-intake.md
  standards:
    - 04_standards/agent-shell-evaluation.md
  briefs:
    - 02_briefs/2026-05-17-medium-harness-engineering-six-layer-brief.md
recommendation: implementation-plan
---

# Review: Techscope Agents Mother

Date: 2026-05-18
Status: draft

## Question

How should Techscope create new agents from user goals and technical specifications while preserving harness quality, source verification, safety and reproducibility?

## Proposed scenario

`Techscope - Agents Mother` is a new scenario where Techscope becomes an agent factory:

- elicit or accept a target-agent specification;
- research relevant architectures and tools from Techscope memory plus current official/web sources;
- choose a runtime/shell pattern;
- scaffold a sibling project folder;
- write agent instructions, workflows, tools, validation and onboarding docs;
- test the result;
- train the user to operate the new agent.

## Runtime options

| Option | Fit | Notes |
| --- | --- | --- |
| Codex project agent | Best default for coding/project agents | Uses sibling folder, `AGENTS.md`, scripts, tests, local files |
| Codex CLI wrapper | Good for terminal-first repeatable agent | Needs CLI commands, config, permissions, logs |
| API-based agent | Good for productized app/bot | Needs OpenAI Agents SDK or similar orchestration, state, guardrails |
| Local-model agent | Good for privacy/offline constraints | Needs inference stack, evals, model limits, hardware check |
| Hybrid Telegram/web agent | Good for non-coder workflows | Needs queue, concise responses, allowlist, media pipeline |

## Harness requirements

Use six harness layers:

1. Information boundaries: role, mission, source of truth, output contracts.
2. Tool system: tools, when to use them, filtered outputs, permissions.
3. Execution orchestration: workflow states, queues, routing, handoff rules.
4. Memory and state: short-term task state, long-term memory, generated wiki if useful.
5. Evaluation and observability: tests, lint, logs, traces, screenshots, metrics.
6. Constraints, validation and recovery: guardrails, retry/fallback, rollback, human approval.

## Evidence from current validation

- OpenAI Agents SDK docs separate direct API clients from SDK-owned orchestration, tools, approvals and state.
- OpenAI agent guide recommends starting with a single agent and moving to multi-agent only when tool/instruction complexity requires it.
- OpenAI guardrails docs distinguish input, output and tool guardrails; tool guardrails matter for every function call.
- OpenAI Codex repo describes Codex CLI as a local coding agent, suitable as a project/sibling-folder baseline.
- Anthropic recommends simple composable workflows, focused tools and clear success criteria; coding agents are especially suitable because tests provide feedback.
- Anthropic context engineering guidance supports tight context, minimal viable tool sets, just-in-time retrieval, compaction, notes and subagents.
- LangGraph production-agent guidance emphasizes durable execution, checkpointing, retries, human-in-the-loop and separate short/long-term memory.

## Risks

- Copying Techscope 1:1 creates overbuilt agents for simple tasks.
- Asking too few questions creates vague agents with no verification.
- Asking too many questions blocks momentum.
- API/local-model agents have security, cost and deployment complexity not present in a Codex-project agent.
- Generated agent instructions can drift unless tests and maintenance docs are created.

## Recommendation

Create `Agents Mother` as a workflow and script-assisted scaffold, not as a fully autonomous black box.

Default path:

1. Intake/spec interview.
2. Agent-shell evaluation.
3. Harness design.
4. Sibling folder scaffold.
5. Validation and smoke tests.
6. User onboarding.
7. Memory registration in Techscope.

## Open questions

- Should v1 generate only Codex-project agents, or support API/CLI/local model branches immediately?
- What should be the canonical sibling folder root?
- Should created agents get their own Obsidian/Markdown memory by default?
- Do we want a reusable `scripts/create-agent.mjs` scaffold generator in Techscope?
- Should every created agent be registered in a Techscope index/catalog?

## Next artifact

implementation-plan
