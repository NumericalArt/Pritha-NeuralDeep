---
id: 2026-06-21-pritha-github-install-reproducibility-roadmap
type: workflow
status: active
created: 2026-06-21
updated: 2026-06-21
topics:
  - pritha
  - github-install
  - reproducibility
  - bootstrap
  - child-agents
  - tailscale
  - git
  - memory-research
  - release-safety
tools:
  - Node.js
  - Python
  - Git
  - GitHub Actions
  - Tailscale
  - Next.js
  - Codex
  - SQLite
agent_platforms:
  - Codex
model_context:
  - mixed
runtime_environment:
  - macOS
  - codex-desktop
  - codex-cli
  - local-project
  - github-actions
  - tailscale
config_surfaces:
  - README.md
  - docs
  - scripts
  - scripts/lib
  - interfaces/control-center
  - .github/workflows
  - requirements.txt
  - package.json
  - 04_standards
  - 07_workflows
  - 08_templates
  - 11_agents
portability: codex-native
sources:
  - 03_reviews/2026-06-21-pritha-full-project-audit.md
  - 04_standards/pritha-self-model.md
  - 04_standards/agent-creation-harness.md
  - 04_standards/memory-domains.md
  - 04_standards/tailscale-private-device-access-for-local-agents.md
  - 07_workflows/first-run-setup.md
  - 07_workflows/agents-mother.md
  - 07_workflows/agents-mother-roadmap.md
  - README.md
  - docs/getting-started.md
  - https://tailscale.com/docs/install/mac
  - https://tailscale.com/docs/reference/tailscale-cli/serve
  - https://tailscale.com/docs/reference/tailscale-cli/up
  - https://tailscale.com/docs/features/access-control/auth-keys
  - https://tailscale.com/docs/reference/glossary
  - https://git-scm.com/book/en/v2/Getting-Started-Installing-Git
related:
  reviews:
    - 03_reviews/2026-06-21-pritha-full-project-audit.md
  decisions:
    - 05_decisions/2026-05-28-pritha-public-snapshot-scrub.md
    - 05_decisions/2026-05-29-pritha-portable-memory-snapshot.md
    - 05_decisions/2026-06-02-pritha-memory-domain-model.md
  standards:
    - 04_standards/pritha-self-model.md
    - 04_standards/agent-creation-harness.md
    - 04_standards/memory-domains.md
    - 04_standards/tailscale-private-device-access-for-local-agents.md
    - 04_standards/agent-runtime-placement.md
    - 04_standards/agent-harness-evaluation.md
  workflows:
    - 07_workflows/first-run-setup.md
    - 07_workflows/agents-mother.md
    - 07_workflows/agents-mother-roadmap.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-06-21 audit; Tailscale docs validated 2025-12-04 to 2026-01-26; Git book current page
source_updated: 2026-06-21 audit; local Pritha standards updated through 2026-06-16
source_version: Pritha install reproducibility roadmap v1
retrieved: 2026-06-21
verified: 2026-06-21
valid_for: Pritha macOS-first GitHub install hardening after the 2026-06-21 project audit
temporal_status: current
memory_domain: pritha-self
memory_domains:
  - pritha-self
  - agent-building-knowledge
  - governance
subject:
  kind: roadmap
  id: pritha-github-install-reproducibility
privacy: public
retention: durable
review_status: accepted
confidence: high
---

# Roadmap / Technical Specification: Pritha GitHub Install Reproducibility

Date: 2026-06-21
Status: active
Owner: Pritha / user
Primary target: macOS + Codex + GitHub clone

## Executive Position

The 2026-06-21 audit does not call for a rewrite. The current implementation is
architecturally sound and has performed well in manual testing across devices.
This roadmap treats the existing design as the baseline and adds a safer,
repeatable product-install layer around it.

The target outcome is simple:

```sh
git clone https://github.com/NumericalArt/Pritha.git pritha
cd pritha
node scripts/bootstrap.mjs --profile local --start control-center
```

After that command, a new macOS user should have local non-secret config,
installed deterministic dependencies, a verified memory snapshot, a working
Control Center on localhost, and clear next steps for creating or improving a
child agent.

## Product Definition

Pritha is a universal, trainable agent for creating and evolving agents.

