---
id: realtime-voice-control-for-codex-agents
type: standard
status: active
created: 2026-05-25
updated: 2026-07-13
last_reviewed: 2026-05-31
owner: Techscope/user
topics:
  - agent-engineering
  - voice-agents
  - realtime
  - codex-app
  - codex-cli
  - codex-sidecar
  - harness-engineering
tools:
  - OpenAI Realtime API
  - gpt-realtime-2
  - Codex App
  - Codex CLI
  - WebRTC
  - SQLite
agent_platforms:
  - Codex
  - OpenAI Realtime API
model_context:
  - gpt-realtime-2
  - gpt-realtime-mini
runtime_environment:
  - web-ui
  - local-project
  - mac
config_surfaces:
  - AGENTS.md
  - realtime instructions
  - tool schemas
  - server routes
  - codex task service
  - queue scripts
  - operations manifest
portability: adapter-needed
sources:
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/current-architecture.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/codex-in-the-loop.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/codex-cli-enrichment.md
  - <SIBLING_AGENT_ROOT>/FESPA26/docs/harness-architecture.md
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/openai/realtime-tools.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/realtime/instructions.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/app/api/realtime/tool/route.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/service.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/factory.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/adapters/codex-app-server-client.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/adapters/codex-session-contract-client.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/adapters/codex-auto-client.ts
  - <SIBLING_AGENT_ROOT>/FESPA26/lib/codex-task/voice-codex-registry.ts
  - 11_agents/contracts/2026-05-25-fespa26-agent-contract.md
  - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  - 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
  - 11_agents/reference-implementations/fespa26-voice-control/manifest.json
  - 07_workflows/realtime-voice-control-kit.md
  - 11_agents/reports/2026-05-30-fespa26-voice-control-pattern-ingestion-report.md
  - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  - 04_standards/realtime-voice-control-ui.md
  - 04_standards/tailscale-private-device-access-for-local-agents.md
related:
  decisions:
    - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  reviews:
    - 11_agents/reports/2026-05-25-fespa26-agent-post-creation-review.md
    - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
    - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
    - 11_agents/reports/2026-05-30-fespa26-voice-control-pattern-ingestion-report.md
  briefs: []
  standards:
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/tailscale-private-device-access-for-local-agents.md
  reports:
    - 11_agents/reports/2026-05-29-fespa26-agent-test-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-05-31
source_version: FESPA26 local implementation inspected 2026-05-30; Pritha reference pack v1; UI and Tailscale companion patterns v1
retrieved: 2026-05-30
verified: 2026-06-24
valid_for: Codex-native agents with realtime voice UI, explicit server-side tools and deep-work transport
temporal_status: version-bound
---

# Standard: Realtime Voice Control For Codex Agents

Status: active
Owner: Techscope/user
Last reviewed: 2026-06-24

## Rule

For voice-controlled Codex agents, separate live speech, deterministic actions and deep work.

Use the Realtime model as the low-latency voice dispatcher. Put durable actions behind narrow server tools. Route complex tasks through a Codex transport layer: Codex App/thread for foreground deep work when available, Codex CLI/queue for fallback, automation or worker execution.

This is a reusable Pritha pattern. FESPA26 is the event/media/feed example; Funny Teacher is the language-learning example. The reusable part is the boundary, not the domain UI.

Companion patterns are intentionally separate:

- `04_standards/realtime-voice-control-ui.md` defines the first reusable voice UI control surface.
- `04_standards/tailscale-private-device-access-for-local-agents.md` defines private phone/device access for local agents.

Pritha carries the source-level FESPA26 reference pack at `11_agents/reference-implementations/fespa26-voice-control/`. Use `node scripts/voice-control-kit.mjs plan` for discovery and `node scripts/voice-control-kit.mjs copy --target sibling:child-agent` only when the descendant contract explicitly selects browser Realtime voice plus Codex deep-task transport. The logical `sibling:` target resolves through `PRITHA_AGENT_PARENT`.

