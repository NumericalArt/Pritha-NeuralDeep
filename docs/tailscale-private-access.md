---
id: pritha-tailscale-private-access
type: workflow
status: active
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - tailscale
  - private-access
  - control-center
tools:
  - Tailscale
  - Tailscale Serve
  - Node.js
sources:
  - https://tailscale.com/docs/install/mac
  - https://tailscale.com/docs/reference/tailscale-cli/serve
  - https://tailscale.com/docs/reference/tailscale-cli/up
  - https://tailscale.com/docs/features/access-control/auth-keys
related:
  standards:
    - 04_standards/tailscale-private-device-access-for-local-agents.md
  workflows:
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: Tailscale docs validated 2025-12-04 to 2026-01-26
source_updated: 2026-06-21 verification
source_version: phase-5-tailscale-private-access
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Pritha local Control Center access from trusted devices in the same tailnet
temporal_status: current
memory_domain: pritha-self
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Tailscale Private Access

Tailscale is optional. Use it when you want to open the local Pritha Control
Center from another trusted device, such as a phone or laptop in the same
tailnet.

The local app remains bound to `127.0.0.1`. Tailscale Serve provides a private
HTTPS URL inside the tailnet. Tailscale Funnel is public exposure and is not
enabled by Pritha setup.

## Codex Operator Protocol

Codex must start with read-only commands and use them for instruction:

```sh
node scripts/tailscale-setup.mjs plan --app control-center
node scripts/tailscale-setup.mjs plan-agents
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs auth-status
```

Codex must not run real mutating Tailscale actions without separate explicit
user approval immediately before the action:

- `node scripts/tailscale-setup.mjs install --yes`
- `node scripts/tailscale-setup.mjs serve --app control-center --port <control-center-port> --yes`
- `node scripts/tailscale-setup.mjs serve-agents --yes`
- `node scripts/tailscale-setup.mjs off --app control-center --port <control-center-port> --yes`
- `tailscale up`
- auth-key commands
- Funnel/public exposure
- launchd, cron or other service changes

When Tailscale is missing or unauthenticated, Codex should instruct the user to
install and authenticate through the Tailscale app or approved CLI flow. Peer
access remains an acceptance check for the user: host-local status is not enough
until the private URL opens from the phone or trusted peer device.

Do not record real Tailscale URLs, tailnet names, device names or auth keys in
tracked Markdown, reports, Git-ready setup state or memory snapshots.

## Guided Flow

Read-only plan:

```sh
node scripts/tailscale-setup.mjs plan --app control-center
node scripts/tailscale-setup.mjs plan-agents
```

Read-only status:

```sh
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs auth-status
```

Operator-approved install guidance:

```sh
node scripts/tailscale-setup.mjs install --yes
```

This does not store auth keys. If Tailscale is missing, Pritha prints the
official install URL and records `pending-user-install` in local setup state
when a state path is used.

Authenticate as a user action through the Tailscale app or:

```sh
tailscale up
```

Start Control Center locally:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

Configure private Serve after the local app is healthy and the user approves
the exact action:

```sh
node scripts/tailscale-setup.mjs serve --app control-center --port <control-center-port> --yes
```

Configure private Serve for child-agent local upstreams after the agents are
healthy and the user approves the fleet action:

```sh
node scripts/tailscale-setup.mjs plan-agents
node scripts/tailscale-setup.mjs serve-agents --yes
```

`plan-agents` scans sibling child-agent `operations/manifest.json` files for
local `127.0.0.1` upstreams and compares them with real `tailscale serve
status`. It does not invent agent URLs and does not mutate host networking.
`serve-agents --yes` only configures agents whose local health endpoint is
ready and whose Serve mapping is missing.

Control Center API access through the tailnet fails closed unless the Tailscale
identity header is present and trusted. Configure accepted identities in an
ignored local env file:

```sh
PRITHA_TAILNET_HOSTNAME=<your-control-center-tailnet-host>
PRITHA_TAILSCALE_ALLOWED_LOGINS=<trusted-login@example.com>
```

Stop serving after the user approves the exact action:

```sh
node scripts/tailscale-setup.mjs off --app control-center --port <control-center-port> --yes
```

## Safety Boundary

- `plan`, `plan-agents`, `status` and `auth-status` are read-only.
- `install`, `serve`, `serve-agents` and `off` require `--yes`.
- `install --yes`, `serve --yes`, `serve-agents --yes` and `off --yes` are operator-approved
  actions, even when shown as guided commands.
- Codex must treat `--yes` as an operator approval gate, not as permission to
  run the action automatically.
- `serve --yes` checks that Tailscale is installed, authenticated and that the
  local upstream health endpoint is ready.
- Tailscale identity headers are required for Control Center API access through
  the tailnet; missing or untrusted identity returns `403`.
- Peer access is not considered fully tested until the Tailscale URL is opened
  from the phone or trusted peer device.
- Tailscale is a private network boundary, not application authentication.

## Auth Keys

Default Pritha setup does not ask for auth keys. Tailscale auth keys are
equivalent to logging a device into a tailnet, and reusable keys are dangerous
if stolen. Headless auth-key mode belongs in a future explicit
server/deployment profile with a dedicated secret store.

## Dev Origins

For local development, additional Next.js dev origins can be provided through a
local ignored environment variable:

```sh
PRITHA_CONTROL_CENTER_ALLOWED_DEV_ORIGINS=control-center.example.invalid
```

Do not commit real Tailscale URLs, tailnet names, device names or auth keys.
