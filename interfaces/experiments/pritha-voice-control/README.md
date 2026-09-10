# Pritha Voice Control Experiment

Status: deprecated.

The standalone browser voice interface on port `3401` is retired. Use the
Pritha Control Center voice runtime instead:

```sh
npm run control-center
```

Open:

```text
http://127.0.0.1:3420/voice
```

This directory is retained only as historical implementation evidence until a
separate archival cleanup removes it.

This is a local browser voice interface for talking with Pritha. It uses the
OpenAI Realtime API through WebRTC and exposes only narrow server tools:

- `get_pritha_status`
- `search_pritha_memory`
- `read_pritha_artifact`
- `queue_codex_task`

The voice model can read Pritha memory and can hand complex work to
Codex. It does not receive direct filesystem, shell, deployment or web browsing
power. Internet research is routed through Codex task handoff with
`requires_internet=true`.

## Legacy Run

```sh
OPENAI_API_KEY=... node scripts/pritha-voice-control.mjs
```

This command now exits with a deprecation notice.

Open:

```text
http://127.0.0.1:3401
```

Optional env:

```sh
TECHSCOPE_VOICE_HOST=127.0.0.1
TECHSCOPE_VOICE_PORT=3401
TECHSCOPE_VOICE_MODEL=gpt-realtime
TECHSCOPE_VOICE_REALTIME_VOICE=marin
TECHSCOPE_VOICE_CODEX_MODE=queue
TECHSCOPE_VOICE_CODEX_WRITE_ENABLED=0
```

If an account exposes a different realtime model name, set
`TECHSCOPE_VOICE_MODEL` in `.env.local`.

## Tailscale

For phone testing, keep the app bound to `127.0.0.1` and expose it through
Tailscale Serve manually. Do not commit real Tailscale URLs, tailnet names,
device names or Serve state.

Local/private state belongs under:

```text
.private/interface-lab/pritha-voice-control/
```

That path is ignored by Git.

## Codex Bridge

Default mode is `queue`. Voice-triggered Codex tasks are written as structured
requests under:

```text
.private/interface-lab/pritha-voice-control/codex-tasks/
```

Optional `exec` mode starts a local Codex sidecar:

```sh
TECHSCOPE_VOICE_CODEX_MODE=exec node scripts/pritha-voice-control.mjs
```

Write/system-change requests still use read-only sandbox unless explicitly
enabled:

```sh
TECHSCOPE_VOICE_CODEX_WRITE_ENABLED=1
```

Do not enable `exec` or write mode for casual experiments.