## Use When

- The agent needs fast spoken interaction.
- The user must trigger file, media, web, memory, code or publication workflows from voice.
- The system needs durable artifacts such as reports, feed cards, lesson records, memory entries, decisions or task logs.
- Complex work can take longer than a natural voice turn.
- The operator needs an explicit handoff between "I heard you" and "Codex is solving it".

## Avoid When

- The task is pure transcription or simple voice chat with no durable actions.
- There is no trusted server boundary for secrets and tools.
- The voice model would need to perform destructive, public or filesystem actions directly.
- The deployment cannot tolerate microphone, WebRTC or secure-context constraints.
- The project has no way to show pending deep-task status or recover from failed transport.

## Required Practices

- Keep the OpenAI API key on the server. The browser receives only ephemeral Realtime credentials.
- Let the browser own microphone capture, remote audio playback, Realtime data-channel handling and local transcript display.
- Keep Realtime instructions concise and operational.
- Define domain-specific tools with narrow arguments and server-side validation.
- Treat Realtime tools as intent routers, not broad powers.
- Store durable results in local memory or a domain repository; tool responses are only summaries.
- Route public, destructive, expensive or long-running actions through explicit gates.
- Use Codex App/thread as the preferred transport for complex foreground tasks when the operator expects Codex to solve the task in the current working context.
- Use Codex CLI as a fallback, autonomous queue worker or local sidecar where Codex App transport is unavailable or the task is intentionally backgrounded.
- Keep task payloads structured: request id, task type, user intent, safe ids/metadata, constraints and expected response schema.
- Strip secrets, tokens, credentials and unnecessary raw media from Codex task payloads.
- Validate Codex outputs before applying them. Accept only known statuses and expected JSON/data shapes.
- Fail closed: if Codex App, Codex CLI or output validation fails, keep the voice session alive and record the failed/pending task.
- Keep publication, deletion, deployment, service install and broad system changes behind explicit operator approval.
- For cross-session continuity, use one bounded summary-only rolling handoff file
  per voice/control subject or project. Overwrite it in place; do not append raw
  transcript history.
- Expose the rolling handoff to Realtime through an explicit recall tool, not as
  automatic startup context. The model should call the recall tool only when the
  operator asks about the prior session, prior discussion or previous handoff.
- When constructing descendants, add a `realtime-voice` interface placeholder if the contract mentions voice/realtime. Copy the FESPA26 reference code only after adapting domain tools, env prefixes, repositories and confirmation gates.

## Universal Architecture

```text
Browser voice UI
  -> Realtime session and data channel
  -> server realtime tool route
  -> deterministic domain tools and repository writes
  -> CodexTaskService for complex tasks
     -> Codex App/thread transport when available
     -> contract-file handoff when foreground Codex must decide
     -> Codex CLI/auto transport or local queue fallback
  -> durable memory, job state and operator-visible status
```

The important lanes:

- `voice lane`: low-latency conversation, clarification and short status.
- `tool lane`: validated local reads/writes and approval gates.
- `deep-task lane`: Codex App/thread or Codex CLI solves high-context tasks.
- `queue lane`: background jobs, retries, stale-lock recovery and structured results.
- `artifact lane`: reports, feed cards, memory entries, lessons or code changes.
- `handoff lane`: bounded summary-only rolling checkpoint for the next session,
  loaded only through explicit recall.

## Rolling Handoff And Live Sticky Context

Rolling handoff and sticky context solve different problems:

- Rolling handoff is a private summary-only checkpoint between sessions. It
  should include the latest task, status, key resources, confirmed constraints
  and accesses without secrets, next step, latest Realtime session summary and
  latest Codex task summary. It must have a hard byte limit and deterministic
  redaction.
- Rolling handoff is not curated long-term memory. It is a current handoff file,
  overwritten in place.
