---
id: techscope-web
type: workflow
status: active
created: 2026-05-15
updated: 2026-05-15
topics: [web-ui, tailscale, semantic-search, knowledge-base, mac-mini]
tools: [node, sqlite, tailscale]
sources:
  - 05_decisions/2026-05-15-obsidian-web-access.md
related:
  decisions:
    - 05_decisions/2026-05-15-obsidian-web-access.md
---

# Workflow: techscope web

## Goal

Запустить приватный веб-интерфейс для просмотра "Копилки технологий" с MacBook и телефона.

## Local test

```sh
python3 scripts/techscope_web.py
```

Open:

```text
http://127.0.0.1:3000
```

## Tailscale test

After local server is running:

```sh
tailscale serve --bg 3000
```

Then open the Tailscale Serve URL from MacBook or phone connected to the same tailnet.

Current URL:

```text
https://<TAILSCALE_HOST>/
```

Stop serving:

```sh
tailscale serve --https=443 off
```

## Features v1

- Dashboard stats.
- Open items.
- Document list.
- FTS search.
- Semantic search.
- Markdown viewer.
- Relations panel.

## Current status

Local API smoke tests passed for:

- `/api/stats`
- `/api/open`
- `/api/search`
- `/api/semantic`

Tailscale Serve is configured as:

```text
https://<TAILSCALE_HOST>/
|-- proxy http://127.0.0.1:3000
```

## launchd service

Techscope Web is prepared as a user LaunchAgent:

```text
com.techscope.web
```

Source plist:

```text
launchd/com.techscope.web.plist
```

Installed plist:

```text
~/Library/LaunchAgents/com.techscope.web.plist
```

Useful commands:

```sh
launchctl print gui/501/com.techscope.web
launchctl kickstart -k gui/501/com.techscope.web
launchctl bootout gui/501 ~/Library/LaunchAgents/com.techscope.web.plist
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.techscope.web.plist
```

Logs:

```text
.logs/techscope-web.out.log
.logs/techscope-web.err.log
```

## macOS privacy note

The project currently lives under:

```text
<TECHSCOPE_ROOT>
```

macOS TCC privacy can block background LaunchAgents from reading files in `~/Documents`. Manual foreground runs work, but launchd may fail with:

```text
Operation not permitted
```

Recommended fix:

1. Move the project to a non-TCC path, for example `<TECHSCOPE_ROOT>`.
2. Update paths in:
   - `launchd/com.techscope.web.plist`
   - `scripts/run-techscope-web.sh`
   - `scripts/techscope_web.py`
3. Reinstall and bootstrap the LaunchAgent.

Alternative:

Give Full Disk Access to the runtime used by launchd, but moving the project is cleaner and easier to reason about.

## Notes

This is a read-only UI. Editing remains in Markdown, Obsidian and Codex.

The launchd service uses the Python implementation:

```text
scripts/techscope_web.py
```

The Node prototype is kept as:

```text
scripts/techscope-web.mjs
```
