---
id: historical-engineering-74e4358f834b
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

## Current Architecture Snapshot

- reference-agent is a local Next.js web app with a three-tab operator UI: Voice, Feed and Settings.
- Voice uses OpenAI Realtime through browser WebRTC. The default model is `gpt-realtime-2`; cheap mode uses `gpt-realtime-mini`.
- The browser owns microphone capture, remote audio playback, transcript rendering and the `oai-events` data channel.
- Server routes mint ephemeral Realtime sessions, proxy SDP, execute tool calls and keep the OpenAI API key out of the browser.
- SQLite is the operational source of truth for sources, feed items, jobs, sessions, turns and memory.
- Codex CLI is used as a sidecar, not as the direct low-latency speaker.
- Heavy work runs through a sequential local queue with `data/locks/fespa-jobs-run.lock/`.
- Public feed publishing is gated; draft/reviewed cards can be edited and only explicitly published.


## Voice Control Pattern

The reusable pattern is `Realtime dispatcher + deterministic tools + Codex sidecar`.

1. The browser starts a WebRTC call and opens a Realtime data channel.
2. The server creates an ephemeral Realtime session with concise instructions, `semantic_vad`, input transcription and a domain-specific tool list.
3. The Realtime model handles natural voice, chooses tools by operator intent, and gives short spoken status updates.
4. Tool calls go to `/api/realtime/tool`, where deterministic server code saves sources, reads state, queues Codex jobs, updates drafts or gates publication.
5. Finalized dialogue turns are deduplicated and chunked. reference-agent currently waits for a multi-turn chunk with both user and assistant turns before asking Codex for enrichment.
6. `/api/realtime/orchestrate` sends the chunk through the same conductor path as text chat, but marks it as `source: realtime_chunk`.
7. For realtime chunks, Codex runs in read-only, approval-never, ephemeral mode and returns a short enrichment fragment, not a full user-facing answer.
8. The browser injects that fragment into the live Realtime session via `session.update`; the voice model can use it naturally in a later answer.
9. Separately, longer queue jobs run Codex with task-specific JSON contracts to refine cards, analyze media, verify sources or implement system changes.

This pattern is portable to future agents if the domain tools are replaced. The stable part is the boundary: Realtime is the low-latency conversational dispatcher; Codex is the slower verifier, synthesizer and implementation sidecar.


## Useful Scaffold Patterns

- Interface choices are explicit and inspectable through `interfaces/manifest.json`.
- Memory profile is separated from agent instructions and can evolve without rewriting `AGENTS.md`.
- Tool boundaries are documented before adding external capabilities.
- Deployment, proactivity and service behavior are represented as an operations manifest.
- Smoke test gives a cheap acceptance gate for scaffold changes.
- Deployment automation is separated from scaffold and mutation requires explicit confirmation.
- Realtime voice is kept separate from heavy reasoning; this keeps the call responsive even when Codex is slow or unavailable.
- Tool-call responses are short and human-readable, while durable work is represented as jobs, feed cards and source records.
- Queue processing is sequential and lock-protected, which is enough for a single-operator local agent.
- System-change requests are routed away from publication/feed sources and into a separate Codex system-task lane.


## Failed Assumptions

- Some inherited documentation still mentions `fast_talk` or older three-tool realtime surfaces; future reports should trust current code over stale docs.
- reference-agent was not registered with a pre-creation contract in Techscope, so this review adds a retrospective accepted contract.
- The project is a working local agent, not yet evidence for promoting every pattern to active standards.


## Reusable Standard Candidates

- Consider promoting generated manifest triad plus smoke test as a reusable minimum scaffold pattern after one more successful agent.
- Promote `Realtime dispatcher + Codex sidecar` as a draft standard now, and mark it active only after a second agent reuses it successfully.
- Consider a future standard for explicit lanes: realtime voice, deterministic tools, queue jobs, system-change tasks and publication gates.


## Outdated Or Risky Patterns

- Documentation drift risk: local docs should be updated when realtime tools or queue semantics change.
- Single-operator/no-auth assumption is acceptable for local Tailscale use, but not for multi-user or public deployment.
- Realtime tool selection depends on prompt discipline; destructive or public actions must remain server-gated.
- Codex sidecar output parsing depends on JSON contracts for queue jobs and plain-text contracts for realtime enrichment; malformed output must fail closed.

