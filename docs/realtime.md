# Realtime

Pritha can create descendants that use voice interfaces, but realtime voice is not required for the core scaffold.

## Pattern

- Browser or app captures microphone input.
- Realtime model handles low-latency conversation.
- Default realtime tool surface, when selected by a Seed: internet access,
  agent memory access and Codex CLI sidecar access.
- Deterministic server tools perform durable actions behind validation gates.
- Codex sidecar handles project editing and deeper implementation work.
- Risky Codex tasks can pause as `decision_required` and wait for operator
  approval in the Control Center task card.
- Lesson/session memory is saved as curated artifacts when the domain contract
  selects durable memory.

## Pritha Voice Context

Pritha Control Center has two separate voice-context mechanisms:

- Rolling summary: a single private summary-only handoff file for the latest
  Realtime/Codex work. It is stored outside the UI at
  `.private/interface-lab/pritha-control-center/realtime/rolling-summary/current.json`.
  It is overwritten in place, has a hard size limit and no TTL, and must not
  contain raw transcripts, secrets or credentials.
- Sticky context: a live, current-session prompt sent through the Realtime data
  channel when selected Codex/task events need extra state in the active voice
  call. It is not cross-session memory and does not read the rolling summary.

The rolling summary is available to the Realtime model only through the
`recall_rolling_summary` tool. Realtime instructions should call that tool when
the operator asks about the previous session, asks what was discussed last time,
or asks to continue from the prior handoff. Do not inject the rolling summary at
session startup; an unrelated new conversation must start cleanly.

Sticky context may include a bounded count of current-session events and recent
Codex task state. It should be obvious in the UI, have an explicit reset control
and prefer the operator's newest direct instruction over older pinned context.

## FESPA26 Reference Kit

Pritha carries a source-level reference implementation extracted from FESPA26:

```sh
node scripts/voice-control-kit.mjs plan
node scripts/voice-control-kit.mjs list
node scripts/voice-control-kit.mjs copy --target sibling:child-agent
```

The same command is available through Pritha:

```sh
node scripts/pritha.mjs voice-kit plan
```

The pack lives at
`11_agents/reference-implementations/fespa26-voice-control/` and includes
Realtime session/call routes, browser data-channel handling, tool schemas,
instructions, Codex App/CLI/session adapters and tests. Treat it as an
adaptation source, not a blind copy.

## Setup Readiness

Realtime voice is only ready when its selected tool surface is ready. Pritha
setup records `realtime.tool.internet`, `realtime.tool.memory` and
`realtime.tool.codexCli` sections in setup state when voice is enabled. Missing
memory search or Codex CLI access must be visible as `failed` or `pending-auth`,
not hidden behind a generic "voice enabled" status.

## Cost Warning

Realtime model pricing changes over time. Before building a voice descendant, check current OpenAI pricing and model documentation. If a setup wizard displays an estimated cost, it must say when the rate was checked.

## Safety

Voice transcripts are untrusted input until curated. Realtime voice may create
Codex implementation tasks, including child-agent scaffold/evolution tasks, but
must not directly execute service install/uninstall, cron/launchd enablement,
deployment/publish, deletion, secret writes or danger-full-access. Those
actions become `decision_required` tasks and start only after the operator
presses Approve in the UI. Secrets are entered through credential UI or local
environment files, not through voice/model context.
