# Install and start Pritha NeuralDeep

These instructions work from a downloaded ZIP or Git clone. A coding assistant
may perform the steps for you: Cursor, Codex, Claude Code, or any environment
with access to the project files and a local terminal.

## 1. Check prerequisites

Use Node.js **24 or newer**, Python **3.10 or newer**, Git, the SQLite command-line
tool and **Codex CLI**. Check `node --version`, `python3 --version`, `git --version`,
`sqlite3 -version` and `codex --version`. Install missing tools before continuing.
Codex CLI is an internal execution dependency even when Cursor installs the app.
Do not configure a separate OpenAI API key to use the NeuralDeep transport.

An internet connection is needed to download dependencies and the local embedding
model. Model execution, speech and web search also require your NeuralDeep access.

## 2. Prepare the folder

From the extracted repository root:

```sh
node scripts/bootstrap.mjs prepare --profile neuraldeep
```

Bootstrap creates an isolated instance, installs locked dependencies, builds the
Control Center, rebuilds searchable knowledge and installs Brief Desk ND. It may
take several minutes on the first run. Stop at an error and address the reported
missing prerequisite; repeating preparation preserves existing agent data.

A ZIP gets its own local Git repository for agent-delivery workflows. Bootstrap
does not connect that repository to your GitHub account or publish anything.

Local state and agent directories are created beside the extracted folder. Their
names include the folder name and instance ID. `.pritha-instance.json` records the
local locations and is ignored by Git. Do not share it as part of a distribution.

## 3. Start

```sh
node scripts/bootstrap.mjs start --profile neuraldeep
```

Keep this terminal running. Open the displayed localhost address (normally
`http://127.0.0.1:3520`). Stop a foreground instance with Ctrl+C. Bootstrap will
choose an available initial Control Center port; it never kills another listener.

In **Settings → NeuralDeep**, enter your key and check the connection. The key is
stored in this instance's macOS Keychain entry. Kimi, NeuralDeep Voice and Auto
Search are selected by default. Change models and search permissions in Settings.
No paid provider request is required merely to open Settings or inspect the demo.

## 4. Try the example

Agents contains only Brief Desk ND, initially stopped. Click Start, open the local
link and choose **Open demo**. Configure its Settings to create real briefs.
The default credential source is its parent Pritha; a separate key is optional.
Telegram setup is required only for publication.

## Optional access and other operating systems

Tailscale and background startup are opt-in. Default links are local, and no
public server or Telegram webhook is needed for outgoing Telegram publication.

Linux and Windows are allowed but self-managed, without a full compatibility
promise. Set `PRITHA_NEURALDEEP_API_KEY` in the server environment on systems
without macOS Keychain; the UI never displays its value. Restart after changing
an environment key. Run from a shell with the listed prerequisites available.
If managed Start/Stop is unavailable, run `node server.mjs` in the agent folder.
Do not expose the privileged Control Center on the public internet.

## Troubleshooting

- **Missing dependency:** install the named prerequisite and repeat preparation.
- **Port in use:** keep the existing process intact; set `PRITHA_CONTROL_CENTER_PORT` to a free port before initial setup.
- **Missing key:** open Settings; do not paste the key into chat or a public issue.
- **Provider quota/model error:** check Settings and your NeuralDeep account.
- **Memory model download failed:** restore internet access and repeat preparation.
- **Need to update:** preserve `.pritha-instance.json` and the external state/agent folders; read [release instructions](docs/release.md). Never replace your private state with someone else's files.

For explicit Tailscale setup, configure `PRITHA_CONTROL_CENTER_TAILSCALE_HOST`
and the trusted-device access settings in your local environment, then follow
`node scripts/tailscale-setup.mjs plan --app control-center`. A Tailscale client
installed elsewhere on the computer does not automatically change this instance's links.
