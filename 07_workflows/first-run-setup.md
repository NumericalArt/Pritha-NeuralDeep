---
id: first-run-setup
type: workflow
status: active
created: 2026-05-28
updated: 2026-06-25
topics:
  - pritha
  - setup
  - onboarding
  - codex
tools:
  - Codex
  - Node.js
  - npm
  - Git
  - Pritha
  - Tailscale
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  decisions:
    - 05_decisions/2026-05-28-realtime-default-mode.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: phase-4-bootstrap-first-run-setup
retrieved: 2026-05-28
verified: 2026-06-25
valid_for: Pritha v0.1 first-run bootstrap
temporal_status: current
---

# First-Run Setup

Use this workflow when a user opens a fresh checkout and asks to set up, start
or bootstrap Pritha.

## Goal

Bring the repository to a usable local state with minimal assumptions:

- Codex thread is the default interface.
- Optional connectors are explicit opt-in.
- Deterministic dependencies can be installed only through the selected
  bootstrap profile.
- The local SQLite memory index and semantic embeddings are generated from
  tracked Markdown during bootstrap, so a fresh clone becomes a complete local
  Pritha instance without committing generated database history.
- Secrets stay in `.env.local`.
- `.techscope-setup.json` stores only non-secret setup state.
- Quality failures do not block the first run; they produce
  `completed-with-warnings` and actionable hints.

## Codex Dialog Path

1. Confirm the repository root with `pwd` and `git rev-parse --show-toplevel`.
2. Read `AGENTS.md`, this workflow and `.env.example`.
3. Ask only for choices that are needed now:
   - minimal Codex-only setup;
   - Web UI/Tailscale manual notes;
   - Telegram connector;
   - Realtime voice connector;
   - Obsidian vault/sync notes;
   - first descendant agent now or later.
4. For ambiguous setup requests, show a bootstrap plan before mutating local
   dependencies. For explicit start phrases such as `стартуй Pritha`, `начни
   Pritha` or `start Pritha`, Codex may run the safe local prepare command
   directly. Do not launch services, enable launchd, start cron, run background
   queues, install Tailscale, configure host networking, write credentials or
   publish anything without a separate explicit user confirmation.
5. If secrets are provided, write them only to `.env.local` using the setup
   script or equivalent atomic private write. Never put secrets in
   `.techscope-setup.json`, Markdown artifacts or Git.
6. Run the preferred bootstrap CLI if useful:

```sh
node scripts/bootstrap.mjs prepare --profile local
```

For local Control Center setup after memory is prepared:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

Use `node scripts/setup.mjs` only as the lower-level setup-state wizard when
debugging bootstrap or custom setup-state paths.

7. The prepare command must leave `.memory/techscope.sqlite` populated with
   documents, chunks, relations and embeddings. If `.memory/techscope.sqlite` is
   absent or stale, rerun:

```sh
node scripts/bootstrap.mjs prepare --profile local
```

8. Check status:

```sh
node scripts/setup-status.mjs --json
```

9. If final status is `completed-with-warnings`, tell the user what to fix and
   suggest:

```sh
node scripts/self-test.mjs
```

## Connector Rules

- `codex`: enabled by default.
- `web`: records host/port only; no server autostart.
- `telegram`: token validation is non-blocking; failed token does not fail the
  entire setup.
- `realtime`: opt-in only. Warn about microphone privacy and current pricing.
  Use `docs/realtime.md`; do not hardcode stale prices.
- `obsidian`: record manual vault/sync notes only.
- `tailscale`: manual network setup only. Codex may run only read-only `plan`,
  `status` and `auth-status` by default. Mutating commands such as
  `install --yes`, `serve --yes`, `off --yes`, `tailscale up`, auth-key setup
  and Funnel/public exposure need a separate explicit user confirmation
  immediately before the action. Peer access remains not tested until the user
  opens the private URL from a phone or other trusted peer device.
- `claude-code`: out of scope for v0.1; see placeholder contract.

## Tailscale Private Access

Use this path only when the user explicitly asks for private device access to a
local Pritha surface.

1. Read `docs/tailscale-private-access.md`.
2. Start with read-only planning and status:

```sh
node scripts/tailscale-setup.mjs plan --app control-center --port 3420
node scripts/tailscale-setup.mjs status --json
```

3. Instruct the user to install or authenticate Tailscale themselves when
   needed. Do not run `tailscale up` or auth-key commands without explicit
   approval.
4. Run `serve --yes` or `off --yes` only after the user explicitly approves the
   exact action. Never enable Funnel from Pritha setup.
5. Treat host-local access as incomplete. The user must open the private
   Tailscale URL from the target phone or trusted peer device before peer access
   is accepted as working.
6. Do not write real Tailscale URLs, tailnet names, device names or auth keys to
   tracked Markdown, reports, Git-ready setup state or memory snapshots.

## Files

- `.env.local`: local secrets/config, private file mode.
- `.techscope-setup.json`: local non-secret setup state, gitignored.
- `scripts/bootstrap.mjs`: preferred fresh-clone setup entrypoint.
- `setup/manifest.schema.json`: state contract.
- `08_templates/first-run-setup-dialog.md`: reusable descendant-agent template.

## Done

- Setup status is `completed` or `completed-with-warnings`.
- `.env.local` exists and is not committed.
- `.techscope-setup.json` exists and contains no secrets.
- `node scripts/bootstrap.mjs prepare --profile local --json` prints
  machine-readable setup and memory preparation state.
- The user has the next concrete step: run self-test, create a first descendant
  via Pritha, or continue with manual connector setup.
