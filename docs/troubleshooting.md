> For this distribution, start with the NeuralDeep-specific troubleshooting in
> [START_HERE.md](../START_HERE.md). Use `node scripts/bootstrap.mjs prepare --profile neuraldeep`.
> Older profile examples below describe optional inherited platform tooling.

# Troubleshooting

## Bootstrap Fails

Start with a read-only plan:

```sh
node scripts/bootstrap.mjs plan --profile minimal
```

Then run the smallest verification profile:

```sh
node scripts/bootstrap.mjs verify --profile minimal
```

Use `--json` when you need machine-readable output:

```sh
node scripts/bootstrap.mjs verify --profile control-center --json
```

Bootstrap does not install launchd, cron, Tailscale, durable services or
credentials. If a task appears to require one of those, stop and use the
operator-approved plan/status flow for that feature.

## Control Center Dependencies

Install the UI dependencies from the committed lockfile:

```sh
npm --prefix interfaces/control-center ci --ignore-scripts
npm --prefix interfaces/control-center run typecheck
npm --prefix interfaces/control-center run build
```

To start locally in the foreground:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

The default local URL is:

```text
http://127.0.0.1:3420/agents
```

`localhost` and `127.0.0.1` are loopback addresses. They work only on the Mac
running Control Center. A phone that scans a localhost QR code will try to open
the phone's own localhost, not the Mac.

LAN binding is disabled by policy in this build. Keep Control Center on
`127.0.0.1` and use Tailscale Serve for phone or trusted peer-device access.

```sh
node scripts/tailscale-setup.mjs plan --app control-center
node scripts/tailscale-setup.mjs status --json
```

Check a running Control Center without mutating local runtime state:

```sh
npm run control-center:health
node scripts/control-center-health.mjs --json
```

## Stale Control Center After Rebuild

Symptoms:

- `/api/health` returns `ok`, but `/voice`, `/agents` or `/settings` behaves as
  if React did not hydrate.
- the Voice page shows the static shell but no Three.js/WebGL star canvas;
- Agents `Start Plan` / `Stop Plan` buttons do not open the operator plan;
- Settings sections or Access & Connections controls look missing or inert;
- a browser console or chunk scan shows `/_next/static/chunks/*.js` returning
  `404`, `500` or `Internal Server Error`.

This usually means an old `next start` process is still serving an in-memory
build manifest after `.next` was rebuilt. It is a local runtime problem, not a
Git history or UI source-code problem.

Use read-only diagnosis first:

```sh
node scripts/control-center-health.mjs --json
lsof -nP -iTCP:3420 -sTCP:LISTEN
```

If Codex is operating the project, killing or replacing the local Control
Center process requires explicit user approval immediately before the action.
After approval, stop only the PID that is listening on the configured Control Center port, then
start a fresh foreground server:

```sh
kill <PID_FROM_LSOF>
npm --prefix interfaces/control-center run start
```

For a fresh development server instead of the current production `.next` build:

```sh
node scripts/bootstrap.mjs start --profile control-center
```

After restart, rerun:

```sh
node scripts/control-center-health.mjs
```

The healthy result should report loaded pages and JavaScript chunks. Peer access
from another trusted device remains a separate manual acceptance check.

## Python Dependencies

Portable packages:

```sh
python3 -m pip install --user -r requirements-core.txt
```

macOS transcription helper:

```sh
python3 -m pip install --user -r requirements-macos.txt
```

## Deprecated Agents Mother CLI

Use:

```sh
node scripts/pritha.mjs <command>
```

The old path still works and prints a deprecation notice.

## SQLite Missing

Check the environment first:

```sh
node scripts/env-doctor.mjs --profile minimal
```

Then rebuild memory:

```sh
node scripts/rebuild-memory.mjs
```

## Telegram Fetch Failed

Check `.env`, network access and token validity. Queue health can be inspected without real polling:

```sh
node scripts/telegram-bot.mjs queue-status
node scripts/queue-health.mjs
```

## Path Mismatch

Use `TECHSCOPE_ROOT=/path/to/repo` if scripts are launched from another directory.

New public docs use the Pritha name, but `TECHSCOPE_ROOT` remains the compatible
runtime environment variable until a separate migration removes it.

## Embeddings Not Available

Semantic search requires embeddings. Run:

```sh
python3 scripts/embed-memory.py
node scripts/query-memory.mjs semantic "agent factory"
```

## Optional Credentials

Fresh clone setup does not require secrets. Add credentials only for the feature
that needs them:

- hosted model API calls and Realtime voice;
- Telegram or other messaging adapters;
- GitHub publishing;
- Tailscale private access;
- service deployment.

Do not put real secret values in Markdown, `.techscope-setup.json`, reports or
Git history. Use `.env.local`, the Control Center credential UI or the child
agent's documented private secret store.

## Limits Panel

The Settings `Usage Dashboard` button opens the external ChatGPT/Codex usage
page:

```text
https://chatgpt.com/codex/settings/usage
```

It is a manual fallback for checking account usage when Pritha cannot read
limits through the local Codex App Server. If Limits reports a protocol or
`app-server` error, verify that `.env.local` uses the Codex.app bundled binary:

```sh
PRITHA_REALTIME_CODEX_BIN=/Applications/Codex.app/Contents/Resources/codex
```

Older Homebrew `codex-cli` binaries may not support the App Server protocol
used by the read-only limits probe.

## Tailscale Private Access

Read the current plan/status first:

```sh
node scripts/tailscale-setup.mjs plan --app control-center
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs auth-status
```

Serve and stop commands require explicit approval:

```sh
node scripts/tailscale-setup.mjs serve --app control-center --port <control-center-port> --yes
node scripts/tailscale-setup.mjs off --app control-center --port <control-center-port> --yes
```

Pritha setup never enables Tailscale Funnel. Funnel is public exposure and must
be handled as a separate deployment/security decision.
