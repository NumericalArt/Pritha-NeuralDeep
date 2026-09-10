---
id: 2026-05-28-techscope-quality-and-release-pattern-review
type: review
status: accepted
created: 2026-05-28
updated: 2026-05-28
topics: [techscope, pritha, agents-mother, scaffold-patterns, quality, release]
tools: [Codex, Pritha, Node.js, SQLite, GitHub Actions]
agent_platforms: [Codex]
model_context: [GPT-5 Codex]
runtime_environment: [desktop-app, cli, local-mac]
config_surfaces: [AGENTS.md, scripts, workflows, reports, registry]
portability: codex-native
sources:
  - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
  - 07_workflows/techscope-quality-audit-log.md
  - 11_agents/reports/2026-05-28-techscope-pre-phase-0-reconciliation-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-0-baseline-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-1-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-2-operations-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-3-shared-lib-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-4-dogfooding-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-5-test-layer-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-6-env-doctor-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-7-quality-gate-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-8-self-test-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-9a-agents-mother-entry-contract-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-9b-agents-mother-test-module-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-9c-agents-mother-scaffold-module-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-9d-agents-mother-command-modules-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-10-pritha-rebrand-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-11-oss-doc-pack-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-12-first-run-setup-report.md
  - 11_agents/reports/2026-05-28-techscope-quality-phase-13-github-ci-release-prep-report.md
related:
  workflows:
    - 07_workflows/2026-05-28-techscope-quality-and-release-roadmap.md
    - 07_workflows/techscope-quality-audit-log.md
  reports:
    - 11_agents/reports/2026-05-28-techscope-quality-phase-12-first-run-setup-report.md
    - 11_agents/reports/2026-05-28-techscope-quality-phase-13-github-ci-release-prep-report.md
supersedes: []
superseded_by: []
freshness_status: current
source_published: 2026-05-28
source_updated: 2026-05-28
source_version: roadmap-phases-0-through-13
retrieved: 2026-05-28
verified: 2026-05-28
valid_for: Pritha scaffold evolution after Techscope quality and release roadmap phases 0-13
temporal_status: current
---

# Review: Techscope Quality And Release Pattern Harvest

Date: 2026-05-28
Status: accepted

## Question

Which AM-CANDIDATE patterns from the Techscope quality and release roadmap should become selectable Pritha scaffold modules, which should remain documentation, and which need more evidence before promotion?

## Recommendation Summary

Promote only patterns that reduce real repeated failure modes in child agents without adding hidden background behavior, secret leakage risk or heavy dependencies. Promotion means "available for contract-driven composition", not "copied into every future agent". Each descendant should receive only the harness, memory, data, skills, MCP, tool, interface, eval and operations modules selected by its contract.

The strongest selectable scaffold candidates are:

- quality and health: `smoke-test-template`, `status-mjs-family`, `env-doctor-mjs`, `quality-gate-mjs`, `self-test-mjs`, `queue-health-mjs`;
- project portability: `PROJECT_ROOT-env`, `path-portability-check`, `minimal-package-json`, `scripts-lib-package`;
- agent lifecycle: `contract-validation-module`, `inspection-module`, `lifecycle-command-modules`, `scaffold-snapshot-tests`;
- handoff and release hygiene: `prerequisites-md`, `getting-started-10-min`, `secure-handoff-folder`, `local-path-scrub`;
- setup: conditional `first-run-setup-workflow` for agents with secrets, external APIs, multiple connectors or non-obvious environment requirements.

Do not automatically promote any pattern that installs hooks, starts services, creates scheduled background jobs or publishes to GitHub. Those remain opt-in through an explicit contract/deployment decision.

## Candidate Table

