> **Pritha NeuralDeep distribution:** follow [START_HERE.md](../../START_HERE.md).
> Run `node scripts/bootstrap.mjs prepare --profile neuraldeep` from the repository
> root. The reference notes below also cover inherited Pritha runtime options.

# Pritha Control Center

Status: active.

This is Pritha's functional local operator UI. It combines agent operations,
the maintained Voice interface, Task Chat, settings and diagnostics in one
Control Center.
It is an optional layer: Pritha's core workflow remains available directly in
Codex without running a web server.

## Routes

- `/agents` - child agents overview.
- `/voice` - voice control surface.
- `/task-chat` - direct chats and persistent, initially read-only Voice topics
  through the isolated NeuralDeep runtime.
- `/codex` - compatibility redirect to `/task-chat`; query parameters are
  preserved.
- `/settings` - compact settings.
- `/dev` - read-only diagnostics.

Desktop `/` resolves to `/agents`; mobile `/` resolves to `/voice`.

Task Chat and persistent Voice cards use only `scripts/neuraldeep-codex.mjs`
with NeuralDeep Responses. They do not select App Server, desktop Codex,
standalone fallback or another model/provider after an error. Voice cards from
the older ephemeral schema remain visible only in Voice Control.

## Run

From a fresh Pritha clone, use bootstrap:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

For direct local UI development:

```sh
npm --prefix interfaces/control-center ci --ignore-scripts
npm --prefix interfaces/control-center run dev
```

For production or Tailscale-facing access, inspect the instance-managed
runtime first:

```sh
node scripts/control-center-runtime.mjs plan
node scripts/control-center-runtime.mjs status --json
```

Production lifecycle and staged releases use
`scripts/control-center-runtime.mjs` and the instance-specific launchd service.
Installing, starting, stopping, restarting or uninstalling that service
requires a separate immediate operator approval and `--yes`. Direct
`npm run dev`, `npm run serve` and `npm run start` are limited to local
development or bounded testing; they are not the production lifecycle.

Default local URL:

```text
http://127.0.0.1:3420/agents
```

The shared app default is `3420`; each instance overrides it in its external
`runtime.env`. The deprecated legacy web UI defaults to `3000`.

Localhost URLs and localhost QR codes work only on the Mac that runs Control
Center. A phone sees `127.0.0.1` as the phone itself. For phone access, prefer
Tailscale Serve. LAN binding is disabled by policy in this build.

Do not expose `next dev` through Tailscale. The dev client can render the page
while failing to hydrate React event handlers behind HTTPS proxying; production
`build` + `start` keeps filters, credentials drawers, Voice controls and the
Three.js web active.

Never stop a process merely because it listens on an expected port. The runtime
manager verifies the instance, checkout, state-root, port, process group,
launchd label and health identity before a lifecycle mutation.

Optional local env:

```sh
PRITHA_CONTROL_CENTER_HOST=127.0.0.1
PRITHA_CONTROL_CENTER_PORT=3420
PRITHA_TAILNET_HOSTNAME=
PRITHA_TAILSCALE_ALLOWED_LOGINS=
```

## Optional Voice Music Control

The `/voice` UI has one `Music` gate button. When it is off, the Realtime voice
session uses the same tool surface and audio path as the normal Control Center.
When it is on, the active or next Realtime session can use the `music_control`
tool for background music commands.

The default source is selected in `/settings` -> `Music`:

- `SomaFM` - default local/private radio provider. Control Center loads channel
  metadata and playlist URLs only. It does not proxy, restream, record, cache or
  retransmit audio.
- `Local Folder` - saved audio files under Pritha's ignored private music
  library folder. Supported files include mp3, m4a, aac, wav, flac, ogg and
  opus, though iPhone playback is most reliable with mp3/m4a/aac. Voice
  intake can import attached audio files into this folder after spoken
  clarification instead of sending them to Codex.
- `ACE-Step` - existing local generated-music provider.

Default local env:

```sh
MUSIC_DEFAULT_SOURCE=somafm
SOMAFM_ENABLED=true
SOMAFM_DEFAULT_CHANNEL_ID=groovesalad
MUSIC_LIBRARY_ROOT=
```

If this interface is turned into a public, commercial, game, streaming platform
or embedded product, set `SOMAFM_ENABLED=false` until explicit SomaFM permission
is obtained. Embedded/public use requires permission from SomaFM.

Music generation expects a separate local ACE-Step 1.5 API service:

```sh
git clone https://github.com/ACE-Step/ACE-Step-1.5.git
cd ACE-Step-1.5
uv sync
uv run acestep-api
```

Default Control Center env:

```sh
ACE_STEP_BASE_URL=http://127.0.0.1:8001
ACE_STEP_MODEL=acestep-v15-turbo
ACE_STEP_AUDIO_FORMAT=mp3
```

Generated tracks are stored under Pritha's ignored private runtime directory,
not in tracked Markdown memory.

Do not commit real Tailscale URLs, tailnet names, device names, API keys,
private transcripts or Codex task outputs.

Tailscale access is optional. Bootstrap may detect readiness, but it does not
install Tailscale, authenticate the device or configure Tailscale Serve.

Use the guided operator flow:

```sh
node scripts/tailscale-setup.mjs plan --app control-center --port 3420
node scripts/tailscale-setup.mjs plan-agents
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs serve --app control-center --port 3420 --yes
node scripts/tailscale-setup.mjs serve-agents --yes
node scripts/tailscale-setup.mjs off --app control-center --port 3420 --yes
```
