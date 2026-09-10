---
id: 2026-06-26-pritha-voice-music-control-implementation-brief
type: workflow
status: active
created: 2026-06-26
updated: 2026-06-26
topics:
  - pritha-voice-control
  - generated-background-music
  - realtime
  - control-center
  - ace-step
tools:
  - OpenAI Realtime API
  - gpt-realtime-2
  - ACE-Step 1.5
  - Pritha Control Center
  - Next.js
  - Web Audio API
  - TypeScript
agent_platforms:
  - Codex
model_context:
  - gpt-realtime-2
runtime_environment:
  - local-project
  - mac
  - control-center
config_surfaces:
  - interfaces/control-center/src/components/voice/usePrithaRealtime.ts
  - interfaces/control-center/src/components/voice/VoiceControlPage.tsx
  - interfaces/control-center/src/lib/realtime/pritha-runtime.ts
  - interfaces/control-center/src/app/api/music
  - interfaces/control-center/src/lib/music
  - .env.example
portability: environment-specific
sources:
  - <USER_HOME>/Library/Mobile Documents/com~apple~CloudDocs/codex_ace_step_music_manager_instruction.md
  - https://developers.openai.com/api/docs/guides/realtime-conversations
  - https://developers.openai.com/api/docs/guides/realtime-vad
  - https://developers.openai.com/api/docs/guides/realtime-mcp
  - https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
  workflows:
    - 07_workflows/realtime-voice-control-kit.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: unknown
source_updated: 2026-06-26
source_version: ACE-Step 1.5 API docs inspected 2026-06-26; OpenAI Realtime docs inspected 2026-06-26
retrieved: 2026-06-26
verified: 2026-06-26
valid_for: Pritha Control Center voice UI music-control implementation
temporal_status: version-bound
memory_domain: agent-building-knowledge
memory_domains:
  - agent-building-knowledge
  - pritha-self
subject:
  kind: workflow
  id: pritha-voice-music-control
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Implementation Brief: Pritha Voice Music Control

Date: 2026-06-26
Status: active
Owner: Pritha / Codex

## Objective

Add generated background music to Pritha Control Center Voice Control without
regressing the existing voice experience.

The operator gets one Voice UI music toggle. When disabled, Voice Control must
behave exactly as it does before this implementation, except for the inert
button. When enabled, Pritha VC may use one Realtime `music_control` function
tool to generate and control ACE-Step 1.5 background music from the operator's
voice commands.

## Core Invariant

`musicControlEnabled=false` means:

- no `music_control` tool in the active Realtime session;
- no music instructions in the active Realtime session;
- no ACE-Step health check, generation, polling or cache pruning;
- no music playback graph, ducking loop, assistant speech analyser or music
  timers;
- no generated audio is fetched or decoded;
- existing microphone, remote assistant audio, tool handling, Codex task
  polling and sticky context behavior remain unchanged.

## Product Decision

The UI adds one compact secondary button in `VoiceSessionPanel`:

- label/icon state: `Music` inactive or active;
- mobile placement: beside `Mute` in the existing secondary row;
- desktop placement: secondary control near the current voice controls;
- no new music card in v1;
- button enables or disables music-control availability, not playback itself.

Enabling music control does not immediately play music. Playback starts only
after a voice command such as "включи музыку" or when auto mode needs music
during active Codex work.

## Architecture

Use three separate lanes:

```text
OpenAI Realtime voice session
  -> voice and transcript lifecycle
  -> optional music_control tool when UI gate is enabled

Control Center music backend
  -> ACE-Step client
  -> generated file cache
  -> one-worker generation queue
  -> /api/music routes

Browser local audio runtime
  -> MusicManager
  -> playback/crossfade slots
  -> ducking controller
  -> assistant speech meter
  -> user speech VAD bridge
```

## ACE-Step Boundary

ACE-Step 1.5 is an external local service. The browser never calls it directly.
Control Center server routes call ACE-Step and store generated tracks under the
private Control Center runtime root:

```text
.private/interface-lab/pritha-control-center/music/
  index.json
  tracks/
```

The ACE-Step client must handle:

- `/health`;
- `/v1/models`;
- `/release_task`;
- `/query_result`;
- `/v1/audio?path=...`;
- unified response wrapper `{ data, code, error, timestamp, extra }`;
- task status `0` queued/running, `1` succeeded, `2` failed;
- `result` as a JSON string containing audio file metadata;
- bearer token auth when `ACE_STEP_API_KEY` is configured.

## Realtime Boundary

`music_control` is a client-side Realtime tool handler because the real side
effect is browser-local audio state. It must not be routed through the generic
server `/api/realtime/tool` path.

When the music gate is enabled:

- if no Realtime session is active, the next session is created with
  `music_control` and music instructions;
- if a session is active, the client sends a `session.update` with the expanded
  tool list and matching instructions;
- voice commands can call `music_control` for play, stop, pause, resume,
  set_style, set_volume and set_mode.

When the gate is disabled:

- music fades out and disposes;
- the session tool list is updated to remove `music_control`;
- stale `music_control` calls return `music_control_disabled`;
- ordinary Realtime/Codex behavior continues unchanged.

## Audio Boundary

Generated music is local playback only. It must never be mixed into the
outbound microphone `MediaStreamTrack`.

User speech detection uses Realtime VAD events:

- `input_audio_buffer.speech_started`;
- `input_audio_buffer.speech_stopped`.

Assistant speech ducking uses an `AnalyserNode` side branch on the remote audio
stream. Do not use `response.done` alone to unduck music, because browser audio
may still be buffered.

## Busy State

Auto mode should use current visible Codex tasks as the v1 busy source:

- busy: `queued`, `running`;
- not busy: `complete`, `failed*`, `rejected`, `decision_required`,
  `waiting_for_operator`;
- unknown active statuses default to busy only while they are not terminal.

## Implementation Phases

1. Add this brief and branch isolation.
2. Add server music config, prompt builder, ACE-Step client, cache and queue.
3. Add `/api/music/health`, `/api/music/generate`, `/api/music/state` and
   `/api/music/tracks/[id]`.
4. Add browser music runtime with lazy initialization and dispose behavior.
5. Add Realtime `music_control` schema and gated instructions/session updates.
6. Add the one Voice UI music toggle button.
7. Add tests and run verification.

## Acceptance Criteria

- Existing Voice Control works unchanged when music control is disabled.
- The Voice UI contains only one music-related button.
- Enabling music control makes `music_control` available to Pritha VC.
- Disabling music control removes/deactivates `music_control` and stops music.
- ACE-Step generation is asynchronous and never blocks voice interaction.
- Cached generated tracks can play immediately.
- Music ducks during user speech and assistant speech.
- Auto mode plays only while Codex is actively working.
- Generated music is never sent to Realtime input.
- ACE-Step failure does not break Voice Control.
- Tests cover parser, prompt builder, queue/cache behavior, tool gating and
  basic state transitions.
