---
id: historical-engineering-b502d2870ea9
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

## Current Architecture

- Browser owns microphone capture, Realtime WebRTC lifecycle, local transcript display, remote audio playback and the data channel.
- Server owns OpenAI API key, ephemeral Realtime credentials, SDP forwarding, origin/rate limits, tool execution, persistence and Codex orchestration.
- Realtime tools are declared in `lib/openai/realtime-tools.ts` and executed through `app/api/realtime/tool/route.ts`.
- SQLite is the operational source of truth for sessions, turns, L1/L2 memory, FESPA sources, feed cards, jobs, publications, tool events and job targets.
- Feed/publication memory is separate from generic conversation memory. This is the event/reportage lesson Pritha should reuse.


## Updated Voice-Control Boundary

The current boundary is no longer "Realtime plus Codex CLI only". It is:

- Realtime: live dispatcher and spoken UX.
- Server tool router: deterministic validation, memory writes, feed edits, gates and job creation.
- CodexTaskService: normalized deep-task boundary with request id, task type, user intent, safe metadata, constraints and expected schema.
- Codex App/server transport: preferred foreground deep-work path.
- Contract-file transport: foreground Codex App thread can write `codex_solve_decision.json` when human/Codex handoff is required.
- Codex auto/CLI transport: automated local execution when selected.
- Local queue fallback: captures tasks when Codex App is unavailable or CLI fallback is explicitly enabled.

Default deep-task tool:

- `run_codex_app_task`

Specific tools that try Codex App first and fall back when needed:

- `queue_codex_system_task`
- `queue_codex_card_update`
- `queue_codex_feed_task`
- `search_sources`
- `analyze_uploaded_media`
- `queue_translation_pass`
- `create_followup_checklist`

Legacy explicit CLI tool:

- `queue_codex_cli_task`, hidden unless `FESPA_ENABLE_CODEX_CLI_TOOL=true`.


## Event/Reportage Agent Pattern

reference-agent is the reference example for future event agents where the goal is not generic chat but building a curated public or internal feed.

Reusable modules:

- source intake from voice, text, links, files, media and drop inbox;
- operational memory for sources and feed items;
- stable feed card ids/numbers;
- queue jobs for media analysis, source verification, translation and card updates;
- reviewed/draft/publication states;
- explicit publication gate;
- public-site projection as a separate deploy step;
- runner status visible to the operator.

Do not reuse reference-agent blindly for agents that do not need a feed, publication lifecycle, event source memory or media processing.


## Useful Scaffold Patterns

- Separate live voice from durable event memory.
- Treat voice commands about product/content as feed/source tasks.
- Treat voice commands about the app itself as system-change tasks.
- Use Codex App/thread for complex operator-facing work that benefits from the current Codex context.
- Keep Codex CLI available as fallback/worker, not as the only deep-work route.
- Make fallback state explicit so the operator can see whether work is completed, pending, captured or failed.
- Preserve tool-event audit records for voice-triggered work.


## Reusable Standard Candidates

- `realtime-voice-control`: promote to active for Pritha descendants with voice plus complex tool workflows.
- `codex-task-transport`: define a standard task payload, status set, validation rule and fallback behavior for Codex App/CLI transports.
- `event-reportage-agent`: source intake, operational memory, reviewed feed cards and explicit publication gate.