In product and application language, Pritha has two primary functions:

1. Improve its own knowledge base, tools and agent-creation capabilities through
   reviewed memory updates, standards, workflows, tests and harness changes.
2. Create new child agents and improve existing child agents through contracts,
   Pritha memory research, scaffold generation, git-based version control,
   tests, reports and handoff.

`Trainable` means curated, versioned, reviewable learning through Pritha memory
and repo-local harness artifacts. It does not mean unreviewed autonomous
self-modification, hidden skill installation, secret collection or background
service activation.

English is the main language for the project and application surface: README,
docs, CLI help, Control Center UI, generated child-agent instructions, generated
templates and public-facing reports. Existing historical Russian curated
artifacts can remain as memory evidence until a separate translation/scrub pass.

## Scope

In scope:

- macOS-first GitHub install and start flow.
- Safer default execution gates for Codex write tasks.
- Public snapshot scrub and release gate hardening.
- Deterministic dependency installation for Python and Control Center.
- Optional, operator-approved Tailscale installation/readiness/Serve setup.
- Mandatory git module for generated child agents.
- Mandatory Pritha memory research before child-agent architecture and
  technology decisions.
- English-first product and generated-agent surfaces.

Out of scope for this roadmap:

- Rewriting Pritha's core architecture.
- Turning setup into silent launchd/cron/background service installation.
- Enabling Tailscale Funnel or any public exposure by default.
- Storing Tailscale auth keys, API tokens or other credentials in tracked files.
- Making Linux and Windows equal first-class targets before the macOS install is
  reproducible.
- Splitting Pritha into publishable npm packages.

## Audit Triage

| Audit item | Disposition | Roadmap treatment |
| --- | --- | --- |
| S1 Codex write default mismatch | Required | Fix before installer release. Empty env must mean read-only. |
| S3 keyword-only approval gate | Required | Any workspace write task must require UI approval. Keyword detection is only an extra risk label. |
| S2 local absolute paths in public snapshot | Required | Scrub tracked Markdown and rebuild `.memory` before release gate passes. |
| S4 pre-push/gitleaks not in CI | Required | Add release-gate workflow or extend quality CI. |
| I1/I2 no one-command bootstrap | Required | Add explicit `bootstrap.mjs`; keep services opt-in. |
| I3 floating Control Center deps | Required | Pin versions and commit lockfile for reproducible installs. |
| C1 UI not available from fresh clone | Required | Bootstrap can install deps, build/check and start Control Center in foreground. |
| C2 machine-specific Tailscale dev origin | Required | Move to env/config; no committed tailnet hostnames. |
| Q1 duplicated root/env parsing | Required, after install path | Consolidate to shared libraries to prevent stale root behavior. |
| Q2 no linter/formatter | Nice-to-have | Add only after bootstrap is green; do not block v0.1 install. |
| Q3 Techscope/Pritha naming drift | Managed debt | Keep compatibility aliases; make new public surface English/Pritha-first. |
| Q4 stale mocks/missing runtime confusion | Low priority | Clean when touching Control Center/scaffold code. |
| X1/X2/X3 non-macOS issues | Deferred mostly | Put full Linux/Windows support last; split requirements if needed for clean docs/CI. |

## External Research Notes

- Tailscale's current macOS install docs recommend the Standalone client from
  Tailscale's package server, with App Store and open-source variants as
  alternatives. The same page says macOS Monterey 12.0 or later is required.
- Tailscale's glossary says the Tailscale CLI is installed with the client on
  Linux, macOS and Windows. The Pritha installer can therefore depend on
  `tailscale` only after the client is installed.
- `tailscale up` is the authentication/connect command. The docs note that flags
  are not persisted between runs, so Pritha must not silently rewrite a user's
  existing Tailscale state.
- `tailscale serve` shares a local service securely inside the tailnet. The docs
  also warn that Serve/Funnel CLI behavior changed in Tailscale 1.52, so command
  generation must be version/status checked.
- Tailscale auth keys are equivalent to logging a device into the tailnet.
  Reusable keys are explicitly risky if stolen. Default Pritha setup must not
  store or request auth keys. A future headless/server mode can use one-off keys
  only through explicit operator-provided secret files or environment variables.