- Rolling handoff must not be injected automatically at Realtime session start.
  The Realtime model may access it only through a named tool such as
  `recall_rolling_summary` after the operator asks about the prior session or
  asks to continue from the prior handoff.
- Sticky context is live context inside the currently open Realtime session. It
  may send bounded current-session events and recent task state through the data
  channel after key Codex events. It is not cross-session storage and must not
  read the rolling handoff file.

## FESPA26 Reference Flow

FESPA26 applies the pattern to event reporting and media processing:

1. Operator speaks through a browser Realtime call.
2. Realtime chooses a narrow server tool such as `save_fespa_source`, `queue_codex_card_update`, `search_sources`, `analyze_uploaded_media`, `queue_translation_pass` or `queue_codex_system_task`.
3. Server tool validates intent, separates feed/publication material from system-change commands and writes source/feed/job state to SQLite.
4. Deep tasks go through `CodexTaskService`.
5. Default provider is `codex-app-server`; other supported transports are `codex-auto`, `codex-session` and `codex-app-http`.
6. When the active runtime setting chooses CLI, or when Codex App is unavailable and fallback is enabled, the task is captured in the local Codex CLI queue.
7. The queue runner processes feed/media/search/card jobs read-only and system-change jobs with workspace-write sandbox.
8. Publication remains a separate explicit confirmation gate.

FESPA26-specific domain memory:

- `fespa_sources`
- `fespa_feed_items`
- `fespa_jobs`
- `fespa_publications`
- `fespa_tool_events`
- `fespa_job_targets`

This makes FESPA26 a reusable example for event agents: collect field material, update memory, process media/sources, generate reviewed reportage cards and publish only after approval.

## Funny Teacher Reference Flow

Funny Teacher applies the same boundary to a learning domain:

1. Realtime is the live teacher.
2. Server tools search lesson memory, record attempts and set outcomes.
3. SQLite stores lessons, attempts, weak points and completions.
4. User-selected memory focus and explicit reset keep retrieval controllable.

Funny Teacher confirms that the pattern is not limited to event/media work. It is reusable wherever voice UX must control durable memory and task-specific tools.

## Agent Environment Compatibility

- Agent platforms: Codex-native agents with optional OpenAI Realtime voice layer.
- Model context: observed with `gpt-realtime-2` and cheap-mode `gpt-realtime-mini`.
- Runtime environment: local Next.js web UI, server API routes, local SQLite, Codex App/CLI transports.
- Config surfaces: `AGENTS.md`, realtime instructions, tool schemas, server routes, codex task service, queue scripts, operations manifest.
- Portability: adapter-needed.
- Codex adaptation: keep voice prompts, deterministic tool contracts, Codex App task prompts and Codex CLI queue prompts separate.
- Environment-specific caveats: browser microphone permissions, WebRTC availability, Realtime session format, Codex App app-server protocol, Codex CLI auth and sandbox behavior.

## Temporal Validity

- Source published: unknown.
- Source updated: 2026-06-24.
- Source version: FESPA26 local implementation inspected 2026-05-29.
- Retrieved: 2026-05-29.
- Verified: 2026-06-24.
- Valid for: Codex-native agents with realtime voice UI, explicit server tools and deep-work transport.
- Freshness status: current.
- Temporal status: version-bound.
- Recheck when: OpenAI Realtime session/call format changes, Codex App app-server transport changes, Codex CLI `exec --ephemeral` or sandbox behavior changes, rolling handoff privacy rules change, or a third voice agent exposes a contradictory boundary.

## Examples

- FESPA26: voice-controlled event/media/reportage agent. Realtime handles operator dialogue; server tools update FESPA memory and feed state; Codex App/CLI handles source search, media analysis, card updates, translation, follow-up checklists and system changes.
- Funny Teacher: voice-controlled learning agent. Realtime handles teaching dialogue; server tools manage lesson memory and outcomes.

## Related Decisions

- `05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md`
