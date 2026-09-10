---
id: 2026-06-23-last30days-external-research-backend-runbook
type: workflow
status: active
created: 2026-06-23
updated: 2026-06-25
topics:
  - pritha
  - external-research
  - child-agents
  - last30days
  - scaffold-gate
tools:
  - Pritha CLI
  - last30days-skill
  - Python
  - Codex
sources:
  - tools/external-research/last30days-lock.json
  - scripts/external-research-tools.mjs
  - scripts/agents-mother/external-research-last30days.mjs
  - scripts/agents-mother/index.mjs
  - 07_workflows/2026-06-22-pritha-child-agent-external-research-gate-implementation-plan.md
  - https://github.com/mvanhorn/last30days-skill
  - 07_workflows/2026-06-25-pritha-last30days-voice-tool-plan.md
related:
  workflows:
    - 07_workflows/2026-06-22-pritha-child-agent-external-research-gate-implementation-plan.md
    - 07_workflows/2026-06-25-pritha-last30days-voice-tool-plan.md
    - 07_workflows/agents-mother.md
  reviews:
    - 03_reviews/2026-06-22-last30days-skill-pritha-harness-assessment.md
supersedes: []
superseded_by: []
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: workflow
  id: last30days-external-research-backend
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Workflow: last30days external research backend

## Canonical command

Use this command to complete the external-research part of a Pritha child-agent
research gate with the pinned `last30days` backend:

```sh
node scripts/pritha.mjs external-research <contract-path> --backend last30days
```

`<contract-path>` must point to an accepted or draft agent contract under
`11_agents/contracts/`. Run the local memory research step first:

```sh
node scripts/pritha.mjs research <contract-path>
```

## When to run

Run the command after `research <contract-path>` and before `scaffold
<contract-path>` whenever the contract has volatile external choices: current
APIs, runtime models, Realtime/voice behavior, Telegram, MCP, deployment,
security constraints, dependency versions, local inference, RAG/storage or other
internet-sensitive topics.

For child-agent creation and scaffold gates, Voice Control must not call raw
`last30days` directly. Voice Control creates a Codex `agent_creation` task; that
Codex task runs `research`, then `external-research`, then scaffold only after
the research gate is complete.

For quick spoken freshness checks, Pritha Voice Control may call the narrow
`recent_external_research` Realtime tool. That tool is a Pritha-owned
no-secret wrapper around `scripts/external-research-tools.mjs recent
last30days`; it returns a bounded voice-ready research brief and stores raw
output only in private runtime artifacts. It does not replace this child-agent
research gate and must not be treated as enough evidence to scaffold, publish or
change standards without Codex/primary-source follow-up.

## Preconditions

Check backend readiness:

```sh
npm run external-research-tools -- status
```

Expected ready state:

- `status: ready`
- `python.ok: true`
- `installed: true`
- `currentCommit` equals the commit in `tools/external-research/last30days-lock.json`

If the backend is not installed:

```sh
node scripts/external-research-tools.mjs install last30days --yes
node scripts/external-research-tools.mjs diagnose last30days
```

The install writes only to ignored `.tools/`. It must not vendor
`last30days-skill` into tracked project code.

## Result

The command updates the matching `11_agents/research/...` report. A successful
run sets:

- `research_gate_status: complete`
- `external_research_status: complete`
- `external_research_backend: last30days`
- `synthesis_status: complete`

Scaffold is allowed only after the research report references the contract and
the research gate is complete, unless the user explicitly chooses an
experimental override.

## Voice quick research command

Use this only through the `recent_external_research` Voice Control tool or for a
local smoke test of that tool surface:

```sh
node scripts/external-research-tools.mjs recent last30days --query "<topic>" --days 30 --mode quick
```

Default sources are `reddit,hackernews,polymarket,grounding`; `github` and
`jobs` are also allowed as public no-secret sources. Private social/video
platform sources, browser cookies, ScrapeCreators, Perplexity, paid APIs, private auth,
`--store`, watchlists, publish/setup and scheduler behavior remain out of scope
for default voice runs.

## Safety Notes

The Pritha backend runs `last30days` in a sanitized environment:

- browser cookie extraction is disabled with `FROM_BROWSER=off`;
- Codex auth file is disabled with `CODEX_AUTH_FILE=/dev/null`;
- global `last30days` config and memory store are disabled;
- secret-like env variables are stripped;
- the backend uses keyless-first sources by default.

If `last30days` is unavailable or returns insufficient evidence, use curated
manual evidence instead:

```sh
node scripts/pritha.mjs external-research <contract-path> --backend manual --input evidence.json
```
