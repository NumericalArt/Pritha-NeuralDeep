---
id: 2026-06-21-pritha-github-install-reproducibility-phase-3-report
type: agent-operations-report
status: complete
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - github-install
  - bootstrap
  - reproducibility
  - dependencies
  - control-center
tools:
  - Node.js
  - npm
  - Python
  - Next.js
  - GitHub Actions
sources:
  - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  - scripts/bootstrap.mjs
  - scripts/env-doctor.mjs
  - interfaces/control-center/package.json
  - interfaces/control-center/package-lock.json
related:
  workflows:
    - 07_workflows/2026-06-21-pritha-github-install-reproducibility-roadmap.md
  reports:
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-baseline-report.md
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-1-report.md
    - 11_agents/reports/2026-06-21-pritha-github-install-reproducibility-phase-2-report.md
supersedes: []
superseded_by: []
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - governance
subject:
  kind: roadmap-phase
  id: pritha-github-install-reproducibility-phase-3
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Pritha GitHub Install Reproducibility - Phase 3 Report

Date: 2026-06-21
Roadmap phase: Phase 3 - Deterministic Dependencies And Bootstrap
Status: complete

## Scope Completed

- Added `scripts/bootstrap.mjs` with `plan`, `install`, `verify` and `start`
  phases.
- Added bootstrap profiles: `minimal`, `local`, `control-center` and
  `control-center-tailscale`.
- Supported the target local command shape:

  ```sh
  node scripts/bootstrap.mjs --profile local --start control-center
  ```

- Kept bootstrap non-service by design: no launchd, cron, heartbeat, durable
  service, credential write or Tailscale host-networking change is performed.
- Pinned Control Center install-critical dependencies to exact versions already
  represented in `interfaces/control-center/package-lock.json`.
- Split Python dependencies:
  - `requirements-core.txt` for portable packages;
  - `requirements-macos.txt` for `mlx-whisper`;
  - `requirements.txt` as a compatibility wrapper.
- Updated `env-doctor` with `--profile` support and a mandatory `git` check.
- Updated Setup Wizard Smoke CI to run bootstrap plan/verify and install Control
  Center dependencies with `npm ci`.
- Added tests for bootstrap JSON output, start-target planning and minimal
  verification.

## Commands Verified

```sh
node --test tests/bootstrap.test.mjs tests/env-doctor.test.mjs
node scripts/bootstrap.mjs plan --profile minimal
node scripts/bootstrap.mjs verify --profile minimal --json
npm --prefix interfaces/control-center ci --ignore-scripts
npm --prefix interfaces/control-center run typecheck
npm --prefix interfaces/control-center run build
node scripts/env-doctor.mjs --profile control-center --json
node scripts/bootstrap.mjs verify --profile control-center --json
git diff --check
node scripts/quality-gate.mjs
node scripts/self-test.mjs
node scripts/pre-push-audit.mjs --strict
```

## Result

- Bootstrap minimal plan is machine-readable and non-mutating.
- Bootstrap minimal verify is read-only and passes with current prerequisites.
- Control Center installs from lockfile with `npm ci`.
- Control Center typecheck and build pass with the pinned dependency set.
- `env-doctor --profile control-center` passes with one non-blocking local
  warning: the current Python runtime is 3.9.x while 3.10+ remains the
  recommended baseline for new installs.
- Full quality gate, self-test and strict pre-push audit pass after the Phase 3
  changes.

## Non-Blocking Follow-Up

`next build` emits a Turbopack warning about broad NFT tracing through the
diagnostics route import path. The build succeeds. This is a Control Center
cleanup candidate, not an install blocker.

## Safety Notes

- The `control-center-tailscale` bootstrap profile only includes readiness
  detection. It does not install Tailscale, authenticate a device or configure
  Tailscale Serve.
- The bootstrap `start` phase runs the Control Center in the foreground through
  `npm --prefix interfaces/control-center run dev`.
- The initial Phase 5 Tailscale automation work remains separate and should keep
  explicit operator approval gates.