| Phase | Pattern | Evidence | Recommendation | Reason |
| --- | --- | --- | --- | --- |
| Preflight | `canonical-root-reconciliation` | Fixed split-root confusion before roadmap execution | document-only | Useful migration playbook, not a normal scaffold module. |
| Preflight | `archive-source-only-folder` | Preserved old root as source-only archive | document-only | One-time migration pattern. |
| Preflight | `pre-phase-readiness-report` | Made phase entry state auditable | adopt-in-scaffold | Use for substantial agent creation/evolution runs. |
| 0 | `audit-baseline-report` | Captured baseline before changes | adopt-in-scaffold | Prevents invisible drift in future agents. |
| 0 | `golden-checks-manifest` | Reproducible quality gate for roadmap | adopt-in-scaffold | Strong fit for nontrivial agents. |
| 0 | `audit-log-append-only` | Gave phase-by-phase traceability | document-only | Valuable for long programs, too heavy for tiny agents. |
| 0 | `non-mutating-self-inspection` | Enabled checks without memory/report churn | adopt-in-scaffold | Critical for reliable CI and local health checks. |
| 1 | `TECHSCOPE_ROOT-env` | Solved root portability | adopt-in-scaffold | Generalize as `PROJECT_ROOT` or agent-specific root env. |
| 1 | `path-portability-check` | Caught local path coupling | adopt-in-scaffold | Required before release or handoff. |
| 1 | `home-aware-launchd-template` | Avoided hard-coded Mac paths | document-only | Only applies if launchd is selected in contract. |
| 1 | `portable-tool-discovery` | Reduced machine-specific assumptions | adopt-in-scaffold | Useful for every agent with CLI dependencies. |
| 2 | `incident-as-operations-report` | Captured network/log incident as ops evidence | adopt-in-scaffold | Good post-incident discipline for live agents. |
| 2 | `external-fetch-backoff` | Reduced repeated Telegram fetch noise | adopt-in-scaffold | Required for polling and external APIs. |
| 2 | `repo-cruft-cleanup` | Removed accidental local clutter | document-only | Hygiene checklist, not scaffold behavior. |
| 2 | `non-fatal-startup-network-warning` | Kept startup usable during transient network failure | adopt-in-scaffold | Good default for optional external services. |
| 3 | `scripts-lib-package` | Shared root/env/frontmatter helpers | adopt-in-scaffold | Baseline for maintainable child-agent scripts. |
| 3 | `shared-frontmatter-parser` | Replaced duplicate parsing | adopt-in-scaffold | Required for Markdown-first memory agents. |
| 3 | `shared-env-loader` | Standardized `.env.local` loading | adopt-in-scaffold | Useful if child agent has secrets or env config. |
| 3 | `legacy-compatible-slug-options` | Preserved old filename behavior | document-only | Migration-specific. |
| 4 | `smoke-test-template` | Added quick local health check | adopt-in-scaffold | Every working agent needs one. |
| 4 | `status-mjs-family` | Provided readable status scripts | adopt-in-scaffold | Good operator interface. |
| 4 | `self-inspection-manifest` | Made harness detection explicit | adopt-in-scaffold | Helps Pritha test existing folders. |
| 4 | `minimal-package-json` | Standardized Node commands | adopt-in-scaffold | Low-cost scaffold baseline. |
| 4 | `buffered-derived-index-rebuild` | Reduced partial index failure risk | adopt-in-scaffold | Use when generated indexes exist. |
| 5 | `node-test-harness` | Added built-in unit tests | adopt-in-scaffold | Low dependency, high leverage. |
| 5 | `frontmatter-fixtures` | Protected Markdown contracts | adopt-in-scaffold | Required for Markdown-first memory. |
| 5 | `scaffold-snapshot-tests` | Protected generated scaffold outputs | adopt-in-scaffold | Strong fit for Pritha itself and generators. |
| 5 | `golden-checks-dry-run-contract` | Made quality gates inspectable | adopt-in-scaffold | Useful for CI and debugging. |
| 6 | `prerequisites-md` | Made setup requirements explicit | adopt-in-scaffold | Required for handoff. |
| 6 | `env-doctor-mjs` | Found missing local dependencies safely | adopt-in-scaffold | Strong default for real agents. |
| 6 | `python-requirements-pinned` | Stabilized Python dependencies | adopt-in-scaffold | Only when Python is used. |
| 6 | `non-blocking-env-warning` | Avoided hard failure for optional tools | adopt-in-scaffold | Good default for optional capabilities. |
| 7 | `quality-gate-mjs` | Unified validation, tests and dry-runs | adopt-in-scaffold | Main readiness contract. |
| 7 | `audit-report-generator` | Structured phase reports | document-only | Useful for roadmap execution, not every child agent. |
| 7 | `phase-report-template` | Standardized phase evidence | document-only | Use in Pritha operations docs. |
| 7 | `optional-githooks-precommit` | Documented optional local guard | document-only | Never auto-install hooks. |
| 8 | `self-test-mjs` | Manual health snapshot | adopt-in-scaffold | Useful for operators. |
| 8 | `queue-health-mjs` | Exposed stale queue items | adopt-in-scaffold | Only if queue/event inbox exists. |
| 8 | `scheduled-health-pulse` | Designed but not installed | needs-experiment | Background proactivity needs explicit contract evidence. |
| 8 | `proactive-self-test-contract` | Defined non-default proactive health checks | needs-experiment | Promote only after more live agents use it. |
| 9a | `multi-module-cli` | Shrunk large entrypoint | adopt-in-scaffold | Good for maintainable agents. |
| 9a | `contract-validation-module` | Made contracts testable | adopt-in-scaffold | Core Pritha behavior. |
| 9b | `inspection-module` | Detected existing harnesses | adopt-in-scaffold | Required for existing-project adoption. |
| 9b | `no-report-test-mode` | Prevented test/report pollution | adopt-in-scaffold | Critical for non-mutating checks. |
| 9b | `shared-project-command-runner` | Standardized command execution | adopt-in-scaffold | Use for status/quality scripts. |
| 9c | `snapshot-guarded-scaffold-extraction` | Protected scaffold refactor | adopt-in-scaffold | Strong for Pritha internals. |
| 9c | `scaffold-module-boundary` | Isolated generated files | adopt-in-scaffold | Core generator architecture. |
| 9c | `direct-generator-export-test` | Tested generator without CLI side effects | adopt-in-scaffold | Good default for generator modules. |
| 9d | `isolated-root-command-module-test` | Avoided polluting real memory in tests | adopt-in-scaffold | Required for safe CLI tests. |
| 9d | `lifecycle-command-modules` | Extracted handoff/ops/deploy/evolve | adopt-in-scaffold | Core lifecycle architecture. |
| 9d | `legacy-entrypoint-thin-tail` | Kept compatibility during refactor | document-only | Migration technique, not default scaffold. |
| 10 | `cli-rename-with-alias` | Rebranded Agents Mother to Pritha safely | document-only | Useful for future renames only. |
| 10 | `brand-layer-separation` | Kept local codename separate from public surface | adopt-in-scaffold | Useful when agent has private/public naming. |
| 10 | `lineage-vocabulary` | Clarified agent ancestry concepts | adopt-in-scaffold | Helps registry and handoff clarity. |
| 11 | `oss-doc-pack` | Added public-ready documentation | adopt-in-scaffold | For publishable agents. |
| 11 | `english-first-readme` | Improved external usability | document-only | Project-dependent language choice. |
| 11 | `getting-started-10-min` | Reduced onboarding friction | adopt-in-scaffold | Strong handoff pattern. |
| 12 | `first-run-setup-workflow` | Created local setup wizard and status | adopt-in-scaffold | Conditional default for agents with secrets/connectors. |
| 12 | `trigger-phrase-routing` | Documented conversational operational triggers | document-only | Helpful docs, but runtime-specific. |
| 12 | `completed-with-warnings-status` | Avoided false failure for optional gaps | adopt-in-scaffold | Good setup/result state model. |
| 12 | `secrets-collector-pattern` | Wrote private config without committing secrets | adopt-in-scaffold | Required for secret-bearing agents. |
| 12 | `minimal-default-config` | Allowed setup to complete with safe defaults | adopt-in-scaffold | Good first-run UX. |
| 13 | `github-quality-workflow` | Added CI quality gate | document-only | Adopt only for GitHub-published projects. |
| 13 | `markdown-validate-workflow` | Added memory validation CI | document-only | Adopt for Markdown-memory agents on GitHub. |
| 13 | `setup-wizard-ci-smoke` | Added CI smoke for setup state | document-only | Useful when setup wizard is present. |
| 13 | `secure-handoff-folder` | Kept private handoff outside repo | adopt-in-scaffold | Strong safety pattern. |
| 13 | `local-path-scrub` | Removed machine/user leakage from public snapshot | adopt-in-scaffold | Required before release/publish. |