- Git's official book documents macOS Git installation through Xcode Command
  Line Tools and Linux installation through package managers. Pritha should
  preflight `git --version` and give platform-specific installation hints.

## Safety Rules For Implementation

- One phase per branch/PR or per tightly scoped commit series.
- Baseline checks before a phase, verification after the phase.
- No hidden service install, launchd bootstrap, cron, heartbeat, deployment,
  publish, credential write or destructive migration.
- Any operation that changes host networking, starts a durable service or writes
  credentials requires explicit `--yes` plus a human-readable plan.
- Setup may create `.env.local` and `.techscope-setup.json`; both remain
  gitignored and non-secret except `.env.local` may contain local secrets.
- Tailscale Serve is private tailnet access only. Funnel is a separate public
  exposure decision and remains disabled.
- Generated child agents must not copy Pritha `.env`, `.memory`, `.queue`,
  `.logs`, `.private` or local machine state.
- Each phase must preserve current successful manual workflows unless the change
  explicitly replaces them and includes a rollback note.

## Target User Flows

### Minimal Local

```sh
node scripts/bootstrap.mjs --profile minimal
node scripts/pritha.mjs questions
node scripts/pritha.mjs test . --no-report
```

Expected behavior:

- Check Node, Python, sqlite3 and git.
- Install only required local dependencies for the chosen profile.
- Run setup in non-interactive or guided mode.
- Run a bounded verification suite.
- Do not start services.

### Control Center Local

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

Expected behavior:

- Install Control Center dependencies with lockfile-backed `npm ci`.
- Run `typecheck` and build or dev-smoke as appropriate.
- Start Control Center in the foreground on `127.0.0.1:3420`.
- Print the local URL and stop instructions.

### Optional Tailscale Private Access

```sh
node scripts/tailscale-setup.mjs plan --app control-center --port 3420
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs install --yes
node scripts/tailscale-setup.mjs serve --app control-center --port 3420 --yes
```

Expected behavior:

- `plan` and `status` are read-only.
- `install --yes` installs or guides installation only through the approved
  method for the host platform.
- Authentication remains a user action through the Tailscale app or
  `tailscale up`.
- `serve --yes` only configures private Tailscale Serve after local health and
  Tailscale authentication are ready.
- The script records non-secret status in setup state and prints the HTTPS
  tailnet URL. It does not enable Funnel.

## Phase 0 - Baseline And Acceptance

Goal: freeze the current known-good behavior before install changes.

Deliverables:

- This roadmap reviewed and accepted or amended.
- Baseline report in `11_agents/reports/` or `03_reviews/` recording current
  command results and known audit failures.
- Current audit linked as the source review.

Required checks:

```sh
node scripts/self-test.mjs
node scripts/quality-gate.mjs
node scripts/pre-push-audit.mjs --strict
npm --prefix interfaces/control-center run typecheck
```

Acceptance criteria:

- Known failures are classified, not ignored.
- No implementation phase starts until the baseline is recorded.

## Phase 1 - Execution Safety Fixes

Goal: make the install path safe before making it easier to run.

Deliverables:

- Control Center Codex write default changed to read-only when env is missing.
- UI approval required for every `write_mode=workspace_write` task.
- Risk keyword detection retained only as additional labeling.
- Tests for empty env, explicit read-only, explicit write-enabled, and
  workspace-write approval behavior.

Required checks:

```sh
node --test --test-concurrency=1 tests/**/*.test.mjs
npm --prefix interfaces/control-center run typecheck
node scripts/quality-gate.mjs
```

Acceptance criteria:

- A fresh clone without `.env.local` cannot write through Codex sidecar.
- A write task cannot execute until approved in UI.
- Existing read-only/research tasks still work.

## Phase 2 - Public Snapshot And Release Gates

Goal: make the GitHub snapshot safe to clone and release.

Deliverables:

- Scrub user-specific absolute paths from tracked Markdown where they are not
  intentional test fixtures.
- Replace machine-specific examples with `<PRITHA_ROOT>`, `<USER_HOME>`,
  `<CHILD_AGENT_ROOT>` or fixture constants.
- Rebuild `.memory` snapshot after scrub.
- Add `pre-push-audit --strict` to CI as a release gate, or extend CI to cover
  the same checks.
