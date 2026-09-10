---
id: realtime-voice-control-ui
type: standard
status: active
created: 2026-05-31
updated: 2026-06-24
last_reviewed: 2026-05-31
owner: Techscope/user
topics:
  - voice-control
  - realtime
  - ui-pattern
  - agent-ux
  - pritha
tools:
  - OpenAI Realtime API
  - WebRTC
  - Next.js
  - Codex
agent_platforms:
  - Codex
model_context:
  - gpt-realtime-2
  - gpt-realtime-mini
runtime_environment:
  - browser
  - local-web-app
  - codex-desktop
config_surfaces:
  - UI components
  - hooks/use-realtime-call.ts
  - realtime instructions
  - server routes
  - operations manifest
portability: adapter-needed
sources:
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 11_agents/reference-implementations/fespa26-voice-control/source/hooks/use-realtime-call.ts
  - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
  - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
  - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
related:
  decisions:
    - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  reviews:
    - 11_agents/reports/2026-05-26-funny-teacher-v1-agent-post-creation-review.md
    - 11_agents/reports/2026-05-29-funny-teacher-pritha-reference-example.md
  briefs: []
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-29
source_updated: 2026-05-31
source_version: initial reusable voice-control UI pattern v1
retrieved: 2026-05-31
verified: 2026-06-24
valid_for: Pritha descendants with browser-based realtime voice control
temporal_status: version-bound
---

# Standard: realtime voice control UI

Status: active
Owner: Techscope/user
Last reviewed: 2026-05-31

## Rule

Treat voice control UI as a separate reusable pattern from the realtime transport pattern.

The first Pritha voice UI template is a compact browser control surface around a live Realtime session: start/stop, mute, reconnect, connection status, transcript, memory/context reset, deep-task status and explicit approval gates.

This is the default initial UI for voice-enabled descendants until a contract selects another voice UI pattern.

## Use when

- A descendant agent uses browser-based OpenAI Realtime voice.
- The user must operate the agent from a laptop or phone browser.
- Voice commands can trigger durable memory writes, job queues, Codex tasks or publication workflows.
- The operator needs visible state for "listening", "working", "waiting for confirmation" and "failed".
- The agent has selected memory focus, retrieval focus or another context that can leak into the next voice turn unless reset.

## Avoid when

- The agent only needs background transcription with no live operator controls.
- Voice is only a secondary accessibility input for an already complete UI.
- The target surface is not a browser and cannot expose microphone/WebRTC state.
- There is no secure context for microphone permissions.

## Required practices

- Provide one primary voice session button whose label/state maps to `idle`, `connecting`, `listening` and `error`.
- Provide `stop` behavior that closes the peer connection, data channel, remote audio and local microphone track.
- Provide `mute/unmute` as a separate control from stop; muting must not destroy the session.
- Provide `reconnect` for failed or stale sessions.
- Show microphone permission and Realtime availability errors as operator-visible states, not only console logs.
- Show whether remote audio is ready after the WebRTC track arrives.
- Show recent transcript turns for both operator and assistant.
- Show a compact tool/deep-task status area for queued, running, completed, failed and decision-required work.
- Provide an explicit `reset` or `clear context` control when the UI allows selected memory focus, search result focus, feed-card focus, lesson focus or any other user-selected context.
- If the UI has sticky context, label it as live current-session context rather
  than durable memory. Sticky context may pin recent current-session events and
  visible task state for the active Realtime call, but it must not imply that
  cross-session rolling summary is automatically loaded.
- Sticky context reset should be explicit enough to avoid accidental taps and
  should only affect the active voice session's pinned context.
- Keep publication, deletion, deployment, service install and broad system-change actions behind explicit confirmation controls.
- Keep domain controls near the voice surface only when they affect the next voice turn, such as selected source, selected memory result or selected feed card.
- Keep debug/event logs behind a secondary details panel or developer mode; do not make raw Realtime events the main operator UI.

## Initial control surface

