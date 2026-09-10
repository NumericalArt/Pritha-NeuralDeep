# Update A Second Local MacBook

Use this procedure to update another trusted MacBook that already has an older
Pritha checkout. It is written to preserve local child agents, local runtime
state and private configuration.

## Scope

- Update only the Pritha git checkout from GitHub.
- Do not copy `.private/`, `.env*`, local credentials, runtime queues, logs or
  sibling child-agent folders between machines.
- Keep sibling child agents next to Pritha, outside the Pritha checkout, unless
  a specific agent has its own explicit update procedure.
- Use `main` as the update target after the tested Pritha state has been
  fast-forwarded and pushed there.

## Before Pulling

On the second MacBook:

```sh
cd /path/to/Pritha
git status --short --branch
git branch -vv
git remote -v
```

If there are local edits, either commit them locally or stash them before the
update:

```sh
git stash push -u -m "local pre-update backup $(date +%Y-%m-%d)"
```

If Control Center is running locally, stop it before installing or rebuilding.

## Update

Fetch the current GitHub state and switch to `main`:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
```

If `git pull --ff-only` refuses because the second MacBook has local commits,
stop and inspect those commits before merging or rebasing:

```sh
git log --oneline --decorate --graph --max-count=20 --all
git status --short --branch
```

Install Control Center dependencies if `interfaces/control-center/package-lock.json`
changed:

```sh
npm --prefix interfaces/control-center install
```

Run focused verification:

```sh
node --test tests/control-center-rolling-summary.test.mjs
node --test tests/control-center-codex-planning.test.mjs
node --test tests/control-center-codex-thread-routing.test.mjs
npm --prefix interfaces/control-center run typecheck
```

Build before starting the production server:

```sh
npm --prefix interfaces/control-center run build
```

Start Control Center on the expected local port:

```sh
PRITHA_CONTROL_CENTER_HOST=127.0.0.1 \
PRITHA_CONTROL_CENTER_PORT=3420 \
npm --prefix interfaces/control-center run start
```

## After Update

Check the local server:

```sh
curl -fsS http://127.0.0.1:3420/api/health
curl -fsS -X POST http://127.0.0.1:3420/api/realtime/session
```

If the second MacBook uses Tailscale, verify its own local Tailscale status.
Do not copy a Tailscale URL, tailnet name, device name or auth key from another
machine into tracked files.

Rolling summary handoff is local to each machine. The file
`.private/interface-lab/pritha-control-center/realtime/rolling-summary/current.json`
is intentionally private and should not be synced through Git.

The old standalone voice experiment on port `3401` is deprecated. The supported
voice entry point is Control Center `/voice` on the instance-configured port.