- Add gitleaks/trufflehog only if the added dependency is justified and kept
  low-friction.

Required checks:

```sh
node scripts/privacy-audit.mjs --strict
node scripts/pre-push-audit.mjs --strict
node scripts/rebuild-memory.mjs
node scripts/validate-memory.mjs
node scripts/query-memory.mjs stats
```

Acceptance criteria:

- Release gate fails on local absolute paths, forbidden tracked runtime state and
  obvious secret patterns.
- `.memory` contains the scrubbed public state.
- Existing decision `2026-05-28-pritha-public-snapshot-scrub` remains satisfied.

## Phase 3 - Deterministic Dependencies And Bootstrap

Goal: turn fresh clone setup into a repeatable command without adding hidden
services.

Deliverables:

- New `scripts/bootstrap.mjs` with `plan`, `install`, `verify`, `start` phases
  exposed through flags or subcommands.
- Bootstrap profiles: `minimal`, `local`, `control-center`, and
  `control-center-tailscale`.
- Control Center dependencies pinned to concrete versions.
- `interfaces/control-center/package-lock.json` committed.
- Python requirements split if needed:
  - `requirements-core.txt` for portable packages;
  - `requirements-macos.txt` for Apple/macOS transcription helpers;
  - root `requirements.txt` either includes both for macOS or becomes a
    documented compatibility wrapper.
- `env-doctor` updated to check git and profile-specific dependencies.
- No `latest` dependencies in install-critical package manifests.

Required checks:

```sh
node scripts/bootstrap.mjs plan --profile minimal
node scripts/bootstrap.mjs verify --profile minimal
npm --prefix interfaces/control-center ci --ignore-scripts
npm --prefix interfaces/control-center run typecheck
npm --prefix interfaces/control-center run build
node scripts/quality-gate.mjs
```

CI checks:

- `setup-wizard-smoke` extended to run bootstrap in a clean temp state.
- Control Center install uses `npm ci`, not floating install.

Acceptance criteria:

- A user does not need to discover separate `pip install` and `npm ci` commands
  from scattered docs.
- Bootstrap output is actionable and machine-readable in `--json` mode.
- Bootstrap never installs launchd, cron or durable services.

## Phase 4 - First-Run Documentation And English Product Surface

Goal: align README, docs, CLI help and app text with the real install flow.

Deliverables:

- README `10-Minute Start` replaced with bootstrap-based flow.
- `docs/getting-started.md`, `docs/prerequisites.md`, `docs/troubleshooting.md`
  and Control Center README synchronized.
- Product language updated to define Pritha as a universal trainable agent with
  the two primary functions listed in this roadmap.
- CLI help and generated child-agent README/AGENTS templates use English.
- Public-facing docs explain which features are ready after clone and which need
  optional credentials.

Required checks:

```sh
node scripts/pritha.mjs questions
node scripts/pritha.mjs test . --no-report
node scripts/quality-gate.mjs
rg -n "[А-Яа-яЁё]" README.md docs interfaces/control-center/src scripts/agents-mother || true
```

Acceptance criteria:

- English is the default user-facing language.
- Russian remains only in historical curated memory or deliberately internal
  artifacts, not in main app/setup paths.
- Docs no longer disagree about setup.

## Phase 5 - Tailscale Private Access Module

Goal: make private phone/laptop access easy while preserving operator control.

Deliverables:

- New `scripts/tailscale-setup.mjs` with:
  - `plan`;
  - `status`;
  - `install --yes`;
  - `auth-status`;
  - `serve --app <name> --port <port> --yes`;
  - `off --app <name> --yes`.
- Mockable Tailscale command runner for tests.
- Control Center setup state fields for Tailscale readiness:
  `installed`, `authenticated`, `serve_configured`, `tailscale_url`,
  `local_upstream_health`, `peer_access_not_tested`.
- `next.config.mjs` changed so dev origins come from env/config, not a committed
  personal tailnet hostname.
- Operator docs explain Tailscale Serve vs Funnel, private boundary, auth key
  risk and stop commands.

Implementation policy:

- Default bootstrap may detect Tailscale, but does not install or configure it.
- `install --yes` may automate only the verified host-platform install path.
  If full automation is not safe, it opens or prints the official install URL
  and records `pending-user-install`.
