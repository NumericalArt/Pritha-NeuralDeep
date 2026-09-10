---
id: realtime-voice-control-kit
type: workflow
status: active
created: 2026-05-30
updated: 2026-07-13
topics: [voice-control, realtime, agent-scaffold, pritha, codex-sidecar]
tools: [OpenAI Realtime API, Codex App, Codex CLI, Next.js, WebRTC]
sources:
  - 11_agents/reference-implementations/fespa26-voice-control/README.md
  - 11_agents/reference-implementations/fespa26-voice-control/manifest.json
  - 04_standards/realtime-voice-control-for-codex-agents.md
  - 04_standards/realtime-voice-control-ui.md
  - 04_standards/tailscale-private-device-access-for-local-agents.md
related:
  standards:
    - 04_standards/realtime-voice-control-for-codex-agents.md
    - 04_standards/realtime-voice-control-ui.md
    - 04_standards/tailscale-private-device-access-for-local-agents.md
  decisions:
    - 05_decisions/2026-05-29-realtime-voice-control-universal-pattern.md
  reports:
    - 11_agents/reports/2026-05-29-fespa26-voice-control-and-feed-memory-update.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-30
source_updated: 2026-05-31
source_version: fespa26-voice-control-reference-v1 + voice-ui-v1 + tailscale-device-access-v1
retrieved: 2026-05-30
verified: 2026-05-31
valid_for: Pritha fresh clone setup and descendant scaffold planning
temporal_status: current
---

# Workflow: Realtime Voice Control Kit

Use this workflow when a user wants a Pritha descendant with live voice control,
or when a fresh clone of Pritha needs to find the known-good FESPA26 voice
implementation quickly.

## Commands

Inspect the reference pack:

```sh
node scripts/voice-control-kit.mjs plan
node scripts/voice-control-kit.mjs list
```

Copy the pack into a child agent for adaptation:

```sh
node scripts/voice-control-kit.mjs copy --target sibling:child-agent
```

Equivalent Pritha entrypoint:

```sh
node scripts/pritha.mjs voice-kit plan
node scripts/pritha.mjs voice-kit copy --target sibling:child-agent
```

## Intake Rules

- Voice control must be explicit in the agent contract.
- The contract must state microphone/cost/privacy approval status.
- The contract must choose deployment target, runtime isolation profile and
  proactivity mode.
- The contract must choose the deep-task lane: Codex App, Codex CLI, session
  contract, HTTP adapter or no deep-task transport.

## Transfer Steps

1. Run `voice-kit plan` and read the lanes, readiness checks and adaptation
   checklist.
2. Copy the reference pack into the child project.
3. Replace FESPA domain names, repositories, env prefixes and tool schemas.
4. Keep `OPENAI_API_KEY` server-side; issue only ephemeral Realtime credentials
   to the browser.
5. Implement narrow deterministic server tools before exposing them to
   Realtime.
6. Route complex work through a Codex task service with a strict JSON result
   contract.
7. Add the v1 voice UI control surface: start/stop, mute, reconnect, status,
   transcript, context reset, task status and confirmation gates.
8. If phone or second-device access is selected, configure the Tailscale
   private device-access pattern as an operations module.
9. Add tests for instructions, tool schema, result validation, final-turn
   parsing and transport fallback.
10. Record module readiness for `interfaces.realtime`, `tools.realtime`,
   `memory`, `codexTransport`, `operations` and selected external connectors.

## Scaffold Rule

When a child-agent contract mentions `voice`, `realtime`, `speech`, `microphone`
or `голос`, Pritha should add a `realtime-voice` interface placeholder and link
to the FESPA26 reference pack. Do not copy the full FESPA implementation into a
child by default unless the contract calls for a browser Realtime UI and Codex
deep-task lane.

When the contract selects browser Realtime voice, Pritha should also link
`04_standards/realtime-voice-control-ui.md` as the default initial UI template.
When the contract mentions phone, mobile browser, second-device access or
Tailscale, Pritha should separately evaluate
`04_standards/tailscale-private-device-access-for-local-agents.md`.

## Safety Gates

- No direct filesystem, deployment, publication or credential action from the
  Realtime model.
- No public/destructive action without explicit operator confirmation.
- No raw external transcript/media write directly into curated memory.
- Fail closed when Codex transport is unavailable or returns invalid JSON.
- Keep raw audio/video out of normal Git unless a Git LFS/archive policy exists.
