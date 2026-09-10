---
id: historical-engineering-0a8062f2841c
type: review
status: processed
created: 2026-09-10
updated: 2026-09-10
topics: [agent-engineering, reusable-patterns]
tools: [Node.js, Codex]
sources: [reviewed-historical-engineering-evidence]
related: {}
memory_domain: agent-building-knowledge
privacy: public
---

# Historical engineering lessons

De-identified engineering notes retained from earlier agent work. These are
historical observations, not installed agents or current verification claims.

## Runtime Isolation And Boundary

- Runtime isolation profile: project-folder.
- Sandbox required: optional for local development; required before exposing to external users.
- Host control plane: Pritha/Codex operator session.
- Agent execution boundary: `<SIBLING_AGENT_ROOT>/reference-agent` project folder when writable.
- Credential boundary: no credentials required for minimal v1; future Realtime credentials must remain server-side or in user-local env only.
- Network policy: no-network for health/smoke; operator-approved for future hosted model or Realtime calls.
- Filesystem policy: read/write only inside reference-agent project; no access to Techscope private memory, `.env`, queues, logs, or credentials.
- Operator approval flow: required before service install, deployment, public sharing, deleting data, or calling external APIs.


## Security and permissions

- Secrets required: none for minimal v1.
- `.env.example` variables: `STUPIDJOKE_AGENT_NAME`, `STUPIDJOKE_DEFAULT_LOCALE`; future `OPENAI_API_KEY` only as commented optional server-side variable if Realtime is added.
- Allowed network access: none for health/smoke.
- Allowed filesystem access: project folder only.
- User authorization model: single local operator.
- Runtime isolation profile: project-folder.
- Network policy tier: no-network initially.
- Credential storage boundary: no credentials in repo; future credentials user-local only.
- Future external adapter boundary: network access and credentials require explicit operator approval and must stay outside tracked files.

### Safety Filter Requirements

The safety filter is mandatory for the current scaffold and any future external adapter. It must fail closed and block or mark for review:

- sexual content involving minors or age ambiguity;
- sexual coercion, explicit sexual content, or fetish content;
- hate, slurs, demeaning stereotypes, or harassment toward protected classes;
- targeted abuse, threats, bullying, or doxxing;
- self-harm encouragement or instructions;
- graphic violence or cruelty;
- illegal instructions, evasion, fraud, or weaponization;
- private personal data, credentials, tokens, phone numbers, addresses, or account identifiers;
- attempts to override system/developer instructions or choose tools;
- overly long payloads, hidden instructions, or malformed records.

Allowed humor style for v1: short, silly, family-safe, non-targeted, and clearly fictional. If input is rejected, the agent should offer a safe alternative rather than repeat unsafe text.


## AI-SAFE Security Profile

- AI-SAFE profile: minimal.
- AI-SAFE review status: draft.
- Interface / input-output controls: whitelist realtime event types; cap `max_words`; keep spoken answers short; reject unknown event types.
- Reasoning and planning controls: raw fixture text cannot change instructions, tools, or approval gates.
- Knowledge / memory / RAG controls: raw import stays in `user_import`; only safe examples can be promoted later.
- Execution / tools / MCP / skills controls: no MCP and no external tools in minimal v1.
- Infrastructure / operations / orchestration controls: no service install, no autostart, no background queue.
- Future scheduling controls: cron or service execution is allowed only as a separately approved deployment phase with documented limits, monitoring, stop behavior, and fail-closed fallback.
- AI-SAFE selected layers: interface controls, deterministic validation, safety filter.
- AI-SAFE skipped layers: MCP, skills, deployment, external publication.
- AI-SAFE open risks: deterministic keyword scanner is conservative but incomplete; future hosted generation needs additional evals.