- Authentication is a user action through the Tailscale app or `tailscale up`.
- Auth keys are not requested by default. Headless auth-key mode is a future
  explicit server/deployment profile.

Required checks:

```sh
node --test --test-concurrency=1 tests/**/*.test.mjs
node scripts/tailscale-setup.mjs plan --app control-center --port 3420
node scripts/tailscale-setup.mjs status --json
node scripts/quality-gate.mjs
```

Manual verification when Tailscale is installed:

```sh
node scripts/tailscale-setup.mjs serve --app control-center --port 3420 --yes
tailscale serve status
```

Acceptance criteria:

- A user can get a private HTTPS Control Center URL with a short, guided flow.
- The flow is safe when Tailscale is absent, unauthenticated or already
  configured for another service.
- No Tailscale URL, tailnet name or auth key is committed.

## Phase 6 - Child-Agent Git Module

Goal: every generated child agent is version-controlled from the start.

Deliverables:

- `git` becomes a mandatory child-agent harness module.
- Contract template gains a `version_control_profile` section:
  `system: git`, `required: true`, `initialization: scaffold`, `commit_policy`,
  `remote_policy`, `private_state_exclusions`.
- Scaffold preflight fails before writing if `git` is missing.
- Generated child agents include:
  - `.gitignore` covering `.env*`, `.queue/`, `.memory-private/`, `.private/`,
    `.logs/`, local setup state and generated caches;
  - `scripts/git-status.mjs`;
  - README section for version control;
  - smoke-test check that the folder is a git repository.
- Scaffold initializes git in the child folder.
- Initial commit is attempted only when git identity is available; otherwise the
  scaffold report records `pending-git-identity` with exact next commands.
- `agent-test-report`, `scaffold-report`, handoff and operations reports record
  git state: branch, clean/dirty, last commit if present, ignored private state.

Required checks:

```sh
node scripts/pritha.mjs create tests/fixtures/accepted-agent-contract.md --output /tmp/pritha-git-fixture
node scripts/pritha.mjs test /tmp/pritha-git-fixture
git -C /tmp/pritha-git-fixture status --short
node --test --test-concurrency=1 tests/agents-mother-*.test.mjs
```

Acceptance criteria:

- No production child scaffold is considered ready unless it is a git repo with
  a private-state-safe `.gitignore`.
- Missing git is a hard preflight failure with install guidance.
- Existing child agents are not silently mutated; an upgrade command/report can
  be added for them.

## Phase 7 - Mandatory Pritha Memory Research Gate

Goal: architecture and technology choices for child agents must come from the
contract plus Pritha memory, not from unstated model guesses.

Deliverables:

- `pritha.mjs init/create` flow makes research explicit before architecture is
  finalized.
- Research command records domain-ordered retrieval:
  1. `agent-building-knowledge`;
  2. `pritha-self`;
  3. comparable `child-agents`;
  4. allowed `user-model` only when local-private policy permits.
- Research report includes:
  - exact local memory queries;
  - selected standards/workflows/decisions/reports;
  - alternatives considered;
  - architecture recommendation;
  - selected technologies and why;
  - volatile docs needing current verification;
  - open questions.
- Empty search results become visible warnings or failures, not silent blanks.
- Scaffold keeps the existing hard block on missing research for production
  scaffolds.
- `--allow-missing-research` remains only an explicit experimental override and
  is printed in reports as not production-ready.

Required checks:

```sh
node scripts/pritha.mjs research 11_agents/contracts/<accepted-contract>.md
node scripts/pritha.mjs create 11_agents/contracts/<accepted-contract>.md --output /tmp/pritha-research-fixture
node --test --test-concurrency=1 tests/agents-mother-*.test.mjs
node scripts/query-memory.mjs by-domain agent-building-knowledge
node scripts/query-memory.mjs by-domain pritha-self
```

Acceptance criteria:

- A child-agent contract cannot reach production scaffold readiness without a
  research report.
- The chosen architecture can be traced back to specific Pritha artifacts and,
  when needed, current primary documentation.

## Phase 8 - Root, Env And Install-Code Consolidation

Goal: reduce drift after the user-facing install path is in place.

Deliverables:

- All root resolution uses `scripts/lib/paths.mjs` or a documented TS mirror
  generated from the same behavior.