The v1 default UI should include:

- Voice session control: start, stop and current phase.
- Mute control: muted/unmuted microphone state.
- Reconnect control: available after error or manual reconnect.
- Audio readiness indicator: local microphone active and remote audio ready.
- Transcript panel: recent user/assistant utterances, bounded in length.
- Context focus panel: current selected source, memory item, lesson, card or "none".
- Clear context control: resets selected focus before the next voice turn.
- Task status panel: latest tool calls, queue jobs and Codex deep-task handoffs.
- Decision gate panel: operator confirmations for public/destructive/system actions.
- Error panel: region/account unsupported, microphone denied, session failed, transport unavailable and tool validation failed.

## State model

The UI should expose these stable states even if the internal implementation differs:

- `idle`: no active Realtime session.
- `connecting`: session credentials, microphone and WebRTC are being created.
- `listening`: session is active and can receive speech.
- `muted`: local microphone track is disabled while the session remains alive.
- `working`: a server tool, queue job or Codex task is running.
- `decision_required`: a human or foreground Codex decision is required.
- `error`: the current voice session or task failed and needs recovery.

These states should be visible enough for a phone user to know whether speaking now will do anything.

## Product constraints

- The UI is an operator console, not a marketing page.
- Mobile layout is first-class: controls must remain reachable with one hand, and status text must not overflow small screens.
- Controls should be icon-first where the icon is conventional, with accessible labels/tooltips.
- The transcript is supporting context, not the whole product. Domain state and pending work must be visible separately.
- The UI must make it obvious when context is "sticky" across turns within the
  current Realtime session. Cross-session recall belongs to an explicit recall
  tool, not automatic UI startup context.

## Sticky Context UX

Sticky context is a live pinned-context aid for the currently open Realtime
session:

- Show whether sticky context is enabled.
- Show how many current-session events are available to pin.
- Send sticky context only for explicit UI actions or key task events where the
  active voice turn needs current task/session state.
- Do not send rolling summary automatically when starting a new Realtime
  session.
- Provide a reset confirmation before clearing or resetting sticky context.

## Relationship to realtime architecture

This standard covers the browser control surface. The transport and tool boundary remain defined by `04_standards/realtime-voice-control-for-codex-agents.md`.

The boundary is:

```text
voice control UI
  -> browser Realtime hook/state
  -> Realtime session and data channel
  -> server tools and Codex deep-task transport
  -> operator-visible job/context/approval state
```

The UI should not receive the OpenAI API key, execute durable actions directly or bypass server confirmation gates.

## Agent environment compatibility

- Agent platforms: Codex-native descendants with optional browser Realtime voice.
- Model context: observed with `gpt-realtime-2` and `gpt-realtime-mini`.
- Runtime environment: local Next.js/browser UI, server API routes and optional phone access through Tailscale.
- Config surfaces: UI components, Realtime hook, server routes, instructions and operations manifest.
- Portability: adapter-needed.
- Codex adaptation: keep UI state, realtime transport, server tools and Codex task status as separate layers.
- Environment-specific caveats: browser microphone permissions require a secure context for phone use; mobile browsers can suspend audio/WebRTC more aggressively than desktop browsers.

## Temporal validity

- Source published: 2026-05-29.
- Source updated: 2026-05-31.
- Source version: initial reusable voice-control UI pattern v1.
- Retrieved: 2026-05-31.
- Verified: 2026-05-31.
- Valid for: Pritha descendants with browser-based realtime voice control.
- Freshness status: current.
- Temporal status: version-bound.
- Recheck when: browser microphone rules, OpenAI Realtime session events, WebRTC behavior, Codex task transport or mobile device support changes.

## Examples

- FESPA26: a voice-first event/reportage console where the operator speaks source material, sees transcript and task state, and keeps publication behind approval.
- Funny Teacher: a voice learning UI where selected lesson/memory focus needs an obvious reset before the next practice session.

## Related decisions

- `05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md`
