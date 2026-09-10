---
id: control-center-staged-release
type: workflow
status: active
created: 2026-08-27
updated: 2026-09-05
topics:
  - control-center
  - staged-release
  - rollback
  - launchd
  - fleet
tools:
  - Git
  - Node.js
  - Next.js
  - launchd
sources:
  - source-operator-approved-control-center-reliability-plan-2026-08-27
related:
  standards:
    - 04_standards/control-center-runtime-reliability.md
    - 04_standards/pritha-good-state-alignment.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-08-27
source_updated: 2026-08-27
source_version: control-center-staged-release-v1
retrieved: 2026-08-27
verified: 2026-08-27
valid_for: Pritha Control Center production and fleet releases
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - governance
subject:
  kind: workflow
  id: control-center-staged-release
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Workflow: Control Center Staged Release

## Read-only preparation

1. Run Good State Alignment for the affected Control Center surfaces.
2. Preserve unrelated or unfinished work; do not reset the working tree.
3. Verify the target commit, checkout/state isolation and private fleet
   manifest.
4. Inspect each service without mutation:

```sh
node scripts/control-center-runtime.mjs plan
node scripts/control-center-runtime.mjs status --json
node scripts/pritha-fleet.mjs rollout --target-sha <full-commit> --json
```

The fleet command loads the primary `runtime.env`, pins one full commit and
orders instances as `main`, `dasha`, `sasha`, `marina`.

## Per-instance release transaction

### Independent local-main release

An independent instance without `origin` can release its own clean local `main`.
First preserve and commit all approved authored edits, keeping private/runtime
data outside Git. Verify local branch ancestry; do not fetch another instance
or manufacture a remote just to satisfy the updater. A proposed plan document
does not authorize implementation of its future features.

```sh
node scripts/pritha-instance.mjs update --source local --expected-commit <full-40-character-sha> --plan --json
```

Local mode requires that exact commit on clean `main`; it performs no remote
lookup, fetch, merge or push. After separate immediate lifecycle approval:

```sh
node scripts/pritha-instance.mjs update --source local --expected-commit <same-full-sha> --apply --yes --json
```

Pass the intended instance's explicit root/state/agent-parent/id/role/port or
its verified environment. This does not authorize a fleet rollout. Use only
that instance's status and health checks when other instances are out of scope.
Default `--source origin` behavior remains available for existing remote-based
releases.

### Shared staged transaction

`scripts/pritha-instance.mjs update --apply --yes` performs one bounded
transaction after the separate lifecycle approval exists:

1. fetch and fast-forward only to the pinned commit, or verify pinned local main;
2. rebuild instance-local dependencies and memory and compare isolation
   fingerprints;
3. build `.next-pritha-staging` without touching the live `.next`;
4. verify type/build artifacts and the post-build Git invariant;
5. boot out only the manager-verified instance service;
6. atomically swap staged and live builds;
7. start the launchd service;
8. validate health-v2 identity, exact release commit/build ID, all six primary
   routes including `/codex`, and JavaScript chunks;
9. re-check Git and instance isolation;
10. remove the displaced build only after all checks pass.

If any check fails, boot out the current service, restore the displaced build
and previous private service state, restart that instance, verify rollback
health, and stop fleet progression. Instances later in the order remain
untouched.

Every manager response must explicitly report `ok: true`. A grace-period stop
timeout permits one delayed manager re-check; ownership/protocol failures do
not. If a rollback stop cannot be verified, retain both builds, record
`rollback-stop-failed` / `rollback_performed: false`, and stop. Never rename or
delete the potentially live build to force a rollback.

## Apply approval boundary

Generating code, tests, plans and status reports does not authorize launchd
mutation. Immediately before the first real service action, obtain explicit
operator approval. Only then may these commands be used:

```sh
node scripts/control-center-runtime.mjs install --yes
node scripts/control-center-runtime.mjs start --yes
node scripts/control-center-runtime.mjs stop --yes
node scripts/control-center-runtime.mjs restart --yes
node scripts/control-center-runtime.mjs uninstall --yes
```

Do not modify legacy `com.techscope.web` or Telegram jobs as part of this
workflow. Do not add cron, heartbeat, a network health watchdog, Funnel or
public exposure.

## First manager adoption

`install --yes` fails closed with `owner_mismatch` when the configured port is
already held by a process that has no valid manager state. It must not install
or load a competing launchd job.

For a one-time transition from an old terminal-launched Control Center, collect
read-only evidence for the exact listener PID, process group, Control Center
working directory, configured port and the checkout root reported by the old
`/api/status`. Stopping that exact verified legacy process group requires a
separate immediate operator approval. A port number by itself is never enough.
After it exits, confirm that the port is free, install the new instance service,
and continue the staged transaction. This migration exception does not become
a supported production lifecycle path.

## Release gates

Before apply and again after a successful instance/fleet release, require:

```text
typecheck
production build
unit tests
targeted Playwright desktop/mobile
privacy audit
strict Control Center health including /codex
self-test
fleet status
git diff --check
```

Peer access remains unverified until the updated private URL is opened from a
trusted Tailscale peer. Do not write that real URL or device identity into a
tracked report.