- Env parsing uses one shared Node implementation and one deliberate
  Control Center adapter.
- `TECHSCOPE_*` remains compatibility fallback; new docs prefer `PRITHA_*`.
- Dead mocks and stale runtime references are removed or clearly marked as test
  fixtures.
- `scripts/control-center-runtime.mjs` status is clarified: root-level script,
  generated child script, or intentionally absent.

Required checks:

```sh
node scripts/env-doctor.mjs --strict
node scripts/setup-status.mjs --json
node scripts/quality-gate.mjs
npm --prefix interfaces/control-center run typecheck
```

Acceptance criteria:

- Stale `TECHSCOPE_ROOT` behavior is consistent across setup, quality gate,
  self-test, queue health, Control Center and scaffold.
- Compatibility names work, but new public docs are Pritha-first.

## Phase 9 - Release Packaging

Goal: make GitHub feel trustworthy to a new user.

Deliverables:

- Repository description set.
- First version tag/release prepared after release gates pass.
- Release notes list supported target: macOS + Codex + local Control Center.
- `docs/release.md` updated with bootstrap and release-gate commands.
- Dependabot PRs either fixed or documented as blocked by upstream compatibility.

Required checks:

```sh
node scripts/github-release-status.mjs
node scripts/pre-push-audit.mjs --strict
node scripts/quality-gate.mjs
```

Acceptance criteria:

- Fresh GitHub visitor sees a coherent product, install path, support boundary
  and release version.
- No release is cut while safety gates are red.

## Phase 10 - Linux / Windows / Other OS Backlog

Goal: preserve a path to portability without slowing the macOS-first release.

Deferred work:

- Native Linux bootstrap profile after macOS flow is stable.
- Windows native support only after replacing POSIX assumptions; WSL can be the
  interim recommendation.
- Replace `sh -lc command -v`, `ln -sf`, executable-bit assumptions and
  `process.env.HOME` usage where portability matters.
- Define Linux transcription alternative to `mlx-whisper`.
- Add OS-specific CI only after dependency and script boundaries are clear.

Acceptance criteria for starting this phase:

- macOS fresh clone bootstrap is green.
- Child-agent git and memory-research gates are green.
- Tailscale optional private access is documented and safe.

## Test Matrix

| Surface | Required verification |
| --- | --- |
| Core memory | `validate-memory`, `rebuild-memory`, `query-memory stats` |
| Core scripts | `node --test --test-concurrency=1 tests/**/*.test.mjs` |
| Setup/bootstrap | clean temp state, `plan`, `verify`, JSON output |
| Control Center | `npm ci`, `typecheck`, `build`, targeted unit/e2e where touched |
| Release safety | `privacy-audit --strict`, `pre-push-audit --strict`, optional secret scanner |
| Tailscale | mocked command runner in CI; manual authenticated Serve check |
| Child agents | accepted contract fixture, missing-research failure, git init, smoke test |
| Docs | README/getting-started/prerequisites/troubleshooting consistency |

## Definition Of Done

- A fresh macOS GitHub clone can install, verify and start Pritha through one
  documented bootstrap command.
- Default execution is safe: no Codex workspace write without explicit operator
  enablement and approval.
- CI blocks releases with public-snapshot leaks or release-gate failures.
- Optional Tailscale setup is guided, private, status-driven and never public by
  default.
- Every new child agent has git as a mandatory harness module.
- Every production child-agent scaffold is preceded by Pritha memory research
  and, where needed, current primary documentation verification.
- User-facing project and app language is English.
- Linux/Windows work is tracked at the end, not mixed into the macOS-first
  release path.

## Open Decisions

- Whether `bootstrap.mjs --start control-center` should run `next dev` or build
  then `next start` by default. Proposed default: dev server for local fresh
  clone; production start only with explicit profile.
- Whether the child-agent scaffold should require an initial commit or only an
  initialized git repository. Proposed default: git repo required; initial
  commit attempted when identity exists; otherwise `pending-git-identity`.
- Whether automated Tailscale macOS installation should use only the official
  package-server path or may use Homebrew when Homebrew is already installed.
  Proposed default: official package/download guidance first; Homebrew only as
  an explicit fallback after source review.