## First-Run Setup As Selectable Scaffold Module?

Recommendation: adopt as a selectable module and enable conditionally, not universally.

Every Pritha descendant scaffold should declare whether it has a first-run setup surface. Agents with any of the following should receive a real setup module by contract default: secrets, external APIs, Telegram/email/browser connectors, Realtime voice, local model dependencies, launchd/service deployment, or non-obvious memory/index requirements.

Tiny agents with no secrets and no external dependencies can receive only `setup/manifest.schema.json`, `.env.example`, and `scripts/setup-status.mjs`, without an interactive setup wizard.

The wizard must stay local-first and safe:

- writes private values only to ignored local files;
- never copies parent-agent secrets into child agents;
- reports `complete`, `incomplete` or `completed_with_warnings`;
- has a non-mutating status command;
- does not install services, hooks or remote integrations.

## Patterns Not Promoted Automatically

- Background automation: `scheduled-health-pulse`, `proactive-self-test-contract`.
- GitHub publication: `github-quality-workflow`, `markdown-validate-workflow`, `setup-wizard-ci-smoke`.
- Local hooks: `optional-githooks-precommit`.
- Launchd/service templates: `home-aware-launchd-template`.

These remain opt-in because they change the operational envelope of a child agent.

## Expert Notes

### Architecture

Pritha should evolve toward a small default harness plus optional modules selected by contract: memory, interfaces, operations, release and setup. The highest-value default is not more intelligence; it is a deterministic harness that makes status, tests, setup, handoff and release explicit.

### Security

The strongest safety patterns are `secrets-collector-pattern`, `secure-handoff-folder`, `local-path-scrub`, `path-portability-check` and `non-mutating-self-inspection`. They should be promoted before more powerful proactive features.

### Developer Experience

The best DX wins were small scripts with clear names: `status`, `smoke`, `env-doctor`, `quality-gate`, `setup-status`, `queue-health`. Future agents should expose the same vocabulary so the user does not relearn operations per agent.

### Product Pragmatist

Adopt patterns that prevent repeated support/debug loops. Defer patterns that mainly feel elegant but add maintenance burden, especially background jobs and release automation before the child agent has real external users.

### Research Scout

This review is based on internal roadmap evidence, not external technology claims. No new web verification was needed because the task is promotion of locally observed patterns, not assessment of changing third-party APIs.

## Promotion Path

No standards or scaffold templates are changed by this review alone. Next actions:

1. Create explicit decisions for each promoted scaffold group before changing Pritha's selectable module catalog.
2. Implement scaffold modules in small slices: health/status first, setup second, release hygiene third.
3. Keep background proactivity and deployment automation behind explicit `agent-contract` fields.
4. Re-run `pritha evolve .` after this review to capture the roadmap as a lifecycle lesson.
