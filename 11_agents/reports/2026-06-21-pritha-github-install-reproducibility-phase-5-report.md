---
id: 2026-06-21-pritha-github-install-reproducibility-phase-5-report
type: agent-operations-report
status: complete
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - github-install
  - tailscale
  - private-access
  - bootstrap
  - control-center
tools:
  - Node.js
  - npm
  - Next.js
  - Tailscale
  - Tailscale Serve
sources:
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  - docs/tailscale-private-access.md
  - scripts/tailscale-setup.mjs
  - scripts/bootstrap.mjs
  - https://tailscale.com/docs/install/mac
  - https://tailscale.com/docs/reference/tailscale-cli/serve
  - https://tailscale.com/docs/reference/tailscale-cli/up
  - https://tailscale.com/docs/features/access-control/auth-keys
related:
  workflows:
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
    - 07_workflows/first-run-setup.md
  reports:
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-4-report.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - governance
subject:
  kind: roadmap-phase
  id: pritha-github-install-reproducibility-phase-5
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Pritha GitHub Install Reproducibility - Phase 5 Report

Date: 2026-06-21
Roadmap phase: Phase 5 - Optional Tailscale Private Access Module
Status: complete

## Scope Completed

- Added `scripts/tailscale-setup.mjs` as an explicit, operator-gated Tailscale
  setup helper.
- Added read-only commands:
  - `plan`;
  - `status`;
  - `auth-status`.
- Added mutating commands that require `--yes`:
  - `install`;
  - `serve`;
  - `off`.
- Kept Tailscale optional and out of the default bootstrap path.
- Connected the `control-center-tailscale` bootstrap profile to read-only
  Tailscale readiness detection.
- Added a top-level `tailscale` section to setup-state schema for portable
  readiness reporting.
- Updated Control Center dev origins to use
  `PRITHA_CONTROL_CENTER_ALLOWED_DEV_ORIGINS` instead of a committed device
  hostname.
- Added `docs/tailscale-private-access.md` and linked it from public install
  documentation.
- Added `tests/tailscale-setup.test.mjs` for missing-client behavior,
  readiness fields, `--yes` gating, private Serve command construction and
  Next.js dev origin hygiene.
- Added a pre-push audit guard for real Tailscale device hostnames and legacy
  tailnet fragments.
- Scrubbed historical public Markdown references to real device URLs and
  prepared `.memory` for rebuild from the scrubbed authored artifacts.

## Source Verification

- Tailscale macOS install docs were checked on 2026-06-21. They recommend the
  Standalone variant for most users and document macOS Monterey 12+ support.
- Tailscale Serve CLI docs were checked on 2026-06-21. The Phase 5 command uses
  private Serve with `--bg`; Funnel is intentionally not used.
- Tailscale `up` docs were checked on 2026-06-21. Authentication remains a user
  action through the Tailscale app or `tailscale up`.
- Tailscale auth-key docs were checked on 2026-06-21. Default Pritha setup does
  not request auth keys because they authenticate devices into a tailnet and
  need a dedicated secret-handling profile.

## Commands Verified

```sh
node --test tests/tailscale-setup.test.mjs tests/bootstrap.test.mjs tests/setup-state.test.mjs
node scripts/tailscale-setup.mjs plan --app control-center --port 3420
node scripts/tailscale-setup.mjs status --json
npm --prefix interfaces/control-center run typecheck
node scripts/bootstrap.mjs verify --profile control-center-tailscale --json
```

## Result

- On the local operator machine, read-only Tailscale status reports:
  - installed: yes;
  - authenticated: yes;
  - private Serve configured for Control Center: yes;
  - local upstream health: ready;
  - peer access: not tested from a second device in this phase.
- The real Tailscale URL observed during verification is intentionally not
  recorded in this report or public docs.
- Bootstrap verification passes for `control-center-tailscale`.
- Control Center typecheck passes.
- Control Center build passes during bootstrap verification with the existing
  non-blocking Turbopack NFT tracing warning.

## Safety Notes

- No real `install --yes`, `serve --yes` or `off --yes` action was run against
  the operator machine during this phase.
- No auth keys were requested, stored or written.
- No Tailscale Funnel/public exposure was configured.
- No launchd, cron, heartbeat, durable service or publication action was
  performed.
- Peer-device access remains an explicit manual acceptance check for the user.
